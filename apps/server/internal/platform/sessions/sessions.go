// Package sessions provides a generic, TTL'd, JSON-serialized key-value
// store backed by Redis. It exists so cart/session state has somewhere to
// live besides an in-process map — the exact failure mode flagged in the
// accepted architecture review: state that vanishes on every deploy or
// the moment there's more than one backend instance. Used later by
// commerce (cart state) and streaming (voice session metadata).
package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const keyPrefix = "session:"

// ErrNotFound is returned by Get when key does not exist or has expired.
var ErrNotFound = errors.New("sessions: not found")

type Store struct {
	redis *redis.Client
}

func New(client *redis.Client) *Store {
	return &Store{redis: client}
}

// Set JSON-serializes value and stores it under key with the given TTL.
func (s *Store) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	b, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("sessions: marshal: %w", err)
	}
	if err := s.redis.Set(ctx, keyPrefix+key, b, ttl).Err(); err != nil {
		return fmt.Errorf("sessions: set: %w", err)
	}
	return nil
}

// Get JSON-deserializes the value stored at key into dest. Returns
// ErrNotFound if key does not exist (or has expired).
func (s *Store) Get(ctx context.Context, key string, dest any) error {
	b, err := s.redis.Get(ctx, keyPrefix+key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return ErrNotFound
		}
		return fmt.Errorf("sessions: get: %w", err)
	}
	if err := json.Unmarshal(b, dest); err != nil {
		return fmt.Errorf("sessions: unmarshal: %w", err)
	}
	return nil
}

// Delete removes key. Deleting a key that doesn't exist is not an error.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := s.redis.Del(ctx, keyPrefix+key).Err(); err != nil {
		return fmt.Errorf("sessions: delete: %w", err)
	}
	return nil
}
