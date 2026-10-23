begin;
-- Only self-service RPCs can change this queue. Signing in never modifies it.
create table public.account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default clock_timestamp(),
 delete_after timestamptz not null default clock_timestamp() + interval '30 days',
 status text not null default 'pending' check(status in ('pending','processing')),
 locked_until timestamptz,
 check(delete_after >= requested_at + interval '30 days')
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy deletion_read_own on public.account_deletion_requests for select to authenticated using(user_id=(select auth.uid()));
create schema if not exists showduino_private;
revoke all on schema showduino_private from public, anon, authenticated;
-- The scheduler migration replaces this fail-closed verifier with a Vault lookup.
create function showduino_private.deletion_worker_authorized(p_secret text) returns boolean
language sql stable set search_path='' as $$ select false $$;
revoke all on function showduino_private.deletion_worker_authorized(text) from public,anon,authenticated;

create function public.manage_account_deletion(p_action text default 'status', p_confirmation text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); r public.account_deletion_requests; protected boolean;
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'Sign in to manage account deletion.' using errcode='42501'; end if;
 -- Serialize request/cancel with the worker claim for this account.
 perform pg_advisory_xact_lock(hashtextextended(u::text, 4619));
 protected := exists(select 1 from public.app_owner where user_id=u);
 select * into r from public.account_deletion_requests where user_id=u for update;
 if p_action='request' then
  if protected then raise exception 'The protected owner account cannot be deleted here. Contact support to close the service.' using errcode='42501'; end if;
  if p_confirmation <> 'DELETE' then raise exception 'Type DELETE to confirm.' using errcode='22023'; end if;
  if r.user_id is null then
   insert into public.account_deletion_requests(user_id,requested_at,delete_after)
   values(u,clock_timestamp(),clock_timestamp()+interval '30 days') returning * into r;
  end if;
 elsif p_action='cancel' then
  if p_confirmation <> 'CANCEL' then raise exception 'Confirm cancellation.' using errcode='22023'; end if;
  if r.user_id is not null and (r.status <> 'pending' or r.delete_after<=clock_timestamp()) then
   raise exception 'The grace period has ended and deletion can no longer be cancelled.' using errcode='55000';
  end if;
  delete from public.account_deletion_requests where user_id=u;
  r := null;
 elsif p_action <> 'status' then raise exception 'Unknown account action.' using errcode='22023'; end if;
 return jsonb_build_object('owner_protected',protected,'requested_at',r.requested_at,'delete_after',r.delete_after,'status',r.status);
end $$;
revoke all on function public.manage_account_deletion(text,text) from public,anon;
grant execute on function public.manage_account_deletion(text,text) to authenticated;

-- Existing JWTs must not upload files during cleanup or after the Auth user is gone.
create function public.account_storage_active() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=(select auth.uid()))
 and not exists(select 1 from public.account_deletion_requests where user_id=(select auth.uid()) and status='processing')
$$;
revoke all on function public.account_storage_active() from public,anon;
grant execute on function public.account_storage_active() to authenticated;
create policy deletion_storage_guard on storage.objects as restrictive for all to authenticated
 using(public.account_storage_active()) with check(public.account_storage_active());

-- Only the scheduled worker's service-role client can claim due accounts. No early deletion.
create function public.claim_account_deletions(p_secret text) returns setof uuid
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not showduino_private.deletion_worker_authorized(p_secret) then raise exception 'Unauthorized worker.' using errcode='42501'; end if;
 for r in select user_id from public.account_deletion_requests
  where delete_after<=clock_timestamp() and (locked_until is null or locked_until<clock_timestamp())
  order by delete_after limit 5 for update skip locked
 loop
  -- Both this lock and the row lock prevent a cancellation racing the worker.
  -- Cancellation uses the same lock order: advisory then row. Use a try lock to avoid deadlocks.
  if pg_try_advisory_xact_lock(hashtextextended(r.user_id::text,4619)) then
   if not exists(select 1 from public.app_owner where user_id=r.user_id) then
    update public.account_deletion_requests set status='processing',locked_until=clock_timestamp()+interval '10 minutes' where user_id=r.user_id;
    return next r.user_id;
   end if;
  end if;
 end loop;
end $$;
revoke all on function public.claim_account_deletions(text) from public,anon,authenticated;
grant execute on function public.claim_account_deletions(text) to service_role;
commit;
