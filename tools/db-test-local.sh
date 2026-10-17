#!/usr/bin/env bash
# W002: apply the baseline schema to an ISOLATED local PostgreSQL and run the
# owner-isolation tests; then apply the proposed hardening, re-test, roll back,
# and re-test. Never point this at Supabase.
#   PGHOST=/var/tmp PGPORT=54329 PGUSER=postgres tools/db-test-local.sh
set -euo pipefail
db="showduino_w002_$$"
psql -v ON_ERROR_STOP=1 -qc "create database $db"
trap 'psql -qc "drop database if exists $db" >/dev/null' EXIT
run() { psql -X -v ON_ERROR_STOP=1 -q -t -A -d "$db" "${@:2}" -f "$1"; }
run supabase/tests/local-supabase-stub.sql
run supabase/migrations/20261017090000_w002_baseline_live_schema.sql
run supabase/migrations/20261017090000_w002_baseline_live_schema.sql   # idempotent
echo "== baseline"; run supabase/tests/rls_owner_isolation.sql
run supabase/proposed/20261017090100_w002_hardening.sql
echo "== with proposed hardening"; run supabase/tests/rls_owner_isolation.sql -v phase=hardened
run supabase/proposed/20261017090100_w002_hardening.rollback.sql
echo "== after rollback"; run supabase/tests/rls_owner_isolation.sql
