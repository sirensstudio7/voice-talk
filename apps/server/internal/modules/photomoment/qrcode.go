package photomoment

import "github.com/skip2/go-qrcode"

// generateQRPNG renders a QR code encoding url as a PNG. Self-hosted —
// legacy rendered this in the browser via an unauthenticated third-party
// API (api.qrserver.com), sending each guest's private download URL to
// that third party; see the Phase 1 plan's "deliberate deviations".
func generateQRPNG(url string, size int) ([]byte, error) {
	return qrcode.Encode(url, qrcode.Medium, size)
}
