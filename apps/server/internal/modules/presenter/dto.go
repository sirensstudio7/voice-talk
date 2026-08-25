package presenter

import (
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func nullableTime(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

func textArg(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func int4Arg(i *int32) pgtype.Int4 {
	if i == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *i, Valid: true}
}

func pgTextValid(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

type presentationOut struct {
	ID                string  `json:"id"`
	BusinessID        string  `json:"business_id"`
	CreatedBy         *string `json:"created_by"`
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Language          string  `json:"language"`
	Category          string  `json:"category"`
	Status            string  `json:"status"`
	ProcessingStep    string  `json:"processing_step"`
	ProcessingError   string  `json:"processing_error"`
	TotalSlides       int32   `json:"total_slides"`
	EstimatedDuration int32   `json:"estimated_duration"`
	GreetingScript    string  `json:"greeting_script"`
	ClosingScript     string  `json:"closing_script"`
	ThumbnailURL      string  `json:"thumbnail_url"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

func toPresentationOut(p store.Presentation) presentationOut {
	var createdBy *string
	if p.CreatedBy.Valid {
		createdBy = &p.CreatedBy.String
	}
	return presentationOut{
		ID:                p.ID,
		BusinessID:        p.BusinessID,
		CreatedBy:         createdBy,
		Title:             p.Title,
		Description:       p.Description,
		Language:          p.Language,
		Category:          p.Category,
		Status:            p.Status,
		ProcessingStep:    p.ProcessingStep,
		ProcessingError:   p.ProcessingError,
		TotalSlides:       p.TotalSlides,
		EstimatedDuration: p.EstimatedDuration,
		GreetingScript:    p.GreetingScript,
		ClosingScript:     p.ClosingScript,
		ThumbnailURL:      p.ThumbnailUrl,
		CreatedAt:         p.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:         p.UpdatedAt.Time.Format(time.RFC3339),
	}
}

type createPresentationRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Language    string `json:"language"`
	Category    string `json:"category"`
}

type updatePresentationRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Language    *string `json:"language"`
	Category    *string `json:"category"`
}

type fileOut struct {
	ID          string `json:"id"`
	FileName    string `json:"file_name"`
	FileType    string `json:"file_type"`
	SizeBytes   int32  `json:"size_bytes"`
	StoragePath string `json:"storage_path"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

func toFileOut(f store.PresentationFile) fileOut {
	return fileOut{
		ID:          f.ID,
		FileName:    f.FileName,
		FileType:    f.FileType,
		SizeBytes:   f.SizeBytes,
		StoragePath: f.StoragePath,
		Status:      f.Status,
		CreatedAt:   f.CreatedAt.Time.Format(time.RFC3339),
	}
}

type knowledgeOut struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	SortOrder int32  `json:"sort_order"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func toKnowledgeOut(k store.PresentationKnowledgeEntry) knowledgeOut {
	return knowledgeOut{
		ID:        k.ID,
		Title:     k.Title,
		Content:   k.Content,
		SortOrder: k.SortOrder,
		CreatedAt: k.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt: k.UpdatedAt.Time.Format(time.RFC3339),
	}
}

type createKnowledgeRequest struct {
	Title     string `json:"title"`
	Content   string `json:"content"`
	SortOrder int32  `json:"sort_order"`
}

type updateKnowledgeRequest struct {
	Title     *string `json:"title"`
	Content   *string `json:"content"`
	SortOrder *int32  `json:"sort_order"`
}

type slideOut struct {
	ID              string       `json:"id"`
	SlideNumber     int32        `json:"slide_number"`
	Title           string       `json:"title"`
	Content         slideContent `json:"content"`
	Notes           string       `json:"notes"`
	Script          string       `json:"script"`
	ImageURL        string       `json:"image_url"`
	DurationSeconds int32        `json:"duration_seconds"`
}

type slideContent struct {
	Texts []string `json:"texts"`
}

func toSlideOut(s store.PresentationSlide) slideOut {
	content := slideContent{}
	_ = json.Unmarshal([]byte(s.ContentJson), &content)
	return slideOut{
		ID:              s.ID,
		SlideNumber:     s.SlideNumber,
		Title:           s.Title,
		Content:         content,
		Notes:           s.Notes,
		Script:          s.Script,
		ImageURL:        s.ImageUrl,
		DurationSeconds: s.DurationSeconds,
	}
}

type presentationDetailOut struct {
	presentationOut
	Files     []fileOut      `json:"files"`
	Slides    []slideOut     `json:"slides"`
	Knowledge []knowledgeOut `json:"knowledge"`
	PptxURL   *string        `json:"pptx_url"`
}

type sessionOut struct {
	ID                 string  `json:"id"`
	PresentationID     string  `json:"presentation_id"`
	BusinessID         string  `json:"business_id"`
	Name               string  `json:"name"`
	Status             string  `json:"status"`
	CurrentSlideNumber int32   `json:"current_slide_number"`
	EnableQna          bool    `json:"enable_qna"`
	AutoStart          bool    `json:"auto_start"`
	AudienceCount      int32   `json:"audience_count"`
	QuestionCount      int32   `json:"question_count"`
	StartedAt          *string `json:"started_at"`
	EndedAt            *string `json:"ended_at"`
	CreatedAt          string  `json:"created_at"`
	UpdatedAt          string  `json:"updated_at"`
}

func toSessionOut(s store.PresentationSession) sessionOut {
	return sessionOut{
		ID:                 s.ID,
		PresentationID:     s.PresentationID,
		BusinessID:         s.BusinessID,
		Name:               s.Name,
		Status:             s.Status,
		CurrentSlideNumber: s.CurrentSlideNumber,
		EnableQna:          s.EnableQna,
		AutoStart:          s.AutoStart,
		AudienceCount:      s.AudienceCount,
		QuestionCount:      s.QuestionCount,
		StartedAt:          nullableTime(s.StartedAt),
		EndedAt:            nullableTime(s.EndedAt),
		CreatedAt:          s.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:          s.UpdatedAt.Time.Format(time.RFC3339),
	}
}

type createSessionRequest struct {
	Name      string `json:"name"`
	EnableQna *bool  `json:"enable_qna"`
	AutoStart *bool  `json:"auto_start"`
}

type controlSessionRequest struct {
	Action string `json:"action"`
}

type audienceCountRequest struct {
	AudienceCount int32 `json:"audience_count"`
}

type questionOut struct {
	ID               string   `json:"id"`
	Question         string   `json:"question"`
	Answer           string   `json:"answer"`
	Status           string   `json:"status"`
	ModerationResult any      `json:"moderation_result"`
	SourceReferences []source `json:"source_references"`
	CreatedAt        string   `json:"created_at"`
	AnsweredAt       *string  `json:"answered_at"`
}

func toQuestionOut(q store.PresentationQuestion) questionOut {
	var moderation any
	_ = json.Unmarshal([]byte(q.ModerationResult), &moderation)
	var sources []source
	_ = json.Unmarshal([]byte(q.SourceReferences), &sources)
	return questionOut{
		ID:               q.ID,
		Question:         q.Question,
		Answer:           q.Answer,
		Status:           q.Status,
		ModerationResult: moderation,
		SourceReferences: sources,
		CreatedAt:        q.CreatedAt.Time.Format(time.RFC3339),
		AnsweredAt:       nullableTime(q.AnsweredAt),
	}
}

type submitQuestionRequest struct {
	Question string `json:"question"`
}

// source mirrors answerPresentationQuestion's per-chunk citation shape in
// presentation-ai.ts — persisted as presentation_questions.source_references.
type source struct {
	SourceType string `json:"source_type"`
	SourceID   string `json:"source_id"`
	Excerpt    string `json:"excerpt"`
}

type sessionDetailOut struct {
	Session      sessionOut      `json:"session"`
	Presentation presentationOut `json:"presentation"`
	Slides       []slideOut      `json:"slides"`
	Questions    []questionOut   `json:"questions"`
	PptxURL      *string         `json:"pptx_url"`
}

type analyticsOut struct {
	SessionDurationSeconds int64 `json:"session_duration_seconds"`
	AnsweredCount          int   `json:"answered_count"`
	BlockedCount           int   `json:"blocked_count"`
	CompletionRate         int   `json:"completion_rate"`
	TotalSlides            int32 `json:"total_slides"`
	CurrentSlideNumber     int32 `json:"current_slide_number"`
}
