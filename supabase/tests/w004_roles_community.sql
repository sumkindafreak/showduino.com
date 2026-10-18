-- W004 role, community and moderation tests. Run on an ISOLATED database only
-- (tools/db-test-local.sh) after 20261018100000_w004_roles_and_community.sql.
-- Every check is recorded; the script fails if any check fails. Everything is rolled back.
\set ON_ERROR_STOP on
begin;
\o /dev/null

-- ---------------------------------------------------------------- fixtures (as superuser)
-- O = founder/owner (pinned UUID), A = Alice, B = Bob, C = Carol (never publishes),
-- M = Mallory (hostile member), S = Sam (will be suspended)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@example.test', '{"display_name":"Alice"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'bob@example.test', '{"display_name":"Bob"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'carol@example.test', '{"display_name":"Carol"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'mallory@example.test', '{"display_name":"Mallory"}'),
  ('00000000-0000-4000-8000-0000000000f1', 'sam@example.test', '{"display_name":"Sam"}');
insert into public.profiles (id, display_name) values ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'Showduino-admin') on conflict (id) do nothing;
insert into public.creator_publications (creator_id, username, display_name) values
  ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'showduino_admin', 'Showduino-admin'),
  ('00000000-0000-4000-8000-0000000000a1', 'alice', 'Alice'),
  ('00000000-0000-4000-8000-0000000000b1', 'bob', 'Bob'),
  ('00000000-0000-4000-8000-0000000000e1', 'mallory', 'Mallory'),
  ('00000000-0000-4000-8000-0000000000f1', 'sam', 'Sam');
insert into public.projects (id, user_id, name) values ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Alice private show');

create temp table results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant insert, select on results to anon, authenticated;
grant usage on sequence results_n_seq to anon, authenticated;

