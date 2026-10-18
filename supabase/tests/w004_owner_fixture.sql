-- LOCAL TEST ONLY. The W004 migration pins the owner to the founder's Supabase Auth user, which
-- exists in production. A throw-away database needs a stand-in row with the same UUID first.
insert into auth.users (id, email) values ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'founder@example.test') on conflict (id) do nothing;
