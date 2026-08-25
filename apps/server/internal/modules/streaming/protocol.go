package streaming

import "encoding/json"

// clientEnvelope is the shape of every client->server JSON text frame.
// Data is decoded per Type by the handler.
type clientEnvelope struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// serverEnvelope is the shape of every server->client JSON text frame.
type serverEnvelope struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Client message payloads.

type addItemPayload struct {
	ProductID string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
}

type productIDPayload struct {
	ProductID string `json:"product_id"`
}

type inputTextPayload struct {
	Text string `json:"text"`
}

// debugToolCallPayload drives ToolExecutor.Execute directly — a
// test/demo harness standing in for what the real Gemini tool-call loop
// does internally when it parses a functionCalls event. Not a legacy
// message; useful for exercising the tool-calling seam without a mic.
type debugToolCallPayload struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
}

// audio.activity_start / audio.activity_end / audio.stream_end mirror
// legacy's manual VAD boundary markers, forwarded 1:1 to the Gemini
// provider. They carry no data — envelope.Type alone is the signal, so
// there's no payload struct to decode into (see handleClientMessage).

// Server message payloads.

type sessionStatusPayload struct {
	Status string `json:"status"`
}

type orderLineOut struct {
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Price     float64 `json:"price"`
	Quantity  int32   `json:"quantity"`
}

type orderUpdatedPayload struct {
	Items []orderLineOut `json:"items"`
	Total float64        `json:"total"`
}

type transcriptPayload struct {
	Text string `json:"text"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type conversationCompletePayload struct {
	Reason string `json:"reason"`
}

// turn_complete and interrupted carry no data — bare {"type": "..."}
// frames, matching legacy. interrupted signals barge-in: the client
// should flush any queued playback audio immediately.
type turnCompletePayload struct{}
type interruptedPayload struct{}

// Binary WS frames carry raw PCM audio with no JSON envelope — client
// mic input in (16-bit LE, 16kHz, mono) and Gemini's spoken output out
// (16-bit LE, 24kHz, mono). This is the one place the wire protocol
// differs from the JSON-envelope convention used everywhere else in
// this module, matching legacy's "no server-side resampling" behavior.
