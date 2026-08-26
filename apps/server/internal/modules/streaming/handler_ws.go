package streaming

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// handleVoiceSession upgrades to a WebSocket and drives one voice
// session's entire lifecycle: a read loop over client messages and a
// provider-event loop over whatever the (real or fake) Gemini
// connection pushes back, writing to the socket through a shared,
// mutex-serialized send function (coder/websocket's Write isn't safe
// for concurrent use across goroutines).
func (m *Module) handleVoiceSession(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	business, err := m.store.GetBusinessBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "business not found", http.StatusNotFound)
			return
		}
		m.deps.Log.Error().Err(err).Str("slug", slug).Msg("get business by slug")
		http.Error(w, "failed to load business", http.StatusInternalServerError)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: m.originPatterns,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("websocket accept")
		return
	}
	defer func() { _ = conn.CloseNow() }()

	ctx := r.Context()
	mode := deriveMode(capabilities.Get(business.PrimaryUseCase, business.BusinessType))

	voiceSession, err := m.store.CreateVoiceSession(ctx, store.CreateVoiceSessionParams{
		ID: uuid.NewString(), BusinessID: business.ID,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", business.ID).Msg("create voice session")
		_ = conn.Close(websocket.StatusInternalError, "failed to start session")
		return
	}

	sess := &Session{
		conn:           conn,
		business:       business,
		mode:           mode,
		voiceSessionID: voiceSession.ID,
		log:            m.deps.Log.With().Str("voice_session_id", voiceSession.ID).Logger(),
	}
	if mode == ModeOrdering {
		sess.orderStore = NewOrderStore()
		if settings, err := m.store.GetPhotoSettings(ctx, business.ID); err == nil {
			sess.photoMomentEnabled = settings.Enabled
			sess.photoVoicePrompt = settings.VoicePrompt
		} else if !errors.Is(err, pgx.ErrNoRows) {
			// Not fatal to the session — Smart Photo Moment just stays
			// off for this call, same posture as any other best-effort
			// config lookup in this codebase.
			sess.log.Error().Err(err).Msg("get photo settings for voice session")
		}
	}

	endReason := m.runSession(ctx, sess)

	if err := m.store.EndVoiceSession(ctx, store.EndVoiceSessionParams{
		ID: voiceSession.ID, EndReason: pgText(endReason),
	}); err != nil {
		sess.log.Error().Err(err).Msg("end voice session")
	}
	m.deps.Events.Publish(ctx, events.Event{Name: "voice_session.ended", Data: voiceSession.ID})
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

// runSession wires up the two concurrent pieces (client reads, provider
// events) and returns once either decides the session is over. It
// returns the end reason.
//
// Writes are synchronous and mutex-serialized rather than queued onto a
// separate writer goroutine: canceling sessCtx doesn't just stop new
// work, it forcibly closes the connection out from under a blocked
// conn.Read call (coder/websocket ties a Read's context to the
// connection's lifetime). A queued write racing that cancellation could
// be silently dropped — the final error/conversation.complete frame
// never reaching the client. Writing synchronously before calling
// finish() guarantees the frame is already on the wire before anything
// tears the connection down.
func (m *Module) runSession(ctx context.Context, sess *Session) string {
	sessCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var writeMu sync.Mutex
	var endOnce sync.Once
	var endReason string
	finish := func(reason string) {
		endOnce.Do(func() {
			endReason = reason
			cancel()
		})
	}

	send := func(msgType string, data any) {
		payload, err := json.Marshal(serverEnvelope{Type: msgType, Data: data})
		if err != nil {
			sess.log.Error().Err(err).Str("type", msgType).Msg("marshal server message")
			return
		}
		m.writeFrame(sess, &writeMu, websocket.MessageText, payload)
	}
	sendErr := func(code, message string) { send("error", errorPayload{Code: code, Message: message}) }
	sendAudio := func(pcm []byte) { m.writeFrame(sess, &writeMu, websocket.MessageBinary, pcm) }

	send("session.status", sessionStatusPayload{Status: "connected"})

	providerSession, err := m.provider.Start(sessCtx, sess)
	if err != nil {
		sess.log.Error().Err(err).Msg("start provider")
		sendErr("provider_error", "failed to start voice session")
		finish("provider_error")
		return endReason
	}
	defer func() { _ = providerSession.Close() }()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.consumeProviderEvents(sessCtx, sess, providerSession, send, sendAudio, finish)
	}()

	m.readLoop(sessCtx, sess, providerSession, send, sendErr, finish)

	cancel()
	wg.Wait()
	return endReason
}

