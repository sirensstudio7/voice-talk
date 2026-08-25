package auth

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
)

func (m *Module) getBusinessBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "slug is required")
		return
	}

	business, err := m.store.GetBusinessBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "business_not_found", "business not found")
			return
		}
		m.deps.Log.Error().Err(err).Str("slug", slug).Msg("get business by slug")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load business")
		return
	}

	httpx.JSON(w, http.StatusOK, toBusinessOut(business))
}
