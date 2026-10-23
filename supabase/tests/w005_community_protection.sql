-- W005 community-protection tests. Run on an ISOLATED database only (tools/db-test-local.sh)
-- after the W004 and W005 migrations. Everything is rolled back; fails if any check fails.
\set ON_ERROR_STOP on
begin;
\o /dev/null

-- Fixtures. O = owner (pinned UUID), A = Alice, B = Bob, C = Carol (never publishes),
-- M = Mallory, S = Sam (suspended).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@example.test', '{"display_name":"Alice"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'bob@example.test', '{"display_name":"Bob"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'carol@example.test', '{"display_name":"Carol Private"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'mallory@example.test', '{"display_name":"Mallory"}'),
  ('00000000-0000-4000-8000-0000000000f1', 'sam@example.test', '{"display_name":"Sam"}'),
  ('00000000-0000-4000-8000-0000000000d1', 'dana@example.test', '{"display_name":"Dana Private Name"}');
insert into public.creator_publications (creator_id, username, display_name) values
  ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'showduino_admin', 'Showduino-admin'),
  ('00000000-0000-4000-8000-0000000000a1', 'alice', 'Alice'),
  ('00000000-0000-4000-8000-0000000000b1', 'bob', 'Bob'),
  ('00000000-0000-4000-8000-0000000000e1', 'mallory', 'Mallory'),
  ('00000000-0000-4000-8000-0000000000f1', 'sam', 'Sam'),
  ('00000000-0000-4000-8000-0000000000d1', 'dana', 'Dana')
  on conflict (creator_id) do nothing;

