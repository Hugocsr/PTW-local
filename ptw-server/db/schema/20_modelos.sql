-- Modelos de PT: classe de retenção, modelo, versões (imutáveis fora do rascunho), escopo, etapas,
-- assinaturas, separação e o formulário congelado.
-- Etapas e assinaturas são tabelas (a assinatura da PT aponta para elas por chave estrangeira). O
-- formulário é um documento JSONB lido inteiro (estrutura em 40_formulario); na PT ele é congelado
-- no envio e deduplicado pelo SHA-256.
set search_path = ptw, public;

-- Classes de retenção da trilha de auditoria. Prazo mínimo de 5 anos em todas (PET: NR-33). A
-- trilha guarda pelo MAIOR prazo configurado, porque uma partição mensal mistura classes.
-- Só o dono altera; toda mudança vira evento do sistema (50_auditoria).
create table ptw.retention_class (
  code  text primary key check (code ~ '^[a-z_]{2,30}$'),
  label text not null check (length(label) between 1 and 120),
  years smallint not null check (years between 5 and 100),
  basis text not null check (length(basis) between 1 and 300)
);
insert into ptw.retention_class values
  ('pet', 'PET: entrada em espaço confinado', 5, 'NR-33 §33.5.10: PET arquivada por cinco anos'),
  ('pt', 'PT de trabalho (elétrica, altura, geral)', 5, 'Mínimo do produto; NR-10 e NR-35 não fixam prazo'),
  ('cadastro', 'Cadastro, modelos, acessos e eventos do sistema', 5, 'Mínimo do produto');

create table ptw.template (
  unit_id         uuid not null references ptw.unit,
  id              uuid not null default uuidv7(),
  name            text not null check (length(name) between 1 and 120),
  retention_class text not null default 'pt' references ptw.retention_class,
  revision        integer not null default 1,
  updated_at      timestamptz not null default now(),
  primary key (unit_id, id)
);
create unique index template_name_uq on ptw.template (unit_id, lower(name));
create trigger template_rev before update on ptw.template
  for each row execute function ptw.bump_revision();

-- Versão do modelo. Rascunho é editável; ativa (no máximo uma por modelo) só vira arquivada;
-- arquivada é histórico. A importação cria rascunho com origin = 'sugerida', o SHA-256 do pacote e a
-- origem de cada elemento (import_source, conferida abaixo; o evento modelo.importado em 50_auditoria).
create table ptw.template_version (
  unit_id       uuid not null,
  id            uuid not null default uuidv7(),
  template_id   uuid not null,
  number        integer not null check (number > 0),
  status        ptw.version_status not null default 'rascunho',
  note          text not null default '' check (length(note) <= 2000),
  -- Formulário: {"sections": [...]}; estrutura conferida em 40_formulario (PTW15).
  form          jsonb not null default '{"sections": []}',
  -- Prazo máximo da janela de trabalho das PTs desta versão (fim − início); nulo = sem limite.
  -- Conferido ao enviar, ao emitir e ao prorrogar (PTW31, 30_pt).
  max_window    interval check (max_window > interval '0'),
  -- Prende o equipamento: as PTs desta versão entram na trava de equipamento (30_pt). Desligado
  -- (ex.: desabilitação de intertravamento), a PT nem prende os ativos nem é barrada por outra PT
  -- aberta neles. Congelado com o resto da versão ativa (version_guard).
  holds_equipment boolean not null default true,
  origin        ptw.version_origin not null default 'manual',
  source_sha256 bytea check (length(source_sha256) = 32),
  -- Origem da importação: pacote, documentos, ferramenta, modelo de IA, idioma e o trecho (página,
  -- texto literal, rótulo original) de cada elemento. Forma em import_source_problem.
  import_source jsonb,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  -- Concorrência otimista do rascunho (UPDATE ... WHERE revision = $esperada), como nos cadastros.
  -- Fica fora do diff da trilha. Quem edita só os filhos (etapas, assinaturas, escopo) confere a
  -- revisão com um UPDATE da própria versão na mesma transação: qualquer UPDATE soma 1.
  revision      integer not null default 1,
  updated_at    timestamptz not null default now(),
  primary key (unit_id, id),
  unique (unit_id, template_id, number),
  -- Alvo da chave composta da PT: a versão é do modelo que a PT diz.
  unique (unit_id, id, template_id),
  foreign key (unit_id, template_id) references ptw.template (unit_id, id),
  check ((status = 'rascunho') = (activated_at is null)),
  check (origin = 'manual' or source_sha256 is not null),
  check ((origin = 'sugerida') = (import_source is not null))
);
create unique index template_version_active_uq on ptw.template_version (unit_id, template_id) where status = 'ativa';

