-- Acesso: sessão e idempotência da API, leitura do Quadro e da Minha área, isolamento por unidade
-- (RLS) e privilégios mínimos.
-- O dono do schema (ptw_owner) cria o banco. A API conecta como um login membro de ptw_app: sem
-- DDL, sem apagar PT, assinatura, arquivo ou auditoria, sem gravar direto na trilha, e só
-- enxerga a unidade da sessão.
set search_path = ptw, public;

-- ---------- Unidade da instalação ----------
-- A API recebe a unidade pelo código (PTW_UNIT) e precisa do id para abrir o contexto, antes de
-- enxergar qualquer linha (o RLS só mostra a unidade da sessão). Devolve só o id; nulo = não existe.
create function ptw.unit_by_code(p_code text) returns uuid
  language sql stable security definer set search_path = ptw, pg_catalog as $$
  select u.id from ptw.unit u where u.code = p_code
$$;

-- ---------- Sessão da API ----------
-- A API é só leitura no disco e reinicia: a sessão mora aqui. Guarda o SHA-256 do cookie (nunca o
-- cookie), a pessoa e como ela se identificou. A API inclui, renova (seen_at, expires_at) e encerra
-- (ended_at, uma vez); não muda a identidade nem apaga. Sessão vencida ou encerrada é recusada pela
-- API na leitura (expires_at <= now() ou ended_at preenchido); a limpeza é do agendador (fase 2).
-- A entrada e a saída ficam na trilha por ptw.audit_log (sessao.entrada, sessao.saida).
create table ptw.api_session (
  unit_id      uuid not null references ptw.unit,
  id           uuid not null default uuidv7(),
  token_sha256 bytea not null unique check (length(token_sha256) = 32),
  person_id    uuid not null,
  auth         ptw.auth_method not null,
  grants       text[] not null default '{}' check (grants <@ array['cadastro','modelos','auditoria','exportacao']::text[] and array_position(grants, null) is null),
  client       text check (length(client) <= 200),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz not null default now(),
  expires_at   timestamptz not null,
  ended_at     timestamptz,
  primary key (unit_id, id),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id) on delete cascade,
  check (expires_at > created_at)
);
create index api_session_person_ix on ptw.api_session (unit_id, person_id) where ended_at is null;

create function ptw.api_session_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.seen_at := now(); new.ended_at := null;
    return new;
  end if;
  if (new.unit_id, new.id, new.token_sha256, new.person_id, new.auth, new.client, new.created_at, new.grants, new.expires_at)
     is distinct from (old.unit_id, old.id, old.token_sha256, old.person_id, old.auth, old.client, old.created_at, old.grants, old.expires_at) then
    raise exception 'A identidade da sessão não muda' using errcode = 'PTW01';
  end if;
  if old.ended_at is not null then
    raise exception 'Sessão encerrada não muda' using errcode = 'PTW01';
  end if;
  if new.seen_at < old.seen_at then
    raise exception 'A última atividade da sessão não volta' using errcode = 'PTW01';
  end if;
  if new.ended_at is not null then new.ended_at := now(); end if;
  return new;
end $$;
create trigger api_session_guard before insert or update on ptw.api_session
  for each row execute function ptw.api_session_guard();