// readLoop is the client -> server side: binary frames are mic audio
// forwarded straight to the provider; text frames are the JSON envelope
// protocol.
func (m *Module) readLoop(ctx context.Context, sess *Session, ps ProviderSession, send func(string, any), sendErr func(string, string), finish func(string)) {
	for {
		msgType, data, err := sess.conn.Read(ctx)
		if err != nil {
			reason := "read_error"
			if websocket.CloseStatus(err) != -1 {
				reason = "client_disconnected"
			}
			finish(reason)
			return
		}

		if msgType == websocket.MessageBinary {
			if err := ps.SendAudio(data); err != nil {
				sess.log.Error().Err(err).Msg("send audio to provider")
			}
			continue
		}

		var envelope clientEnvelope
		if err := json.Unmarshal(data, &envelope); err != nil {
			sendErr("invalid_message", "malformed message")
			continue
		}

		if envelope.Type == "session.end" {
			finish("client_ended")
			return
		}
		m.handleClientMessage(ctx, sess, ps, envelope, send, sendErr, finish)
	}
}

func (m *Module) handleClientMessage(ctx context.Context, sess *Session, ps ProviderSession, envelope clientEnvelope, send func(string, any), sendErr func(string, string), finish func(string)) {
	switch envelope.Type {
	case "order.add_item":
		var p addItemPayload
		if err := json.Unmarshal(envelope.Data, &p); err != nil {
			sendErr("invalid_message", "malformed order.add_item")
			return
		}
		result, err := m.tools.Execute(ctx, sess, "add_to_order", map[string]any{"product_id": p.ProductID, "quantity": float64(p.Quantity)})
		m.respondToolResult(send, sendErr, "add_to_order", result, err)

	case "order.decrement_item":
		var p productIDPayload
		if err := json.Unmarshal(envelope.Data, &p); err != nil {
			sendErr("invalid_message", "malformed order.decrement_item")
			return
		}
		result, err := m.tools.Execute(ctx, sess, "decrement_item", map[string]any{"product_id": p.ProductID})
		m.respondToolResult(send, sendErr, "decrement_item", result, err)

	case "order.remove_item":
		var p productIDPayload
		if err := json.Unmarshal(envelope.Data, &p); err != nil {
			sendErr("invalid_message", "malformed order.remove_item")
			return
		}
		result, err := m.tools.Execute(ctx, sess, "remove_from_order", map[string]any{"product_id": p.ProductID})
		m.respondToolResult(send, sendErr, "remove_from_order", result, err)

	case "input.text":
		var p inputTextPayload
		if err := json.Unmarshal(envelope.Data, &p); err != nil {
			sendErr("invalid_message", "malformed input.text")
			return
		}
		text := strings.TrimSpace(p.Text)
		if text == "" {
			return
		}
		m.recordTranscript(ctx, sess, "user", text)
		send("transcript.user", transcriptPayload{Text: text})
		if err := ps.SendText(text); err != nil {
			sendErr("provider_error", err.Error())
		}

	case "audio.activity_start":
		if err := ps.SendActivityStart(); err != nil {
			sendErr("provider_error", err.Error())
		}
	case "audio.activity_end":
		if err := ps.SendActivityEnd(); err != nil {
			sendErr("provider_error", err.Error())
		}
	case "audio.stream_end":
		if err := ps.SendAudioStreamEnd(); err != nil {
			sendErr("provider_error", err.Error())
		}

	case "debug.tool_call":
		var p debugToolCallPayload
		if err := json.Unmarshal(envelope.Data, &p); err != nil {
			sendErr("invalid_message", "malformed debug.tool_call")
			return
		}
		result, err := m.tools.Execute(ctx, sess, p.Name, p.Args)
		m.respondToolResult(send, sendErr, p.Name, result, err)
		if err == nil && p.Name == "end_conversation" {
			send("conversation.complete", conversationCompletePayload{Reason: "end_conversation"})
			finish("conversation_complete")
		}

	default:
		sendErr("unknown_message_type", "unrecognized message type: "+envelope.Type)
	}
}

