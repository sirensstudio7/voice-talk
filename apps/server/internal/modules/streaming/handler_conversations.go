package streaming

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/transcript"
)

type conversationListItemOut struct {
	ID              string   `json:"id"`
	Status          string   `json:"status"`
	StartedAt       string   `json:"started_at"`
	EndedAt         *string  `json:"ended_at"`
	EndReason       *string  `json:"end_reason"`
	DurationSeconds *int64   `json:"duration_seconds"`
	MessageCount    int      `json:"message_count"`
	OrderID         *string  `json:"order_id"`
	OrderTotal      *float64 `json:"order_total"`
}

type transcriptMessageOut struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Text      string `json:"text"`
	CreatedAt string `json:"created_at"`
}

type conversationDetailOut struct {
	conversationListItemOut
	Messages []transcriptMessageOut `json:"messages"`
}

func sessionDuration(s store.VoiceSession) *int64 {
	if !s.EndedAt.Valid {
		return nil
	}
	d := int64(s.EndedAt.Time.Sub(s.StartedAt.Time).Seconds())
	return &d
}

// parseDateRangeFilter ports admin.ts's parseDateFilter — a UTC calendar
// day shifted by a client-supplied timezone offset in minutes.
func parseDateRangeFilter(r *http.Request) (start, end time.Time, ok bool, err error) {
	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		return time.Time{}, time.Time{}, false, nil
	}
	day, perr := time.Parse("2006-01-02", dateStr)
	if perr != nil {
		return time.Time{}, time.Time{}, false, errors.New("invalid date format, use YYYY-MM-DD")
	}
	tzOffsetMin := 0
	if v := r.URL.Query().Get("tz_offset"); v != "" {
		if parsed, perr := strconv.Atoi(v); perr == nil {
			tzOffsetMin = parsed
		}
	}
	start = day.Add(time.Duration(tzOffsetMin) * time.Minute)
	end = start.Add(24 * time.Hour)
	return start, end, true, nil
}

func toConversationListItemOut(s store.VoiceSession, messageCount int, order *store.Order) conversationListItemOut {
	out := conversationListItemOut{
		ID: s.ID, Status: s.Status, StartedAt: s.StartedAt.Time.UTC().Format(time.RFC3339),
		MessageCount: messageCount,
	}
	if s.EndedAt.Valid {
		v := s.EndedAt.Time.UTC().Format(time.RFC3339)
		out.EndedAt = &v
	}
	if s.EndReason.Valid {
		out.EndReason = &s.EndReason.String
	}
	out.DurationSeconds = sessionDuration(s)
	if order != nil {
		out.OrderID = &order.ID
		total := order.Total
		out.OrderTotal = &total
	}
	return out
}

// listConversations ports admin.ts's GET /admin/businesses/:businessId/conversations.
func (m *Module) listConversations(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	sessions, err := m.store.ListVoiceSessionsForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list voice sessions")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversations")
		return
	}

	start, end, filtered, ferr := parseDateRangeFilter(r)
	if ferr != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", ferr.Error())
		return
	}
	if filtered {
		out := sessions[:0]
		for _, s := range sessions {
			ts := s.StartedAt.Time
			if !ts.Before(start) && ts.Before(end) {
				out = append(out, s)
			}
		}
		sessions = out
	}

	sessionIDs := make([]string, len(sessions))
	for i, s := range sessions {
		sessionIDs[i] = s.ID
	}

	messageCounts := map[string]int{}
	orderBySession := map[string]store.Order{}
	if len(sessionIDs) > 0 {
		counts, err := m.store.CountTranscriptMessagesForSessions(r.Context(), sessionIDs)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversations")
			return
		}
		for _, c := range counts {
			messageCounts[c.VoiceSessionID] = int(c.MessageCount)
		}
		orders, err := m.store.ListOrdersForVoiceSessions(r.Context(), sessionIDs)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversations")
			return
		}
		for _, o := range orders {
			if o.VoiceSessionID.Valid {
				if _, exists := orderBySession[o.VoiceSessionID.String]; !exists {
					orderBySession[o.VoiceSessionID.String] = o
				}
			}
		}
	}

	out := make([]conversationListItemOut, 0, len(sessions))
	for _, s := range sessions {
		var orderPtr *store.Order
		if o, ok := orderBySession[s.ID]; ok {
			orderPtr = &o
		}
		out = append(out, toConversationListItemOut(s, messageCounts[s.ID], orderPtr))
	}
	httpx.List(w, http.StatusOK, out)
}

