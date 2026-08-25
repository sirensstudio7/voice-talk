package sessions

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return New(client)
}

type cartPayload struct {
	Items []string `json:"items"`
	Total float64  `json:"total"`
}

func TestSetGet_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	want := cartPayload{Items: []string{"latte", "croissant"}, Total: 8.5}
	if err := s.Set(ctx, "cart:abc123", want, time.Minute); err != nil {
		t.Fatalf("Set: %v", err)
	}

	var got cartPayload
	if err := s.Get(ctx, "cart:abc123", &got); err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Total != want.Total || len(got.Items) != len(want.Items) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestGet_NotFound(t *testing.T) {
	s := newTestStore(t)
	var dest cartPayload
	err := s.Get(context.Background(), "cart:does-not-exist", &dest)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDelete(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if err := s.Set(ctx, "cart:to-delete", cartPayload{Total: 1}, time.Minute); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if err := s.Delete(ctx, "cart:to-delete"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	var dest cartPayload
	err := s.Get(ctx, "cart:to-delete", &dest)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestDelete_MissingKeyIsNotError(t *testing.T) {
	s := newTestStore(t)
	if err := s.Delete(context.Background(), "cart:never-existed"); err != nil {
		t.Fatalf("Delete on missing key should not error, got %v", err)
	}
}
