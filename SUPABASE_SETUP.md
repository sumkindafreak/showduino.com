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

One profile per Supabase Auth user. The `on_auth_user_created` database trigger creates the initial profile automatically from the `display_name` auth metadata.

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

Initial migrations:

```text
20260824105000_create_showduino_hauntsync_core.sql
20260824105500_enable_hauntsync_realtime.sql
```

These migrations have already been applied to the production `showduino` Supabase project.

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
- Profile access
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

Run Supabase Security and Performance Advisors after future schema changes.

## First live test

1. Open `/account.html` and create a Showduino ID.
2. Confirm the account email if email confirmation is enabled.
3. Open `/hauntsync.html` signed out and confirm the public feed loads.
4. Sign in and create a community post.
5. Add a reply and verify it appears without refreshing.
6. Register a device and confirm it appears in the private workspace.
7. Open Studio, save a project, then return to HauntSync and confirm the Supabase project appears.
8. Open the cloud project from HauntSync and confirm Studio loads it.
9. Repeat with a local-only project.
