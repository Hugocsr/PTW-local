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
