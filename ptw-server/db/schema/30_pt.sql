-- PT: permissão, número, ativos (com a trava de equipamento), equipe, respostas, arquivos,
-- revisões, assinaturas e as operações do ciclo de vida. As regras de segurança ficam aqui, na
-- raiz: nenhum caminho da API consegue furá-las.
set search_path = ptw, public;

-- ---------- Regras puras ----------
-- Estados que prendem o equipamento: todos menos rascunho (ainda não enviada), encerrada e
-- cancelada. Expirada prende: a área precisa ser devolvida (Entrega e Aceite da área).
create function ptw.state_holds(s ptw.permit_state) returns boolean
  language sql immutable parallel safe
  return s not in ('rascunho', 'encerrada', 'cancelada');

-- Máquina de estados. Não existe ativa → cancelada.
create function ptw.can_move(f ptw.permit_state, t ptw.permit_state) returns boolean
  language sql immutable parallel safe
  return case f
    when 'rascunho'   then t in ('em_analise', 'cancelada')
    when 'em_analise' then t in ('emitida', 'devolvida', 'cancelada')
    when 'devolvida'  then t in ('em_analise', 'cancelada')
    when 'emitida'    then t in ('ativa', 'em_analise', 'cancelada', 'expirada')
    when 'ativa'      then t in ('suspensa', 'entregue', 'expirada')
    when 'suspensa'   then t in ('ativa', 'entregue', 'expirada')
    when 'entregue'   then t in ('encerrada')
    when 'expirada'   then t in ('entregue')
    else false end;

create function ptw.state_label(s ptw.permit_state) returns text
  language sql immutable parallel safe
  return case s
    when 'rascunho' then 'Rascunho' when 'em_analise' then 'Em análise' when 'devolvida' then 'Devolvida'
    when 'emitida' then 'Emitida' when 'ativa' then 'Ativa' when 'suspensa' then 'Suspensa'
    when 'entregue' then 'Entregue' when 'encerrada' then 'Encerrada' when 'cancelada' then 'Cancelada'
    when 'expirada' then 'Expirada' end;

-- ---------- Número da PT: sequência sem lacunas por unidade e ano ----------
create table ptw.permit_counter (
  unit_id uuid not null references ptw.unit,
  year    smallint not null check (year between 2000 and 2999),
  last    integer not null check (last > 0),
  primary key (unit_id, year)
);

-- PT-<unidade sem hífen>-<ano>-<00001>. O contador é linha travada até o commit: uma recusa
-- desfaz o incremento e não deixa lacuna.
create function ptw.next_permit_number(p_unit uuid) returns text
  language plpgsql as $$
declare u ptw.unit; y smallint; n integer;
begin
  select * into strict u from ptw.unit where id = p_unit;
  y := extract(year from now() at time zone u.timezone);
  insert into ptw.permit_counter values (p_unit, y, 1)
  on conflict (unit_id, year) do update set last = ptw.permit_counter.last + 1
  returning last into n;
  return format('PT-%s-%s-%s', replace(u.code, '-', ''), y, lpad(n::text, 5, '0'));
end $$;

-- ---------- PT ----------
create table ptw.permit (
  unit_id         uuid not null references ptw.unit,
  id              uuid not null default uuidv7(),
  number          text,
  template_id     uuid not null,
  version_id      uuid not null,
  state           ptw.permit_state not null default 'rascunho',
  holds           boolean generated always as (ptw.state_holds(state)) stored,
  author_id       uuid not null,
  location_id     uuid not null,
  work_window     tstzrange not null check (not isempty(work_window) and not lower_inf(work_window) and not upper_inf(work_window)),
  scope           text not null check (length(scope) between 1 and 500),
  -- Busca do Quadro: número e escopo, minúsculo e sem acento (índice trigram).
  search          text generated always as (ptw.search_text(number, scope)) stored,
  -- Formulário congelado no primeiro envio.
  snapshot_sha256 bytea,
  snapshot_at     timestamptz,
  -- Revisão assinada da PT: avança a cada reenvio depois de devolvida.
  revision        integer not null default 1 check (revision > 0),
  state_note      text check (length(state_note) <= 500),
  -- Parada ("Parar") e retomada: os três campos juntos.
  hold_reason     text check (length(hold_reason) between 1 and 500),
  hold_by         uuid,
  hold_at         timestamptz,
  resumed_reason  text check (length(resumed_reason) between 1 and 500),
  resumed_by      uuid,
  resumed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Última mudança da PT ou de um filho (assinatura, resposta, anexo, ativo, equipe, revisão,
  -- prorrogação): o "mexida desde" da Minha área (updatedSince). Controle, fora do diff da trilha.
  changed_at      timestamptz not null default now(),
  -- Concorrência otimista da API (a "revision" acima é outra coisa).
  row_version     integer not null default 1,
  primary key (unit_id, id),
  foreign key (unit_id, version_id, template_id) references ptw.template_version (unit_id, id, template_id),
  foreign key (unit_id, author_id) references ptw.person (unit_id, id),
  foreign key (unit_id, location_id) references ptw.location (unit_id, id),
  foreign key (unit_id, snapshot_sha256) references ptw.form_snapshot (unit_id, sha256),
  foreign key (unit_id, hold_by) references ptw.person (unit_id, id),
  foreign key (unit_id, resumed_by) references ptw.person (unit_id, id),
  check (number is not null or state in ('rascunho', 'cancelada')),
  check ((number is null) = (snapshot_sha256 is null)),
  check ((snapshot_sha256 is null) = (snapshot_at is null)),
  check ((hold_reason is null) = (hold_by is null) and (hold_by is null) = (hold_at is null)),
  check ((resumed_reason is null) = (resumed_by is null) and (resumed_by is null) = (resumed_at is null))
) with (fillfactor = 85);   -- espaço para atualizações HOT (o estado muda várias vezes)

create unique index permit_number_uq on ptw.permit (unit_id, number) where number is not null;
-- Quadro: por estado e início da janela.
create index permit_board_ix on ptw.permit (unit_id, state, lower(work_window) desc);
-- Minha área: só as PTs abertas (índice pequeno e quente; a junção com a equipe não lê a tabela).
create index permit_open_ix on ptw.permit (unit_id, id) where holds;
create index permit_author_ix on ptw.permit (unit_id, author_id, created_at desc);
create index permit_location_ix on ptw.permit (unit_id, location_id);
create index permit_changed_ix on ptw.permit (unit_id, changed_at);
create index permit_search_trgm on ptw.permit using gin (search gin_trgm_ops);
-- Expiração: janelas vencidas ainda em execução.
create index permit_due_ix on ptw.permit (unit_id, upper(work_window)) where state in ('emitida', 'ativa', 'suspensa');

-- PT nasce rascunho, sem número, na versão em uso do modelo. O solicitante é a pessoa da sessão
-- (o que o cliente mandar é ignorado); sem pessoa na sessão (carga pelo dono), vale o informado.
create function ptw.permit_before_insert() returns trigger language plpgsql as $$
begin
  new.author_id := coalesce(ptw.current_person(), new.author_id);
  if new.state <> 'rascunho' or new.number is not null then
    raise exception 'Uma PT nasce como rascunho' using errcode = 'PTW04';
  end if;
  if not exists (select 1 from ptw.template_version
                 where unit_id = new.unit_id and id = new.version_id and status = 'ativa') then
    raise exception 'A PT só pode usar a versão em uso do modelo' using errcode = 'PTW04';
  end if;
  return new;
end $$;
create trigger permit_ins before insert on ptw.permit
  for each row execute function ptw.permit_before_insert();

-- O rascunho é de quem o criou: só o solicitante (a pessoa da sessão) altera o próprio rascunho —
-- campos, ativos, equipe, respostas e anexos (PTW17). Sem pessoa na sessão, só o superusuário (o
-- dono, em carga ou manutenção).
create function ptw.draft_owner_check(p_state ptw.permit_state, p_author uuid) returns void
  language plpgsql stable as $$