-- Contadores reservados ANTES da autenticação externa, inclusive em requisições concorrentes.
-- A API não altera a tabela diretamente. Chaves são SHA-256, nunca senha nem endereço em claro.
create table ptw.login_attempt (
  unit_id uuid not null references ptw.unit,
  bucket text not null check (bucket ~ '^(login|ip):[a-f0-9]{64}$'),
  started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  primary key (unit_id, bucket)
);
create function ptw.login_reserve(p_bucket text) returns integer
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare u uuid := ptw.current_unit(); r ptw.login_attempt; lim integer;
begin
  if u is null or p_bucket !~ '^(login|ip):[a-f0-9]{64}$' then
    raise exception 'Contexto ou chave de tentativa inválida' using errcode = 'PTW14';
  end if;
  lim := case when p_bucket like 'login:%' then 5 else 30 end;
  insert into ptw.login_attempt(unit_id,bucket) values(u,p_bucket) on conflict do nothing;
  select * into r from ptw.login_attempt where unit_id=u and bucket=p_bucket for update;
  if r.started_at + interval '15 minutes' <= now() then
    if r.attempts >= lim then
      perform ptw.audit_log('conta.desbloqueada',true,'Prazo do bloqueio encerrado',jsonb_build_object('chave',p_bucket));
    end if;
    r.started_at := now(); r.attempts := 0;
  end if;
  if r.attempts >= lim then
    return greatest(1,ceil(extract(epoch from r.started_at + interval '15 minutes' - now()))::integer);
  end if;
  update ptw.login_attempt set attempts=r.attempts+1, started_at=r.started_at where unit_id=u and bucket=p_bucket;
  if r.attempts+1 = lim then
    perform ptw.audit_log('conta.bloqueada',true,'Limite de tentativas atingido',jsonb_build_object('chave',p_bucket,'limite',lim));
  end if;
  return 0;
end $$;
create function ptw.login_succeeded(p_bucket text) returns void
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare n integer;
begin
  if ptw.current_unit() is null or p_bucket !~ '^login:[a-f0-9]{64}$' then
    raise exception 'Contexto ou chave de login inválida' using errcode = 'PTW14';
  end if;
  select attempts into n from ptw.login_attempt where unit_id=ptw.current_unit() and bucket=p_bucket for update;
  update ptw.login_attempt set attempts=0, started_at=now() where unit_id=ptw.current_unit() and bucket=p_bucket;
  if n >= 5 then perform ptw.audit_log('conta.desbloqueada',true,'Entrada confirmada',jsonb_build_object('chave',p_bucket)); end if;
end $$;

create function ptw.session_expire(p_idle_seconds integer) returns integer
  language plpgsql as $$
declare r record; n integer := 0;
begin
  if p_idle_seconds < 1 then raise exception 'Prazo de inatividade inválido' using errcode='PTW14'; end if;
  for r in update ptw.api_session set ended_at=now()
    where unit_id=ptw.current_unit() and ended_at is null
      and (expires_at <= now() or seen_at + make_interval(secs=>p_idle_seconds) <= now())
    returning person_id,id
  loop
    perform ptw.audit_log('sessao.expirada',true,'Sessão expirada',jsonb_build_object('sessao',r.id),r.person_id);
    n := n+1;
  end loop;
  return n;
end $$;

-- ---------- Idempotência da API ----------
-- Uma linha por Idempotency-Key e pessoa: a operação, o SHA-256 do pedido e a resposta. A chave é
-- reservada na MESMA transação da escrita (idempotency_begin) e a resposta entra antes do commit
-- (idempotency_finish): se a escrita é recusada, o rollback solta a chave e a nova tentativa executa
-- de novo; se deu certo, a repetição devolve a resposta guardada sem escrever de novo. Duas
-- requisições iguais ao mesmo tempo: a segunda espera a primeira (índice único) e repete a resposta.
-- A API não altera a identidade da linha nem apaga; a limpeza é do agendador (fase 2).
create table ptw.api_idempotency (
  unit_id     uuid not null references ptw.unit,
  person_id   uuid not null,
  key         uuid not null,
  operation   text not null check (operation ~ '^[A-Za-z][A-Za-z0-9_.:/-]{0,99}$'),
  body_sha256 bytea not null check (length(body_sha256) = 32),
  status      smallint check (status between 100 and 599),
  response    jsonb,
  created_at  timestamptz not null default now(),
  primary key (unit_id, person_id, key),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id) on delete cascade,
  check ((status is null) = (response is null))
);