-- Primeiro problema da origem da importação (nulo = ok). Mesmas chaves do ImportSource do app:
-- {"pacote": {"arquivo", "sha256"}, "documentos": [{"arquivo", "sha256", "paginas"}], "ferramenta",
--  "modelo"?, "idioma"? {"documento", "rotulos"}, "importadoEm",
--  "trechos": {<id do elemento>: {"pagina", "trecho", "arquivo"?, "original"?, "confianca"?, "observacao"?}}}.
-- Todo elemento citado tem página e trecho literal não vazio; o arquivo do trecho é um dos documentos.
create function ptw.import_source_problem(j jsonb, sha bytea) returns text
  language plpgsql immutable parallel safe as $$
declare k text; v jsonb; docs text[];
begin
  if jsonb_typeof(j) is distinct from 'object' then return 'não é um objeto'; end if;
  select key into k from jsonb_object_keys(j) key
   where key not in ('pacote', 'documentos', 'ferramenta', 'modelo', 'idioma', 'importadoEm', 'trechos') limit 1;
  if found then return 'campo desconhecido (' || k || ')'; end if;
  if jsonb_typeof(j -> 'pacote' -> 'arquivo') is distinct from 'string' or length(j -> 'pacote' ->> 'arquivo') > 255
     or coalesce(j -> 'pacote' ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then
    return 'pacote sem arquivo ou SHA-256';
  end if;
  if sha is null or j -> 'pacote' ->> 'sha256' <> encode(sha, 'hex') then return 'SHA-256 do pacote diferente de source_sha256'; end if;
  if jsonb_typeof(j -> 'documentos') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(j -> 'documentos') d
                 where jsonb_typeof(d -> 'arquivo') is distinct from 'string' or length(d ->> 'arquivo') not between 1 and 255
                    or coalesce(d ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
                    or jsonb_typeof(d -> 'paginas') is distinct from 'number' or (d ->> 'paginas') !~ '^[1-9][0-9]{0,5}$') then
    return 'documentos de origem inválidos (arquivo, sha256, paginas)';
  end if;
  if jsonb_typeof(j -> 'ferramenta') is distinct from 'string' or length(j ->> 'ferramenta') not between 1 and 200 then
    return 'ferramenta ausente';
  end if;
  if j ? 'modelo' and (jsonb_typeof(j -> 'modelo') is distinct from 'string' or length(j ->> 'modelo') not between 1 and 200) then
    return 'modelo de IA inválido';
  end if;
  if j ? 'idioma' and (jsonb_typeof(j -> 'idioma' -> 'documento') is distinct from 'string'
                       or jsonb_typeof(j -> 'idioma' -> 'rotulos') is distinct from 'string'
                       or length(j -> 'idioma' ->> 'documento') not between 1 and 35
                       or length(j -> 'idioma' ->> 'rotulos') not between 1 and 35) then
    return 'idioma inválido (documento, rotulos)';
  end if;
  if coalesce(j ->> 'importadoEm', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
    return 'importadoEm não é um instante ISO com fuso';
  end if;
  if jsonb_typeof(j -> 'trechos') is distinct from 'object' then return 'trechos ausentes'; end if;
  docs := array(select d ->> 'arquivo' from jsonb_array_elements(j -> 'documentos') d);
  for k, v in select e.key, e.value from jsonb_each(j -> 'trechos') e loop
    if k !~ '^[A-Za-z0-9_.:-]{1,64}$' then return 'trecho de elemento com id inválido (' || left(k, 70) || ')'; end if;
    if jsonb_typeof(v) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v) x where x not in ('pagina', 'trecho', 'arquivo', 'original', 'confianca', 'observacao')) then
      return k || ': trecho fora do formato';
    end if;
    if jsonb_typeof(v -> 'pagina') is distinct from 'number' or (v ->> 'pagina') !~ '^[1-9][0-9]{0,5}$' then
      return k || ': página inválida';
    end if;
    if jsonb_typeof(v -> 'trecho') is distinct from 'string' or btrim(v ->> 'trecho') = '' then
      return k || ': sem o trecho literal que o sustenta';
    end if;
    if v ? 'arquivo' and (jsonb_typeof(v -> 'arquivo') is distinct from 'string' or not (v ->> 'arquivo') = any (docs)) then
      return k || ': arquivo do trecho não é um dos documentos';
    end if;
    if not (ptw.jopt(v, 'original', 'string') and ptw.jopt(v, 'observacao', 'string'))
       or (v ? 'confianca' and coalesce(v ->> 'confianca', '') not in ('alta', 'media', 'baixa')) then
      return k || ': original, confiança ou observação inválidos';
    end if;
  end loop;
  return null;
