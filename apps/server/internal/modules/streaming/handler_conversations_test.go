package streaming

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/events"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const conversationsTestJWTSecret = "test-secret"

type authedFixture struct {
	handler    http.Handler
	slug       string
	businessID string
	token      string
	store      *store.Queries
	pool       *pgxpool.Pool
}

// newAuthedFixture builds a business + owner member + token, for testing
// the REST (non-WS) conversations/stats routes this file adds — separate
// from newTestFixture since those routes need auth and that fixture
// doesn't configure JWTSecret or a member.
func newAuthedFixture(t *testing.T) (f authedFixture, cleanup func()) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping streaming integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	q := store.New(pool)
	userID := uuid.NewString()
	if _, err := q.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "conv-" + userID[:8] + "@example.com", PasswordHash: "unused", Name: "Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug := "conv-test-" + businessID[:8]
	if _, err := q.CreateBusiness(ctx, store.CreateBusinessParams{ID: businessID, Slug: slug, Name: "Conversations Test Biz"}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	if _, err := q.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{
		ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner",
	}); err != nil {
		t.Fatalf("create fixture membership: %v", err)
	}

	token, err := authtoken.Issue(conversationsTestJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	m := New(Deps{DB: pool, Events: events.NewBus(), JWTSecret: conversationsTestJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return authedFixture{handler: r, slug: slug, businessID: businessID, token: token, store: q, pool: pool},
		func() { pool.Close() }
}

func doAuthedJSON(t *testing.T, handler http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestListConversations_EmptyThenAfterVoiceSession(t *testing.T) {
	f, cleanup := newAuthedFixture(t)
	defer cleanup()
	ctx := context.Background()

	rec := doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/conversations", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list conversations: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var empty struct {
		Items []conversationListItemOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &empty); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(empty.Items) != 0 {
		t.Fatalf("expected no conversations yet, got %d", len(empty.Items))
	}

	session, err := f.store.CreateVoiceSession(ctx, store.CreateVoiceSessionParams{ID: uuid.NewString(), BusinessID: f.businessID})
	if err != nil {
		t.Fatalf("create fixture voice session: %v", err)
	}
	if _, err := f.store.CreateTranscriptMessage(ctx, store.CreateTranscriptMessageParams{
		ID: uuid.NewString(), VoiceSessionID: session.ID, Role: "assistant", Text: "Hello there",
	}); err != nil {
		t.Fatalf("create fixture transcript message: %v", err)
	}
	if _, err := f.store.CreateTranscriptMessage(ctx, store.CreateTranscriptMessageParams{
		ID: uuid.NewString(), VoiceSessionID: session.ID, Role: "assistant", Text: "Hello there, welcome!",
	}); err != nil {
		t.Fatalf("create fixture transcript message 2: %v", err)
	}

	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/conversations", f.token, nil)
	var afterCreate struct {
		Items []conversationListItemOut `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &afterCreate); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(afterCreate.Items) != 1 {
		t.Fatalf("expected 1 conversation, got %d", len(afterCreate.Items))
	}
	// The list endpoint's message_count is a raw DB row count (matches
	// legacy exactly — only the detail/export views merge for display).
	if afterCreate.Items[0].MessageCount != 2 {
		t.Fatalf("expected raw message_count=2, got %d", afterCreate.Items[0].MessageCount)
	}

	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/conversations/"+session.ID, f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get conversation: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var detail conversationDetailOut
	if err := json.Unmarshal(rec.Body.Bytes(), &detail); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(detail.Messages) != 1 || detail.Messages[0].Text != "Hello there, welcome!" {
		t.Fatalf("expected merged transcript, got %+v", detail.Messages)
	}

	// Unknown session 404s.
	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/conversations/"+uuid.NewString(), f.token, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown session: got status %d, want 404", rec.Code)
	}

	// Export returns the same session with full transcript.
	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/conversations/export", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("export conversations: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var exported []conversationDetailOut
	if err := json.Unmarshal(rec.Body.Bytes(), &exported); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(exported) != 1 || len(exported[0].Messages) != 1 {
		t.Fatalf("unexpected export shape: %+v", exported)
	}
}

func TestStats_SummaryOverviewDailyTopProducts(t *testing.T) {
	f, cleanup := newAuthedFixture(t)
	defer cleanup()

	rec := doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/stats/summary", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats summary: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var summary struct {
		Overview    statsOverviewOut     `json:"overview"`
		Daily       []statsDailyPointOut `json:"daily"`
		TopProducts []statsTopProductOut `json:"top_products"`
		AIRules     statsAIRulesOut      `json:"ai_rules"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(summary.Daily) != 14 {
		t.Fatalf("expected 14 daily points, got %d", len(summary.Daily))
	}
	if summary.AIRules.ID == "" {
		t.Fatal("expected ai_rules to be lazily seeded")
	}
	if summary.Overview.AvgCallDurationSeconds != nil {
		t.Fatalf("expected nil avg_call_duration_seconds with no ended sessions, got %v", *summary.Overview.AvgCallDurationSeconds)
	}

	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/stats/overview", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats overview: got status %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/stats/daily", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats daily: got status %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doAuthedJSON(t, f.handler, http.MethodGet, "/businesses/"+f.slug+"/stats/top-products", f.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats top-products: got status %d, body %s", rec.Code, rec.Body.String())
	}
	var top []statsTopProductOut
	if err := json.Unmarshal(rec.Body.Bytes(), &top); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(top) != 0 {
		t.Fatalf("expected no top products yet, got %d", len(top))
	}
}
