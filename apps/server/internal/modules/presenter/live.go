package presenter

import (
	"context"
	"sync"
	"time"

	"google.golang.org/genai"
)

// This file ports apps-legacy/server/src/services/presenter-live.ts: a
// minimal Gemini Live session for AI Presenter narration — no tools, no
// mic input, no reconnect loop (unlike streaming's GeminiProvider, which
// serves a customer-facing session worth reconnecting; a presenter's
// live narration is staff-operated, so a drop just gets manually
// retried). The client (kiosk/admin UI) pushes each slide's talking
// points as text; the server streams back narrated PCM audio plus a
// handful of status events.

// presenterEventKind mirrors streaming's ProviderEventKind, trimmed to
// what narration-only sessions actually emit.
type presenterEventKind string

const (
	presenterEventStatus       presenterEventKind = "status"
	presenterEventAudio        presenterEventKind = "audio"
	presenterEventTranscript   presenterEventKind = "transcript"
	presenterEventTurnComplete presenterEventKind = "turn_complete"
	presenterEventInterrupted  presenterEventKind = "interrupted"
	presenterEventTerminal     presenterEventKind = "terminal_error"
)

type presenterEvent struct {
	Kind   presenterEventKind
	Status string
	Audio  []byte
	Text   string
	Err    error
}

// presenterProvider is the seam a real Gemini Live narration connection
// plugs into — analogous to streaming's Provider, simplified to this
// module's text-in/audio-out, no-tools narration use case.
type presenterProvider interface {
	Start(ctx context.Context, systemInstruction, voiceName, model string) (presenterProviderSession, error)
}

type presenterProviderSession interface {
	// Speak pushes one slide's talking points as the next thing to
	// narrate. Safe to call again before the previous turn finishes —
	// legacy's textQueue accepts this too, though in practice the client
	// waits for turn_complete before advancing.
	Speak(text string) error
	Events() <-chan presenterEvent
	Close() error
}

// speakPromptTemplate ports presenter-live.ts's inline prompt wrapper
// verbatim: the talking points alone would read like a script if spoken
// directly, so every push gets wrapped with delivery instructions
// before being sent to the model.
const speakPromptTemplate = `Present the next slide now.

Use the talking points below as your outline — speak like a skilled human presenter, not like you are reading a script aloud. Paraphrase naturally. Follow the Delivery style rules from your system instructions.

Cover EVERY key point, fact, number, and name before you stop. Do not cut the slide short. Do not invent new claims. Do not ask questions. Only stop after the full slide is covered.

Talking points:
---
%s
---`

// geminiPresenterProvider drives a real Gemini Live connection.
// Constructed only when the module's genai client is configured (see
// module.go) — DB-gated tests use fakePresenterProvider instead.
type geminiPresenterProvider struct {
	client *genai.Client
}

func (p *geminiPresenterProvider) Start(ctx context.Context, systemInstruction, voiceName, model string) (presenterProviderSession, error) {
	runCtx, cancel := context.WithCancel(ctx)
	ps := &geminiPresenterSession{
		ctx: runCtx, cancel: cancel,
		speakCh: make(chan string, 4),
		events:  make(chan presenterEvent, 16),
	}

	config := &genai.LiveConnectConfig{
		ResponseModalities: []genai.Modality{genai.ModalityAudio},
		SpeechConfig: &genai.SpeechConfig{
			VoiceConfig: &genai.VoiceConfig{
				PrebuiltVoiceConfig: &genai.PrebuiltVoiceConfig{VoiceName: voiceName},
			},
		},
		SystemInstruction:        genai.NewContentFromText(systemInstruction, genai.RoleUser),
		OutputAudioTranscription: &genai.AudioTranscriptionConfig{},
	}

	gs, err := p.client.Live.Connect(ctx, model, config)
	if err != nil {
		cancel()
		return nil, err
	}
	ps.gs = gs

	go ps.writeLoop()
	go ps.receiveLoop()
	return ps, nil
}

type geminiPresenterSession struct {
	ctx     context.Context
	cancel  context.CancelFunc
	gs      *genai.Session
	speakCh chan string
	events  chan presenterEvent

	mu                sync.Mutex
	turnCompleteTimer *time.Timer
}

