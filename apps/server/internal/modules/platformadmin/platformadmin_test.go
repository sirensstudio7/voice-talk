package platformadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/platform/authtoken"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func pgtypeTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func pgNumeric(v float64) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(fmt.Sprintf("%v", v))
	return n
}

type fixture struct {
	handler http.Handler
	store   *store.Queries
	pool    *pgxpool.Pool
}

func (f fixture) close() { f.pool.Close() }

// newTestFixture builds the module with no seed admin configured —
// platform_admins already has rows left over from earlier test runs
// against this shared dev DB (same leftover-fixture convention as every
// other module's tests this session), so relying on New()'s one-time
// "seed if empty" boot behavior for test setup would be nondeterministic
// across runs. Every test seeds the specific admin(s) it needs directly
// via seedAdminWithPassword instead; boot-seeding itself is covered
// separately by TestBootSeed_NeverDuplicates.
func newTestFixture(t *testing.T) fixture {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping platformadmin integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}

	m := New(Deps{DB: pool, JWTSecret: testJWTSecret})
	r := chi.NewRouter()
	m.RegisterRoutes(r)

	return fixture{handler: r, store: store.New(pool), pool: pool}
}

const testJWTSecret = "test-secret"

func doJSON(t *testing.T, f fixture, method, path, token string, body any) *httptest.ResponseRecorder {
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

// seedAdminWithPassword directly inserts a platform_admins row (bypassing
// New()'s boot-seed) with a real bcrypt hash of password, so the login
// flow can authenticate against it.
func seedAdminWithPassword(ctx context.Context, t *testing.T, f fixture, role, email, password string) store.PlatformAdmin {
	t.Helper()
	hash, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	admin, err := f.store.CreatePlatformAdmin(ctx, store.CreatePlatformAdminParams{
		ID: uuid.NewString(), Name: "Test " + role, Email: email, PasswordHash: hash, Role: role,
	})
	if err != nil {
		t.Fatalf("seed admin: %v", err)
	}
	return admin
}

func fullToken(t *testing.T, adminID, role string) string {
	t.Helper()
	tok, err := authtoken.IssuePlatformToken(testJWTSecret, adminID, role, tokenTypFull, time.Hour)
	if err != nil {
		t.Fatalf("issue platform token: %v", err)
	}
	return tok
}

// loginAndEnroll seeds a fresh super-role admin with the given
// email/password and drives the full login -> setup-2fa -> verify-2fa
// flow for it, returning a full access token.
func loginAndEnroll(t *testing.T, f fixture, email, password string) string {
	t.Helper()
	ctx := context.Background()
	seedAdminWithPassword(ctx, t, f, roleSuper, email, password)

	rec := doJSON(t, f, http.MethodPost, "/platform/auth/login", "", loginRequest{Email: email, Password: password})
	if rec.Code != http.StatusOK {
		t.Fatalf("login: got status %d, body %s", rec.Code, rec.Body.String())
	}
	login := mustDecode[loginResponse](t, rec)
	if login.Status != "totp_setup_required" {
		t.Fatalf("expected totp_setup_required for a fresh admin, got %q", login.Status)
	}

	rec = doJSON(t, f, http.MethodPost, "/platform/auth/setup-2fa", login.PendingToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("setup-2fa: got status %d, body %s", rec.Code, rec.Body.String())
	}
	setup := mustDecode[setup2FAResponse](t, rec)
	if setup.Secret == "" || setup.OtpauthURL == "" || setup.QRCodePNG == "" {
		t.Fatalf("incomplete setup-2fa response: %+v", setup)
	}

	code, err := totp.GenerateCode(setup.Secret, time.Now())
	if err != nil {
		t.Fatalf("generate totp code: %v", err)
	}
	rec = doJSON(t, f, http.MethodPost, "/platform/auth/verify-2fa", login.PendingToken, verify2FARequest{Code: code})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify-2fa: got status %d, body %s", rec.Code, rec.Body.String())
	}
	verified := mustDecode[verify2FAResponse](t, rec)
	if verified.AccessToken == "" {
		t.Fatalf("expected a non-empty access token")
	}
	return verified.AccessToken
}

func TestAuthFlow_LoginSetupVerifyMe(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()

	email := "authflow-" + uuid.NewString()[:8] + "@example.com"
	password := "correct-horse-battery-staple"
	token := loginAndEnroll(t, f, email, password)

	rec := doJSON(t, f, http.MethodGet, "/platform/auth/me", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("me: got status %d, body %s", rec.Code, rec.Body.String())
	}
	me := mustDecode[adminOut](t, rec)
	if me.Email != email || me.Role != roleSuper || !me.TotpEnabled {
		t.Fatalf("unexpected /me response: %+v", me)
	}

	// A pending token must not work against a full-auth route.
	rec2 := doJSON(t, f, http.MethodPost, "/platform/auth/login", "", loginRequest{Email: email, Password: password})
	login := mustDecode[loginResponse](t, rec2)
	if login.Status != "totp_required" {
		t.Fatalf("expected totp_required after enrollment, got %q", login.Status)
	}
	rec3 := doJSON(t, f, http.MethodGet, "/platform/auth/me", login.PendingToken, nil)
	if rec3.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 using a pending token on a full-auth route, got %d", rec3.Code)
	}
}

