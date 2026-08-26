package streaming

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"google.golang.org/genai"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// maxReconnects and recoverableMarkers port
// apps-legacy/server/src/services/gemini-live.ts's
// MAX_SESSION_RECONNECTS / RECOVERABLE_MARKERS / isRecoverable exactly.
const maxReconnects = 8

var recoverableMarkers = []string{
	"keepalive ping timeout",
	"GoAway",
	"go away",
	"service is currently unavailable",
	"ConnectionClosed",
}

func isRecoverable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	for _, marker := range recoverableMarkers {
		if strings.Contains(msg, strings.ToLower(marker)) {
			return true
		}
	}
	return false
}

// reconnectExhaustedMessage matches legacy's hardcoded (Indonesian-only,
// regardless of session language) final error copy.
const reconnectExhaustedMessage = "Sesi suara terputus. Ketuk Order Now untuk menyambung lagi."

// GeminiProvider drives a real Gemini Live connection per voice session.
// Constructed only when deps.GeminiAPIKey is set (see module.go) — every
// DB-gated test runs against FakeProvider instead.
type GeminiProvider struct {
	client       *genai.Client
	defaultModel string
	store        *store.Queries
}

func NewGeminiProvider(ctx context.Context, apiKey, defaultModel string, q *store.Queries) (*GeminiProvider, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{APIKey: apiKey})
	if err != nil {
		return nil, err
	}
	return &GeminiProvider{client: client, defaultModel: defaultModel, store: q}, nil
}

func (p *GeminiProvider) Start(ctx context.Context, sess *Session) (ProviderSession, error) {
	runCtx, cancel := context.WithCancel(ctx)
	ps := &geminiProviderSession{
		ctx:    runCtx,
		cancel: cancel,
		sendCh: make(chan sendOp, 16),
		events: make(chan ProviderEvent, 16),
	}
	go p.run(runCtx, sess, ps)
	return ps, nil
}

func (p *GeminiProvider) run(ctx context.Context, sess *Session, ps *geminiProviderSession) {
	defer close(ps.events)

	reconnects := 0
	for {
		if reconnects > 0 {
			if !ps.emit(ProviderEvent{Kind: ProviderEventStatus, Status: "reconnecting"}) {
				return
			}
			select {
			case <-time.After(400 * time.Millisecond):
			case <-ctx.Done():
				return
			}
		}

		err := p.runSingleSession(ctx, sess, ps)
		if err == nil {
			return
		}
		if ctx.Err() != nil {
			return // Close() was called; not a real failure.
		}
		if !isRecoverable(err) {
			ps.emit(ProviderEvent{Kind: ProviderEventTerminal, Err: err})
			return
		}
		reconnects++
		if reconnects > maxReconnects {
			ps.emit(ProviderEvent{Kind: ProviderEventTerminal, Err: errors.New(reconnectExhaustedMessage)}) //nolint:staticcheck // user-facing Indonesian copy, not a Go error-convention string
			return
		}
	}
}

func (p *GeminiProvider) runSingleSession(ctx context.Context, sess *Session, ps *geminiProviderSession) error {
	config, model, err := p.buildConnectConfig(ctx, sess)
	if err != nil {
		return err
	}

	gs, err := p.client.Live.Connect(ctx, model, config)
	if err != nil {
		return err
	}
	ps.setCurrent(gs)
	defer func() {
		ps.setCurrent(nil)
		_ = gs.Close()
	}()

	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		p.writeLoop(ctx, gs, ps)
	}()

	err = p.receiveLoop(ctx, gs, ps)
	<-writerDone
	return err
}

