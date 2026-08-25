package presenter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/genai"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const geminiTextModel = "gemini-2.0-flash"

// chunkPriority ports rankChunks' fixed source-type priority table from
// presentation-ai.ts exactly — the "embeddings" here are plain text
// chunks scored by keyword overlap, not vector similarity (legacy never
// actually computes real embeddings either; embedding_reference is
// always "").
var chunkPriority = map[string]int{
	"ppt": 50, "knowledge": 48, "notes": 40, "pdf": 30, "docx": 20, "txt": 10, "org_kb": 5,
}

// indexPresentationContent rebuilds the deck's Q&A chunk index — one
// chunk per slide (title+texts+notes+script) plus one per non-pptx
// supporting file (real text for .txt up to 12000 chars, a placeholder
// label for pdf/docx — legacy never extracts real text from those
// either). Existing "knowledge" chunks are preserved (only source_type !=
// "knowledge" rows are wiped), matching indexPresentationContent /
// processPresentation's slide-regeneration delete in presentation-pipeline.ts.
func (m *Module) indexPresentationContent(ctx context.Context, presentationID string, slides []store.PresentationSlide, files []store.PresentationFile) error {
	if err := m.store.DeleteNonKnowledgeEmbeddings(ctx, presentationID); err != nil {
		return err
	}

	for _, s := range slides {
		var content slideContent
		_ = json.Unmarshal([]byte(s.ContentJson), &content)
		parts := []string{s.Title}
		parts = append(parts, content.Texts...)
		if s.Notes != "" {
			parts = append(parts, s.Notes)
		}
		if s.Script != "" {
			parts = append(parts, s.Script)
		}
		chunk := strings.Join(nonEmpty(parts), "\n")
		if chunk == "" {
			continue
		}
		if _, err := m.store.CreatePresentationEmbedding(ctx, store.CreatePresentationEmbeddingParams{
			ID: uuid.NewString(), PresentationID: presentationID, SourceType: "ppt",
			SourceID: pgtype.Text{String: s.ID, Valid: true}, ChunkText: chunk,
		}); err != nil {
			return err
		}
	}

	for _, f := range files {
		if f.FileType == "pptx" || f.FileType == "ppt" {
			continue
		}
		var chunk string
		if f.FileType == "txt" {
			data, err := m.deps.Storage.Download(ctx, f.StoragePath)
			if err != nil {
				continue // matches legacy: indexing errors are logged/skipped, never fatal
			}
			text := string(data)
			if len(text) > 12000 {
				text = text[:12000]
			}
			chunk = text
		} else {
			chunk = fmt.Sprintf("[%s file: %s]", strings.ToUpper(f.FileType), f.FileName)
		}
		if _, err := m.store.CreatePresentationEmbedding(ctx, store.CreatePresentationEmbeddingParams{
			ID: uuid.NewString(), PresentationID: presentationID, SourceType: f.FileType,
			SourceID: pgtype.Text{String: f.ID, Valid: true}, ChunkText: chunk,
		}); err != nil {
			return err
		}
	}

	return nil
}

func nonEmpty(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			out = append(out, p)
		}
	}
	return out
}

type rankedChunk struct {
	embedding store.PresentationEmbedding
	score     int
}

// rankChunks is a verbatim port of the keyword-overlap scorer in
// presentation-ai.ts's rankChunks — priority weight per source type, +3
// per matched question term (terms >2 chars) found as a substring.
func rankChunks(embeddings []store.PresentationEmbedding, question string) []rankedChunk {
	terms := extractTerms(question)

	ranked := make([]rankedChunk, 0, len(embeddings))
	for _, e := range embeddings {
		score := chunkPriority[e.SourceType]
		lower := strings.ToLower(e.ChunkText)
		for _, term := range terms {
			if strings.Contains(lower, term) {
				score += 3
			}
		}
		ranked = append(ranked, rankedChunk{embedding: e, score: score})
	}

	sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })
	return ranked
}

func extractTerms(question string) []string {
	fields := strings.FieldsFunc(strings.ToLower(question), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	terms := make([]string, 0, len(fields))
	for _, f := range fields {
		if len(f) > 2 {
			terms = append(terms, f)
		}
	}
	return terms
}

// answerPresentationQuestion ports answerPresentationQuestion from
// presentation-ai.ts: rank chunks, take top 8, build a context block, ask
// Gemini a plain (non-Live) generateContent call for a concise spoken
// answer. Falls back gracefully — never errors the caller — exactly like
// legacy: no client/no chunks -> canned message; chunks but LLM failure
// -> top chunk excerpt.
func (m *Module) answerPresentationQuestion(ctx context.Context, language, question string, embeddings []store.PresentationEmbedding) (string, []source) {
	ranked := rankChunks(embeddings, question)
	top := ranked
	if len(top) > 8 {
		top = top[:8]
	}

	sources := make([]source, 0, len(top))
	var contextLines []string
	for i, rc := range top {
		excerpt := rc.embedding.ChunkText
		if len(excerpt) > 240 {
			excerpt = excerpt[:240]
		}
		sourceID := ""
		if rc.embedding.SourceID.Valid {
			sourceID = rc.embedding.SourceID.String
		}
		sources = append(sources, source{SourceType: rc.embedding.SourceType, SourceID: sourceID, Excerpt: excerpt})
		contextLines = append(contextLines, fmt.Sprintf("%d. %s", i+1, rc.embedding.ChunkText))
	}

	if len(top) == 0 {
		return outsideMaterialMessage(language), sources
	}

	if m.genai == nil {
		excerpt := top[0].embedding.ChunkText
		if len(excerpt) > 400 {
			excerpt = excerpt[:400]
		}
		return excerpt, sources
	}

	prompt := fmt.Sprintf(
		"Answer the audience question using ONLY the context. If unknown, say you don't know from the material.\nLanguage: %s\nQuestion: %s\n\nContext (priority: ppt slides, presentation knowledge, notes, supporting docs):\n%s\n\nReturn a concise spoken answer (2-5 sentences).",
		language, question, strings.Join(contextLines, "\n"),
	)

	resp, err := m.genai.Models.GenerateContent(ctx, geminiTextModel,
		[]*genai.Content{genai.NewContentFromText(prompt, genai.RoleUser)}, nil)
	if err != nil || resp.Text() == "" {
		excerpt := top[0].embedding.ChunkText
		if len(excerpt) > 400 {
			excerpt = excerpt[:400]
		}
		return excerpt, sources
	}

	return strings.TrimSpace(resp.Text()), sources
}

func outsideMaterialMessage(language string) string {
	if language == "id" {
		return "Maaf, pertanyaan itu berada di luar materi presentasi ini."
	}
	return "Sorry, that question is outside this presentation's material."
}