create function ptw.api_idempotency_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.status := null; new.response := null;
    return new;
  end if;
  if (new.unit_id, new.person_id, new.key, new.operation, new.body_sha256, new.created_at)
     is distinct from (old.unit_id, old.person_id, old.key, old.operation, old.body_sha256, old.created_at)
     or old.response is not null or new.response is null then
    raise exception 'A chave de idempotência só recebe a resposta, uma vez' using errcode = 'PTW01';
  end if;
  return new;
end $$;
create trigger api_idempotency_guard before insert or update on ptw.api_idempotency
  for each row execute function ptw.api_idempotency_guard();

-- No commit, a chave reservada tem a resposta (senão a repetição não teria o que devolver).
create function ptw.api_idempotency_done() returns trigger language plpgsql as $$
begin
  if exists (select 1 from ptw.api_idempotency i
              where i.unit_id = new.unit_id and i.person_id = new.person_id and i.key = new.key and i.response is null) then
    raise exception 'Idempotência: chave reservada sem resposta (chame ptw.idempotency_finish)' using errcode = 'PTW14';
  end if;
  return null;
end $$;
create constraint trigger api_idempotency_done after insert on ptw.api_idempotency
  deferrable initially deferred
  for each row execute function ptw.api_idempotency_done();

-- Reserva a chave para a pessoa da sessão. situacao: 'nova' (execute e chame idempotency_finish),
-- 'repetida' (devolva status e response guardados) ou 'diferente' (a chave já foi usada com outra
-- operação ou outro pedido: a API responde PTA08). p_body_sha256 em hexa.
create function ptw.idempotency_begin(p_key uuid, p_operation text, p_body_sha256 text)
  returns table (situacao text, status smallint, response jsonb, created_at timestamptz)
  language plpgsql as $$
#variable_conflict use_column
declare u uuid := ptw.current_unit(); me uuid := ptw.current_person(); r ptw.api_idempotency; h bytea;
begin
  if u is null or me is null or p_key is null or coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Idempotência: unidade e pessoa na sessão, chave e SHA-256 do pedido (hexa) obrigatórios' using errcode = 'PTW14';
  end if;
  h := decode(p_body_sha256, 'hex');
  insert into ptw.api_idempotency (unit_id, person_id, key, operation, body_sha256)
  values (u, me, p_key, p_operation, h)
  on conflict (unit_id, person_id, key) do nothing;
  if found then
    return query select 'nova'::text, null::smallint, null::jsonb, now();
    return;
  end if;
  select * into r from ptw.api_idempotency i where i.unit_id = u and i.person_id = me and i.key = p_key;
  if r.operation <> p_operation or r.body_sha256 <> h then
    return query select 'diferente'::text, null::smallint, null::jsonb, r.created_at;
  else
    return query select 'repetida'::text, r.status, r.response, r.created_at;
  end if;
end $$;

-- Guarda a resposta da chave reservada nesta transação.
create function ptw.idempotency_finish(p_key uuid, p_status integer, p_response jsonb) returns void
  language plpgsql as $$
begin
  update ptw.api_idempotency i set status = p_status, response = coalesce(p_response, 'null'::jsonb)
   where i.unit_id = ptw.current_unit() and i.person_id = ptw.current_person() and i.key = p_key;
  if not found then
    raise exception 'Idempotência: chave não reservada nesta sessão' using errcode = 'PTW14';
  end if;
end $$;

