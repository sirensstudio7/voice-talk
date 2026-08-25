package presenter

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/storage"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

const testJWTSecret = "test-secret"

type fixture struct {
	handler http.Handler
	slug    string
	token   string
	store   *store.Queries
	pool    *pgxpool.Pool
}

// newTestFixture is DATABASE_URL-gated only (same convention as every
// other module) and builds the module WITHOUT storage — sufficient for
// presentation/knowledge CRUD and, since session/Q&A tests seed slides
// directly via store calls rather than a real upload+pipeline run, for
// the session state-machine and Q&A tests too.
func newTestFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping presenter integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "presenter-" + userID[:8] + "@example.com",
		PasswordHash: "unused", Name: "Presenter Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug := "presenter-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Presenter Test Business",
	}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	if _, err := queries.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{
		ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner",
	}); err != nil {
		t.Fatalf("create fixture membership: %v", err)
	}

	token, err := authtoken.Issue(testJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	m := New(Deps{DB: pool, JWTSecret: testJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return fixture{handler: r, slug: slug, token: token, store: queries, pool: pool}
}

func (f fixture) close() { f.pool.Close() }

func doJSON(t *testing.T, f fixture, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.token)
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec
}

func mustDecode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode response: %v (body: %s)", err, rec.Body.String())
	}
	return v
}

func TestPresentations_CRUD(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	base := "/businesses/" + f.slug + "/presentations"

	rec := doJSON(t, f, http.MethodPost, base, createPresentationRequest{Title: "Q1 Kickoff", Language: "en"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create presentation: got status %d, body %s", rec.Code, rec.Body.String())
	}
	created := mustDecode[presentationOut](t, rec)
	if created.Status != "draft" || created.Title != "Q1 Kickoff" {
		t.Fatalf("unexpected created presentation: %+v", created)
	}

	rec = doJSON(t, f, http.MethodGet, base, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list presentations: got status %d", rec.Code)
	}
	list := mustDecode[struct {
		Items []presentationOut `json:"items"`
	}](t, rec)
	if len(list.Items) != 1 {
		t.Fatalf("expected 1 presentation, got %d", len(list.Items))
	}

	newTitle := "Q1 Kickoff (revised)"
	rec = doJSON(t, f, http.MethodPatch, base+"/"+created.ID, updatePresentationRequest{Title: &newTitle})
	if rec.Code != http.StatusOK {
		t.Fatalf("update presentation: got status %d, body %s", rec.Code, rec.Body.String())
	}
	updated := mustDecode[presentationOut](t, rec)
	if updated.Title != newTitle {
		t.Fatalf("expected updated title, got %+v", updated)
	}

	rec = doJSON(t, f, http.MethodDelete, base+"/"+created.ID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete presentation: got status %d", rec.Code)
	}
	rec = doJSON(t, f, http.MethodGet, base+"/"+created.ID, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected soft-deleted presentation to 404, got %d", rec.Code)
	}
}

func TestPresentationKnowledge_CRUD(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doJSON(t, f, http.MethodPost, "/businesses/"+f.slug+"/presentations", createPresentationRequest{Title: "Deck"})
	presentation := mustDecode[presentationOut](t, rec)
	base := "/businesses/" + f.slug + "/presentations/" + presentation.ID + "/knowledge"

	rec = doJSON(t, f, http.MethodPost, base, createKnowledgeRequest{Title: "Delivery style", Content: "Speak with high energy."})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create knowledge: got status %d, body %s", rec.Code, rec.Body.String())
	}
	entry := mustDecode[knowledgeOut](t, rec)

	newContent := "Speak with calm, measured energy."
	rec = doJSON(t, f, http.MethodPatch, base+"/"+entry.ID, updateKnowledgeRequest{Content: &newContent})
	if rec.Code != http.StatusOK {
		t.Fatalf("update knowledge: got status %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, f, http.MethodDelete, base+"/"+entry.ID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete knowledge: got status %d", rec.Code)
	}
}

