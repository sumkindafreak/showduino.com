#!/usr/bin/env bash
# Apply the Showduino schema to an ISOLATED local PostgreSQL and test it. Never point this at
# Supabase.
#   PGHOST=/var/tmp PGPORT=54329 PGUSER=postgres tools/db-test-local.sh
#
# W002: baseline (live schema reconstruction) + owner-isolation tests.
# W004: roles/community migration, its role and moderation tests, the W002 tests with the
#       folded-in hardening, a rollback that must restore the exact pre-W004 catalogue, and a
#       re-apply after rollback.
set -euo pipefail
db="showduino_test_$$"
tmp="$(mktemp -d)"
psql -v ON_ERROR_STOP=1 -qc "create database $db"
trap 'psql -qc "drop database if exists $db" >/dev/null; rm -rf "$tmp"' EXIT
run() { psql -X -v ON_ERROR_STOP=1 -q -t -A -d "$db" "${@:2}" -f "$1"; }
W004=supabase/migrations/20261018100000_w004_roles_and_community.sql
W004_ROLLBACK=supabase/rollback/20261018100000_w004_roles_and_community.rollback.sql

run supabase/tests/local-supabase-stub.sql
run supabase/migrations/20261017090000_w002_baseline_live_schema.sql
run supabase/migrations/20261017090000_w002_baseline_live_schema.sql   # idempotent
echo "== baseline"; run supabase/tests/rls_owner_isolation.sql

run supabase/tests/w004_owner_fixture.sql
run supabase/tests/catalogue_snapshot.sql > "$tmp/before.txt"
run "$W004" > /dev/null
echo "== W002 isolation tests after W004 (includes the W002 hardening)"; run supabase/tests/rls_owner_isolation.sql -v phase=hardened
echo "== W004 roles, community and moderation"; run supabase/tests/w004_roles_community.sql | grep -E '^(FAIL|==)' || true
run supabase/tests/w004_roles_community.sql > /dev/null   # fails the script if any check failed

run "$W004_ROLLBACK"
run supabase/tests/catalogue_snapshot.sql > "$tmp/after.txt"
if ! diff -u "$tmp/before.txt" "$tmp/after.txt"; then
  echo "FAIL: W004 rollback did not restore the pre-W004 catalogue" >&2
  exit 1
fi
echo "== W004 rollback restores the pre-W004 catalogue exactly ($(wc -l < "$tmp/before.txt") catalogue lines)"
echo "== after W004 rollback"; run supabase/tests/rls_owner_isolation.sql

run "$W004" > /dev/null
echo "== W004 re-applied after rollback"; run supabase/tests/w004_roles_community.sql | grep -E '^(FAIL|==)' || true
run supabase/tests/w004_roles_community.sql > /dev/null

# W005: community protection (look-alike names, account limits, moderation evidence,
# smaller public surface), its rollback to the exact W004 catalogue, and a re-apply.
W005=supabase/migrations/20261023090000_w005_community_protection.sql
W005_ROLLBACK=supabase/rollback/20261023090000_w005_community_protection.rollback.sql
run supabase/tests/catalogue_snapshot.sql > "$tmp/w004.txt"
run "$W005" > /dev/null
echo "== W005 community protection"; run supabase/tests/w005_community_protection.sql | grep -E '^(FAIL|==)|FAIL' || true
run supabase/tests/w005_community_protection.sql > /dev/null
echo "== W004 checks still hold with W005 applied"; run supabase/tests/w004_roles_community.sql | grep -E '^(FAIL|==)|FAIL' || true
run supabase/tests/w004_roles_community.sql > /dev/null
echo "== W002 owner isolation with W005 applied"; run supabase/tests/rls_owner_isolation.sql -v phase=hardened | tail -1
run "$W005_ROLLBACK" > /dev/null
run supabase/tests/catalogue_snapshot.sql > "$tmp/w005-rolled-back.txt"
if ! diff -u <(grep -v moderation_log "$tmp/w004.txt") <(grep -v moderation_log "$tmp/w005-rolled-back.txt"); then
  echo "FAIL: W005 rollback did not restore the W004 catalogue" >&2
  exit 1
fi
echo "== W005 rollback restores the W004 catalogue exactly"
run "$W005" > /dev/null
run supabase/tests/w005_community_protection.sql > /dev/null
echo "== W005 re-applied after rollback: tests pass"
