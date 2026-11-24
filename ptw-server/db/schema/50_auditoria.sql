-- Trilha de auditoria: uma por unidade, somente inclusão, encadeada por SHA-256, particionada por
-- mês. Guarda toda mudança (gatilho por tabela, com diff), toda negação, toda leitura sensível e os
-- eventos do sistema. É também o Histórico da PT e a fonte do aviso em tempo real (NOTIFY ptw).
--
-- Forma canônica v2 (a mesma no README e em tools/ptw_verifica.py, conferida byte a byte no test.sh):
--   hash = SHA-256( prev_hash (32 bytes) ‖ UTF-8( JSON canônico do evento ) ); o primeiro prev_hash
--   é 32 zeros.
--   JSON canônico:
--     objeto: "{" + pares "chave": valor separados por ", " + "}"; vazio = "{}";
--             chaves ordenadas pelo tamanho em bytes UTF-8 e, no empate, byte a byte;
--     lista:  "[" + valores separados por ", " + "]"; vazia = "[]";
--     texto:  entre aspas; escapa só \" \\ \b \f \n \r \t e \u00XX (hexa minúsculo) para os demais
--             < 0x20; todo o resto literal em UTF-8 (acentos, emoji);
--     número: notação decimal simples, sem expoente, com as casas gravadas (1.50 fica 1.50; 1e2 fica
--             100; -0.0 fica 0.0); true, false, null.
--   É a saída do tipo jsonb do PostgreSQL (9.4 a 18); "data" sai do próprio jsonb.
--   Chaves do evento: action actor asset at auth client data entity entity_id ok permit reason
--   request rev role seq text unit v (v = 2). "at" = microssegundos desde 1970-01-01 UTC (inteiro);
--   uuid em minúsculas; ausente = null.
set search_path = ptw, public;

-- ---------- Tabelas ----------
-- Ponta da cadeia por unidade. Só as funções da trilha (SECURITY DEFINER) tocam nela.
create table ptw.audit_head (
  unit_id   uuid primary key references ptw.unit,
  last_seq  bigint not null default 0 check (last_seq >= 0),
  last_hash bytea  not null default '\x0000000000000000000000000000000000000000000000000000000000000000'
);

-- A hora do evento é tomada DEPOIS de travar a ponta da unidade (clock_timestamp(), nunca antes do
-- evento anterior), não no início da transação: assim a ordem do seq é a ordem da hora, e cada
-- partição mensal guarda uma faixa contínua de seq (arquivamento e verificação dependem disso).
create table ptw.audit_event (
  unit_id    uuid not null,
  seq        bigint not null,
  at         timestamptz not null default clock_timestamp(),
  actor_id   uuid,                 -- pessoa; nulo = o próprio sistema
  role_id    uuid,                 -- cargo com que a pessoa agiu
  auth       ptw.auth_method,
  client     text check (length(client) <= 200),          -- aparelho / cliente
  request_id text check (length(request_id) <= 100),
  reason     text check (length(reason) <= 500),
  action     text not null check (action ~ '^[a-z_]+(\.[a-z_]+)*$'),
  ok         boolean not null,     -- false = tentativa negada
  permit_id  uuid,
  rev        integer,
  asset_id   uuid,                 -- ativo afetado (filtro da tela)
  entity     text check (entity ~ '^[a-z_]{1,40}$'),     -- tabela ou família do registro
  entity_id  uuid,
  text       text not null,        -- frase do Histórico, em português
  data       jsonb not null default '{}',
  prev_hash  bytea not null,
  hash       bytea not null,
  primary key (unit_id, seq, at)
) partition by range (at);

-- Índices da tela de auditoria. Histórico da PT: só o que mudou a PT; leituras (acesso.*) à parte.
create index audit_history_ix on ptw.audit_event (unit_id, permit_id, seq)
  where permit_id is not null and left(action, 7) <> 'acesso.';
create index audit_access_ix  on ptw.audit_event (unit_id, permit_id, seq)
  where permit_id is not null and left(action, 7) = 'acesso.';
create index audit_at_ix      on ptw.audit_event (unit_id, at desc);
create index audit_actor_ix   on ptw.audit_event (unit_id, actor_id, at desc);
create index audit_action_ix  on ptw.audit_event (unit_id, action text_pattern_ops, at desc);
create index audit_asset_ix   on ptw.audit_event (unit_id, asset_id, seq) where asset_id is not null;
create index audit_denied_ix  on ptw.audit_event (unit_id, at desc) where not ok;

-- ---------- Forma canônica e hash ----------
-- Envelope concatenado na ordem canônica das chaves (tamanho, depois bytes): v; at ok; rev seq;
-- auth data role text unit; actor asset; action client entity permit reason; request; entity_id.
-- Texto passa por to_json (mesmo escape do jsonb). ~8 µs por evento.
create function ptw.audit_canon(p_unit uuid, p_seq bigint, p_at timestamptz, p_actor uuid, p_role uuid,
                                p_auth ptw.auth_method, p_client text, p_request text, p_reason text, p_action text,
                                p_ok boolean, p_permit uuid, p_rev integer, p_asset uuid, p_entity text,
                                p_entity_id uuid, p_text text, p_data jsonb) returns text
  language plpgsql immutable parallel safe as $$
begin
  return '{"v": 2, "at": ' || ((extract(epoch from p_at) * 1000000)::bigint)::text
      || ', "ok": ' || case when p_ok then 'true' when not p_ok then 'false' else 'null' end
      || ', "rev": ' || coalesce(p_rev::text, 'null')
      || ', "seq": ' || p_seq::text
      || ', "auth": ' || coalesce(to_json(p_auth::text)::text, 'null')
      || ', "data": ' || coalesce(p_data::text, 'null')
      || ', "role": ' || coalesce('"' || p_role::text || '"', 'null')
      || ', "text": ' || coalesce(to_json(p_text)::text, 'null')
      || ', "unit": ' || coalesce('"' || p_unit::text || '"', 'null')
      || ', "actor": ' || coalesce('"' || p_actor::text || '"', 'null')
      || ', "asset": ' || coalesce('"' || p_asset::text || '"', 'null')
      || ', "action": ' || coalesce(to_json(p_action)::text, 'null')
      || ', "client": ' || coalesce(to_json(p_client)::text, 'null')
      || ', "entity": ' || coalesce(to_json(p_entity)::text, 'null')
      || ', "permit": ' || coalesce('"' || p_permit::text || '"', 'null')
      || ', "reason": ' || coalesce(to_json(p_reason)::text, 'null')
      || ', "request": ' || coalesce(to_json(p_request)::text, 'null')
      || ', "entity_id": ' || coalesce('"' || p_entity_id::text || '"', 'null')
      || '}';
end $$;

create function ptw.audit_hash(p_prev bytea, p_canon text) returns bytea
  language sql immutable parallel safe strict
  return sha256(p_prev || convert_to(p_canon, 'UTF8'));

-- Hash de uma linha gravada (verificação).
create function ptw.audit_event_hash(e ptw.audit_event) returns bytea
  language sql immutable parallel safe
  return ptw.audit_hash(e.prev_hash, ptw.audit_canon(e.unit_id, e.seq, e.at, e.actor_id, e.role_id, e.auth, e.client,
         e.request_id, e.reason, e.action, e.ok, e.permit_id, e.rev, e.asset_id, e.entity, e.entity_id, e.text, e.data));

-- ---------- Contexto do ator ----------
-- A API abre cada transação com ptw.set_context(...): unidade, pessoa, cargo, autenticação,
-- aparelho, id da requisição e motivo. Vale só para a transação e entra em todo evento.
-- p_undo = a transação é um "Desfazer": cada escrita sai como evento próprio, com a ação
-- "<ação>.desfeito", o texto "Desfazer: …" e o motivo "Desfazer" se nenhum for dado (audit_row).
create function ptw.set_context(p_unit uuid, p_person uuid, p_role uuid default null, p_auth text default 'sessao',
                                p_client text default null, p_request text default null, p_reason text default null,
                                p_undo boolean default false)
  returns void language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  if p_unit is null or not exists (select 1 from ptw.unit where id = p_unit) then
    raise exception 'Contexto: unidade inexistente' using errcode = 'PTW14';
  end if;
  if p_auth is null or not p_auth = any (enum_range(null::ptw.auth_method)::text[]) then
    raise exception 'Contexto: método de autenticação inválido (%)', p_auth using errcode = 'PTW14';
  end if;
  if length(p_client) > 200 or length(p_request) > 100 or length(p_reason) > 500 then
    raise exception 'Contexto: campo longo demais' using errcode = 'PTW14';
  end if;
  if p_person is not null and not exists (select 1 from ptw.person where unit_id = p_unit and id = p_person) then
    raise exception 'Contexto: pessoa não pertence à unidade' using errcode = 'PTW14';
  end if;
  if p_role is not null and not exists (select 1 from ptw.type_def where unit_id = p_unit and id = p_role and family = 'cargo') then
    raise exception 'Contexto: cargo inexistente na unidade' using errcode = 'PTW14';
  end if;
  if p_undo is null then
    raise exception 'Contexto: "desfazer" é sim ou não' using errcode = 'PTW14';
  end if;
  perform set_config('ptw.unit_id', p_unit::text, true),
          set_config('ptw.person_id', coalesce(p_person::text, ''), true),
          set_config('ptw.role_id', coalesce(p_role::text, ''), true),
          set_config('ptw.auth', p_auth, true),
          set_config('ptw.client', coalesce(p_client, ''), true),
          set_config('ptw.request_id', coalesce(p_request, ''), true),
          set_config('ptw.reason', coalesce(p_reason, case when p_undo then 'Desfazer' end, ''), true),
          set_config('ptw.undo', case when p_undo then 'on' else '' end, true);
