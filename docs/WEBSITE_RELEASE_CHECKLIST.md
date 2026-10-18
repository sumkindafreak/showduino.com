# Showduino website — release checklist (W001)

Work through this before the site is declared ready for the February 2027 launch.
Tick an item only when its evidence exists. "Evidence" means a log, a screenshot, a CI run
or an SQL result, not "looks fine".

Issue IDs refer to `docs/WEBSITE_ISSUE_REGISTER.md`.

## 1. Must be done before launch

| ✓ | Item | Issue | How to prove it |
|---|---|---|---|
| ☐ | Review and merge the W001 branch (injection fix, deploy pre-flight, import checks, CI) | W-001, W-002, W-005 | Draft PR CI green; browser tests pass |
| ☐ | Remove the legacy forum from the published site; export or delete its Firebase data; close the project | W-003 | 404 at `/HauntSyncForum_Configured/forum.html`; Firebase console shows the project disabled |
| ☐ | Remove `preview/` from the published site, or gate it off in production | W-008 | 404 or a "disabled" page |
| ☐ | Add SRI to every CDN script (or self-host), then a CSP; test sign-in, Google, avatar and Studio with the CSP on | W-004 | Browser console has no CSP violations during the full HauntSync and Studio workflow |
| ☐ | Enable leaked-password protection; set email OTP expiry ≤ 1 h | W-009 | Supabase security advisor shows no auth warnings |
| ☐ | Check the Supabase Auth redirect allow-list, Google OAuth client and SMTP sender against `docs/HAUNTSYNC_SIGNUP_LAUNCH_CHECKLIST.md` | W-009 | Screenshots of each settings page |
| ☐ | Commit the live database schema and policies as migrations; add an RLS check in CI | W-006 | `supabase db diff` empty; CI fails if a table loses RLS |
| ☐ | Revoke unneeded table grants | W-012 | Grants query shows only the privileges each policy needs |
| ☐ | Add reporting and hiding for public content; reserve usernames; write a moderation procedure | W-007 | Report → hidden → no longer listed, shown in a test |
| ☐ | Size limit on `projects.project_data`; per-user limits on public inserts | W-007, W-013 | An oversized insert is refused |
| ☐ | Public author name is never derived from the email address | W-010 | New Google account publishes as a chosen name |
| ☐ | Privacy notice: controller, lawful basis, retention, processors and locations, right to complain; account deletion route | W-011 | Notice reviewed by the owner; deletion removes the auth user, rows and avatar |
| ☐ | Confirm the hosting target; protect `main` with required checks; publish only site files | W-015 | Settings screenshots; a test PR cannot merge with a failing check |
| ☐ | Post-deploy smoke test against `https://show-duino.com` (every page 200, no console errors, sign-in page loads Supabase) | W-015 | Scheduled CI run |
| ☐ | Two-account production test of every HauntSync workflow (acceptance C1–C14) with dedicated test accounts, deleted afterwards | — | Filled-in `WEBSITE_ACCEPTANCE_RESULTS.md` section C |
| ☐ | Decide the Studio deploy scope per node type (extend the firmware policy, or keep MOSFET and ESTOP pixels export-only); bench-test a real upload | W-002, W-016 | Bench log from a real S3/P4 |
| ☐ | Life-safety statement on every page that describes emergency behaviour, including the home page | W-014 | Grep plus page review |

## 2. Should be done before launch

| ✓ | Item | Issue |
|---|---|---|
| ☐ | Skip link; fix heading order; run axe-core in CI | W-021 |
| ☐ | Confirm or fix the home page horizontal overflow in a real browser | W-021 |
| ☐ | Replace retailer-hotlinked photos with your own photographs | W-019 |
| ☐ | Canonical and Open Graph tags on every public page | W-020 |
| ☐ | Stop local-network probes on the public HTTPS Studio | W-017 |
| ☐ | Ask before an import overwrites a saved project | W-025 |
| ☐ | Restrict published avatar URLs to the project's own storage | W-026 |
| ☐ | Align the Relay/MOSFET wording; add Lamp, MOSFET and Pixel boards to the Hardware page; link the emergency procedures once PR #33 is merged | W-024 |

## 3. After launch / housekeeping

| ✓ | Item | Issue |
|---|---|---|
| ☐ | Move unreferenced media and CAD files out of the published tree; compress images | W-018 |
| ☐ | Fix or retire `touchscreen-ui.html` | W-022 |
| ☐ | Archive Firebase/Stripe/PayPal code and docs; close stale branches and draft PRs | W-023 |

## 4. Rollback

The site is static. To roll back, revert the merge commit on `main` and redeploy.
Database changes need their own reverse migration, written **before** the forward
migration is applied. Never apply a migration to production without first running it
against a Supabase branch or a copy.

## 5. Sign-off

| Role | Name | Date | Evidence location |
|---|---|---|---|
| Owner | | | |
| Second reviewer (security) | | | |
