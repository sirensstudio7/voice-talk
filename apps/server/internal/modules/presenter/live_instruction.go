package presenter

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// This file ports presentation-websocket.ts's
// buildPresenterSystemInstruction/splitPresentationKnowledge exactly —
// the system instruction a live narration session opens with.

var styleTitleRE = regexp.MustCompile(`(?i)\b(style|tone|delivery|presenting|presenter|speaking|cara\s*present|gaya|nada|penyampaian)\b`)

// splitPresentationKnowledge separates deck knowledge entries into
// delivery-style notes (how to present) vs factual notes (what to say),
// matched by a keyword regex against the title, falling back to the
// content's first 120 characters — same heuristic as legacy.
func splitPresentationKnowledge(knowledge []store.PresentationKnowledgeEntry) (style, facts []store.PresentationKnowledgeEntry) {
	for _, entry := range knowledge {
		title := strings.TrimSpace(entry.Title)
		content := strings.TrimSpace(entry.Content)
		if content == "" {
			continue
		}
		snippet := content
		if len(snippet) > 120 {
			snippet = snippet[:120]
		}
		if styleTitleRE.MatchString(title) || styleTitleRE.MatchString(snippet) {
			style = append(style, entry)
		} else {
			facts = append(facts, entry)
		}
	}
	return style, facts
}

func formatKnowledgeBlock(entries []store.PresentationKnowledgeEntry, emptyLabel string) string {
	if len(entries) == 0 {
		return emptyLabel
	}
	blocks := make([]string, len(entries))
	for i, k := range entries {
		heading := strings.TrimSpace(k.Title)
		if heading == "" {
			heading = "Note " + strconv.Itoa(i+1)
		}
		blocks[i] = "### " + heading + "\n" + strings.TrimSpace(k.Content)
	}
	return strings.Join(blocks, "\n\n")
}

// buildPresenterSystemInstruction ports
// presentation-websocket.ts's buildPresenterSystemInstruction, plus the
// slide-outline suffix its one call site always appends.
func buildPresenterSystemInstruction(language, title string, knowledge []store.PresentationKnowledgeEntry, slides []store.PresentationSlide) string {
	style, facts := splitPresentationKnowledge(knowledge)
	styleBlock := formatKnowledgeBlock(style, "(none — use a warm, confident human presenting style by default)")
	factsBlock := formatKnowledgeBlock(facts, "(none)")

	languageLabel := "English"
	if language == "id" {
		languageLabel = "Indonesian"
	}

	instruction := "You are a live AI presenter for the deck \"" + title + "\".\n" +
		"Language: " + languageLabel + ".\n\n" +
		"## How to present (important)\n" +
		"- Sound like a human presenter on stage — conversational, confident, and engaging.\n" +
		"- Do NOT recite the slide script word-for-word like reading a document.\n" +
		"- Treat each slide script as talking points / outline. Paraphrase in your own words.\n" +
		"- Keep every key fact, number, name, and claim from the script — do not invent or drop them.\n" +
		"- Use short spoken sentences, natural pacing, light emphasis, and brief connective phrases.\n" +
		"- Do not ask the audience questions during slide narration. Stop when the slide is covered.\n" +
		"- Follow any Delivery style notes below over the default tone.\n\n" +
		"## Delivery style (from presentation knowledge)\n" + styleBlock + "\n\n" +
		"## Deck facts (accuracy for Q&A and consistency)\n" + factsBlock

	if len(slides) == 0 {
		return instruction
	}
	lines := make([]string, len(slides))
	for i, s := range slides {
		title := s.Title
		if title == "" {
			title = "Untitled"
		}
		lines[i] = strconv.Itoa(int(s.SlideNumber)) + ". " + title
	}
	return instruction + "\n\nSlide outline:\n" + strings.Join(lines, "\n")
}
