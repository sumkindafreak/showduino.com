#!/usr/bin/env bash
# Take a logical backup of the Showduino Supabase database with the Supabase CLI.
#   SUPABASE_DB_URL='postgresql://…' tools/backup-dump.sh <folder outside this repository>
# Read-only against the database. Writes roles.sql, schema.sql and data.sql to a dated
# folder, readable only by you. Stored images are NOT included. See docs/BACKUP_AND_RECOVERY.md.
set -euo pipefail
umask 077
dest="${1:-}"
[ -n "$dest" ] || { echo "usage: SUPABASE_DB_URL=… $0 <folder outside this repository>" >&2; exit 2; }
[ -n "${SUPABASE_DB_URL:-}" ] || { echo "Set SUPABASE_DB_URL (dashboard → Connect). It is never stored by this script." >&2; exit 2; }
command -v supabase >/dev/null || { echo "The Supabase CLI is not installed." >&2; exit 2; }

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
# Resolve the destination before creating anything, so a refused path leaves no folder behind.
parent="$(dirname "$dest")"
[ -d "$parent" ] || { echo "The folder $parent does not exist. Create it first." >&2; exit 2; }
dest="$(cd "$parent" && pwd -P)/$(basename "$dest")"
case "$dest/" in
  "$repo"/*) echo "Refusing: $dest is inside the website repository, and everything there is published." >&2; exit 1 ;;
esac
mkdir -p "$dest"

out="$dest/showduino-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$out"
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$out/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$out/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$out/data.sql"

for f in roles.sql schema.sql data.sql; do
  [ -s "$out/$f" ] || { echo "FAIL: $f is empty; this backup is not usable." >&2; exit 1; }
done
( cd "$out" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS )
echo "Backup written to $out"
echo "Rows per table (for the restore drill):"
grep -E '^COPY ' "$out/data.sql" | sed -E 's/^COPY ([^ ]+).*/\1/' | while read -r table; do
  rows="$(awk -v t="$table" '$0 ~ "^COPY " t " " {c=1; next} c && /^\\\.$/ {exit} c {n++} END {print n+0}' "$out/data.sql")"
  echo "  $table $rows"
done
echo "This folder holds personal data. Encrypt it and keep it off shared drives."
