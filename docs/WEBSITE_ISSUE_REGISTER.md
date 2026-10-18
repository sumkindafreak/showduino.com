# Showduino website — issue register (W001)

Audit of `sumkindafreak/showduino.com` at `d7b3b93` (branch `main`, rechecked
2026-10-17), the live site `https://show-duino.com`, and the production Supabase
project `showduino` (`fczxcvlyydcqdhjkejmd`, read-only catalogue queries only).

**Evidence type** for each issue:
* **CI** = code inspection.
* **BR** = real headless-Chromium test against a local copy of the repository.
* **DB** = read-only SQL against production. Isolation tests ran inside transactions that were rolled back; no user rows were read.
* **LIVE** = fetch of the deployed page.

**Status**:
* **OPEN**: not fixed.
* **FIXED**: corrected on branch `w001/website-audit`, not deployed.
* **VERIFIED**: fixed and proven by a test in this repo.
* **BLOCKED**: needs access or a decision the audit did not have.

Nothing has been deployed. "VERIFIED" means verified on the branch, not in production.

## W002 status update (2026-10-17)

Mission W002 split the security work into two draft PRs. Neither is merged or deployed.
* **#62** `w002/hotfix-minimal` → `main`: Studio code fixes.
* **#61** `w002/security-hotfix` → `w002/hotfix-minimal`: headers, redirects, SRI, schema and tests.

Details are in `docs/WEBSITE_SECURITY_HOTFIX_W002.md` and `docs/WEBSITE_PRODUCTION_DEPLOYMENT_W002.md` on those branches.

**Status meanings:**
* **Impl**: implemented on a branch.
* **Auto**: covered by an automated test in CI.
* **Browser**: proven in real Chromium.
* **Prod**: verified on `show-duino.com`.
* **Owner**: awaiting owner action.

| ID | W002 status | Where | Impl | Auto | Browser | Prod | Owner |
|---|---|---|---|---|---|---|---|
| W-001 | Fixed; original W001 file executes 2× on `main`, 0× on the hotfix | #62 | ✅ | ✅ | ✅ | ❌ production still vulnerable (fetched 2026-10-17) | merge and deploy |
| W-002 | Fixed (pre-flight) | #62 | ✅ | ✅ | — | ❌ | merge; firmware scope; bench test |
| W-003 | Contained in #61 (`_redirects` → `/retired`); anonymous Firestore reads return 403 | #61 | ✅ | ✅ | ✅ preview | ❌ still served | Firebase rules for signed-in readers; export or retention decision |
| W-004 | SRI (npm-verified bytes), security headers, CSP report-only (enforced parts: `object-src`, `base-uri`, `frame-ancestors`) | #61 | ✅ | ✅ | ✅ preview | ❌ | merge; enforce CSP after a clean report-only period |
| W-005 | Fixed | #62 | ✅ | ✅ | ✅ | ❌ | merge |
| W-006 | Live schema baseline committed; 21 owner-isolation checks in CI on a throw-away PostgreSQL | #61 | ✅ | ✅ | — | n/a | confirm with `supabase db diff` |
| W-008 | Preview forum no longer served | #61 | ✅ | ✅ | ✅ preview | ❌ | merge |
| W-010, W-012, W-013, W-026 | Hardening SQL and rollback written and tested on a throw-away PostgreSQL. **Not applied** | #61 | file only | ✅ | — | ❌ | approve; Supabase branch; backup; apply |
| W-015 | Host verified: Cloudflare Pages (3 projects); GitHub Pages last deployed 2025-05-12. Internal files no longer served after #61 | #61 | ✅ | ✅ | ✅ preview | ❌ | pick the production project; branch protection |
| W-017 | Measured: the only CSP report-only violations (Studio local probes) | — | ❌ | — | ✅ | — | fix before enforcing CSP |
| W-027 | **New.** Old Cloudflare branch previews (`*.pages.dev`) still serve vulnerable Studio builds against the production Supabase | — | ❌ | — | — | — | restrict previews (Cloudflare Access) or delete old deployments |
| W-028 | **New.** Three Cloudflare Pages projects build this repository (`showduino-com`, `showduinoweb`, `showduino-web`) | — | ❌ | — | — | — | keep one; remove duplicates |
| W-029 | **New, fixed.** More Studio sinks found by fuzzing: project-browser name and legacy inspector (inline `onclick` from IDs); unsafe identifiers on import | #62 | ✅ | ✅ | ✅ | ❌ | merge |
| W-030 | **New, fixed.** Device SD file names and error messages written as HTML in `js/panels.js` (dormant panel) | #62 | ✅ | ✅ | ✅ | ❌ | merge |