end $$;

create function ptw.import_source_check() returns trigger language plpgsql as $$
declare p text;
begin
  -- Versão manual com origem: a restrição da tabela recusa (23514).
  if new.import_source is not null and new.origin = 'sugerida' then
    p := ptw.import_source_problem(new.import_source, new.source_sha256);
    if p is not null then
      raise exception 'Origem da importação inválida: %', p using errcode = 'PTW15';
    end if;
  end if;
  return new;
end $$;
create trigger template_version_import before insert or update of import_source, source_sha256 on ptw.template_version
  for each row execute function ptw.import_source_check();

create function ptw.version_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Só um rascunho de versão pode ser removido' using errcode = 'PTW03';
    end if;
    return old;
  end if;
  if old.status = 'rascunho' then
    if new.status = 'ativa' then new.activated_at := now(); end if;
    if new.status = 'arquivada' then
      raise exception 'Um rascunho é ativado antes de ser arquivado' using errcode = 'PTW03';
    end if;
    return new;
  end if;
  -- Ativa → arquivada, sem mudar mais nada (a revisão e a data de controle são do gatilho).
  if old.status = 'ativa' and new.status = 'arquivada'
     and (to_jsonb(new) - array['status', 'revision', 'updated_at']) = (to_jsonb(old) - array['status', 'revision', 'updated_at']) then
    return new;
  end if;
  raise exception 'Versão % não pode ser alterada', old.status using errcode = 'PTW03';
end $$;
create trigger template_version_guard before update or delete on ptw.template_version
  for each row execute function ptw.version_guard();
create trigger template_version_rev before update on ptw.template_version
  for each row execute function ptw.bump_revision();

-- Ativar uma versão arquiva a anterior na mesma transação.
create function ptw.version_activate(p_unit uuid, p_version uuid) returns void
  language plpgsql as $$
declare tpl uuid;
begin
  select template_id into strict tpl from ptw.template_version
   where unit_id = p_unit and id = p_version and status = 'rascunho' for update;
  update ptw.template_version set status = 'arquivada'
   where unit_id = p_unit and template_id = tpl and status = 'ativa';
  update ptw.template_version set status = 'ativa'
   where unit_id = p_unit and id = p_version;
end $$;