end $$;

-- ---------- Cadeia ----------
-- A ponta da unidade é travada uma vez por transação (FOR UPDATE até o commit) e acompanhada numa
-- variável da transação "seq:hash:at_us"; a linha da ponta é gravada uma vez, no commit (gatilho
-- adiado). Uma transação com muitos eventos custa O(n), não O(n²) em versões da mesma linha.
-- Rollback (inclusive de savepoint) desfaz a variável junto com os eventos.
create function ptw.audit_tip_var(p_unit uuid) returns text
  language sql immutable parallel safe
  return 'ptw.audit_tip_' || replace(p_unit::text, '-', '');

create function ptw.audit_tip(p_unit uuid) returns text
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare tip text := current_setting(ptw.audit_tip_var(p_unit), true); ls bigint; lh bytea; la timestamptz;
begin
  if coalesce(tip, '') <> '' then return tip; end if;
  insert into ptw.audit_head (unit_id) values (p_unit) on conflict do nothing;
  select h.last_seq, h.last_hash into ls, lh from ptw.audit_head h where h.unit_id = p_unit for update;
  select e.at into la from ptw.audit_event e where e.unit_id = p_unit and e.seq = ls;
  tip := ls || ':' || encode(lh, 'hex') || ':' || coalesce((extract(epoch from la) * 1000000)::bigint, 0);
  perform set_config(ptw.audit_tip_var(p_unit), tip, true);
  return tip;
end $$;

-- Encadeia o evento: seq e prev_hash vêm da ponta; a hora é a do servidor, não antes da transação
-- nem do evento anterior, não depois de agora (PTW12).
create function ptw.audit_chain() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare tip text := ptw.audit_tip(new.unit_id); last_at bigint := split_part(tip, ':', 3)::bigint;
        at_us bigint := (extract(epoch from new.at) * 1000000)::bigint;
begin
  if new.at < now() or at_us < last_at
     or at_us > greatest((extract(epoch from clock_timestamp()) * 1000000)::bigint, last_at) then
    raise exception 'A hora do evento é a do servidor, em ordem com a cadeia' using errcode = 'PTW12';
  end if;
  new.seq       := split_part(tip, ':', 1)::bigint + 1;
  new.prev_hash := decode(split_part(tip, ':', 2), 'hex');
  -- Campo a campo: NEW tem o tipo da partição, não o de audit_event.
  new.hash      := ptw.audit_hash(new.prev_hash, ptw.audit_canon(new.unit_id, new.seq, new.at, new.actor_id, new.role_id,
                     new.auth, new.client, new.request_id, new.reason, new.action, new.ok, new.permit_id, new.rev,
                     new.asset_id, new.entity, new.entity_id, new.text, new.data));
  perform set_config(ptw.audit_tip_var(new.unit_id), new.seq || ':' || encode(new.hash, 'hex') || ':' || at_us, true);
  return new;
end $$;
create trigger audit_chain before insert on ptw.audit_event
  for each row execute function ptw.audit_chain();

create function ptw.audit_head_flush() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare tip text := current_setting(ptw.audit_tip_var(new.unit_id), true);
begin
  update ptw.audit_head
     set last_seq = split_part(tip, ':', 1)::bigint, last_hash = decode(split_part(tip, ':', 2), 'hex')
   where unit_id = new.unit_id and last_seq < split_part(tip, ':', 1)::bigint;
  return null;
end $$;
create constraint trigger audit_head_flush after insert on ptw.audit_event
  deferrable initially deferred
  for each row execute function ptw.audit_head_flush();
create trigger audit_frozen before update or delete on ptw.audit_event
  for each row execute function ptw.forbid_change();
create trigger audit_no_truncate before truncate on ptw.audit_event
  for each statement execute function ptw.forbid_change();

-- Aviso em tempo real: a API escuta "ptw" e repassa por SSE; o cliente relê o estado.
create function ptw.audit_notify() returns trigger language plpgsql as $$
begin
  perform pg_notify('ptw', json_build_object('unit', new.unit_id, 'permit', new.permit_id, 'seq', new.seq,
    'domains', case
      when new.action like 'acesso.%' or new.action in ('sistema.servidor.iniciado', 'sistema.servidor.parado') then array['audit']
      when new.action like 'pt.%' then array['permits', 'audit']
      when new.action like 'modelo.%' then array['templates', 'audit']
      when new.action like 'cadastro.ativo.%' then array['assets', 'permits', 'audit']
      when new.action like 'cadastro.local.%' then array['locations', 'assets', 'permits', 'audit']
      when new.action like 'cadastro.pessoa.%' then array['people', 'permits', 'audit']
      when new.action like 'cadastro.tipo.%' then array['types', 'templates', 'permits', 'audit']
      when new.action like 'cadastro.lista.%' then array['optionLists', 'templates', 'permits', 'audit']
      else null end)::text);
  return null;
end $$;
create trigger audit_notify after insert on ptw.audit_event
  for each row execute function ptw.audit_notify();

-- Gatilhos da trilha valem também em session_replication_role = replica.
alter table ptw.audit_event enable always trigger audit_chain;
alter table ptw.audit_event enable always trigger audit_frozen;
alter table ptw.audit_event enable always trigger audit_no_truncate;

-- Gravação única de evento: preenche o contexto da transação. Só as funções do schema chamam.
-- p_system = evento do sistema: sem pessoa nem cargo, mesmo que haja sessão. Trava a ponta antes
-- de ler o relógio: a hora fica em ordem com o seq.
create function ptw.audit_emit(p_unit uuid, p_action text, p_ok boolean, p_text text, p_data jsonb,
                               p_permit uuid default null, p_rev integer default null, p_asset uuid default null,
                               p_entity text default null, p_entity_id uuid default null,
                               p_actor uuid default ptw.current_person(), p_system boolean default false)
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare s bigint; la bigint := split_part(ptw.audit_tip(p_unit), ':', 3)::bigint;
begin
  insert into ptw.audit_event (unit_id, at, actor_id, role_id, auth, client, request_id, reason, action, ok,
                               permit_id, rev, asset_id, entity, entity_id, text, data)
  values (p_unit, greatest(clock_timestamp(), 'epoch'::timestamptz + la * interval '1 microsecond'),
          case when p_system then null else p_actor end,
          case when p_system then null else ptw.ctx('role_id')::uuid end,
          case when p_system then coalesce(ptw.ctx('auth'), 'sistema') else ptw.ctx('auth') end::ptw.auth_method,
          ptw.ctx('client'), ptw.ctx('request_id'), ptw.ctx('reason'),
          p_action, p_ok, p_permit, p_rev, p_asset, p_entity, p_entity_id, p_text, coalesce(p_data, '{}'))
  returning seq into s;
  return s;
end $$;

-- ---------- Evento automático por linha ----------
create function ptw.audit_field_label(c text) returns text
  language sql immutable parallel safe
  return case c
    when 'name' then 'nome' when 'code' then 'código' when 'aliases' then 'apelidos' when 'status' then 'situação'
    when 'type_id' then 'tipo' when 'parent_id' then 'local pai' when 'origin' then 'origem' when 'login' then 'login'
    when 'enabled' then 'conta ativa' when 'account_expires' then 'validade da conta' when 'valid_until' then 'validade'
    when 'scope_location_id' then 'escopo' when 'label' then 'rótulo' when 'active' then 'em uso' when 'position' then 'posição'
    when 'meaning' then 'significado' when 'kind' then 'tipo' when 'role_id' then 'cargo' when 'role_ids' then 'cargos' when 'person_id' then 'pessoa'
    when 'min' then 'mínimo' when 'required' then 'obrigatória' when 'locked' then 'travada' when 'note' then 'nota'
    when 'form' then 'formulário' when 'value' then 'valor' when 'company' then 'empresa' when 'employee_id' then 'matrícula'
    when 'icon' then 'ícone' when 'timezone' then 'fuso' when 'scope' then 'escopo' when 'work_window' then 'janela'
    when 'location_id' then 'local' when 'template_id' then 'modelo' when 'version_id' then 'versão'
    when 'state_note' then 'observação' when 'revision' then 'revisão' when 'snapshot_sha256' then 'formulário congelado'
    when 'number' then 'número' when 'ad_object_guid' then 'vínculo AD' when 'retention_class' then 'classe de retenção'
    when 'answered_by' then 'respondida por' when 'system_key' then 'chave do sistema'
    when 'required_when_item' then 'condição' when 'required_when_values' then 'valores da condição'
    when 'source_sha256' then 'pacote de origem' when 'import_source' then 'origem da importação'
    when 'required_when_line' then 'linha da condição' when 'max_window' then 'prazo máximo da janela'
    when 'holds_equipment' then 'prende o equipamento'
    else c end;