declare me uuid := ptw.current_person();
begin
  if p_state = 'rascunho' and me is distinct from p_author
     and not (me is null and coalesce((select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user), false)) then
    raise exception 'Só o solicitante altera o rascunho' using errcode = 'PTW17';
  end if;
end $$;

-- Prazo máximo da janela (template_version.max_window), como frase: "3 dias", "12 horas".
create function ptw.window_label(i interval) returns text
  language sql immutable parallel safe
  return case when extract(epoch from i)::numeric % 86400 = 0
              then (extract(epoch from i)::numeric / 86400)::bigint || case when i = interval '1 day' then ' dia' else ' dias' end
              else replace(trim_scale(round(extract(epoch from i)::numeric / 3600, 1))::text, '.', ',') || case when i = interval '1 hour' then ' hora' else ' horas' end end;

-- A janela cabe no prazo máximo da versão (fim − início ≤ max_window; nulo = sem limite) (PTW31).
create function ptw.window_check(p_unit uuid, p_version uuid, w tstzrange) returns void
  language plpgsql stable as $$
declare mx interval;
begin
  select max_window into mx from ptw.template_version where unit_id = p_unit and id = p_version;
  if mx is not null and upper(w) - lower(w) > mx then
    raise exception 'A janela passa do prazo máximo deste modelo (até %)', ptw.window_label(mx) using errcode = 'PTW31';
  end if;
end $$;

-- Estado só pela máquina; número e revisão não voltam; o solicitante não muda. A janela respeita o prazo máximo do modelo
-- ao enviar, ao emitir e sempre que muda depois do rascunho (PTW31); da emitida em diante ela só
-- muda por Prorrogar (permit_extend: o fim avança e há a linha de permit_extension desta
-- transação; PTW05).
create function ptw.permit_before_update() returns trigger language plpgsql as $$
begin
  -- Só changed_at (um filho mudou: permit_touch): controle, sem regra, sem nova row_version.
  if new.changed_at is distinct from old.changed_at
     and (to_jsonb(new) - array['changed_at', 'holds', 'search']) = (to_jsonb(old) - array['changed_at', 'holds', 'search']) then
    return new;
  end if;
  perform ptw.draft_owner_check(old.state, old.author_id);
  if new.state <> old.state and not ptw.can_move(old.state, new.state)
     and not (new.state = 'suspensa' and exists (select 1 from ptw.permit_revalidation r
       where r.unit_id = new.unit_id and r.permit_id = new.id and r.at = now() and r.old_window = old.work_window and r.new_window = new.work_window)) then
    raise exception 'Mudança de estado não permitida: % → %', ptw.state_label(old.state), ptw.state_label(new.state)
      using errcode = 'PTW05';
  end if;
  if new.work_window is distinct from old.work_window and old.state not in ('rascunho', 'devolvida', 'em_analise')
     and not exists (select 1 from ptw.permit_revalidation r where r.unit_id = new.unit_id and r.permit_id = new.id
       and r.at = now() and r.old_window = old.work_window and r.new_window = new.work_window)
     and (lower(new.work_window) <> lower(old.work_window)
          or not exists (select 1 from ptw.permit_extension e
                          where e.unit_id = new.unit_id and e.permit_id = new.id and e.at = now()
                            and e.old_end = upper(old.work_window) and e.new_end = upper(new.work_window))) then
    raise exception 'A janela da PT % só muda por Prorrogar', ptw.state_label(old.state) using errcode = 'PTW05';
  end if;
  if (new.state <> old.state and new.state in ('em_analise', 'emitida'))
     or (new.work_window is distinct from old.work_window and old.state not in ('rascunho', 'devolvida')) then
    perform ptw.window_check(new.unit_id, new.version_id, new.work_window);
    perform ptw.electrical_window_check(new.unit_id, new.id, new.work_window);
  end if;
  -- A versão decide a trava de equipamento (holds_equipment): depois do rascunho ela não muda.
  if old.state <> 'rascunho' and (new.version_id, new.template_id) is distinct from (old.version_id, old.template_id) then
    raise exception 'A versão do modelo da PT só muda no rascunho' using errcode = 'PTW05';
  end if;
  if old.number is not null and new.number is distinct from old.number then
    raise exception 'O número da PT não muda' using errcode = 'PTW05';
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'O solicitante da PT não muda' using errcode = 'PTW05';
  end if;
  if new.revision < old.revision then
    raise exception 'A revisão da PT só avança' using errcode = 'PTW05';
  end if;
  new.updated_at  := now();
  new.changed_at  := now();
  new.row_version := old.row_version + 1;
  return new;
end $$;
create trigger permit_upd before update on ptw.permit
  for each row execute function ptw.permit_before_update();

-- Prorrogação da janela: uma linha por prorrogação, somente inclusão. O gatilho confere tudo e
-- preenche o fim anterior, a revisão, a pessoa (a da sessão) e a hora; permit_extend grava a linha e
-- avança o fim da janela. O evento é pt.prorrogada (50_auditoria), sem evento próprio da linha.
create table ptw.permit_extension (
  unit_id   uuid not null,
  id        uuid not null default uuidv7(),
  permit_id uuid not null,
  revision  integer not null check (revision > 0),
  old_end   timestamptz not null,
  new_end   timestamptz not null,
  reason    text not null check (length(reason) between 1 and 500),
  person_id uuid not null,
  at        timestamptz not null default now(),
  primary key (unit_id, id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id),
  check (new_end > old_end)
);
create index permit_extension_permit_ix on ptw.permit_extension (unit_id, permit_id, at);
create trigger permit_extension_frozen before update or delete on ptw.permit_extension
  for each row execute function ptw.forbid_change();

-- "Trabalho liberado" agora: ativa, sem parada e dentro da janela.
create function ptw.work_released(p ptw.permit) returns boolean
  language sql stable parallel safe
  return p.state = 'ativa' and p.hold_reason is null and p.work_window @> now();

-- ---------- Ativos da PT e trava de equipamento ----------
-- Invariante: um equipamento tem no máximo uma PT aberta, contando "parte de" em qualquer nível
-- e nas duas direções. Duas defesas:
--   1. índice único parcial: mesmo ativo, duas PTs abertas = impossível, até sob corrida;
--   2. gatilho: ancestral/descendente, com bloqueio ordenado das linhas de ativo envolvidas, para
--      duas transações concorrentes (gaveta x painel) se enfileirarem em vez de passarem juntas.
-- A trava só vale para PTs cuja versão do modelo prende o equipamento (template_version.holds_equipment);
-- as outras (ex.: desabilitação de intertravamento) convivem com qualquer PT no mesmo ativo.
-- holds = a PT está num estado que prende E a versão prende (mantido pelos gatilhos), para caber
-- no índice único: uma PT que não prende nunca marca holds e por isso nem colide nem é barrada.
create table ptw.permit_asset (
  unit_id   uuid not null,
  permit_id uuid not null,
  asset_id  uuid not null,
  holds     boolean not null default false,
  primary key (unit_id, permit_id, asset_id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id) on delete cascade,
  foreign key (unit_id, asset_id) references ptw.asset (unit_id, id)
);
create unique index permit_asset_hold_uq on ptw.permit_asset (unit_id, asset_id) where holds;
create index permit_asset_asset_ix on ptw.permit_asset (unit_id, asset_id);

-- A versão do modelo prende o equipamento? (Versão ativa ou arquivada não muda: version_guard.)
create function ptw.version_holds(p_unit uuid, p_version uuid) returns boolean
  language sql stable parallel safe
  return coalesce((select holds_equipment from ptw.template_version where unit_id = p_unit and id = p_version), true);

-- Tudo com que o ativo colide: ele, seus ancestrais e seus descendentes em "parte de".
create function ptw.asset_collision_set(p_unit uuid, p_asset uuid) returns setof uuid
  language sql stable parallel safe as $$
  select ancestor_id from ptw.asset_part where unit_id = p_unit and descendant_id = p_asset
  union
  select descendant_id from ptw.asset_part where unit_id = p_unit and ancestor_id = p_asset
