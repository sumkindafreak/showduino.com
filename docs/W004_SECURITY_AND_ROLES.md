# W004: exclusive founder ownership, community security and deployment

What W004 changed in the database and website, how it was tested, and how to deploy and roll it
back. Each claim says which level of evidence supports it.

## 1. Owner identification

| Step | Evidence |
|---|---|
| Live Supabase project `fczxcvlyydcqdhjkejmd` had exactly one Auth user on 2026-10-18: `c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea` (confirmed email, email/password sign-in, created 2026-08-07) | Read-only SQL on `auth.users` and `auth.identities` |
| No account carried role-like metadata (`role`, `admin`, `is_admin`) or `is_super_admin` | Read-only SQL: 0 rows |
| The founder confirmed that account ID as theirs in the W004 session | Founder's answer, 2026-10-18 |
| Ownership is bound to that UUID only, never to the profile name "Showduino-admin" or the username | `app_owner_pinned` check constraint |

## 2. Database changes

All in `supabase/migrations/20261018100000_w004_roles_and_community.sql`.

| Area | Change |
|---|---|
| Owner | `app_owner`: one row, pinned UUID, no API privileges, RLS with no policies, guard trigger on insert/update/delete/truncate, owner login protected by `ON DELETE RESTRICT` |
| Roles | `is_owner()`, `require_owner()`, `my_community_status()`. Members have no way to change roles. |
| Member status | `member_status` (active / restricted / suspended). Writable only through `admin_set_member_status`; the owner cannot be restricted or suspended. |
| Posts | Categories table (owner-managed); post kind; optional image (own folder only, enforced twice); link to the author's own shared show; status, featured and moderation fields; edit marker; server-set author name; rate limits; column-level grants |
| Comments | One-level replies (same post enforced), moderation fields, server-set author name, rate limits, column grants |
| Shared shows | Moderation fields, server-set author label, rate limit, visibility requires a public author |
| Follows | `creator_follows`. Public only when both people have published profiles. |
| Reports | `content_reports`: one per member per item, target must exist, visible only to the reporter and the owner |
| Audit | `moderation_log`: append-only (update, delete and truncate refused, including for the superuser); written by every owner function |
| Owner functions | `admin_moderate`, `admin_resolve_report`, `admin_set_member_status`, `admin_save_category`, `admin_clear_avatar`, `admin_list_members`, `admin_stats`. Each checks `is_owner()` in the database. |
| Impersonation | Reserved names for members (admin, founder, moderator, official, showduino, hauntsync, staff and others), checked after removing spaces and punctuation |
| Storage | `community-images` bucket: public read, 3 MB, JPEG/PNG/WebP; insert into own folder with a fixed name pattern; owner can delete images and avatars for moderation |
| W002 hardening (folded in) | Removed unneeded table grants (W-012), 1 MB project limit (W-013), signup name no longer taken from the email (W-010), published avatars must come from this project's storage (W-026) |

Private Studio data is unchanged: `profiles`, `projects` and `devices` remain owner-only. Visitors now have no privileges on them at all.

## 3. Test evidence

| Level | What | Result |
|---|---|---|
| Database (local PostgreSQL 16, and CI) | `supabase/tests/w004_roles_community.sql` | **141 checks pass.** They run as a visitor, a member, a hostile member (forged `app_metadata.role=admin` claims), an unpublished member, a restricted member, a suspended member and the owner. Every refusal was checked for the intended error. |
| Database | `supabase/tests/rls_owner_isolation.sql` (W002) | Passes before W004, after W004, and after rollback |
| Rollback | `supabase/rollback/20261018100000_w004_roles_and_community.rollback.sql` | Restores the pre-W004 catalogue **exactly** (219 lines of policies, grants, column grants, columns, constraints, function bodies and privileges, triggers, buckets, RLS flags). Re-applying after rollback passes all 141 checks again. |
| API (CI) | `tests/api/community-api.test.cjs`: the site's own modules + real `@supabase/supabase-js` 2.111.0 + real PostgREST 12.2.3 + PostgreSQL with W004 | Pass |
| Full stack in a browser (CI) | `tests/api/community-fullstack.cjs`: the real pages, real supabase-js from the CDN, real PostgREST | Pass. A member posts via the UI, gets a server-set author, is refused the admin page, and `admin_stats`/`app_owner` are refused from the console. The founder hides the post (database row + audit entry). Visitors no longer see it. |
| Browser UI (local + CI) | `tests/browser/hauntsync-community-ui.cjs` with an in-memory data fixture | 7/7 pass: roles, hostile text inert, posting, replies, keyboard report dialog, owner dashboard, protected owner row, phone layout |
| Production | See §5 | Filled in after deployment |
| Real devices | Not tested | Phones and tablets: see `docs/STUDIO_DEVICE_TEST_CHECKLIST.md` |

**Not covered:**
- **Supabase Storage upload policies** are tested in SQL only. The API tests stub the Storage server.
- **Google sign-in, password reset and session refresh** are unchanged by W004 and were not re-tested against real Supabase Auth.
- **PostgreSQL 17.** Live runs version 17; the tests run 16. §5 compares the live catalogue after deployment.

## 4. XSS and upload safety
- All community text is rendered with `textContent`: titles, posts, comments, names, bios, report details, moderation reasons and log entries.
- Links are built only from validated usernames and UUIDs.
- Images are shown only from paths in the project's own buckets, never from user-supplied URLs.
- Uploads are checked by magic bytes in the browser. The bucket allows only image MIME types, the size limit is enforced by the bucket, and the path pattern is enforced by policy.
- Search text is stripped to letters, digits, spaces and `_ ' -` before it reaches a PostgREST filter, so filter syntax cannot be injected; this is tested.

## 5. Deployment
1. **Backup.** Live holds 1 Auth user, 1 profile and 1 creator publication, and 0 posts, comments, shared shows, projects, devices or avatars. The migration does not rewrite any of them. Record the live catalogue with `supabase/tests/catalogue_snapshot.sql` (read-only) before applying.
2. **Apply** the migration (Supabase dashboard SQL editor, `supabase db push`, or the Supabase MCP `apply_migration`).
3. **Compare** the live catalogue after applying with the tested one.
4. **Run the security advisor** and confirm there are no new warnings.
5. **Merge** the website pull request. Cloudflare deploys in 1–2 minutes.
6. **Smoke test**: production smoke workflow (strict), then read-only checks of the new pages and API.

Between steps 2 and 5, old website code that shares a show still sends `author_label` and would be refused. No live user has shared a show, so this window is acceptable.

## 6. Rollback
1. **Export** the new tables (CSV from the Table editor, or `supabase db dump --data-only`), and empty the `community-images` bucket.
2. **Run** `supabase/rollback/20261018100000_w004_roles_and_community.rollback.sql`.
3. **Revert** the website merge (`git revert -m 1 <merge>`) or roll back the Cloudflare deployment.