-- Filhos de uma versão (escopo, etapas, assinaturas, separação) só mudam enquanto ela é rascunho;
-- mover um filho exige que a versão de origem também seja rascunho.
create function ptw.version_child_guard() returns trigger language plpgsql as $$
declare v_unit uuid; v_ver uuid; st ptw.version_status;
begin
  if tg_op = 'DELETE' then v_unit := old.unit_id; v_ver := old.version_id;
  else v_unit := new.unit_id; v_ver := new.version_id; end if;
  select status into st from ptw.template_version where unit_id = v_unit and id = v_ver;
  -- Remoção em cascata de um rascunho: a versão já saiu.
  if st is null and tg_op = 'DELETE' then return old; end if;
  if st is distinct from 'rascunho' then
    raise exception 'A versão está %; crie uma nova versão para alterar', st using errcode = 'PTW03';
  end if;
  if tg_op = 'UPDATE' and (old.unit_id, old.version_id) is distinct from (new.unit_id, new.version_id) then
    select status into st from ptw.template_version where unit_id = old.unit_id and id = old.version_id;
    if st is distinct from 'rascunho' then
      raise exception 'A versão de origem está %; crie uma nova versão para alterar', st using errcode = 'PTW03';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Escopo: tipos de local e de ativo aceitos pela versão.
create table ptw.version_location_type (
  unit_id    uuid not null,
  version_id uuid not null,
  type_id    uuid not null,
  type_fam   ptw.type_family not null default 'local' check (type_fam = 'local'),
  primary key (unit_id, version_id, type_id),
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade,
  foreign key (unit_id, type_id, type_fam) references ptw.type_def (unit_id, id, family)
);
create table ptw.version_asset_type (
  unit_id    uuid not null,
  version_id uuid not null,
  type_id    uuid not null,
  type_fam   ptw.type_family not null default 'ativo' check (type_fam = 'ativo'),
  primary key (unit_id, version_id, type_id),
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade,
  foreign key (unit_id, type_id, type_fam) references ptw.type_def (unit_id, id, family)
);

-- Etapas em ordem. Etapa com kind é âncora do ciclo de vida (renomeia, não remove); no máximo uma
-- de cada kind por versão.
create table ptw.stage (
  unit_id    uuid not null,
  id         uuid not null default uuidv7(),
  version_id uuid not null,
  position   smallint not null check (position >= 0),
  name       text not null check (length(name) between 1 and 80),
  kind       ptw.stage_kind,
  locked     boolean not null default false,
  primary key (unit_id, id),
  -- Alvo das chaves compostas dos filhos: a assinatura aponta para uma etapa DA MESMA versão.
  unique (unit_id, id, version_id),
  unique (unit_id, version_id, position) deferrable initially deferred,
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade
);
create unique index stage_kind_uq on ptw.stage (unit_id, version_id, kind) where kind is not null;

-- Assinaturas de uma etapa (em paralelo dentro da etapa). kind 'cargo': qualquer pessoa elegível
-- com QUALQUER um dos cargos de role_ids; kind 'pessoa': só person_id (os cargos ficam como rótulo).
-- role_ids: cargos da unidade, sem repetição (sign_slot_roles_check; o cargo em uso não sai).
-- "Obrigatória só quando": a marcação required_when_item tem um dos required_when_values, ou, com
-- required_when_line, essa linha da verificação foi respondida num deles (slot_required; o item e a
-- linha são conferidos na ativação, 40_formulario).
-- No rascunho a assinatura pode ficar sem cargo (role_ids vazio) e sem significado (a importação
-- não achou); a ativação exige os dois (PTW28).
create table ptw.sign_slot (
  unit_id              uuid not null,
  id                   uuid not null default uuidv7(),
  version_id           uuid not null,
  stage_id             uuid not null,
  position             smallint not null check (position >= 0),
  meaning              text check (length(meaning) between 1 and 120),
  kind                 ptw.slot_kind not null default 'cargo',
  role_ids             uuid[] not null default '{}'
                         check (cardinality(role_ids) <= 20 and array_position(role_ids, null) is null),
  person_id            uuid,
  min                  smallint not null default 1 check (min between 1 and 20),
  required             boolean not null default true,
  required_when_item   text check (length(required_when_item) between 1 and 64),
  required_when_values text[] check (cardinality(required_when_values) between 1 and 50),
  required_when_line   text check (length(required_when_line) between 1 and 64),
  primary key (unit_id, id),
  unique (unit_id, id, version_id),
  -- Etapa e versão juntas: um slot não aponta para a etapa de outra versão (e escaparia da trava
  -- de versão em uso, que olha só version_id).
  foreign key (unit_id, stage_id, version_id) references ptw.stage (unit_id, id, version_id) on delete cascade,
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade,
  foreign key (unit_id, person_id) references ptw.person (unit_id, id),
  check ((kind = 'pessoa') = (person_id is not null)),
  check ((required_when_item is null) = (required_when_values is null)),
  check (required_when_line is null or required_when_item is not null),
  check (required_when_item is null or required)
);
create index sign_slot_stage_ix on ptw.sign_slot (unit_id, stage_id, position);
create index sign_slot_roles_ix on ptw.sign_slot using gin (role_ids);