func toMergedMessagesOut(rows []store.TranscriptMessage) []transcriptMessageOut {
	type withMsg struct {
		row  store.TranscriptMessage
		text string
	}
	items := make([]withMsg, len(rows))
	for i, row := range rows {
		items[i] = withMsg{row: row, text: row.Text}
	}
	merged := transcript.MergeMessages(items,
		func(w withMsg) transcript.Message { return transcript.Message{Role: w.row.Role, Text: w.text} },
		func(w withMsg, text string) withMsg { w.text = text; return w },
	)
	out := make([]transcriptMessageOut, len(merged))
	for i, m := range merged {
		out[i] = transcriptMessageOut{
			ID: m.row.ID, Role: m.row.Role, Text: m.text,
			CreatedAt: m.row.CreatedAt.Time.UTC().Format(time.RFC3339),
		}
	}
	return out
}

func buildConversationDetail(s store.VoiceSession, messages []store.TranscriptMessage, order *store.Order) conversationDetailOut {
	mergedMessages := toMergedMessagesOut(messages)
	item := toConversationListItemOut(s, len(mergedMessages), order)
	return conversationDetailOut{conversationListItemOut: item, Messages: mergedMessages}
}

// getConversation ports admin.ts's GET
// /admin/businesses/:businessId/conversations/:sessionId.
func (m *Module) getConversation(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionId")

	session, err := m.store.GetVoiceSession(r.Context(), store.GetVoiceSessionParams{ID: sessionID, BusinessID: access.BusinessID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "conversation_not_found", "conversation not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversation")
		return
	}

	messages, err := m.store.ListTranscriptMessagesForSession(r.Context(), sessionID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversation")
		return
	}

	orders, err := m.store.ListOrdersForVoiceSessions(r.Context(), []string{sessionID})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load conversation")
		return
	}
	var orderPtr *store.Order
	if len(orders) > 0 {
		orderPtr = &orders[0]
	}

	httpx.JSON(w, http.StatusOK, buildConversationDetail(session, messages, orderPtr))
}

// exportConversations ports admin.ts's GET
// /admin/businesses/:businessId/conversations/export — full transcripts
// for every session in range (or the last 200), for an owner to download.
func (m *Module) exportConversations(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	sessions, err := m.store.ListVoiceSessionsForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to export conversations")
		return
	}

	start, end, filtered, ferr := parseDateRangeFilter(r)
	if ferr != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", ferr.Error())
		return
	}
	if filtered {
		out := sessions[:0]
		for _, s := range sessions {
			ts := s.StartedAt.Time
			if !ts.Before(start) && ts.Before(end) {
				out = append(out, s)
			}
		}
		sessions = out
	}

	if len(sessions) == 0 {
		httpx.JSON(w, http.StatusOK, []conversationDetailOut{})
		return
	}

	sessionIDs := make([]string, len(sessions))
	for i, s := range sessions {
		sessionIDs[i] = s.ID
	}

	messages, err := m.store.ListTranscriptMessagesForSessions(r.Context(), sessionIDs)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to export conversations")
		return
	}
	messagesBySession := map[string][]store.TranscriptMessage{}
	for _, msg := range messages {
		messagesBySession[msg.VoiceSessionID] = append(messagesBySession[msg.VoiceSessionID], msg)
	}

	orders, err := m.store.ListOrdersForVoiceSessions(r.Context(), sessionIDs)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to export conversations")
		return
	}
	orderBySession := map[string]store.Order{}
	for _, o := range orders {
		if o.VoiceSessionID.Valid {
			if _, exists := orderBySession[o.VoiceSessionID.String]; !exists {
				orderBySession[o.VoiceSessionID.String] = o
			}
		}
	}

	out := make([]conversationDetailOut, 0, len(sessions))
	for _, s := range sessions {
		var orderPtr *store.Order
		if o, ok := orderBySession[s.ID]; ok {
			orderPtr = &o
		}
		out = append(out, buildConversationDetail(s, messagesBySession[s.ID], orderPtr))
	}
	httpx.JSON(w, http.StatusOK, out)
}
