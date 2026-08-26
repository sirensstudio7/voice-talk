package presenter

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// handlePresenterLive upgrades to a WebSocket and drives one live
// narration session — ports
// apps-legacy/server/src/routes/presentation-websocket.ts's
// handlePresenterSession. Unlike every other route in this module, it
// isn't behind authtoken.RequireAuth/authz.RequireBusinessMember: a
// browser's native WebSocket API can't set an Authorization header, so
// auth here is a ?token= query param verified manually, same as legacy
// (which took token/businessId/sessionId all as query params — this
// port takes businessId and sessionId from the URL path instead, to
// match the rest of the module's REST shape).
func (m *Module) handlePresenterLive(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	slug := chi.URLParam(r, "slug")
	presentationID := chi.URLParam(r, "id")
	sessionID := chi.URLParam(r, "sessionId")
	token := r.URL.Query().Get("token")

	if token == "" {
		http.Error(w, "token is required", http.StatusUnauthorized)
		return
	}
	userID, err := authtoken.Parse(m.deps.JWTSecret, token)
	if err != nil {
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}

	business, err := m.store.GetBusinessBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "business not found", http.StatusNotFound)
			return
		}
		m.deps.Log.Error().Err(err).Str("slug", slug).Msg("get business by slug for presenter live session")
		http.Error(w, "failed to load business", http.StatusInternalServerError)
		return
	}

	if _, err := m.store.CheckBusinessMembership(ctx, store.CheckBusinessMembershipParams{
		UserID: userID, BusinessID: business.ID,
	}); err != nil {
		http.Error(w, "no access to this business", http.StatusForbidden)
		return
	}

	presentation, err := m.store.GetPresentation(ctx, store.GetPresentationParams{ID: presentationID, BusinessID: business.ID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "presentation not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to load presentation", http.StatusInternalServerError)
		return
	}

	session, err := m.store.GetPresentationSession(ctx, store.GetPresentationSessionParams{ID: sessionID, BusinessID: business.ID})
	if err != nil || session.PresentationID != presentationID {
		if err == nil || errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to load session", http.StatusInternalServerError)
		return
	}

	slides, err := m.store.ListPresentationSlides(ctx, presentationID)
	if err != nil {
		http.Error(w, "failed to load slides", http.StatusInternalServerError)
		return
	}
	knowledge, err := m.store.ListPresentationKnowledgeEntries(ctx, presentationID)
	if err != nil {
		http.Error(w, "failed to load presentation knowledge", http.StatusInternalServerError)
		return
	}
	rules, err := m.store.GetAIRules(ctx, business.ID)
	if err != nil {
		// No ai_rules row yet (owner never opened AI Rules) — narration
		// still needs a voice, so fall back to the same natural/female
		// default promptkit.GeminiVoiceName resolves for any unset preset.
		rules = store.AiRule{BusinessID: business.ID, VoicePreset: "natural", VoiceGender: "female"}
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: m.originPatterns})
	if err != nil {
		m.deps.Log.Error().Err(err).Msg("presenter live websocket accept")
		return
	}
	defer func() { _ = conn.CloseNow() }()

	log := m.deps.Log.With().Str("session_id", session.ID).Str("presentation_id", presentation.ID).Logger()

	// No GEMINI_API_KEY-gate here: m.live is already fakePresenterProvider
	// when deps.GeminiAPIKey is unset (see module.go), same posture as
	// streaming's FakeProvider — every DB-gated test runs through it, and
	// a real deployment without a key gets synthetic narration instead of
	// a hard failure, which is more useful for local/staging boot than
	// legacy's unconditional error-and-close.
	systemInstruction := buildPresenterSystemInstruction(presentation.Language, presentation.Title, knowledge, slides)
	voiceName := promptkit.GeminiVoiceName(rules.VoicePreset, rules.VoiceGender)
	model := m.deps.GeminiModel

	sendLiveJSON(conn, log, "session.status", liveStatusPayload{Status: "connecting"})

	providerSession, err := m.live.Start(ctx, systemInstruction, voiceName, model)
	if err != nil {
		log.Error().Err(err).Msg("start presenter live session")
		sendLiveJSON(conn, log, "error", liveErrorPayload{Error: err.Error()})
		_ = conn.Close(websocket.StatusNormalClosure, "")
		return
	}
	defer func() { _ = providerSession.Close() }()

	sessCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var writeMu sync.Mutex
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		relayPresenterEvents(sessCtx, conn, &writeMu, log, providerSession.Events(), cancel)
	}()

	readPresenterLiveMessages(sessCtx, conn, log, providerSession)

	cancel()
	wg.Wait()
}

// readPresenterLiveMessages is the client -> server side: "speak" pushes
// a slide's talking points (wrapped in speakPromptTemplate before being
// sent on), "close" ends the session early.
func readPresenterLiveMessages(ctx context.Context, conn *websocket.Conn, log zerolog.Logger, ps presenterProviderSession) {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var msg clientLiveMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Warn().Err(err).Msg("presenter live: bad client message")
			continue
		}
		switch msg.Type {
		case "speak":
			if text := msg.Text; text != "" {
				if err := ps.Speak(fmt.Sprintf(speakPromptTemplate, text)); err != nil {
					return
				}
			}
		case "close":
			return
		}
	}
}

// relayPresenterEvents is the provider -> client side: audio frames go
// out as binary WS messages, everything else as the JSON envelope
// protocol every other WS handler in this codebase uses.
func relayPresenterEvents(ctx context.Context, conn *websocket.Conn, writeMu *sync.Mutex, log zerolog.Logger, events <-chan presenterEvent, cancel context.CancelFunc) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-events:
			if !ok {
				return
			}
			switch ev.Kind {
			case presenterEventStatus:
				sendLiveJSONLocked(conn, writeMu, log, "session.status", liveStatusPayload{Status: ev.Status})
			case presenterEventAudio:
				writeMu.Lock()
				writeCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
				if err := conn.Write(writeCtx, websocket.MessageBinary, ev.Audio); err != nil {
					log.Error().Err(err).Msg("presenter live: write audio frame")
				}
				done()
				writeMu.Unlock()
			case presenterEventTranscript:
				sendLiveJSONLocked(conn, writeMu, log, "transcript.assistant", liveTranscriptPayload{Text: ev.Text})
			case presenterEventTurnComplete:
				sendLiveJSONLocked(conn, writeMu, log, "turn_complete", struct{}{})
			case presenterEventInterrupted:
				sendLiveJSONLocked(conn, writeMu, log, "audio.interrupted", struct{}{})
			case presenterEventTerminal:
				msg := "presenter live session ended unexpectedly"
				if ev.Err != nil {
					msg = ev.Err.Error()
				}
				sendLiveJSONLocked(conn, writeMu, log, "error", liveErrorPayload{Error: msg})
				cancel()
				return
			}
		}
	}
}