-- Último segmento da ação, acentuado para a frase ("pt.ativo.incluido" → "incluído").
create function ptw.audit_verb(action text) returns text
  language sql immutable parallel safe
  return replace(split_part(action, '.', array_length(string_to_array(action, '.'), 1)), 'incluid', 'incluíd');

-- Colunas derivadas ou de controle não entram no diff (evita ruído e falso "alterado").
-- "revision" só conta na PT, onde é a revisão assinada.
create function ptw.audit_strip(tbl text, r jsonb) returns jsonb
  language sql immutable parallel safe
  return r - array['unit_id', 'search', 'updated_at', 'changed_at', 'row_version', 'path', 'holds', 'num', 'object_key',
                   'type_fam', 'role_fam', 'kind_fam', 'answered_at', 'created_at', 'captured_at', 'stored_at',
                   'snapshot_at', 'activated_at']
           - case when tbl in ('permit', 'appearance') then '{}'::text[] else array['revision'] end
           - case when tbl = 'appearance_asset' then array['content'] else '{}'::text[] end;

-- Argumentos: ação de inclusão, de alteração, de remoção, rótulo, coluna que identifica a linha.
-- data = {"de": {colunas antigas}, "para": {colunas novas}}, só o que mudou. Nada mudou = nada gravado.
create function ptw.audit_row() returns trigger
  language plpgsql security definer
  set search_path = ptw, pg_catalog set timezone = 'UTC' set datestyle = 'ISO, YMD' as $$
declare
  tbl text := tg_table_name; r jsonb; o jsonb; n jsonb; d_old jsonb; d_new jsonb; ch text[];
  act text; unit uuid; pid uuid; rv integer; aid uuid; eid uuid; nm text; txt text; dat jsonb; jk text;
  lbl text := tg_argv[3]; idc text := coalesce(tg_argv[4], 'id'); x_old timestamptz; x_new timestamptz; x_why text; tz text;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then o := ptw.audit_strip(tbl, to_jsonb(old)); end if;
  if tg_op <> 'DELETE' then n := ptw.audit_strip(tbl, to_jsonb(new)); end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, o -> k), jsonb_object_agg(k, v), array_agg(k order by k)
      into d_old, d_new, ch
      from jsonb_each(n) e(k, v) where o -> k is distinct from v;
    if d_new is null then return null; end if;
    act := tg_argv[1];
  elsif tg_op = 'INSERT' then
    d_new := jsonb_strip_nulls(n) - 'id'; act := tg_argv[0];
  else
    d_old := jsonb_strip_nulls(o) - 'id'; act := tg_argv[2];
  end if;

  -- Formulário e origem da importação (JSON grandes): guarda só o SHA-256 (o do formulário é o
  -- mesmo de form_snapshot); a origem resumida vai no evento modelo.importado.
  if tbl = 'template_version' then
    foreach jk in array array['form', 'import_source'] loop
      if d_old ? jk then d_old := jsonb_set(d_old, array[jk], jsonb_build_object('sha256',
           encode(sha256(convert_to((d_old -> jk)::text, 'UTF8')), 'hex'))); end if;
      if d_new ? jk then d_new := jsonb_set(d_new, array[jk], jsonb_build_object('sha256',
           encode(sha256(convert_to((d_new -> jk)::text, 'UTF8')), 'hex'))); end if;
    end loop;
  end if;

  unit := case when tbl = 'unit' then (r ->> 'id')::uuid else (r ->> 'unit_id')::uuid end;
  eid  := (r ->> idc)::uuid;
  pid  := case when tbl = 'permit' then (r ->> 'id')::uuid else (r ->> 'permit_id')::uuid end;
  aid  := case when tbl = 'asset' then (r ->> 'id')::uuid
               when tbl = 'asset_relation' then (r ->> 'from_id')::uuid
               else (r ->> 'asset_id')::uuid end;
  nm   := coalesce(r ->> 'code', r ->> 'name', r ->> 'label', r ->> 'meaning', r ->> 'item_id', r ->> 'file_name');
  if idc = 'asset_id' then
    select a.code into nm from ptw.asset a where a.unit_id = unit and a.id = aid;
  elsif idc = 'person_id' or tbl = 'person_role' then
    select p.name into nm from ptw.person p where p.unit_id = unit and p.id = (r ->> 'person_id')::uuid;
  end if;

  if tbl = 'permit' then
    rv := (r ->> 'revision')::integer;
  elsif tbl = 'permit_revision' then
    rv := (r ->> 'rev')::integer;
  elsif pid is not null then
    select p.revision into rv from ptw.permit p where p.unit_id = unit and p.id = pid;
  end if;

  txt := lbl || ' ' || ptw.audit_verb(act) || coalesce(': ' || nm, '');

  -- Ações e frases específicas.
  if tbl = 'permit' and tg_op = 'INSERT' then
    txt := 'Rascunho criado';
  elsif tbl = 'permit' and tg_op = 'UPDATE' then
    -- Prorrogação (permit_extend): só o fim da janela mudou e há a linha desta transação.
    if ch = array['work_window'] then
      select e.old_end, e.new_end, e.reason into x_old, x_new, x_why from ptw.permit_extension e
       where e.unit_id = new.unit_id and e.permit_id = new.id and e.at = now() and e.new_end = upper(new.work_window)
       order by e.id desc limit 1;
    end if;
    if x_new is not null then
      select u.timezone into tz from ptw.unit u where u.id = new.unit_id;
      act := 'pt.prorrogada';
      txt := 'Janela prorrogada: até ' || to_char(x_old at time zone tz, 'DD/MM HH24:MI') || ' → até '
             || to_char(x_new at time zone tz, 'DD/MM HH24:MI') || ' · ' || x_why;
      d_old := jsonb_build_object('fim', x_old); d_new := jsonb_build_object('fim', x_new);
    elsif d_new ? 'state' then
      act := 'pt.estado';
      txt := ptw.state_label(old.state) || ' → ' || ptw.state_label(new.state) || coalesce(': ' || new.state_note, '');
    elsif d_new ? 'hold_reason' and new.hold_reason is not null then
      act := 'pt.parada';  txt := 'Parada: ' || new.hold_reason;
    elsif d_new ? 'resumed_reason' and new.resumed_reason is not null then
      act := 'pt.retomada'; txt := 'Retomada: ' || new.resumed_reason;
    elsif d_new ? 'hold_reason' then
      act := 'pt.parada.removida'; txt := 'Parada removida';
    else
      act := 'pt.alterada';
    end if;
  elsif tbl = 'appearance' then
    act := case when new.brand is null then 'identidade.restaurada' else 'identidade.publicada' end;
    txt := case when new.brand is null then 'Identidade restaurada para o tema da planta' else 'Identidade visual publicada' end;
  elsif tbl = 'template_version' and tg_op = 'UPDATE' and d_new ? 'status' then
    act := case new.status when 'ativa' then 'modelo.versao.ativada' when 'arquivada' then 'modelo.versao.arquivada'
                else 'modelo.versao.alterada' end;
    txt := 'Versão ' || new.number || ' ' || ptw.audit_verb(act);
  elsif tbl = 'template_version' then
    txt := 'Versão ' || (r ->> 'number') || ' ' || ptw.audit_verb(act);
  elsif tbl = 'person' and tg_op = 'UPDATE'
        and ch <@ array['login', 'enabled', 'account_expires', 'ad_object_guid'] then
    act := 'cadastro.conta.alterada'; txt := 'Conta alterada: ' || nm;
  elsif tbl = 'permit_answer' then
    txt := case when tg_op = 'DELETE' then 'Resposta removida: ' else 'Respondeu: ' end || nm;
  elsif tbl = 'permit_revision' then
    txt := 'Nova revisão ' || (r ->> 'rev') || ': ' || (r ->> 'reason');
  end if;
  if tg_op = 'UPDATE' and act not in ('pt.estado', 'pt.parada', 'pt.retomada', 'pt.parada.removida', 'pt.prorrogada',
                                       'modelo.versao.ativada', 'modelo.versao.arquivada') then
    txt := txt || ' (' || (select string_agg(ptw.audit_field_label(c), ', ') from unnest(ch) c) || ')';
  end if;

  -- Desfazer (set_context com p_undo): a escrita inversa é um evento próprio, marcado.
  if ptw.ctx('undo') = 'on' then
    act := act || '.desfeito'; txt := 'Desfazer: ' || txt;
  end if;

  dat := jsonb_strip_nulls(jsonb_build_object('de', d_old, 'para', d_new));
  if x_new is not null then dat := dat || jsonb_build_object('motivo', x_why); end if;
  perform ptw.audit_emit(unit, act, true, txt, dat, pid, rv, aid, tbl, eid);
  return null;
