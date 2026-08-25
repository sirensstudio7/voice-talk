package commerce

import (
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

type productOut struct {
	ID              string  `json:"id"`
	ProductID       string  `json:"product_id"`
	Name            string  `json:"name"`
	Price           float64 `json:"price"`
	DiscountPercent float64 `json:"discount_percent"`
	Category        string  `json:"category"`
	Description     string  `json:"description"`
	ImageURL        string  `json:"image_url"`
	IsActive        bool    `json:"is_active"`
	SortOrder       int32   `json:"sort_order"`
	DurationMin     int32   `json:"duration_min"`
}

func toProductOut(p store.Product) productOut {
	return productOut{
		ID:              p.ID,
		ProductID:       p.ProductID,
		Name:            p.Name,
		Price:           p.Price,
		DiscountPercent: p.DiscountPercent,
		Category:        p.Category,
		Description:     p.Description,
		ImageURL:        p.ImageUrl,
		IsActive:        p.IsActive,
		SortOrder:       p.SortOrder,
		DurationMin:     p.DurationMin,
	}
}

type createProductRequest struct {
	ProductID       string  `json:"product_id"`
	Name            string  `json:"name"`
	Price           float64 `json:"price"`
	DiscountPercent float64 `json:"discount_percent"`
	Category        string  `json:"category"`
	Description     string  `json:"description"`
	ImageURL        string  `json:"image_url"`
	IsActive        *bool   `json:"is_active"`
	SortOrder       int32   `json:"sort_order"`
	DurationMin     *int32  `json:"duration_min"`
}

type updateProductRequest struct {
	ProductID       *string  `json:"product_id"`
	Name            *string  `json:"name"`
	Price           *float64 `json:"price"`
	DiscountPercent *float64 `json:"discount_percent"`
	Category        *string  `json:"category"`
	Description     *string  `json:"description"`
	ImageURL        *string  `json:"image_url"`
	IsActive        *bool    `json:"is_active"`
	SortOrder       *int32   `json:"sort_order"`
	DurationMin     *int32   `json:"duration_min"`
}

// The pgtype.* zero value (Valid: false) means "leave this column
// unchanged" to UpdateProduct's COALESCE(sqlc.narg(...), col) pattern, so
// a nil pointer (field omitted from the PATCH body) maps straight to it.

func textArg(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func float8Arg(f *float64) pgtype.Float8 {
	if f == nil {
		return pgtype.Float8{}
	}
	return pgtype.Float8{Float64: *f, Valid: true}
}

func boolArg(b *bool) pgtype.Bool {
	if b == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *b, Valid: true}
}

func int4Arg(i *int32) pgtype.Int4 {
	if i == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *i, Valid: true}
}
