#!/usr/bin/env bash
# Recreates the DISPOSABLE test database: production schema snapshot (Oct 2026)
# + small fake data set, then runs all migrations on top - exactly what will
# happen on the real server.
# Connection settings come from .env.test (TEST database only!).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.test; set +a

case "$DB_NAME" in *test*) ;; *) echo "Refusing: DB_NAME in .env.test must contain 'test' (got '$DB_NAME')"; exit 1;; esac

export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER" PGPASSWORD="$DB_PASSWORD"
psql -q -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\"" -c "CREATE DATABASE \"$DB_NAME\""
psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f test/fixtures/prod_schema_2026-10.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f migrations/public/001_baseline.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "TRUNCATE public.schema_migrations" 2>/dev/null || true
psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f test/fixtures/seed.sql >/dev/null
DOTENV_CONFIG_PATH=.env.test node -r dotenv/config scripts/migrate.js