end $$;

do $$
declare t text[];
begin
  foreach t slice 1 in array array[
    ['delegation',            'delegacao.criada',               'delegacao.revogada',               'delegacao.removida',               'Delegação',            'id'],
    ['person_group',          'cadastro.grupo.criado',           'cadastro.grupo.alterado',           'cadastro.grupo.removido',           'Grupo',                'id'],
    ['person_group_member',   'cadastro.grupo.membro.incluido',  'cadastro.grupo.membro.alterado',    'cadastro.grupo.membro.removido',    'Membro de grupo',      'group_id'],
    ['appearance',            'identidade.publicada',           'identidade.publicada',             'identidade.removida',              'Identidade visual',    'unit_id'],
    ['appearance_asset',      'identidade.imagem.incluida',      'identidade.imagem.alterada',        'identidade.imagem.removida',        'Imagem de identidade', 'id'],
    ['unit',                  'cadastro.unidade.criada',        'cadastro.unidade.alterada',        'cadastro.unidade.removida',        'Unidade',              'id'],
    ['type_def',              'cadastro.tipo.criado',           'cadastro.tipo.alterado',           'cadastro.tipo.removido',           'Tipo',                 'id'],
    ['location',              'cadastro.local.criado',          'cadastro.local.alterado',          'cadastro.local.removido',          'Local',                'id'],
    ['asset',                 'cadastro.ativo.criado',          'cadastro.ativo.alterado',          'cadastro.ativo.removido',          'Ativo',                'id'],
    ['asset_location',        'cadastro.ativo.local.incluido',  'cadastro.ativo.local.alterado',    'cadastro.ativo.local.removido',    'Local do ativo',       'asset_id'],
    ['asset_relation',        'cadastro.ativo.relacao.criada',  'cadastro.ativo.relacao.alterada',  'cadastro.ativo.relacao.removida',  'Relação entre ativos', 'id'],
    ['person',                'cadastro.pessoa.criada',         'cadastro.pessoa.alterada',         'cadastro.pessoa.removida',         'Pessoa',               'id'],
    ['person_role',           'cadastro.cargo.concedido',       'cadastro.cargo.alterado',          'cadastro.cargo.revogado',          'Cargo',                'id'],
    ['option_list',           'cadastro.lista.criada',          'cadastro.lista.alterada',          'cadastro.lista.removida',          'Lista',                'id'],
    ['option_item',           'cadastro.lista.item.criado',     'cadastro.lista.item.alterado',     'cadastro.lista.item.removido',     'Item de lista',        'id'],
    ['template',              'modelo.criado',                  'modelo.alterado',                  'modelo.removido',                  'Modelo',               'id'],
    ['template_version',      'modelo.versao.criada',           'modelo.versao.alterada',           'modelo.versao.removida',           'Versão',               'id'],
    ['version_location_type', 'modelo.versao.escopo.incluido',  'modelo.versao.escopo.alterado',    'modelo.versao.escopo.removido',    'Tipo de local aceito', 'version_id'],
    ['version_asset_type',    'modelo.versao.escopo.incluido',  'modelo.versao.escopo.alterado',    'modelo.versao.escopo.removido',    'Tipo de ativo aceito', 'version_id'],
    ['stage',                 'modelo.etapa.criada',            'modelo.etapa.alterada',            'modelo.etapa.removida',            'Etapa',                'id'],
    ['sign_slot',             'modelo.assinatura.criada',       'modelo.assinatura.alterada',       'modelo.assinatura.removida',       'Assinatura do modelo', 'id'],
    ['separation',            'modelo.separacao.criada',        'modelo.separacao.alterada',        'modelo.separacao.removida',        'Separação',            'version_id'],
    ['permit',                'pt.criada',                      'pt.alterada',                      'pt.removida',                      'PT',                   'id'],
    ['permit_asset',          'pt.ativo.incluido',              'pt.ativo.alterado',                'pt.ativo.removido',                'Ativo da PT',          'asset_id'],
    ['permit_team',           'pt.equipe.incluida',             'pt.equipe.alterada',               'pt.equipe.removida',               'Equipe',               'person_id'],
    ['permit_answer',         'pt.resposta',                    'pt.resposta',                      'pt.resposta.removida',             'Resposta',             'permit_id'],
    ['attachment',            'pt.anexo.incluido',              'pt.anexo.alterado',                'pt.anexo.removido',                'Anexo',                'id'],
    ['permit_revalidation',   'pt.revalidada',                   'pt.revalidada',                    'pt.revalidada',                    'Revalidação',          'id'],
    ['permit_revision',       'pt.revisao',                     'pt.revisao',                       'pt.revisao',                       'Revisão',              'permit_id']]
  loop
    execute format('create trigger audit_row after insert or update or delete on ptw.%I for each row '
                   'execute function ptw.audit_row(%L, %L, %L, %L, %L)', t[1], t[2], t[3], t[4], t[5], t[6]);
  end loop;
end $$;

-- Assinatura: o ator é quem assinou (não a sessão); anulação é evento próprio.
create function ptw.signature_audit() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare meaning text;
begin
  select s.meaning into meaning from ptw.sign_slot s where s.unit_id = new.unit_id and s.id = new.slot_id;
  if tg_op = 'INSERT' then
    perform ptw.audit_emit(new.unit_id, 'pt.assinatura', true, 'Assinou: ' || meaning,
      jsonb_build_object('slot', new.slot_id, 'pessoa', new.person_id) || case when new.delegation_id is null then '{}'::jsonb else jsonb_build_object('delegacao',new.delegation_id,'representado',new.represented_person_id) end, new.permit_id, new.rev, null,
      'signature', new.id, new.person_id);
  elsif new.voided_at is not null and old.voided_at is null then
    perform ptw.audit_emit(new.unit_id, 'pt.assinatura.anulada', true,
      'Assinatura anulada (' || meaning || '): ' || new.voided_reason,
      jsonb_build_object('slot', new.slot_id, 'pessoa', new.person_id, 'motivo', new.voided_reason),
      new.permit_id, new.rev, null, 'signature', new.id);
  end if;
  return null;
end $$;
create trigger signature_audit after insert or update on ptw.signature
  for each row execute function ptw.signature_audit();

-- ---------- Eventos do sistema, de sessão, de negação e de acesso ----------
-- Sistema: sem pessoa (ator nulo). Unidade nula = grava em todas as unidades, exceto quando a
-- sessão tem unidade (a API): aí grava só na dela.
create function ptw.audit_system(p_action text, p_text text, p_data jsonb default '{}', p_unit uuid default null)
  returns integer language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare u uuid; n integer := 0;