func (p *GeminiProvider) buildConnectConfig(ctx context.Context, sess *Session) (*genai.LiveConnectConfig, string, error) {
	rules, err := p.store.GetAIRules(ctx, sess.business.ID)
	if err != nil {
		rules = defaultAIRules(sess.business)
	}

	entries, err := p.store.ListKnowledgeEntries(ctx, sess.business.ID)
	if err != nil {
		return nil, "", err
	}
	products, err := p.store.ListActiveProductsForBusiness(ctx, sess.business.ID)
	if err != nil {
		return nil, "", err
	}

	instruction := promptkit.BuildSystemInstruction(sess.business, rules, entries, products, "", sess.photoMomentEnabled, sess.photoVoicePrompt)

	model := sess.business.GeminiModel
	if model == "" {
		model = p.defaultModel
	}

	config := &genai.LiveConnectConfig{
		ResponseModalities: []genai.Modality{genai.ModalityAudio},
		SpeechConfig: &genai.SpeechConfig{
			VoiceConfig: &genai.VoiceConfig{
				PrebuiltVoiceConfig: &genai.PrebuiltVoiceConfig{
					VoiceName: promptkit.GeminiVoiceName(rules.VoicePreset, rules.VoiceGender),
				},
			},
		},
		SystemInstruction:        genai.NewContentFromText(instruction, genai.RoleUser),
		InputAudioTranscription:  &genai.AudioTranscriptionConfig{},
		OutputAudioTranscription: &genai.AudioTranscriptionConfig{},
		Tools:                    buildToolDeclarations(sess.mode, sess.photoMomentEnabled),
	}
	return config, model, nil
}

// defaultAIRules mirrors the defaults internal/modules/knowledge lazily
// seeds an ai_rules row with on first access — built in-memory here
// (never persisted by streaming) since a business whose owner has never
// opened the AI Rules page still needs a working voice session.
func defaultAIRules(business store.Business) store.AiRule {
	return store.AiRule{
		BusinessID:    business.ID,
		AssistantName: "Lorescale",
		Personality:   promptkit.DefaultPersonality(business.Name, "id", business.PrimaryUseCase, business.BusinessType, "Lorescale"),
		Tone:          "friendly",
		Language:      "id",
		VoicePreset:   "natural",
		VoiceGender:   "female",
	}
}

func (p *GeminiProvider) writeLoop(ctx context.Context, gs *genai.Session, ps *geminiProviderSession) {
	for {
		select {
		case <-ctx.Done():
			return
		case op := <-ps.sendCh:
			var err error
			switch op.kind {
			case opAudio:
				err = gs.SendRealtimeInput(genai.LiveRealtimeInput{Audio: &genai.Blob{Data: op.pcm, MIMEType: "audio/pcm;rate=16000"}})
			case opText:
				err = gs.SendRealtimeInput(genai.LiveRealtimeInput{Text: op.text})
			case opActivityStart:
				err = gs.SendRealtimeInput(genai.LiveRealtimeInput{ActivityStart: &genai.ActivityStart{}})
			case opActivityEnd:
				err = gs.SendRealtimeInput(genai.LiveRealtimeInput{ActivityEnd: &genai.ActivityEnd{}})
			case opAudioStreamEnd:
				err = gs.SendRealtimeInput(genai.LiveRealtimeInput{AudioStreamEnd: true})
			case opToolResult:
				err = gs.SendToolResponse(genai.LiveToolResponseInput{FunctionResponses: []*genai.FunctionResponse{op.toolResult}})
			}
			if err != nil {
				// The receive loop's blocked Receive() call will fail on
				// the same dead connection and drive the reconnect
				// decision — nothing more to do here.
				return
			}
		}
	}
}

func (p *GeminiProvider) receiveLoop(ctx context.Context, gs *genai.Session, ps *geminiProviderSession) error {
	for {
		msg, err := gs.Receive()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		p.handleServerMessage(msg, ps)
	}
}

