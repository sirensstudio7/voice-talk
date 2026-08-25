// Package httpserver owns the *http.Server lifecycle — construction,
// listen, and graceful shutdown — separately from internal/router (which
// only composes routes). This keeps cmd/api/main.go a thin wiring file,
// matching how database/cache/logger are each one focused platform
// package.
package httpserver

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/rs/zerolog"
)

// Run starts an HTTP server on addr and blocks until ctx is canceled, then
// gracefully shuts it down (10s timeout) before returning.
func Run(ctx context.Context, addr string, handler http.Handler, log zerolog.Logger) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		log.Info().Str("addr", addr).Msg("server listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	log.Info().Msg("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return nil
}