-- ---------- Quem move a seguir (Quadro e Minha área) ----------
-- A assinatura que a PT espera agora, como pendingSlot do app: na etapa em curso (a primeira, em
-- ordem, com assinatura que conta e ainda sem "min" assinaturas válidas na revisão atual), a primeira
-- assinatura pendente. Expirada e suspensa sem Retomada começam na Entrega; entregue, no Aceite da
-- área. Nenhuma linha = nada pendente. Em SQL puro (entra na consulta de quem chama) para servir a
-- muitas PTs de uma vez (my_permits). Recebe as colunas da PT: versão, estado, revisão e retomada.
create function ptw.pending_slot(p_unit uuid, p_permit uuid, p_version uuid, p_state ptw.permit_state,
                                 p_revision integer, p_resumed_at timestamptz)
  returns table (stage_id uuid, stage_name text, stage_kind ptw.stage_kind, slot_id uuid, slot_kind ptw.slot_kind,
                 role_ids uuid[], person_id uuid)
  language sql stable as $$
  select st.id, st.name, st.kind, sl.id, sl.kind, sl.role_ids, sl.person_id
    from ptw.stage st
    join ptw.sign_slot sl on sl.unit_id = st.unit_id and sl.stage_id = st.id
   where st.unit_id = p_unit and st.version_id = p_version
     and st.position >= coalesce((
           select a.position from ptw.stage a
            where a.unit_id = p_unit and a.version_id = p_version
              and a.kind = case when p_state = 'expirada' or (p_state = 'suspensa' and p_resumed_at is null) then 'entrega'::ptw.stage_kind
                                when p_state = 'entregue' then 'aceite_area'::ptw.stage_kind end), 0)
     and sl.required
     and (sl.required_when_item is null
          or ptw.slot_required(sl, (select coalesce(jsonb_object_agg(a.item_id, a.value), '{}') from ptw.permit_answer a
                                     where a.unit_id = p_unit and a.permit_id = p_permit)))
     and (select count(*) from ptw.signature g
           where g.unit_id = p_unit and g.permit_id = p_permit and g.rev = p_revision
             and g.slot_id = sl.id and g.voided_at is null) < sl.min
   order by st.position, sl.position, sl.id
   limit 1
$$;

-- Quem uma assinatura alcança, como checkSlotAt do app: quem tem um dos cargos com escopo no local
-- (cadastro não inativo), ou a pessoa indicada; "ok" = elegível agora para assinar (cadastro ativo,
-- login, conta ativa e no prazo e, no cargo, validade em dia): a mesma regra de person_ok.
create function ptw.slot_candidates(p_unit uuid, p_kind ptw.slot_kind, p_roles uuid[], p_person uuid, today date, loc ltree)
  returns table (person_id uuid, name text, ok boolean)
  language sql stable as $$
  select pe.id, pe.name,
         pe.status = 'ativo' and pe.login is not null and pe.enabled
           and (pe.account_expires is null or pe.account_expires > now())
           and (p_kind = 'pessoa' or exists (
                  select 1 from ptw.person_role pr
                    left join ptw.location sc on sc.unit_id = pr.unit_id and sc.id = pr.scope_location_id
                   where pr.unit_id = pe.unit_id and pr.person_id = pe.id and pr.role_id = any (p_roles)
                     and pr.valid_until >= today and (pr.scope_location_id is null or sc.path @> loc)))
    from ptw.person pe
   where pe.unit_id = p_unit
     and case when p_kind = 'pessoa' then pe.id = p_person
              else pe.status <> 'inativo' and exists (
                     select 1 from ptw.person_role pr
                       left join ptw.location sc on sc.unit_id = pr.unit_id and sc.id = pr.scope_location_id
                      where pr.unit_id = pe.unit_id and pr.person_id = pe.id and pr.role_id = any (p_roles)
                        and (pr.scope_location_id is null or sc.path @> loc)) end
$$;

-- Quem move a seguir e se é a vez da pessoa, como nextLabel e waitsFor do app, para várias PTs numa
create function ptw.slot_candidates_for(p_unit uuid,p_slot uuid,today date,loc ltree)
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

