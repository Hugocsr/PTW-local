-- Publicação 25/11/2026: Grupos no formato SGI com Perfis de acesso (SPEC 002).
-- Atualização ADITIVA para um banco que já roda o esquema da publicação de 24/11/2026
-- (deploy/releases/2026-11-24-ativos-delegacoes-dashboard.sql). Não apaga nem altera dados existentes.
-- Rodar como dono (ptw_owner / postgres do Supabase), numa transação só; pode ser colado inteiro no SQL Editor.
-- Ensaiado em 25/11/2026: esquema de 24/11 + dados de exemplo → este script → estrutura idêntica à do
-- esquema novo criado do zero (pg_dump -s comparado).
-- Depois de rodar: nenhum grupo concede nada até receber um perfil. Crie os perfis em Cadastros › Perfis de acesso.
begin;
set local search_path = ptw, public;
set local lock_timeout = '10s';

-- 1) Perfis de acesso, perfis e plantas dos grupos, origem das permissões e guardas (26_governance.sql).
-- ---------- Perfis de acesso (SPEC 002) ----------
-- Catálogo das permissões de sessão (as mesmas de api_session.grants). Um perfil é um conjunto nomeado
-- delas; o grupo concede os seus perfis ativos aos membros. O diretório (LDAP) continua valendo: as
-- permissões efetivas da sessão são as do diretório mais as de ptw.person_access_sources.
create function ptw.access_grants_ok(g text[]) returns boolean
  language sql immutable parallel safe
  return g <@ array['cadastro','modelos','auditoria','exportacao']::text[] and array_position(g, null) is null;

create table ptw.access_profile (
  unit_id uuid not null references ptw.unit(id),
  id uuid not null default uuidv7(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  permissions text[] not null check (cardinality(permissions) between 1 and 4 and ptw.access_grants_ok(permissions)),
  active boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id)
);
create unique index access_profile_name_uq on ptw.access_profile (unit_id, lower(btrim(name)));
create trigger access_profile_revision before update on ptw.access_profile
  for each row execute function ptw.bump_revision();

create table ptw.person_group_profile (
  unit_id uuid not null,
  group_id uuid not null,
  profile_id uuid not null,
  primary key (unit_id, group_id, profile_id),
  foreign key (unit_id, group_id) references ptw.person_group(unit_id, id),
  foreign key (unit_id, profile_id) references ptw.access_profile(unit_id, id)
);
create index person_group_profile_profile_ix on ptw.person_group_profile(unit_id, profile_id);

-- Plantas de atuação do grupo: registradas e exibidas; as permissões valem para a unidade (SPEC 002, decisão 2).
create table ptw.person_group_scope (
  unit_id uuid not null,
  group_id uuid not null,
  location_id uuid not null,
  primary key (unit_id, group_id, location_id),
  foreign key (unit_id, group_id) references ptw.person_group(unit_id, id),
  foreign key (unit_id, location_id) references ptw.location(unit_id, id)
);
create function ptw.person_group_scope_check() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from ptw.location l where l.unit_id = new.unit_id and l.id = new.location_id and l.parent_id is null) then
    raise check_violation using message = 'A planta do grupo deve ser um local raiz (planta)';
  end if;
  return new;
end $$;
create trigger person_group_scope_check before insert on ptw.person_group_scope
  for each row execute function ptw.person_group_scope_check();

-- Permissões de quem age, gravadas pela API no contexto (ptw.grants = efetivas da sessão).
-- Serviço e sistema (carga, manutenção) não são limitados.
create function ptw.actor_grants() returns text[]
  language sql stable parallel safe
  return case when ptw.ctx('auth') in ('servico', 'sistema') then array['cadastro','modelos','auditoria','exportacao']
              else coalesce(string_to_array(ptw.ctx('grants'), ','), '{}') end;