begin
  if ptw.current_unit() is not null then
    if p_unit is not null and p_unit <> ptw.current_unit() then
      raise exception 'Evento do sistema em outra unidade' using errcode = 'PTW14';
    end if;
    p_unit := ptw.current_unit();
  end if;
  if p_action !~ '^sistema(\.[a-z_]+)+$' or coalesce(p_text, '') = '' then
    raise exception 'Evento do sistema: ação "sistema.*" e texto são obrigatórios' using errcode = 'PTW14';
  end if;
  for u in select id from ptw.unit where p_unit is null or id = p_unit order by id loop
    perform ptw.audit_emit(u, p_action, true, p_text, p_data, p_system => true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Toda mudança de retenção vira evento do sistema em todas as unidades.
create function ptw.retention_audit() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  perform ptw.audit_system('sistema.retencao.alterada', 'Retenção alterada: ' || coalesce(new.code, old.code),
    jsonb_strip_nulls(jsonb_build_object('de', to_jsonb(old), 'para', to_jsonb(new))));
  return null;
end $$;
create trigger audit_row after insert or update or delete on ptw.retention_class
  for each row execute function ptw.retention_audit();

create function ptw.audit_retention_years() returns integer
  language sql stable parallel safe
  return (select max(years) from ptw.retention_class);

-- Sessão e conta (só a API sabe): entrada (ok ou falha), saída, expiração, bloqueio, credencial.
create function ptw.audit_log(p_action text, p_ok boolean, p_text text, p_data jsonb default '{}',
                              p_person uuid default null)
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare u uuid := ptw.current_unit();
begin
  if u is null then raise exception 'Sem unidade na sessão' using errcode = 'PTW14'; end if;
  if p_action !~ '^(sessao|conta)(\.[a-z_]+)+$' or coalesce(p_text, '') = '' or p_ok is null then
    raise exception 'Evento de sessão: ação "sessao.*" ou "conta.*", resultado e texto obrigatórios' using errcode = 'PTW14';
  end if;
  if p_person is not null and not exists (select 1 from ptw.person where unit_id = u and id = p_person) then
    raise exception 'Pessoa não pertence à unidade' using errcode = 'PTW14';
  end if;
  return ptw.audit_emit(u, p_action, p_ok, p_text, p_data, null, null, null,
                        case when p_person is not null then 'person' end, p_person,
                        coalesce(p_person, ptw.current_person()));
end $$;

-- Negação. Uma regra violada (PTWnn) desfaz a transação inteira, inclusive o que ela gravaria na
-- trilha. OBRIGAÇÃO DA API: ao pegar o erro, abrir OUTRA transação, refazer set_context e chamar
-- audit_denied com a ação tentada e o código. O evento fica com ok = false.
create function ptw.audit_denied(p_action text, p_code text, p_message text, p_permit uuid default null,
                                 p_data jsonb default '{}')
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare u uuid := ptw.current_unit(); rv integer;
begin
  if u is null then raise exception 'Sem unidade na sessão' using errcode = 'PTW14'; end if;
  if p_action !~ '^[a-z_]+(\.[a-z_]+)*$' or p_code !~ '^[A-Z0-9]{5}$' or coalesce(p_message, '') = '' then
    raise exception 'Negação: ação, código (5 caracteres) e mensagem obrigatórios' using errcode = 'PTW14';
  end if;
  if p_permit is not null then
    select revision into rv from ptw.permit where unit_id = u and id = p_permit;
    if not found then raise exception 'PT inexistente na unidade' using errcode = 'PTW14'; end if;
  end if;
  return ptw.audit_emit(u, p_action, false, 'Negado (' || p_code || '): ' || p_message,
    coalesce(p_data, '{}') || jsonb_build_object('erro', p_code, 'mensagem', p_message), p_permit, rv,
    null, case when p_permit is not null then 'permit' end, p_permit);
end $$;

-- Leitura sensível: abrir PT, ver/baixar anexo, exportar, buscar na auditoria. Fica na trilha com
-- "acesso.*", fora do índice do Histórico. Exportação exige motivo.
create function ptw.audit_access(p_action text, p_permit uuid default null, p_attachment uuid default null,
                                 p_reason text default null, p_data jsonb default '{}')
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare u uuid := ptw.current_unit(); a record; fname text; rv integer; txt text; d jsonb := coalesce(p_data, '{}');
begin
  if u is null then raise exception 'Sem unidade na sessão' using errcode = 'PTW14'; end if;
  if p_action !~ '^acesso(\.[a-z_]+)+$' then
    raise exception 'Acesso: a ação começa com "acesso."' using errcode = 'PTW14';
  end if;
  if p_action like 'acesso.exportacao%' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Exportação exige motivo' using errcode = 'PTW14';
  end if;
  if p_attachment is not null then
    select at.permit_id, at.file_name, at.kind, encode(at.sha256, 'hex') sha into a
      from ptw.attachment at where at.unit_id = u and at.id = p_attachment;
    if not found then raise exception 'Anexo inexistente na unidade' using errcode = 'PTW14'; end if;
    p_permit := coalesce(p_permit, a.permit_id); fname := a.file_name;
    d := d || jsonb_build_object('arquivo', a.file_name, 'tipo', a.kind, 'sha256', a.sha);
  end if;
  if p_permit is not null then
    select revision into rv from ptw.permit where unit_id = u and id = p_permit;
    if not found then raise exception 'PT inexistente na unidade' using errcode = 'PTW14'; end if;
  end if;
  if p_reason is not null then d := d || jsonb_build_object('motivo', p_reason); end if;
  txt := case
    when p_action = 'acesso.pt.aberta' then 'Abriu a PT'
    when p_action = 'acesso.anexo.visto' then 'Viu o anexo ' || fname
    when p_action = 'acesso.anexo.baixado' then 'Baixou o anexo ' || fname
    when p_action like 'acesso.exportacao%' then 'Exportou: ' || p_reason
    when p_action = 'acesso.auditoria.busca' then 'Consultou a auditoria'
    when p_action = 'acesso.auditoria.evento' then 'Abriu um evento da auditoria'
    else 'Acesso: ' || p_action end;
  return ptw.audit_emit(u, p_action, true, txt, d, p_permit, rv, null,
    case when p_attachment is not null then 'attachment' when p_permit is not null then 'permit' end,
    coalesce(p_attachment, p_permit));
end $$;

-- Importação de modelo: um evento "modelo.importado" com o pacote, os documentos de origem, quem
-- gerou (ferramenta e modelo de IA), o idioma e os totais do que foi criado. A API chama na mesma
-- transação da importação, depois de criar a versão, as etapas, as assinaturas e o que é novo
-- (p_novos = {"listas": [id], "tipos": [id], "cargos": [id]}). Versão sugerida sem este evento é
-- recusada no commit (import_event_required).
create function ptw.audit_import(p_version uuid, p_novos jsonb default '{}') returns bigint
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare
  u uuid := ptw.current_unit(); v record; src jsonb; tot jsonb; k text; bad text;
  nl integer; nt integer; nc integer; ne integer; ni integer; ns integer;
  plural constant jsonb := '{"etapa": "etapas", "item": "itens", "assinatura": "assinaturas", "lista nova": "listas novas",
                              "tipo novo": "tipos novos", "cargo novo": "cargos novos"}';
begin
  if u is null then raise exception 'Sem unidade na sessão' using errcode = 'PTW14'; end if;
  select tv.id, tv.number, tv.status, tv.origin, tv.import_source, tv.form, t.name into v
    from ptw.template_version tv join ptw.template t on t.unit_id = tv.unit_id and t.id = tv.template_id
   where tv.unit_id = u and tv.id = p_version;
  if not found then raise exception 'Importação: versão inexistente na unidade' using errcode = 'PTW14'; end if;
  if v.origin <> 'sugerida' or v.status <> 'rascunho' or v.import_source is null then
    raise exception 'Importação: a versão precisa ser um rascunho sugerido, com a origem' using errcode = 'PTW14';
  end if;
  if exists (select 1 from ptw.audit_event e where e.unit_id = u and e.action = 'modelo.importado' and e.entity_id = p_version) then
    raise exception 'Importação: a versão já tem o evento modelo.importado' using errcode = 'PTW14';
  end if;
  p_novos := coalesce(p_novos, '{}');
  if jsonb_typeof(p_novos) <> 'object' or exists (select 1 from jsonb_object_keys(p_novos) x where x not in ('listas', 'tipos', 'cargos')) then
    raise exception 'Importação: novos = {"listas", "tipos", "cargos"}' using errcode = 'PTW14';
  end if;
  foreach k in array array['listas', 'tipos', 'cargos'] loop
    if p_novos ? k and jsonb_typeof(p_novos -> k) <> 'array' then
      raise exception 'Importação: "%" é uma lista de ids', k using errcode = 'PTW14';
    end if;
    select x into bad from jsonb_array_elements_text(coalesce(p_novos -> k, '[]')) x
     where case when not ptw.is_uuid(x) then true else not case k
       when 'listas' then exists (select 1 from ptw.option_list o where o.unit_id = u and o.id = x::uuid)
       when 'tipos'  then exists (select 1 from ptw.type_def d where d.unit_id = u and d.id = x::uuid and d.family in ('local', 'ativo'))
       else               exists (select 1 from ptw.type_def d where d.unit_id = u and d.id = x::uuid and d.family = 'cargo') end end
     limit 1;
    if found then raise exception 'Importação: % inexistente na unidade (%)', k, bad using errcode = 'PTW14'; end if;
  end loop;
  nl := jsonb_array_length(coalesce(p_novos -> 'listas', '[]'));
  nt := jsonb_array_length(coalesce(p_novos -> 'tipos', '[]'));
  nc := jsonb_array_length(coalesce(p_novos -> 'cargos', '[]'));
  select count(*) into ne from ptw.stage where unit_id = u and version_id = p_version;
  select count(*) into ns from ptw.sign_slot where unit_id = u and version_id = p_version;
  select count(*) into ni from ptw.form_items(v.form);
  tot := jsonb_build_object('versao', v.number, 'etapas', ne, 'assinaturas', ns,
    'secoes', jsonb_array_length(coalesce(v.form -> 'sections', '[]')), 'itens', ni,
    'listasNovas', nl, 'tiposNovos', nt, 'cargosNovos', nc,
    'separacoes', (select count(*) from ptw.separation where unit_id = u and version_id = p_version));
  src := v.import_source;
  return ptw.audit_emit(u, 'modelo.importado', true,
    'Importou “' || v.name || '” v' || v.number || ' como rascunho sugerido de '
      || coalesce(nullif(src -> 'pacote' ->> 'arquivo', ''), 'pacote colado') || ': '
      || (select string_agg(q.n || ' ' || case when q.n = 1 then q.w else plural ->> q.w end, ', ' order by q.o)
            from (values (1, ne, 'etapa'), (2, ni, 'item'), (3, ns, 'assinatura'), (4, nl, 'lista nova'),
                         (5, nt, 'tipo novo'), (6, nc, 'cargo novo')) q(o, n, w)),
    jsonb_strip_nulls(jsonb_build_object('pacote', src -> 'pacote', 'documentos', src -> 'documentos',
      'ferramenta', src -> 'ferramenta', 'modelo', src -> 'modelo', 'idioma', src -> 'idioma', 'totais', tot,
      'novos', jsonb_build_object('listas', coalesce(p_novos -> 'listas', '[]'), 'tipos', coalesce(p_novos -> 'tipos', '[]'),
                                  'cargos', coalesce(p_novos -> 'cargos', '[]')))),
    null, null, null, 'template_version', p_version);
