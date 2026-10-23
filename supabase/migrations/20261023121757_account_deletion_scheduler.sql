begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- A dedicated random credential is generated inside Vault; no secret is committed or printed.
do $$ begin
 if not exists(select 1 from vault.secrets where name='showduino_account_deletion_worker') then
  perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'showduino_account_deletion_worker');
 end if;
end $$;
create or replace function showduino_private.deletion_worker_authorized(p_secret text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_secret is not null and length(p_secret)>=64 and exists(
  select 1 from vault.decrypted_secrets where name='showduino_account_deletion_worker' and decrypted_secret=p_secret)
$$;
revoke all on function showduino_private.deletion_worker_authorized(text) from public,anon,authenticated;
-- Supabase execution is usually within five minutes of the deadline; failed runs retry.
select cron.schedule('showduino-account-deletion','*/5 * * * *', $job$
 select net.http_post(
  url:='https://fczxcvlyydcqdhjkejmd.supabase.co/functions/v1/account-deletion-worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-deletion-secret',
   (select decrypted_secret from vault.decrypted_secrets where name='showduino_account_deletion_worker')),
  body:='{}'::jsonb,timeout_milliseconds:=10000)
 where exists(select 1 from public.account_deletion_requests where delete_after<=now());
$job$);
commit;
