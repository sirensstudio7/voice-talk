#!/usr/bin/env bash
# Print Supabase setup checklist and open docs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=============================================="
echo "  VoiceTalk — Supabase + domain deploy setup"
echo "=============================================="
echo ""
echo "1. Create Supabase project:"
echo "   https://supabase.com/dashboard"
echo ""
echo "2. Run SQL in Supabase SQL Editor (in order):"
echo "   - $ROOT/supabase/migrations/001_initial_schema.sql"
echo ""
echo "3. Add to apps/server/.env:"
echo "   DATABASE_URL=...pooler.supabase.com:6543/postgres"
echo "   SUPABASE_URL=https://xxxx.supabase.co"
echo "   SUPABASE_SERVICE_ROLE_KEY=eyJ..."
echo ""
echo "4. Seed:"
echo "   bun run seed:db"
echo ""
echo "5. Deploy to your domain:"
echo "   See $ROOT/docs/DEPLOY-DOMAIN.md"
echo ""
echo "Full guide: $ROOT/docs/SUPABASE-SETUP.md"
echo "Production env template: $ROOT/.env.production.example"
echo ""

env_has_supabase=0
for env_file in "$ROOT/.env" "$ROOT/apps/server/.env"; do
  if [[ -f "$env_file" ]] && grep -q "pooler.supabase.com" "$env_file" 2>/dev/null; then
    env_has_supabase=1
  fi
done

if [[ "$env_has_supabase" = "1" ]]; then
  echo "✓ .env already has a Supabase DATABASE_URL"
else
  echo "→ .env still uses local Postgres — update DATABASE_URL after Supabase setup"
fi
