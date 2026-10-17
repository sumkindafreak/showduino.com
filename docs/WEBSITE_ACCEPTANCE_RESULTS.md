# Showduino website — acceptance results (W001)

Date: 2026-10-17. Repository `sumkindafreak/showduino.com`. Baseline `d7b3b93`
(`main`). Fixes are on branch `w001/website-audit`, which is **not deployed**.

**Evidence types:**
* **CI**: code inspection.
* **AUTO**: automated Node test in this repository.
* **BR**: real headless Chromium (Playwright 1.48, Chromium 1194) against a local static server of the repository. Supabase, CDNs and hardware are unreachable from the audit sandbox.
* **DB**: read-only SQL against the production Supabase project. Isolation tests ran inside transactions that were rolled back, and only counts were returned.
* **LIVE**: fetch of the deployed site.
* **PROD**: interactive production test with real accounts. **None were performed.**

**Status values:**
* **PASS**
* **FAIL**: defect, with the issue ID from `docs/WEBSITE_ISSUE_REGISTER.md`.
* **FIXED-BRANCH**: failed at baseline and passes on the branch.
* **BLOCKED**: needs access the audit did not have.
* **NOT TESTED**

## Totals

| Kind | Run | Pass | Fail |
|---|---|---|---|
| Existing Node tests (12) on the baseline | 12 | 12 | 0 |
| Node tests on the branch (12 existing + 2 new) | 14 | 14 | 0 |
| Static site checker `tools/check-website.mjs` (16 pages, 117 asset refs, 38 scripts) | 1 | 1 | 0 |
| New browser tests on the branch | 2 | 2 | 0 |
| Same browser injection test on the baseline | 1 | 0 | 1 (W-001) |
| Page loads (26 pages × desktop 1366 px + phone 390 px) | 52 | 52 loaded | — |
| Database isolation checks | 14 | 14 | 0 |
| Acceptance rows below | 82 | 33 PASS | 22 FAIL (open); 6 FIXED-BRANCH (one partly); 18 BLOCKED; 2 NOT TESTED; 1 recorded in the PR |

## A. Inventory (Phase 1)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| A1 | Every tracked file inventoried | 177 files; audit report §2 | PASS (CI) |
| A2 | Every HTML route loaded | 26 pages (23 root, `preview/hauntsync.html`, 2 legacy forum pages) × 2 viewports | PASS (BR) |
| A3 | Local asset references resolve | `check-website.mjs`; crawl: one local 404 (`images/hauntsync_qr.png` on `touchscreen-ui.html`) | FAIL W-022 |
| A4 | No uncaught JavaScript errors on current pages | 0 page errors on the 23 current pages. The legacy forum fails with `firebase is not defined` because the CDN is blocked in the sandbox | PASS (BR) |
| A5 | Advertised features exist | Lamp authoring missing; triggers not deployable | FAIL W-016 |
| A6 | Obsolete or duplicate code identified | Firebase/Stripe/PayPal, legacy forum, duplicate images, stubs | PASS (CI); cleanup open W-023 |
| A7 | No Writelite references | `grep -ri writelite` → none | PASS (CI) |

