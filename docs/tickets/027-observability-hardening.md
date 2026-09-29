# TKT-027 — Observability hardening: fleet metrics and error aggregation

- **Status:** proposed
- **Priority:** P2
- **Area:** observability
- **Effort:** M (2–4 days, mostly a decision + integration)
- **Depends on:** —
- **Source:** multi-instance review 2026-09-29 — `/health?metrics=1` shows one
  pod; errors live only in logs

## Problem

With two pods behind a load balancer, `/health?metrics=1` returns one random
instance's in-process counters, so you cannot see both. Errors (DB timeouts,
provider failures, 5xx) are structured logs in Kubeletto with no aggregation
or alerting — the `ERR_POSTGRES_LIFETIME_TIMEOUT` and connection-slot failures
were found by manually scanning logs hours later.

## Options

- **A. Per-pod scraping (cheap):** keep JSON metrics; extend
  `verify-deploy`/a small script to query each pod's internal URL and print a
  side-by-side snapshot. No new vendor; manual polling.
- **B. Log shipping + alerting (recommended):** ship stdout NDJSON to a hosted
  aggregator (Axiom/Better Stack/Loki) with 5xx and `err.code` alerts. No app
  changes (logs are already structured).
- **C. Redis fleet aggregation:** rejected — ~1M+ commands/month for ~100
  metrics; would consume the budget recovered in TKT-020.

## Proposal

1. Decide B for errors/alerts and A for on-demand metrics.
2. Add alert rules: 5xx rate, `db.pool_reset_total`, `redis.commands_total`
   budget, `ws.first_audio_slow`, `menu.build_slow`.
3. Document the runbook links in `MULTI-INSTANCE.md`.

## Acceptance criteria

- [ ] Error spikes and pod restarts produce a notification within minutes.
- [ ] Both pods' metrics can be inspected with one command on demand.
- [ ] No Redis command budget is spent on metric aggregation.

## Out of scope

- Prometheus/Grafana/OTel pipelines (revisit only if aggregate volume grows).

## Rollout / risk

Read-only integration; logs may contain tenant identifiers, so choose a
vendor with retention/access controls and keep the existing redaction rules.