-- De onde vem cada permissão concedida por grupo: perfis ativos dos grupos ativos; pessoa ativa e
-- com conta válida. A API soma isto às permissões do diretório em cada chamada.
create function ptw.person_access_sources(p_unit uuid, p_person uuid)
  returns table(grant_key text, group_id uuid, profile_id uuid) language sql stable as $$
  select distinct g, pg.id, ap.id
    from ptw.person pe
    join ptw.person_group_member m on m.unit_id = pe.unit_id and m.person_id = pe.id
    join ptw.person_group pg on pg.unit_id = m.unit_id and pg.id = m.group_id and pg.active
    join ptw.person_group_profile gp on gp.unit_id = pg.unit_id and gp.group_id = pg.id
    join ptw.access_profile ap on ap.unit_id = gp.unit_id and ap.id = gp.profile_id and ap.active
    cross join lateral unnest(ap.permissions) g
   where pe.unit_id = p_unit and pe.id = p_person and pe.enabled and pe.status <> 'inativo'
     and (pe.account_expires is null or pe.account_expires > clock_timestamp())
$$;

-- Ninguém concede nem retira o que não tem (SPEC 002, regra 9).
create function ptw.access_need(p_need text[]) returns void language plpgsql as $$
begin
  if not coalesce(p_need, '{}') <@ ptw.actor_grants() then
    raise insufficient_privilege using message = 'Você não pode conceder ou retirar permissões que não tem';
  end if;
end $$;
create function ptw.group_permissions(p_unit uuid, p_group uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(distinct g), '{}') from ptw.person_group_profile gp
    join ptw.access_profile ap on ap.unit_id = gp.unit_id and ap.id = gp.profile_id
    cross join lateral unnest(ap.permissions) g
   where gp.unit_id = p_unit and gp.group_id = p_group
$$;
create function ptw.access_profile_guard() returns trigger language plpgsql as $$
begin
  if ptw.current_person() is null and ptw.ctx('auth') not in ('servico', 'sistema') then
    raise insufficient_privilege using message = 'Governança exige pessoa autenticada';
  end if;
  -- Permissão fora do catálogo: a restrição da tabela recusa (23514) com a mensagem certa.
  if not ptw.access_grants_ok(new.permissions) then return new; end if;
  perform ptw.access_need(case when tg_op = 'INSERT' then new.permissions else old.permissions || new.permissions end);
  return new;
end $$;
create trigger access_profile_guard before insert or update on ptw.access_profile
  for each row execute function ptw.access_profile_guard();
create function ptw.group_profile_guard() returns trigger language plpgsql as $$
declare r record := coalesce(new, old);
begin
  perform ptw.access_need((select permissions from ptw.access_profile where unit_id = r.unit_id and id = r.profile_id));
  return r;
end $$;
create trigger person_group_profile_guard before insert or delete on ptw.person_group_profile
  for each row execute function ptw.group_profile_guard();
create function ptw.group_member_guard() returns trigger language plpgsql as $$
declare r record := coalesce(new, old);
begin
  perform ptw.access_need(ptw.group_permissions(r.unit_id, r.group_id));
  return r;
end $$;
create trigger person_group_member_access before insert or delete on ptw.person_group_member
  for each row execute function ptw.group_member_guard();
create trigger person_group_profile_actor before insert or delete on ptw.person_group_profile
  for each row execute function ptw.governance_actor_guard();
create trigger person_group_scope_actor before insert or delete on ptw.person_group_scope
  for each row execute function ptw.governance_actor_guard();
create function ptw.group_active_guard() returns trigger language plpgsql as $$
begin
  if new.active is distinct from old.active then perform ptw.access_need(ptw.group_permissions(new.unit_id, new.id)); end if;
  return new;
end $$;
create trigger person_group_active_access before update on ptw.person_group
  for each row execute function ptw.group_active_guard();


