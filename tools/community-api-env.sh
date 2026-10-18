#!/usr/bin/env bash
# Build an ISOLATED local API that behaves like the Supabase REST layer for the community tests:
# a throw-away PostgreSQL database with the Showduino schema (baseline + W004) and a PostgREST
# server in front of it. Never point this at Supabase.
#
#   PGHOST=... PGPORT=... PGUSER=postgres POSTGREST_BIN=/path/to/postgrest \
#     tools/community-api-env.sh start   # prints the PostgREST URL and JWT secret
#   tools/community-api-env.sh stop
set -euo pipefail
DB="${COMMUNITY_TEST_DB:-showduino_api_test}"
PORT="${POSTGREST_PORT:-54331}"
SECRET="${POSTGREST_JWT_SECRET:-local-test-secret-not-used-anywhere-else-0123456789}"
AUTH_PW="${AUTHENTICATOR_PASSWORD:-authenticator-local-test-only}"
STATE="${TMPDIR:-/tmp}/showduino-postgrest.pid"
run() { psql -X -v ON_ERROR_STOP=1 -q -d "$DB" -f "$1" > /dev/null; }

if [ "${1:-start}" = "stop" ]; then
  [ -f "$STATE" ] && kill "$(cat "$STATE")" 2>/dev/null || true
  rm -f "$STATE"
  psql -qc "drop database if exists $DB" > /dev/null
  exit 0
fi

psql -qc "drop database if exists $DB" -c "create database $DB" > /dev/null
run supabase/tests/local-supabase-stub.sql
run supabase/migrations/20261017090000_w002_baseline_live_schema.sql
run supabase/tests/w004_owner_fixture.sql
run supabase/migrations/20261018100000_w004_roles_and_community.sql
psql -X -v ON_ERROR_STOP=1 -q -d "$DB" -v pw="$AUTH_PW" > /dev/null <<'SQL'
select format('create role authenticator login noinherit password %L', :'pw')
 where not exists (select 1 from pg_roles where rolname = 'authenticator') \gexec
select format('alter role authenticator password %L', :'pw') \gexec
grant anon, authenticated to authenticator;
SQL

cat > "${TMPDIR:-/tmp}/showduino-postgrest.conf" <<CONF
db-uri = "postgres://authenticator:${AUTH_PW}@/${DB}?host=${PGHOST:-/var/run/postgresql}&port=${PGPORT:-5432}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${SECRET}"
server-port = ${PORT}
server-host = "127.0.0.1"
CONF
if [[ "${PGHOST:-}" != /* ]]; then
  sed -i "s#^db-uri.*#db-uri = \"postgres://authenticator:${AUTH_PW}@${PGHOST:-localhost}:${PGPORT:-5432}/${DB}\"#" "${TMPDIR:-/tmp}/showduino-postgrest.conf"
fi
"${POSTGREST_BIN:-postgrest}" "${TMPDIR:-/tmp}/showduino-postgrest.conf" > "${TMPDIR:-/tmp}/showduino-postgrest.log" 2>&1 &
echo $! > "$STATE"
for _ in $(seq 1 50); do
  curl -fsS "http://127.0.0.1:${PORT}/" > /dev/null 2>&1 && break
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/" > /dev/null
echo "POSTGREST_URL=http://127.0.0.1:${PORT}"
echo "POSTGREST_JWT_SECRET=${SECRET}"
