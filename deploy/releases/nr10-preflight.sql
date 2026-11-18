-- Read-only release checks. Run as an administrative reader on the candidate database.
-- Presence checks do not replace canonical schema hashes or end-to-end validation.
with checks as (
  select 'revalidation_table' as check_name,
    to_regclass('ptw.permit_revalidation') is not null as ok
  union all
  select 'revalidation_function', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ptw' and p.proname='permit_revalidate'
  )
  union all
  select 'electrical_policy', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ptw' and p.proname='electrical_policy_problem'
  )
  union all
  select 'revalidation_rls', coalesce((
    select relrowsecurity from pg_class where oid=to_regclass('ptw.permit_revalidation')
  ),false)
  union all
  select 'revalidation_guard', exists (
    select 1 from pg_trigger where tgrelid=to_regclass('ptw.permit_revalidation')
      and tgname='revalidation_guard' and tgenabled in ('O','A')
  )
  union all
  select 'immutable_revalidation', exists (
    select 1 from pg_trigger where tgrelid=to_regclass('ptw.permit_revalidation')
      and tgname='permit_revalidation_frozen' and tgenabled in ('O','A')
  )
)
select bool_and(ok) as ready,
  jsonb_object_agg(check_name,ok order by check_name) as checks
from checks;
