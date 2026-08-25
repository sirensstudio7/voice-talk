package knowledge

import (
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type aiRulesOut struct {
	ID                 string `json:"id"`
	AssistantName      string `json:"assistant_name"`
	AvatarURL          string `json:"avatar_url"`
	AvatarModelPath    string `json:"avatar_model_path"`
	Personality        string `json:"personality"`
	Tone               string `json:"tone"`
	Language           string `json:"language"`
	BehavioralRules    string `json:"behavioral_rules"`
	ToolInstructions   string `json:"tool_instructions"`
	IdleTimeoutSeconds int32  `json:"idle_timeout_seconds"`
	VoicePreset        string `json:"voice_preset"`
	VoiceGender        string `json:"voice_gender"`
}

func toAIRulesOut(r store.AiRule) aiRulesOut {
	return aiRulesOut{
		ID:                 r.ID,
		AssistantName:      r.AssistantName,
		AvatarURL:          r.AvatarUrl,
		AvatarModelPath:    r.AvatarModelPath,
		Personality:        r.Personality,
		Tone:               r.Tone,
		Language:           r.Language,
		BehavioralRules:    r.BehavioralRules,
		ToolInstructions:   r.ToolInstructions,
		IdleTimeoutSeconds: r.IdleTimeoutSeconds,
		VoicePreset:        r.VoicePreset,
		VoiceGender:        r.VoiceGender,
	}
}

type updateAIRulesRequest struct {
	AssistantName      *string `json:"assistant_name"`
	AvatarModelPath    *string `json:"avatar_model_path"`
	Personality        *string `json:"personality"`
	Tone               *string `json:"tone"`
	Language           *string `json:"language"`
	BehavioralRules    *string `json:"behavioral_rules"`
	ToolInstructions   *string `json:"tool_instructions"`
	IdleTimeoutSeconds *int32  `json:"idle_timeout_seconds"`
	VoicePreset        *string `json:"voice_preset"`
	VoiceGender        *string `json:"voice_gender"`
}

type knowledgeEntryOut struct {
	ID        string `json:"id"`
	Category  string `json:"category"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	SortOrder int32  `json:"sort_order"`
}

func toKnowledgeEntryOut(e store.KnowledgeEntry) knowledgeEntryOut {
	return knowledgeEntryOut{
		ID:        e.ID,
		Category:  e.Category,
		Title:     e.Title,
		Content:   e.Content,
		SortOrder: e.SortOrder,
	}
}

type createKnowledgeEntryRequest struct {
	Category  string `json:"category"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	SortOrder int32  `json:"sort_order"`
}

type updateKnowledgeEntryRequest struct {
	Category  *string `json:"category"`
	Title     *string `json:"title"`
	Content   *string `json:"content"`
	SortOrder *int32  `json:"sort_order"`
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
