# Website production deployment and rollback — W002

How `show-duino.com` is actually deployed, what production serves today, and how to
release, verify and roll back the W002 security changes. Every statement says how it
was established.

## 1. Hosting platform (verified)

| Fact | Evidence |
|---|---|
| Production is **Cloudflare Pages**, built from GitHub | Every commit carries `cloudflare-workers-and-pages` check runs. `main` (`d7b3b93`) has successful builds for three Pages projects: `showduino-com`, `showduinoweb`, `showduino-web` |
| GitHub Pages is **not** the current host | GitHub deployments API: 93 `github-pages` deployments, the last on **2025-05-12**. The repository API reports `has_pages: false` |
| Which of the three Pages projects owns the `show-duino.com` custom domain | **Not determinable from the repository.** Owner: Cloudflare dashboard → Workers & Pages → each project → Custom domains |
| Every branch is publicly deployed as a preview | Check-run summaries give URLs such as `https://dfba230f.showduino-com.pages.dev` (hotfix `b100aba`) and `https://w002-security-hotfix.showduino-com.pages.dev`. Previews use the production `config/runtime-config.js` (production Supabase) |
| `_headers` and `_redirects` are honoured | The `w002/security-hotfix` preview returned the configured headers and 302 redirects in the CI probe (`tools/production-smoke.mjs`, run 39072112805) |

The repository's `DEPLOY.md`, `DEPLOYMENT_SUMMARY.md` and `GITHUB_UPDATE_INSTRUCTIONS.md` describe GitHub Pages and are out of date.

## 2. What production serves today (CI probe, 2026-10-17)

`tools/production-smoke.mjs https://show-duino.com` runs from GitHub Actions. It makes read-only GET requests: no sign-in and no writes.

| Check | Result |
|---|---|
| Public pages | all 200 (`.html` URLs 308 → pretty URLs) |
| W-001, W-002, W-005 and W002 Studio fixes | **NOT DEPLOYED.** `js/timeline-fx-daw.js` still builds the clip title with `innerHTML` (confirmed again by direct fetch) |
| Headers | `X-Content-Type-Options: nosniff` and `Referrer-Policy` present (not from the repository, so probably a Cloudflare zone rule). **No CSP, no HSTS, no X-Frame-Options** |
| Third-party scripts | supabase-js and animejs load without `integrity` |
| Legacy forum `/HauntSyncForum_Configured/*`, preview `/preview/*`, `supabase/*.sql` | **still served** |
| `/functions/index.js` | 404 |
| Legacy Firestore (`hauntsync-forum-4b992`) unauthenticated read, field-masked | `threads` and `users`: HTTP 403 PERMISSION_DENIED |

## 3. Release procedure

### 3.1 PR #62: Studio security hotfix (release first)
1. Review PR #62. It changes Studio JavaScript, tests and workflows only.
2. Open its Cloudflare preview (`showduino-com` check run on the PR head) and run the manual checks in §4.2 there.
3. Merge into `main`. Cloudflare builds production automatically (about 1–2 minutes; watch the `Cloudflare Pages` check on the merge commit).
4. Run §4 against `https://show-duino.com`.

### 3.2 PR #61: hosting and browser hardening (after #62, after owner checks)
1. Complete `WEBSITE_SECURITY_HOTFIX_W002.md` §6:
   * the production project;
   * zone rules;
   * preview access;
   * Firebase rules.
2. Change the base of #61 to `main` once #62 is merged. The remaining diff is headers, redirects, SRI, database files and tests.
3. On the preview, sign in with a test account, sign out, upload and remove an avatar, use Google sign-in, and use Studio. Watch the browser console for CSP reports.
4. Merge and run §4, including the strict probe.

### 3.3 Database (separate, approval required)
`supabase/proposed/20261017090100_w002_hardening.sql` is **not applied**. Do not run it until:
1. a backup has been taken (Supabase dashboard → Database → Backups; or `supabase db dump`);
2. it has been run on a Supabase **branch**, followed by `supabase/tests/rls_owner_isolation.sql`;
3. the rollback (`20261017090100_w002_hardening.rollback.sql`) has been run on the same branch and the tests pass again;
4. the owner has approved applying it to production.

## 4. Post-deployment verification

### 4.1 Automated (after #61 is merged, so the workflow exists on `main`)
GitHub → Actions → **Website production smoke** → *Run workflow*: `base_url=https://show-duino.com`, `strict=true`.
It must report:
* all W002 fixes **DEPLOYED**;
* the security headers present;
* SRI **MATCHES** on every page;
* **STILL SERVED: (none)**.

It also runs daily at 06:17 UTC in evidence mode.

### 4.2 Manual (works for #62 alone)
1. `https://show-duino.com/js/timeline-fx-daw.js` contains `title.textContent = String(clip.label`.
2. `https://show-duino.com/js/studio-deploy.js` contains `uploadPolicyErrors`.
3. `https://show-duino.com/js/studio-projects.js` contains `assertSafeIdentifiers`.
4. In Studio, import `new_showduino/examples/productions/first-audio-test.shdo`. It imports with 2 clips.
5. In Studio, import a file containing `{"schema":"x"}`. The message is "not a Showduino production. Nothing was changed."
6. Hard-refresh (Ctrl+F5). Cloudflare caches JavaScript, so a stale browser cache can hide the update.

### 4.3 Previously vulnerable Studio
After deployment, run the hostile-import test against production from a workstation:

```
npm install --no-save playwright@1.48.2 && npx playwright install chromium
```

Then run `tests/browser/studio-import-injection.cjs`, edited to open `https://show-duino.com/studio.html` instead of the local server. It must report 0 executions. This writes only to the tester's own browser storage.

## 5. Rollback

| Change | How to roll back | Time |
|---|---|---|
| Any website release | Cloudflare dashboard → the production Pages project → Deployments → previous production deployment → **Rollback** | immediate |
| Same, through Git | `git revert -m 1 <merge commit>` on `main` and push. Cloudflare rebuilds | 1–2 min |
| One retired route needed again | Delete its line from `_redirects` and redeploy | 1–2 min |
| A header breaks a feature | Remove that line from `_headers` and redeploy. The CSP is report-only and cannot block anything | 1–2 min |
| Database hardening (if ever applied) | Run `supabase/proposed/20261017090100_w002_hardening.rollback.sql`. The constraints are `not valid`, so existing rows are not rewritten | minutes |

## 6. Known gaps in this procedure

* Which of the three Cloudflare projects is production, and their build settings, can only be seen in the dashboard.
* No real-account production test has been performed (no test mailbox or Google credentials). The HauntSync workflows are verified against a mocked Supabase and the database policies against a throw-away PostgreSQL.
* Previews of older branches remain publicly reachable and serve older, vulnerable Studio builds on `*.pages.dev`. Their storage origin is separate from `show-duino.com`, but they talk to the production Supabase project.