end $$;

-- No commit: toda versão sugerida criada na transação tem o seu "modelo.importado".
create function ptw.import_event_required() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  if exists (select 1 from ptw.template_version where unit_id = new.unit_id and id = new.id and origin = 'sugerida')
     and not exists (select 1 from ptw.audit_event e where e.unit_id = new.unit_id and e.action = 'modelo.importado'
                      and e.entity_id = new.id) then
    raise exception 'Versão importada sem o evento modelo.importado (chame ptw.audit_import)' using errcode = 'PTW14';
  end if;
  return null;
end $$;
create constraint trigger import_event_required after insert on ptw.template_version
  deferrable initially deferred
  for each row when (new.origin = 'sugerida') execute function ptw.import_event_required();

-- ---------- Âncora diária fora do host ----------
-- tools/ptw_ancora.py lê a ponta de cada unidade, assina (HMAC-SHA256) com a chave que fica só no
-- host (nenhum papel do banco a lê), grava no destino fora do host e registra aqui.
create table ptw.audit_anchor (
  unit_id     uuid not null references ptw.unit,
  seq         bigint not null,
  hash        bytea not null check (length(hash) = 32),
  day         date not null,
  key_id      text not null check (key_id ~ '^[0-9a-f]{16}$'),
  mac         bytea not null check (length(mac) = 32),
  destination text check (length(destination) <= 500),
  created_at  timestamptz not null default now(),
  primary key (unit_id, seq, day)
);
create trigger audit_anchor_frozen before update or delete on ptw.audit_anchor
  for each row execute function ptw.forbid_change();
alter table ptw.audit_anchor enable always trigger audit_anchor_frozen;

-- Pontas confirmadas (só o dono: a API não lê audit_head).
create function ptw.audit_heads() returns table (unit_id uuid, code text, seq bigint, hash text)
  language sql stable security definer set search_path = ptw, pg_catalog as $$
  select h.unit_id, u.code, h.last_seq, encode(h.last_hash, 'hex')
    from ptw.audit_head h join ptw.unit u on u.id = h.unit_id where h.last_seq > 0 order by u.code
$$;

create function ptw.audit_anchor_record(p_unit uuid, p_seq bigint, p_hash text, p_day date, p_key_id text,
                                        p_mac text, p_destination text default null)
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  if not exists (select 1 from ptw.audit_event where unit_id = p_unit and seq = p_seq and hash = decode(p_hash, 'hex')) then
    raise exception 'Âncora não confere com a trilha (seq %)', p_seq using errcode = 'PTW14';
  end if;
  insert into ptw.audit_anchor (unit_id, seq, hash, day, key_id, mac, destination)
  values (p_unit, p_seq, decode(p_hash, 'hex'), p_day, p_key_id, decode(p_mac, 'hex'), p_destination);
  perform ptw.audit_system('sistema.ancora.gravada', 'Âncora do dia ' || to_char(p_day, 'DD/MM/YYYY') || ' gravada (seq ' || p_seq || ')',
    jsonb_build_object('dia', p_day, 'seq', p_seq, 'hash', p_hash, 'chave', p_key_id, 'destino', p_destination), p_unit);
  return p_seq;
end $$;

-- ---------- Exportação e arquivamento ----------
-- Exportação registrada (faixa de seq, SHA-256 do arquivo e do manifesto). actor_id sem chave
-- estrangeira: registro de auditoria não prende nem depende do cadastro.
-- manifest: os bytes exatos do manifesto (texto UTF-8), para a API devolvê-lo depois (ela não tem
-- disco); conferido contra manifest_sha256 ao incluir. O JSONL não é guardado: é refeito de
-- audit_export_lines(first_seq, last_seq) e conferido contra file_sha256.
create table ptw.audit_export (
  unit_id         uuid not null references ptw.unit,
  id              uuid not null default uuidv7(),
  first_seq       bigint not null check (first_seq > 0),
  last_seq        bigint not null,
  file_sha256     bytea not null check (length(file_sha256) = 32),
  manifest_sha256 bytea not null check (length(manifest_sha256) = 32),
  reason          text not null check (length(btrim(reason)) between 1 and 500),
  actor_id        uuid,
  at              timestamptz not null default now(),
  manifest        text,
  primary key (unit_id, id),
  check (last_seq >= first_seq),
  check (manifest is null or sha256(convert_to(manifest, 'UTF8')) = manifest_sha256)
);
create trigger audit_export_frozen before update or delete on ptw.audit_export
  for each row execute function ptw.forbid_change();
alter table ptw.audit_export enable always trigger audit_export_frozen;

-- Marcador deixado por partição arquivada, por unidade: a verificação continua a partir dele.
create table ptw.audit_archive (
  unit_id     uuid not null references ptw.unit,
  partition   text not null,
  first_seq   bigint not null,
  last_seq    bigint not null,
  last_hash   bytea not null check (length(last_hash) = 32),
  export_id   uuid not null,
  reason      text not null check (length(btrim(reason)) between 1 and 500),
  archived_at timestamptz not null default now(),
  primary key (unit_id, last_seq),
  foreign key (unit_id, export_id) references ptw.audit_export (unit_id, id),
  check (last_seq >= first_seq)
);
create trigger audit_archive_frozen before update or delete on ptw.audit_archive
  for each row execute function ptw.forbid_change();
alter table ptw.audit_archive enable always trigger audit_archive_frozen;

-- Partições conhecidas. Uma partição "ativa" não pode ser desanexada nem apagada (event trigger).
create table ptw.audit_partition (
  rel        oid primary key,
  name       text not null,
  lower      timestamptz,
  upper      timestamptz,             -- nulo = DEFAULT (nunca sai)
  state      text not null default 'ativa' check (state in ('ativa', 'arquivada')),
  created_at timestamptz not null default now()
);

-- Registra partições novas e garante o bloqueio de TRUNCATE em cada uma (o do pai não vale para a filha).
create function ptw.audit_partition_sync() returns void
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare p record; quiet text := current_setting('ptw.ddl_quiet', true);
begin
  insert into ptw.audit_partition (rel, name, lower, upper)
  select c.oid, c.relname, b[1]::timestamptz, b[2]::timestamptz
    from pg_inherits i join pg_class c on c.oid = i.inhrelid,
         regexp_match(pg_get_expr(c.relpartbound, c.oid), 'FROM \(''([^'']+)''\) TO \(''([^'']+)''\)') b
   where i.inhparent = 'ptw.audit_event'::regclass
  on conflict (rel) do nothing;
  for p in select c.oid, c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
            where i.inhparent = 'ptw.audit_event'::regclass
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit_no_truncate') loop
    perform set_config('ptw.ddl_quiet', 'on', true);
    execute format('create trigger audit_no_truncate before truncate on ptw.%I for each statement execute function ptw.forbid_change()', p.relname);
    perform set_config('ptw.ddl_quiet', 'on', true);
    execute format('alter table ptw.%I enable always trigger audit_no_truncate', p.relname);
    perform set_config('ptw.ddl_quiet', coalesce(quiet, ''), true);
  end loop;
end $$;

-- Partições mensais (idempotente). Registra e anota na trilha cada partição criada.
create function ptw.audit_partitions(p_from date, p_months integer) returns void
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare m date := date_trunc('month', p_from)::date; i integer; nm text; quiet text := current_setting('ptw.ddl_quiet', true);
begin
  for i in 0 .. p_months - 1 loop
    nm := 'audit_event_' || to_char(m, 'YYYYMM');
    if to_regclass('ptw.' || nm) is null then
      perform set_config('ptw.ddl_quiet', 'on', true);
      execute format('create table ptw.%I partition of ptw.audit_event for values from (%L) to (%L)',
                     nm, m::timestamptz, (m + interval '1 month')::date::timestamptz);
      perform ptw.audit_partition_sync();
      perform set_config('ptw.ddl_quiet', coalesce(quiet, ''), true);
      perform ptw.audit_system('sistema.particao.criada', 'Partição de auditoria criada: ' || to_char(m, 'MM/YYYY'),
                               jsonb_build_object('particao', nm));
    end if;
    m := (m + interval '1 month')::date;
  end loop;
