-- Publicação 24/11/2026: Gestão de Ativos (ficha SGI em attrs), delegação geral (SPEC Delegações) e Dashboard (SPEC 001).
-- Atualização ADITIVA para um banco que já roda o esquema da publicação de 23/11/2026 (commit 51f19b5).
-- Rodar como dono (ptw_owner / postgres do Supabase), numa transação só. Não apaga dados.
-- Pode ser colado inteiro no SQL Editor do Supabase. Ensaiado em 24/11/2026: esquema de 23/11 + dados de teste
-- → este script → estrutura idêntica à do esquema novo criado do zero (pg_dump -s comparado).
-- O Dashboard (SPEC 001) não muda o banco.
begin;
set local search_path = ptw, public;
set local lock_timeout = '10s';

-- 1) Ficha SGI (attrs) em local e ativo; a busca passa a achar TPLNR/WERKS (local) e EQUNR/TPLNR (ativo).
create or replace function ptw.attrs_ok(a jsonb) returns boolean
  language sql immutable parallel safe
  return jsonb_typeof(a) = 'object' and octet_length(a::text) <= 8192;

revoke execute on function ptw.attrs_ok(jsonb) from public;
grant execute on function ptw.attrs_ok(jsonb) to ptw_app;

alter table ptw.location add column if not exists attrs jsonb not null default '{}'::jsonb check (ptw.attrs_ok(attrs));
alter table ptw.asset add column if not exists attrs jsonb not null default '{}'::jsonb check (ptw.attrs_ok(attrs));

drop index if exists ptw.location_search_trgm;
alter table ptw.location drop column search;
alter table ptw.location add column search text generated always as (ptw.search_text(variadic array[code, name, attrs->>'tplnr', attrs->>'werks'] || aliases)) stored;
create index location_search_trgm on ptw.location using gin (search gin_trgm_ops);

drop index if exists ptw.asset_search_trgm;
alter table ptw.asset drop column search;
alter table ptw.asset add column search text generated always as (ptw.search_text(variadic array[code, name, attrs->>'equnr', attrs->>'tplnr'] || aliases)) stored;
create index asset_search_trgm on ptw.asset using gin (search gin_trgm_ops);

-- 2) Delegação geral: sem aprovação escolhida, vale para todas as aprovações nominais delegáveis do delegante.
alter table ptw.delegation alter column slot_id drop not null;
create index if not exists delegation_delegator_ix on ptw.delegation(unit_id,delegator_id,starts_at) where revoked_at is null;

