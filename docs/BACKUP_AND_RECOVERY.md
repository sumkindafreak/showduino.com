# Backup and recovery

Status on 11 November 2026: **no backup or restore has been demonstrated.**

## Facts

| Item | Value | Source |
| --- | --- | --- |
| Supabase organisation plan | Free | Supabase organisation record |
| Automatic backups on that plan | Not included, per Supabase pricing. Check Database → Backups in the dashboard | Supabase pricing page |
| Point-in-time recovery | Not available on Free | Supabase pricing page |
| Database region | London (eu-west-2) | Supabase project record |
| Data today | 1 account, 1 profile, 1 published creator page, 0 shows, posts, comments or reports | Row counts |
| Uploaded images | Buckets `hauntsync-avatars` and `community-images`. Database backups never include stored files | Supabase documentation |
| Studio shows | Kept in each visitor's browser unless they sign in and save to the cloud | `js/studio-projects.js` |

The loss today would be small. That changes as soon as members save shows to the cloud.

## Decision for the owner

Either move the organisation to a paid plan that includes daily backups, or run the manual
backup below on a schedule you will keep. Decide before inviting members.

## Manual backup

`tools/backup-dump.sh` wraps the Supabase CLI. It writes three files (roles, schema, data)
to a dated folder **outside this repository**, because everything inside the repository is
published by the website.

```bash
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'   # from the dashboard; never commit it
tools/backup-dump.sh ~/showduino-backups
```

A dump contains members' email addresses and private shows. Keep it encrypted, off shared
drives, and delete old copies on the schedule your privacy notice promises.

Stored images need a separate copy (dashboard → Storage → download, or the S3-compatible
endpoint). The script does not copy them.

## Restore drill (never against the live project)

1. Start a scratch database: `supabase start` on your own computer, or a new empty Supabase project.
2. Restore in order: `psql "$SCRATCH_URL" -f roles.sql`, then `schema.sql`, then `data.sql`.
3. Run `supabase/tests/rls_owner_isolation.sql` against the scratch database.
4. Compare row counts with the counts the backup script printed.
5. Record the date, the time it took and any errors below.

| Date | Backup taken from | Restored to | Counts match | Time taken | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Until one row is filled in, recovery is unproven.

## What a restore does not bring back

- Images deleted from storage since the backup.
- Shows that only ever lived in a visitor's browser.
- Accounts deleted on request must be deleted again after a restore from an older backup.
  Keep the list of completed deletions (`account_deletion_requests`) newer than your oldest backup.

## Editing the same show in two places (Phase 3)

| Situation | Protected? |
|---|---|
| Two tabs of the same browser on one device | **Yes.** The older tab does not save over the newer one; it is told, and Save offers keep-both, replace, or nothing. A show deleted in one tab is not saved back by another. |
| The two saves landing in the same instant | Not guaranteed. The check and the write are separate steps. |
| Two browsers or two devices saving the same cloud show | **No.** The last save to the cloud wins without a warning. Needs a server-side revision check. |
| A private window, or site data cleared | No history is kept, so there is nothing to compare with. |