end $$;

-- Tarefa diária do agendador: garante do mês anterior até 3 meses à frente.
create function ptw.audit_maintenance() returns text
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  perform ptw.audit_partitions((now() - interval '1 month')::date, 5);
  return 'partições de ' || to_char(now() - interval '1 month', 'MM/YYYY') || ' a '
         || to_char(now() + interval '3 months', 'MM/YYYY') || ' garantidas';
end $$;

-- Arquiva (desanexa e apaga) a partição mais antiga, só depois do prazo de retenção e de uma
-- exportação registrada que cubra todos os eventos dela, e só se ela guardar a faixa de seq
-- seguinte ao último marcador. Deixa na trilha, por unidade, o marcador (primeiro e último seq,
-- hash final, exportação).
create function ptw.audit_archive(p_partition regclass, p_reason text) returns integer
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare p ptw.audit_partition; until date; u record; ex record; n integer := 0;
begin
  perform ptw.audit_partition_sync();
  select * into p from ptw.audit_partition where rel = p_partition::oid for update;
  if not found or p.state <> 'ativa' or p.upper is null then
    raise exception 'Não é uma partição mensal ativa da auditoria' using errcode = 'PTW13';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Arquivamento exige motivo' using errcode = 'PTW13';
  end if;
  until := (p.upper + make_interval(years => ptw.audit_retention_years()))::date;
  if until > current_date then
    raise exception 'Retenção da partição % vai até %', p.name, to_char(until, 'DD/MM/YYYY') using errcode = 'PTW13';
  end if;
  if exists (select 1 from ptw.audit_partition o where o.state = 'ativa' and o.upper is not null and o.lower < p.lower
             and exists (select 1 from ptw.audit_event e where e.at >= o.lower and e.at < o.upper)) then
    raise exception 'Arquive antes as partições mais antigas' using errcode = 'PTW13';
  end if;
  for u in execute format('select unit_id, min(seq) f, max(seq) l from ptw.%I group by unit_id', p.name) loop
    if u.f <> coalesce((select max(a.last_seq) from ptw.audit_archive a where a.unit_id = u.unit_id), 0) + 1
       or exists (select 1 from ptw.audit_event e where e.unit_id = u.unit_id and e.seq < u.l
                   and not (e.at >= p.lower and e.at < p.upper)) then
      raise exception 'Os eventos de % não são uma faixa contínua de seq (% a %)', p.name, u.f, u.l using errcode = 'PTW13';
    end if;
    select * into ex from ptw.audit_export x
     where x.unit_id = u.unit_id and x.first_seq <= u.f and x.last_seq >= u.l order by x.at desc limit 1;
    if not found then
      raise exception 'Exporte os eventos % a % antes de arquivar', u.f, u.l using errcode = 'PTW13';
    end if;
    insert into ptw.audit_archive (unit_id, partition, first_seq, last_seq, last_hash, export_id, reason)
    select u.unit_id, p.name, u.f, u.l, e.hash, ex.id, p_reason from ptw.audit_event e where e.unit_id = u.unit_id and e.seq = u.l;
    perform ptw.audit_system('sistema.particao.arquivada',
      'Eventos ' || u.f || ' a ' || u.l || ' arquivados (' || p.name || '): ' || p_reason,
      jsonb_build_object('particao', p.name, 'primeiro_seq', u.f, 'ultimo_seq', u.l,
        'hash_final', (select encode(hash, 'hex') from ptw.audit_event where unit_id = u.unit_id and seq = u.l),
        'manifesto_sha256', encode(ex.manifest_sha256, 'hex'), 'retencao_ate', until), u.unit_id);
    n := n + 1;
  end loop;
  if n = 0 then
    perform ptw.audit_system('sistema.particao.arquivada', 'Partição vazia arquivada: ' || p.name,
                             jsonb_build_object('particao', p.name, 'retencao_ate', until));
  end if;
  update ptw.audit_partition set state = 'arquivada' where rel = p.rel;
  perform set_config('ptw.ddl_quiet', 'on', true);
  execute format('alter table ptw.audit_event detach partition ptw.%I', p.name);
  execute format('drop table ptw.%I', p.name);
  perform set_config('ptw.ddl_quiet', '', true);
  return n;
end $$;

-- ---------- Verificação ----------
-- Primeiro seq com problema (hash alterado, elo quebrado ou lacuna); nulo = íntegra. Começa do
-- último marcador de arquivamento, se houver.
create function ptw.audit_verify(p_unit uuid) returns bigint
  language sql stable as $$
  with base as (
    select coalesce(max(last_seq), 0) s,
           coalesce((array_agg(last_hash order by last_seq desc))[1],
                    '\x0000000000000000000000000000000000000000000000000000000000000000'::bytea) h
      from ptw.audit_archive where unit_id = p_unit)
  select seq from (
    select e.seq, e.hash, e.prev_hash, ptw.audit_event_hash(e) as calc,
           lag(e.hash) over w as lh, lag(e.seq) over w as ls
      from ptw.audit_event e where e.unit_id = p_unit
    window w as (order by e.seq)) x, base
   where calc <> hash or prev_hash <> coalesce(lh, base.h) or seq <> coalesce(ls, base.s) + 1
   order by seq limit 1
$$;

-- Relatório completo para o dono e o script de âncora: cadeia, cauda apagada e âncoras.
create function ptw.audit_check(p_unit uuid) returns table (problema text, seq bigint, detalhe text)
  language plpgsql stable security definer set search_path = ptw, pg_catalog as $$
declare s bigint; head bigint; top bigint; base bigint;
begin
  s := ptw.audit_verify(p_unit);
  if s is not null then return query select 'cadeia'::text, s, 'hash, elo ou sequência não confere'::text; end if;
  select last_seq into head from ptw.audit_head where unit_id = p_unit;
  select max(e.seq) into top from ptw.audit_event e where e.unit_id = p_unit;
  if coalesce(head, 0) <> coalesce(top, head, 0) then
    return query select 'cauda'::text, coalesce(top, 0) + 1, format('ponta em %s, último evento %s', head, top);
  end if;
  select coalesce(max(last_seq), 0) into base from ptw.audit_archive where unit_id = p_unit;
  return query
    select 'ancora'::text, a.seq, 'âncora de ' || to_char(a.day, 'DD/MM/YYYY') || ' não confere'
      from ptw.audit_anchor a left join ptw.audit_event e on e.unit_id = a.unit_id and e.seq = a.seq
     where a.unit_id = p_unit and a.seq > base and e.hash is distinct from a.hash
     order by a.seq limit 1;
end $$;

-- Faixa contínua de seq que cobre o período [de, até).
create function ptw.audit_seq_range(p_unit uuid, p_from timestamptz, p_to timestamptz)
  returns table (first_seq bigint, last_seq bigint, events bigint, prev_hash text, last_hash text)
  language sql stable as $$
  with r as (select min(seq) f, max(seq) l from ptw.audit_event where unit_id = p_unit and at >= p_from and at < p_to)
  select r.f, r.l, r.l - r.f + 1,
         (select encode(prev_hash, 'hex') from ptw.audit_event where unit_id = p_unit and seq = r.f),
         (select encode(hash, 'hex') from ptw.audit_event where unit_id = p_unit and seq = r.l)
    from r where r.f is not null
$$;