// turnCompleteDebounce mirrors presenter-live.ts's 220ms debounce:
// Gemini Live sometimes reports turnComplete before the trailing audio
// chunks for that turn have actually been delivered, so a bare
// turn_complete flag isn't trustworthy on its own — wait briefly and
// let any late audio cancel the pending event.
const turnCompleteDebounce = 220 * time.Millisecond

func (ps *geminiPresenterSession) flushTurnCompleteLater() {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if ps.turnCompleteTimer != nil {
		ps.turnCompleteTimer.Stop()
	}
	ps.turnCompleteTimer = time.AfterFunc(turnCompleteDebounce, func() {
		ps.emit(presenterEvent{Kind: presenterEventTurnComplete})
	})
}

func (ps *geminiPresenterSession) cancelPendingTurnComplete() {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if ps.turnCompleteTimer != nil {
		ps.turnCompleteTimer.Stop()
		ps.turnCompleteTimer = nil
	}
}

func (ps *geminiPresenterSession) emit(ev presenterEvent) bool {
	select {
	case ps.events <- ev:
		return true
	case <-ps.ctx.Done():
		return false
	}
}

func (ps *geminiPresenterSession) writeLoop() {
	for {
		select {
		case <-ps.ctx.Done():
			return
		case text := <-ps.speakCh:
			if err := ps.gs.SendRealtimeInput(genai.LiveRealtimeInput{Text: text}); err != nil {
				return // receiveLoop's blocked Receive() will fail on the same dead connection.
			}
		}
	}
}

func (ps *geminiPresenterSession) receiveLoop() {
	defer close(ps.events)
	for {
		msg, err := ps.gs.Receive()
		if err != nil {
			if ps.ctx.Err() != nil {
				return // Close() was called; not a real failure.
			}
			ps.emit(presenterEvent{Kind: presenterEventTerminal, Err: err})
			return
		}

		if msg.SetupComplete != nil {
			ps.emit(presenterEvent{Kind: presenterEventStatus, Status: "connected"})
		}

		if sc := msg.ServerContent; sc != nil {
			if sc.ModelTurn != nil {
				for _, part := range sc.ModelTurn.Parts {
					if part.InlineData != nil && len(part.InlineData.Data) > 0 {
						ps.cancelPendingTurnComplete() // more audio after a premature turn_complete
						ps.emit(presenterEvent{Kind: presenterEventAudio, Audio: part.InlineData.Data})
					}
				}
			}
			if sc.OutputTranscription != nil && sc.OutputTranscription.Text != "" {
				ps.emit(presenterEvent{Kind: presenterEventTranscript, Text: sc.OutputTranscription.Text})
			}
			if sc.TurnComplete {
				ps.flushTurnCompleteLater()
			}
			if sc.Interrupted {
				ps.cancelPendingTurnComplete()
				ps.emit(presenterEvent{Kind: presenterEventInterrupted})
			}
		}
	}
}

func (ps *geminiPresenterSession) Speak(text string) error {
	select {
	case ps.speakCh <- text:
		return nil
	case <-ps.ctx.Done():
		return ps.ctx.Err()
	}
}

func (ps *geminiPresenterSession) Events() <-chan presenterEvent { return ps.events }

func (ps *geminiPresenterSession) Close() error {
	ps.cancel()
	ps.cancelPendingTurnComplete()
	if ps.gs != nil {
		_ = ps.gs.Close()
	}
	return nil
}

// fakePresenterProvider stands in for a real Gemini connection when no
// API key is configured — every DB-gated test uses this, same posture
// as streaming.FakeProvider. It emits a short synthetic transcript and
// turn_complete for each Speak call, with no real audio.
type fakePresenterProvider struct{}

func (fakePresenterProvider) Start(_ context.Context, _, _, _ string) (presenterProviderSession, error) {
	return &fakePresenterSession{events: make(chan presenterEvent, 8)}, nil
}

type fakePresenterSession struct {
	events chan presenterEvent
}

func (f *fakePresenterSession) Speak(text string) error {
	if text == "" {
		return nil
	}
	f.events <- presenterEvent{
		Kind: presenterEventTranscript,
		Text: "(fake presenter narration — no GEMINI_API_KEY configured)",
	}
	f.events <- presenterEvent{Kind: presenterEventTurnComplete}
	return nil
}

func (f *fakePresenterSession) Events() <-chan presenterEvent { return f.events }

func (f *fakePresenterSession) Close() error {
	close(f.events)
	return nil
}