-- Who acts next includes only currently valid mandates; technical resume stays on its original slot.
-- Quem move a seguir e se é a vez da pessoa, como nextLabel e waitsFor do app, para várias PTs numa
-- consulta só (a página do Quadro): a etapa com a assinatura pendente (nula se não há), o texto
-- "Marina · Emissão" e se é a vez de p_person (nula = ninguém).
--   rascunho, devolvida: o solicitante (Enviar / Reenviar);
--   parada registrada ou suspensa sem Retomada: quem pode emitir ("· Retomada"; issuer_ineligible);
--   senão, a assinatura pendente: o primeiro elegível (ou, sem nenhum, o primeiro que tem o cargo;
--   ninguém = "Sem elegível"); é a vez de quem é elegível para ela e ainda não a assinou;
--   encerrada, cancelada ou nada pendente: "—".
-- No app a lista de pessoas segue a ordem do cadastro; aqui, o nome.
create function ptw.permit_next_rows(p_unit uuid, p_permits uuid[], p_person uuid)
  returns table (permit_id uuid, stage_id uuid, stage_name text, label text, mine boolean)
  language sql stable as $$
  select p.id, cur.stage_id, cur.stage_name,
         case when p.state in ('encerrada', 'cancelada') then '—'
              when p.state in ('rascunho', 'devolvida')
                then coalesce(split_part(au.name, ' ', 1), 'Autor') || ' · ' || case when p.state = 'rascunho' then 'Enviar' else 'Reenviar' end
              when f.held then coalesce(split_part(w.name, ' ', 1), 'Sem elegível') || ' · Retomada'
              when cur.slot_id is not null then coalesce(split_part(w.name, ' ', 1), 'Sem elegível') || ' · ' || cur.stage_name
              else '—' end,
         case when p_person is null or p.state in ('encerrada', 'cancelada') then false
              when p.state in ('rascunho', 'devolvida') then p.author_id = p_person
              when f.held then ptw.issuer_ineligible(p_unit, p.version_id, p.location_id, p_person) is null
              when cur.slot_id is not null
                then coalesce(w.me_ok, false)
                     and not exists (select 1 from ptw.signature g
                                      where g.unit_id = p_unit and g.permit_id = p.id and g.rev = p.revision
                                        and g.slot_id = cur.slot_id and g.person_id = p_person and g.voided_at is null)
              else false end
    from ptw.permit p
    join ptw.location l on l.unit_id = p.unit_id and l.id = p.location_id
    join ptw.unit u on u.id = p.unit_id
    left join ptw.person au on au.unit_id = p.unit_id and au.id = p.author_id
   cross join lateral (select p.hold_reason is not null or (p.state = 'suspensa' and p.resumed_at is null) as held,
                              (now() at time zone u.timezone)::date as today) f
    left join lateral ptw.pending_slot(p_unit, p.id, p.version_id, p.state, p.revision, p.resumed_at) cur
           on p.state not in ('rascunho', 'devolvida', 'encerrada', 'cancelada')
    left join lateral (select s.id, s.kind, s.role_ids, s.person_id
                         from ptw.sign_slot s join ptw.stage st on st.unit_id = s.unit_id and st.id = s.stage_id
                        where s.unit_id = p_unit and s.version_id = p.version_id and st.kind = 'emissao'
                        order by s.position limit 1) em on f.held
    left join lateral (select (array_agg(c.name order by c.ok desc, c.name, c.person_id) filter (where c.ok or not f.held))[1] as name,
                              bool_or(c.ok and c.person_id = p_person) as me_ok
                         from ptw.slot_candidates_for(p_unit, case when f.held then em.id else cur.slot_id end, f.today, l.path) c) w
           on p.state not in ('rascunho', 'devolvida', 'encerrada', 'cancelada')
   where p.unit_id = p_unit and p.id = any (p_permits)
$$;

-- O mesmo para uma PT (detalhe): {"stageId", "stageName", "label", "mine"}; nulo se a PT não existe.
create function ptw.permit_next(p_unit uuid, p_permit uuid, p_person uuid) returns jsonb
  language sql stable as $$
  select jsonb_build_object('stageId', n.stage_id, 'stageName', n.stage_name, 'label', n.label, 'mine', n.mine)
    from ptw.permit_next_rows(p_unit, array[p_permit], p_person) n
$$;