// newSecondBusiness creates a second, independent owner+business against
// the same fixture's DB/router — used to verify cross-tenant requests are
// rejected rather than silently trusting a path-supplied presentation id.
func newSecondBusiness(t *testing.T, f fixture) (slug, token string) {
	t.Helper()
	ctx := context.Background()

	userID := uuid.NewString()
	if _, err := f.store.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "presenter-b-" + userID[:8] + "@example.com", PasswordHash: "unused", Name: "Other Owner",
	}); err != nil {
		t.Fatalf("create second fixture user: %v", err)
	}
	businessID := uuid.NewString()
	slug = "presenter-test-b-" + businessID[:8]
	if _, err := f.store.CreateBusiness(ctx, store.CreateBusinessParams{ID: businessID, Slug: slug, Name: "Other Business"}); err != nil {
		t.Fatalf("create second fixture business: %v", err)
	}
	if _, err := f.store.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{
		ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner",
	}); err != nil {
		t.Fatalf("create second fixture membership: %v", err)
	}
	token, err := authtoken.Issue(testJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue second fixture token: %v", err)
	}
	return slug, token
}

// TestPresenterKnowledge_CrossTenantRejected locks in the fix for an IDOR
// where knowledge/process/cancel handlers trusted the {id} path param
// without confirming the presentation belonged to the caller's own
// business — see requirePresentationAccess in handler_presentations.go.
func TestPresenterKnowledge_CrossTenantRejected(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doJSON(t, f, http.MethodPost, "/businesses/"+f.slug+"/presentations", createPresentationRequest{Title: "Owner's Deck"})
	presentation := mustDecode[presentationOut](t, rec)

	otherSlug, otherToken := newSecondBusiness(t, f)
	attacker := fixture{handler: f.handler, slug: otherSlug, token: otherToken, store: f.store, pool: f.pool}

	knowledgeBase := "/businesses/" + otherSlug + "/presentations/" + presentation.ID + "/knowledge"
	if rec := doJSON(t, attacker, http.MethodGet, knowledgeBase, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant list knowledge: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, attacker, http.MethodPost, knowledgeBase, createKnowledgeRequest{Title: "x", Content: "y"}); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant create knowledge: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, attacker, http.MethodPatch, knowledgeBase+"/"+uuid.NewString(), updateKnowledgeRequest{}); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant update knowledge: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, attacker, http.MethodDelete, knowledgeBase+"/"+uuid.NewString(), nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant delete knowledge: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}

	processBase := "/businesses/" + otherSlug + "/presentations/" + presentation.ID
	if rec := doJSON(t, attacker, http.MethodPost, processBase+"/process", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant process: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, attacker, http.MethodPost, processBase+"/process/cancel", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant cancel: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, attacker, http.MethodPost, processBase+"/regenerate-scripts", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant regenerate-scripts: expected 404, got %d, body %s", rec.Code, rec.Body.String())
	}

	// The real owner can still read their own presentation's knowledge —
	// confirms the fix didn't over-restrict legitimate access.
	if rec := doJSON(t, f, http.MethodGet, "/businesses/"+f.slug+"/presentations/"+presentation.ID+"/knowledge", nil); rec.Code != http.StatusOK {
		t.Fatalf("owner list knowledge: expected 200, got %d, body %s", rec.Code, rec.Body.String())
	}
}

// seedReadyPresentation drives a presentation straight to "ready" with two
// slides, bypassing upload+the pipeline entirely (store calls only) — this
// lets the session state-machine and Q&A tests run without R2 storage
// configured, which this environment doesn't have (see the pipeline test
// below, which is additionally gated on real R2 credentials).
func seedReadyPresentation(t *testing.T, f fixture, businessID string) store.Presentation {
	t.Helper()
	ctx := context.Background()

	p, err := f.store.CreatePresentation(ctx, store.CreatePresentationParams{
		ID: uuid.NewString(), BusinessID: businessID, Title: "Seeded Deck", Language: "en",
	})
	if err != nil {
		t.Fatalf("seed presentation: %v", err)
	}

	for i, txt := range []string{"Welcome to the product tour", "Pricing starts at $10 per month"} {
		script := buildTalkingPointsFromSlide(fmt.Sprintf("Slide %d", i+1), []string{txt}, "")
		if _, err := f.store.CreatePresentationSlide(ctx, store.CreatePresentationSlideParams{
			ID: uuid.NewString(), PresentationID: p.ID, SlideNumber: int32(i + 1),
			Title: fmt.Sprintf("Slide %d", i+1), ContentJson: fmt.Sprintf(`{"texts":[%q]}`, txt),
			Script: script, DurationSeconds: estimateScriptDurationSeconds(script),
		}); err != nil {
			t.Fatalf("seed slide: %v", err)
		}
	}

	if err := f.store.CompletePresentationProcessing(ctx, store.CompletePresentationProcessingParams{
		ID: p.ID, BusinessID: businessID, GreetingScript: "Hello!", ClosingScript: "Thanks!",
		EstimatedDuration: 20, TotalSlides: 2,
	}); err != nil {
		t.Fatalf("mark presentation ready: %v", err)
	}

	p, err = f.store.GetPresentation(ctx, store.GetPresentationParams{ID: p.ID, BusinessID: businessID})
	if err != nil {
		t.Fatalf("reload presentation: %v", err)
	}
	return p
}

