// Package httpx provides the small set of net/http response helpers every
// module handler uses in place of a framework's built-in convenience
// methods, plus the API-wide response envelope. It only imports net/http
// and encoding/json, so it stays on the right side of the "no vendor SDK
// in internal/modules" boundary.
//
// Response envelope, applied by every handler in every module:
//
//   - A single resource is returned as a bare JSON object:
//     {"id": "...", "name": "...", ...}
//   - A collection is wrapped so pagination fields can be added later
//     without a breaking change: {"items": [...]}. Use List for these.
//   - An error is {"error": {"code": "...", "message": "..."}}. code is a
//     short, stable, snake_case machine-readable token from a fixed
//     per-domain vocabulary (see each module's error codes); message is
//     human-readable and may change wording freely. Use Error for these.
//   - DELETE returns 204 with no body. Create returns 201. Everything
//     else that succeeds returns 200.
package httpx

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as a JSON body with the given status code. Prefer the
// more specific List/Error helpers below for their respective cases;
// reach for JSON directly only for a bare single-resource response.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// List writes items as {"items": items} with the given status code — the
// standard shape for every collection response.
func List(w http.ResponseWriter, status int, items any) {
	JSON(w, status, map[string]any{"items": items})
}

// NoContent writes an empty 204 response, for successful deletes.
func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error writes {"error": {"code": code, "message": message}} with the
// given status code. code is a short snake_case token a client can
// safely switch on; message is for humans/logs and may change wording.
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, map[string]errorBody{"error": {Code: code, Message: message}})
}
