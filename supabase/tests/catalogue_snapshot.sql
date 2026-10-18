-- LOCAL TEST ONLY. Prints a stable description of the public/storage schema so a rollback can be
-- compared with the state before a migration. Used by tools/db-test-local.sh.
select 'policy|' || schemaname || '.' || tablename || '|' || policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname in ('public', 'storage')
union all
select 'grant|' || table_schema || '.' || table_name || '|' || grantee || '|' || privilege_type
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
union all
select 'colgrant|' || table_name || '.' || column_name || '|' || grantee || '|' || privilege_type
  from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and (table_schema, table_name, grantee, privilege_type) not in (select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants)
union all
select 'column|' || table_name || '.' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
  from information_schema.columns where table_schema = 'public'
union all
select 'constraint|' || conrelid::regclass::text || '|' || conname || '|' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace
union all
-- who can execute (raw ACL text differs between Supabase and plain PostgreSQL defaults)
select 'function|' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' || md5(pg_get_functiondef(p.oid))
       || '|anon=' || has_function_privilege('anon', p.oid, 'execute') || '|authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p where p.pronamespace = 'public'::regnamespace
union all
select 'trigger|' || tgrelid::regclass::text || '|' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'pg_%'
union all
select 'bucket|' || id || '|' || public::text || '|' || coalesce(file_size_limit::text, '') from storage.buckets
union all
select 'table|' || relname || '|rls=' || relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
order by 1;