$$;

create function ptw.equipment_lock_check(p_unit uuid, p_permit uuid, p_asset uuid) returns void
  language plpgsql as $$
declare hit record; mine text;
begin
  -- Ordem fixa (id) evita impasse entre transações que travam conjuntos sobrepostos.
  perform 1 from ptw.asset
   where unit_id = p_unit and id in (select ptw.asset_collision_set(p_unit, p_asset))
   order by id for no key update;
  select p.id, p.number, p.state, a.code as held_code into hit
    from ptw.permit_asset pa
    join ptw.permit p on p.unit_id = pa.unit_id and p.id = pa.permit_id
    join ptw.asset  a on a.unit_id = pa.unit_id and a.id = pa.asset_id
   where pa.unit_id = p_unit and pa.holds and pa.permit_id <> p_permit
     and pa.asset_id in (select ptw.asset_collision_set(p_unit, p_asset))
   limit 1;
  if found then
    select code into mine from ptw.asset where unit_id = p_unit and id = p_asset;
    raise exception '% já tem a % aberta (%) em %', mine, hit.number, ptw.state_label(hit.state), hit.held_code
      using errcode = 'PTW10', detail = hit.id::text, hint = 'equipamento_ocupado';
  end if;
end $$;

-- Ativos só entram ou saem no rascunho ou na PT devolvida; não se alteram (remove e inclui).
create function ptw.permit_asset_before() returns trigger language plpgsql as $$
declare st ptw.permit_state; ver uuid;
begin
  if tg_op = 'UPDATE' and (new.permit_id, new.asset_id) is distinct from (old.permit_id, old.asset_id) then
    raise exception 'Remova e inclua o ativo em vez de alterar' using errcode = 'PTW04';
  end if;
  select state, version_id into st, ver from ptw.permit where unit_id = new.unit_id and id = new.permit_id;
  if tg_op = 'INSERT' then
    if st not in ('rascunho', 'devolvida') then
      raise exception 'Os ativos só mudam no rascunho ou na PT devolvida' using errcode = 'PTW04';
    end if;
    new.holds := ptw.state_holds(st) and ptw.version_holds(new.unit_id, ver);
  end if;
  if new.holds then
    perform ptw.equipment_lock_check(new.unit_id, new.permit_id, new.asset_id);
  end if;
  return new;
end $$;
create trigger permit_asset_bi before insert or update on ptw.permit_asset
  for each row execute function ptw.permit_asset_before();

create function ptw.permit_asset_before_delete() returns trigger language plpgsql as $$
declare st ptw.permit_state;
begin
  select state into st from ptw.permit where unit_id = old.unit_id and id = old.permit_id;
  if st not in ('rascunho', 'devolvida') then
    raise exception 'Os ativos só mudam no rascunho ou na PT devolvida' using errcode = 'PTW04';
  end if;
  return old;
end $$;
create trigger permit_asset_bd before delete on ptw.permit_asset
  for each row execute function ptw.permit_asset_before_delete();

-- Ao enviar (prende) ou encerrar/cancelar (solta), os ativos acompanham o estado, se a versão do
-- modelo prende o equipamento. Antes de marcar, trava de uma vez todos os ativos envolvidos, em ordem.
create function ptw.permit_holds_sync() returns trigger language plpgsql as $$
declare h boolean := new.holds and ptw.version_holds(new.unit_id, new.version_id);
begin
  if h then
    perform 1 from ptw.asset
     where unit_id = new.unit_id and id in (
       select c from ptw.permit_asset pa, ptw.asset_collision_set(pa.unit_id, pa.asset_id) c
        where pa.unit_id = new.unit_id and pa.permit_id = new.id)
     order by id for no key update;
  end if;
  update ptw.permit_asset set holds = h
   where unit_id = new.unit_id and permit_id = new.id and holds <> h;
  return null;
end $$;
create trigger permit_holds after update of state on ptw.permit
  for each row when (old.holds is distinct from new.holds) execute function ptw.permit_holds_sync();

-- ---------- Equipe ----------
create table ptw.permit_team (
  unit_id   uuid not null,
  permit_id uuid not null,
  role_id   uuid not null,
  role_fam  ptw.type_family not null default 'cargo' check (role_fam = 'cargo'),
  person_id uuid not null,
  primary key (unit_id, permit_id, role_id, person_id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id) on delete cascade,
  foreign key (unit_id, role_id, role_fam) references ptw.type_def (unit_id, id, family),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id)
);
create index permit_team_person_ix on ptw.permit_team (unit_id, person_id);

-- ---------- Respostas do formulário: uma linha por item ----------
-- Gravar um item não reescreve o formulário inteiro e não disputa com quem preenche outro item.
-- value tem a forma da resposta do tipo do item (40_formulario confere; PTW15).
create table ptw.permit_answer (
  unit_id     uuid not null,
  permit_id   uuid not null,
  item_id     text not null check (length(item_id) between 1 and 64),
  value       jsonb not null check (jsonb_typeof(value -> 't') = 'string'),
  -- Valor numérico extraído para consulta e relatório (ex.: O₂ medido nas PTs do mês).
  num         numeric generated always as (case when value ->> 't' = 'numero' then (value ->> 'v')::numeric end) stored,
  answered_by uuid not null,
  answered_at timestamptz not null default now(),
  primary key (unit_id, permit_id, item_id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id) on delete cascade,
  foreign key (unit_id, answered_by) references ptw.person (unit_id, id)
);

-- ---------- Arquivos (foto, vídeo, arquivo) ----------
-- O conteúdo fica no S3, endereçado pelo SHA-256: chave "<unit_id>/<aa>/<sha256>". O banco guarda
-- só os metadados. Blob e anexo são somente inclusão.
create table ptw.blob (
  unit_id    uuid not null references ptw.unit,
  sha256     bytea not null check (length(sha256) = 32),
  size       bigint not null check (size between 1 and 2147483648),
  mime       text not null check (mime ~ '^(image|video|application|text)/[a-z0-9.+-]{1,100}$'),
  object_key text generated always as (
               unit_id::text || '/' || left(encode(sha256, 'hex'), 2) || '/' || encode(sha256, 'hex')) stored,
  stored_at  timestamptz not null default now(),
  primary key (unit_id, sha256)
);
create trigger blob_frozen before update or delete on ptw.blob
  for each row execute function ptw.forbid_change();

create table ptw.attachment (
  unit_id        uuid not null,
  id             uuid not null default uuidv7(),
  permit_id      uuid not null,
  item_id        text not null check (length(item_id) between 1 and 64),
  kind           ptw.attach_kind not null,
  sha256         bytea not null,
  file_name      text not null check (length(file_name) between 1 and 255),
  -- Miniatura (foto) ou quadro de capa (vídeo), gerados no aparelho e gravados como outro blob.
  preview_sha256 bytea,
  width          integer check (width > 0),
  height         integer check (height > 0),
  duration_ms    integer check (duration_ms >= 0),
  captured_by    uuid not null,
  captured_at    timestamptz not null default now(),
  primary key (unit_id, id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id),
  foreign key (unit_id, sha256) references ptw.blob (unit_id, sha256),
  foreign key (unit_id, preview_sha256) references ptw.blob (unit_id, sha256),
  foreign key (unit_id, captured_by) references ptw.person (unit_id, id)
);
create index attachment_permit_ix on ptw.attachment (unit_id, permit_id, item_id);
create trigger attachment_frozen before update or delete on ptw.attachment
  for each row execute function ptw.forbid_change();
-- Quem capturou é a pessoa da sessão, na hora do servidor (o que o cliente mandar é ignorado).
create function ptw.attachment_before_insert() returns trigger language plpgsql as $$
begin
  new.captured_by := coalesce(ptw.current_person(), new.captured_by);
  new.captured_at := now();
  return new;
end $$;
create trigger attachment_bi before insert on ptw.attachment
  for each row execute function ptw.attachment_before_insert();