## B. Security (Phase 2)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| B1 | RLS enabled on every public table | All 7 public tables `relrowsecurity = true` | PASS (DB) |
| B2 | Another signed-in user cannot read profiles, projects or devices | Impersonated unrelated user: 0 / 0 / 0 rows | PASS (DB) |
| B3 | Another user cannot update or delete profiles or publications | 0 rows affected for update and delete | PASS (DB) |
| B4 | Anonymous visitor cannot read or alter devices | select 0, update 0 | PASS (DB) |
| B5 | Public tables show only intended data | `creator_publications` readable by all (intended); `shared_shows` only `is_listed` rows | PASS (DB) |
| B6 | Avatar storage scoped to the owner | Policies restrict insert, select and delete to `<uid>/avatar-*.jpg/png/webp`; bucket limit 2 MB with image MIME types. No objects exist, so this is policy review only | PASS (DB, policy) |
| B7 | Minimal grants | TRUNCATE, TRIGGER and REFERENCES granted to anon/authenticated | FAIL W-012 |
| B8 | No secrets committed | Only the Supabase publishable key and the legacy Firebase web key (public identifiers). No service-role key, Stripe secret or private key found | PASS (CI) |
| B9 | No script injection from imported files | Hostile `.shdo` executed script | FIXED-BRANCH W-001 |
| B10 | Community data rendered safely | `hauntsync-library.js` and `hauntsync-public-creators.js` use `textContent`; preview forum escapes all fields | PASS (CI) |
| B11 | CSP and SRI | None | FAIL W-004 |
| B12 | Security headers on the live site | Live response headers not observable with the available fetch tool | BLOCKED |
| B13 | Google OAuth redirect fixed and allow-listed | Client uses the fixed `https://show-duino.com/welcome.html` (existing test passes); Supabase allow-list not readable | PASS (CI) / BLOCKED (config) |
| B14 | Password reset and confirmation redirects fixed | `account.html` and `account.html?confirmed=1` | PASS (CI) |
| B15 | Leaked-password protection and OTP expiry | Advisor: both warnings | FAIL W-009 |
| B16 | Rate limiting and abuse controls | Supabase defaults only; no per-user limits | FAIL W-007 / W-013 |
| B17 | Legacy Firebase integrations retired | Legacy forum live; app Firebase code disabled by flag | FAIL W-003 / W-023 |
| B18 | Preview code does not write to production | `preview/` writes `community_posts` | FAIL W-008 |
| B19 | Payment/webhook security (disabled) | Signature verified, return URLs restricted to the app origin, payments gated off. Not deployed | PASS (CI, limited) |
| B20 | Two-account test against production | No mailbox, and supabase.co is unreachable from the sandbox | BLOCKED |

## C. HauntSync workflows (Phase 3)

All of these need real accounts on the production site. The code paths have unit
tests (`hauntsync-*.test.cjs`, all passing), but these tests stub Supabase.

| # | Workflow | Evidence | Status |
|---|---|---|---|
| C1 | Create a Showduino ID | AUTO (onboarding test) | BLOCKED (PROD) |
| C2 | Confirm registration email | — | BLOCKED |
| C3 | Sign in / sign out | AUTO | BLOCKED (PROD) |
| C4 | Google sign-in | AUTO (google-auth test) | BLOCKED (PROD) |
| C5 | Account recovery | CI | BLOCKED (PROD) |
| C6 | Create and edit profile | AUTO (profile test) | BLOCKED (PROD) |
| C7 | Upload, replace and remove avatar | AUTO (avatar test incl. rollback) | BLOCKED (PROD) |
| C8 | Publish and unpublish creator page | CI + DB policies | BLOCKED (PROD) |
| C9 | Browse creator profiles | CI | BLOCKED (PROD) |
| C10 | Share, download and remove `.shdo` templates | AUTO (share test) + DB check constraint (safety block, no node bindings, ≤ 256 KB) | BLOCKED (PROD) |
| C11 | Private projects and devices | DB isolation PASS | BLOCKED (PROD) |
| C12 | Cross-account permissions | DB B2–B4 | PASS (DB) |
| C13 | Community files never control hardware automatically | DB constraint forbids `devices[*].binding.nodeId`; import is manual; deploy needs a local origin and an explicit button | PASS (CI/DB) |
| C14 | Moderation, reporting, deletion, recovery | No reporting or moderation; no self-service deletion | FAIL W-007 / W-011 |

## D. Studio (Phase 4)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| D1 | Every panel renders | All 10 sidebar panels opened at 1366 and 390 px; existing panel test | PASS (BR, AUTO) |
| D2 | First Show wizard | `studio-first-show.test.cjs` | PASS (AUTO) |
| D3 | Timeline, pixel lanes, audio and MOSFET authoring | `studio-shdo-v2`, `studio-pixel-layers`, `studio-audio-node-pixels`, `studio-estop-node-pixels` tests | PASS (AUTO) |
| D4 | Save, autosave and restore after reload | `tests/browser/studio-roundtrip.cjs` | PASS (BR) |
| D5 | Undo/redo | Undo and redo stacks exist in `js/timeline.js`; not exercised | NOT TESTED |
| D6 | `.shdo` export is valid v2 | Exported file passes `validateShdo` | PASS (BR) |
| D7 | `.shdo` import, edit, re-save | Re-import of the exported file | PASS (BR) |
| D8 | Malformed or foreign files rejected without changing the project | Foreign JSON was accepted at baseline | FIXED-BRANCH W-005 |
| D9 | Cloud save and restore | Needs a signed-in production account | BLOCKED |
| D10 | Mobile layout | Panels render at 390 px with no horizontal scroll; existing mobile test | PASS (BR, AUTO) |
| D11 | Offline authoring | Studio works with every CDN and Supabase unreachable (the sandbox). Animation and cloud are unavailable | PASS (BR) |
| D12 | Studio never claims a deploy when it only exported | Public HTTPS returns `{deployed:false, exported:true}` and shows "Show file ready ✓" | PASS (CI) |
| D13 | Deploy only sends what the firmware accepts | MOSFET and ESTOP pixel cues were sent | FIXED-BRANCH W-002 |
| D14 | Local Showduino connectivity and deployment | Needs hardware | BLOCKED (hardware) |
| D15 | Studio features match firmware | Lamp Node missing; triggers not deployable | FAIL W-016 |

