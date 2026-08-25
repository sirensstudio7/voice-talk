package photomoment

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
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
	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/meter"
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

func (f fixture) close() { f.pool.Close() }

// newTestFixture is DATABASE_URL-gated only, building the module without
// storage — sufficient for settings CRUD and the guest session state
// machine up to (but not including) the photo upload step.
func newTestFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping photomoment integration test")
	}
	return buildFixture(t, dbURL, nil)
}

// newStorageFixture additionally requires R2 credentials — for the parts
// of the flow that touch object storage (photo upload, download, gallery,
// branding).
func newStorageFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping photomoment integration test")
	}
	if os.Getenv("R2_ACCOUNT_ID") == "" || os.Getenv("R2_BUCKET") == "" {
		t.Skip("R2 credentials not set; skipping photomoment storage test")
	}

	ctx := context.Background()
	storageClient, err := storage.New(ctx, &config.Config{
		R2AccountID: os.Getenv("R2_ACCOUNT_ID"), R2AccessKeyID: os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"), R2Bucket: os.Getenv("R2_BUCKET"),
	})
	if err != nil {
		t.Fatalf("construct storage client: %v", err)
	}
	return buildFixture(t, dbURL, storageClient)
}

func buildFixture(t *testing.T, dbURL string, storageClient *storage.Client) fixture {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	queries := store.New(pool)
	slug, token := seedBusiness(ctx, t, queries)

	m := New(Deps{DB: pool, Storage: storageClient, Meter: meter.New(queries), JWTSecret: testJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return fixture{handler: r, slug: slug, token: token, store: queries, pool: pool}
}

func seedBusiness(ctx context.Context, t *testing.T, queries *store.Queries) (slug, token string) {
	t.Helper()
	userID := uuid.NewString()
	if _, err := queries.CreateUser(ctx, store.CreateUserParams{
		ID: userID, Email: "photomoment-" + userID[:8] + "@example.com",
		PasswordHash: "unused", Name: "Photomoment Test Owner",
	}); err != nil {
		t.Fatalf("create fixture user: %v", err)
	}

	businessID := uuid.NewString()
	slug = "photomoment-test-" + businessID[:8]
	if _, err := queries.CreateBusiness(ctx, store.CreateBusinessParams{
		ID: businessID, Slug: slug, Name: "Photomoment Test Business",
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
	return slug, token
}

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

// doPublic issues a request with no Authorization header — the guest
// (kiosk) surface has no auth.
func doPublic(t *testing.T, f fixture, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
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

func fixtureJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 30))
	for y := 0; y < 30; y++ {
		for x := 0; x < 40; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 50, B: 50, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode fixture jpeg: %v", err)
	}
	return buf.Bytes()
}

// enablePhotoMoment flips photo_settings.enabled on via the owner PATCH
// endpoint — every session-lifecycle test needs this first.
func enablePhotoMoment(t *testing.T, f fixture) {
	t.Helper()
	enabled := true
	rec := doJSON(t, f, http.MethodPatch, "/businesses/"+f.slug+"/photo/settings", updateSettingsRequest{Enabled: &enabled})
	if rec.Code != http.StatusOK {
		t.Fatalf("enable photo moment: got status %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestSettings_GetOrCreateThenUpdate(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doJSON(t, f, http.MethodGet, "/businesses/"+f.slug+"/photo/settings", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get settings: got status %d, body %s", rec.Code, rec.Body.String())
	}
	settings := mustDecode[settingsOut](t, rec)
	if settings.Enabled {
		t.Fatalf("expected settings disabled by default, got enabled")
	}
	if settings.CountdownSeconds != 3 || settings.QrExpiryHours != 24 || settings.AutoDeleteDays != 7 {
		t.Fatalf("unexpected defaults: %+v", settings)
	}

	enabled := true
	prompt := "Smile for the camera!"
	campaign := "Grand Opening Week"
	countdown := int32(5)
	rec = doJSON(t, f, http.MethodPatch, "/businesses/"+f.slug+"/photo/settings", updateSettingsRequest{
		Enabled: &enabled, VoicePrompt: &prompt, CampaignText: &campaign, CountdownSeconds: &countdown,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update settings: got status %d, body %s", rec.Code, rec.Body.String())
	}
	updated := mustDecode[settingsOut](t, rec)
	if !updated.Enabled || updated.VoicePrompt != prompt || updated.CampaignText == nil || *updated.CampaignText != campaign || updated.CountdownSeconds != 5 {
		t.Fatalf("update did not apply: %+v", updated)
	}

	// A field left unset in the PATCH body must be preserved (COALESCE
	// partial-update semantics), not reset to its zero value.
	rec = doJSON(t, f, http.MethodPatch, "/businesses/"+f.slug+"/photo/settings", updateSettingsRequest{})
	if rec.Code != http.StatusOK {
		t.Fatalf("no-op update settings: got status %d", rec.Code)
	}
	unchanged := mustDecode[settingsOut](t, rec)
	if !unchanged.Enabled || unchanged.VoicePrompt != prompt {
		t.Fatalf("no-op patch clobbered existing fields: %+v", unchanged)
	}
}

func TestPublicPhotoConfig_ReflectsSettings(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doPublic(t, f, http.MethodGet, "/businesses/"+f.slug+"/photo/config", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get public config: got status %d, body %s", rec.Code, rec.Body.String())
	}
	cfg := mustDecode[publicConfigOut](t, rec)
	if cfg.Enabled {
		t.Fatalf("expected disabled by default")
	}

	enablePhotoMoment(t, f)

	rec = doPublic(t, f, http.MethodGet, "/businesses/"+f.slug+"/photo/config", nil)
	cfg = mustDecode[publicConfigOut](t, rec)
	if !cfg.Enabled {
		t.Fatalf("expected enabled after settings update")
	}
}

func TestPhotoSession_DisabledIsForbidden(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doPublic(t, f, http.MethodPost, "/businesses/"+f.slug+"/photo-sessions", nil)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when disabled, got %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestPhotoSession_ResponseLifecycle(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	enablePhotoMoment(t, f)

	rec := doPublic(t, f, http.MethodPost, "/businesses/"+f.slug+"/photo-sessions", nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("start session: got status %d, body %s", rec.Code, rec.Body.String())
	}
	session := mustDecode[sessionOut](t, rec)
	if session.Status != sessionStarted {
		t.Fatalf("expected status %q, got %q", sessionStarted, session.Status)
	}

	base := "/businesses/" + f.slug + "/photo-sessions/" + session.ID

	// A response value other than accepted/declined is rejected.
	rec = doPublic(t, f, http.MethodPost, base+"/response", sessionResponseRequest{Response: "maybe"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid response value, got %d", rec.Code)
	}

	rec = doPublic(t, f, http.MethodPost, base+"/response", sessionResponseRequest{Response: "declined"})
	if rec.Code != http.StatusOK {
		t.Fatalf("decline session: got status %d, body %s", rec.Code, rec.Body.String())
	}
	declined := mustDecode[sessionOut](t, rec)
	if declined.Status != sessionDeclined {
		t.Fatalf("expected status %q, got %q", sessionDeclined, declined.Status)
	}

	// A second response on an already-answered session is a conflict.
	rec = doPublic(t, f, http.MethodPost, base+"/response", sessionResponseRequest{Response: "accepted"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409 for double response, got %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestPhotoSession_CrossTenantRejected(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	enablePhotoMoment(t, f)

	otherSlug, _ := seedBusiness(context.Background(), t, f.store)

	rec := doPublic(t, f, http.MethodPost, "/businesses/"+f.slug+"/photo-sessions", nil)
	session := mustDecode[sessionOut](t, rec)

	rec = doPublic(t, f, http.MethodPost, "/businesses/"+otherSlug+"/photo-sessions/"+session.ID+"/response", sessionResponseRequest{Response: "accepted"})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-tenant session access, got %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestPhotoDownload_UnknownTokenNotFound(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	rec := doPublic(t, f, http.MethodGet, "/photo-downloads/does-not-exist", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown token, got %d", rec.Code)
	}
}

// TestPhotoDownload_ExpiredReturns410 seeds a completed session directly
// via the store (bypassing the guest upload flow, which needs storage)
// with a download_expires_at already in the past, then verifies the live
// expiry check in handler_download.go rejects it independent of the
// cleanup job ever running.
func TestPhotoDownload_ExpiredReturns410(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()

	business, err := f.store.GetBusinessBySlug(ctx, f.slug)
	if err != nil {
		t.Fatalf("get fixture business: %v", err)
	}

	session, err := f.store.CreatePhotoSession(ctx, store.CreatePhotoSessionParams{ID: uuid.NewString(), BusinessID: business.ID})
	if err != nil {
		t.Fatalf("seed session: %v", err)
	}
	if _, err := f.store.SetPhotoSessionUpload(ctx, store.SetPhotoSessionUploadParams{
		ID: session.ID, PhotoPath: pgTextValid("photos/fixture/photo.jpg"), ThumbnailPath: pgTextValid("photos/fixture/thumb.jpg"),
	}); err != nil {
		t.Fatalf("seed upload: %v", err)
	}
	token := "expired-token-" + session.ID
	if _, err := f.store.CompletePhotoSession(ctx, store.CompletePhotoSessionParams{
		ID: session.ID, QrToken: pgTextValid(token), DownloadExpiresAt: pgtypeTimestamptz(time.Now().Add(-time.Hour)),
	}); err != nil {
		t.Fatalf("seed completion: %v", err)
	}

	rec := doPublic(t, f, http.MethodGet, "/photo-downloads/"+token, nil)
	if rec.Code != http.StatusGone {
		t.Fatalf("expected 410 for expired download, got %d, body %s", rec.Code, rec.Body.String())
	}
}

// TestGuestFlow_UploadThroughDownload exercises the full guest capture
// path against real object storage: start -> accept -> upload a synthetic
// selfie -> complete -> resolve the download JSON and QR PNG -> owner
// gallery list/delete -> analytics counts reflect the usage_events rows
// recorded along the way.
func TestGuestFlow_UploadThroughDownload(t *testing.T) {
	f := newStorageFixture(t)
	defer f.close()
	enablePhotoMoment(t, f)

	rec := doPublic(t, f, http.MethodPost, "/businesses/"+f.slug+"/photo-sessions", nil)
	session := mustDecode[sessionOut](t, rec)
	base := "/businesses/" + f.slug + "/photo-sessions/" + session.ID

	rec = doPublic(t, f, http.MethodPost, base+"/response", sessionResponseRequest{Response: "accepted"})
	if rec.Code != http.StatusOK {
		t.Fatalf("accept session: got status %d, body %s", rec.Code, rec.Body.String())
	}

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", "selfie.jpg")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(fixtureJPEG(t)); err != nil {
		t.Fatalf("write jpeg bytes: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	uploadReq := httptest.NewRequest(http.MethodPost, base+"/upload", &body)
	uploadReq.Header.Set("Content-Type", mw.FormDataContentType())
	uploadRec := httptest.NewRecorder()
	f.handler.ServeHTTP(uploadRec, uploadReq)
	if uploadRec.Code != http.StatusOK {
		t.Fatalf("upload photo: got status %d, body %s", uploadRec.Code, uploadRec.Body.String())
	}
	captured := mustDecode[sessionOut](t, uploadRec)
	if captured.Status != sessionCaptured {
		t.Fatalf("expected status %q after upload, got %q", sessionCaptured, captured.Status)
	}

	rec = doPublic(t, f, http.MethodPost, base+"/complete", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("complete session: got status %d, body %s", rec.Code, rec.Body.String())
	}
	completed := mustDecode[sessionOut](t, rec)
	if completed.Status != sessionCompleted || completed.QrToken == nil {
		t.Fatalf("unexpected completed session: %+v", completed)
	}

	downloadPath := "/photo-downloads/" + *completed.QrToken
	rec = doPublic(t, f, http.MethodGet, downloadPath, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("resolve download: got status %d, body %s", rec.Code, rec.Body.String())
	}
	download := mustDecode[downloadOut](t, rec)
	if download.PhotoURL == "" {
		t.Fatalf("expected non-empty signed photo url")
	}

	rec = doPublic(t, f, http.MethodGet, downloadPath+"/qr.png", nil)
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("get qr png: got status %d, content-type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	if rec.Body.Len() == 0 {
		t.Fatalf("expected non-empty qr png body")
	}

	// A second resolution must not double-fire the download analytics
	// event — the deliberate deviation from legacy documented in
	// handler_download.go.
	doPublic(t, f, http.MethodGet, downloadPath, nil)
	ctx := context.Background()
	business, _ := f.store.GetBusinessBySlug(ctx, f.slug)
	count, err := f.store.CountUsageEventsSince(ctx, store.CountUsageEventsSinceParams{
		BusinessID: business.ID, EventType: eventPhotoDownloaded, OccurredAt: pgtypeTimestamptz(time.Now().Add(-time.Hour)),
	})
	if err != nil {
		t.Fatalf("count usage events: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 photomoment.downloaded event, got %d", count)
	}

	rec = doJSON(t, f, http.MethodGet, "/businesses/"+f.slug+"/photo/gallery", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list gallery: got status %d, body %s", rec.Code, rec.Body.String())
	}
	gallery := mustDecode[struct {
		Items []galleryItemOut `json:"items"`
	}](t, rec)
	if len(gallery.Items) != 1 || gallery.Items[0].PhotoURL == nil {
		t.Fatalf("unexpected gallery contents: %+v", gallery.Items)
	}

	rec = doJSON(t, f, http.MethodGet, "/businesses/"+f.slug+"/photo/analytics", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get analytics: got status %d, body %s", rec.Code, rec.Body.String())
	}
	analytics := mustDecode[analyticsOut](t, rec)
	if analytics.SessionsStarted != 1 || analytics.PhotosAccepted != 1 || analytics.PhotosDownloaded != 1 {
		t.Fatalf("unexpected analytics: %+v", analytics)
	}

	rec = doJSON(t, f, http.MethodDelete, "/businesses/"+f.slug+"/photo/gallery/"+session.ID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete gallery item: got status %d, body %s", rec.Code, rec.Body.String())
	}
}