-- ---------- Revisões e assinaturas ----------
-- Revisão da PT: o SHA-256 do conteúdo (permit_content_sha256) no momento em que foi aberta.
create table ptw.permit_revision (
  unit_id   uuid not null,
  permit_id uuid not null,
  rev       integer not null check (rev > 0),
  at        timestamptz not null default now(),
  reason    text not null check (length(reason) between 1 and 500),
  sha256    bytea not null check (length(sha256) = 32),
  primary key (unit_id, permit_id, rev),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id)
);
create trigger permit_revision_frozen before update or delete on ptw.permit_revision
  for each row execute function ptw.forbid_change();

-- Assinatura não muda nem some; só pode ser anulada, uma vez (reenvio, Retomada), e continua no
-- histórico.
create table ptw.signature (
  unit_id       uuid not null,
  id            uuid not null default uuidv7(),
  permit_id     uuid not null,
  rev           integer not null check (rev > 0),
  slot_id       uuid not null,
  person_id     uuid not null,
  signed_at     timestamptz not null default now(),
  voided_at     timestamptz,
  voided_reason text check (length(voided_reason) between 1 and 500),
  primary key (unit_id, id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id),
  foreign key (unit_id, slot_id) references ptw.sign_slot (unit_id, id),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id),
  check ((voided_at is null) = (voided_reason is null))
);
-- Uma assinatura válida por pessoa, assinatura do modelo e revisão; também serve à leitura por PT.
create unique index signature_live_uq on ptw.signature (unit_id, permit_id, rev, slot_id, person_id) where voided_at is null;
create index signature_person_ix on ptw.signature (unit_id, person_id, signed_at desc);

-- Etapa em curso da PT (nula = todas concluídas), como o trilho do app: a primeira etapa, em ordem,
-- com uma assinatura que conta (slot_required) e ainda não tem "min" assinaturas válidas na revisão
-- atual. A área sempre é devolvida: expirada ou suspensa sem Retomada pulam para a Entrega; entregue,
-- para o Aceite da área (o que ficou para trás sem assinar não é mais "a etapa atual").
create function ptw.permit_current_stage(p_unit uuid, p_permit uuid) returns uuid
  language plpgsql stable as $$
declare pm record; answers jsonb; anchor smallint; st record;
begin
  select state, revision, version_id, resumed_at into pm from ptw.permit where unit_id = p_unit and id = p_permit;
  select coalesce(jsonb_object_agg(item_id, value), '{}') into answers
    from ptw.permit_answer where unit_id = p_unit and permit_id = p_permit;
  select s.position into anchor from ptw.stage s
   where s.unit_id = p_unit and s.version_id = pm.version_id
     and s.kind = case when pm.state = 'expirada' or (pm.state = 'suspensa' and pm.resumed_at is null) then 'entrega'::ptw.stage_kind
                       when pm.state = 'entregue' then 'aceite_area'::ptw.stage_kind end;
  for st in select s.id, s.position from ptw.stage s where s.unit_id = p_unit and s.version_id = pm.version_id order by s.position loop
    continue when anchor is not null and st.position < anchor;
    if exists (select 1 from ptw.sign_slot sl
                where sl.unit_id = p_unit and sl.stage_id = st.id and ptw.slot_required(sl, answers)
                  and (select count(*) from ptw.signature g
                        where g.unit_id = p_unit and g.permit_id = p_permit and g.rev = pm.revision
                          and g.slot_id = sl.id and g.voided_at is null) < sl.min) then
      return st.id;
    end if;
  end loop;
  return null;
end $$;

