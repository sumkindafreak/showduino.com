# HauntSync founder and administrator guide (W004)

This guide is for the Showduino founder: the only account with administrator rights.

## 1. Who is the administrator

| Fact | How it is enforced |
|---|---|
| Exactly one owner | `public.app_owner` has a one-row primary key (`singleton`) |
| The owner is the founder's Supabase Auth account `c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea` | Check constraint `app_owner_pinned`. The founder confirmed this account on 2026-10-18. |
| Nobody can change it from the website, the API, the Supabase client or browser storage | No privileges for `anon`, `authenticated` or `service_role`. RLS is on with no policies. A trigger refuses every insert, update, delete or truncate unless a migration explicitly approves it. |
| The owner's login cannot be deleted by accident | `app_owner.user_id` references `auth.users` with `ON DELETE RESTRICT`. Deleting that user in the dashboard fails. |
| The owner cannot be restricted or suspended | Refused by `admin_set_member_status` and by a trigger on `member_status` |
| Names do not grant anything | A display name or username such as "admin" or "founder" is reserved for members and gives no rights. The founder badge is drawn from `app_owner`, not from any name. |

The founder signs in exactly like everyone else, at **Account**, with the existing email and password. There is no admin URL to register with and no shared admin password.

### Changing the owner (rare)
1. Write a new migration that replaces the `app_owner_pinned` constraint with the new account's UUID.
2. Inside the migration, run `select set_config('showduino.owner_change', 'approved-by-migration', true);` before updating the row.
3. Review and test it like any other migration (`tools/db-test-local.sh`).

## 2. The dashboard

Open **HauntSync → Admin**. The link only appears for the owner, and the page checks again with the database before it shows anything.

| Tab | What you can do |
|---|---|
| Overview | Members, published creators, open reports, posts, comments, shared shows, follows, restricted and suspended counts, moderation actions in the last 30 days |
| Reports | Open, actioned or dismissed reports, with a preview of the reported item and the reporter's note. **Hide** or **Remove** the item (which also marks the report actioned), **Dismiss**, **Mark actioned**, **Reopen**. |
| Posts | Every post, including hidden and removed ones. Hide, remove, restore, feature, unfeature, delete an attached image file. |
| Shared shows | Hide, restore, feature or unfeature `.shdo` templates |
| Members | Search by name or username. **Restrict** (can read, cannot post, comment or share), **Suspend** (profile, posts, comments and shows hidden, cannot take part), **Reactivate**, **Clear photo**. Your own row says *Owner (protected)*. |
| Categories | Add, rename, reorder, retire or reopen categories. A retired category stays on old posts but takes no new ones. |
| Audit log | The last 200 moderation actions: who, what, when, reason. The log is append-only, even for the database superuser. |

On any post page you also get **Founder: Hide · Remove · Feature** links.

Reasons you type for hide, remove, restrict or suspend are shown to the member concerned. Keep them factual.

## 3. Day-to-day moderation
1. Check **Reports** (the tab shows a count).
2. Open the item and decide: hide (reversible) or remove (also reversible, but meant for clear rule breaks).
3. For repeat problems, **Restrict** for a cool-off period, then **Reactivate**. **Suspend** is for serious or persistent abuse.
4. Delete image files only when the image itself is the problem. A hidden post's image file stays reachable to anyone who already has its address.
5. Members can ask for a review through **Support**.

## 4. What the database enforces for members
These limits come from RLS, column privileges and triggers, not from the website:
- Members can only create, edit or delete their own posts and comments. Moderation fields (status, featured, reasons) are not writable by them at all.
- Post and comment author names are set by the server from the published creator profile.
- Posting, commenting and sharing need a published creator profile and an active account.
- Images: own folder only, JPEG, PNG or WebP, 3 MB.
- Rate limits:
  - 5 posts per 10 minutes, 20 per day;
  - 20 comments per 10 minutes, 150 per day;
  - 5 shared shows per day;
  - 10 reports per hour;
  - 100 follows per hour.

  The owner is exempt.
- Reserved names: admin, founder, moderator, official, showduino, hauntsync, staff, mod, root, system, owner, support, help, security. Spacing and punctuation tricks are caught.

## 5. If something goes wrong
- **Rollback.** Follow `docs/W004_SECURITY_AND_ROLES.md` §6. The rollback drops the community tables, so export them first.
- **Lost access.** If the founder can no longer sign in, reset the password through Supabase Auth. The owner row is tied to the account ID, not the password or email, so it survives a password or email change.