create temp table results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant insert, select on results to anon, authenticated;
grant usage on sequence results_n_seq to anon, authenticated;
create or replace function pg_temp.expect(name text, cond boolean, detail text default '') returns void language plpgsql as $$
begin insert into results (check_name, ok, detail) values (name, coalesce(cond, false), detail); end $$;
create or replace function pg_temp.refused(name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into results (check_name, ok, detail) values (name, false, 'statement succeeded: ' || stmt);
  exception when others then insert into results (check_name, ok, detail) values (name, true, sqlstate || ' ' || sqlerrm); end;
end $$;
create or replace function pg_temp.allowed(name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into results (check_name, ok, detail) values (name, true, '');
  exception when others then insert into results (check_name, ok, detail) values (name, false, sqlstate || ' ' || sqlerrm); end;
end $$;
create or replace function pg_temp.affected(name text, stmt text, expected int) returns void language plpgsql as $$
declare n int;
begin
  begin execute stmt; get diagnostics n = row_count; insert into results (check_name, ok, detail) values (name, n = expected, n || ' rows');
  exception when others then insert into results (check_name, ok, detail) values (name, expected = 0, 'error: ' || sqlerrm); end;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ---------------------------------------------------------------- 1. look-alike names (W5-07)
select pg_temp.expect('reserved: ' || n, public.name_is_reserved(n)) from (values
  ('Sh0wduino Team'), ('Sh' || chr(1086) || 'wduino Team'), ('SH' || chr(1054) || 'WDUINO'), ('Shówduino'), ('ＳＨＯＷＤＵＩＮＯ'),
  ('Show' || chr(8203) || 'duino'), ('F0under'), ('Adm1n'), ('Off1cial Props'), ('0fficia|'), ('Supp0rt'), ('0wner'),
  (chr(919) || 'auntSync'), ('H4untSync HQ'), ('M0d'), ('S.h.o.w.d.u.i.n.o'), ('Toby (Founder)')) v(n);
select pg_temp.expect('not reserved: ' || n, not public.name_is_reserved(n)) from (values
  ('Alice'), ('Bob Makes Props'), ('Mallory Makes'), ('Fog Lab 3000'), ('Creepy Carnival'), ('Zoë Effects'), ('Hall of 13 Doors')) v(n);

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.refused('member cannot take a digit look-alike name', $q$update public.creator_publications set display_name = 'Sh0wduino Support' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('member cannot take a Cyrillic look-alike name', $q$update public.creator_publications set display_name = 'Sh$q$ || chr(1086) || $q$wduino Team' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('member cannot take a look-alike username in profile', $q$update public.profiles set username = 'h4untsync' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.allowed('ordinary rename still works', $q$update public.creator_publications set display_name = 'Mallory Makes Fog' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
reset role;

-- ---------------------------------------------------------------- 2. smaller public surface (W5-14)
set local role authenticated;
select pg_temp.as_user('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.allowed('owner restricts Bob', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000b1', 'restricted', 'cool-off')$q$);
select pg_temp.allowed('owner suspends Sam', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000f1', 'suspended', 'spam')$q$);
select pg_temp.expect('owner sees Bob restricted', public.member_state('00000000-0000-4000-8000-0000000000b1') = 'restricted');
select pg_temp.expect('public_name never returns a private name, even to the owner', public.public_name('00000000-0000-4000-8000-0000000000c1') = 'Showduino Creator');
select pg_temp.expect('owner member list shows Carol''s private name', exists (select 1 from public.admin_list_members('Carol', 50, 0) m where m.display_name = 'Carol Private'));
select pg_temp.expect('owner member list still shows restricted', exists (select 1 from public.admin_list_members('', 50, 0) m where m.user_id = '00000000-0000-4000-8000-0000000000b1' and m.status = 'restricted'));
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect('visitor sees Bob as active (restriction is private)', public.member_state('00000000-0000-4000-8000-0000000000b1') = 'active');
select pg_temp.expect('visitor still sees Sam suspended', public.member_state('00000000-0000-4000-8000-0000000000f1') = 'suspended');
select pg_temp.expect('visitor gets the generic name for an unpublished member', public.public_name('00000000-0000-4000-8000-0000000000c1') = 'Showduino Creator');
select pg_temp.expect('visitor gets published names', public.public_name('00000000-0000-4000-8000-0000000000a1') = 'Alice');
select pg_temp.expect('suspended creator still hidden from visitors', not exists (select 1 from public.creator_publications where creator_id = '00000000-0000-4000-8000-0000000000f1'));
select pg_temp.refused('visitor cannot call within_limit', $q$select public.within_limit('project')$q$);
select pg_temp.refused('visitor cannot count another account''s usage', $q$select public.usage_count('project', '00000000-0000-4000-8000-0000000000a1')$q$);
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.expect('Alice sees Bob as active', public.member_state('00000000-0000-4000-8000-0000000000b1') = 'active');
select pg_temp.expect('Alice gets the generic name for Carol', public.public_name('00000000-0000-4000-8000-0000000000c1') = 'Showduino Creator');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
select pg_temp.expect('Bob sees his own restriction', public.member_state('00000000-0000-4000-8000-0000000000b1') = 'restricted');
select pg_temp.expect('restricted Bob still cannot participate', not public.can_participate());
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select pg_temp.expect('public_name is the generic label for Carol herself too', public.public_name('00000000-0000-4000-8000-0000000000c1') = 'Showduino Creator');
reset role;

-- ---------------------------------------------------------------- 3. account limits (W5-08)
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.expect('limits are readable', (select count(*) from public.account_limits) = 4);
select pg_temp.refused('members cannot change limits', $q$update public.account_limits set max_total = 100000$q$);
select pg_temp.allowed('Alice creates 50 cloud shows today', $q$insert into public.projects (id, user_id, name) select gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'Show ' || g from generate_series(1, 50) g$q$);
select pg_temp.refused('the 51st cloud show today is refused', $q$insert into public.projects (id, user_id, name) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'One too many')$q$);
select pg_temp.expect('my_usage reports 50 of 100 shows', (public.my_usage() -> 'project' ->> 'used')::int = 50 and (public.my_usage() -> 'project' ->> 'max')::int = 100);
select pg_temp.allowed('Alice can still edit her shows at the limit', $q$update public.projects set name = 'Renamed' where user_id = '00000000-0000-4000-8000-0000000000a1'$q$);
-- The website saves with upsert (INSERT ... ON CONFLICT DO UPDATE); at the limit an existing
-- show must still save, and only a genuinely new show is refused.
select pg_temp.allowed('Alice can still save an existing show by upsert at the daily limit', $q$insert into public.projects (id, user_id, name, project_data) select id, user_id, 'Saved again', '{"v":2}'::jsonb from public.projects where user_id = '00000000-0000-4000-8000-0000000000a1' limit 1 on conflict (id) do update set name = excluded.name, project_data = excluded.project_data$q$);
select pg_temp.refused('a new show by upsert at the daily limit is refused', $q$insert into public.projects (id, user_id, name) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'New by upsert') on conflict (id) do update set name = excluded.name$q$);
select pg_temp.allowed('Alice registers 100 devices today', $q$insert into public.devices (user_id, name, device_type, identifier) select '00000000-0000-4000-8000-0000000000a1', 'Node ' || g, 'Pixel Node', 'id-' || g from generate_series(1, 100) g$q$);
select pg_temp.refused('the 101st device today is refused', $q$insert into public.devices (user_id, name, device_type, identifier) values ('00000000-0000-4000-8000-0000000000a1', 'Extra', 'Pixel Node', 'id-extra')$q$);
select pg_temp.allowed('Alice uploads 5 avatars', $q$insert into storage.objects (bucket_id, name) select 'hauntsync-avatars', '00000000-0000-4000-8000-0000000000a1/avatar-' || g || 'a.png' from generate_series(1, 5) g$q$);
select pg_temp.refused('a 6th stored avatar is refused', $q$insert into storage.objects (bucket_id, name) values ('hauntsync-avatars', '00000000-0000-4000-8000-0000000000a1/avatar-6a.png')$q$);
select pg_temp.allowed('Alice uploads 20 post images today', $q$insert into storage.objects (bucket_id, name) select 'community-images', '00000000-0000-4000-8000-0000000000a1/post-' || gen_random_uuid() || '.png' from generate_series(1, 20) g$q$);
select pg_temp.refused('the 21st post image today is refused', $q$insert into storage.objects (bucket_id, name) values ('community-images', '00000000-0000-4000-8000-0000000000a1/post-' || gen_random_uuid() || '.png')$q$);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.refused('a suspended member cannot upload an avatar', $q$insert into storage.objects (bucket_id, name) values ('hauntsync-avatars', '00000000-0000-4000-8000-0000000000f1/avatar-1a.png')$q$);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.refused('Mallory cannot fill Alice''s quota or write to her folder', $q$insert into storage.objects (bucket_id, name) values ('hauntsync-avatars', '00000000-0000-4000-8000-0000000000a1/avatar-7a.png')$q$);
select pg_temp.as_user('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.allowed('the owner is not limited', $q$insert into public.projects (id, user_id, name) select gen_random_uuid(), 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'Owner ' || g from generate_series(1, 60) g$q$);
reset role;
select pg_temp.allowed('server-side writes (no signed-in user) are not limited', $q$insert into public.projects (id, user_id, name) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'Restore by support')$q$);

-- ---------------------------------------------------------------- 4. moderation evidence (W5-11)
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.allowed('Alice posts twice', $q$insert into public.community_posts (id, author_id, title, content, category) values
  ('30000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Keep me', 'c', 'general'),
  ('30000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'Will be hidden', 'c', 'general')$q$);
select pg_temp.allowed('Alice comments', $q$insert into public.community_comments (id, post_id, author_id, content) values ('40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'hello')$q$);
select pg_temp.as_user('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.allowed('owner hides a post and a comment', $q$select public.admin_moderate('post', '30000000-0000-4000-8000-0000000000a2', 'hide', 'spam'), public.admin_moderate('comment', '40000000-0000-4000-8000-0000000000a1', 'remove', 'abuse')$q$);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
select pg_temp.allowed('Dana posts, then unpublishes her creator page', $q$insert into public.community_posts (id, author_id, title, content, category) values ('30000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', 'Dana post', 'c', 'general'); delete from public.creator_publications where creator_id = '00000000-0000-4000-8000-0000000000d1'$q$);
select pg_temp.as_user('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.allowed('owner hides Dana''s post', $q$select public.admin_moderate('post', '30000000-0000-4000-8000-0000000000d1', 'hide', 'review')$q$);
select pg_temp.expect('owner moderation never stores a private name as the public author', (select author_name from public.community_posts where id = '30000000-0000-4000-8000-0000000000d1') = 'Showduino Creator');
select pg_temp.affected('owner cannot delete rows directly (only logged moderation)', $q$delete from public.community_posts where id = '30000000-0000-4000-8000-0000000000a1'$q$, 0);
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.affected('Alice cannot delete her hidden post', $q$delete from public.community_posts where id = '30000000-0000-4000-8000-0000000000a2'$q$, 0);
select pg_temp.affected('Alice cannot delete her removed comment', $q$delete from public.community_comments where id = '40000000-0000-4000-8000-0000000000a1'$q$, 0);
select pg_temp.affected('Alice can still delete her visible post', $q$delete from public.community_posts where id = '30000000-0000-4000-8000-0000000000a1'$q$, 1);
select pg_temp.refused('members cannot record file removals', $q$select public.admin_record_file_removal('community-images', '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-0000000000aa.png', 'x')$q$);
select pg_temp.as_user('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.allowed('owner records a file removal', $q$select public.admin_record_file_removal('community-images', '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-0000000000aa.png', 'Removed with the post')$q$);
select pg_temp.refused('unknown bucket refused', $q$select public.admin_record_file_removal('other', '00000000-0000-4000-8000-0000000000a1/post-x.png', '')$q$);
select pg_temp.refused('path outside the community pattern refused', $q$select public.admin_record_file_removal('community-images', '../etc/passwd', '')$q$);
select pg_temp.expect('file removal is in the audit log', exists (select 1 from public.moderation_log where action = 'file_removed' and target_id like 'community-images/00000000-0000-4000-8000-0000000000a1/post-%' and reason = 'Removed with the post'));
select pg_temp.expect('migration is in the audit log', exists (select 1 from public.moderation_log where action = 'migration_applied' and target_id = 'w005_community_protection'));
reset role;

-- ---------------------------------------------------------------- 5. ownership unchanged
select pg_temp.expect('still exactly one owner, the pinned founder', (select count(*) = 1 and bool_and(user_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea') from public.app_owner));
select pg_temp.expect('RLS still on every public table', not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity));
select pg_temp.expect('account_limits has no write grants', not has_table_privilege('authenticated', 'public.account_limits', 'update') and not has_table_privilege('anon', 'public.account_limits', 'insert'));

\o
select check_name || ': ' || case when ok then 'PASS' else 'FAIL  ' || detail end from results order by n;
select '== W005: ' || count(*) || ' checks, ' || count(*) filter (where not ok) || ' failed' from results;
do $$ begin if exists (select 1 from results where not ok) then raise exception 'W005 community-protection tests failed'; end if; end $$;
rollback;
