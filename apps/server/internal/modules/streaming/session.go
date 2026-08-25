package streaming

import (
	"github.com/coder/websocket"
	"github.com/rs/zerolog"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/capabilities"
	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// Mode mirrors websocket.ts's three mutually-exclusive session modes.
type Mode string

const (
	ModeOrdering Mode = "ordering"
	ModeBooking  Mode = "booking"
	ModeFAQ      Mode = "faq"
)

// deriveMode ports websocket.ts's precedence: ordering, else booking,
// else FAQ as the fallback.
func deriveMode(caps capabilities.Capabilities) Mode {
	switch {
	case caps.OrderingEnabled:
		return ModeOrdering
	case caps.BookingEnabled:
		return ModeBooking
	default:
		return ModeFAQ
	}
}

// Session holds everything a single voice-session connection needs.
// Owned and mutated exclusively by handler_ws.go's single read loop
// goroutine — see OrderStore's concurrency note.
type Session struct {
	conn           *websocket.Conn
	business       store.Business
	mode           Mode
	voiceSessionID string
	orderStore     *OrderStore // nil unless mode == ModeOrdering
	log            zerolog.Logger
}