Unchanged by W002: W-007, W-009, W-011, W-014 (in #60), W-016, W-018 to W-025.

## Summary

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| W-001 | **High** | Studio / security | Imported `.shdo` clip label executed as script | VERIFIED (branch) |
| W-002 | **High** | Studio ↔ firmware | Studio deploys MOSFET and Emergency-node pixel cues the firmware refuses (partial upload) | VERIFIED (branch) |
| W-003 | **High** | Legacy / privacy | Legacy Firebase forum still published; posts carry the poster's email address | OPEN (BLOCKED: owner decision, Firebase access) |
| W-004 | **High** | Security | No Content-Security-Policy, no SRI on CDN scripts, session token in localStorage | OPEN |
| W-005 | Medium | Studio | Any JSON object accepted as a project on import; no size limit | VERIFIED (branch) |
| W-006 | Medium | HauntSync / DB | Production schema and policies for 5 tables and the signup trigger are not in the repository | OPEN |
| W-007 | Medium | HauntSync / abuse | No moderation, reporting or rate limits for public content; free-text author names and usernames | OPEN |
| W-008 | Medium | HauntSync / DB | Hidden preview forum writes public posts to production `community_posts` | OPEN |
| W-009 | Medium | Auth | Leaked-password protection off; email OTP expiry above 1 hour | OPEN (Supabase setting) |
| W-010 | Medium | Privacy | Default display name is the email local-part and becomes the public author label | OPEN |
| W-011 | Medium | Privacy / legal | No self-service account deletion or export; privacy notice lacks controller, lawful basis, retention, third parties | OPEN |
| W-012 | Medium | DB | Excess table grants (TRUNCATE, TRIGGER, REFERENCES) to `anon`/`authenticated` | OPEN |
| W-013 | Medium | DB / abuse | `projects.project_data` unbounded; no per-user quota | OPEN |
| W-014 | Medium | Content / safety | Public pages did not state that emergency is not a life-safety system | VERIFIED (branch) |
| W-015 | Medium | Deployment | Deployment target unconfirmed; no branch protection; whole repository is publicly served | OPEN (BLOCKED: owner) |
| W-016 | Medium | Studio ↔ firmware | Features the firmware supports that Studio cannot author (Lamp Node), and authoring Studio cannot deploy (triggers) | OPEN |
| W-017 | Low | Studio | Public HTTPS Studio probes `192.168.4.1` and `showduino.local` on every load | OPEN |
| W-018 | Low | Performance | 24 MB unreferenced MP3, 21 MB `.3mf`, duplicate 2.3 MB PNGs, 1.3 MB image on `touchscreen-ui.html` | OPEN |
| W-019 | Low | Content | `tools.html` hotlinks product photos from five retailer websites | OPEN |
| W-020 | Low | SEO | No robots.txt or sitemap; canonical on 2 of 16 pages; social preview only on home | PARTLY FIXED |
| W-021 | Low | Accessibility | No skip link; heading-level skips on 6 pages; desktop home page ~18 px horizontal overflow | OPEN |
| W-022 | Low | Content | `touchscreen-ui.html`: missing image `images/hauntsync_qr.png`, missing AOS library | OPEN |
| W-023 | Low | Maintainability | Obsolete Firebase/Stripe/PayPal code and docs, 20+ stale branches, 10 open draft PRs, owner's local paths in docs | OPEN |
| W-024 | Low | Docs | Website links firmware docs on `new_showduino` `main`; the 001J–001L emergency procedures exist only on draft PR #33; relay vs MOSFET wording differs | OPEN |
| W-025 | Low | Studio | Importing a file whose project ID matches a saved local project overwrites it without asking | OPEN |
| W-026 | Info | Security | `creator_publications.avatar_url` accepts any HTTPS URL (third-party tracking/imagery) | OPEN |

## Details

### W-001 — Imported `.shdo` clip label executed as script (High)
* **Page / source:** `studio.html` → `js/timeline-fx-daw.js` `TimelineEditor.prototype._renderClip`.
* **Steps:**
  1. Create a `.shdo` whose clip label is `"><img src=x onerror=...>`.
  2. Import it in Studio (Projects → Import).
  3. Open the timeline.
* **Expected:** the label is shown as text.
* **Actual (BR, before the fix):** `window.__xss` = 2 on both 1366 px and 390 px. A MutationObserver traced the payload to `span.daw-clip-title` inside `.tl-clip`.
* **Impact:** script runs in the Studio origin. Supabase keeps its session in `localStorage`, so a malicious community template, once downloaded and imported, can act as the victim's account (read and alter projects, profile and avatar; publish or delete content).
* **Correction:** build the title and time spans with `textContent` (commit `e222208`).
* **Verification (BR):**
  * `tests/browser/studio-import-injection.cjs` imports a hostile file and visits all 10 panels at both widths. It fails before the fix (2 executions) and passes after (0).
  * `tests/studio-imported-text-safety.test.cjs` is a static guard that runs in CI.
* **Residual:** the browser test covers the 10 navigation panels and clicking or double-clicking clips. Inspector sub-forms, the Pixel FX Lab and the phone edit sheets were not each opened.

### W-002 — Studio deploys cues the firmware refuses (High)
* **Source:** `js/studio-deploy.js` `compileShdoForStage()` and `deployCurrentProject()`. The MOSFET path compiles `MOSFET:NODE:<id>:OUT:...`; Emergency-node pixels compile `ESTOP:NODE:PIXEL:...`.
* **Firmware evidence (CI):** `new_showduino/protocol/showduino_web_timeline_upload_policy.h` `payloadFamilyAllowed()` accepts only `PIXEL:` and `AUDIO:NODE:`. It is enforced in `firmware/s3-comms-controller/.../CommsWebServer.cpp:250` and `firmware/stage-engine-p4/.../WebApiHandler.cpp:50`.
* **Actual:** Studio sends `SHOW:TL:BEGIN` and cues one by one, so the first refused cue throws an error part-way. `SHOW:TL:END` is never sent, which leaves a partial RAM timeline. The partial-timeline effect on the P4 has not been tested on hardware.
* **Correction:** a JS mirror of the firmware envelope checks every command before anything is sent (commit `1fd8bb7`).
* **Verification:** `tests/studio-firmware-upload-policy.test.cjs` covers each allowed family, each refused family, the uint32 time limit, the 63-character limit and newlines.
* **Owner decision:** either extend the firmware policy to MOSFET and ESTOP pixels, or keep these cues export-only. Hardware test after either choice.

### W-003 — Legacy Firebase forum still published (High)
* **Source:** `HauntSyncForum_Configured/` (Firebase project `hauntsync-forum-4b992`).
* **LIVE:** `https://show-duino.com/HauntSyncForum_Configured/forum.html` loads, offering register/login, "Post Thread" and "Save Ritual Profile".
* **CI:** `forum.js` `postThread()` stores `user: user.email` and `loadThreads()` displays `user: content` to every visitor, so anyone who posted has their **email address published**. The forum's Firestore rules are not in this repository, so who can read or write is unknown.
* **Impact:**
  * privacy exposure,
  * an unmoderated second community outside HauntSync,
  * confusing branding,
  * a second account system.
* **Correction:** the branch adds `noindex` only. The recommended fix is to remove the folder from the deployed site, then export or delete the Firebase data and close the project. That needs the owner's decision and Firebase access (BLOCKED).

### W-004 — No CSP or SRI; session in localStorage (High)
* **CI:**
  * No page has a `Content-Security-Policy`.
  * `cdn.jsdelivr.net` (supabase-js 2.111.0, animejs 4.5.0) and `unpkg.com` (AOS) scripts load without `integrity`.
  * supabase-js uses `persistSession: true` with the default localStorage store (`js/cloud/supabase-service.js:29`).
  * `firebase.json` defines security headers, but they apply only if the site is hosted on Firebase (see W-015).
* **Impact:** any script injection (W-001) or CDN compromise has full account access.
* **Correction:**
  * Add `integrity` and `crossorigin` to every CDN tag. The hashes could not be computed here because the CDN is blocked from the audit sandbox.
  * Add a meta CSP: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://fczxcvlyydcqdhjkejmd.supabase.co wss://fczxcvlyydcqdhjkejmd.supabase.co http://192.168.4.1 http://showduino.local; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'`, then remove inline handlers so `'unsafe-inline'` can be dropped from `script-src`.
  * Better still, self-host the libraries.
* **Verify** in a real browser that sign-in, Google OAuth, avatar upload and Studio still work with the CSP on.

### W-005 — Any JSON accepted on import (Medium)
* **BR (before):** `{"schema":"x","project":{"name":"evil"}}` was **accepted** and replaced the open project. A 30 MB file was read and parsed before it was rejected.
* **Correction:** `assertImportableShape()` plus a 5 MB cap in `importProject()` only (commit `e36a62b`). Restoring local and cloud projects is unchanged.
* **Verification:** `tests/browser/studio-roundtrip.cjs`.

### W-006 — Production schema not in the repository (Medium)
* **DB:** `profiles`, `projects`, `devices`, `community_posts`, `community_comments`, the trigger `on_auth_user_created` → `handle_new_user()` (SECURITY DEFINER) and `set_updated_at()` exist in production, but no migration in `supabase/` creates them. The repository's own `hauntsync_creator_profiles_v1.sql` says "Apply ONLY after checking the live public.profiles table".
* **DB result:** live RLS is enabled on every public table and is owner-scoped (policy list in the audit report §4).
* **Impact:** the database cannot be rebuilt, reviewed or tested from source. A future edit could silently drop a policy.
* **Correction:** dump the live schema (`supabase db dump --schema public`) into `supabase/migrations/`, add a CI check that each table has RLS enabled and the expected policies, and use `supabase db diff` before every change.

### W-007 — No moderation, reporting or rate limiting (Medium)
* **DB / CI:**
  * `shared_shows`, `creator_publications`, `community_posts` and `community_comments` are publicly readable.
  * Removal is by owner or the service role only. There is no report button, no hidden flag, no admin view and no rate limiting beyond Supabase defaults.
  * `author_label` (`shared_shows`) and `author_name` (`community_*`) are free text.
  * `creator_publications.username` is unique only within that table, is not tied to `profiles.username` and reserves no names (for example `showduino`, `admin`).
* **Impact:** impersonation, spam and storage abuse, with no way for visitors to report it.
* **Correction:**
  * A `reports` table (insert by authenticated users, read by service role only).
  * A `hidden` column honoured by the public SELECT policies.
  * A reserved-username list.
  * Author labels derived server-side.
  * Per-user insert limits (trigger or Edge Function).
  * A written moderation procedure.

### W-008 — Hidden preview forum writes to production (Medium)
* **Source:** `preview/hauntsync.html` and `preview/hauntsync-preview.js`. These use the production config (`config/runtime-config.js`) and insert into `community_posts` and `community_comments`.
* **Mitigation:** the page is `noindex`, but it is publicly reachable.
* **DB:** both tables are currently empty.
* **Impact:** an unannounced public forum without moderation (W-007).
* **Correction:** remove `preview/` from the deployed site, or gate it behind a feature flag that is off in production.

### W-009 — Auth hardening (Medium)
* **DB (Supabase security advisor):** `auth_leaked_password_protection` is disabled, and `auth_otp_long_expiry` (email OTP above 1 h) is set.
* **Correction:** in Supabase Auth settings, enable leaked-password protection and set the OTP expiry to ≤ 3600 s.
* **BLOCKED:** the redirect allow-list, the Google OAuth client and the SMTP sender are not readable through SQL. The owner must check them against `docs/HAUNTSYNC_SIGNUP_LAUNCH_CHECKLIST.md`.

### W-010 — Email local-part used as public author label (Medium)
* **DB:** `handle_new_user()` sets `display_name` to the `display_name` metadata, or else `split_part(email,'@',1)`.
* **CI:** Google sign-in passes no `display_name`, and `js/cloud/supabase-service.js:414` uses the profile `display_name` as `author_label` when publishing a show.
* **Impact:** a user who never edits their name publishes part of their email address.
* **Correction:** default to "Showduino Creator", or make the publish dialog require a chosen public name.

### W-011 — Data-subject rights and privacy notice (Medium)
* **CI:**
  * `privacy.html` says there is no self-service export or deletion and gives a Gmail contact.
  * It does not name the data controller, lawful basis, retention periods, processors or locations (Supabase eu-west-2, Google, jsDelivr), or the right to complain to the ICO.
* **Correction:** add these items to the notice. Implement account deletion through an Edge Function using the service role, which deletes storage objects, rows and the auth user. Legal wording needs review by the owner or an adviser.

### W-012 — Excess table grants (Medium, defence in depth)
* **DB:**
  * `anon` holds `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` on `community_posts`, `community_comments` and `devices`.
  * `authenticated` holds the same on `profiles` and `projects`.
  * RLS blocks the row operations, and PostgREST does not expose TRUNCATE, so this is not exploitable through the API today.
* **Correction:**
  * Revoke `TRUNCATE, TRIGGER, REFERENCES` from `anon` and `authenticated` on all public tables.
  * Revoke everything from `anon` on tables that have no anon policy.

### W-013 — Unbounded project storage (Medium)
* **DB:** `projects.project_data jsonb` has no size check, and there is no per-user row limit.
* **Correction:**
  * `check (octet_length(project_data::text) <= 1048576)`.
  * A trigger that limits rows per user.

### W-014 — Life-safety disclaimer (Medium)
* **CI:** only the `tools.html` service footnote said emergency is not a certified life-safety system. `support.html` and `system.html` described emergency behaviour without it.
* **Correction:** added in commit `7700ffe`. The home page "Physical safety" copy should get the same sentence (owner wording).

### W-015 — Deployment and branch protection (Medium)
* **Observed:**
  * The GitHub API reports `has_pages: false` for this repository, and `branches/main/protection` is "Branch not protected".
  * The repository docs describe GitHub Pages, and the live HTML matches `main` (home-page title, H1, navigation and CTAs compared).
  * The Pages API path is blocked through this session's proxy, so the real host is **unconfirmed**.
  * Because the site is served from the repository root, `functions/`, `supabase/*.sql`, `tests/`, `.3mf` CAD files, the manual `.docx` and the legacy forum are all public.
* **Correction:**
  * Confirm the host.
  * Protect `main` (required checks: Studio Validate, Website static smoke, Website browser tests; no direct pushes).
  * Publish from a `site/` folder or a build step, so non-site files are not served.
  * Add a post-deploy smoke test against `https://show-duino.com`.

### W-016 — Studio and firmware capability gaps (Medium)
* **CI:**
  * Firmware has an S3 Lamp Node (`new_showduino/firmware/s3-lamp-node`), but Studio has no Lamp clip type.
  * Studio's deploy refuses `trigger` ("runtime is not implemented yet"), `relay` (legacy) and `dmx`.
  * Studio still lists Relay in some copy (W-024).
* **Correction:** decide the launch scope for each node type, and show unsupported types as "export only" in the cue library.

### W-017 — Local network probes from the public site (Low)
* **BR:** every load of `studio.html` fetches `http://192.168.4.1/status` (CORS errors) and `http://showduino.local/status` (`js/connection_detector.js`, `js/api.js`). On HTTPS, browsers block these as mixed or private-network requests, so the probe can never succeed from `show-duino.com` and only adds console errors and delay.
* **Correction:** skip the probes when `location.protocol === 'https:'` and the host is `show-duino.com`. Deploy already handles this case by exporting.

### W-018 — Large and unreferenced files (Low)
* **CI** (git ls-files, then searching HTML/JS/CSS/JSON for each file name):
  * `media/ambient_static_glitch.mp3` (24 MB) is unreferenced.
  * `3d-images/full build.3mf` is 21 MB.
  * `neopixel_fx_advert.png` and `images/neopixel_fx_advert.png` are identical 2.3 MB files.
  * `images/ChatGPT Image Apr 19, 2025…png` (1.9 MB), `showduino._logo.png` (1.4 MB, used only by the legacy panel) and `944eb351-…png` (1.3 MB, loaded by `touchscreen-ui.html`).
  * The SVG icons in `icons/` are 150–1772 KB each and unreferenced.
* **Correction:** move unreferenced media out of the published tree, and convert the remaining images to WebP/AVIF at display size. Do not delete without the owner's confirmation.

### W-019 — Hotlinked retailer images (Low)
* **CI:** `tools.html` loads product photos from allegroimg.com, sellercube.com, probots.co.in, beststore.cl and waveshare.com.
* **Impact:** the photos break when those sites change, the image rights are unclear, and every visit is tracked by third parties.
* **Correction:** use your own photographs (`media/` already has some) or licensed images.

### W-020 — SEO basics (Low)
* **BR:** the meta description is present on all current pages. Canonical is only on `index.html` and `docs.html`; `og:image` is only on `index.html`. There was no `robots.txt` or `sitemap.xml`.
* **Partly fixed:** `robots.txt` and `sitemap.xml` (13 public pages) added in commit `7700ffe`.
* **Open:** canonical and Open Graph tags for the other public pages.

### W-021 — Accessibility (Low)
* **BR** (in-page checks; axe-core could not be installed because the npm registry was unreachable):
  * 0 unnamed buttons and 0 unlabelled inputs on current pages.
  * Every Tab stop has a visible focus style (first 25 Tab stops checked on six pages: home, account, welcome, community, profile, Studio).
  * Reduced-motion CSS is present on all current pages.
  * **No skip link** on any page.
  * Heading-level skips on `addons`, `bluetooth-wifi`, `diagnostics`, `ir-remote`, `neopixel-ui`, `system.html` and `studio.html` (the first five are redirect stubs).
  * Low-contrast text: 1 of 25 sampled elements in Studio desktop, 2 of 7 on phone, and 1 of 21 on `touchscreen-ui.html` (approximation).
  * Home page `scrollWidth` exceeds the viewport by 18–22 px at 768–1366 px. No visible element overflows, so the cause is probably an animation start transform. Animation was off in the test because the CDN is blocked, so this needs a real-browser check.
* **Correction:** add a skip link to the shared header and fix the heading order. Run axe in CI once the registry is reachable.

### W-022 — `touchscreen-ui.html` broken assets (Low)
* **BR:** 404 for `images/hauntsync_qr.png`, `AOS is not defined`, no meta description, and a 1.3 MB logo.
* **Status:** the page is not linked from the navigation. Decide whether to keep it.

### W-023 — Obsolete code and repository hygiene (Low)
* **CI:**
  * `js/firebase_auth.js`, `js/firebase_config.js`, `js/firebase_sync.js`, `js/cloud/firebase-service.js`, `js/payments/stripe-service.js`, `functions/` (Stripe, disabled by `PAYMENTS_ENABLED=false`), `FIREBASE_SETUP.md`, `PAYPAL_SETUP.md` and `DEPLOY*.md` remain. `DEPLOY.md` contains a local Windows path.
  * `app.js` and `js/panels.js` still contain Firebase-era HTML templates that interpolate project names unescaped. They are unreachable while `features.firebase=false`, but would become an injection risk if re-enabled.
  * More than 20 stale branches and 10 open draft PRs (#7–#48).
* **Correction:** archive the obsolete code in a tagged branch and delete it from `main`, then close or merge the stale PRs.
* **Payments:** the Stripe webhook verifies signatures (`stripe.webhooks.constructEvent` on `rawBody`), and checkout requires a Firebase ID token, but none of it is deployed or reviewed further.

### W-024 — Documentation alignment (Low)
* **CI:** every firmware link on `docs.html` resolves on `new_showduino` `main`, and the P4 pins in `docs/hardware-pinout.md` match the firmware (`GPIO25`, `GPIO4/5`, `GPIO23/24`, `GPIO46/47`).
* **Gaps:**
  * The emergency provisioning, acceptance and recovery procedures (001J–001L) are only on the unmerged PR #33, so the website cannot link to them yet.
  * `README.md` and `support.html` call Relay a current node role, while Studio says "legacy Relay actions must be migrated to MOSFET".
  * The Hardware page lists no Lamp Node, MOSFET Node or Pixel Node board.

### W-025 — Silent overwrite on import (Low)
* **CI:** `importProject()` saves the imported project under its own `project.id`, so a file whose ID matches a saved local project overwrites that project without confirmation.
* **Correction:** if the ID exists, ask, or import as a copy with a new ID.

### W-026 — Arbitrary avatar URLs in published profiles (Info)
* **DB:** `creator_publications.avatar_url` accepts any `https://` URL.
* **Impact:** a published profile can embed a third-party tracking image or an unmoderated image.
* **Correction:** require the URL to start with the project's own storage URL (`https://fczxcvlyydcqdhjkejmd.supabase.co/storage/v1/object/public/hauntsync-avatars/`).
