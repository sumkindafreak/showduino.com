# W005: community protection (W5-07, W5-08, W5-11, W5-14)

Migration `supabase/migrations/20261023090000_w005_community_protection.sql`, rollback
`supabase/rollback/20261023090000_w005_community_protection.rollback.sql`, tests
`supabase/tests/w005_community_protection.sql`.

**Status: written and tested on PostgreSQL 16. Not applied to production.** Apply only after
review, using the steps below.

## What it changes

| Finding | Change |
|---|---|
| W5-07 look-alike names | `name_fold()` folds a name before the reserved-word check: Unicode NFKD (accents, full-width letters), Cyrillic and Greek look-alikes (capitals first, because capital Eta looks like H but lower-case eta looks like n), digits and symbols used as letters (0 3 4 5 7 8 9 @ $ !), with `1` and `|` tried as both `i` and `l`; zero-width and punctuation are dropped. "Sh0wduino Team", a Cyrillic-o "Showduino", "Shówduino", "ＳＨＯＷＤＵＩＮＯ", "F0under", "Adm1n" and "0fficia\|" are now refused. |
| W5-08 quotas | `account_limits` table (readable, not writable by members): 100 cloud shows (50 a day), 200 devices (100 a day), 5 stored avatars (10 a day), 200 post images (20 a day). Enforced by triggers on `projects` and `devices` and by the storage insert policies. Suspended members cannot upload avatars. The owner and server-side tasks are not limited. `my_usage()` returns the caller's own counts. |
| W5-11 moderation evidence | Members cannot delete their own posts, comments or shared shows once hidden or removed. The owner deletes files through the Storage API (Supabase blocks SQL deletes) and `admin_record_file_removal()` writes each deletion to `moderation_log`. "Clear photo" now deletes the stored avatar files as well as the link; "Remove" on a post also deletes its image. |
| W5-14 public surface | `member_state()` shows other people's `restricted` state as `active` (only the member and the owner see it; `suspended` stays visible because suspended content disappears anyway). `public_name()` no longer returns a private profile name for someone else. |

Unchanged: the single pinned owner (`app_owner`), `is_owner()`, all owner functions, RLS on
every table, private profiles, projects and devices.

## Test evidence (local PostgreSQL 16, `tools/db-test-local.sh`)

| Suite | Result |
|---|---|
| W005 community protection | 77/77 checks pass |
| W004 roles and community, with W005 applied | 141/141 checks pass |
| W002 owner isolation, with W005 applied | 21/21 checks pass |
| W005 rollback | Restores the W004 catalogue exactly |
| W005 re-applied after rollback | Tests pass |
| API (CI): `tests/api/community-api.test.cjs` | Real PostgREST + supabase-js; adds logged image removal and Clear photo |
| Browser: `tests/browser/hauntsync-community-ui.cjs` | Clear photo and Remove send the reason; image file removed with a removed post |

Not covered locally: Supabase Storage itself (the tests use a stub `storage.objects` table) and
PostgreSQL 17. Check both on a Supabase branch or right after applying.

## Applying to production (founder approval required)

1. Read the migration. Record the live catalogue: run `supabase/tests/catalogue_snapshot.sql`
   (read-only) and keep the output.
2. Apply the migration (Supabase SQL editor, `supabase db push`, or the Supabase MCP
   `apply_migration` with the file's exact contents).
3. Run the Security Advisor. New, expected entries: `within_limit`, `my_usage` and
   `admin_record_file_removal` are SECURITY DEFINER functions callable by signed-in users
   (each checks the caller itself).
4. Smoke test as the owner: open Admin → Members → the counts load; upload and remove a test
   post image on a test account; check the audit log shows `file_removed`.
5. Merge the website pull request (it calls `admin_record_file_removal`; until the migration
   is live, "Delete image file" deletes the file but reports an error when logging it).

## Rollback

Run the rollback file. It restores the W004 functions and policies and drops the limits table.
`moderation_log` is append-only, so it keeps a `migration_applied` and a `migration_rolled_back`
entry.