-- Chave estrangeira de role_ids (um array não tem FK): cada id é cargo da unidade, sem repetição.
create function ptw.sign_slot_roles_check() returns trigger language plpgsql as $$
declare bad uuid;
begin
  if cardinality(new.role_ids) > (select count(distinct r) from unnest(new.role_ids) r) then
    raise exception 'Cargo repetido na assinatura' using errcode = '23514';
  end if;
  select r into bad from unnest(new.role_ids) r
   where not exists (select 1 from ptw.type_def d where d.unit_id = new.unit_id and d.id = r and d.family = 'cargo') limit 1;
  if found then
    raise exception 'Cargo % não existe na unidade', bad using errcode = '23503';
  end if;
  return new;
end $$;
create trigger sign_slot_roles before insert or update of role_ids, unit_id on ptw.sign_slot
  for each row execute function ptw.sign_slot_roles_check();

-- O outro lado da chave: cargo usado numa assinatura de modelo não sai nem muda de família.
create function ptw.type_def_slot_guard() returns trigger language plpgsql as $$
begin
  if old.family = 'cargo' and (tg_op = 'DELETE' or new.family <> 'cargo' or new.id <> old.id or new.unit_id <> old.unit_id)
     and exists (select 1 from ptw.sign_slot s where s.unit_id = old.unit_id and s.role_ids @> array[old.id]) then
    raise exception 'O cargo % é usado em assinatura de modelo', old.label using errcode = '23503';
  end if;
  return coalesce(new, old);
end $$;
create trigger type_def_slot_guard before update or delete on ptw.type_def
  for each row execute function ptw.type_def_slot_guard();

-- A assinatura conta para fechar a etapa? Obrigatória e, com condição, a condição vale nas
-- respostas da PT (igual a evalCondition do app; sem resposta = não vale).
create function ptw.slot_required(sl ptw.sign_slot, answers jsonb) returns boolean
  language sql immutable parallel safe
  return sl.required and (sl.required_when_item is null or coalesce(case
    when sl.required_when_line is not null
      then answers -> sl.required_when_item ->> 't' = 'verificacao'
           and answers -> sl.required_when_item -> 'lines' -> sl.required_when_line ->> 'a' = any (sl.required_when_values)
    else answers -> sl.required_when_item ->> 't' = 'marcacao'
         and coalesce(answers -> sl.required_when_item -> 'ids', '[]') ?| sl.required_when_values end, false));

-- Duas assinaturas que precisam ser de pessoas diferentes.
create table ptw.separation (
  unit_id    uuid not null,
  version_id uuid not null,
  slot_a     uuid not null,
  slot_b     uuid not null,
  locked     boolean not null default false,
  primary key (unit_id, version_id, slot_a, slot_b),
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade,
  -- As duas pontas são assinaturas da mesma versão da separação.
  foreign key (unit_id, slot_a, version_id) references ptw.sign_slot (unit_id, id, version_id) on delete cascade,
  foreign key (unit_id, slot_b, version_id) references ptw.sign_slot (unit_id, id, version_id) on delete cascade,
  check (slot_a < slot_b)
);
create index separation_b_ix on ptw.separation (unit_id, slot_b);

