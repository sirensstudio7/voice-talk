package presenter

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// activeQnaStatuses are the session states submitSessionQuestion accepts.
// Unlike legacy — whose redundant guard clause lets a question slip
// through on a "completed" session — this rejects completed sessions
// outright; see the Phase 1 plan's deliberate-deviation section.
var activeQnaStatuses = map[string]bool{sessionQnaWaiting: true, sessionAnswering: true, sessionThinking: true}

func (m *Module) submitPresentationQuestion(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	var req submitQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	question := strings.TrimSpace(req.Question)
	if question == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "question is required")
		return
	}

	session, err := m.store.GetPresentationSession(r.Context(), store.GetPresentationSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("get session for question")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to submit question")
		return
	}
	if !session.EnableQna || !activeQnaStatuses[session.Status] {
		httpx.Error(w, http.StatusBadRequest, "qna_not_accepting", "session is not accepting questions yet")
		return
	}

	presentation, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: session.PresentationID, BusinessID: access.BusinessID})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("get presentation for question")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to submit question")
		return
	}

	moderation := moderateAudienceQuestion(question)
	moderationJSON, _ := json.Marshal(moderation)
	status := "incoming"
	if !moderation.Allowed {
		status = "blocked"
	}

	q, err := m.store.CreatePresentationQuestion(r.Context(), store.CreatePresentationQuestionParams{
		ID: uuid.NewString(), SessionID: sessionID, Question: question,
		Status: status, ModerationResult: string(moderationJSON),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("create presentation question")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to submit question")
		return
	}
	if err := m.store.IncrementSessionQuestionCount(r.Context(), store.IncrementSessionQuestionCountParams{ID: sessionID, BusinessID: access.BusinessID}); err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("increment session question count")
	}

	if !moderation.Allowed {
		httpx.JSON(w, http.StatusCreated, toQuestionOut(q))
		return
	}

	if err := m.store.SetSessionStatus(r.Context(), store.SetSessionStatusParams{ID: sessionID, BusinessID: access.BusinessID, Status: sessionThinking}); err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("set session status thinking")
	}

	embeddings, err := m.store.ListPresentationEmbeddings(r.Context(), session.PresentationID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("list embeddings for question")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to answer question")
		return
	}

	answer, sources := m.answerPresentationQuestion(r.Context(), presentation.Language, question, embeddings)
	sourcesJSON, _ := json.Marshal(sources)

	answered, err := m.store.AnswerPresentationQuestion(r.Context(), store.AnswerPresentationQuestionParams{
		ID: q.ID, Answer: answer, SourceReferences: string(sourcesJSON),
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("question_id", q.ID).Msg("persist question answer")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to answer question")
		return
	}

	if err := m.store.SetSessionStatus(r.Context(), store.SetSessionStatusParams{ID: sessionID, BusinessID: access.BusinessID, Status: sessionAnswering}); err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("set session status answering")
	}

	httpx.JSON(w, http.StatusCreated, toQuestionOut(answered))
}
