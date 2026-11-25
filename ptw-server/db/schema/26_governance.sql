create table ptw.person_group (
  unit_id uuid not null references ptw.unit(id),
  id uuid not null default uuidv7(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  active boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id)
);
create unique index person_group_name_uq on ptw.person_group (unit_id, lower(btrim(name)));
create trigger person_group_revision before update on ptw.person_group
  for each row execute function ptw.bump_revision();

create table ptw.person_group_member (
  unit_id uuid not null,
  group_id uuid not null,
  person_id uuid not null,
  primary key (unit_id, group_id, person_id),
  foreign key (unit_id, group_id) references ptw.person_group(unit_id, id),
  foreign key (unit_id, person_id) references ptw.person(unit_id, id)
);
create index person_group_member_person_ix on ptw.person_group_member(unit_id, person_id, group_id);

create function ptw.governance_actor_guard() returns trigger language plpgsql as $$
begin
  if ptw.current_person() is null then raise insufficient_privilege using message = 'Governança exige pessoa autenticada'; end if;
  return coalesce(new, old);
end $$;
create trigger person_group_actor before insert or update on ptw.person_group
  for each row execute function ptw.governance_actor_guard();
create trigger person_group_member_actor before insert or delete on ptw.person_group_member
  for each row execute function ptw.governance_actor_guard();

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

create table ptw.delegation (
  unit_id uuid not null,
  id uuid not null default uuidv7(),
  -- Nula = mandato geral: todas as aprovações administrativas nominais e delegáveis do delegante.
  slot_id uuid,
  delegator_id uuid not null,
  delegate_id uuid not null,
  scope_location_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text check (length(btrim(revoked_reason)) between 1 and 500),
  revision integer not null default 1,
  primary key(unit_id,id),
  foreign key(unit_id,slot_id) references ptw.sign_slot(unit_id,id),
  foreign key(unit_id,delegator_id) references ptw.person(unit_id,id),
  foreign key(unit_id,delegate_id) references ptw.person(unit_id,id),
  foreign key(unit_id,created_by) references ptw.person(unit_id,id),
  foreign key(unit_id,revoked_by) references ptw.person(unit_id,id),
  foreign key(unit_id,scope_location_id) references ptw.location(unit_id,id),
  check(delegator_id<>delegate_id),
  check(ends_at>starts_at and ends_at<=starts_at+interval '7 days'),
  check((revoked_at is null)=(revoked_by is null) and (revoked_at is null)=(revoked_reason is null))
);
create index delegation_slot_ix on ptw.delegation(unit_id,slot_id,delegate_id) where revoked_at is null;
create index delegation_person_ix on ptw.delegation(unit_id,delegate_id,ends_at) where revoked_at is null;
create index delegation_delegator_ix on ptw.delegation(unit_id,delegator_id,starts_at) where revoked_at is null;

create function ptw.delegation_guard() returns trigger language plpgsql as $$
declare sl record; loc ltree; today date;
begin
  if ptw.current_person() is null then raise insufficient_privilege using message='Delegação exige pessoa autenticada'; end if;
  if tg_op='UPDATE' then
    if old.revoked_at is not null then
      raise check_violation using message='Delegação revogada não pode ser alterada';
    end if;
    if new.revoked_at is not null then
      -- Revogação: só os campos da revogação mudam.
      if (to_jsonb(new)-array['revoked_at','revoked_by','revoked_reason','revision'])
         is distinct from (to_jsonb(old)-array['revoked_at','revoked_by','revoked_reason','revision']) then
        raise check_violation using message='Delegação só pode ser revogada; preserve a autorização original';
      end if;
      new.revoked_at:=clock_timestamp();new.revoked_by:=ptw.current_person();new.revision:=old.revision+1;
      return new;
    end if;
    -- Edição (SPEC 003): só enquanto agendada (inclusive o delegante); tudo é conferido de novo abaixo.
    if old.starts_at<=clock_timestamp() then
      raise check_violation using message='A delegação já entrou em vigor: não pode mais ser editada. Revogue e crie outra, se precisar.';
    end if;
    if new.id<>old.id or new.unit_id<>old.unit_id then
      raise check_violation using message='A identificação da delegação não muda';
    end if;
    -- Trocar o delegante muda de quem é o poder: a trava passa a ser também a do delegante antigo.
    if new.delegator_id<>old.delegator_id then
      perform pg_advisory_xact_lock(hashtextextended('delegation:'||old.unit_id::text||':'||old.delegator_id::text,0));
    end if;
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
      and d.id<>new.id and (d.slot_id is null or new.slot_id is null or d.slot_id=new.slot_id)
      and tstzrange(d.starts_at,d.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
    raise unique_violation using message='Já existe delegação sobreposta para este delegante e esta aprovação';
  end if;
  if tg_op='UPDATE' then
    new.created_by:=old.created_by;new.created_at:=old.created_at;new.revision:=old.revision+1;
  else
    new.created_by:=ptw.current_person();new.created_at:=clock_timestamp();new.revision:=1;
  end if;
  new.revoked_at:=null;new.revoked_by:=null;new.revoked_reason:=null;
  return new;
end $$;
create trigger delegation_guard before insert or update on ptw.delegation for each row execute function ptw.delegation_guard();

create function ptw.delegation_for(p_unit uuid,p_slot uuid,p_delegate uuid,loc ltree) returns uuid
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
