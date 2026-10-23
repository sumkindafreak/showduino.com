# Account deletion

An explicit request from Account or Profile sets a server-controlled deadline 30 days later.
The account stays usable. Signing in and checking the status never cancel or postpone deletion.
Only **Cancel deletion** before the deadline cancels it. Repeat requests preserve the deadline.
The protected founder account cannot use self-service deletion; closing the entire service needs a separate procedure.

A five-minute Supabase Cron job calls `account-deletion-worker`. A random credential is stored
in Vault, never in website code. The function verifies it through a service-role-only RPC,
claims only due accounts with a ten-minute retry lease, blocks new sign-ins, removes all avatar
and community-image files through Storage, then hard-deletes Auth. Foreign-key cascades remove
account-owned cloud data. Failed cleanup retries without falsely marking the account deleted.
A restrictive storage policy blocks processing/deleted accounts even with an unexpired JWT.
No account is scheduled by this deployment itself.

This removes the live account, not local browser exports, copies other people downloaded,
provider backups or retained moderation/security records. Do not promise immediate erasure
of every backup. Retention periods remain to be settled in legal draft #82.

## Confirmed founder decisions for #82

- Operator: Toby Brandon, independently operated hobby project.
- Contact: showduino38@gmail.com (domain forwarding is not configured).
- Minimum signup age: 14+; child-access/safety work still required.
- Postal correspondence address: unresolved, leave marked in the draft.
- Account deletion: 30 days, fully usable throughout, explicit cancellation only.

## Deployment and tests

1. Run isolated SQL tests via `tools/db-test-local.sh`; worker and browser tests in CI.
2. Apply `20261023121748_account_deletion.sql`.
3. Deploy the two worker files with JWT verification off: the function authenticates its
   dedicated scheduler header itself. Missing or invalid credentials must return 403.
4. Apply `20261023121757_account_deletion_scheduler.sql`; inspect the named Cron job.
5. Publish the frontend only when both migrations and worker are active.

The automated tests use synthetic users. Never shorten a real member's deadline to test cleanup.
