package streaming

import "context"

// Provider is the seam a real Gemini Live connection plugs into. Start
// begins a provider-backed conversation for one voice session; the
// returned ProviderSession is used for the rest of that session's
// lifetime.
//
// Phase 1's Provider was request/reply-shaped (HandleUserText). That
// doesn't fit a continuous audio stream where the provider pushes
// audio/transcript/tool-call events asynchronously, independent of
// client input — hence the full-duplex redesign here.
type Provider interface {
	Start(ctx context.Context, sess *Session) (ProviderSession, error)
}

// ProviderSession is a single voice session's live connection to a
// provider. All Send* methods are safe to call from the WS handler's
// read loop; Events() is drained by a separate goroutine. Exactly one of
// SendAudio/SendText/SendActivityStart/SendActivityEnd/SendAudioStreamEnd
// should be in flight at a time per the underlying realtime-input
// contract.
type ProviderSession interface {
	// SendAudio forwards a raw mic PCM chunk (16-bit LE, 16kHz, mono).
	SendAudio(pcm []byte) error
	// SendText forwards typed input or an injected prompt.
	SendText(text string) error
	SendActivityStart() error
	SendActivityEnd() error
	SendAudioStreamEnd() error
	// SendToolResult replies to a ToolCall event previously received on
	// Events(). callErr, if non-nil, is folded into the result the
	// provider sees (tool execution failed) rather than aborting the
	// session.
	SendToolResult(callID, name string, result map[string]any, callErr error) error
	// Events streams everything the provider pushes back. The channel is
	// closed when the session ends (see ProviderEventTerminal).
	Events() <-chan ProviderEvent
	Close() error
}

type ProviderEventKind string

const (
	ProviderEventAudio           ProviderEventKind = "audio"
	ProviderEventTranscriptUser  ProviderEventKind = "transcript_user"
	ProviderEventTranscriptReply ProviderEventKind = "transcript_assistant"
	ProviderEventTurnComplete    ProviderEventKind = "turn_complete"
	ProviderEventInterrupted     ProviderEventKind = "interrupted"
	ProviderEventStatus          ProviderEventKind = "status"
	ProviderEventToolCall        ProviderEventKind = "tool_call"
	ProviderEventTerminal        ProviderEventKind = "terminal_error"
)

type ProviderToolCall struct {
	ID   string
	Name string
	Args map[string]any
}

type ProviderEvent struct {
	Kind     ProviderEventKind
	Audio    []byte // 16-bit LE PCM, 24kHz mono — present when Kind == audio
	Text     string
	ToolCall *ProviderToolCall // present when Kind == tool_call
	Status   string
	Err      error
}

// FakeProvider stands in for a real Gemini connection when no API key is
// configured (and in every DB-gated test, which never needs real API
// credentials — see module.go). It does no NLU: tool execution is
// driven by the client's explicit debug.tool_call message, not by
// parsing input.text.
type FakeProvider struct{}

func (FakeProvider) Start(_ context.Context, _ *Session) (ProviderSession, error) {
	events := make(chan ProviderEvent, 4)
	return &fakeProviderSession{events: events}, nil
}

type fakeProviderSession struct {
	events chan ProviderEvent
}

func (f *fakeProviderSession) SendAudio(_ []byte) error  { return nil }
func (f *fakeProviderSession) SendActivityStart() error  { return nil }
func (f *fakeProviderSession) SendActivityEnd() error    { return nil }
func (f *fakeProviderSession) SendAudioStreamEnd() error { return nil }
func (f *fakeProviderSession) SendToolResult(string, string, map[string]any, error) error {
	return nil
}

func (f *fakeProviderSession) SendText(text string) error {
	if text == "" {
		return nil
	}
	f.events <- ProviderEvent{
		Kind: ProviderEventTranscriptReply,
		Text: "Got it — this is the fake provider standing in for a real Gemini Live connection (no GEMINI_API_KEY configured).",
	}
	return nil
}

func (f *fakeProviderSession) Events() <-chan ProviderEvent { return f.events }

func (f *fakeProviderSession) Close() error {
	close(f.events)
	return nil
}