create function ptw.permit_next_label(p_unit uuid, p_permit uuid) returns text
  language sql stable
  return ptw.permit_next(p_unit, p_permit, null) ->> 'label';

create function ptw.permit_mine(p_unit uuid, p_permit uuid, p_person uuid) returns boolean
  language sql stable
  return coalesce((ptw.permit_next(p_unit, p_permit, p_person) ->> 'mine')::boolean, false);

-- Minha área: as PTs que dizem respeito à pessoa (o conjunto de trabalho de myWork no app, que as
-- agrupa). Abertas, mais as encerradas e canceladas mexidas nos últimos p_days dias, em que a pessoa
-- é solicitante, está na equipe, assinou, parou ou retomou; e as abertas já enviadas em que ela tem
-- uma assinatura a dar na etapa em curso (tem o cargo com escopo no local, ou é a pessoa indicada, e
-- ainda não assinou) ou pode retomar a parada. Só entram na conta fina as PTs de versões que têm
-- alguma assinatura ao alcance da pessoa (um cargo dela, ou ela indicada).
create function ptw.my_permits(p_unit uuid, p_person uuid, p_days integer default 2) returns setof uuid
  language sql stable as $$
  with rel as (
    select p.id from ptw.permit p where p.unit_id = p_unit and p.author_id = p_person
    union
    select t.permit_id from ptw.permit_team t where t.unit_id = p_unit and t.person_id = p_person
    union
    select g.permit_id from ptw.signature g where g.unit_id = p_unit and g.person_id = p_person
    union
    select p.id from ptw.permit p where p.unit_id = p_unit and p.holds and (p.hold_by = p_person or p.resumed_by = p_person)),
  me as materialized (
    select pe.status, coalesce((select array_agg(distinct pr.role_id) from ptw.person_role pr
                                 where pr.unit_id = p_unit and pr.person_id = p_person), '{}') as roles
      from ptw.person pe where pe.unit_id = p_unit and pe.id = p_person),
  reach as materialized (
    select distinct s.version_id from ptw.sign_slot s, me
     where s.unit_id = p_unit and (s.person_id = p_person or (me.status <> 'inativo' and s.role_ids && me.roles))),
  cand as materialized (
    select p.id, p.version_id, p.state, p.revision, p.resumed_at, p.hold_reason, p.location_id, l.path
      from ptw.permit p
      join ptw.location l on l.unit_id = p.unit_id and l.id = p.location_id
     where p.unit_id = p_unit and p.holds and p.state <> 'devolvida'
       and p.version_id in (select version_id from reach))
  select p.id
    from ptw.permit p join rel on rel.id = p.id
   where p.unit_id = p_unit
     and (p.state not in ('encerrada', 'cancelada') or p.changed_at >= now() - make_interval(days => p_days))
  union
  select p.id
    from cand p cross join me
    left join lateral ptw.pending_slot(p_unit, p.id, p.version_id, p.state, p.revision, p.resumed_at) cur on true
   where (cur.stage_id is not null and exists (
            select 1 from ptw.sign_slot s
             where s.unit_id = p_unit and s.stage_id = cur.stage_id
               and (select count(*) from ptw.signature g
                     where g.unit_id = p_unit and g.permit_id = p.id and g.rev = p.revision
                       and g.slot_id = s.id and g.voided_at is null) < s.min
               and case when s.kind = 'pessoa' then s.person_id = p_person or ptw.delegation_for(p_unit,s.id,p_person,p.path) is not null
                        else me.status <> 'inativo' and exists (
                               select 1 from ptw.person_role pr
                                 left join ptw.location sc on sc.unit_id = pr.unit_id and sc.id = pr.scope_location_id
                                where pr.unit_id = p_unit and pr.person_id = p_person and pr.role_id = any (s.role_ids)
                                  and (pr.scope_location_id is null or sc.path @> p.path)) end
               and not exists (select 1 from ptw.signature g
                                where g.unit_id = p_unit and g.permit_id = p.id and g.rev = p.revision
                                  and g.slot_id = s.id and g.person_id = p_person and g.voided_at is null)))
      or ((p.hold_reason is not null or (p.state = 'suspensa' and p.resumed_at is null))
          and ptw.issuer_ineligible(p_unit, p.version_id, p.location_id, p_person) is null)