func businessIDForSlug(t *testing.T, f fixture) string {
	t.Helper()
	b, err := f.store.GetBusinessBySlug(context.Background(), f.slug)
	if err != nil {
		t.Fatalf("get business by slug: %v", err)
	}
	return b.ID
}

func TestPresenterSession_StateMachineAndQnA(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	businessID := businessIDForSlug(t, f)
	presentation := seedReadyPresentation(t, f, businessID)

	sessionsBase := "/businesses/" + f.slug + "/presentations/" + presentation.ID + "/sessions"
	rec := doJSON(t, f, http.MethodPost, sessionsBase, createSessionRequest{Name: "Live demo"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create session: got status %d, body %s", rec.Code, rec.Body.String())
	}
	session := mustDecode[sessionOut](t, rec)
	if session.Status != sessionGreeting || session.StartedAt == nil {
		t.Fatalf("expected auto-started session in greeting, got %+v", session)
	}

	controlBase := "/businesses/" + f.slug + "/sessions/" + session.ID + "/control"

	rec = doJSON(t, f, http.MethodPost, controlBase, controlSessionRequest{Action: "next"})
	session = mustDecode[sessionOut](t, rec)
	if session.Status != sessionPresenting || session.CurrentSlideNumber != 1 {
		t.Fatalf("expected presenting slide 1, got %+v", session)
	}

	rec = doJSON(t, f, http.MethodPost, controlBase, controlSessionRequest{Action: "next"})
	session = mustDecode[sessionOut](t, rec)
	if session.Status != sessionPresenting || session.CurrentSlideNumber != 2 {
		t.Fatalf("expected presenting slide 2, got %+v", session)
	}

	rec = doJSON(t, f, http.MethodPost, controlBase, controlSessionRequest{Action: "next"})
	session = mustDecode[sessionOut](t, rec)
	if session.Status != sessionClosing {
		t.Fatalf("expected closing after last slide, got %+v", session)
	}

	rec = doJSON(t, f, http.MethodPost, controlBase, controlSessionRequest{Action: "next"})
	session = mustDecode[sessionOut](t, rec)
	if session.Status != sessionQnaWaiting {
		t.Fatalf("expected qna_waiting (enable_qna defaults true), got %+v", session)
	}

	// Submit a question that should hit the seeded pricing slide via the
	// keyword-fallback answer path (no GEMINI_API_KEY in this environment).
	questionsBase := "/businesses/" + f.slug + "/sessions/" + session.ID + "/questions"
	rec = doJSON(t, f, http.MethodPost, questionsBase, submitQuestionRequest{Question: "How much does pricing cost?"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit question: got status %d, body %s", rec.Code, rec.Body.String())
	}
	q := mustDecode[questionOut](t, rec)
	if q.Status != "answered" || q.Answer == "" {
		t.Fatalf("expected answered question, got %+v", q)
	}

	// A blocked (profane) question is recorded but never reaches an LLM.
	rec = doJSON(t, f, http.MethodPost, questionsBase, submitQuestionRequest{Question: "This is bullshit, fuck this"})
	blocked := mustDecode[questionOut](t, rec)
	if blocked.Status != "blocked" || blocked.Answer != "" {
		t.Fatalf("expected blocked question with no answer, got %+v", blocked)
	}

	rec = doJSON(t, f, http.MethodPost, controlBase, controlSessionRequest{Action: "end"})
	session = mustDecode[sessionOut](t, rec)
	if session.Status != sessionCompleted || session.EndedAt == nil {
		t.Fatalf("expected completed session, got %+v", session)
	}

	// Submitting a question after completion is rejected — the Phase 1
	// plan's deliberate fix for a redundant/buggy legacy guard clause.
	rec = doJSON(t, f, http.MethodPost, questionsBase, submitQuestionRequest{Question: "Anything else?"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected question on completed session to be rejected, got status %d", rec.Code)
	}

	analyticsRec := doJSON(t, f, http.MethodGet, "/businesses/"+f.slug+"/sessions/"+session.ID+"/analytics", nil)
	analytics := mustDecode[analyticsOut](t, analyticsRec)
	if analytics.CompletionRate != 100 || analytics.AnsweredCount != 1 || analytics.BlockedCount != 1 {
		t.Fatalf("unexpected analytics: %+v", analytics)
	}
}

// TestPresenterPipeline_UploadToReady exercises the real upload -> process
// -> ready pipeline against a synthetically-built .pptx, end to end. It's
// additionally gated on real R2 credentials (this dev environment has
// none configured — R2_ACCOUNT_ID is empty in .env) since the module's
// storage.Client has no in-memory fake; every other presenter behavior
// (CRUD, the session state machine, Q&A) is verified without needing
// storage, by seeding slides directly — see the tests above.
func TestPresenterPipeline_UploadToReady(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping presenter integration test")
	}
	if os.Getenv("R2_ACCOUNT_ID") == "" || os.Getenv("R2_BUCKET") == "" {
		t.Skip("R2 credentials not set; skipping presenter pipeline upload test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()
	queries := store.New(pool)

	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "presenter-pipe-" + userID[:8] + "@example.com", PasswordHash: "unused", Name: "Pipeline Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}
	businessID := uuid.NewString()
	slug := "presenter-pipe-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{ID: businessID, Slug: slug, Name: "Pipeline Test Business"}); err != nil {
		t.Fatalf("create fixture business: %v", err)
	}
	if _, err := queries.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner"}); err != nil {
		t.Fatalf("create fixture membership: %v", err)
	}
	token, err := authtoken.Issue(testJWTSecret, userID, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	storageClient, err := storage.New(ctx, &config.Config{
		R2AccountID: os.Getenv("R2_ACCOUNT_ID"), R2AccessKeyID: os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"), R2Bucket: os.Getenv("R2_BUCKET"),
	})
	if err != nil {
		t.Fatalf("construct storage client: %v", err)
	}

	m := New(Deps{DB: pool, Storage: storageClient, JWTSecret: testJWTSecret})
	router := chi.NewRouter()
	m.RegisterRoutes(router)
	f := fixture{handler: router, slug: slug, token: token, store: queries, pool: pool}

	rec := doJSON(t, f, http.MethodPost, "/businesses/"+slug+"/presentations", createPresentationRequest{Title: "Uploaded Deck"})
	presentation := mustDecode[presentationOut](t, rec)

	pptxBytes := buildFixturePptx(t)
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", "deck.pptx")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(pptxBytes); err != nil {
		t.Fatalf("write pptx bytes: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	uploadReq := httptest.NewRequest(http.MethodPost, "/businesses/"+slug+"/presentations/"+presentation.ID+"/files", &body)
	uploadReq.Header.Set("Content-Type", mw.FormDataContentType())
	uploadReq.Header.Set("Authorization", "Bearer "+token)
	uploadRec := httptest.NewRecorder()
	f.handler.ServeHTTP(uploadRec, uploadReq)
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload file: got status %d, body %s", uploadRec.Code, uploadRec.Body.String())
	}

	rec = doJSON(t, f, http.MethodPost, "/businesses/"+slug+"/presentations/"+presentation.ID+"/process", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("start processing: got status %d, body %s", rec.Code, rec.Body.String())
	}

	deadline := time.Now().Add(20 * time.Second)
	var final presentationOut
	for time.Now().Before(deadline) {
		rec = doJSON(t, f, http.MethodGet, "/businesses/"+slug+"/presentations/"+presentation.ID, nil)
		detail := mustDecode[presentationDetailOut](t, rec)
		final = detail.presentationOut
		if final.Status == "ready" || final.Status == "failed" {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}
	if final.Status != "ready" {
		t.Fatalf("expected presentation to reach ready, got status=%s error=%s", final.Status, final.ProcessingError)
	}
	if final.TotalSlides != 2 {
		t.Fatalf("expected 2 parsed slides, got %d", final.TotalSlides)
	}
}

// buildFixturePptx constructs a minimal in-memory .pptx (a zip with two
// ppt/slides/slideN.xml entries carrying <a:t> text runs) — enough for
// parsePptxBuffer's regex scraper, no real PowerPoint file needed.
func buildFixturePptx(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	slides := map[string]string{
		"ppt/slides/slide1.xml": `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>` +
			`<a:p><a:r><a:t>Welcome to the product tour</a:t></a:r></a:p>` +
			`</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
		"ppt/slides/slide2.xml": `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>` +
			`<a:p><a:r><a:t>Pricing starts at $10 per month</a:t></a:r></a:p>` +
			`</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
	}
	for name, content := range slides {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %s: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer: %v", err)
	}
	return buf.Bytes()
}
