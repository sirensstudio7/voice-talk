// Package db embeds the goose migration files so cmd/migrate can run them
// from a single self-contained binary regardless of working directory.
// The embed directive below cannot reach outside this package's own
// directory, which is why this lives here rather than under cmd/migrate.
package db

import "embed"

//go:embed migrations/*.sql
var MigrationsFS embed.FS
