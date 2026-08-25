package presenter

import (
	"fmt"
	"strings"
)

// buildTalkingPointsFromSlide is a verbatim port of
// presentation-ai.ts's buildTalkingPointsFromSlide — pure string logic,
// no LLM call. This (not the LLM generateSlideScript, which the legacy
// pipeline never actually calls) is what the pipeline persists as
// presentation_slides.script; the human-sounding paraphrasing happens
// live, at presentation time, inside the Gemini Live model (a later
// phase) — not here.
func buildTalkingPointsFromSlide(title string, texts []string, notes string) string {
	titleLower := strings.ToLower(strings.TrimSpace(title))

	var parts []string
	seen := make(map[string]bool)
	for _, line := range texts {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.ToLower(line) == titleLower {
			continue
		}
		key := strings.ToLower(line)
		if seen[key] {
			continue
		}
		seen[key] = true
		parts = append(parts, line)
	}

	notes = strings.TrimSpace(notes)
	if notes != "" {
		parts = append(parts, notes)
	}

	if len(parts) == 0 {
		if title == "" {
			return "Let's look at this slide."
		}
		return fmt.Sprintf("Let's look at %s.", title)
	}
	if len(parts) == 1 {
		return fmt.Sprintf("On this slide: %s.", parts[0])
	}

	joined := strings.Join(parts, ". ")
	joined = strings.ReplaceAll(joined, "..", ".")
	return joined
}

type greetingClosing struct {
	Greeting string
	Closing  string
}

// buildDefaultGreetingClosing is the static, non-LLM bilingual template
// pair the pipeline always uses (presentation-ai.ts's
// buildDefaultGreetingClosing — the LLM generateGreetingClosing exists in
// legacy but is never called by the pipeline; matched here).
func buildDefaultGreetingClosing(language, title string) greetingClosing {
	if title == "" {
		title = "this presentation"
	}
	if language == "id" {
		return greetingClosing{
			Greeting: fmt.Sprintf("Halo, selamat datang! Saya akan memandu Anda melalui %s hari ini.", title),
			Closing:  "Terima kasih sudah menyimak presentasi ini. Sampai jumpa!",
		}
	}
	return greetingClosing{
		Greeting: fmt.Sprintf("Hello, and welcome! I'll be guiding you through %s today.", title),
		Closing:  "Thank you for joining this presentation. See you next time!",
	}
}

// estimateScriptDurationSeconds ports estimateDurationSeconds
// (exported as estimateScriptDurationSeconds) from presentation-ai.ts:
// word count / 140 wpm * 60s + 2s pause buffer, minimum 4s.
func estimateScriptDurationSeconds(script string) int32 {
	words := strings.Fields(script)
	seconds := int32(float64(len(words))/140.0*60.0) + 2
	if seconds < 4 {
		return 4
	}
	return seconds
}