-- 2) Trilha de auditoria das novas tabelas (50_auditoria.sql).
do $$
declare t text[];
begin
  foreach t slice 1 in array array[
    ['access_profile',        'cadastro.perfil.criado',          'cadastro.perfil.alterado',          'cadastro.perfil.removido',          'Perfil de acesso',     'id'],
    ['person_group_profile',  'cadastro.grupo.perfil.incluido',  'cadastro.grupo.perfil.alterado',    'cadastro.grupo.perfil.removido',    'Perfil do grupo',      'group_id'],
    ['person_group_scope',    'cadastro.grupo.planta.incluida',  'cadastro.grupo.planta.alterada',    'cadastro.grupo.planta.removida',    'Planta do grupo',      'group_id']]
  loop
    execute format('create trigger audit_row after insert or update or delete on ptw.%I for each row '
                   'execute function ptw.audit_row(%L, %L, %L, %L, %L)', t[1], t[2], t[3], t[4], t[5], t[6]);
  end loop;
end $$;

-- 3) Isolamento por unidade e privilégios (60_acesso.sql).
do $$
declare t text;
begin
  foreach t in array array['access_profile', 'person_group_profile', 'person_group_scope'] loop
    execute format('alter table ptw.%I enable row level security', t);
    execute format('create policy unit_isolation on ptw.%I using (unit_id = (select ptw.current_unit()))
                    with check (unit_id = (select ptw.current_unit()))', t);
  end loop;
end $$;
revoke execute on function ptw.access_grants_ok(text[]), ptw.actor_grants(), ptw.person_access_sources(uuid, uuid),
  ptw.access_need(text[]), ptw.group_permissions(uuid, uuid), ptw.access_profile_guard(), ptw.group_profile_guard(),
  ptw.group_member_guard(), ptw.group_active_guard(), ptw.person_group_scope_check() from public;
grant execute on function ptw.access_grants_ok(text[]), ptw.actor_grants(), ptw.person_access_sources(uuid, uuid),
  ptw.access_need(text[]), ptw.group_permissions(uuid, uuid), ptw.access_profile_guard(), ptw.group_profile_guard(),
  ptw.group_member_guard(), ptw.group_active_guard(), ptw.person_group_scope_check() to ptw_app;
grant select on ptw.access_profile, ptw.person_group_profile, ptw.person_group_scope to ptw_app;
grant insert, update on ptw.access_profile to ptw_app;
grant insert, delete on ptw.person_group_profile, ptw.person_group_scope to ptw_app;

-- 4) Registro na trilha (os hashes desta publicação ficam no evento).
select ptw.audit_system('sistema.esquema.alterado', 'Publicação 25/11/2026: Grupos SGI e Perfis de acesso',
  jsonb_build_object('publicacao', '2026-11-25-grupos-perfis', 'arquivos', '{"00_base.sql": "d9c591c02cc5b647ff69102fa19c40effdb2248c85d6b686899d7677d0410722", "10_cadastro.sql": "4573110373f4de4dd8860c280e74a26e2a9a4d6ceb36e1f30daed687d41b6003", "20_modelos.sql": "b868bb983ae13a339bbf1c9cd47dd66df917b1b0dc20f24f942d72c179b56fbe", "25_appearance.sql": "f4a85bcf65df16c2a0553181d7a41a89600bdeb3c3fe14c288ee60d0a563728f", "26_governance.sql": "2b99d18eef6bce18306add0e37e83c9bca1369b8fb85872500031e4ba1d3904c", "30_pt.sql": "cfd62acb3bef8ee3ad651e879b5b1c291312032f13309a711cdcd1d0bc96620f", "40_formulario.sql": "8a7f24735d929e2e5ab19a120a44666c108b57b1d79d71f3a484b240b681fbd3", "45_eletrica.sql": "eedf1c321325ccc8da846e1d22356b36d40b61efb587cb87ba818116be385cf3", "50_auditoria.sql": "871f77514b2323d69c5aac3275bcf178f31f526abe4abfd9f58a27699408cc02", "60_acesso.sql": "10c8b2e98a86a6f006dda40a77fe57bb1c72ca0dc63bafbe8f029385d7f91211"}'::jsonb));
commit;
