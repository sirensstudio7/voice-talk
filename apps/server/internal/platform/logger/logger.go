// Package logger configures the process-wide structured logger.
package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

// New builds a zerolog.Logger. In development it writes human-readable
// console output; in any other env it writes structured JSON suitable for
// log aggregation.
func New(env string) zerolog.Logger {
	zerolog.TimeFieldFormat = time.RFC3339

	var writer = os.Stdout

	if env == "development" {
		console := zerolog.ConsoleWriter{Out: writer, TimeFormat: time.Kitchen}
		return zerolog.New(console).With().Timestamp().Logger()
	}

	return zerolog.New(writer).With().Timestamp().Logger()
}
