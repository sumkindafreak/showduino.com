# Showduino website — Mission W001 audit report

| | |
|---|---|
| Date | 2026-10-17 |
| Repository | `sumkindafreak/showduino.com`, `main` at `d7b3b93` ("Add files via upload"), rechecked before starting |
| Live site | `https://show-duino.com` |
| Database | Supabase project `showduino` (`fczxcvlyydcqdhjkejmd`, eu-west-2), read-only catalogue queries |
| Firmware cross-check | `sumkindafreak/new_showduino` (`main` for documentation links; branch `fix/emergency-persistent-latch` for the Studio upload policy, which is identical on both for that file) |
| Fix branch | `w001/website-audit` (draft PR, not merged, not deployed) |
| Companion documents | `WEBSITE_ISSUE_REGISTER.md`, `WEBSITE_ACCEPTANCE_RESULTS.md`, `WEBSITE_RELEASE_CHECKLIST.md` |

## 1. Method and limits

Evidence is labelled by how it was obtained. These are not interchangeable.

| Label | Meaning | Used for |
|---|---|---|
| **CI** | Code inspection of every file in the inventory | Architecture, sinks, auth, docs |
| **AUTO** | Node tests in `tests/` | Studio model, HauntSync client logic (Supabase stubbed) |
| **BR** | Headless Chromium against a **local copy** of the repository | Page loads, errors, accessibility, Studio workflows, injection |
| **DB** | Read-only SQL on production: catalogue, policies, grants, counts. Isolation tests used role impersonation inside transactions that were **rolled back**. No user row contents were read | RLS, grants, schema drift |
| **LIVE** | Fetching deployed pages | Repository-vs-live comparison |
| **PROD** | Interactive production testing with real accounts | **Not performed** |

What the audit could not do, and why:
* The sandbox cannot open connections to `show-duino.com`, `*.supabase.co`, jsDelivr, unpkg, Google or Firebase. They are blocked by the network policy. Browser tests therefore ran with every CDN and Supabase unreachable.
* There is no mailbox, so registration, confirmation and recovery emails could not be received.
* The npm registry did not resolve, so axe-core could not be installed. Accessibility checks are the in-page checks described in the register.
* Live HTTP response headers were not observable.
* The GitHub Pages settings API is not reachable through the session proxy.

## 2. Inventory (Phase 1)

177 tracked files at `d7b3b93` (61 MB working tree).

**Routes (23 root pages):**

| Route | Role | Notes |
|---|---|---|
| `index.html` | Home | Matches live (title, H1, nav and CTAs compared) |
| `system.html` | Architecture | |
| `studio.html` | Showduino Studio | 41 local requests, 699 KB |
| `hauntsync.html` | Workspace dashboard (projects, devices) | |
| `community.html` | Community show library | Supabase `shared_shows` |
| `creators.html`, `creator.html` | Public creator directory and page | `creator_publications` |
| `welcome.html` | HauntSync sign-up / Google return URL | |
| `account.html` | Sign-in, register, recovery, projects | |
| `profile.html` | Creator profile editor, avatar | |
| `tools.html` | Hardware | Retailer-hotlinked photos |
| `aboutme.html`, `docs.html`, `support.html`, `privacy.html`, `terms.html` | Content and legal | |
| `404.html` | Not-found page | |
| `addons.html`, `bluetooth-wifi.html`, `diagnostics.html`, `ir-remote.html`, `neopixel-ui.html` | "Page moved" stubs | `noindex`, refresh to `system.html` |
| `touchscreen-ui.html` | Orphan page (not in nav) | Broken image, missing library |

**Other published routes:**
* `preview/hauntsync.html`: a production-connected community preview, `noindex`.
* `HauntSyncForum_Configured/{index,forum,profile,y/index}.html`: a legacy Firebase forum, **live**.

**Scripts and styles:**
* `app.js` (1 317 lines) and `script.js`.
* 41 files under `js/`: 31 Studio, 7 HauntSync/cloud, 3 Firebase/Stripe legacy.
* 19 stylesheets under `css/`, plus `style.css`.

**Config and services:**
* `config/runtime-config.js`: production config. Supabase enabled; Firebase and Stripe off.
* `config/runtime-config.example.js`.
* `firebase.json`, `firestore.rules` and `functions/` (Stripe checkout, portal and webhook; not deployed, `PAYMENTS_ENABLED=false`).

