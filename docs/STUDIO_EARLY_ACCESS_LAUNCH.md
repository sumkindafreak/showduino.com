# Showduino Studio Early Access — web-first launch gate

**Scope:** Launch the public website and browser creator **before** Showduino hardware is sold or hardware-signed-off.

**Status:** Preparation in a review branch. No production deployment or public sign-up acceptance is implied by this document. This gate is intentionally different from the full hardware/product release gate in `docs/WEBSITE_RELEASE_CHECKLIST.md`.

## Public promise

- Visitors can learn the system, author a show in Studio, preview creative timing, save locally and export/import a portable `.shdo` file. No hardware or account required for **local** work.
- Avoid claiming every future node/cue is executable, that browser previews prove hardware results, or that Showduino hardware is currently for sale.
- The public HTTPS Studio does not directly control local hardware. The future hardware path uses the Communications S3 local console and authoritative P4.
- Browser storage is not a durable account backup; teach creators to export their own files.
- Account/cloud save and HauntSync participation are **separate** services with their own production gates. Never call those features launched merely because the pages render.

## Gate A — public guest creator preview (fastest safe launch)

| Gate | Evidence | Result |
| --- | --- | --- |
| Phase 1 (#91) and Phase 2 (#93, incorporating #94) reviewed and integrated to intended release branch | PR/merge history and CI against final head | NOT VERIFIED |
| First-time anonymous visitor creates a show with First Show wizard and without credentials | Real desktop browser run | NOT RUN |
| Timeline allows edits; preview is clearly simulation only | Real browser run | NOT RUN |
| Save, reload, new project, export, import, and return to editing work on real desktop and physical Android | Browser test notes and downloaded/reimported .shdo | NOT RUN |
| Show from older export reimports safely; hostile input rejected | Existing automated tests plus manual sample | NOT RUN against final release |
| Clear notice about device-local storage loss and portable .shdo backup | Homepage, Studio context and docs | IMPLEMENTED IN LAUNCH BRANCH |
| Preview domain: static paths, privacy/terms/support, CSP, mobile, no missing assets | CI and physical browser checks | NOT RUN against final release |
| Cloud/account features do not offer broken sign-up or imply guaranteed cloud storage when those gates fail | Manual unauthenticated account/onboarding review | NOT RUN |
| Owner signs off release messaging and explicitly approves merge/deploy | Written approval | PENDING |

**Important:** If account delivery is unverified, do not broadly promote a free Showduino ID or cloud backup. Either complete Gate B before public promotion or intentionally put account/community registration into a clear not-yet-open state; don't leave a broken public signup path.

## Gate B — public accounts, private cloud projects, HauntSync

Required **before inviting the public to create accounts or entrusting private shows to the hosted database**:

1. Verify live custom SMTP and sender authentication; sign-up confirmation, resend, password-reset and recovery all succeed for external addresses (`docs/EMAIL_DELIVERY_SETUP.md`).
2. Schedule encrypted database **and file storage** backups, test restoration to a non-production environment, record recovery evidence (`docs/BACKUP_AND_RECOVERY.md`).
3. Review live Supabase security advisors, exposed RPC permissions and role checks, OTP expiry, leaked-password protection, account deletion and retention. Run two-account isolation tests. Do not presume an advisor warning is a proven exploit, or suppress a warning without reviewing intent.
4. Test project saves across browsers and devices. Local same-browser conflict protection **does not** prevent cloud last-write-wins from two devices; disclose that limitation until corrected.
5. Exercise registration, login, logout, recovery, private cloud project creation, export, deletion, profile and community moderation with dedicated external test accounts. Clean them up.
6. Review privacy notice/terms (including personal-data processing and 14+ age policy) and actual published support/contact process.
7. Owner approves hosted account/community release independently of guest Studio availability.

## Gate C — Showduino hardware launch (later)

- Physical Stage P4 compiler/SHDO, pixel/audio/MOSFET nodes, Director, Comms, emergency/STOP/recovery acceptance.
- Verify lamp firmware before implying simplified C3 Lamp support.
- Firmware and website Studio .shdo compatibility on actual target hardware.
- Product build, support, documentation, safety testing and fulfilment readiness.

Gate C **must not be required for Gate A**, provided public copy clearly distinguishes creation/preview from operating hardware.

## Suggested launch sequence

1. Merge/review the stacked website repair branches in dependency order; do not deploy until Gate A acceptance.
2. Complete real-device guest-create/export/import tests; correct any failures.
3. Put the early-access landing/guide changes through PR review and CI.
4. Decide whether Gate B is ready. If not, keep the public experience clearly guest-only and prevent misleading account CTAs/registration.
5. Publish the public creator release after explicit owner approval; monitor issues and let users export their own backups.
6. Open accounts/HauntSync after Gate B passes; launch hardware after Gate C passes.

**Deployment is an operator decision.** A green CI badge is not proof that SMTP, cloud backups, real browser UX or P4 hardware are working.
