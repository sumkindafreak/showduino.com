# Firebase setup — legacy only

Firebase is **not** the active Showduino or HauntSync database.

The production website uses **Supabase** for:

- Showduino ID / authentication
- HauntSync profiles
- HauntSync community posts and replies
- Showduino Studio cloud projects
- Registered device inventory
- Realtime community updates

Use [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) for the current backend architecture and migration history.

The historical `HauntSyncForum_Configured/` Firebase prototype remains in the repository only as an archive of earlier development work. Do not copy its Firebase configuration into the production website.
