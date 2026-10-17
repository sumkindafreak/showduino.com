# Website security hotfix — Mission W002

| | |
|---|---|
| Date | 2026-10-17 |
| Repository | `sumkindafreak/showduino.com` |
| Production | `main` at `d7b3b93`, served by Cloudflare Pages (see `WEBSITE_PRODUCTION_DEPLOYMENT_W002.md`) |
| Release candidate | **PR #62** `w002/hotfix-minimal` → `main` (draft) |
| Stacked hardening | **PR #61** `w002/security-hotfix` → `w002/hotfix-minimal` (draft) |
| Audit history | **PR #60** `w001/website-audit` (draft, unchanged code; register and acceptance updated) |
| Firmware repository | `sumkindafreak/new_showduino`, read only, not modified |

**Decision: READY FOR REVIEW (PR #62).** Two further items need the owner:
* **PR #61 is REQUIRES OWNER CONFIGURATION** (Cloudflare dashboard and Firebase checks below).
* **Database hardening is BLOCKED by design**: proposed only, and not applied without approval.

Nothing has been merged or deployed. No production database row, setting, Firebase record or Cloudflare setting was changed.

## 1. Why two PRs

The smallest safe patch is the Studio code fix, so it is a release on its own.
Headers, redirects, SRI and schema files change how the whole site is served. They need
the owner's Cloudflare and Firebase checks, and they must not delay the injection fix.

| PR | Contains | Touches pages, headers or database? | Release risk |
|---|---|---|---|
| **#62** hotfix | W-001, W-002, W-005; every Studio and HauntSync HTML sink found; tests; CI | No (JavaScript, tests, workflows; one `rel="noopener"` attribute) | Low: same pages, same scripts, same CDN |
| **#61** hardening (stacked on #62) | Cloudflare `_headers` (HSTS, nosniff, frame, CSP enforced for `object-src`/`base-uri`/`frame-ancestors`, full CSP **report-only**), `_redirects` retiring legacy routes, SRI on all third-party scripts, schema baseline, RLS tests, proposed DB hardening, production smoke probe, mocked HauntSync workflow tests | Yes: headers and routes for every page | Medium; needs the checks in §6 |

The Studio JavaScript is identical on both branches (`git diff w002/hotfix-minimal w002/security-hotfix -- js app.js script.js` is empty).

## 2. Status of every correction

Columns:
* **Impl**: implemented on the branch.
* **Auto**: automated test in CI.
* **Browser**: real Chromium test.
* **Prod**: verified on `show-duino.com`.
* **Owner**: needs owner action.

| ID | Correction | PR | Impl | Auto | Browser | Prod | Owner |
|---|---|---|---|---|---|---|---|
| W-001 | Clip label rendered as text (`js/timeline-fx-daw.js`) | #62 | ✅ | ✅ static guard | ✅ original W001 file: 2 executions on `main`, 0 on hotfix (1366 and 390 px, after reload too) | ❌ production still serves `innerHTML` (fetched 2026-10-17) | merge and deploy |
| W002-S1 | Project browser name as text (`js/timeline.js`) | #62 | ✅ | ✅ | ✅ fuzz | ❌ | merge |
| W002-S2 | Legacy inspector: no inline `onclick` built from IDs; labels, params and colours escaped; colours `#hex` only | #62 | ✅ | ✅ | ✅ fuzz | ❌ | merge |
| W002-S3 | Import refuses identifiers outside `[A-Za-z0-9_.:-]{1,128}` | #62 | ✅ | ✅ | ✅ fuzz + firmware example imports | ❌ | merge |
| W002-S4 | Firebase-era templates (`app.js`, `js/panels.js`) escaped; `rel="noopener"` | #62 | ✅ | ✅ | — (dormant) | ❌ | merge |
| W002-S5 | Device SD file names and error messages as text (`js/panels.js`) | #62 | ✅ | ✅ | ✅ 5 executions before, 0 after | ❌ | merge |
| W-002 | Deploy pre-flight mirrors the firmware upload policy; nothing sent if any cue is refused | #62 | ✅ | ✅ | — (needs hardware) | ❌ | merge; firmware scope decision; bench test |
| W-005 | Import requires a Showduino shape; 5 MB cap | #62 | ✅ | ✅ | ✅ round trip | ❌ | merge |
| W-003 | Legacy Firebase forum no longer served (`_redirects` → `/retired`) | #61 | ✅ | ✅ config test | ✅ branch preview: redirects | ❌ still served | merge; Firebase rules check (§5) |
| W-008 | Production-connected preview forum no longer served | #61 | ✅ | ✅ | ✅ preview | ❌ still served | merge |
| W-015 | Repository internals (`supabase/`, `functions/`, `tests/`, deploy notes) not served | #61 | ✅ | ✅ | ✅ preview | ❌ SQL still served | merge |
| W-004a | SRI on every third-party script (bytes matched to the npm tarball in CI) | #61 | ✅ | ✅ supply-chain step | ✅ preview `page-integrity=MATCHES` | ❌ missing | merge |
| W-004b | Security headers (HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy, COOP) | #61 | ✅ | ✅ | ✅ preview headers present | ❌ only nosniff and Referrer-Policy present | merge; check Cloudflare zone rules |
| W-004c | CSP: `object-src`/`base-uri`/`frame-ancestors` enforced; full policy report-only | #61 | ✅ | ✅ inline-hash check | ✅ preview: 0 violations on 14 of 15 pages; Studio 4 (W-017 local probes) | ❌ no CSP | merge; enforce later (§4) |
| W-006 | Live schema under version control; 21 owner-isolation checks in CI | #61 | ✅ | ✅ on a throw-away PostgreSQL | — | n/a | confirm with `supabase db diff` |
| W-010/012/013/026 | Proposed DB hardening with rollback | #61 | ✅ file only | ✅ on a throw-away PostgreSQL | — | **not applied** | approve, test on a Supabase branch, then apply |
| Sessions | Sign-out uses global logout and removes the stored session | #61 test | (existing code) | ✅ mocked Supabase | ✅ | ❌ | — |

## 3. Sink audit (Phase 2)

Every `innerHTML`, `outerHTML` and `insertAdjacentHTML` assignment in tracked
JavaScript and HTML was listed by script: 34 assignments contained interpolated
expressions. Each was classified by hand.

| Result | Files and locations |
|---|---|
| **Fixed: user, file or device text reached HTML** | `js/timeline-fx-daw.js` clip title; `js/timeline.js` project browser and legacy inspector; `js/panels.js` SD file list and error messages; `app.js` Firebase templates |
| Already escaped (`esc`, `tlEsc`, `appEsc`, `panelEsc`, `escapeHtml`) | `js/studio-mobile.js`, `js/studio-v4.js`, `js/studio-first-show.js`, `js/timeline-professional-inspector.js` (`field()`/`selectField()` escape), `js/showduino-pixel-authoring.js` `selectHtml`, `js/current-system-ui.js` (text escaped inline), `js/hauntsync-dashboard.js`, `js/account-page.js`, `preview/hauntsync-preview.js` |
| Constants or numbers only | `js/studio-ollie-ux.js` cue meta, `js/timeline-fx-daw.js` presets, `js/dmx_editor.js`, `js/led_studio.js`, `js/studio-v4.js` counters, `js/studio-creator-bootstrap.js` pixel colours (`rgb()` from clamped numbers) |
| Server-generated IDs | `preview/hauntsync-preview.js` post, comment, project and device UUIDs |
| Not reachable from current pages | `script.js` segment template |

HauntSync renders community and creator data with `textContent` (`js/hauntsync-library.js`, `js/hauntsync-public-creators.js`).

Dynamic URLs:
* Creator website links pass `safeWebsite()` (HTTPS only, no credentials).
* Avatars must be HTTPS and load with `referrerPolicy="no-referrer"`.
* Creator links use `encodeURIComponent`.
* Studio's `?project=` loads only through RLS-scoped queries.

The new creator-publishing browser test serves a hostile publication (script in the name, bio and focus, a `javascript:` website and an `http:` avatar). It confirms there is no execution, no unsafe link and no `http:` avatar request.

## 4. Adversarial coverage

| Test | What it does | Result |
|---|---|---|
| `tests/browser/studio-hostile-import-fuzz.cjs` | Puts a payload in **every string** of a multi-node project and imports it. Runs a second variant that writes it straight into storage, bypassing the import guard. Visits all 10 panels, desktop toolbar buttons, clips, 3 phone tabs, all 7 phone cue editors and the project browser, then reloads | 0 executions; 1–2 on the old `timeline.js` |
| `tests/browser/studio-import-injection.cjs` | Hostile labels, names, node IDs and file names at 1366 and 390 px | 0 executions; 2 on `main` |
| Original W001 file (sha256 `bffc6c5f…`, kept outside the repository) | Same file as reported in W001 | hotfix 0, `main` 2 per width |
| `tests/browser/studio-device-filenames.cjs` | Hostile SD file names and device error messages | 0 executions; 5 before the fix |
| `tests/browser/hauntsync-creator-publishing.cjs` (#61) | Publish, unpublish and hostile public creator values, mocked Supabase | pass (CI) |
| `tests/browser/hauntsync-mocked-workflows.cjs` (#61) | Sign-in, global sign-out, community download into Studio, cloud 503 and offline | pass (CI) |
| `tests/studio-firmware-upload-policy.test.cjs` | Every allowed and refused command family, time and length limits, newline | pass |

Compatibility:
* `new_showduino/examples/productions/first-audio-test.shdo` imports unchanged.
* The identifier rule accepts every ID Studio generates.
* Stored local and cloud projects are not re-validated, so nothing saved is locked out.

## 5. Legacy exposure (Phase 3)

| Route | Production today (CI probe 2026-10-17) | After #61 |
|---|---|---|
| `/HauntSyncForum_Configured/*` (Firebase forum) | **served** | 302 → `/retired` |
| `/preview/hauntsync.html` (writes to production `community_posts`) | **served** | 302 → `/retired` |
| `/supabase/*.sql`, `/tests/*`, `/tools/*`, `/docs/*`, deploy notes | **served** | 302 → `/retired` |
| `/functions/index.js` | 404 | 302 → `/retired` |

The change is reversible: delete a line in `_redirects`. No file, Firebase record or Supabase row is deleted. `noindex` alone was not relied on.

**Email exposure in the forum.** `forum.js` stores `user: <email>` in each thread and shows it to readers.

A field-masked, unauthenticated Firestore REST query (CI, no personal data requested) returned **HTTP 403 PERMISSION_DENIED** for both `threads` and `users`. Anonymous visitors cannot read posters' emails.

The rules for **signed-in** forum users are not in any repository, and the forum allows self-registration. Anyone who registers may therefore be able to read every poster's email.

Containment, which needs the owner:
1. Read the Firestore rules in the Firebase console for project `hauntsync-forum-4b992`.
2. If `threads` is readable by any signed-in user, export the data. Then set the rules to deny all access and disable Email/Password sign-up in Firebase Auth.
3. Decide retention: keep the export privately, or delete it.

## 6. Owner configuration required before merging #61

1. **Production project.**
   * Confirm which Cloudflare Pages project serves `show-duino.com`. Three projects build this repository: `showduino-com`, `showduinoweb`, `showduino-web`.
   * Remove or pause the duplicates.
2. **Zone-level rules.**
   * Production already sends `X-Content-Type-Options` and `Referrer-Policy` without `_headers`, so a Cloudflare zone rule probably adds them.
   * Check that zone rules do not conflict with or duplicate `_headers`.
3. **Branch previews.**
   * Preview deployments are public, for example `w002-security-hotfix.showduino-com.pages.dev`, and use the production Supabase project.
   * Old branch previews still serve the vulnerable Studio. Restrict them (Cloudflare Access) or delete the old ones.
4. **CSP enforcement.**
   * Run the report-only policy for at least a week.
   * Fix the remaining Studio violations (W-017 local probes; inline event handlers).
   * Then move the policy into the enforced header. Sign-in, Google OAuth and avatar upload must be retested at that point.
5. **Supabase Auth.**
   * Enable leaked-password protection; set OTP expiry ≤ 1 h.
   * Verify the redirect allow-list and the Google OAuth client.

## 7. CI evidence (exact commits)

| Branch | Commit | Runs |
|---|---|---|
| `w002/hotfix-minimal` (#62) | `b100aba` | Studio Validate 39071457895 ✅ · Website static smoke 39071458015 ✅ · Website browser tests 39071458025 ✅ · Cloudflare previews ✅ |
| `w002/security-hotfix` (#61) | `63dabd8` | Database RLS tests 39072116202 ✅ · Studio Validate 39072116148 ✅ · Website static smoke 39072116141 ✅ · Website browser tests 39072116182 ✅ (7 browser steps) · Website production smoke 39072112805 ✅ |

The documentation commit that adds this file is recorded in PR #62.

Local results on `w002/hotfix-minimal`:

| Check | Result |
|---|---|
| Node tests | 14 / 14 |
| `tools/check-website.mjs` | pass |
| Browser tests | 4 / 4 |

## 8. After approval

1. Merge #62 (squash or merge commit; both are fine).
2. Wait for the Cloudflare production build.
3. Run the post-deploy checks in `WEBSITE_PRODUCTION_DEPLOYMENT_W002.md` §4. The key one: `https://show-duino.com/js/timeline-fx-daw.js` must contain `title.textContent`.
4. Then review #61 against §6.