create trigger version_location_type_guard before insert or update or delete on ptw.version_location_type
  for each row execute function ptw.version_child_guard();
create trigger version_asset_type_guard before insert or update or delete on ptw.version_asset_type
  for each row execute function ptw.version_child_guard();
create trigger stage_guard before insert or update or delete on ptw.stage
  for each row execute function ptw.version_child_guard();
create trigger sign_slot_guard before insert or update or delete on ptw.sign_slot
  for each row execute function ptw.version_child_guard();
create trigger separation_guard before insert or update or delete on ptw.separation
  for each row execute function ptw.version_child_guard();

-- Formulário congelado no envio, endereçado pelo SHA-256 do JSON: PTs com o mesmo formulário
-- compartilham uma linha (milhares de PTs, poucas dezenas de formulários distintos).
create table ptw.form_snapshot (
  unit_id uuid not null references ptw.unit,
  sha256  bytea not null check (length(sha256) = 32),
  form    jsonb not null,
  primary key (unit_id, sha256)
);
create trigger form_snapshot_frozen before update or delete on ptw.form_snapshot
  for each row execute function ptw.forbid_change();

create function ptw.freeze_form(p_unit uuid, p_form jsonb) returns bytea
  language plpgsql as $$
declare h bytea := sha256(convert_to(p_form::text, 'UTF8'));
begin
  insert into ptw.form_snapshot values (p_unit, h, p_form) on conflict do nothing;
  return h;
end $$;

-- Formulário como a PT o congela: o da versão, com as opções das listas copiadas para dentro das
-- marcações (itens em uso da lista, na ordem; os de blockOptionIds saem com "blocks"; listId e
-- blockOptionIds somem), também nas colunas de grupo. Renomear ou desativar um item da lista depois
-- não muda a PT enviada. Igual a freezeForm do app. A verificação com lista de respostas continua
-- apontando para a lista (as respostas antigas seguem legíveis: item de lista nunca muda de id).
create function ptw.frozen_item(p_unit uuid, i jsonb) returns jsonb
  language sql stable as $$
  select case
    when i ->> 'kind' = 'marcacao' and jsonb_typeof(i -> 'listId') = 'string' then
      (i - 'listId' - 'blockOptionIds') || jsonb_build_object('options', coalesce((
        select jsonb_agg(case when coalesce(i -> 'blockOptionIds', '[]') ? oi.id::text
                              then jsonb_build_object('id', oi.id, 'label', oi.label, 'blocks', true)
                              else jsonb_build_object('id', oi.id, 'label', oi.label) end order by oi.position, oi.id)
          from ptw.option_item oi
         where oi.unit_id = p_unit and oi.active
           and oi.list_id = case when ptw.is_uuid(i ->> 'listId') then (i ->> 'listId')::uuid end), '[]'))
    when i ->> 'kind' = 'grupo' and jsonb_typeof(i -> 'columns') = 'array' then
      jsonb_set(i, '{columns}', coalesce((
        select jsonb_agg(ptw.frozen_item(p_unit, c.col) order by c.n)
          from jsonb_array_elements(i -> 'columns') with ordinality c(col, n)), '[]'))
    else i end
$$;

create function ptw.frozen_form(p_unit uuid, p_version uuid) returns jsonb
  language sql stable as $$
  select jsonb_set(tv.form, '{sections}', coalesce((
           select jsonb_agg(case when jsonb_typeof(s.sec -> 'items') = 'array'
                                 then jsonb_set(s.sec, '{items}', coalesce((
                                        select jsonb_agg(ptw.frozen_item(p_unit, it.item) order by it.m)
                                          from jsonb_array_elements(s.sec -> 'items') with ordinality it(item, m)), '[]'))
                                 else s.sec end order by s.n)
             from jsonb_array_elements(tv.form -> 'sections') with ordinality s(sec, n)), '[]'))
    from ptw.template_version tv where tv.unit_id = p_unit and tv.id = p_version
$$;
