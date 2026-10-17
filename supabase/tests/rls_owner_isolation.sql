-- Owner-isolation tests for the Showduino schema. Run on an ISOLATED database only
-- (tools/db-test-local.sh). Each check raises an exception on failure; the whole
-- script runs in one transaction that is rolled back.
\set ON_ERROR_STOP on
\if :{?phase}
\else
\set phase baseline
\endif
begin;
select set_config('w002.phase', :'phase', true);
\o /dev/null
-- two creators and their data (created as the superuser, bypassing RLS)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'alice@example.test', '{"display_name":"Alice"}'),
  ('00000000-0000-4000-8000-00000000000b', 'bob.private@example.test', '{}');
insert into public.projects (id, user_id, name) values ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'Alice show');
insert into public.devices (user_id, name, device_type, identifier) values ('00000000-0000-4000-8000-00000000000a', 'P4', 'stage', 'P4-01');
insert into public.creator_publications (creator_id, username, display_name) values ('00000000-0000-4000-8000-00000000000a', 'alice', 'Alice');
insert into storage.objects (bucket_id, name) values ('hauntsync-avatars', '00000000-0000-4000-8000-00000000000a/avatar-aaaa.png');

create temp table results (check_name text, ok boolean, detail text) on commit drop;
grant insert, select on results to anon, authenticated;

create or replace function pg_temp.expect(name text, cond boolean, detail text default '') returns void language plpgsql as $$
begin insert into results values (name, cond, detail); end $$;

-- the signup trigger
select pg_temp.expect('signup creates profile with metadata name', (select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000a') = 'Alice');
select pg_temp.expect('signup without a name: ' || case when current_setting('w002.phase') = 'hardened' then 'generic name, no email part (W-010 fixed)' else 'email local-part (W-010, live behaviour)' end,
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000b') = case when current_setting('w002.phase') = 'hardened' then 'Showduino Creator' else 'bob.private' end);

-- act as Bob
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select pg_temp.expect('B cannot read A profile', (select count(*) from public.profiles where id = '00000000-0000-4000-8000-00000000000a') = 0);
select pg_temp.expect('B can read own profile', (select count(*) from public.profiles where id = '00000000-0000-4000-8000-00000000000b') = 1);
select pg_temp.expect('B cannot read A projects', (select count(*) from public.projects) = 0);
select pg_temp.expect('B cannot read A devices', (select count(*) from public.devices) = 0);
with u as (update public.profiles set bio = 'x' where id = '00000000-0000-4000-8000-00000000000a' returning 1) select pg_temp.expect('B cannot update A profile', (select count(*) from u) = 0);
with u as (update public.projects set name = 'x' returning 1) select pg_temp.expect('B cannot update A project', (select count(*) from u) = 0);
with d as (delete from public.projects returning 1) select pg_temp.expect('B cannot delete A project', (select count(*) from d) = 0);
with u as (update public.creator_publications set bio = 'x' returning 1) select pg_temp.expect('B cannot edit A publication', (select count(*) from u) = 0);
with d as (delete from public.creator_publications returning 1) select pg_temp.expect('B cannot unpublish A', (select count(*) from d) = 0);
select pg_temp.expect('B can read public publication', (select count(*) from public.creator_publications) = 1);
select pg_temp.expect('B cannot list A avatar objects', (select count(*) from storage.objects) = 0);
do $$ begin
  begin
    insert into public.projects (id, user_id, name) values (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'planted');
    insert into results values ('B cannot insert a project owned by A', false, 'insert succeeded');
  exception when insufficient_privilege or check_violation then
    insert into results values ('B cannot insert a project owned by A', true, sqlerrm);
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('hauntsync-avatars', '00000000-0000-4000-8000-00000000000a/avatar-bbbb.png');
    insert into results values ('B cannot upload into A avatar folder', false, 'insert succeeded');
  exception when insufficient_privilege or check_violation then
    insert into results values ('B cannot upload into A avatar folder', true, sqlerrm);
  end;
  begin
    insert into public.shared_shows (author_id, title, license, document) values ('00000000-0000-4000-8000-00000000000a', 'Fake', 'cc0-1.0', '{}');
    insert into results values ('B cannot publish a show as A', false, 'insert succeeded');
  exception when insufficient_privilege or check_violation then
    insert into results values ('B cannot publish a show as A', true, sqlerrm);
  end;
end $$;
reset role;

-- anonymous visitor
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare n bigint; begin
  begin select count(*) into n from public.devices; insert into results values ('anon cannot read devices', n = 0, n::text || ' rows');
  exception when insufficient_privilege then insert into results values ('anon cannot read devices', true, 'no privilege'); end;
  begin with u as (update public.devices set notes = 'x' returning 1) select count(*) into n from u; insert into results values ('anon cannot update devices', n = 0, n::text || ' rows');
  exception when insufficient_privilege then insert into results values ('anon cannot update devices', true, 'no privilege'); end;
end $$;
select pg_temp.expect('anon can read publications', (select count(*) from public.creator_publications) = 1);
do $$ begin
  begin
    perform count(*) from public.profiles;
    insert into results values ('anon has no access to profiles', false, 'select allowed');
  exception when insufficient_privilege then insert into results values ('anon has no access to profiles', true, sqlerrm); end;
  begin
    insert into public.community_posts (author_id, author_name, title, content) values ('00000000-0000-4000-8000-00000000000a', 'x', 'x', 'x');
    insert into results values ('anon cannot post', false, 'insert succeeded');
  exception when insufficient_privilege or check_violation then insert into results values ('anon cannot post', true, sqlerrm); end;
end $$;
reset role;

\o
select (case when ok then 'PASS  ' else 'FAIL  ' end) || check_name || case when ok then '' else ' (' || detail || ')' end from results;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception 'RLS isolation: % failed check(s)', (select count(*) from results where not ok); end if;
  raise notice 'RLS isolation: % checks passed', (select count(*) from results);
end $$;
rollback;