**Database files in repository:** 4 SQL migrations (avatars, creator profile fields, creator directory, shared shows) and 2 email templates.

**Live database:**
* 7 public tables: `profiles`, `projects`, `devices`, `creator_publications`, `shared_shows`, `community_posts`, `community_comments`.
* 1 storage bucket (`hauntsync-avatars`, public, 2 MB, images).
* Trigger `on_auth_user_created`.
* Five of the tables, the trigger and both functions are **not** in the repository (W-006).
* Current size: 1 auth user, 1 profile, 1 creator publication; every other table is empty.

**Tests and CI:**
* 12 Node tests.
* `tools/check-website.mjs`.
* Workflows `studio-validate.yml` (push to `main` and PRs; did not run 2 of the 12 tests) and `website-static-smoke.yml` (PRs only).
* No branch protection.

**Assets:** 24 MB of unreferenced MP3, 21 MB of CAD, duplicate PNGs and unreferenced SVG icons (W-018).

**Obsolete or duplicate items:**
* Firebase app code, PayPal/Firebase docs and the Stripe functions.
* Firebase-era templates in `app.js` and `js/panels.js` (unreachable while Firebase is off).
* Five redirect stubs.
* More than 20 stale branches and 10 open draft PRs.

**Writelite:** no references anywhere in the repository.

**Repository versus live:**
* The home page and Studio fetched live match `main`.
* The legacy forum and the repository's internal files are publicly served, so the whole repository root appears to be the published site.
* The GitHub API reports `has_pages: false`, so the hosting route needs the owner's confirmation (W-015).

## 3. What works (with evidence)

* **Account isolation in the database** (DB):
  * RLS is on for all public tables.
  * An unrelated signed-in user sees 0 rows in `profiles`, `projects` and `devices`.
  * That user and an anonymous visitor change 0 rows when trying to update or delete other accounts' data.
  * Public tables expose only intended rows.
* **Community templates are inert** (DB, CI): the database check constraint requires the full emergency safety block, an empty `assets` array, no hardware node bindings and ≤ 256 KB. Import is manual, and deploy needs a local origin plus an explicit button.
* **No secrets in the repository** (CI): only publishable or public identifiers.
* **Studio** (BR, AUTO):
  * all 10 panels render at desktop and phone widths;
  * the First Show wizard works;
  * the `.shdo` v2 export validates;
  * save, export, reload, restore and re-import all work;
  * authoring works offline;
  * public HTTPS Studio reports "exported", never "deployed".
* **Rendering of community data** uses `textContent` (CI).
* **Keyboard and labels** (BR):
  * no unnamed controls or unlabelled inputs on current pages;
  * visible focus on every checked Tab stop;
  * reduced-motion support;
  * every current page loads with zero uncaught script errors.
* **Documentation links** to the firmware repository resolve, and the published P4 pins match the firmware (CI).

## 4. Security findings (Phase 2)

| ID | Severity | Status | Summary |
|---|---|---|---|
| W-001 | High | Fixed on branch, verified in browser | Imported `.shdo` clip label executed as script. A malicious community template could act as the victim's account (Supabase session in localStorage) |
| W-003 | High | Open | Legacy Firebase forum is live and publishes posters' email addresses; its rules are not in the repository |
| W-004 | High | Open | No CSP; CDN scripts without SRI |
| W-007 | Medium | Open | No reporting, moderation or rate limits; impersonation via free-text names and unreserved usernames |
| W-008 | Medium | Open | Preview forum writes public posts to production |
| W-009 | Medium | Open | Leaked-password protection off; long OTP expiry |
| W-010 | Medium | Open | Email local-part can become the public author name |
| W-012 | Medium | Open | Excess grants (TRUNCATE etc.); RLS still protects rows |
| W-013 | Medium | Open | Unbounded project storage |
| W-026 | Info | Open | Arbitrary HTTPS avatar URLs in published profiles |

Live database policies (DB): every write policy is `auth.uid() = owner`. Public
SELECT exists only on `creator_publications`, `shared_shows` (`is_listed`),
`community_posts` and `community_comments`. `profiles`, `projects` and `devices` are
owner-only for every operation.

## 5. Broken or incomplete features