create or replace function ptw.delegation_guard() returns trigger language plpgsql as $$
declare sl record; loc ltree; today date;
begin
  if ptw.current_person() is null then raise insufficient_privilege using message='Delegação exige pessoa autenticada'; end if;
  if tg_op='UPDATE' then
    if old.revoked_at is not null or new.revoked_at is null
      or (to_jsonb(new)-array['revoked_at','revoked_by','revoked_reason','revision'])
         is distinct from (to_jsonb(old)-array['revoked_at','revoked_by','revoked_reason','revision']) then
      raise check_violation using message='Delegação só pode ser revogada; preserve a autorização original';
    end if;
    new.revoked_at:=clock_timestamp();new.revoked_by:=ptw.current_person();new.revision:=old.revision+1;
    return new;
  end if;
  if new.ends_at<=clock_timestamp() or new.starts_at<clock_timestamp()-interval '5 minutes' then
    raise check_violation using message='O período de delegação deve começar agora ou no futuro';
  end if;
  select l.path into loc from ptw.location l where l.unit_id=new.unit_id and l.id=new.scope_location_id;
  select (clock_timestamp() at time zone u.timezone)::date into today from ptw.unit u where u.id=new.unit_id;
  if new.slot_id is null then
    -- Mandato geral: o delegante precisa ser o aprovador nominal de ao menos uma aprovação administrativa
    -- delegável, e as duas pessoas precisam do cargo dessa aprovação no escopo. Cada uso volta a conferir.
    if not exists(select 1 from ptw.sign_slot s join ptw.stage st on st.unit_id=s.unit_id and st.id=s.stage_id
        join ptw.template_version v on v.unit_id=s.unit_id and v.id=s.version_id
        where s.unit_id=new.unit_id and s.person_id=new.delegator_id and s.delegable and st.kind is null and v.status<>'rascunho') then
      raise check_violation using message='O delegante não é aprovador nominal de nenhuma aprovação administrativa delegável';
    end if;
    if not exists(select 1 from ptw.sign_slot s join ptw.stage st on st.unit_id=s.unit_id and st.id=s.stage_id
        join ptw.template_version v on v.unit_id=s.unit_id and v.id=s.version_id
        where s.unit_id=new.unit_id and s.person_id=new.delegator_id and s.delegable and st.kind is null and v.status<>'rascunho'
          and ptw.person_ok(new.unit_id,new.delegator_id,s.role_ids,today,loc,true)
          and ptw.person_ok(new.unit_id,new.delegate_id,s.role_ids,today,loc,true)) then
      raise check_violation using message='Delegante e delegado precisam de conta e cargo válidos no escopo';
    end if;
  else
    select s.*, st.kind as stage_kind into sl from ptw.sign_slot s join ptw.stage st on st.unit_id=s.unit_id and st.id=s.stage_id
      join ptw.template_version v on v.unit_id=s.unit_id and v.id=s.version_id
      where s.unit_id=new.unit_id and s.id=new.slot_id and v.status<>'rascunho';
    if not found or not sl.delegable or sl.stage_kind is not null or sl.person_id<>new.delegator_id then
      raise check_violation using message='A assinatura não permite esta delegação administrativa';
    end if;
    if not ptw.person_ok(new.unit_id,new.delegator_id,sl.role_ids,today,loc,true)
       or not ptw.person_ok(new.unit_id,new.delegate_id,sl.role_ids,today,loc,true) then
      raise check_violation using message='Delegante e delegado precisam de conta e cargo válidos no escopo';
    end if;
  end if;
  -- Um mandato por vez para o mesmo delegante e a mesma aprovação (o geral cobre todas).
  perform pg_advisory_xact_lock(hashtextextended('delegation:'||new.unit_id::text||':'||new.delegator_id::text,0));
  if exists(select 1 from ptw.delegation d where d.unit_id=new.unit_id and d.delegator_id=new.delegator_id and d.revoked_at is null
      and (d.slot_id is null or new.slot_id is null or d.slot_id=new.slot_id)
      and tstzrange(d.starts_at,d.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
    raise unique_violation using message='Já existe delegação sobreposta para este delegante e esta aprovação';
  end if;
  new.created_by:=ptw.current_person();new.created_at:=clock_timestamp();new.revision:=1;
  new.revoked_at:=null;new.revoked_by:=null;new.revoked_reason:=null;
  return new;
end $$;

create or replace function ptw.delegation_for(p_unit uuid,p_slot uuid,p_delegate uuid,loc ltree) returns uuid
  language sql volatile as $$
  select d.id from ptw.sign_slot s join ptw.stage st on st.unit_id=s.unit_id and st.id=s.stage_id
    join ptw.delegation d on d.unit_id=s.unit_id and d.delegator_id=s.person_id and (d.slot_id=s.id or d.slot_id is null)
    join ptw.unit u on u.id=d.unit_id left join ptw.location l on l.unit_id=d.unit_id and l.id=d.scope_location_id
   where s.unit_id=p_unit and s.id=p_slot and d.delegate_id=p_delegate and d.revoked_at is null
     and d.starts_at<=clock_timestamp() and clock_timestamp()<d.ends_at and s.delegable and st.kind is null
     and (d.scope_location_id is null or l.path @> loc)
     and ptw.person_ok(p_unit,d.delegator_id,s.role_ids,(clock_timestamp() at time zone u.timezone)::date,loc,true)
     and ptw.person_ok(p_unit,d.delegate_id,s.role_ids,(clock_timestamp() at time zone u.timezone)::date,loc,true)
     and not exists(select 1 from ptw.person pe where pe.unit_id=p_unit and pe.id in(d.delegator_id,d.delegate_id)
       and pe.account_expires<=clock_timestamp())
   order by d.slot_id is null, d.id limit 1
$$;

create or replace function ptw.slot_candidates_for(p_unit uuid,p_slot uuid,today date,loc ltree)
  returns table(person_id uuid,name text,ok boolean) language sql stable as $$
  select c.person_id,c.name,c.ok and (not s.delegable or ptw.person_ok(p_unit,c.person_id,s.role_ids,today,loc,true))
    from ptw.sign_slot s cross join lateral ptw.slot_candidates(p_unit,s.kind,s.role_ids,s.person_id,today,loc) c
   where s.unit_id=p_unit and s.id=p_slot
  union all
  select pe.id,pe.name,true from ptw.sign_slot s
    join ptw.delegation d on d.unit_id=s.unit_id and d.delegator_id=s.person_id and (d.slot_id=s.id or d.slot_id is null)
    join ptw.person pe on pe.unit_id=d.unit_id and pe.id=d.delegate_id
   where s.unit_id=p_unit and s.id=p_slot and d.id=ptw.delegation_for(p_unit,p_slot,d.delegate_id,loc)
$$;

-- 3) Registro na trilha (o registro inicial do esquema é imutável; os hashes desta publicação ficam no evento).
select ptw.audit_system('sistema.esquema.alterado', 'Publicação 24/11/2026: ficha SGI (attrs), delegação geral e Dashboard',
  jsonb_build_object('publicacao', '2026-11-24-ativos-delegacoes-dashboard', 'arquivos', '{"00_base.sql": "d9c591c02cc5b647ff69102fa19c40effdb2248c85d6b686899d7677d0410722", "10_cadastro.sql": "4573110373f4de4dd8860c280e74a26e2a9a4d6ceb36e1f30daed687d41b6003", "20_modelos.sql": "b868bb983ae13a339bbf1c9cd47dd66df917b1b0dc20f24f942d72c179b56fbe", "25_appearance.sql": "f4a85bcf65df16c2a0553181d7a41a89600bdeb3c3fe14c288ee60d0a563728f", "26_governance.sql": "08bc2fc8b6bceb8032137b6b49205515338c17c67a19ded368c3db88fc08fb57", "30_pt.sql": "cfd62acb3bef8ee3ad651e879b5b1c291312032f13309a711cdcd1d0bc96620f", "40_formulario.sql": "8a7f24735d929e2e5ab19a120a44666c108b57b1d79d71f3a484b240b681fbd3", "45_eletrica.sql": "eedf1c321325ccc8da846e1d22356b36d40b61efb587cb87ba818116be385cf3", "50_auditoria.sql": "4baa9e0e7738d6c1dcda7b561a8322afd08aef4f1a65e15feb23754c9b787ade", "60_acesso.sql": "4287f91ac0cf11c739dba9120e6c12f8a5d143eef8213f4e9d5cd954dd587cc1"}'::jsonb));
commit;
