# Showduino + HauntSync Supabase

Showduino.com uses Supabase as the cloud backend for Showduino ID, Studio cloud projects, registered hardware and the HauntSync community.

## Production project

- Supabase project: `showduino`
- Project ref: `fczxcvlyydcqdhjkejmd`
- Region: `eu-west-2`
- Browser configuration: `config/runtime-config.js`

Only the Supabase **publishable** key belongs in browser code. Never commit a service-role key.

## Database model

```text
profiles
projects
devices
community_posts
community_comments
```

### profiles

One profile per Supabase Auth user. The `on_auth_user_created` database trigger creates the initial profile automatically from the `display_name` auth metadata. The HauntSync migration also backfilled profiles for accounts that existed before the trigger was added.

### projects

Private Showduino Studio projects. RLS restricts every row to its owning `user_id`.

### devices

Private hardware inventory for a signed-in creator. RLS restricts every row to its owning `user_id`.

### community_posts

Publicly readable HauntSync posts. Authentication is required to create/update/delete and RLS limits changes to the post author.

Supported categories:

- `general`
- `build-log`
- `show-design`
- `code-control`
- `props-fx`
- `lighting-audio`
- `help-wanted`
- `showcase`

### community_comments

Publicly readable replies. Authentication is required to create/update/delete and RLS limits changes to the reply author.

## Realtime

`community_posts` and `community_comments` are included in the `supabase_realtime` publication. HauntSync subscribes to Postgres changes so posts and replies refresh without a page reload.

## Migrations

The production schema is versioned under:

```text
supabase/migrations/
```

Production migration history:

```text
20260807125329_showduino_accounts_and_projects.sql
20260824100024_expand_showduino_for_hauntsync.sql
20260824100115_lock_down_profile_trigger_function.sql
20260824100527_add_hauntsync_author_indexes.sql
```

The first migration already existed in the restored Showduino project. The HauntSync migrations were applied directly to the production `showduino` Supabase project on 24 August 2026 and then copied into GitHub so source control matches production.

## Website integration

The browser loads:

```text
config/runtime-config.js
@supabase/supabase-js
js/cloud/supabase-service.js
```

The shared `ShowduinoSupabase` service provides:

- Email/password account registration and sign-in
- Email confirmation and password recovery
- HauntSync identity/profile editing
- Studio project save/list/load/delete
- Device save/list/delete
- HauntSync post creation/listing/deletion
- HauntSync replies
- Realtime post/reply subscriptions

## Security model

Row Level Security is enabled on every Showduino public table.

- Profiles: owner only
- Projects: owner only
- Devices: owner only
- Community posts: public read, author write
- Community replies: public read, author write

The `handle_new_user()` function is `SECURITY DEFINER` so the Auth trigger can create profiles, but direct execution has been revoked from `public`, `anon` and `authenticated` roles.

Supabase Security Advisor currently has one remaining Auth-level recommendation: enable leaked-password protection in the Supabase dashboard. It is not a database/RLS defect.

The two HauntSync author foreign keys have covering indexes. Unused-index notices are expected before the new tables have real traffic.

## First live test

1. Open `/account.html` and sign in with the existing Showduino ID or create a new one.
2. Confirm the account email if email confirmation is enabled.
3. Edit the HauntSync identity and save a display name / haunt or company.
4. Open `/hauntsync.html` signed out and confirm the public feed loads.
5. Sign in and create a community post.
6. Add a reply and verify it appears without refreshing.
7. Register a device and confirm it appears in the private workspace.
8. Open Studio, save a project, then return to HauntSync and confirm the Supabase project appears.
9. Open the cloud project from HauntSync and confirm Studio loads it.
10. Repeat with a local-only project.
