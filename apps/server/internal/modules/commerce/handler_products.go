package commerce

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/httpx"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

func (m *Module) listProducts(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	products, err := m.store.ListProductsForBusiness(r.Context(), access.BusinessID)
	if err != nil {
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("list products")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to load products")
		return
	}

	out := make([]productOut, 0, len(products))
	for _, p := range products {
		out = append(out, toProductOut(p))
	}
	httpx.List(w, http.StatusOK, out)
}

func (m *Module) createProduct(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())

	var req createProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}

	productID := strings.TrimSpace(req.ProductID)
	name := strings.TrimSpace(req.Name)
	category := strings.TrimSpace(req.Category)
	if productID == "" || name == "" || category == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "product_id, name, and category are required")
		return
	}
	if req.Price < 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "price must not be negative")
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	durationMin := int32(30)
	if req.DurationMin != nil {
		durationMin = *req.DurationMin
	}

	product, err := m.store.CreateProduct(r.Context(), store.CreateProductParams{
		ID:              uuid.NewString(),
		BusinessID:      access.BusinessID,
		ProductID:       productID,
		Name:            name,
		Price:           req.Price,
		DiscountPercent: req.DiscountPercent,
		Category:        category,
		Description:     req.Description,
		ImageUrl:        req.ImageURL,
		IsActive:        isActive,
		SortOrder:       req.SortOrder,
		DurationMin:     durationMin,
	})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "product_id_taken", "product_id already exists for this business")
			return
		}
		m.deps.Log.Error().Err(err).Str("business_id", access.BusinessID).Msg("create product")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to create product")
		return
	}

	httpx.JSON(w, http.StatusCreated, toProductOut(product))
}

func (m *Module) updateProduct(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	var req updateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	if req.Price != nil && *req.Price < 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_request", "price must not be negative")
		return
	}

	product, err := m.store.UpdateProduct(r.Context(), store.UpdateProductParams{
		ID:              id,
		BusinessID:      access.BusinessID,
		ProductID:       textArg(req.ProductID),
		Name:            textArg(req.Name),
		Price:           float8Arg(req.Price),
		DiscountPercent: float8Arg(req.DiscountPercent),
		Category:        textArg(req.Category),
		Description:     textArg(req.Description),
		ImageUrl:        textArg(req.ImageURL),
		IsActive:        boolArg(req.IsActive),
		SortOrder:       int4Arg(req.SortOrder),
		DurationMin:     int4Arg(req.DurationMin),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "product_not_found", "product not found")
			return
		}
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "product_id_taken", "product_id already exists for this business")
			return
		}
		m.deps.Log.Error().Err(err).Str("product_id", id).Msg("update product")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to update product")
		return
	}

	httpx.JSON(w, http.StatusOK, toProductOut(product))
}

func (m *Module) deleteProduct(w http.ResponseWriter, r *http.Request) {
	access, _ := httpx.BusinessAccessFromContext(r.Context())
	id := chi.URLParam(r, "id")

	rowsAffected, err := m.store.DeleteProduct(r.Context(), store.DeleteProductParams{
		ID:         id,
		BusinessID: access.BusinessID,
	})
	if err != nil {
		m.deps.Log.Error().Err(err).Str("product_id", id).Msg("delete product")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "failed to delete product")
		return
	}
	if rowsAffected == 0 {
		httpx.Error(w, http.StatusNotFound, "product_not_found", "product not found")
		return
	}

	httpx.NoContent(w)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