create or replace function pg_temp.expect(name text, cond boolean, detail text default '') returns void language plpgsql as $$
begin insert into results (check_name, ok, detail) values (name, coalesce(cond, false), detail); end $$;
-- Run SQL that must fail. Records the error text.
create or replace function pg_temp.refused(name text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into results (check_name, ok, detail) values (name, false, 'statement succeeded: ' || stmt);
  exception when others then
    insert into results (check_name, ok, detail) values (name, true, sqlstate || ' ' || sqlerrm);
  end;
end $$;
-- Run SQL that must succeed.
create or replace function pg_temp.allowed(name text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into results (check_name, ok, detail) values (name, true, '');
  exception when others then
    insert into results (check_name, ok, detail) values (name, false, sqlstate || ' ' || sqlerrm);
  end;
end $$;
create or replace function pg_temp.affected(name text, stmt text, expected int) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt; get diagnostics n = row_count;
    insert into results (check_name, ok, detail) values (name, n = expected, n || ' rows');
  exception when others then
    insert into results (check_name, ok, detail) values (name, expected = 0, 'error: ' || sqlerrm);
  end;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------- 1. owner identity
select pg_temp.expect('exactly one owner row', (select count(*) from public.app_owner) = 1);
select pg_temp.expect('owner is the pinned founder UUID', (select user_id from public.app_owner) = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.refused('superuser cannot add a second owner', $q$insert into public.app_owner (singleton, user_id) values (true, '00000000-0000-4000-8000-0000000000e1')$q$);
select pg_temp.refused('owner cannot be reassigned outside a migration', $q$update public.app_owner set note = 'x'$q$);
select pg_temp.refused('owner row cannot be deleted', $q$delete from public.app_owner$q$);
select pg_temp.refused('owner row cannot be truncated', $q$truncate public.app_owner$q$);
select pg_temp.refused('owner login cannot be deleted while it is the owner', $q$delete from auth.users where id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea'$q$);
select set_config('showduino.owner_change', 'approved-by-migration', true);
select pg_temp.refused('even an approved migration cannot pin a different UUID', $q$update public.app_owner set user_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select set_config('showduino.owner_change', '', true);
select pg_temp.refused('owner cannot be suspended (direct row)', $q$insert into public.member_status (user_id, status) values ('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'suspended')$q$);
select pg_temp.expect('no role grants on app_owner for API roles',
  not has_table_privilege('anon', 'public.app_owner', 'select') and not has_table_privilege('authenticated', 'public.app_owner', 'select')
  and not has_table_privilege('authenticated', 'public.app_owner', 'insert') and not has_table_privilege('service_role', 'public.app_owner', 'insert'));
select pg_temp.expect('moderation log records the owner assignment', exists (select 1 from public.moderation_log where action = 'owner_assigned' and target_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea'));

-- ---------------------------------------------------------------- 2. visitor (anon)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.refused('anon cannot read app_owner', 'select * from public.app_owner');
select pg_temp.expect('anon is not owner', not public.is_owner());
select pg_temp.expect('anon status is visitor', public.my_community_status() ->> 'role' = 'visitor');
select pg_temp.expect('anon sees 8 categories', (select count(*) from public.community_categories) = 8);
select pg_temp.refused('anon cannot call admin_stats', 'select public.admin_stats()');
select pg_temp.refused('anon cannot call admin_set_member_status', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000b1', 'suspended', 'x')$q$);
select pg_temp.refused('anon cannot post', $q$insert into public.community_posts (author_id, title, content) values ('00000000-0000-4000-8000-0000000000a1', 't', 'c')$q$);
select pg_temp.refused('anon cannot read private projects (no privilege at all)', 'select * from public.projects');
select pg_temp.expect('anon founder id is public', public.community_founder_id() = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea');
select pg_temp.expect('anon sees founder badge for owner only',
  (public.creator_public_stats('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea') ->> 'founder')::boolean
  and not (public.creator_public_stats('00000000-0000-4000-8000-0000000000a1') ->> 'founder')::boolean);
select pg_temp.expect('unpublished member has no public stats', public.creator_public_stats('00000000-0000-4000-8000-0000000000c1') is null);
reset role;

-- ---------------------------------------------------------------- 3. Mallory tries to become admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin","is_admin":true},"user_metadata":{"role":"owner"}}', true);
select pg_temp.expect('forged role claims do not make Mallory owner', not public.is_owner());
select pg_temp.expect('Mallory status is member', public.my_community_status() ->> 'role' = 'member');
select pg_temp.refused('Mallory cannot read app_owner', 'select * from public.app_owner');
select pg_temp.refused('Mallory cannot insert into app_owner', $q$insert into public.app_owner (user_id) values ('00000000-0000-4000-8000-0000000000e1')$q$);
select pg_temp.refused('Mallory cannot set her own member status', $q$insert into public.member_status (user_id, status) values ('00000000-0000-4000-8000-0000000000e1', 'active')$q$);
select pg_temp.refused('Mallory cannot suspend Bob directly', $q$insert into public.member_status (user_id, status) values ('00000000-0000-4000-8000-0000000000b1', 'suspended')$q$);
select pg_temp.refused('Mallory cannot call admin_stats', 'select public.admin_stats()');
select pg_temp.refused('Mallory cannot call admin_list_members', 'select * from public.admin_list_members()');
select pg_temp.refused('Mallory cannot suspend Bob via RPC', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000b1', 'suspended', 'x')$q$);
select pg_temp.refused('Mallory cannot save categories', $q$select public.admin_save_category('mallory', 'Mallory')$q$);
select pg_temp.refused('Mallory cannot write categories directly', $q$insert into public.community_categories (slug, name) values ('x1', 'X')$q$);
select pg_temp.refused('Mallory cannot clear avatars', $q$select public.admin_clear_avatar('00000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.refused('Mallory cannot write the moderation log', $q$insert into public.moderation_log (action, target_type, target_id) values ('x', 'x', 'x')$q$);
select pg_temp.expect('Mallory cannot read the moderation log', (select count(*) from public.moderation_log) = 0);
select pg_temp.refused('Mallory cannot call internal log_moderation', $q$select public.log_moderation('x', 'x', 'x', '', '{}')$q$);
select pg_temp.refused('Mallory cannot set_config her way past the owner guard', $q$select set_config('showduino.owner_change', 'approved-by-migration', true); insert into public.app_owner (user_id) values ('00000000-0000-4000-8000-0000000000e1')$q$);
-- impersonation
select pg_temp.refused('reserved display name refused (profiles)', $q$update public.profiles set display_name = 'Showduino Founder' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('reserved username refused (profiles)', $q$update public.profiles set username = 'admin' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('reserved name refused (publication)', $q$update public.creator_publications set display_name = 'Official HauntSync' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('spaced/punctuated variant refused', $q$update public.creator_publications set display_name = 'S.h.o.w.d.u.i.n.o  A d m i n' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.allowed('ordinary name change allowed', $q$update public.creator_publications set display_name = 'Mallory Makes' where creator_id = '00000000-0000-4000-8000-0000000000e1'$q$);
-- posting with forged fields
select pg_temp.refused('author_name cannot be supplied', $q$insert into public.community_posts (author_id, author_name, title, content) values ('00000000-0000-4000-8000-0000000000e1', 'Showduino', 't', 'c')$q$);
select pg_temp.refused('status cannot be supplied', $q$insert into public.community_posts (author_id, title, content, status) values ('00000000-0000-4000-8000-0000000000e1', 't', 'c', 'visible')$q$);
select pg_temp.refused('is_featured cannot be supplied', $q$insert into public.community_posts (author_id, title, content, is_featured) values ('00000000-0000-4000-8000-0000000000e1', 't', 'c', true)$q$);
select pg_temp.refused('cannot post as Alice', $q$insert into public.community_posts (author_id, title, content) values ('00000000-0000-4000-8000-0000000000a1', 't', 'c')$q$);
select pg_temp.refused('cannot attach an image from Alice''s folder', $q$insert into public.community_posts (author_id, title, content, image_path) values ('00000000-0000-4000-8000-0000000000e1', 't', 'c', '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-000000000001.png')$q$);
select pg_temp.allowed('Mallory can post normally', $q$insert into public.community_posts (id, author_id, title, content, category) values ('20000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1', 'Buy cheap fog', 'spam spam', 'effects')$q$);
select pg_temp.expect('server set the author name', (select author_name from public.community_posts where id = '20000000-0000-4000-8000-0000000000e1') = 'Mallory Makes');
select pg_temp.refused('Mallory cannot un-hide or feature her post', $q$update public.community_posts set status = 'visible', is_featured = true where id = '20000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.refused('shared show author label cannot be supplied', $q$insert into public.shared_shows (author_id, author_label, title, license, document) values ('00000000-0000-4000-8000-0000000000e1', 'Showduino', 'Fake', 'cc0-1.0', '{}')$q$);
reset role;

-- ---------------------------------------------------------------- 4. Alice posts; replies; rate limits
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select pg_temp.allowed('Alice posts', $q$insert into public.community_posts (id, author_id, title, content, category, kind) values ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'My fog chiller build', 'Build log day 1', 'effects', 'build_log')$q$);
select pg_temp.allowed('Alice uploads a post image to her folder', $q$insert into storage.objects (bucket_id, name) values ('community-images', '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-0000000000aa.png')$q$);
select pg_temp.refused('Alice cannot upload into Mallory''s folder', $q$insert into storage.objects (bucket_id, name) values ('community-images', '00000000-0000-4000-8000-0000000000e1/post-00000000-0000-4000-8000-0000000000ab.png')$q$);
select pg_temp.refused('Alice cannot upload a non-image name', $q$insert into storage.objects (bucket_id, name) values ('community-images', '00000000-0000-4000-8000-0000000000a1/post-x.html')$q$);
select pg_temp.affected('Alice cannot edit Mallory''s post', $q$update public.community_posts set content = 'x' where id = '20000000-0000-4000-8000-0000000000e1'$q$, 0);
select pg_temp.affected('Alice cannot delete Mallory''s post', $q$delete from public.community_posts where id = '20000000-0000-4000-8000-0000000000e1'$q$, 0);
select pg_temp.allowed('Alice edits her post', $q$update public.community_posts set content = 'Build log day 1 (edited)' where id = '20000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.expect('edit is marked', (select edited_at is not null from public.community_posts where id = '20000000-0000-4000-8000-0000000000a1'));
select pg_temp.refused('posting into a category that does not exist is refused', $q$insert into public.community_posts (author_id, title, content, category) values ('00000000-0000-4000-8000-0000000000a1', 't', 'c', 'nope')$q$);
select pg_temp.allowed('Alice follows Bob', $q$insert into public.creator_follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')$q$);
select pg_temp.refused('Alice cannot follow herself', $q$insert into public.creator_follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.refused('Alice cannot make Bob follow her', $q$insert into public.creator_follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1')$q$);
-- rate limit: 4 more posts are fine (5 in 10 minutes), the next is refused
select pg_temp.allowed('Alice posts 2-5', $q$insert into public.community_posts (author_id, title, content) select '00000000-0000-4000-8000-0000000000a1', 'p' || g, 'c' from generate_series(2, 5) g$q$);
select pg_temp.refused('6th post in 10 minutes is rate limited', $q$insert into public.community_posts (author_id, title, content) values ('00000000-0000-4000-8000-0000000000a1', 'p6', 'c')$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select pg_temp.allowed('Bob comments on Alice''s post', $q$insert into public.community_comments (id, post_id, author_id, content) values ('30000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Nice build!')$q$);
select pg_temp.refused('Bob cannot comment as Alice', $q$insert into public.community_comments (post_id, author_id, content) values ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'fake')$q$);
select pg_temp.refused('comment author_name cannot be supplied', $q$insert into public.community_comments (post_id, author_id, author_name, content) values ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Admin', 'x')$q$);
select pg_temp.refused('reply must be on the same post', $q$insert into public.community_comments (post_id, author_id, content, parent_id) values ('20000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'x', '30000000-0000-4000-8000-0000000000b1')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select pg_temp.allowed('Alice replies to Bob', $q$insert into public.community_comments (id, post_id, author_id, content, parent_id) values ('30000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Thanks!', '30000000-0000-4000-8000-0000000000b1')$q$);
select pg_temp.allowed('Alice replies to her own reply', $q$insert into public.community_comments (id, post_id, author_id, content, parent_id) values ('30000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'More', '30000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.expect('replies stay one level deep', (select parent_id from public.community_comments where id = '30000000-0000-4000-8000-0000000000a2') = '30000000-0000-4000-8000-0000000000b1');
select pg_temp.affected('Alice cannot edit Bob''s comment', $q$update public.community_comments set content = 'x' where id = '30000000-0000-4000-8000-0000000000b1'$q$, 0);
select pg_temp.refused('comment status cannot be changed by its author', $q$update public.community_comments set status = 'visible' where id = '30000000-0000-4000-8000-0000000000a1'$q$);
-- reports
select pg_temp.allowed('Alice reports Mallory''s spam', $q$insert into public.content_reports (id, reporter_id, target_type, target_id, reason, details) values ('40000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'post', '20000000-0000-4000-8000-0000000000e1', 'spam', 'Selling fog')$q$);
select pg_temp.refused('duplicate report refused', $q$insert into public.content_reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-4000-8000-0000000000a1', 'post', '20000000-0000-4000-8000-0000000000e1', 'spam')$q$);
select pg_temp.refused('report of a missing item refused', $q$insert into public.content_reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-4000-8000-0000000000a1', 'post', '20000000-0000-4000-8000-00000000ffff', 'spam')$q$);
select pg_temp.refused('report status cannot be supplied', $q$insert into public.content_reports (reporter_id, target_type, target_id, reason, status) values ('00000000-0000-4000-8000-0000000000a1', 'comment', '30000000-0000-4000-8000-0000000000b1', 'spam', 'dismissed')$q$);
select pg_temp.refused('cannot report on behalf of someone else', $q$insert into public.content_reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-4000-8000-0000000000b1', 'comment', '30000000-0000-4000-8000-0000000000b1', 'spam')$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select pg_temp.expect('Mallory cannot see who reported her', (select count(*) from public.content_reports) = 0);
select pg_temp.expect('Mallory cannot read Alice''s private projects', (select count(*) from public.projects) = 0);
reset role;

-- ---------------------------------------------------------------- 5. Carol (never published)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select pg_temp.refused('unpublished member cannot post', $q$insert into public.community_posts (author_id, title, content) values ('00000000-0000-4000-8000-0000000000c1', 't', 'c')$q$);
select pg_temp.refused('unpublished member cannot share a show', $q$insert into public.shared_shows (author_id, title, license, document) values ('00000000-0000-4000-8000-0000000000c1', 'Show', 'cc0-1.0', '{}')$q$);
select pg_temp.allowed('unpublished member can follow privately', $q$insert into public.creator_follows (follower_id, followee_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.expect('Carol sees her own follow', (select count(*) from public.creator_follows where follower_id = '00000000-0000-4000-8000-0000000000c1') = 1);
select pg_temp.expect('Carol can_participate is false', not (public.my_community_status() ->> 'can_participate')::boolean);
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect('visitors do not see an unpublished member''s follows', (select count(*) from public.creator_follows where follower_id = '00000000-0000-4000-8000-0000000000c1') = 0);
select pg_temp.expect('visitors see the public follow', (select count(*) from public.creator_follows) = 1);
select pg_temp.expect('visitors see the visible posts (Alice 5 + Mallory 1)', (select count(*) from public.community_posts) = 6);
reset role;

-- ---------------------------------------------------------------- 6. the owner moderates
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea","role":"authenticated"}', true);
select pg_temp.expect('owner is_owner()', public.is_owner());
select pg_temp.expect('owner status role is owner', public.my_community_status() ->> 'role' = 'owner');
select pg_temp.expect('owner sees the report', (select count(*) from public.content_reports) = 1);
select pg_temp.allowed('owner hides Mallory''s post', $q$select public.admin_moderate('post', '20000000-0000-4000-8000-0000000000e1', 'hide', 'Spam')$q$);
select pg_temp.allowed('owner resolves the report', $q$select public.admin_resolve_report('40000000-0000-4000-8000-0000000000a1', 'actioned', 'Hidden as spam')$q$);
select pg_temp.refused('hidden post cannot be featured', $q$select public.admin_moderate('post', '20000000-0000-4000-8000-0000000000e1', 'feature')$q$);
select pg_temp.allowed('owner features Alice''s build log', $q$select public.admin_moderate('post', '20000000-0000-4000-8000-0000000000a1', 'feature')$q$);
select pg_temp.allowed('owner hides Bob''s comment', $q$select public.admin_moderate('comment', '30000000-0000-4000-8000-0000000000b1', 'hide', 'test')$q$);
select pg_temp.allowed('owner restores Bob''s comment', $q$select public.admin_moderate('comment', '30000000-0000-4000-8000-0000000000b1', 'restore')$q$);
select pg_temp.refused('unknown moderation action refused', $q$select public.admin_moderate('post', '20000000-0000-4000-8000-0000000000a1', 'delete-everything')$q$);
select pg_temp.allowed('owner restricts Bob', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000b1', 'restricted', 'Cool-off')$q$);
select pg_temp.allowed('owner suspends Sam', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000f1', 'suspended', 'Abuse')$q$);
select pg_temp.refused('owner cannot suspend the owner (RPC)', $q$select public.admin_set_member_status('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'suspended', 'oops')$q$);
select pg_temp.refused('owner cannot restrict the owner (RPC)', $q$select public.admin_set_member_status('c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea', 'restricted', 'oops')$q$);
select pg_temp.allowed('owner adds a category', $q$select public.admin_save_category('props', 'Props', 'Static props', 45, true)$q$);
select pg_temp.allowed('owner retires a category', $q$select public.admin_save_category('general', 'General discussion', 'Everything else.', 90, false)$q$);
select pg_temp.expect('owner lists all 6 members', (select count(*) from public.admin_list_members()) = 6);
select pg_temp.expect('member list marks exactly one owner', (select count(*) from public.admin_list_members() where is_owner) = 1);
select pg_temp.expect('member search works', (select count(*) from public.admin_list_members('mall')) = 1);
select pg_temp.expect('member list shows open reports per member', (select open_reports from public.admin_list_members('mall')) = 0);
select pg_temp.expect('stats count members', (public.admin_stats() ->> 'members')::int = 6);
select pg_temp.expect('owner sees the moderation log', (select count(*) from public.moderation_log where actor_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea') >= 9);
select pg_temp.expect('owner sees hidden content', (select count(*) from public.community_posts where status = 'hidden') = 1);
select pg_temp.allowed('owner may use a reserved name', $q$update public.creator_publications set display_name = 'Showduino Founder' where creator_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea'$q$);
select pg_temp.allowed('owner can remove a post image for moderation', $q$delete from storage.objects where bucket_id = 'community-images' and name = '00000000-0000-4000-8000-0000000000a1/post-00000000-0000-4000-8000-0000000000aa.png'$q$);
reset role;

-- ---------------------------------------------------------------- 7. effects of moderation
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect('hidden post is not public', (select count(*) from public.community_posts where id = '20000000-0000-4000-8000-0000000000e1') = 0);
select pg_temp.expect('featured post is public and featured', (select is_featured from public.community_posts where id = '20000000-0000-4000-8000-0000000000a1'));
select pg_temp.expect('restored comment is public', (select count(*) from public.community_comments where id = '30000000-0000-4000-8000-0000000000b1') = 1);
select pg_temp.expect('suspended member''s profile is hidden', (select count(*) from public.creator_publications where creator_id = '00000000-0000-4000-8000-0000000000f1') = 0);
select pg_temp.expect('retired category hidden from visitors', (select count(*) from public.community_categories where slug = 'general') = 0);
select pg_temp.refused('visitors cannot read the moderation log (no privilege at all)', 'select * from public.moderation_log');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select pg_temp.expect('author still sees her hidden post', (select status from public.community_posts where id = '20000000-0000-4000-8000-0000000000e1') = 'hidden');
select pg_temp.allowed('author edits her hidden post', $q$update public.community_posts set content = 'sorry' where id = '20000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect('edit does not un-hide it', (select status from public.community_posts where id = '20000000-0000-4000-8000-0000000000e1') = 'hidden');
select pg_temp.refused('posting into a retired category is refused', $q$insert into public.community_posts (author_id, title, content, category) values ('00000000-0000-4000-8000-0000000000e1', 't', 'c', 'general')$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select pg_temp.expect('Bob sees his restriction and reason', public.my_community_status() ->> 'status' = 'restricted' and public.my_community_status() ->> 'status_reason' = 'Cool-off');
select pg_temp.refused('restricted member cannot post', $q$insert into public.community_posts (author_id, title, content, category) values ('00000000-0000-4000-8000-0000000000b1', 't', 'c', 'audio')$q$);
select pg_temp.refused('restricted member cannot comment', $q$insert into public.community_comments (post_id, author_id, content) values ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'x')$q$);
select pg_temp.refused('restricted member cannot lift his own restriction', $q$update public.member_status set status = 'active' where user_id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.allowed('restricted member can still edit his profile', $q$update public.creator_publications set bio = 'quiet now' where creator_id = '00000000-0000-4000-8000-0000000000b1'$q$);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select pg_temp.refused('suspended member cannot post', $q$insert into public.community_posts (author_id, title, content, category) values ('00000000-0000-4000-8000-0000000000f1', 't', 'c', 'audio')$q$);
select pg_temp.refused('suspended member cannot report', $q$insert into public.content_reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-4000-8000-0000000000f1', 'post', '20000000-0000-4000-8000-0000000000a1', 'spam')$q$);
select pg_temp.affected('suspended member cannot re-publish', $q$update public.creator_publications set bio = 'back' where creator_id = '00000000-0000-4000-8000-0000000000f1'$q$, 0);
select pg_temp.expect('suspended member still sees his own profile', (select count(*) from public.creator_publications where creator_id = '00000000-0000-4000-8000-0000000000f1') = 1);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea","role":"authenticated"}', true);
select pg_temp.allowed('owner reactivates Bob', $q$select public.admin_set_member_status('00000000-0000-4000-8000-0000000000b1', 'active', 'Back')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select pg_temp.allowed('reactivated member can post again', $q$insert into public.community_posts (author_id, title, content, category) values ('00000000-0000-4000-8000-0000000000b1', 'Back', 'Hello again', 'audio')$q$);
reset role;

-- ---------------------------------------------------------------- 8. audit trail integrity
select pg_temp.refused('moderation log cannot be edited (even by the superuser)', $q$update public.moderation_log set reason = 'x'$q$);
select pg_temp.refused('moderation log cannot be deleted', $q$delete from public.moderation_log$q$);
select pg_temp.refused('moderation log cannot be truncated', $q$truncate public.moderation_log$q$);
select pg_temp.expect('every owner action is logged with the owner as actor',
  (select count(*) from public.moderation_log where actor_id = 'c6ebbc99-f01e-45ba-9bc3-e5e7e2f354ea'
     and action in ('hide', 'report_actioned', 'feature', 'restore', 'member_restricted', 'member_suspended', 'category_saved', 'member_active')) >= 9);
select pg_temp.expect('no account other than the founder can be owner',
  (select count(*) from auth.users u where exists (select 1 from public.app_owner o where o.user_id = u.id)) = 1);

\o
select format('%s  %s%s', case when ok then 'PASS' else 'FAIL' end, check_name, case when ok then '' else '  -- ' || detail end) from results order by n;
select format('== W004: %s checks, %s failed', count(*), count(*) filter (where not ok)) from results;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception 'W004 role/community tests failed'; end if;
end $$;
rollback;