// consumeProviderEvents is the provider -> server->client side: it
// drains everything the (real or fake) Gemini connection pushes and
// translates each event into a WS frame, DB write, or tool execution.
func (m *Module) consumeProviderEvents(ctx context.Context, sess *Session, ps ProviderSession, send func(string, any), sendAudio func([]byte), finish func(string)) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ps.Events():
			if !ok {
				return
			}
			switch ev.Kind {
			case ProviderEventAudio:
				sendAudio(ev.Audio)
			case ProviderEventTranscriptUser:
				m.recordTranscript(ctx, sess, "user", ev.Text)
				send("transcript.user", transcriptPayload{Text: ev.Text})
			case ProviderEventTranscriptReply:
				m.recordTranscript(ctx, sess, "assistant", ev.Text)
				send("transcript.assistant", transcriptPayload{Text: ev.Text})
			case ProviderEventTurnComplete:
				send("turn_complete", turnCompletePayload{})
			case ProviderEventInterrupted:
				send("interrupted", interruptedPayload{})
			case ProviderEventStatus:
				send("session.status", sessionStatusPayload{Status: ev.Status})
			case ProviderEventToolCall:
				m.executeProviderToolCall(ctx, sess, ps, ev.ToolCall, send)
			case ProviderEventTerminal:
				msg := "voice session ended unexpectedly"
				if ev.Err != nil {
					msg = ev.Err.Error()
				}
				send("error", errorPayload{Code: "provider_terminated", Message: msg})
				finish("provider_terminated")
				return
			}
		}
	}
}

// executeProviderToolCall is the exact same ToolExecutor.Execute entry
// point debug.tool_call exercises manually — the real seam a parsed
// Gemini functionCalls event dispatches through.
func (m *Module) executeProviderToolCall(ctx context.Context, sess *Session, ps ProviderSession, call *ProviderToolCall, send func(string, any)) {
	if call == nil {
		return
	}
	result, err := m.tools.Execute(ctx, sess, call.Name, call.Args)
	if sendErr := ps.SendToolResult(call.ID, call.Name, result, err); sendErr != nil {
		sess.log.Error().Err(sendErr).Str("tool", call.Name).Msg("send tool result to provider")
	}
	if err == nil {
		if items, ok := result["items"].([]orderLineOut); ok {
			total, _ := result["total"].(float64)
			send("order.updated", orderUpdatedPayload{Items: items, Total: total})
		}
		sendPhotoConsentSideEffect(send, call.Name, result)
	}
}

// sendPhotoConsentSideEffect forwards a photo.consent frame whenever a
// successful set_photo_souvenir_consent call recorded (or re-reported)
// the customer's answer — the one tool result client UIs need to react
// to beyond the generic tool_result/order.updated frames, matching
// legacy's onPhotoConsent callback. Shared by both the real
// model-driven path (executeProviderToolCall) and the client-facing
// debug.tool_call harness (respondToolResult) so tests can exercise it
// without a live Gemini connection.
func sendPhotoConsentSideEffect(send func(string, any), toolName string, result map[string]any) {
	if toolName != "set_photo_souvenir_consent" {
		return
	}
	if consent, ok := result["consent"].(string); ok {
		send("photo.consent", photoConsentPayload{Consent: consent})
	}
}

func (m *Module) recordTranscript(ctx context.Context, sess *Session, role, text string) {
	if _, err := m.store.CreateTranscriptMessage(ctx, store.CreateTranscriptMessageParams{
		ID: uuid.NewString(), VoiceSessionID: sess.voiceSessionID, Role: role, Text: text,
	}); err != nil {
		sess.log.Error().Err(err).Str("role", role).Msg("record transcript message")
	}
}

// respondToolResult sends either an order.updated frame (when the tool
// touched the cart, which every ordering-mode tool result carries as
// "items"/"total") or a generic result frame — used for client-driven
// tool calls (order.* messages, debug.tool_call), which bypass the
// provider entirely.
func (m *Module) respondToolResult(send func(string, any), sendErr func(string, string), toolName string, result map[string]any, err error) {
	if err != nil {
		sendErr("tool_error", err.Error())
		return
	}
	sendPhotoConsentSideEffect(send, toolName, result)
	if items, ok := result["items"].([]orderLineOut); ok {
		total, _ := result["total"].(float64)
		send("order.updated", orderUpdatedPayload{Items: items, Total: total})
		return
	}
	send("tool_result", result)
}

// writeFrame is the single, mutex-serialized path every write to the
// connection goes through — see runSession's doc comment for why writes
// are synchronous rather than queued.
func (m *Module) writeFrame(sess *Session, mu *sync.Mutex, kind websocket.MessageType, data []byte) {
	mu.Lock()
	defer mu.Unlock()
	writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sess.conn.Write(writeCtx, kind, data); err != nil {
		sess.log.Error().Err(err).Msg("write websocket message")
	}
}