func TestRBAC_ReadonlyDeniedWrite(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()

	admin := seedAdminWithPassword(ctx, t, f, roleReadonly, "readonly-"+uuid.NewString()[:8]+"@example.com", "unused")
	token := fullToken(t, admin.ID, roleReadonly)

	rec := doJSON(t, f, http.MethodGet, "/platform/dashboard", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("readonly should read the dashboard: got %d", rec.Code)
	}

	user, err := f.store.CreateUser(ctx, store.CreateUserParams{ID: uuid.NewString(), Email: "rbac-" + uuid.NewString()[:8] + "@example.com", PasswordHash: "x", Name: "RBAC Target"})
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	rec = doJSON(t, f, http.MethodPatch, "/platform/users/"+user.ID+"/status", token, updateStatusRequest{Status: "suspended"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for readonly on a :write route, got %d, body %s", rec.Code, rec.Body.String())
	}
}

func TestUsers_ListDetailStatusResetPassword(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()
	token := loginAndEnroll(t, f, "users-"+uuid.NewString()[:8]+"@example.com", "correct-horse-battery-staple")

	userID := uuid.NewString()
	user, err := f.store.CreateUser(ctx, store.CreateUserParams{ID: userID, Email: "target-" + userID[:8] + "@example.com", PasswordHash: "x", Name: "Target User"})
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	rec := doJSON(t, f, http.MethodGet, "/platform/users?q="+user.Email[:8], token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list users: got status %d, body %s", rec.Code, rec.Body.String())
	}
	list := mustDecode[struct {
		Items []userOut `json:"items"`
	}](t, rec)
	found := false
	for _, u := range list.Items {
		if u.ID == user.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected search to find the seeded user, got %+v", list.Items)
	}

	rec = doJSON(t, f, http.MethodGet, "/platform/users/"+user.ID, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get user: got status %d, body %s", rec.Code, rec.Body.String())
	}
	detail := mustDecode[userDetailOut](t, rec)
	if detail.ID != user.ID {
		t.Fatalf("unexpected user detail: %+v", detail)
	}

	rec = doJSON(t, f, http.MethodPatch, "/platform/users/"+user.ID+"/status", token, updateStatusRequest{Status: "suspended"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update user status: got status %d, body %s", rec.Code, rec.Body.String())
	}
	updated := mustDecode[userOut](t, rec)
	if updated.Status != "suspended" {
		t.Fatalf("expected status suspended, got %q", updated.Status)
	}

	rec = doJSON(t, f, http.MethodPost, "/platform/users/"+user.ID+"/reset-password", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("reset password: got status %d, body %s", rec.Code, rec.Body.String())
	}
	reset := mustDecode[resetPasswordResponse](t, rec)
	if reset.TemporaryPassword == "" {
		t.Fatalf("expected a non-empty temporary password")
	}

	rec = doJSON(t, f, http.MethodGet, "/platform/audit-logs?target_type=user&target_id="+user.ID, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list audit logs: got status %d, body %s", rec.Code, rec.Body.String())
	}
	logs := mustDecode[struct {
		Items []auditLogOut `json:"items"`
	}](t, rec)
	if len(logs.Items) < 2 {
		t.Fatalf("expected at least 2 audit log entries (status update + password reset), got %d", len(logs.Items))
	}
}

func TestBusinesses_StatusAndImpersonate(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()
	token := loginAndEnroll(t, f, "bizadmin-"+uuid.NewString()[:8]+"@example.com", "correct-horse-battery-staple")

	ownerID := uuid.NewString()
	owner, err := f.store.CreateUser(ctx, store.CreateUserParams{ID: ownerID, Email: "owner-" + ownerID[:8] + "@example.com", PasswordHash: "x", Name: "Business Owner"})
	if err != nil {
		t.Fatalf("seed owner: %v", err)
	}
	businessID := uuid.NewString()
	slug := "platformadmin-biz-" + businessID[:8]
	if _, err := f.store.CreateBusiness(ctx, store.CreateBusinessParams{ID: businessID, Slug: slug, Name: "Test Biz"}); err != nil {
		t.Fatalf("seed business: %v", err)
	}
	if _, err := f.store.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{ID: uuid.NewString(), UserID: owner.ID, BusinessID: businessID, Role: "owner"}); err != nil {
		t.Fatalf("seed membership: %v", err)
	}

	rec := doJSON(t, f, http.MethodGet, "/platform/businesses/"+businessID, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get business: got status %d, body %s", rec.Code, rec.Body.String())
	}
	detail := mustDecode[businessDetailOut](t, rec)
	if detail.MemberCount != 1 || len(detail.Members) != 1 {
		t.Fatalf("unexpected business detail: %+v", detail)
	}

	rec = doJSON(t, f, http.MethodPatch, "/platform/businesses/"+businessID+"/status", token, updateBusinessStatusRequest{IsActive: false})
	if rec.Code != http.StatusOK {
		t.Fatalf("update business status: got status %d, body %s", rec.Code, rec.Body.String())
	}
	if updated := mustDecode[businessOut](t, rec); updated.IsActive {
		t.Fatalf("expected is_active false after update")
	}

	rec = doJSON(t, f, http.MethodPost, "/platform/businesses/"+businessID+"/impersonate", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("impersonate: got status %d, body %s", rec.Code, rec.Body.String())
	}
	imp := mustDecode[impersonateResponse](t, rec)
	if imp.UserID != owner.ID || imp.BusinessSlug != slug {
		t.Fatalf("unexpected impersonate response: %+v", imp)
	}
	// The impersonation token must round-trip through the *same*
	// authtoken.Parse a real customer login token uses.
	parsedUserID, err := authtoken.Parse(testJWTSecret, imp.AccessToken)
	if err != nil || parsedUserID != owner.ID {
		t.Fatalf("impersonation token did not parse as a normal customer token: userID=%q err=%v", parsedUserID, err)
	}
}

// TestTenantDelete_CascadesEverything seeds a business with rows in every
// non-cascading business-referencing table plus a cascading one
// (presentations/presentation_files), hard-deletes it, and confirms every
// table is empty afterward — the exact FK-violation class this session
// hit first-hand during manual cleanup no longer happens.
func TestTenantDelete_CascadesEverything(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()
	token := loginAndEnroll(t, f, "delete-"+uuid.NewString()[:8]+"@example.com", "correct-horse-battery-staple")

	businessID := uuid.NewString()
	slug := "platformadmin-delete-" + businessID[:8]
	if _, err := f.store.CreateBusiness(ctx, store.CreateBusinessParams{ID: businessID, Slug: slug, Name: "Delete Me"}); err != nil {
		t.Fatalf("seed business: %v", err)
	}
	userID := uuid.NewString()
	if _, err := f.store.CreateUser(ctx, store.CreateUserParams{ID: userID, Email: "delme-" + userID[:8] + "@example.com", PasswordHash: "x", Name: "Delete Member"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := f.store.CreateBusinessMember(ctx, store.CreateBusinessMemberParams{ID: uuid.NewString(), UserID: userID, BusinessID: businessID, Role: "owner"}); err != nil {
		t.Fatalf("seed membership: %v", err)
	}
	if _, err := f.store.CreateAIRules(ctx, store.CreateAIRulesParams{ID: uuid.NewString(), BusinessID: businessID, AssistantName: "Bot", Personality: "friendly", Tone: "friendly"}); err != nil {
		t.Fatalf("seed ai_rules: %v", err)
	}
	if _, err := f.store.CreateKnowledgeEntry(ctx, store.CreateKnowledgeEntryParams{ID: uuid.NewString(), BusinessID: businessID, Category: "General", Title: "FAQ", Content: "...", SortOrder: 0}); err != nil {
		t.Fatalf("seed knowledge entry: %v", err)
	}
	productID := uuid.NewString()
	if _, err := f.store.CreateProduct(ctx, store.CreateProductParams{
		ID: productID, BusinessID: businessID, ProductID: "widget", Name: "Widget", Price: 10, Category: "General", IsActive: true, DurationMin: 30,
	}); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	if _, err := f.store.CreateBusinessHour(ctx, store.CreateBusinessHourParams{ID: uuid.NewString(), BusinessID: businessID, DayOfWeek: 1, OpenTime: "09:00", CloseTime: "18:00"}); err != nil {
		t.Fatalf("seed business hour: %v", err)
	}
	if _, err := f.store.CreateAppointment(ctx, store.CreateAppointmentParams{
		ID: uuid.NewString(), BusinessID: businessID, ProductID: "widget", TreatmentName: "Widget", CustomerName: "Guest",
		StartsAt: pgtypeTimestamptz(time.Now()), EndsAt: pgtypeTimestamptz(time.Now().Add(time.Hour)),
	}); err != nil {
		t.Fatalf("seed appointment: %v", err)
	}
	voiceSession, err := f.store.CreateVoiceSession(ctx, store.CreateVoiceSessionParams{ID: uuid.NewString(), BusinessID: businessID})
	if err != nil {
		t.Fatalf("seed voice session: %v", err)
	}
	if _, err := f.store.CreateTranscriptMessage(ctx, store.CreateTranscriptMessageParams{ID: uuid.NewString(), VoiceSessionID: voiceSession.ID, Role: "user", Text: "hi"}); err != nil {
		t.Fatalf("seed transcript message: %v", err)
	}
	if _, err := f.store.CreateOrder(ctx, store.CreateOrderParams{ID: uuid.NewString(), BusinessID: businessID, VoiceSessionID: pgTextArg(voiceSession.ID), Total: 10}); err != nil {
		t.Fatalf("seed order: %v", err)
	}
	if _, err := f.store.RecordUsageEvent(ctx, store.RecordUsageEventParams{ID: uuid.NewString(), BusinessID: businessID, EventType: "test.event", Quantity: pgNumeric(1), Metadata: []byte("{}")}); err != nil {
		t.Fatalf("seed usage event: %v", err)
	}
	presentation, err := f.store.CreatePresentation(ctx, store.CreatePresentationParams{ID: uuid.NewString(), BusinessID: businessID, Title: "Deck", Language: "en", Category: "general"})
	if err != nil {
		t.Fatalf("seed presentation: %v", err)
	}
	if _, err := f.store.CreatePresentationFile(ctx, store.CreatePresentationFileParams{
		ID: uuid.NewString(), PresentationID: presentation.ID, FileName: "deck.pptx", FileType: "pptx", SizeBytes: 100, StoragePath: "presentations/" + businessID + "/deck.pptx",
	}); err != nil {
		t.Fatalf("seed presentation file: %v", err)
	}
	if _, err := f.store.CreatePhotoSession(ctx, store.CreatePhotoSessionParams{ID: uuid.NewString(), BusinessID: businessID}); err != nil {
		t.Fatalf("seed photo session: %v", err)
	}

	rec := doJSON(t, f, http.MethodDelete, "/platform/businesses/"+businessID, token, deleteBusinessRequest{ConfirmSlug: "wrong-slug"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a wrong confirm_slug, got %d, body %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, f, http.MethodDelete, "/platform/businesses/"+businessID, token, deleteBusinessRequest{ConfirmSlug: slug})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete business: got status %d, body %s", rec.Code, rec.Body.String())
	}

	if _, err := f.store.GetBusinessByID(ctx, businessID); err == nil {
		t.Fatalf("expected business row to be gone")
	}
	memberCount, err := f.store.GetBusinessMemberCount(ctx, businessID)
	if err != nil || memberCount != 0 {
		t.Fatalf("expected 0 business_members, got %d (err %v)", memberCount, err)
	}
	presentationCount, err := f.store.GetBusinessPresentationCount(ctx, businessID)
	if err != nil || presentationCount != 0 {
		t.Fatalf("expected 0 presentations, got %d (err %v)", presentationCount, err)
	}

	rec = doJSON(t, f, http.MethodGet, "/platform/audit-logs?target_type=business&target_id="+businessID, token, nil)
	logs := mustDecode[struct {
		Items []auditLogOut `json:"items"`
	}](t, rec)
	deleted := false
	for _, l := range logs.Items {
		if l.Action == "business.deleted" {
			deleted = true
		}
	}
	if !deleted {
		t.Fatalf("expected a business.deleted audit log entry")
	}
}

// TestBootSeed_NeverDuplicates verifies New()'s boot-seed logic is
// idempotent: calling it twice with the same seed credentials never
// creates a second admin. Whether the *first* call actually seeds
// (platform_admins starting truly empty) isn't asserted directly — this
// shared dev DB accumulates leftover rows across test runs like every
// other module's tests this session, so "the table is globally empty" is
// only reliably true against a genuinely fresh migration, verified
// instead by this session's live-boot smoke walkthrough.
func TestBootSeed_NeverDuplicates(t *testing.T) {
	f := newTestFixture(t)
	defer f.close()
	ctx := context.Background()

	email := "bootseed-" + uuid.NewString()[:8] + "@example.com"
	deps := Deps{DB: f.pool, JWTSecret: testJWTSecret, SeedAdminEmail: email, SeedAdminPassword: "correct-horse-battery-staple"}

	New(deps)
	afterFirst, err := f.store.CountPlatformAdmins(ctx)
	if err != nil {
		t.Fatalf("count admins: %v", err)
	}

	New(deps)
	afterSecond, err := f.store.CountPlatformAdmins(ctx)
	if err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if afterSecond != afterFirst {
		t.Fatalf("second New() call must not seed an additional admin: %d -> %d", afterFirst, afterSecond)
	}
}
