package presenter

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rs/zerolog"
)

// clientLiveMessage is the shape of every client->server text frame on
// the live narration WebSocket — a much smaller protocol than
// streaming's since there's no mic input or tool calling, just
// "speak this slide" / "end the session".
type clientLiveMessage struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// liveEnvelope is the shape of every server->client JSON text frame,
// matching streaming's serverEnvelope convention.
type liveEnvelope struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type liveStatusPayload struct {
	Status string `json:"status"`
}

type liveTranscriptPayload struct {
	Text string `json:"text"`
}

type liveErrorPayload struct {
	Error string `json:"error"`
}

func sendLiveJSON(conn *websocket.Conn, log zerolog.Logger, msgType string, data any) {
	var mu sync.Mutex
	sendLiveJSONLocked(conn, &mu, log, msgType, data)
}

func sendLiveJSONLocked(conn *websocket.Conn, mu *sync.Mutex, log zerolog.Logger, msgType string, data any) {
	payload, err := json.Marshal(liveEnvelope{Type: msgType, Data: data})
	if err != nil {
		log.Error().Err(err).Str("type", msgType).Msg("presenter live: marshal server message")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.Write(writeCtx, websocket.MessageText, payload); err != nil {
		log.Error().Err(err).Str("type", msgType).Msg("presenter live: write server message")
	}
}