* **Studio deploy and firmware disagree (W-002, fixed on branch):** MOSFET and Emergency-node pixel cues were compiled but refused by the S3 and P4 upload policy, after `SHOW:TL:BEGIN` had been sent.
* **No Lamp Node authoring; triggers cannot be deployed** (W-016).
* **Import accepted any JSON** (W-005, fixed on branch); a matching ID overwrites silently (W-025).
* **No self-service account deletion or export** (W-011).
* **`touchscreen-ui.html`** has a missing image and library (W-022).
* **Public HTTPS Studio probes the local network** on every load, which can never succeed (W-017).

## 6. Accessibility and performance (Phase 5)

* **No skip link**; heading skips on 7 pages (W-021).
* **Home page desktop overflow** of 18–22 px, still to be confirmed in a real browser.
* **Local load times** are 20–380 ms per page. Studio makes 41 requests totalling 699 KB, all unminified.
* **Heaviest page** is `touchscreen-ui.html` at 1.3 MB.
* **SEO:** `robots.txt` and `sitemap.xml` added; canonical and Open Graph tags are still missing on most pages (W-020).

## 7. Documentation mismatches (Phase 6)

* **Life-safety statement:** at baseline only `tools.html` said emergency is not a certified life-safety function. Added to `support.html` and `system.html`; the home page still needs it (W-014).
* **Emergency procedures:** the current provisioning, acceptance and recovery procedures exist only on unmerged firmware PR #33 (W-024).
* **Relay wording:** Relay is described as current in `README.md` and `support.html` but as legacy in Studio. The Hardware page omits the Lamp, MOSFET and Pixel Node boards (W-024).
* **Photographs:** product photos are hotlinked from retailers (W-019).

## 8. Changes on `w001/website-audit`

| Commit | Change | Evidence |
|---|---|---|
| `e222208` | Clip titles rendered with `textContent`; static guard; browser injection test | Browser test: 2 executions → 0 at 1366 and 390 px |
| `1fd8bb7` | Deploy pre-flight mirrors the firmware upload policy; nothing is sent if any cue would be refused | `tests/studio-firmware-upload-policy.test.cjs` |
| `e36a62b` | Import requires a Showduino shape and ≤ 5 MB; stored projects unaffected | `tests/browser/studio-roundtrip.cjs` |
| `925d376` | CI runs every Node test plus a headless browser job (local server only) | Workflow files |
| `7700ffe` | Life-safety statement; `robots.txt`; `sitemap.xml`; `noindex` on the legacy forum | Static check passes |

Nothing was deleted. No production setting, database object or deployment was changed.

## 9. External configuration still required

* **Supabase Auth:**
  * enable leaked-password protection;
  * set OTP expiry ≤ 1 h;
  * verify the redirect allow-list (`https://show-duino.com/account.html`, `…?confirmed=1`, `https://show-duino.com/welcome.html`), the SMTP sender and the email templates.
* **Google Cloud OAuth client:** authorised origins and the Supabase callback URL.
* **Firebase project `hauntsync-forum-4b992`:** decide on export, deletion or closure.
* **GitHub:** confirm the hosting route; protect `main`; require the three workflows.
* **Database:** commit the live schema as migrations; revoke grants; add moderation tables and limits. Each change needs a migration reviewed and tested on a Supabase branch first.

## 10. Tests still pending

* A two-account production run of HauntSync workflows C1–C11 and Studio cloud save (D9).
* Live response headers and CSP behaviour.
* Real-network page timings (Lighthouse or WebPageTest) on phone and desktop.
* Full axe-core and screen-reader checks (NVDA or VoiceOver) on account, profile, community and Studio.
* The home page overflow in Chrome, Safari and Firefox.
* Studio deploy to a real Communications S3 and P4 (hardware).

## 11. Launch-readiness recommendation

**Not ready for public launch yet.** The core is in reasonable shape:
* the database enforces account isolation;
* community templates cannot carry hardware bindings;
* Studio authoring, export and import work in a real browser.

The **must-fix items** are:
1. Merge the W001 injection fix and deploy pre-flight.
2. Take the legacy forum and the preview forum off the public site.
3. Add SRI and CSP.
4. Turn on the Supabase auth protections.
5. Bring the live database schema under version control.
6. Add a minimum moderation and reporting path for public content.
7. Complete the privacy notice and deletion route.
8. Protect `main` with required checks.

None of these is a large feature, and all fit before February 2027. Do not declare the site ready until `WEBSITE_ACCEPTANCE_RESULTS.md` sections B, C and D have production evidence.
