package presenter

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

var validControlActions = map[string]bool{
	"start": true, "pause": true, "resume": true, "next": true,
	"previous": true, "end": true, "finish_stage": true,
}

func (m *Module) createPresentationSession(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	presentationID := chi.URLParam(r, "id")

	presentation, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: presentationID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "presentation_not_found", "presentation not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("get presentation for session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create session")
		return
	}
	if presentation.Status != "ready" && presentation.Status != "completed" {
		httpx.Error(w, http.StatusBadRequest, "presentation_not_ready", "presentation must be ready before launching a session")
		return
	}

	var req createSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	enableQna := req.EnableQna == nil || *req.EnableQna
	autoStart := req.AutoStart == nil || *req.AutoStart

	session, err := m.store.CreatePresentationSession(r.Context(), store.CreatePresentationSessionParams{
		ID: uuid.NewString(), PresentationID: presentationID, BusinessID: access.BusinessID,
		Name: req.Name, EnableQna: enableQna, AutoStart: autoStart,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("create presentation session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create session")
		return
	}

	if autoStart {
		slides, err := m.store.ListPresentationSlides(r.Context(), presentationID)
		if err != nil {
			m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("list slides for session autostart")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start session")
			return
		}
		session, err = m.advanceSession(r.Context(), access.BusinessID, session, slides, "start")
		if err != nil {
			m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("autostart session")
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to start session")
			return
		}
	}

	httpx.JSON(w, http.StatusCreated, toSessionOut(session))
}

func (m *Module) listPresentationSessions(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	rows, err := m.store.ListPresentationSessionsForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list presentation sessions")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load sessions")
		return
	}

	out := make([]sessionOut, 0, len(rows))
	for _, s := range rows {
		out = append(out, toSessionOut(s))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) getPresentationSession(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	session, err := m.store.GetPresentationSession(r.Context(), store.GetPresentationSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("get presentation session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load session")
		return
	}

	presentation, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: session.PresentationID, BusinessID: access.BusinessID})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("get presentation for session detail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load session")
		return
	}
	slides, err := m.store.ListPresentationSlides(r.Context(), session.PresentationID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("list slides for session detail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load session")
		return
	}
	questions, err := m.store.ListPresentationQuestions(r.Context(), session.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("list questions for session detail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load session")
		return
	}
	files, err := m.store.ListPresentationFiles(r.Context(), session.PresentationID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("list files for session detail")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load session")
		return
	}

	var pptxURL *string
	for _, f := range files {
		if f.FileType == "pptx" {
			path := f.StoragePath
			pptxURL = &path
			break
		}
	}

	slideOuts := make([]slideOut, 0, len(slides))
	for _, s := range slides {
		slideOuts = append(slideOuts, toSlideOut(s))
	}
	questionOuts := make([]questionOut, 0, len(questions))
	for _, q := range questions {
		questionOuts = append(questionOuts, toQuestionOut(q))
	}

	httpx.JSON(w, http.StatusOK, sessionDetailOut{
		Session:      toSessionOut(session),
		Presentation: toPresentationOut(presentation),
		Slides:       slideOuts,
		Questions:    questionOuts,
		PptxURL:      pptxURL,
	})
}

func (m *Module) controlPresentationSession(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	var req controlSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	if !validControlActions[req.Action] {
		httpx.Error(w, http.StatusBadRequest, "invalid_action", "invalid action")
		return
	}

	session, err := m.store.GetPresentationSession(r.Context(), store.GetPresentationSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("get session for control")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to control session")
		return
	}

	slides, err := m.store.ListPresentationSlides(r.Context(), session.PresentationID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("list slides for session control")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to control session")
		return
	}

	updated, err := m.advanceSession(r.Context(), access.BusinessID, session, slides, req.Action)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Str("action", req.Action).Msg("advance session")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to control session")
		return
	}

	httpx.JSON(w, http.StatusOK, toSessionOut(updated))
}

func (m *Module) getSessionAnalytics(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	session, err := m.store.GetPresentationSession(r.Context(), store.GetPresentationSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("get session for analytics")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load analytics")
		return
	}
	presentation, err := m.store.GetPresentation(r.Context(), store.GetPresentationParams{ID: session.PresentationID, BusinessID: access.BusinessID})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("presentation_id", session.PresentationID).Msg("get presentation for analytics")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load analytics")
		return
	}
	questions, err := m.store.ListPresentationQuestions(r.Context(), session.ID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("session_id", session.ID).Msg("list questions for analytics")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load analytics")
		return
	}

	start := session.CreatedAt.Time
	if session.StartedAt.Valid {
		start = session.StartedAt.Time
	}
	end := time.Now().UTC()
	if session.EndedAt.Valid {
		end = session.EndedAt.Time
	}
	durationSeconds := int64(end.Sub(start).Seconds())
	if durationSeconds < 0 {
		durationSeconds = 0
	}

	answered, blocked := 0, 0
	for _, q := range questions {
		switch q.Status {
		case "answered":
			answered++
		case "blocked":
			blocked++
		}
	}

	completionRate := 0
	if session.Status == sessionCompleted {
		completionRate = 100
	} else if presentation.TotalSlides > 0 {
		completionRate = int(float64(session.CurrentSlideNumber) / float64(presentation.TotalSlides) * 100)
		if completionRate > 99 {
			completionRate = 99
		}
	}

	httpx.JSON(w, http.StatusOK, analyticsOut{
		SessionDurationSeconds: durationSeconds,
		AnsweredCount:          answered,
		BlockedCount:           blocked,
		CompletionRate:         completionRate,
		TotalSlides:            presentation.TotalSlides,
		CurrentSlideNumber:     session.CurrentSlideNumber,
	})
}

func (m *Module) updateSessionAudienceCount(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	var req audienceCountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	count := req.AudienceCount
	if count < 0 {
		count = 0
	}

	session, err := m.store.UpdateSessionAudienceCount(r.Context(), store.UpdateSessionAudienceCountParams{
		ID: sessionID, BusinessID: access.BusinessID, AudienceCount: count,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "session not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("session_id", sessionID).Msg("update session audience count")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update audience count")
		return
	}

	httpx.JSON(w, http.StatusOK, toSessionOut(session))
}
