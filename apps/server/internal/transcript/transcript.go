// Package transcript ports packages/shared/src/transcript.ts's chunk/message
// merging — used when rendering a voice session's transcript for an owner
// (conversations list/export/detail), to coalesce consecutive same-role
// rows (and overlapping partial-utterance chunks within them) into
// readable messages, regardless of how granular the underlying
// transcript_messages rows are.
package transcript

import (
	"strings"
)

// MergeChunk ports mergeTranscriptChunk: combines two same-role text
// chunks that may fully contain, or partially overlap, each other —
// Gemini's streaming transcription sometimes re-sends an extended version
// of what it just said rather than a clean continuation.
func MergeChunk(existing, incoming string) string {
	if existing == "" {
		return incoming
	}
	if incoming == "" {
		return existing
	}
	if strings.HasPrefix(incoming, existing) {
		return incoming
	}
	if strings.HasPrefix(existing, incoming) {
		return existing
	}
	if strings.HasSuffix(existing, incoming) {
		return existing
	}

	maxOverlap := min(len(incoming), len(existing))
	for size := maxOverlap; size > 0; size-- {
		if existing[len(existing)-size:] == incoming[:size] {
			return existing + incoming[size:]
		}
	}

	needsSpace := !endsWithSpace(existing) && !startsWithSpace(incoming) && !startsWithClosingPunct(incoming)
	if needsSpace {
		return existing + " " + incoming
	}
	return existing + incoming
}

func endsWithSpace(s string) bool {
	return s != "" && isSpace(rune(s[len(s)-1]))
}

func startsWithSpace(s string) bool {
	return s != "" && isSpace(rune(s[0]))
}

func isSpace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\v' || r == '\f'
}

var closingPunct = map[rune]bool{
	'.': true, ',': true, '!': true, '?': true, ';': true, ':': true,
	'\'': true, '"': true, ')': true, ']': true, '}': true, '>': true,
	'-': true, '—': true, // hyphen and em dash, matching the legacy regex's [...—-] class
}

func startsWithClosingPunct(s string) bool {
	if s == "" {
		return false
	}
	r := []rune(s)[0]
	return closingPunct[r]
}

// Message is the minimal shape MergeMessages needs — callers convert
// their own row/DTO type into this and back.
type Message struct {
	Role string
	Text string
}

// MergeMessages ports mergeTranscriptMessages: drops empty messages and
// coalesces consecutive same-role messages via MergeChunk. The returned
// slice is a new slice; input is not mutated.
func MergeMessages[T any](messages []T, get func(T) Message, set func(T, string) T) []T {
	merged := make([]T, 0, len(messages))
	var lastRole string
	var lastText string
	haveLast := false

	for _, m := range messages {
		msg := get(m)
		trimmed := strings.TrimSpace(msg.Text)
		if trimmed == "" {
			continue
		}

		if haveLast && lastRole == msg.Role {
			combined := MergeChunk(lastText, trimmed)
			if combined == lastText {
				continue
			}
			merged[len(merged)-1] = set(merged[len(merged)-1], combined)
			lastText = combined
			continue
		}

		merged = append(merged, set(m, trimmed))
		lastRole = msg.Role
		lastText = trimmed
		haveLast = true
	}

	return merged
}
