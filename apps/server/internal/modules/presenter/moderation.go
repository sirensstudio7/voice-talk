package presenter

import (
	"regexp"
	"strings"
)

// moderationResult ports apps-legacy/server/src/services/presentation-moderation.ts's
// ModerationResult exactly (field names/JSON shape matter — it's persisted
// verbatim as presentation_questions.moderation_result).
type moderationResult struct {
	Allowed    bool     `json:"allowed"`
	Reasons    []string `json:"reasons"`
	Categories []string `json:"categories"`
}

// profanityTerms is the same bilingual (English + Indonesian) fixed list
// legacy uses — deliberately simplistic, no LLM call.
var profanityTerms = []string{"fuck", "shit", "bitch", "asshole", "kontol", "anjing", "bangsat"}

var promptInjectionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)ignore (all )?(previous|prior) instructions`),
	regexp.MustCompile(`(?i)system prompt`),
	regexp.MustCompile(`(?i)jailbreak`),
	regexp.MustCompile(`(?i)you are now dan`),
	regexp.MustCompile(`(?i)disregard (your|all) rules`),
	regexp.MustCompile(`(?i)<script`),
}

var unsafeContentPhrases = []string{"how to make a bomb", "kill yourself", "child porn"}

var piiKeywordPattern = regexp.MustCompile(`(?i)ssn|credit card|password is`)
var piiDigitsPattern = regexp.MustCompile(`\d{4,}`)

// moderateAudienceQuestion is a verbatim port of
// presentation-moderation.ts's moderateAudienceQuestion — same checks, same
// word lists/patterns, same "all categories evaluated" behavior (a
// question can carry multiple simultaneous reasons).
func moderateAudienceQuestion(question string) moderationResult {
	trimmed := strings.TrimSpace(question)
	if trimmed == "" {
		return moderationResult{Allowed: false, Reasons: []string{"empty"}, Categories: []string{"empty"}}
	}

	var reasons, categories []string
	lower := strings.ToLower(trimmed)

	for _, term := range profanityTerms {
		if strings.Contains(lower, term) {
			reasons = append(reasons, "profanity")
			categories = append(categories, "profanity")
			break
		}
	}

	for _, pattern := range promptInjectionPatterns {
		if pattern.MatchString(trimmed) {
			reasons = append(reasons, "prompt_injection")
			categories = append(categories, "prompt_injection")
			break
		}
	}

	for _, phrase := range unsafeContentPhrases {
		if strings.Contains(lower, phrase) {
			reasons = append(reasons, "unsafe")
			categories = append(categories, "unsafe")
			break
		}
	}

	if piiKeywordPattern.MatchString(trimmed) && piiDigitsPattern.MatchString(trimmed) {
		reasons = append(reasons, "pii")
		categories = append(categories, "pii")
	}

	return moderationResult{Allowed: len(reasons) == 0, Reasons: reasons, Categories: categories}
}