## E. Design, accessibility and performance (Phase 5)

Measured in the sandbox, with external CDNs blocked. These are not real-user network timings.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| E1 | Responsive at phone and desktop | No page-level horizontal scroll at 390 px. Home page overflows by 18–22 px at 768–1366 px | FAIL W-021 (needs real-browser confirmation) |
| E2 | Named controls and labelled inputs | 0 unnamed buttons and 0 unlabelled inputs on current pages | PASS (BR) |
| E3 | Keyboard navigation with visible focus | First 25 Tab stops on 6 pages all visible and on-screen | PASS (BR) |
| E4 | Skip link | None on any page | FAIL W-021 |
| E5 | Heading order | Skips on 7 pages | FAIL W-021 |
| E6 | Reduced motion | `prefers-reduced-motion` rules on every current page | PASS (BR) |
| E7 | Colour contrast | Approximate check: a few low-contrast elements in Studio and `touchscreen-ui.html`. axe-core could not be installed (npm registry unreachable) | NOT TESTED (full) |
| E8 | Image weight | Home 155 KB local; `tools.html` 460 KB; `touchscreen-ui.html` 1.3 MB; 24 MB of unreferenced media in the repository | FAIL W-018 (low) |
| E9 | Load time | Local server: 20–380 ms per page; Studio 41 requests / 699 KB unminified | PASS (BR, local only) |
| E10 | Title and description | Present on every current page except `touchscreen-ui.html` | PASS (one exception, W-022) |
| E11 | Canonical, sitemap, robots | Canonical on 2 pages; no robots or sitemap | PARTLY FIXED-BRANCH W-020 |
| E12 | Social previews | `og:image` only on home | FAIL W-020 |
| E13 | Consistent branding | Current pages share the stage theme; the legacy forum ("HauntSync Forum", "Ritual profile") does not | FAIL W-003 |

## F. Documentation and hardware accuracy (Phase 6)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| F1 | Documentation links resolve | All 8 `new_showduino` links and the checklist link exist on `main` | PASS (CI) |
| F2 | Pins match firmware | `docs/hardware-pinout.md` (main) matches the P4 `BoardConfig.h` | PASS (CI) |
| F3 | Board names current | Director, Comms S3, P4, A1S and C3 listed; Lamp, MOSFET and Pixel Node boards not shown | FAIL W-024 |
| F4 | Not-life-safety statement wherever emergency is described | Only `tools.html` at baseline | FIXED-BRANCH W-014 (home page wording open) |
| F5 | Current emergency procedures reachable | Only on unmerged PR #33 | BLOCKED (firmware merge) |
| F6 | No obsolete architecture claims | SUE/IAN references live only on the "page moved" stubs; Relay wording inconsistent | FAIL W-024 (low) |
| F7 | Photographs owned or licensed | Retailer hotlinks | FAIL W-019 |

## G. CI and deployment (Phase 7)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| G1 | All tests run in CI | 2 of 12 Node tests were never run; branch runs all 14 plus 2 browser tests | FIXED-BRANCH |
| G2 | Required checks before merge | No branch protection on `main` | FAIL W-015 |
| G3 | Production smoke test after deploy | None | FAIL W-015 |
| G4 | Deployment target and rollback documented | Docs say GitHub Pages; API says `has_pages: false` | BLOCKED W-015 |
| G5 | Only site files are published | Whole repository served | FAIL W-015 |
| G6 | Branch CI run | Recorded in the draft PR after push | see PR |

## Re-running

```
node tools/check-website.mjs
for t in tests/*.cjs; do node "$t" || exit 1; done
npm install --no-save playwright@1.48.2 && npx playwright install chromium
node tests/browser/studio-import-injection.cjs
node tests/browser/studio-roundtrip.cjs
```