func (p *GeminiProvider) handleServerMessage(msg *genai.LiveServerMessage, ps *geminiProviderSession) {
	if msg.SetupComplete != nil {
		ps.emit(ProviderEvent{Kind: ProviderEventStatus, Status: "connected"})
	}

	if sc := msg.ServerContent; sc != nil {
		if sc.ModelTurn != nil {
			for _, part := range sc.ModelTurn.Parts {
				if part.InlineData != nil && len(part.InlineData.Data) > 0 {
					ps.emit(ProviderEvent{Kind: ProviderEventAudio, Audio: part.InlineData.Data})
				}
			}
		}
		if sc.InputTranscription != nil && sc.InputTranscription.Text != "" {
			ps.emit(ProviderEvent{Kind: ProviderEventTranscriptUser, Text: sc.InputTranscription.Text})
		}
		if sc.OutputTranscription != nil && sc.OutputTranscription.Text != "" {
			ps.emit(ProviderEvent{Kind: ProviderEventTranscriptReply, Text: sc.OutputTranscription.Text})
		}
		if sc.Interrupted {
			ps.emit(ProviderEvent{Kind: ProviderEventInterrupted})
		}
		if sc.TurnComplete {
			ps.emit(ProviderEvent{Kind: ProviderEventTurnComplete})
		}
	}

	if msg.ToolCall != nil {
		for _, call := range msg.ToolCall.FunctionCalls {
			ps.emit(ProviderEvent{Kind: ProviderEventToolCall, ToolCall: &ProviderToolCall{ID: call.ID, Name: call.Name, Args: call.Args}})
		}
	}
}

type sendOpKind int

const (
	opAudio sendOpKind = iota
	opText
	opActivityStart
	opActivityEnd
	opAudioStreamEnd
	opToolResult
)

type sendOp struct {
	kind       sendOpKind
	pcm        []byte
	text       string
	toolResult *genai.FunctionResponse
}

// geminiProviderSession implements ProviderSession. current holds the
// live *genai.Session for whichever reconnect attempt is active, so
// Close() can unblock a blocked Receive() call; it's nil between
// attempts (during the 400ms backoff).
type geminiProviderSession struct {
	ctx    context.Context
	cancel context.CancelFunc
	sendCh chan sendOp
	events chan ProviderEvent

	mu      sync.Mutex
	current *genai.Session
}

func (ps *geminiProviderSession) setCurrent(gs *genai.Session) {
	ps.mu.Lock()
	ps.current = gs
	ps.mu.Unlock()
}

// emit pushes an event unless the session has already been closed.
// Returns false when the session is closing, so callers (the run loop)
// can stop doing further work.
func (ps *geminiProviderSession) emit(ev ProviderEvent) bool {
	select {
	case ps.events <- ev:
		return true
	case <-ps.ctx.Done():
		return false
	}
}

func (ps *geminiProviderSession) send(op sendOp) error {
	select {
	case ps.sendCh <- op:
		return nil
	case <-ps.ctx.Done():
		return ps.ctx.Err()
	}
}

func (ps *geminiProviderSession) SendAudio(pcm []byte) error {
	return ps.send(sendOp{kind: opAudio, pcm: pcm})
}

func (ps *geminiProviderSession) SendText(text string) error {
	return ps.send(sendOp{kind: opText, text: text})
}

func (ps *geminiProviderSession) SendActivityStart() error {
	return ps.send(sendOp{kind: opActivityStart})
}

func (ps *geminiProviderSession) SendActivityEnd() error {
	return ps.send(sendOp{kind: opActivityEnd})
}

func (ps *geminiProviderSession) SendAudioStreamEnd() error {
	return ps.send(sendOp{kind: opAudioStreamEnd})
}

func (ps *geminiProviderSession) SendToolResult(callID, name string, result map[string]any, callErr error) error {
	response := result
	if callErr != nil {
		response = map[string]any{"error": callErr.Error()}
	}
	if response == nil {
		response = map[string]any{}
	}
	return ps.send(sendOp{kind: opToolResult, toolResult: &genai.FunctionResponse{ID: callID, Name: name, Response: response}})
}

func (ps *geminiProviderSession) Events() <-chan ProviderEvent { return ps.events }

func (ps *geminiProviderSession) Close() error {
	ps.cancel()
	ps.mu.Lock()
	gs := ps.current
	ps.mu.Unlock()
	if gs != nil {
		_ = gs.Close()
	}
	return nil
}