$$;

-- ---------- Visões (security_invoker: obedecem ao RLS de quem consulta) ----------
-- Quadro: uma linha por PT, com local, modelo, ativos, "trabalho liberado" e o texto de busca (número
-- e escopo). Quem move a seguir e a vez da pessoa não são colunas: custam uma conta por PT, então a
-- API pede a página (filtro, ORDER BY, LIMIT) e chama ptw.permit_next_rows só com os ids da página;
-- para "minhas", ptw.my_permits. changed_at: última mudança da PT ou de um filho (Minha área,
-- updatedSince: `where id = any(my_permits(...)) and changed_at > $desde`).
create view ptw.v_permit_board with (security_invoker = true) as
select p.unit_id, p.id, p.number, p.state, ptw.state_label(p.state) as state_label, p.scope,
       lower(p.work_window) as window_start, upper(p.work_window) as window_end,
       ptw.work_released(p) as released,
       p.revision, p.author_id, au.name as author_name,
       p.location_id, l.name as location_name, l.path as location_path,
       p.template_id, t.name as template_name, v.number as version_number,
       (select array_agg(a.code order by a.code)
          from ptw.permit_asset pa join ptw.asset a on a.unit_id = pa.unit_id and a.id = pa.asset_id
         where pa.unit_id = p.unit_id and pa.permit_id = p.id) as asset_codes,
       p.updated_at, p.row_version, p.search, p.changed_at
  from ptw.permit p
  join ptw.person au on au.unit_id = p.unit_id and au.id = p.author_id
  join ptw.location l on l.unit_id = p.unit_id and l.id = p.location_id
  join ptw.template t on t.unit_id = p.unit_id and t.id = p.template_id
  join ptw.template_version v on v.unit_id = p.unit_id and v.id = p.version_id;

-- Quem prende cada equipamento agora (a trava vista de fora).
create view ptw.v_equipment_hold with (security_invoker = true) as
select pa.unit_id, pa.asset_id, a.code as asset_code, p.id as permit_id, p.number, p.state
  from ptw.permit_asset pa
  join ptw.asset a on a.unit_id = pa.unit_id and a.id = pa.asset_id
  join ptw.permit p on p.unit_id = pa.unit_id and p.id = pa.permit_id
 where pa.holds;

