package promptkit

// geminiVoiceByPresetGender ports packages/shared/src/voice-presets.ts's
// GEMINI_VOICE_BY_PRESET_GENDER — the server only needs this one lookup
// table from that file; the rest (playbackRate, filters, the whole Web
// Audio DSP graph) is browser-side voice coloring, irrelevant here.
var geminiVoiceByPresetGender = map[string]map[string]string{
	"natural":    {"female": "Aoede", "male": "Charon"},
	"deep":       {"female": "Aoede", "male": "Charon"},
	"bright":     {"female": "Kore", "male": "Puck"},
	"robot":      {"female": "Aoede", "male": "Puck"},
	"dark_beast": {"female": "Aoede", "male": "Fenrir"},
}

const defaultGeminiVoice = "Aoede"

// GeminiVoiceName resolves a business's voice preset + gender to the
// Gemini Live prebuilt TTS voice name to request in SpeechConfig.
func GeminiVoiceName(preset, gender string) string {
	style := NormalizeVoicePreset(preset)
	sex := NormalizeVoiceGender(gender)
	if name, ok := geminiVoiceByPresetGender[style][sex]; ok && name != "" {
		return name
	}
	return defaultGeminiVoice
}

// darkBeastSpeakingStyle mirrors voice-presets.ts's
// DARK_BEAST_SPEAKING_STYLE — the only PRESET_CONFIGS[*].speakingStyle
// entry that's non-empty. Every other preset has no trailing
// system-instruction section.
const darkBeastSpeakingStyle = "Speaking style (Dark Beast — mandatory for voice delivery):\n" +
	"Speak slowly and confidently, as one deep powerful presence.\n" +
	"Use short sentences. Pause between them.\n" +
	"Stay calm, heavy, and cinematic — never shout, never angry.\n" +
	"Keep every word easy to understand.\n" +
	"Do not growl, snarl, or add monster sound effects in your speech.\n" +
	"Sound like a large intelligent creature speaking quietly and clearly."

// VoiceSpeakingStyle returns the mandatory trailing system-instruction
// section for a voice preset, or "" if the preset has none.
func VoiceSpeakingStyle(preset string) string {
	if NormalizeVoicePreset(preset) == "dark_beast" {
		return darkBeastSpeakingStyle
	}
	return ""
}
