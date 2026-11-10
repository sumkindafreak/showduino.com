# Website repair programme — 10 November 2026

Source: Showduino Website Audit — November 2026 (WEB-001 to WEB-064).
Audit baseline: website main commit 850dea0, as recorded in that report. The tracker is not evidence that today's live website has been re-tested.

## Launch gate

Do not enable public registration until all nine High findings are fixed and verified:
WEB-004, WEB-005, WEB-006, WEB-022, WEB-023, WEB-024, WEB-034, WEB-035, WEB-036.

Protect the existing P4 Stage authority, emergency system, working bench setup and saved show files. Use separate review branches, preview tests and reversible production deployments. Do not make destructive database or storage changes without a tested recovery plan.

## Phase 1 — Data and infrastructure (pre-launch)

- WEB-005: Agree backend availability and backup strategy; rehearse recovery.
- WEB-004: Configure and validate outbound confirmation/recovery email (SPF/DKIM; five deliveries in ten minutes).
- WEB-006: Clean up post image uploads/edits/deletes, including failure rollback; test public URLs stop working after deletion.
- WEB-007: Implement moderated-image visibility rules or access-controlled URLs.
- WEB-018: Verify and close the legacy Firebase project safely after exporting necessary content.

## Phase 2 — Legal and age eligibility (pre-launch)

- WEB-034, WEB-035: Correct privacy notice, data categories, controller, processors, lawful bases, rights and ICO complaint route.
- WEB-036: Publish a 14+ minimum age and enforce required sign-up confirmation; check UK Children's Code applicability.
- WEB-037, WEB-038, WEB-039: Extend community terms, browser storage explanation, real retention and deletion policy.
- WEB-027, WEB-032: Reconcile unpublish wording and explain moderation-evidence retention.

Dependency: owner/legal decisions about controller identity, retention periods and realistic backups. Acceptance: legal review and registration age gate test.

## Phase 3 — Studio (pre-launch)

- WEB-022: Fix Settings, Test, Clear Logs, Clear Autosave and Clear All Data; show feedback and preserve user projects.
- WEB-023: Replace obsolete Firebase Projects panel with maintained local and Supabase cloud project APIs.
- WEB-024, WEB-042: Author only supported deployable outputs; add Lamp with verified P4 firmware support; mark nondeployable types as design-only; preserve old Relay shows.
- WEB-033: Remove the unavailable Light theme.

Acceptance: save/reload, local/cloud open, export/import and bench-safe deploy checks. Hardware authority remains unchanged.

## Phase 4 — Accounts and backend

- WEB-001, WEB-002, WEB-003: Harden password and OTP policies, enable CAPTCHA in both UI and Auth backend.
- WEB-008, WEB-011, WEB-012: Fix avatar publication, deletion confirmation/notices, email/password change.
- WEB-013: Reconcile migration history before any database schema push.
- WEB-009, WEB-010, WEB-014, WEB-015, WEB-016, WEB-026: Harden exposed functions, deletion worker, extension placement, constraints, column grants and error wording.
- WEB-017, WEB-020, WEB-021: Improve action limits, server-authoritative future entitlements and indexing when needed.

Acceptance: auth flow testing with a disposable account; full database RLS tests and migration diff.

## Phase 5 — Interface and performance

- WEB-025, WEB-028, WEB-029, WEB-030: Modern dialogs, unified reports, pagination and local-show launch.
- WEB-051 through WEB-058: Typeface, landmarks, readable text, skip links, layout shifts, bundled scripts, reveal fallback and optimized images.

Acceptance: real mobile browser, keyboard and screen-reader testing and production speed measurements.

## Phase 6 — Accuracy and maintenance

- WEB-019, WEB-031, WEB-040, WEB-041, WEB-043 through WEB-050, WEB-059 through WEB-064:
  Tighten CSP; align hardware names, concept imagery, docs versions and Lamp content; metadata, favicon and canonical links; noindex the default Cloudflare hostname; remove unused deployment assets; unify setup instructions and pin dependency versions. Archive merged branches only after checking their diff.

Acceptance: all route/redirect checks, CI, security checks and the strict production smoke test.

## Batch 1 — this branch

Implemented for code review (not yet deployed):
- WEB-022: External Settings controller and working UI actions; report missing handlers.
- WEB-023: Projects panel now uses local and signed-in cloud project APIs.
- WEB-033: Remove the unavailable Light theme choice.
- Timed autosave choice controls the real timer. Exit and background saves remain as a safety net.
- Extend syntax and panel rendering CI coverage.

Before merge: test real Settings save/reload, local/cloud project open, import/export, signed-out offline mode, all browser workflows and accessibility. Review Cloudflare preview before promoting. Log findings as resolved only after the named acceptance tests pass.
