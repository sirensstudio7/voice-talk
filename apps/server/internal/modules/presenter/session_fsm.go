package presenter

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// Session status values — ports SESSION_STATUSES from
// presentation-session.ts exactly.
const (
	sessionInitializing = "initializing"
	sessionGreeting     = "greeting"
	sessionPresenting   = "presenting"
	sessionPaused       = "paused"
	sessionClosing      = "closing"
	sessionQnaWaiting   = "qna_waiting"
	sessionThinking     = "thinking"
	sessionAnswering    = "answering"
	sessionCompleted    = "completed"
)

var errInvalidAction = errors.New("invalid action")

// advanceSession is a 1:1 port of presentation-session.ts's advanceSession
// state machine — same nine statuses, same transition rules per action.
// "next" and "finish_stage" are legacy-identical actions (the TS handler
// treats them as the same branch); accepted as separate strings here for
// client compatibility but routed through one internal transition.
func (m *Module) advanceSession(ctx context.Context, businessID string, session store.PresentationSession, slides []store.PresentationSlide, action string) (store.PresentationSession, error) {
	switch action {
	case "start":
		if err := m.store.SetPresentationLive(ctx, store.SetPresentationLiveParams{ID: session.PresentationID, BusinessID: businessID}); err != nil {
			return store.PresentationSession{}, err
		}
		return m.setSessionState(ctx, businessID, session, sessionGreeting, 0, true, false)

	case "pause":
		if session.Status == sessionPresenting || session.Status == sessionGreeting {
			return m.setSessionState(ctx, businessID, session, sessionPaused, session.CurrentSlideNumber, false, false)
		}
		return session, nil

	case "resume":
		if session.Status != sessionPaused {
			return session, nil
		}
		next := sessionGreeting
		if session.CurrentSlideNumber > 0 {
			next = sessionPresenting
		}
		return m.setSessionState(ctx, businessID, session, next, session.CurrentSlideNumber, false, false)

	case "next", "finish_stage":
		return m.advanceStage(ctx, businessID, session, slides)

	case "previous":
		if session.Status != sessionPresenting && session.Status != sessionPaused {
			return session, nil
		}
		idx := slideIndex(slides, session.CurrentSlideNumber)
		if idx <= 0 {
			return m.setSessionState(ctx, businessID, session, sessionGreeting, 0, false, false)
		}
		return m.setSessionState(ctx, businessID, session, sessionPresenting, slides[idx-1].SlideNumber, false, false)

	case "end":
		if err := m.store.CompletePresentation(ctx, store.CompletePresentationParams{ID: session.PresentationID, BusinessID: businessID}); err != nil {
			return store.PresentationSession{}, err
		}
		return m.setSessionState(ctx, businessID, session, sessionCompleted, session.CurrentSlideNumber, false, true)

	default:
		return store.PresentationSession{}, errInvalidAction
	}
}

func (m *Module) advanceStage(ctx context.Context, businessID string, session store.PresentationSession, slides []store.PresentationSlide) (store.PresentationSession, error) {
	switch session.Status {
	case sessionGreeting:
		first := int32(1)
		if len(slides) > 0 {
			first = slides[0].SlideNumber
		}
		return m.setSessionState(ctx, businessID, session, sessionPresenting, first, false, false)

	case sessionPresenting, sessionPaused:
		idx := slideIndex(slides, session.CurrentSlideNumber)
		if idx >= 0 && idx+1 < len(slides) {
			return m.setSessionState(ctx, businessID, session, sessionPresenting, slides[idx+1].SlideNumber, false, false)
		}
		return m.setSessionState(ctx, businessID, session, sessionClosing, session.CurrentSlideNumber, false, false)

	case sessionClosing:
		if session.EnableQna {
			return m.setSessionState(ctx, businessID, session, sessionQnaWaiting, session.CurrentSlideNumber, false, false)
		}
		if err := m.store.CompletePresentation(ctx, store.CompletePresentationParams{ID: session.PresentationID, BusinessID: businessID}); err != nil {
			return store.PresentationSession{}, err
		}
		return m.setSessionState(ctx, businessID, session, sessionCompleted, session.CurrentSlideNumber, false, true)

	case sessionAnswering, sessionThinking:
		return m.setSessionState(ctx, businessID, session, sessionQnaWaiting, session.CurrentSlideNumber, false, false)

	default:
		return session, nil
	}
}

func slideIndex(slides []store.PresentationSlide, slideNumber int32) int {
	for i, s := range slides {
		if s.SlideNumber == slideNumber {
			return i
		}
	}
	return -1
}

func (m *Module) setSessionState(ctx context.Context, businessID string, session store.PresentationSession, status string, slideNumber int32, setStarted, setEnded bool) (store.PresentationSession, error) {
	params := store.UpdateSessionStateParams{
		ID:                 session.ID,
		BusinessID:         businessID,
		Status:             status,
		CurrentSlideNumber: slideNumber,
	}
	if setStarted {
		params.StartedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}
	if setEnded {
		params.EndedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}
	return m.store.UpdateSessionState(ctx, params)
}
