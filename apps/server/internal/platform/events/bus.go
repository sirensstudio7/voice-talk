// Package events provides the in-memory domain event bus that lets
// modules react to each other (e.g. Commerce publishing OrderPaid, Photo
// Moment and the kitchen display subscribing) without importing each
// other directly. See docs/ARCHITECTURE-MIGRATION-SPEC.md Principle 1.
package events

import (
	"context"
	"sync"
)

// Event is any domain event. Name should be a stable, human-readable
// identifier such as "order.paid" or "booking.confirmed".
type Event struct {
	Name string
	Data any
}

// Handler processes one published event. Handlers run in their own
// goroutine and must not block the publisher; slow work should be handed
// off to a queue (see internal/platform/queue, added in a later phase).
type Handler func(ctx context.Context, evt Event)

// Bus is a simple synchronous-fanout, asynchronous-delivery pub/sub bus.
// It is process-local: multiple backend instances do not share
// subscriptions. Cross-instance fan-out (e.g. live kitchen tickets) goes
// through Redis Pub/Sub instead — see docs/TECHNICAL-ARCHITECTURE-SPEC.md
// section 3.2.
type Bus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[string][]Handler)}
}

// Subscribe registers handler to run whenever an event named `name` is
// published.
func (b *Bus) Subscribe(name string, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[name] = append(b.handlers[name], handler)
}

// Publish dispatches evt to every subscriber of evt.Name, each in its own
// goroutine. Publish does not wait for handlers to finish.
func (b *Bus) Publish(ctx context.Context, evt Event) {
	b.mu.RLock()
	handlers := b.handlers[evt.Name]
	b.mu.RUnlock()

	for _, h := range handlers {
		go h(ctx, evt)
	}
}