-- ---------- Isolamento por unidade (RLS) ----------
-- Toda tabela com unit_id: só as linhas da unidade da sessão, para ler e para gravar.
-- "(select …)" avalia a unidade uma vez por consulta, não por linha.
do $$
declare t text;
begin
  foreach t in array array[
    'type_def', 'location', 'asset', 'asset_location', 'asset_relation', 'asset_part', 'person', 'person_role',
    'option_list', 'option_item', 'template', 'template_version', 'version_location_type', 'version_asset_type', 'version_work_type',
    'stage', 'sign_slot', 'separation', 'form_snapshot', 'permit_counter', 'permit', 'permit_asset', 'permit_team',
    'permit_answer', 'blob', 'attachment', 'permit_revision', 'permit_extension', 'permit_revalidation', 'signature',
    'appearance', 'appearance_asset', 'person_group', 'person_group_member', 'access_profile', 'person_group_profile', 'person_group_scope', 'delegation', 'api_session', 'api_idempotency', 'login_attempt',
    'audit_event', 'audit_head', 'audit_anchor', 'audit_export', 'audit_archive']
  loop
    execute format('alter table ptw.%I enable row level security', t);
    execute format('create policy unit_isolation on ptw.%I using (unit_id = (select ptw.current_unit()))
                    with check (unit_id = (select ptw.current_unit()))', t);
  end loop;
end $$;
alter table ptw.unit enable row level security;
create policy unit_isolation on ptw.unit using (id = (select ptw.current_unit()));
-- Sob RLS, só operadores LEAKPROOF viram condição de índice. A igualdade de enum compara OIDs e não
-- vaza nada, mas não vem marcada: sem isto, "state = 'ativa'" varre a tabela (Quadro: 25 ms → 0,2 ms).
-- Exige superusuário (o dono do banco, na criação).
alter function pg_catalog.enum_eq(anyenum, anyenum) leakproof;

-- ---------- Privilégios ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ptw_app') then create role ptw_app nologin; end if;
end $$;

revoke all on schema ptw from public;
revoke execute on all functions in schema ptw from public;
grant usage on schema ptw to ptw_app;

-- Funções: a API chama as operações e os gatilhos chamam as regras como quem grava. Ficam de fora
-- as de operador (partições, arquivamento, âncora, pontas, registro do esquema) e a gravação interna
-- da trilha (só pelas funções públicas, com o contexto preenchido).
grant execute on all functions in schema ptw to ptw_app;
revoke execute on function
  ptw.audit_emit(uuid, text, boolean, text, jsonb, uuid, integer, uuid, text, uuid, uuid, boolean), ptw.audit_tip(uuid),
  ptw.audit_partitions(date, integer), ptw.audit_maintenance(), ptw.audit_partition_sync(),
  ptw.audit_archive(regclass, text), ptw.audit_heads(), ptw.audit_check(uuid),
  ptw.audit_anchor_record(uuid, bigint, text, date, text, text, text), ptw.schema_record(jsonb)
  from ptw_app;

-- Leitura: tudo, menos a ponta da cadeia e o registro interno de partições.
grant select on all tables in schema ptw to ptw_app;
revoke select on ptw.audit_head, ptw.audit_partition from ptw_app;

-- Cadastro e modelos: CRUD normal (os gatilhos guardam versões, relações e o fecho).
grant insert, update, delete on
  ptw.type_def, ptw.location, ptw.asset, ptw.asset_location, ptw.asset_relation, ptw.person, ptw.person_role,
  ptw.option_list, ptw.option_item, ptw.template, ptw.template_version, ptw.version_location_type,
  ptw.version_asset_type, ptw.version_work_type, ptw.stage, ptw.sign_slot, ptw.separation
  to ptw_app;
grant insert, update on ptw.appearance to ptw_app;
grant insert on ptw.appearance_asset to ptw_app;
grant insert, update on ptw.person_group to ptw_app;
grant insert, update on ptw.access_profile to ptw_app;
grant insert, delete on ptw.person_group_profile, ptw.person_group_scope to ptw_app;
grant insert, delete on ptw.person_group_member to ptw_app;
grant insert on ptw.delegation to ptw_app;
grant update (revoked_at, revoked_by, revoked_reason, slot_id, delegator_id, delegate_id, scope_location_id, starts_at, ends_at, reason) on ptw.delegation to ptw_app;
-- PT: nunca apagada pela API (rascunho abandonado vira cancelada).
grant insert, update on ptw.permit, ptw.permit_counter to ptw_app;
grant insert, update, delete on ptw.permit_asset, ptw.permit_team, ptw.permit_answer to ptw_app;
-- Somente inclusão.
grant insert on ptw.form_snapshot, ptw.blob, ptw.attachment, ptw.permit_revision, ptw.permit_extension, ptw.permit_revalidation to ptw_app;
-- Assinatura: inclui; da linha, só anula.
grant insert, update (voided_at, voided_reason) on ptw.signature to ptw_app;
-- Sessão: inclui, renova e encerra; idempotência: reserva e guarda a resposta. Nunca apaga.
grant insert, update (seen_at, ended_at) on ptw.api_session to ptw_app;
grant insert, update (status, response) on ptw.api_idempotency to ptw_app;
