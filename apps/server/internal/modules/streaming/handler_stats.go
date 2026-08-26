package streaming

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/promptkit"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type statsOverviewOut struct {
	SessionsToday          int      `json:"sessions_today"`
	OrdersToday            int      `json:"orders_today"`
	RevenueToday           float64  `json:"revenue_today"`
	AvgOrderValue          float64  `json:"avg_order_value"`
	ActiveSessions         int      `json:"active_sessions"`
	AvgCallDurationSeconds *float64 `json:"avg_call_duration_seconds"`
}

type statsDailyPointOut struct {
	Date    string  `json:"date"`
	Orders  int     `json:"orders"`
	Revenue float64 `json:"revenue"`
}

type statsTopProductOut struct {
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	Revenue   float64 `json:"revenue"`
}

func startOfUTCDay(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}

func round2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}

// fetchStatsOverview ports business-stats.ts's fetchStatsOverview.
func (m *Module) fetchStatsOverview(ctx context.Context, businessID string) (statsOverviewOut, error) {
	today := startOfUTCDay(time.Now())

	sessionsToday, err := m.store.CountSessionsSince(ctx, store.CountSessionsSinceParams{
		BusinessID: businessID, StartedAt: pgTimestamptz(today),
	})
	if err != nil {
		return statsOverviewOut{}, err
	}
	activeSessions, err := m.store.CountActiveSessions(ctx, businessID)
	if err != nil {
		return statsOverviewOut{}, err
	}
	ordersAgg, err := m.store.CountConfirmedOrdersSince(ctx, store.CountConfirmedOrdersSinceParams{
		BusinessID: businessID, ConfirmedAt: pgTimestamptz(today),
	})
	if err != nil {
		return statsOverviewOut{}, err
	}
	avgDuration, err := m.store.AvgSessionDurationSeconds(ctx, businessID)
	if err != nil {
		return statsOverviewOut{}, err
	}

	ordersToday := int(ordersAgg.OrdersCount)
	revenueToday := round2(ordersAgg.Revenue)
	avgOrderValue := 0.0
	if ordersToday > 0 {
		avgOrderValue = round2(ordersAgg.Revenue / float64(ordersToday))
	}

	out := statsOverviewOut{
		SessionsToday: int(sessionsToday), OrdersToday: ordersToday, RevenueToday: revenueToday,
		AvgOrderValue: avgOrderValue, ActiveSessions: int(activeSessions),
	}
	if avgDuration >= 0 {
		v := float64(int64(avgDuration*10+0.5)) / 10
		out.AvgCallDurationSeconds = &v
	}
	return out, nil
}

// fetchStatsDaily ports business-stats.ts's fetchStatsDaily — a fixed
// 14-day window ending today, zero-filled for days with no orders.
func (m *Module) fetchStatsDaily(ctx context.Context, businessID string) ([]statsDailyPointOut, error) {
	start := startOfUTCDay(time.Now()).AddDate(0, 0, -13)

	rows, err := m.store.DailyConfirmedOrderStats(ctx, store.DailyConfirmedOrderStatsParams{
		BusinessID: businessID, ConfirmedAt: pgTimestamptz(start),
	})
	if err != nil {
		return nil, err
	}
	byDay := map[string]store.DailyConfirmedOrderStatsRow{}
	for _, row := range rows {
		byDay[row.Day] = row
	}

	out := make([]statsDailyPointOut, 14)
	for i := 0; i < 14; i++ {
		day := start.AddDate(0, 0, i)
		key := day.Format("2006-01-02")
		point := statsDailyPointOut{Date: key}
		if row, ok := byDay[key]; ok {
			point.Orders = int(row.Orders)
			point.Revenue = round2(row.Revenue)
		}
		out[i] = point
	}
	return out, nil
}

// fetchStatsTopProducts ports business-stats.ts's fetchStatsTopProducts.
func (m *Module) fetchStatsTopProducts(ctx context.Context, businessID string) ([]statsTopProductOut, error) {
	rows, err := m.store.TopProductsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	out := make([]statsTopProductOut, len(rows))
	for i, row := range rows {
		out[i] = statsTopProductOut{
			ProductID: row.ProductID, Name: row.Name,
			Quantity: int(row.Quantity), Revenue: round2(row.Revenue),
		}
	}
	return out, nil
}

// getStatsSummary ports admin.ts's GET
// /admin/businesses/:businessId/stats/summary — bundles overview + daily
// + top_products + ai_rules (lazily seeded if missing, same as
// knowledge's getOrCreateAIRules) into one response for the owner
// dashboard's first paint.
func (m *Module) getStatsSummary(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	ctx := r.Context()

	overview, err := m.fetchStatsOverview(ctx, access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("fetch stats overview")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	daily, err := m.fetchStatsDaily(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	topProducts, err := m.fetchStatsTopProducts(ctx, access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}

	rules, err := m.store.GetAIRules(ctx, access.BusinessID)
	if err != nil {
		business, berr := m.store.GetBusinessByID(ctx, access.BusinessID)
		if berr != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
			return
		}
		personality := promptkit.DefaultPersonality(business.Name, "id", business.PrimaryUseCase, business.BusinessType, "Lorescale")
		rules, err = m.store.CreateAIRules(ctx, store.CreateAIRulesParams{
			ID: uuid.NewString(), BusinessID: access.BusinessID, AssistantName: "Lorescale",
			Personality: personality, Tone: "friendly",
		})
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
			return
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"overview": overview, "daily": daily, "top_products": topProducts,
		"ai_rules": toStatsAIRulesOut(rules),
	})
}

func (m *Module) getStatsOverview(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	overview, err := m.fetchStatsOverview(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	httpx.JSON(w, http.StatusOK, overview)
}

func (m *Module) getStatsDaily(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	daily, err := m.fetchStatsDaily(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	httpx.JSON(w, http.StatusOK, daily)
}

func (m *Module) getStatsTopProducts(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	top, err := m.fetchStatsTopProducts(r.Context(), access.BusinessID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load stats")
		return
	}
	httpx.JSON(w, http.StatusOK, top)
}

type statsAIRulesOut struct {
	ID                 string `json:"id"`
	AssistantName      string `json:"assistant_name"`
	AvatarURL          string `json:"avatar_url"`
	AvatarModelPath    string `json:"avatar_model_path"`
	Personality        string `json:"personality"`
	Tone               string `json:"tone"`
	Language           string `json:"language"`
	BehavioralRules    string `json:"behavioral_rules"`
	ToolInstructions   string `json:"tool_instructions"`
	IdleTimeoutSeconds int32  `json:"idle_timeout_seconds"`
	VoicePreset        string `json:"voice_preset"`
	VoiceGender        string `json:"voice_gender"`
}

func toStatsAIRulesOut(r store.AiRule) statsAIRulesOut {
	return statsAIRulesOut{
		ID: r.ID, AssistantName: r.AssistantName, AvatarURL: r.AvatarUrl, AvatarModelPath: r.AvatarModelPath,
		Personality: r.Personality, Tone: r.Tone, Language: r.Language, BehavioralRules: r.BehavioralRules,
		ToolInstructions: r.ToolInstructions, IdleTimeoutSeconds: r.IdleTimeoutSeconds,
		VoicePreset: promptkit.NormalizeVoicePreset(r.VoicePreset), VoiceGender: promptkit.NormalizeVoiceGender(r.VoiceGender),
	}
}