-- Uma linha JSON canônica por evento: as chaves do hash, mais "hash", "prev" e "quando" (ISO, UTC).
create function ptw.audit_export_lines(p_unit uuid, p_first bigint, p_last bigint) returns setof text
  language sql stable as $$
  select jsonb_build_object(
           'action', action, 'actor', actor_id, 'asset', asset_id,
           'at', (extract(epoch from at) * 1000000)::bigint, 'auth', auth, 'client', client, 'data', data,
           'entity', entity, 'entity_id', entity_id, 'ok', ok, 'permit', permit_id, 'reason', reason,
           'request', request_id, 'rev', rev, 'role', role_id, 'seq', seq, 'text', text, 'unit', unit_id, 'v', 2,
           'hash', encode(hash, 'hex'), 'prev', encode(prev_hash, 'hex'),
           'quando', to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text
    from ptw.audit_event where unit_id = p_unit and seq between p_first and p_last order by seq
$$;

-- Registra a exportação e o acesso (acesso.exportacao, com o motivo). p_manifest: o texto do
-- manifesto, guardado como veio (a API sempre manda; o script do host grava o arquivo ele mesmo).
-- p_id: id da exportação escolhido por quem chama (a API devolve os arquivos por ele).
create function ptw.audit_export_record(p_unit uuid, p_first bigint, p_last bigint, p_file_sha256 text,
                                        p_manifest_sha256 text, p_reason text, p_manifest text default null,
                                        p_id uuid default null)
  returns bigint language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare id uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Exportação exige motivo' using errcode = 'PTW14'; end if;
  if ptw.current_unit() is distinct from p_unit then
    raise exception 'Exportação de outra unidade' using errcode = 'PTW14';
  end if;
  if p_manifest is not null and encode(sha256(convert_to(p_manifest, 'UTF8')), 'hex') is distinct from lower(p_manifest_sha256) then
    raise exception 'O manifesto não confere com o SHA-256 informado' using errcode = 'PTW14';
  end if;
  insert into ptw.audit_export (unit_id, id, first_seq, last_seq, file_sha256, manifest_sha256, reason, actor_id, manifest)
  values (p_unit, coalesce(p_id, uuidv7()), p_first, p_last, decode(p_file_sha256, 'hex'), decode(p_manifest_sha256, 'hex'), p_reason,
          ptw.current_person(), p_manifest)
  returning audit_export.id into id;
  return ptw.audit_access('acesso.exportacao', null, null, p_reason,
    jsonb_build_object('exportacao', id, 'primeiro_seq', p_first, 'ultimo_seq', p_last,
                       'arquivo_sha256', p_file_sha256, 'manifesto_sha256', p_manifest_sha256));
end $$;

-- ---------- Esquema criado ----------
-- Uma linha, gravada uma vez ao criar o banco (db/init.sh): o SHA-256 de cada arquivo de
-- db/schema. Identifica exatamente o esquema em uso; não muda (o banco é recriado do zero).
create table ptw.schema_info (
  singleton  boolean primary key default true check (singleton),
  files      jsonb not null check (jsonb_typeof(files) = 'object'),
  created_at timestamptz not null default now()
);
create trigger schema_info_frozen before update or delete on ptw.schema_info
  for each row execute function ptw.forbid_change();
alter table ptw.schema_info enable always trigger schema_info_frozen;

create function ptw.schema_record(p_files jsonb) returns void
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  if jsonb_typeof(p_files) is distinct from 'object' or p_files = '{}'
     or exists (select 1 from jsonb_each_text(p_files) f where f.key !~ '^[0-9]{2}_[a-z0-9_]+\.sql$' or f.value !~ '^[0-9a-f]{64}$') then
    raise exception 'Esquema: arquivos e SHA-256 obrigatórios' using errcode = 'PTW14';
  end if;
  if exists (select 1 from ptw.schema_info) then
    raise exception 'O esquema já foi registrado; recrie o banco do zero' using errcode = 'PTW01';
  end if;
  insert into ptw.schema_info (files) values (p_files);
end $$;

-- ---------- Visões da tela de auditoria (obedecem ao RLS de quem consulta) ----------
create view ptw.v_audit with (security_invoker = true) as
select e.unit_id, e.seq, e.at, e.ok, e.action, e.text, e.reason,
       e.actor_id, pe.name as actor_name, e.role_id, r.label as role_label, e.auth, e.client, e.request_id,
       e.permit_id, p.number as permit_number, e.rev, e.asset_id, a.code as asset_code,
       e.entity, e.entity_id, e.data, encode(e.hash, 'hex') as hash, encode(e.prev_hash, 'hex') as prev_hash
  from ptw.audit_event e
  left join ptw.person pe on pe.unit_id = e.unit_id and pe.id = e.actor_id
  left join ptw.type_def r on r.unit_id = e.unit_id and r.id = e.role_id
  left join ptw.permit p on p.unit_id = e.unit_id and p.id = e.permit_id
  left join ptw.asset a on a.unit_id = e.unit_id and a.id = e.asset_id;

-- Histórico da PT: o que mudou a PT, sem as leituras.
create view ptw.v_permit_history with (security_invoker = true) as
select e.unit_id, e.permit_id, e.seq, e.at, e.ok, e.action, e.text, e.rev, e.actor_id, pe.name as actor_name, e.data
  from ptw.audit_event e
  left join ptw.person pe on pe.unit_id = e.unit_id and pe.id = e.actor_id
 where e.permit_id is not null and left(e.action, 7) <> 'acesso.';

-- ---------- Partições iniciais ----------
create table ptw.audit_event_default partition of ptw.audit_event default;
select ptw.audit_partition_sync();
-- Mês anterior, atual e o próximo; a manutenção diária cria os seguintes (poucas partições = plano rápido).
select ptw.audit_partitions((now() - interval '1 month')::date, 3);

-- ---------- Proteção da trilha contra DDL ----------
-- Nomes de gatilho protegidos: não podem ser desligados nem apagados.
create function ptw.audit_protected_trigger(n text) returns boolean
  language sql immutable parallel safe
  return n in ('audit_row', 'audit_chain', 'audit_frozen', 'audit_no_truncate', 'audit_head_flush', 'signature_audit',
               'audit_anchor_frozen', 'audit_export_frozen', 'audit_archive_frozen', 'schema_info_frozen');

-- Fim de todo comando DDL: guarda a trilha e registra o comando (sistema.ddl), inclusive GRANT.
create function ptw.audit_ddl_end() returns event_trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare cmd record; bad text;
begin
  if to_regclass('ptw.audit_event') is null then return; end if;
  perform ptw.audit_partition_sync();
  select p.name into bad from ptw.audit_partition p
   where p.state = 'ativa'
     and not exists (select 1 from pg_inherits i where i.inhrelid = p.rel and i.inhparent = 'ptw.audit_event'::regclass)
   limit 1;
  if found then
    raise exception 'A partição de auditoria % só sai por ptw.audit_archive', bad using errcode = 'PTW13';
  end if;
  select t.tgrelid::regclass::text || '.' || t.tgname into bad
    from pg_trigger t join pg_class r on r.oid = t.tgrelid join pg_namespace s on s.oid = r.relnamespace
   where s.nspname = 'ptw' and ptw.audit_protected_trigger(t.tgname) and t.tgenabled = 'D' limit 1;
  if found then
    raise exception 'O gatilho de auditoria % não pode ser desligado', bad using errcode = 'PTW13';
  end if;
  if ptw.ctx('ddl_quiet') is null then
    for cmd in select * from pg_event_trigger_ddl_commands()
              where not in_extension and coalesce(schema_name, '') !~ '^pg_temp' loop
      perform ptw.audit_system('sistema.ddl', cmd.command_tag || coalesce(' ' || cmd.object_identity, ''),
        jsonb_strip_nulls(jsonb_build_object('comando', cmd.command_tag, 'tipo', cmd.object_type, 'objeto', cmd.object_identity)));
    end loop;
  end if;
end $$;

-- Remoções: nenhuma tabela da trilha, partição ativa ou gatilho protegido sai.
create function ptw.audit_sql_drop() returns event_trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare o record;
begin
  for o in select * from pg_event_trigger_dropped_objects() loop
    if o.object_type = 'table' and o.schema_name = 'ptw'
       and (o.object_name in ('audit_event', 'audit_head', 'audit_anchor', 'audit_export', 'audit_archive',
                              'audit_partition', 'schema_info', 'retention_class')
            or exists (select 1 from ptw.audit_partition p where p.rel = o.objid and p.state = 'ativa')) then
      raise exception 'A tabela de auditoria % não pode ser apagada', o.object_identity using errcode = 'PTW13';
    end if;
    if o.object_type = 'trigger' and o.schema_name = 'ptw'
       and ptw.audit_protected_trigger(split_part(o.object_identity, ' ', 1))
       and not exists (select 1 from pg_event_trigger_dropped_objects() t
                        where t.object_type = 'table' and t.object_identity = substring(o.object_identity from ' on (.*)$'))
       and not exists (select 1 from ptw.audit_partition p
                        where p.state = 'arquivada' and 'ptw.' || p.name = substring(o.object_identity from ' on (.*)$')) then
      raise exception 'O gatilho de auditoria % não pode ser apagado', o.object_identity using errcode = 'PTW13';
    end if;
  end loop;
  if ptw.ctx('ddl_quiet') is null then
    for o in select * from pg_event_trigger_dropped_objects() where original and not is_temporary loop
      perform ptw.audit_system('sistema.ddl', 'DROP ' || o.object_type || ' ' || o.object_identity,
        jsonb_build_object('comando', 'DROP', 'tipo', o.object_type, 'objeto', o.object_identity));
    end loop;
  end if;
end $$;

create event trigger audit_ddl_end on ddl_command_end execute function ptw.audit_ddl_end();
create event trigger audit_sql_drop on sql_drop execute function ptw.audit_sql_drop();
alter event trigger audit_ddl_end enable always;
alter event trigger audit_sql_drop enable always;