-- Quem assina: na revisão atual e na versão da PT (PTW07); num estado que aceita assinatura (PTW19);
-- só na etapa em curso (PTW20); a Solicitação só pelo solicitante (PTW17); com parada registrada,
-- Aceite no campo e da área esperam a Retomada (PTW21); quem retomou não faz o novo Aceite no campo
-- (PTW22); Aceite no campo só dentro da janela e, depois do fim, só a devolução da área (PTW23);
-- cadastro ativo e conta com login, ativa e no prazo; o cargo da assinatura válido hoje (fuso da
-- planta) com escopo que cobre o local da PT, ou a pessoa indicada (PTW08). Separação: a mesma
-- pessoa não assina as duas pontas (PTW09). O bloqueio do formulário (PTW16) vem depois, em
-- 40_formulario.
-- Antes de tudo, a assinatura é de quem está na sessão (set_context): ninguém assina em nome de outra
-- pessoa (42501). Só o superusuário (o dono, em manutenção) grava sem essa conferência.
create function ptw.signature_before_insert() returns trigger language plpgsql as $$
declare p record; sl record; who record; why text; cur uuid; k ptw.stage_kind; stg text;
begin
  if new.person_id is distinct from ptw.current_person()
     and not coalesce((select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception 'A assinatura fica em nome de quem está na sessão' using errcode = '42501';
  end if;
  new.signed_at := now(); new.voided_at := null; new.voided_reason := null;
  -- Trava a PT: serializa assinaturas da mesma PT (separação sob corrida).
  select pm.state, pm.revision, pm.version_id, pm.author_id, pm.hold_reason, pm.resumed_at, pm.resumed_by, pm.work_window,
         l.path, (now() at time zone u.timezone)::date as today, u.timezone into p
    from ptw.permit pm
    join ptw.location l on l.unit_id = pm.unit_id and l.id = pm.location_id
    join ptw.unit u on u.id = pm.unit_id
   where pm.unit_id = new.unit_id and pm.id = new.permit_id
   for no key update of pm;
  if p.state in ('encerrada', 'cancelada') then
    raise exception 'A PT está % e não aceita assinatura', ptw.state_label(p.state) using errcode = 'PTW07';
  end if;
  if new.rev <> p.revision then
    raise exception 'Assinatura na revisão %, a PT está na %', new.rev, p.revision using errcode = 'PTW07';
  end if;
  select * into sl from ptw.sign_slot where unit_id = new.unit_id and id = new.slot_id;
  if sl.version_id <> p.version_id then
    raise exception 'A assinatura não é desta versão do modelo' using errcode = 'PTW07';
  end if;
  select st.kind, st.name into k, stg from ptw.stage st where st.unit_id = new.unit_id and st.id = sl.stage_id;

  if p.state in ('rascunho', 'devolvida') then
    raise exception 'A PT está % e não aceita assinatura: envie primeiro', ptw.state_label(p.state) using errcode = 'PTW19';
  end if;
  if p.state = 'expirada' or (p.state = 'suspensa' and p.resumed_at is null) then
    if k is distinct from 'entrega' then
      if p.state = 'suspensa' and p.hold_reason is not null then
        raise exception 'A PT está Suspensa: aguarda Retomada' using errcode = 'PTW19';
      end if;
      raise exception 'A PT está %: só a Entrega da área', ptw.state_label(p.state) using errcode = 'PTW19';
    end if;
  end if;

  cur := ptw.permit_current_stage(new.unit_id, new.permit_id);
  if cur is null then
    raise exception 'Nenhuma assinatura pendente' using errcode = 'PTW20';
  end if;
  if cur <> sl.stage_id then
    raise exception 'Só a etapa atual (%) aceita assinatura', (select name from ptw.stage where unit_id = new.unit_id and id = cur)
      using errcode = 'PTW20';
  end if;
  -- "Obrigatória só quando": se a condição não vale com as respostas da PT, a assinatura não é pedida nesta PT.
  if exists (select 1 from ptw.sign_slot s
              where s.unit_id = new.unit_id and s.id = new.slot_id and s.required_when_item is not null
                and not ptw.slot_required(s, (select coalesce(jsonb_object_agg(a.item_id, a.value), '{}')
                                                from ptw.permit_answer a where a.unit_id = new.unit_id and a.permit_id = new.permit_id))) then
    raise exception 'Esta assinatura não é pedida nesta PT (%)', sl.meaning using errcode = 'PTW20';
  end if;
  if k = 'solicitacao' and new.person_id <> p.author_id then
    raise exception 'Só o solicitante assina a Solicitação' using errcode = 'PTW17';
  end if;
  if p.hold_reason is not null and k in ('aceite_campo', 'aceite_area') then
    raise exception 'Parada registrada: % aguarda Retomada', stg using errcode = 'PTW21';
  end if;
  if k = 'aceite_campo' and new.person_id = p.resumed_by then
    raise exception 'Quem registrou a Retomada não faz o novo Aceite no campo' using errcode = 'PTW22';
  end if;
  if k = 'aceite_campo' and not (now() >= lower(p.work_window) and now() <= upper(p.work_window)) then
    raise exception 'Aceite no campo só dentro da janela (% a %)',
      to_char(lower(p.work_window) at time zone p.timezone, 'DD/MM HH24:MI'),
      to_char(upper(p.work_window) at time zone p.timezone, 'DD/MM HH24:MI') using errcode = 'PTW23';
  end if;
  if now() > upper(p.work_window) and p.state <> 'entregue' and k is distinct from 'entrega' then
    raise exception 'Janela encerrada' using errcode = 'PTW23';
  end if;

  select login into who from ptw.person where unit_id = new.unit_id and id = new.person_id;
  if who.login is null then
    raise exception 'Pessoa não elegível: sem login (contato não assina)' using errcode = 'PTW08';
  end if;
  if sl.kind = 'pessoa' and new.person_id <> sl.person_id then
    raise exception 'Esta assinatura é da pessoa indicada' using errcode = 'PTW08';
  end if;
  why := ptw.person_ineligible_any(new.unit_id, new.person_id, case when sl.kind = 'cargo' then sl.role_ids end, p.today, p.path);
  if why is not null then
    raise exception 'Pessoa não elegível: %', why using errcode = 'PTW08';
  end if;

  perform 1
    from ptw.separation s
    join ptw.signature g on g.unit_id = s.unit_id and g.permit_id = new.permit_id and g.rev = new.rev
                        and g.person_id = new.person_id and g.voided_at is null
                        and g.slot_id = case when s.slot_a = new.slot_id then s.slot_b else s.slot_a end
   where s.unit_id = new.unit_id and s.version_id = p.version_id
     and (s.slot_a = new.slot_id or s.slot_b = new.slot_id);
  if found then
    raise exception 'A mesma pessoa não pode assinar as duas partes separadas' using errcode = 'PTW09';
  end if;
  -- Uma pessoa assina uma vez por etapa e revisão (qualquer assinatura da etapa).
  perform 1 from ptw.signature g join ptw.sign_slot s2 on s2.unit_id = g.unit_id and s2.id = g.slot_id
   where g.unit_id = new.unit_id and g.permit_id = new.permit_id and g.rev = new.rev and g.voided_at is null
     and g.person_id = new.person_id and s2.stage_id = sl.stage_id;
  if found then
    raise exception 'Você já assinou esta etapa (%)', stg using errcode = 'PTW30';
  end if;
  return new;
end $$;
create trigger signature_bi before insert on ptw.signature
  for each row execute function ptw.signature_before_insert();

create function ptw.signature_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or old.voided_at is not null or new.voided_at is null
     or (new.permit_id, new.rev, new.slot_id, new.person_id, new.signed_at)
        is distinct from (old.permit_id, old.rev, old.slot_id, old.person_id, old.signed_at) then
    raise exception 'Assinatura só pode ser anulada' using errcode = 'PTW01';
  end if;
  return new;
end $$;
create trigger signature_guard before update or delete on ptw.signature
  for each row execute function ptw.signature_guard();

-- ---------- Atos sobre a PT feitos por uma pessoa (a da sessão, set_context) ----------
-- Quem pode emitir: elegível (com login) para a primeira assinatura da Emissão da versão, com
-- qualquer um dos cargos dela no local da PT, ou a pessoa indicada. Motivo, ou nulo = pode.
-- Vale para Retomar (PTW26) e Prorrogar (PTW32).
create function ptw.issuer_ineligible(p_unit uuid, p_version uuid, p_location uuid, p_person uuid) returns text
  language plpgsql stable as $$
declare sl record; lg text; loc ltree; today date;
begin
  select s.kind, s.role_ids, s.person_id into sl
    from ptw.sign_slot s join ptw.stage st on st.unit_id = s.unit_id and st.id = s.stage_id
   where s.unit_id = p_unit and s.version_id = p_version and st.kind = 'emissao'
   order by s.position limit 1;
  if not found then return 'o modelo não tem assinatura de Emissão'; end if;
  if p_person is null then return 'sem pessoa na sessão'; end if;
  select pe.login into lg from ptw.person pe where pe.unit_id = p_unit and pe.id = p_person;
  if lg is null then return 'sem login'; end if;
  if sl.kind = 'pessoa' and p_person <> sl.person_id then return 'a Emissão é da pessoa indicada'; end if;
  select l.path, (now() at time zone u.timezone)::date into loc, today
    from ptw.location l join ptw.unit u on u.id = l.unit_id where l.unit_id = p_unit and l.id = p_location;
  return ptw.person_ineligible_any(p_unit, p_person, case when sl.kind = 'cargo' then sl.role_ids end, today, loc);
end $$;

-- Enviar e reenviar: só o solicitante (PTW17). Descartar o rascunho (rascunho → cancelada): só o
-- solicitante (PTW17), com o motivo em state_note (23514). Devolver: uma pessoa que não é o solicitante (PTW18)
-- e que é elegível (com login) para uma assinatura pendente da etapa em curso (PTW29).
-- Parar ("hold_*" preenchido, ou ativa → suspensa): só com a PT em campo (PTW25) e com login ativo de
-- quem está na sessão, em nome dela (PTW24). Retomar ("hold_*" limpo e/ou "resumed_*" preenchido):
-- só se há parada, por quem é elegível para a primeira assinatura da Emissão, em nome dela (PTW26).
-- Suspensa só volta a ativa depois da Retomada e com o novo Aceite no campo completo (PTW27).
create function ptw.permit_act_guard() returns trigger language plpgsql as $$
declare
  me uuid := ptw.current_person(); who record; why text; loc ltree; today date; answers jsonb;
  stop boolean := (old.hold_reason is null and new.hold_reason is not null) or (old.state = 'ativa' and new.state = 'suspensa');
  resume boolean := (old.hold_reason is not null and new.hold_reason is null) or (old.resumed_at is null and new.resumed_at is not null);
begin
  if new.state = 'em_analise' and old.state in ('rascunho', 'devolvida') and me is distinct from new.author_id then
    raise exception 'Só o solicitante envia esta PT' using errcode = 'PTW17';
  end if;
  if new.state = 'cancelada' and old.state = 'rascunho' then
    if me is distinct from new.author_id then
      raise exception 'Só o solicitante descarta o rascunho' using errcode = 'PTW17';
    end if;
    if coalesce(btrim(new.state_note), '') = '' then
      raise exception 'Diga o motivo do descarte' using errcode = '23514';
    end if;
  end if;
  if new.state = 'devolvida' and old.state = 'em_analise' then
    if me is null then raise exception 'Devolver exige uma pessoa na sessão' using errcode = 'PTW18'; end if;
    if me = new.author_id then raise exception 'O solicitante não devolve a própria PT' using errcode = 'PTW18'; end if;
    select l.path, (now() at time zone u.timezone)::date into loc, today
      from ptw.location l join ptw.unit u on u.id = l.unit_id where l.unit_id = new.unit_id and l.id = new.location_id;
    select coalesce(jsonb_object_agg(item_id, value), '{}') into answers
      from ptw.permit_answer where unit_id = new.unit_id and permit_id = new.id;
    if not exists (
        select 1 from ptw.sign_slot s join ptw.person pe on pe.unit_id = s.unit_id and pe.id = me
         where s.unit_id = new.unit_id and s.stage_id = ptw.permit_current_stage(new.unit_id, new.id)
           and ptw.slot_required(s, answers)
           and (select count(*) from ptw.signature g where g.unit_id = new.unit_id and g.permit_id = new.id
                   and g.rev = old.revision and g.slot_id = s.id and g.voided_at is null) < s.min
           and pe.login is not null and (s.kind = 'cargo' or s.person_id = me)
           and ptw.person_ineligible_any(new.unit_id, me, case when s.kind = 'cargo' then s.role_ids end, today, loc) is null) then
      raise exception 'Só quem pode assinar a etapa pendente devolve a PT' using errcode = 'PTW29';
    end if;
  end if;
  if stop or resume then
    select pe.login, pe.enabled, pe.account_expires into who from ptw.person pe where pe.unit_id = new.unit_id and pe.id = me;
  end if;
  if stop then
    if old.state not in ('emitida', 'ativa', 'suspensa', 'entregue') then
      raise exception 'A PT está %: não está em campo', ptw.state_label(old.state) using errcode = 'PTW25';
    end if;
    if me is null or who.login is null or not who.enabled or who.account_expires <= now() then
      raise exception 'Sem login ativo: pare e avise o líder' using errcode = 'PTW24';
    end if;
    if old.hold_reason is null and new.hold_reason is not null and new.hold_by is distinct from me then
      raise exception 'A parada fica em nome de quem está na sessão' using errcode = 'PTW24';
    end if;
  end if;
  if resume then
    if old.hold_reason is null and not (old.state = 'suspensa' and old.resumed_at is null)
      and not exists (select 1 from ptw.permit_revalidation r where r.unit_id = new.unit_id and r.permit_id = new.id
        and r.at = now() and r.person_id = me and r.new_window = new.work_window) then
      raise exception 'Não há parada a retomar' using errcode = 'PTW26';
    end if;
    if old.resumed_at is null and new.resumed_at is not null and new.resumed_by is distinct from me then
      raise exception 'A retomada fica em nome de quem está na sessão' using errcode = 'PTW26';
    end if;
    why := ptw.issuer_ineligible(new.unit_id, new.version_id, new.location_id, me);
    if why is not null then
      raise exception 'Só quem pode emitir a PT retoma (%)', why using errcode = 'PTW26';
    end if;
  end if;
  if old.state = 'suspensa' and new.state = 'ativa' then
    select coalesce(jsonb_object_agg(item_id, value), '{}') into answers
      from ptw.permit_answer where unit_id = new.unit_id and permit_id = new.id;
    if old.resumed_at is null or new.hold_reason is not null or exists (
        select 1 from ptw.sign_slot s join ptw.stage st on st.unit_id = s.unit_id and st.id = s.stage_id
         where s.unit_id = new.unit_id and s.version_id = new.version_id and st.kind = 'aceite_campo'
           and ptw.slot_required(s, answers)
           and (select count(*) from ptw.signature g where g.unit_id = new.unit_id and g.permit_id = new.id
                   and g.rev = new.revision and g.slot_id = s.id and g.voided_at is null) < s.min) then
      raise exception 'Suspensa só volta a Ativa depois da Retomada e do novo Aceite no campo' using errcode = 'PTW27';
    end if;
  end if;
  return new;
end $$;
create trigger permit_act before update on ptw.permit
  for each row execute function ptw.permit_act_guard();

-- A Retomada anula o aceite: retomar uma PT suspensa anula as assinaturas do Aceite no campo da
-- revisão atual (o trabalho só volta com um novo aceite, de outra pessoa: PTW22).
create function ptw.permit_resume_void() returns trigger language plpgsql as $$
begin
  update ptw.signature g set voided_at = now(), voided_reason = 'Retomada: novo Aceite no campo exigido'
    from ptw.sign_slot s join ptw.stage st on st.unit_id = s.unit_id and st.id = s.stage_id
   where g.unit_id = new.unit_id and g.permit_id = new.id and g.rev = new.revision and g.voided_at is null
     and s.unit_id = g.unit_id and s.id = g.slot_id and st.kind = 'aceite_campo';
  return null;
end $$;
create trigger permit_resume after update on ptw.permit
  for each row when (new.state = 'suspensa' and ((old.hold_reason is not null and new.hold_reason is null)
                                                 or (old.resumed_at is null and new.resumed_at is not null)))
  execute function ptw.permit_resume_void();

-- Prorrogar: PT emitida ou ativa, antes do fim da janela (PTW33); por quem pode emitir, em nome da
-- pessoa da sessão (PTW32); com justificativa e um fim depois do atual (PTW33); dentro do prazo
-- máximo do modelo, contado do início original (PTW31).
create function ptw.permit_extension_before_insert() returns trigger language plpgsql as $$
declare me uuid := ptw.current_person(); pm record; why text;
begin
  select p.state, p.revision, p.version_id, p.location_id, p.work_window into pm
    from ptw.permit p where p.unit_id = new.unit_id and p.id = new.permit_id for no key update;
  if pm.state is null or pm.state not in ('emitida', 'ativa') or now() >= upper(pm.work_window) then
    raise exception 'Só a PT emitida ou ativa, antes do fim da janela, é prorrogada' using errcode = 'PTW33';
  end if;
  why := ptw.issuer_ineligible(new.unit_id, pm.version_id, pm.location_id, me);
  if why is not null then
    raise exception 'Só quem pode emitir esta PT prorroga (%)', why using errcode = 'PTW32';
  end if;
  if new.person_id is distinct from me and new.person_id is not null then
    raise exception 'A prorrogação fica em nome de quem está na sessão' using errcode = 'PTW32';
  end if;
  if coalesce(btrim(new.reason), '') = '' or length(btrim(new.reason)) > 500
     or new.new_end is null or new.new_end <= upper(pm.work_window) then
    raise exception 'Prorrogação precisa de justificativa e de um fim depois do atual' using errcode = 'PTW33';
  end if;
  perform ptw.window_check(new.unit_id, pm.version_id, tstzrange(lower(pm.work_window), new.new_end));
  perform ptw.electrical_window_check(new.unit_id, new.permit_id, tstzrange(lower(pm.work_window), new.new_end));
  new.reason := btrim(new.reason); new.person_id := me; new.old_end := upper(pm.work_window);
  new.revision := pm.revision; new.at := now();
  return new;
end $$;
create trigger permit_extension_bi before insert on ptw.permit_extension
  for each row execute function ptw.permit_extension_before_insert();

-- ---------- Operações do ciclo de vida usadas pela API ----------
-- Conteúdo de uma revisão: formulário congelado, campos, ativos, equipe e respostas (SHA-256 do JSON).
create function ptw.permit_content_sha256(p_unit uuid, p_permit uuid) returns bytea
  language sql stable as $$
  select sha256(convert_to(jsonb_build_object(
    'form', encode(p.snapshot_sha256, 'hex'), 'scope', p.scope, 'location', p.location_id,
    'window', p.work_window::text, 'version', p.version_id,
    'assets', (select coalesce(jsonb_agg(a.asset_id order by a.asset_id), '[]') from ptw.permit_asset a
                where a.unit_id = p.unit_id and a.permit_id = p.id),
    'team', (select coalesce(jsonb_agg(jsonb_build_array(t.role_id, t.person_id) order by t.role_id, t.person_id), '[]')
               from ptw.permit_team t where t.unit_id = p.unit_id and t.permit_id = p.id),
    'answers', (select coalesce(jsonb_object_agg(r.item_id, r.value), '{}') from ptw.permit_answer r
                 where r.unit_id = p.unit_id and r.permit_id = p.id))::text, 'UTF8'))
    from ptw.permit p where p.unit_id = p_unit and p.id = p_permit
$$;

-- Enviar: número, formulário congelado (frozen_form: o da versão, com as opções das listas
-- copiadas) e em_analise. A trava de equipamento dispara aqui.
-- Reenviar (PT devolvida): abre a revisão seguinte (linha em permit_revision); as assinaturas das
-- revisões anteriores são anuladas (ficam no histórico); o formulário congelado no primeiro envio
-- continua o mesmo.
-- p_sign (padrão): o solicitante assina a Solicitação na mesma chamada — a primeira assinatura da
-- etapa "solicitacao", se a versão tem e ela é a etapa em curso. A assinatura passa por todas as
-- regras (elegível PTW08, bloqueio do formulário PTW16, janela encerrada PTW23): recusada, nada é
-- enviado.
create function ptw.permit_submit(p_unit uuid, p_permit uuid, p_sign boolean default true) returns text
  language plpgsql as $$
declare pm ptw.permit; h bytea; nrev integer; st uuid; sl uuid;
begin
  select * into pm from ptw.permit where unit_id = p_unit and id = p_permit for update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if pm.state not in ('rascunho', 'devolvida') then
    raise exception 'Só um rascunho ou uma PT devolvida pode ser enviada' using errcode = 'PTW05';
  end if;
  if not exists (select 1 from ptw.permit_asset where unit_id = p_unit and permit_id = p_permit) then
    raise exception 'A PT precisa de ao menos um ativo' using errcode = 'PTW04';
  end if;
  h := coalesce(pm.snapshot_sha256, ptw.freeze_form(p_unit, ptw.frozen_form(p_unit, pm.version_id)));
  nrev := pm.revision + case when pm.state = 'devolvida' then 1 else 0 end;
  update ptw.permit
     set state = 'em_analise',
         number = coalesce(number, ptw.next_permit_number(p_unit)),
         snapshot_sha256 = h, snapshot_at = coalesce(snapshot_at, now()), state_note = null, revision = nrev
   where unit_id = p_unit and id = p_permit
  returning number into pm.number;
  if pm.state = 'devolvida' then
    update ptw.signature g set voided_at = now(), voided_reason = 'Reenviada após devolução: vale a revisão ' || nrev
     where g.unit_id = p_unit and g.permit_id = p_permit and g.rev < nrev and g.voided_at is null;
    insert into ptw.permit_revision (unit_id, permit_id, rev, reason, sha256)
    values (p_unit, p_permit, nrev, 'Reenviada após devolução', ptw.permit_content_sha256(p_unit, p_permit));
  end if;
  if p_sign then
    select g.id into st from ptw.stage g where g.unit_id = p_unit and g.version_id = pm.version_id and g.kind = 'solicitacao';
    select s.id into sl from ptw.sign_slot s where s.unit_id = p_unit and s.stage_id = st order by s.position, s.id limit 1;
    if sl is not null and ptw.permit_current_stage(p_unit, p_permit) = st then
      insert into ptw.signature (unit_id, permit_id, rev, slot_id, person_id)
      values (p_unit, p_permit, nrev, sl, ptw.current_person());
    end if;
  end if;
  return pm.number;
end $$;

-- ---------- Atos da pessoa da sessão, um por função (o que a API chama) ----------
-- A etapa deste tipo está concluída? Existe na versão e toda assinatura que conta (slot_required)
-- tem "min" assinaturas válidas na revisão atual. Igual a done() de stateAfterSign no app.
create function ptw.stage_done(p_unit uuid, p_permit uuid, p_kind ptw.stage_kind) returns boolean
  language sql stable as $$
  select exists (select 1 from ptw.permit pm
                   join ptw.stage st on st.unit_id = pm.unit_id and st.version_id = pm.version_id and st.kind = p_kind
                  where pm.unit_id = p_unit and pm.id = p_permit)
     and not exists (
       select 1 from ptw.permit pm
         join ptw.stage st on st.unit_id = pm.unit_id and st.version_id = pm.version_id and st.kind = p_kind
         join ptw.sign_slot sl on sl.unit_id = st.unit_id and sl.stage_id = st.id
        where pm.unit_id = p_unit and pm.id = p_permit
          and ptw.slot_required(sl, (select coalesce(jsonb_object_agg(a.item_id, a.value), '{}') from ptw.permit_answer a
                                      where a.unit_id = pm.unit_id and a.permit_id = pm.id))
          and (select count(*) from ptw.signature g
                where g.unit_id = pm.unit_id and g.permit_id = pm.id and g.rev = pm.revision
                  and g.slot_id = sl.id and g.voided_at is null) < sl.min)
$$;

-- Para onde a PT vai com as assinaturas que tem agora (o mesmo estado = não muda). Um passo por vez,
-- caso a caso igual a stateAfterSign do app (core/signing.ts):
--   rascunho, devolvida                          → em_analise (o envio)
--   em_analise  + Emissão concluída              → emitida
--   emitida     + Aceite no campo concluído      → ativa
--   suspensa com Retomada + Aceite no campo      → ativa
--   ativa       + Entrega concluída              → entregue
--   expirada, ou suspensa sem Retomada + Entrega → entregue (a área sempre é devolvida)
--   entregue    + Aceite da área concluído       → encerrada
create function ptw.permit_state_after_sign(p_unit uuid, p_permit uuid) returns ptw.permit_state
  language plpgsql stable as $$
declare pm record;
begin
  select state, resumed_at into pm from ptw.permit where unit_id = p_unit and id = p_permit;
  if pm.state in ('rascunho', 'devolvida') then return 'em_analise'; end if;
  if pm.state = 'em_analise' and ptw.stage_done(p_unit, p_permit, 'emissao') then return 'emitida'; end if;
  if pm.state = 'emitida' and ptw.stage_done(p_unit, p_permit, 'aceite_campo') then return 'ativa'; end if;
  if pm.state = 'suspensa' and pm.resumed_at is not null and ptw.stage_done(p_unit, p_permit, 'aceite_campo') then return 'ativa'; end if;
  if pm.state = 'ativa' and ptw.stage_done(p_unit, p_permit, 'entrega') then return 'entregue'; end if;
  if (pm.state = 'expirada' or (pm.state = 'suspensa' and pm.resumed_at is null))
     and ptw.stage_done(p_unit, p_permit, 'entrega') then return 'entregue'; end if;
  if pm.state = 'entregue' and ptw.stage_done(p_unit, p_permit, 'aceite_area') then return 'encerrada'; end if;
  return pm.state;
end $$;

-- Assinar: inclui a assinatura da pessoa da sessão (todas as regras de signature_before_insert e o
-- bloqueio do formulário) e, se a etapa fechou, avança o estado na mesma transação. Na Emissão, a
-- janela é conferida contra o prazo do modelo em toda assinatura (PTW31), como no app. O novo Aceite
-- no campo de uma PT retomada encerra a suspensão (resumed_* limpos). Devolve o estado da PT.
-- A linha da PT fica travada do começo ao fim: duas assinaturas ao mesmo tempo entram uma depois da
-- outra, e a segunda já vê o estado (e a etapa em curso) que a primeira deixou.
-- p_id: id da assinatura gerado pelo cliente; repetir a chamada com o mesmo id não assina de novo.
create function ptw.permit_sign(p_unit uuid, p_permit uuid, p_slot uuid, p_rev integer, p_id uuid default null)
  returns ptw.permit_state language plpgsql as $$
declare me uuid := ptw.current_person(); pm record; g record; k ptw.stage_kind; nxt ptw.permit_state;
begin
  if me is null then
    raise exception 'Pessoa não elegível: sem pessoa na sessão' using errcode = 'PTW08';
  end if;
  select state into pm from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if p_id is not null then
    select permit_id, slot_id, rev, person_id into g from ptw.signature where unit_id = p_unit and id = p_id;
    if found then
      if (g.permit_id, g.slot_id, g.rev, g.person_id) is distinct from (p_permit, p_slot, p_rev, me) then
        raise exception 'Já existe outra assinatura com este id' using errcode = '23505';
      end if;
      return pm.state;
    end if;
  end if;
  insert into ptw.signature (unit_id, id, permit_id, rev, slot_id, person_id)
  values (p_unit, coalesce(p_id, uuidv7()), p_permit, p_rev, p_slot, me);
  select st.kind into k from ptw.sign_slot sl join ptw.stage st on st.unit_id = sl.unit_id and st.id = sl.stage_id
   where sl.unit_id = p_unit and sl.id = p_slot;
  select state, version_id, work_window into pm from ptw.permit where unit_id = p_unit and id = p_permit;
  if k = 'emissao' then
    perform ptw.window_check(p_unit, pm.version_id, pm.work_window);
  end if;
  nxt := ptw.permit_state_after_sign(p_unit, p_permit);
  if nxt <> pm.state then
    if pm.state = 'suspensa' and nxt = 'ativa' then
      update ptw.permit set state = nxt, resumed_reason = null, resumed_by = null, resumed_at = null
       where unit_id = p_unit and id = p_permit;
    else
      update ptw.permit set state = nxt where unit_id = p_unit and id = p_permit;
    end if;
  end if;
  return nxt;
end $$;

-- Motivo de um ato: 1 a 500 caracteres depois de aparar. A conferência vem DEPOIS da escrita (que a
-- exceção desfaz), para as regras de quem pode (PTW18, PTW24…) responderem antes, como no app.
create function ptw.act_reason(p_reason text, p_ask text) returns text
  language plpgsql immutable as $$
begin
  if coalesce(btrim(p_reason), '') = '' or length(btrim(p_reason)) > 500 then
    raise exception '% (até 500 caracteres)', p_ask using errcode = '23514';
  end if;
  return btrim(p_reason);
end $$;

-- Devolver ao solicitante: em_analise → devolvida, com o motivo em state_note. Quem pode: PTW18, PTW29
-- (permit_act_guard). Fora de em análise: PTW05. Sem motivo: 23514.
create function ptw.permit_return(p_unit uuid, p_permit uuid, p_reason text) returns ptw.permit_state
  language plpgsql as $$
declare st ptw.permit_state;
begin
  select state into st from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if st <> 'em_analise' then
    raise exception 'Mudança de estado não permitida: % → Devolvida', ptw.state_label(st) using errcode = 'PTW05';
  end if;
  update ptw.permit set state = 'devolvida', state_note = left(coalesce(nullif(btrim(p_reason), ''), '-'), 500)
   where unit_id = p_unit and id = p_permit;
  perform ptw.act_reason(p_reason, 'Diga o motivo da devolução');
  return 'devolvida';
end $$;

-- Descartar o rascunho: rascunho → cancelada, pelo solicitante (PTW17), com o motivo em state_note
-- (23514). Só o rascunho se descarta (PTW05): cancelar depois do envio não é um ato da API.
create function ptw.permit_discard(p_unit uuid, p_permit uuid, p_reason text) returns ptw.permit_state
  language plpgsql as $$
declare st ptw.permit_state;
begin
  select state into st from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if st <> 'rascunho' then
    raise exception 'Só um rascunho pode ser descartado (a PT está %)', ptw.state_label(st) using errcode = 'PTW05';
  end if;
  update ptw.permit set state = 'cancelada', state_note = left(coalesce(nullif(btrim(p_reason), ''), '-'), 500)
   where unit_id = p_unit and id = p_permit;
  perform ptw.act_reason(p_reason, 'Diga o motivo do descarte');
  return 'cancelada';
end $$;

-- Parar: registra a parada em nome da pessoa da sessão, na hora do servidor; a PT ativa fica suspensa
-- na mesma escrita; uma Retomada anterior deixa de valer. Só em campo (PTW25); já parada, aguarda a
-- Retomada (PTW21); login ativo (PTW24, permit_act_guard). Sem motivo: 23514.
create function ptw.permit_stop(p_unit uuid, p_permit uuid, p_reason text) returns ptw.permit_state
  language plpgsql as $$
declare pm record; nxt ptw.permit_state;
begin
  select state, hold_reason, resumed_at into pm from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if pm.state not in ('emitida', 'ativa', 'suspensa', 'entregue') then
    raise exception 'A PT está %: não está em campo', ptw.state_label(pm.state) using errcode = 'PTW25';
  end if;
  if pm.hold_reason is not null or (pm.state = 'suspensa' and pm.resumed_at is null) then
    raise exception 'A PT já está parada: aguarda Retomada' using errcode = 'PTW21';
  end if;
  nxt := case when pm.state = 'ativa' then 'suspensa' else pm.state end;
  update ptw.permit
     set state = nxt, hold_reason = left(coalesce(nullif(btrim(p_reason), ''), '-'), 500), hold_by = ptw.current_person(),
         hold_at = now(), resumed_reason = null, resumed_by = null, resumed_at = null
   where unit_id = p_unit and id = p_permit;
  perform ptw.act_reason(p_reason, 'Diga o motivo da parada');
  return nxt;
end $$;

-- Retomar: limpa a parada e registra a retomada em nome da pessoa da sessão, na hora do servidor, numa
-- escrita. Quem pode e quando: PTW26 (permit_act_guard); na suspensa, o Aceite no campo é anulado
-- (permit_resume_void). Sem motivo: 23514.
create function ptw.permit_resume(p_unit uuid, p_permit uuid, p_reason text) returns ptw.permit_state
  language plpgsql as $$
declare pm record;
begin
  select state, hold_reason, resumed_at into pm from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  if not found then raise exception 'PT inexistente na unidade' using errcode = '23503'; end if;
  if pm.hold_reason is null and not (pm.state = 'suspensa' and pm.resumed_at is null) then
    raise exception 'Não há parada a retomar' using errcode = 'PTW26';
  end if;
  update ptw.permit
     set hold_reason = null, hold_by = null, hold_at = null,
         resumed_reason = left(coalesce(nullif(btrim(p_reason), ''), '-'), 500), resumed_by = ptw.current_person(), resumed_at = now()
   where unit_id = p_unit and id = p_permit;
  perform ptw.act_reason(p_reason, 'Diga o motivo da retomada');
  return pm.state;
end $$;

-- Prorrogar a janela: grava a prorrogação (conferida no gatilho) e avança o fim. Devolve o id.
create function ptw.permit_extend(p_unit uuid, p_permit uuid, p_new_end timestamptz, p_reason text) returns uuid
  language plpgsql as $$
declare x uuid;
begin
  insert into ptw.permit_extension (unit_id, permit_id, new_end, reason)
  values (p_unit, p_permit, p_new_end, p_reason)
  returning id into x;
  update ptw.permit set work_window = tstzrange(lower(work_window), p_new_end, '[)')
   where unit_id = p_unit and id = p_permit;
  return x;
end $$;

-- Expira o que passou da janela (o agendador da API chama a cada minuto).
create function ptw.expire_due(p_unit uuid) returns integer
  language sql as $$
  with x as (
    update ptw.permit set state = 'expirada', state_note = 'Janela encerrada'
     where unit_id = p_unit and state in ('emitida', 'ativa', 'suspensa') and upper(work_window) <= now()
    returning 1)
  select count(*)::int from x
$$;

-- ---------- Filhos da PT: rascunho do solicitante e changed_at ----------
-- Toda escrita num filho (ativo, equipe, resposta, anexo, revisão, assinatura, prorrogação) confere o
-- dono do rascunho (PTW17) e avança permit.changed_at, depois das regras do próprio filho (o gatilho
-- touch_permit vem por último na ordem dos nomes) e antes da trilha (que trava a ponta: PT antes da trilha). A
-- escrita só de changed_at não passa pelas regras da PT nem muda row_version (permit_before_update).
-- A remoção em cascata de uma PT (só o dono) não toca a PT que está saindo.
create function ptw.permit_touch() returns trigger language plpgsql as $$
declare r record := coalesce(new, old); pm record;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  select state, author_id into pm from ptw.permit where unit_id = r.unit_id and id = r.permit_id;
  perform ptw.draft_owner_check(pm.state, pm.author_id);
  update ptw.permit set changed_at = now()
   where unit_id = r.unit_id and id = r.permit_id and changed_at <> now();
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['permit_asset', 'permit_team', 'permit_answer', 'attachment', 'permit_revision', 'signature', 'permit_extension'] loop
    execute format('create trigger touch_permit before insert or update or delete on ptw.%I '
                   'for each row execute function ptw.permit_touch()', t);
  end loop;
end $$;
