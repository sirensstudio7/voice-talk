// Command migrate applies (or rolls back) the database schema in
// db/migrations using goose. Migrations are embedded into the binary so
// there's no relative-path fragility running it from a different cwd.
//
// Usage:
//
//	go run ./cmd/migrate up
//	go run ./cmd/migrate down
//	go run ./cmd/migrate status
package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"

	migrationsdb "github.com/sirensstudio7/voice-talk/apps/server/db"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	_ = godotenv.Load()

	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate <up|down|status>")
		os.Exit(1)
	}
	command := os.Args[1]

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "migrate: DATABASE_URL is required")
		os.Exit(1)
	}

	sqlDB, err := sql.Open("pgx", dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "migrate: open db: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = sqlDB.Close() }()

	goose.SetBaseFS(migrationsdb.MigrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: set dialect: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	if err := goose.RunContext(ctx, command, sqlDB, "migrations"); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %s: %v\n", command, err)
		os.Exit(1)
	}
}
