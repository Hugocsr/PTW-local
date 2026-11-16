-- Formulário: estrutura dos itens, validação das respostas e o bloqueio da assinatura.
--
-- O banco confere a ESTRUTURA ao gravar (tipos, campos, referências, elegibilidade da pessoa).
-- O que a pessoa grava enquanto preenche é aceito, inclusive a leitura real fora da faixa, o
-- documento vencido e o código fora do formato; isso só IMPEDE A ASSINATURA da etapa (PTW16).
-- Completude: item obrigatório visível, sem resposta, nas seções da etapa, também impede a assinatura (PTW16).
--
-- Formulário: {"sections": [{"id", "title", "stageId"?, "items": [Item]}]}; stageId é o id de uma
-- etapa da versão (seção sem etapa vale para todas). Chaves em camelCase.
-- Item, campos comuns: id, kind, label, required, showWhen? {"itemId", "lineId"?, "anyOf": [...]}
--   texto       long
--   numero      unit, decimals (0..4), negative, min?, max?
--   horario     seconds
--   marcacao    options [{id, label, blocks?}], listId? (lista de opções), blockOptionIds? [id de item da
--               lista; exige listId], multiple, other. Opção com blocks ou em blockOptionIds impede a etapa.
--   verificacao answers ("sim_nao_na" | "sim_nao" | "confirmo" | "lista"), answerListId? (só e sempre com
--               "lista": as respostas são os itens dessa lista), lines [{id, label, blockOn [], noteOn []}];
--               com "lista", blockOn e noteOn levam ids de itens da lista.
--   aviso       text (sem resposta)
--   anexo       accept [foto | video | arquivo], min, hint
--   documento   pattern? ("#" dígito, "A" letra, o resto literal: "APR-####"), attach, validity
--   data        notBeforeToday, min?, max? ("AAAA-MM-DD")
--   pessoa      multiple, roleId? (cargo exigido), mustBeEligible
--   isolamento  minRows
--   grupo       minRows, columns [Item] (só texto, numero, horario, marcacao, verificacao; sem showWhen)
-- Resposta (permit_answer.value), "t" = kind do item. Datas ISO "AAAA-MM-DD", completas.
--   texto       {"t", "v": texto}
--   numero      {"t", "v": número}
--   horario     {"t", "v": "HH:MM" ou "HH:MM:SS" (seconds)}
--   marcacao    {"t", "ids": [id da opção], "other"?: texto}
--   verificacao {"t", "lines": {<id da linha>: {"a": "sim" | "nao" | "na" | "confirmo" | <id do item da lista>, "note"?: texto}}}
--   anexo       {"t", "files": [<id de anexo desta PT>]}
--   documento   {"t", "code": texto, "files": [<id de anexo desta PT>], "validUntil"?: data}
--   data        {"t", "v": data}
--   pessoa      {"t", "ids": [<id de pessoa>]}
--   isolamento  {"t", "rows": [{"id", "point", "assetId"?, "energy"?, "method", "lock", "zero"?: "sim" | "nao", "by"?}]}
--   grupo       {"t", "rows": [{"id", "answers": {<id da coluna>: <resposta da coluna>}}]}
set search_path = ptw, public;

-- ---------- Estrutura ----------
-- Itens do primeiro nível, com a etapa da seção.
create function ptw.form_items(form jsonb) returns table (item jsonb, stage_id text)
  language sql immutable parallel safe as $$
  select i, s ->> 'stageId'
    from jsonb_array_elements(case when jsonb_typeof(form -> 'sections') = 'array' then form -> 'sections' else '[]' end) s,
         jsonb_array_elements(case when jsonb_typeof(s -> 'items') = 'array' then s -> 'items' else '[]' end) i
$$;

create function ptw.form_item(form jsonb, p_id text) returns jsonb
  language sql immutable parallel safe
  return (select f.item from ptw.form_items(form) f where f.item ->> 'id' = p_id limit 1);

-- Primeiro problema de estrutura de um item (nulo = ok). child = coluna de grupo.
create function ptw.form_item_problem(i jsonb, child boolean) returns text
  language plpgsql immutable parallel safe as $$
declare k text := i ->> 'kind'; nm text := coalesce(i ->> 'label', i ->> 'id', 'item'); c jsonb; n integer;
begin
  if jsonb_typeof(i) is distinct from 'object' then return 'item que não é objeto'; end if;
  if coalesce(i ->> 'id', '') !~ '^[A-Za-z0-9_.:-]{1,64}$' then return nm || ': id inválido'; end if;
  if jsonb_typeof(i -> 'label') is distinct from 'string' then return nm || ': rótulo ausente'; end if;
  if not ptw.jopt(i, 'required', 'boolean') then return nm || ': "required" não é sim/não'; end if;
  if i ? 'showWhen' and (jsonb_typeof(i -> 'showWhen' -> 'itemId') is distinct from 'string'
                         or jsonb_typeof(i -> 'showWhen' -> 'anyOf') is distinct from 'array') then
    return nm || ': condição de exibição inválida';
  end if;
  if child and k not in ('texto', 'numero', 'horario', 'marcacao', 'verificacao') then
    return nm || ': tipo ' || coalesce(k, '?') || ' não entra em grupo';
  end if;
  case k
    when 'texto' then
      if not ptw.jopt(i, 'long', 'boolean') then return nm || ': "long" inválido'; end if;
    when 'aviso' then
      if jsonb_typeof(i -> 'text') is distinct from 'string' then return nm || ': aviso sem texto'; end if;
    when 'numero' then
      if not (ptw.jopt(i, 'unit', 'string') and ptw.jopt(i, 'negative', 'boolean')
              and ptw.jopt(i, 'min', 'number?') and ptw.jopt(i, 'max', 'number?') and ptw.jopt(i, 'decimals', 'number')) then
        return nm || ': campos do número inválidos';
      end if;
      if i ? 'decimals' and (i ->> 'decimals')::numeric not in (0, 1, 2, 3, 4) then return nm || ': casas decimais de 0 a 4'; end if;
      if jsonb_typeof(i -> 'min') = 'number' and jsonb_typeof(i -> 'max') = 'number'
         and (i ->> 'min')::numeric > (i ->> 'max')::numeric then return nm || ': mínimo maior que o máximo'; end if;
    when 'horario' then
      if not ptw.jopt(i, 'seconds', 'boolean') then return nm || ': "seconds" inválido'; end if;
    when 'marcacao' then
      if not (ptw.jopt(i, 'options', 'array') and ptw.jopt(i, 'listId', 'string') and ptw.jopt(i, 'multiple', 'boolean')
              and ptw.jopt(i, 'other', 'boolean')) then return nm || ': campos da marcação inválidos'; end if;
      if i ? 'listId' and not ptw.is_uuid(i ->> 'listId') then return nm || ': lista inválida'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(i -> 'options', '[]')) o
                  where jsonb_typeof(o -> 'id') is distinct from 'string') then return nm || ': opção sem id'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(i -> 'options', '[]')) o where not ptw.jopt(o, 'blocks', 'boolean')) then
        return nm || ': "blocks" da opção não é sim/não';
      end if;
      if not ptw.jopt(i, 'blockOptionIds', 'array')
         or exists (select 1 from jsonb_array_elements(coalesce(i -> 'blockOptionIds', '[]')) b
                     where jsonb_typeof(b) is distinct from 'string' or not ptw.is_uuid(b #>> '{}')) then
        return nm || ': opções que impedem inválidas';
      end if;
      if jsonb_array_length(coalesce(i -> 'blockOptionIds', '[]')) > 0 and not i ? 'listId' then
        return nm || ': opções da lista que impedem sem lista';
      end if;
    when 'verificacao' then
      if coalesce(i ->> 'answers', '') not in ('sim_nao_na', 'sim_nao', 'confirmo', 'lista') then return nm || ': respostas inválidas'; end if;
      if (i ->> 'answers' = 'lista') <> (i ? 'answerListId')
         or (i ? 'answerListId' and (jsonb_typeof(i -> 'answerListId') is distinct from 'string' or not ptw.is_uuid(i ->> 'answerListId'))) then
        return nm || ': lista de respostas inválida';
      end if;
      if jsonb_typeof(i -> 'lines') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements(i -> 'lines') l
                     where jsonb_typeof(l -> 'id') is distinct from 'string' or not ptw.jopt(l, 'blockOn', 'array')
                        or not ptw.jopt(l, 'noteOn', 'array')
                        or exists (select 1 from jsonb_array_elements(coalesce(l -> 'blockOn', '[]') || coalesce(l -> 'noteOn', '[]')) a
                                    where case when i ->> 'answers' = 'lista'
                                               then jsonb_typeof(a) is distinct from 'string' or not ptw.is_uuid(a #>> '{}')
                                               else coalesce(a #>> '{}', '') not in ('sim', 'nao', 'na', 'confirmo') end))
      then
        return nm || ': linhas inválidas';
      end if;
    when 'anexo' then
      if jsonb_typeof(i -> 'accept') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements_text(i -> 'accept') a where a not in ('foto', 'video', 'arquivo')) then
        return nm || ': tipos aceitos inválidos';
      end if;
      if not (ptw.jopt(i, 'min', 'number') and ptw.jopt(i, 'hint', 'string')) then return nm || ': campos do anexo inválidos'; end if;
    when 'documento' then
      if not (ptw.jopt(i, 'pattern', 'string') and ptw.jopt(i, 'attach', 'boolean') and ptw.jopt(i, 'validity', 'boolean')) then
        return nm || ': campos do documento inválidos';
      end if;
      if i ? 'pattern' and btrim(i ->> 'pattern') = '' then return nm || ': formato vazio'; end if;
    when 'data' then
      if not (ptw.jopt(i, 'notBeforeToday', 'boolean') and (not i ? 'min' or ptw.iso_date(i ->> 'min') is not null)
              and (not i ? 'max' or ptw.iso_date(i ->> 'max') is not null)) then
        return nm || ': campos da data inválidos';
      end if;
      if ptw.iso_date(i ->> 'min') > ptw.iso_date(i ->> 'max') then return nm || ': data inicial depois da final'; end if;
    when 'pessoa' then
      if not (ptw.jopt(i, 'roleId', 'string') and ptw.jopt(i, 'mustBeEligible', 'boolean') and ptw.jopt(i, 'multiple', 'boolean')) then
        return nm || ': campos de pessoa inválidos';
      end if;
      if i ? 'roleId' and not ptw.is_uuid(i ->> 'roleId') then return nm || ': cargo inválido'; end if;
    when 'isolamento' then
      if not ptw.jopt(i, 'minRows', 'number') then return nm || ': mínimo de linhas inválido'; end if;
    when 'grupo' then
      if not ptw.jopt(i, 'minRows', 'number') then return nm || ': mínimo de linhas inválido'; end if;
      if jsonb_typeof(i -> 'columns') is distinct from 'array' then return nm || ': grupo sem colunas'; end if;
      for c in select * from jsonb_array_elements(i -> 'columns') loop
        if c ? 'showWhen' then return nm || ': coluna com condição'; end if;
        k := ptw.form_item_problem(c, true);
        if k is not null then return nm || ' › ' || k; end if;
      end loop;
      select count(*) - count(distinct x ->> 'id') into n from jsonb_array_elements(i -> 'columns') x;
      if n > 0 then return nm || ': id repetido dentro do grupo'; end if;
    else
      return nm || ': tipo de item desconhecido (' || coalesce(k, '?') || ')';
  end case;
  return null;
end $$;

-- Primeiro problema do formulário inteiro (nulo = ok): seções, itens, ids únicos, condições.
create function ptw.form_problem(form jsonb) returns text
  language plpgsql immutable parallel safe as $$
declare r record; p text;
begin
  if jsonb_typeof(form -> 'sections') is distinct from 'array' then return 'formulário sem seções'; end if;
  if exists (select 1 from jsonb_array_elements(form -> 'sections') s
              where jsonb_typeof(s) <> 'object' or jsonb_typeof(coalesce(s -> 'items', '[]')) <> 'array') then
    return 'seção inválida';
  end if;
  for r in select item from ptw.form_items(form) loop
    p := ptw.form_item_problem(r.item, false);
    if p is not null then return p; end if;
  end loop;
  select f.item ->> 'id' into p from ptw.form_items(form) f group by 1 having count(*) > 1 limit 1;
  if p is not null then return 'id repetido no formulário: ' || p; end if;
  select f.item ->> 'id' into p from ptw.form_items(form) f
   where f.item ? 'showWhen' and ptw.form_item(form, f.item -> 'showWhen' ->> 'itemId') is null limit 1;
  if p is not null then return p || ': a condição aponta para um item que não existe'; end if;
  return null;
end $$;

create function ptw.form_check() returns trigger language plpgsql as $$
declare p text := ptw.form_problem(new.form);
begin
  if p is not null then
    raise exception 'Formulário inválido: %', p using errcode = 'PTW15';
  end if;
  return new;
end $$;
create trigger template_version_form before insert or update of form on ptw.template_version
  for each row execute function ptw.form_check();
create trigger form_snapshot_check before insert on ptw.form_snapshot
  for each row execute function ptw.form_check();

-- Listas citadas pelo formulário (itens do primeiro nível e colunas de grupo): a lista de respostas
-- da verificação existe e blockOn/noteOn são itens dela; blockOptionIds são itens da lista da
-- marcação. Primeiro problema (nulo = ok). Conferido na ativação: o rascunho pode citar uma lista
-- que a importação ainda vai criar.
create function ptw.form_list_problem(p_unit uuid, form jsonb) returns text
  language plpgsql stable as $$
declare i jsonb; nm text; lst uuid; bad text;
begin
  for i in select f.item from ptw.form_items(form) f
           union all
           select c from ptw.form_items(form) f, jsonb_array_elements(f.item -> 'columns') c where f.item ->> 'kind' = 'grupo' loop
    nm := coalesce(i ->> 'label', i ->> 'id');
    if i ->> 'kind' = 'verificacao' and i ->> 'answers' = 'lista' then
      lst := (i ->> 'answerListId')::uuid;
      if not exists (select 1 from ptw.option_list o where o.unit_id = p_unit and o.id = lst) then
        return nm || ': a lista de respostas não existe';
      end if;
      select a #>> '{}' into bad from jsonb_array_elements(i -> 'lines') l,
             jsonb_array_elements(coalesce(l -> 'blockOn', '[]') || coalesce(l -> 'noteOn', '[]')) a
       where not exists (select 1 from ptw.option_item oi where oi.unit_id = p_unit and oi.list_id = lst and oi.id = (a #>> '{}')::uuid)
       limit 1;
      if found then return nm || ': resposta que não é item da lista (' || bad || ')'; end if;
    elsif i ->> 'kind' = 'marcacao' and jsonb_array_length(coalesce(i -> 'blockOptionIds', '[]')) > 0 then
      select b into bad from jsonb_array_elements_text(i -> 'blockOptionIds') b
       where not exists (select 1 from ptw.option_item oi where oi.unit_id = p_unit
                           and oi.list_id = (i ->> 'listId')::uuid and oi.id = b::uuid)
       limit 1;
      if found then return nm || ': opção que impede não é item da lista (' || bad || ')'; end if;
    end if;
  end loop;
  return null;
end $$;

-- Ativar: toda assinatura tem ao menos um cargo e significado (o rascunho pode não ter; PTW28), a
-- condição "obrigatória só quando" aponta para um item do formulário e, com linha, para uma linha
-- desse item de verificação, e as listas citadas pelo formulário conferem (PTW15).
create function ptw.version_activation_check() returns trigger language plpgsql as $$
declare r record; p text;
begin
  select s.meaning, s.position, st.name as stage, cardinality(s.role_ids) = 0 as no_role into r
    from ptw.sign_slot s join ptw.stage st on st.unit_id = s.unit_id and st.id = s.stage_id
   where s.unit_id = new.unit_id and s.version_id = new.id and (s.meaning is null or cardinality(s.role_ids) = 0)
   order by st.position, s.position limit 1;
  if found then
    raise exception '% da etapa "%" está sem %',
      coalesce('A assinatura "' || r.meaning || '"', 'A assinatura ' || (r.position + 1)), r.stage,
      case when r.no_role then 'cargo' else 'significado' end using errcode = 'PTW28';
  end if;
  select s.meaning, s.required_when_item as item, s.required_when_line as line,
         ptw.form_item(new.form, s.required_when_item) as it into r
    from ptw.sign_slot s
   where s.unit_id = new.unit_id and s.version_id = new.id and s.required_when_item is not null
     and (ptw.form_item(new.form, s.required_when_item) is null
          or (s.required_when_line is not null and not exists (
                select 1 from jsonb_array_elements(case when ptw.form_item(new.form, s.required_when_item) ->> 'kind' = 'verificacao'
                                                        then ptw.form_item(new.form, s.required_when_item) -> 'lines' else '[]' end) l
                 where l ->> 'id' = s.required_when_line)))
   limit 1;
  if found and r.it is null then
    raise exception 'A assinatura "%" depende de um item que não existe no formulário', r.meaning using errcode = 'PTW15';
  elsif found then
    raise exception 'A assinatura "%" depende da linha % que não existe no item de verificação %', r.meaning, r.line, r.item
      using errcode = 'PTW15';
  end if;
  p := ptw.form_list_problem(new.unit_id, new.form);
  if p is not null then
    raise exception 'Formulário inválido: %', p using errcode = 'PTW15';
  end if;
  return new;
end $$;
create trigger template_version_activation before update of status on ptw.template_version
  for each row when (old.status = 'rascunho' and new.status = 'ativa') execute function ptw.version_activation_check();

-- ---------- Formulário e etapa de uma PT ----------
-- O formulário vale o congelado no envio ou, no rascunho, o da versão com as listas copiadas
-- (frozen_form): o rascunho já responde e é conferido pelo formulário que o envio vai congelar.
create function ptw.permit_form(p_unit uuid, p_permit uuid) returns jsonb
  language sql stable as $$
  select coalesce(fs.form, ptw.frozen_form(pm.unit_id, pm.version_id))
    from ptw.permit pm
    left join ptw.form_snapshot fs on fs.unit_id = pm.unit_id and fs.sha256 = pm.snapshot_sha256
   where pm.unit_id = p_unit and pm.id = p_permit
$$;

-- Resposta só com a PT em andamento. Encerrada e cancelada: nunca (PTW06). A área sempre é
-- devolvida: expirada (ou suspensa sem retomada, que expira) aceita resposta só nas seções da
-- etapa Entrega; entregue, só nas etapas depois da Entrega (Aceite da área).
-- Quem respondeu é a pessoa da sessão, na hora do servidor (o que o cliente mandar é ignorado).
create function ptw.answer_guard() returns trigger language plpgsql as $$
declare
  r record := coalesce(new, old); st ptw.permit_state; ver uuid; stg text; pos integer; ent integer;
begin
  select pm.state, pm.version_id into st, ver from ptw.permit pm where pm.unit_id = r.unit_id and pm.id = r.permit_id;
  if st in ('encerrada', 'cancelada') then
    raise exception 'A PT está % e não aceita respostas', ptw.state_label(st) using errcode = 'PTW06';
  end if;
  if st in ('entregue', 'expirada') then
    select f.stage_id into stg from ptw.form_items(ptw.permit_form(r.unit_id, r.permit_id)) f
     where f.item ->> 'id' = r.item_id limit 1;
    select s.position into pos from ptw.stage s where s.unit_id = r.unit_id and s.version_id = ver and s.id::text = stg;
    select s.position into ent from ptw.stage s where s.unit_id = r.unit_id and s.version_id = ver and s.kind = 'entrega';
    if pos is null or ent is null or (st = 'expirada' and pos <> ent) or (st = 'entregue' and pos <= ent) then
      raise exception 'A PT está %: só a etapa em curso (%) aceita respostas', ptw.state_label(st),
        case when st = 'expirada' then 'Entrega' else 'Aceite da área' end using errcode = 'PTW06';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.answered_by := coalesce(ptw.current_person(), new.answered_by);
  new.answered_at := now();
  return new;
end $$;
create trigger permit_answer_guard before insert or update or delete on ptw.permit_answer
  for each row execute function ptw.answer_guard();

-- ---------- Validação das respostas ----------
-- Lista de ids de anexo desta PT, sem repetição, de um tipo aceito (accept nulo = qualquer).
create function ptw.files_problem(p_unit uuid, p_permit uuid, files jsonb, accept jsonb) returns text
  language plpgsql stable as $$
declare f jsonb; k ptw.attach_kind;
begin
  if jsonb_typeof(files) is distinct from 'array' then return 'anexos inválidos'; end if;
  for f in select * from jsonb_array_elements(files) loop
    if jsonb_typeof(f) is distinct from 'string' or not ptw.is_uuid(f #>> '{}') then
      return 'anexo fora do formato (id do anexo)';
    end if;
    select a.kind into k from ptw.attachment a
     where a.unit_id = p_unit and a.permit_id = p_permit and a.id = (f #>> '{}')::uuid;
    if not found then return 'anexo não é desta PT (' || (f #>> '{}') || ')'; end if;
    if accept is not null and not accept ? k::text then return 'tipo de anexo não aceito (' || k || ')'; end if;
  end loop;
  if jsonb_array_length(files) > (select count(distinct x) from jsonb_array_elements_text(files) x) then
    return 'anexo repetido';
  end if;
  return null;
end $$;

-- Primeiro problema da resposta (nulo = ok). Começa com "PTW08 " quando a pessoa não é elegível.
create function ptw.answer_problem(p_unit uuid, p_permit uuid, it jsonb, v jsonb, loc ltree) returns text
  language plpgsql stable as $$
declare
  k text := it ->> 'kind'; nm text := coalesce(it ->> 'label', it ->> 'id'); x jsonb; s text; n integer;
  today date; c jsonb; chi jsonb; p text;
begin
  if k = 'aviso' then return nm || ': aviso não tem resposta'; end if;
  if v ->> 't' is distinct from k then return nm || ': resposta de ' || coalesce(v ->> 't', '?') || ' para item de ' || k; end if;
  case k
    when 'texto' then
      if jsonb_typeof(v -> 'v') is distinct from 'string' then return nm || ': texto inválido'; end if;
    when 'numero' then
      if jsonb_typeof(v -> 'v') is distinct from 'number' then return nm || ': número inválido'; end if;
      if not coalesce((it ->> 'negative')::boolean, false) and (v ->> 'v')::numeric < 0 then return nm || ': número negativo'; end if;
      if scale((v ->> 'v')::numeric) > coalesce((it ->> 'decimals')::integer, 4) then return nm || ': casas decimais demais'; end if;
    when 'horario' then
      s := '^([01][0-9]|2[0-3]):[0-5][0-9]' || (case when coalesce((it ->> 'seconds')::boolean, false) then ':[0-5][0-9]' else '' end) || '$';
      if jsonb_typeof(v -> 'v') is distinct from 'string' or v ->> 'v' !~ s then return nm || ': horário inválido'; end if;
    when 'marcacao' then
      if jsonb_typeof(v -> 'ids') is distinct from 'array' or not ptw.jopt(v, 'other', 'string') then return nm || ': marcação inválida'; end if;
      if not coalesce((it ->> 'multiple')::boolean, false) and jsonb_array_length(v -> 'ids') > 1 then return nm || ': só uma opção'; end if;
      if v ? 'other' and not coalesce((it ->> 'other')::boolean, false) then return nm || ': "outro" não é aceito'; end if;
      select o into s from jsonb_array_elements_text(v -> 'ids') o
       where not exists (select 1 from jsonb_array_elements(coalesce(it -> 'options', '[]')) e where e ->> 'id' = o)
         and not (it ? 'listId' and ptw.is_uuid(o) and exists (select 1 from ptw.option_item oi
                   where oi.unit_id = p_unit and oi.list_id = (it ->> 'listId')::uuid and oi.id = o::uuid))
       limit 1;
      if found then return nm || ': opção inexistente (' || s || ')'; end if;
    when 'verificacao' then
      if jsonb_typeof(v -> 'lines') is distinct from 'object' then return nm || ': verificação inválida'; end if;
      select l.key into s from jsonb_each(v -> 'lines') l
       where not exists (select 1 from jsonb_array_elements(it -> 'lines') e where e ->> 'id' = l.key)
          or case when it ->> 'answers' = 'lista'
                  then not exists (select 1 from ptw.option_item oi where oi.unit_id = p_unit
                              and oi.list_id = (it ->> 'answerListId')::uuid
                              and oi.id = case when ptw.is_uuid(l.value ->> 'a') then (l.value ->> 'a')::uuid end)
                  else coalesce(l.value ->> 'a', '') not in (select unnest(case it ->> 'answers' when 'sim_nao_na' then array['sim', 'nao', 'na']
                                                                 when 'sim_nao' then array['sim', 'nao'] else array['confirmo'] end)) end
          or not ptw.jopt(l.value, 'note', 'string')
       limit 1;
      if found then return nm || ': linha ou resposta inválida (' || s || ')'; end if;
    when 'anexo' then
      p := ptw.files_problem(p_unit, p_permit, v -> 'files', it -> 'accept');
      if p is not null then return nm || ': ' || p; end if;
    when 'documento' then
      if jsonb_typeof(v -> 'code') is distinct from 'string' then return nm || ': código do documento inválido'; end if;
      p := ptw.files_problem(p_unit, p_permit, v -> 'files', null);
      if p is not null then return nm || ': ' || p; end if;
      if v ? 'validUntil' and ptw.iso_date(v ->> 'validUntil') is null then return nm || ': validade inválida (AAAA-MM-DD)'; end if;
    when 'data' then
      if ptw.iso_date(v ->> 'v') is null then return nm || ': data inválida (AAAA-MM-DD)'; end if;
    when 'pessoa' then
      if jsonb_typeof(v -> 'ids') is distinct from 'array' then return nm || ': pessoas inválidas'; end if;
      if not coalesce((it ->> 'multiple')::boolean, false) and jsonb_array_length(v -> 'ids') > 1 then return nm || ': só uma pessoa'; end if;
      select (now() at time zone u.timezone)::date into today from ptw.unit u where u.id = p_unit;
      for s in select jsonb_array_elements_text(v -> 'ids') loop
        if not ptw.is_uuid(s) or not exists (select 1 from ptw.person pe where pe.unit_id = p_unit and pe.id = s::uuid) then
          return nm || ': pessoa inexistente na unidade';
        end if;
        if it ? 'roleId' and not exists (select 1 from ptw.person_role pr where pr.unit_id = p_unit and pr.person_id = s::uuid
                                          and pr.role_id = (it ->> 'roleId')::uuid) then
          return nm || ': ' || (select name from ptw.person where unit_id = p_unit and id = s::uuid) || ' não tem o cargo pedido';
        end if;
        if coalesce((it ->> 'mustBeEligible')::boolean, false) then
          p := ptw.person_ineligible(p_unit, s::uuid, (it ->> 'roleId')::uuid, today, loc);
          if p is not null then
            return 'PTW08 ' || nm || ': ' || (select name from ptw.person where unit_id = p_unit and id = s::uuid) || ' não elegível (' || p || ')';
          end if;
        end if;
      end loop;
    when 'isolamento' then
      if jsonb_typeof(v -> 'rows') is distinct from 'array' then return nm || ': linhas inválidas'; end if;
      for x in select * from jsonb_array_elements(v -> 'rows') loop
        if jsonb_typeof(x -> 'id') is distinct from 'string' or jsonb_typeof(x -> 'point') is distinct from 'string'
           or jsonb_typeof(x -> 'method') is distinct from 'string' or jsonb_typeof(x -> 'lock') is distinct from 'string' then
          return nm || ': ponto fora do formato (id, point, method, lock)';
        end if;
        if x ? 'energy' and coalesce(x ->> 'energy', '') not in ('eletrica', 'mecanica', 'hidraulica', 'pneumatica', 'termica', 'quimica', 'gravitacional', 'outra') then
          return nm || ': tipo de energia inválido (' || coalesce(x ->> 'energy', '?') || ')';
        end if;
        if x ? 'zero' and coalesce(x ->> 'zero', '') not in ('sim', 'nao') then
          return nm || ': energia zero é "sim" ou "nao"';
        end if;
        if x ? 'assetId' and not (ptw.is_uuid(x ->> 'assetId') and exists (select 1 from ptw.permit_asset a
              where a.unit_id = p_unit and a.permit_id = p_permit and a.asset_id = (x ->> 'assetId')::uuid)) then
          return nm || ': o ativo do ponto ' || (x ->> 'point') || ' não é desta PT';
        end if;
        if x ? 'by' and not (ptw.is_uuid(x ->> 'by') and exists (select 1 from ptw.person pe where pe.unit_id = p_unit and pe.id = (x ->> 'by')::uuid)) then
          return nm || ': quem aplicou não existe no ponto ' || (x ->> 'point');
        end if;
      end loop;
      select count(*) - count(distinct r ->> 'id') into n from jsonb_array_elements(v -> 'rows') r;
      if n > 0 then return nm || ': linha repetida'; end if;
    when 'grupo' then
      if jsonb_typeof(v -> 'rows') is distinct from 'array' then return nm || ': linhas inválidas'; end if;
      for x in select * from jsonb_array_elements(v -> 'rows') loop
        if jsonb_typeof(x -> 'id') is distinct from 'string' or jsonb_typeof(x -> 'answers') is distinct from 'object' then
          return nm || ': linha do grupo inválida';
        end if;
        for s, c in select e.key, e.value from jsonb_each(x -> 'answers') e loop
          select ch into chi from jsonb_array_elements(it -> 'columns') ch where ch ->> 'id' = s;
          if not found then return nm || ': coluna inexistente (' || s || ')'; end if;
          p := ptw.answer_problem(p_unit, p_permit, chi, c, loc);
          if p is not null then return nm || ' › ' || p; end if;
        end loop;
      end loop;
      select count(*) - count(distinct r ->> 'id') into n from jsonb_array_elements(v -> 'rows') r;
      if n > 0 then return nm || ': linha repetida'; end if;
    else
      return nm || ': tipo de item desconhecido';
  end case;
  return null;
end $$;

-- Toda resposta é conferida contra o item do formulário da PT: estrutura (PTW15) e, no item pessoa
-- com mustBeEligible, a elegibilidade de quem é escolhido (PTW08).
create function ptw.answer_validate() returns trigger language plpgsql as $$
declare it jsonb; loc ltree; p text;
begin
  it := ptw.form_item(ptw.permit_form(new.unit_id, new.permit_id), new.item_id);
  if it is null then
    raise exception 'O item % não existe no formulário da PT', new.item_id using errcode = 'PTW15';
  end if;
  select l.path into loc from ptw.permit pm join ptw.location l on l.unit_id = pm.unit_id and l.id = pm.location_id
   where pm.unit_id = new.unit_id and pm.id = new.permit_id;
  p := ptw.answer_problem(new.unit_id, new.permit_id, it, new.value, loc);
  if p like 'PTW08 %' then
    raise exception '%', substr(p, 7) using errcode = 'PTW08';
  elsif p is not null then
    raise exception 'Resposta inválida: %', p using errcode = 'PTW15';
  end if;
  return new;
end $$;
create trigger permit_answer_validate before insert or update on ptw.permit_answer
  for each row execute function ptw.answer_validate();

-- Gravar a resposta de um item, pela pessoa da sessão. Em "verificacao", as linhas enviadas são
-- juntadas às já gravadas numa instrução só (a linha existente fica travada): dois toques rápidos em
-- linhas diferentes, de dois aparelhos, não se apagam. Devolve o valor que ficou gravado.
create function ptw.permit_answer_put(p_unit uuid, p_permit uuid, p_item text, p_value jsonb) returns jsonb
  language plpgsql as $$
declare v jsonb;
begin
  if ptw.current_person() is null then
    raise exception 'Responder exige uma pessoa na sessão' using errcode = '23502';
  end if;
  insert into ptw.permit_answer as a (unit_id, permit_id, item_id, value, answered_by)
  values (p_unit, p_permit, p_item, p_value, ptw.current_person())
  on conflict (unit_id, permit_id, item_id) do update
     set value = case when excluded.value ->> 't' = 'verificacao' and a.value ->> 't' = 'verificacao'
                           and jsonb_typeof(excluded.value -> 'lines') = 'object' and jsonb_typeof(a.value -> 'lines') = 'object'
                      then jsonb_set(excluded.value, '{lines}', (a.value -> 'lines') || (excluded.value -> 'lines'))
                      else excluded.value end,
         answered_by = excluded.answered_by
  returning a.value into v;
  return v;
end $$;

-- ---------- Bloqueio da assinatura ----------
-- Item visível: sem condição, ou a resposta do item da condição tem um dos valores de anyOf
-- (opção marcada; ou, com lineId, a resposta daquela linha da verificação).
create function ptw.answer_visible(answers jsonb, cond jsonb) returns boolean
  language sql immutable parallel safe
  return cond is null or exists (
    select 1 from jsonb_array_elements_text(cond -> 'anyOf') want
     where case when cond ? 'lineId'
                then answers -> (cond ->> 'itemId') -> 'lines' -> (cond ->> 'lineId') ->> 'a' = want
                else coalesce(answers -> (cond ->> 'itemId') -> 'ids', '[]') ? want end);

-- O que, num item respondido, impede a etapa (nulo = não impede): número fora da faixa; opção de
-- marcação que impede (blocks ou blockOptionIds); linha de verificação respondida num valor de
-- blockOn (com lista de respostas, o rótulo do item da lista); documento com código fora do formato, sem o arquivo
-- ou a validade exigidos, ou vencido; data antes de hoje (notBeforeToday) ou fora de min/max;
-- pessoa não elegível (mustBeEligible); ponto de isolamento com zero = "nao"; o mesmo dentro de grupo.
-- Datas aparecem na mensagem como dd/mm/aaaa.
create function ptw.item_blocker(p_unit uuid, it jsonb, v jsonb, today date, loc ltree) returns text
  language plpgsql stable as $$
declare
  k text := it ->> 'kind'; nm text := coalesce(it ->> 'label', it ->> 'id'); x numeric; d date; r jsonb; c jsonb; l jsonb;
  s text; b text; n integer := 0; code text;
begin
  if v is null or v ->> 't' is distinct from k then return null; end if;
  case k
    when 'numero' then
      x := (v ->> 'v')::numeric;
      if x < (it ->> 'min')::numeric or x > (it ->> 'max')::numeric then
        return nm || ' fora da faixa (' || (v ->> 'v') || ')';
      end if;
    when 'marcacao' then
      for s in select jsonb_array_elements_text(coalesce(v -> 'ids', '[]')) loop
        b := (select o ->> 'label' from jsonb_array_elements(coalesce(it -> 'options', '[]')) o
               where o ->> 'id' = s and coalesce((o ->> 'blocks')::boolean, false) limit 1);
        if b is null and coalesce(it -> 'blockOptionIds', '[]') ? s then
          b := coalesce((select oi.label from ptw.option_item oi where oi.unit_id = p_unit and oi.id = case when ptw.is_uuid(s) then s::uuid end), s);
        end if;
        if b is not null then return nm || ': “' || b || '” impede a etapa'; end if;
      end loop;
    when 'verificacao' then
      for l in select * from jsonb_array_elements(it -> 'lines') loop
        s := v -> 'lines' -> (l ->> 'id') ->> 'a';
        if s is not null and coalesce(l -> 'blockOn', '[]') ? s then
          return (l ->> 'label') || ': "' || case when it ->> 'answers' = 'lista'
                   then coalesce((select oi.label from ptw.option_item oi where oi.unit_id = p_unit and oi.id = case when ptw.is_uuid(s) then s::uuid end), s)
                   else case s when 'sim' then 'Sim' when 'nao' then 'Não' when 'na' then 'N/A' else 'Confirmo' end end
                 || '" impede a etapa';
        end if;
      end loop;
    when 'documento' then
      code := btrim(coalesce(v ->> 'code', ''));
      if code <> '' then
        if not ptw.code_matches(code, it ->> 'pattern') then return nm || ': fora do formato ' || (it ->> 'pattern'); end if;
        if coalesce((it ->> 'attach')::boolean, false) and coalesce(jsonb_array_length(v -> 'files'), 0) = 0 then
          return nm || ': falta anexar o documento';
        end if;
        if coalesce((it ->> 'validity')::boolean, false) then
          d := ptw.iso_date(v ->> 'validUntil');
          if d is null then return nm || ': falta a validade'; end if;
          if d < today then return nm || ' vencido em ' || to_char(d, 'DD/MM/YYYY'); end if;
        end if;
      end if;
    when 'data' then
      d := ptw.iso_date(v ->> 'v');
      if coalesce((it ->> 'notBeforeToday')::boolean, false) and d < today then
        return nm || ': ' || to_char(d, 'DD/MM/YYYY') || ' está antes de hoje';
      end if;
      if d < ptw.iso_date(it ->> 'min') then
        return nm || ': ' || to_char(d, 'DD/MM/YYYY') || ' está antes de ' || to_char(ptw.iso_date(it ->> 'min'), 'DD/MM/YYYY');
      end if;
      if d > ptw.iso_date(it ->> 'max') then
        return nm || ': ' || to_char(d, 'DD/MM/YYYY') || ' está depois de ' || to_char(ptw.iso_date(it ->> 'max'), 'DD/MM/YYYY');
      end if;
    when 'pessoa' then
      if coalesce((it ->> 'mustBeEligible')::boolean, false) then
        for s in select jsonb_array_elements_text(v -> 'ids') loop
          b := case when not ptw.is_uuid(s) then 'pessoa inexistente'
                    when it ? 'roleId' and not exists (select 1 from ptw.person_role pr where pr.unit_id = p_unit
                           and pr.person_id = s::uuid and pr.role_id = (it ->> 'roleId')::uuid) then 'não tem o cargo'
                    else ptw.person_ineligible(p_unit, s::uuid, (it ->> 'roleId')::uuid, today, loc) end;
          if b is not null then
            return nm || ': ' || coalesce((select name from ptw.person where unit_id = p_unit and ptw.is_uuid(s) and id = s::uuid), s)
                   || ' não elegível (' || b || ')';
          end if;
        end loop;
      end if;
    when 'isolamento' then
      for r in select * from jsonb_array_elements(v -> 'rows') loop
        n := n + 1;
        if r ->> 'zero' = 'nao' then
          return nm || ' · ponto ' || n || coalesce(' (' || nullif(btrim(r ->> 'point'), '') || ')', '') || ': energia zero não verificada';
        end if;
      end loop;
    when 'grupo' then
      for r in select * from jsonb_array_elements(v -> 'rows') loop
        for c in select * from jsonb_array_elements(it -> 'columns') loop
          b := ptw.item_blocker(p_unit, c, r -> 'answers' -> (c ->> 'id'), today, loc);
          if b is not null then return nm || ' › ' || b; end if;
        end loop;
      end loop;
    else
      null;
  end case;
  return null;
end $$;

-- Primeiro bloqueio nas seções da etapa p_stage_pos e das anteriores (seção sem etapa vale para
-- todas); item oculto pela condição não bloqueia. Pessoa, data e validade são avaliadas na hora.
create function ptw.permit_blocker(p_unit uuid, p_permit uuid, p_stage_pos integer) returns text
  language plpgsql stable as $$
declare form jsonb; answers jsonb; stages jsonb; today date; loc ltree; r record; b text;
begin
  select ptw.permit_form(pm.unit_id, pm.id), (now() at time zone u.timezone)::date, l.path,
         (select jsonb_object_agg(st.id::text, st.position) from ptw.stage st where st.unit_id = pm.unit_id and st.version_id = pm.version_id)
    into form, today, loc, stages
    from ptw.permit pm
    join ptw.unit u on u.id = pm.unit_id
    join ptw.location l on l.unit_id = pm.unit_id and l.id = pm.location_id
   where pm.unit_id = p_unit and pm.id = p_permit;
  select jsonb_object_agg(item_id, value) into answers from ptw.permit_answer where unit_id = p_unit and permit_id = p_permit;
  if answers is null then return null; end if;
  for r in select f.item, f.stage_id from ptw.form_items(form) f where answers ? (f.item ->> 'id') loop
    continue when coalesce((stages ->> r.stage_id)::integer, 0) > p_stage_pos;
    continue when not ptw.answer_visible(answers, r.item -> 'showWhen');
    b := ptw.item_blocker(p_unit, r.item, answers -> (r.item ->> 'id'), today, loc);
    if b is not null then return b; end if;
  end loop;
  return null;
end $$;

-- O que falta responder num item (nulo = completo); espelho de `itemProblems().missing` do app:
-- obrigatório vazio; anexo abaixo do mínimo; documento sem código/arquivo/validade; verificação com
-- linha sem resposta (obrigatória) ou sem a justificativa de noteOn; isolamento e grupo abaixo das
-- linhas mínimas, com pontos/colunas incompletos. Item opcional vazio não falta.
create function ptw.item_missing(it jsonb, v jsonb) returns text
  language plpgsql immutable as $$
declare
  k text := it ->> 'kind'; nm text := coalesce(it ->> 'label', it ->> 'id'); req boolean := coalesce((it ->> 'required')::boolean, false);
  n integer; need integer; code text; r jsonb; c jsonb; l jsonb; m text; a text; lack text[]; i integer := 0;
begin
  if v is not null and v ->> 't' is distinct from k then v := null; end if;
  case k
    when 'aviso' then return null;
    when 'texto', 'numero', 'data', 'horario' then
      if req and btrim(coalesce(v ->> 'v', '')) = '' then return nm; end if;
    when 'marcacao' then
      if req and jsonb_array_length(coalesce(v -> 'ids', '[]')) = 0 and btrim(coalesce(v ->> 'other', '')) = '' then return nm; end if;
    when 'pessoa' then
      if req and jsonb_array_length(coalesce(v -> 'ids', '[]')) = 0 then return nm; end if;
    when 'anexo' then
      n := jsonb_array_length(coalesce(v -> 'files', '[]'));
      if req and n < greatest(1, coalesce((it ->> 'min')::integer, 0)) then
        return case when coalesce((it ->> 'min')::integer, 0) > 1 then nm || ': ' || n || ' de ' || (it ->> 'min') else nm end;
      end if;
    when 'documento' then
      code := btrim(coalesce(v ->> 'code', ''));
      if code = '' and req then return nm; end if;
      if coalesce((it ->> 'attach')::boolean, false) and (code <> '' or req) and jsonb_array_length(coalesce(v -> 'files', '[]')) = 0 then
        return nm || ': anexar o documento';
      end if;
      if coalesce((it ->> 'validity')::boolean, false) and (code <> '' or req) and ptw.iso_date(v ->> 'validUntil') is null then
        return nm || ': validade';
      end if;
    when 'verificacao' then
      for l in select * from jsonb_array_elements(it -> 'lines') loop
        a := v -> 'lines' -> (l ->> 'id') ->> 'a';
        if a is null then
          if req then return nm || ': ' || (l ->> 'label'); end if;
        elsif coalesce(l -> 'noteOn', '[]') ? a and btrim(coalesce(v -> 'lines' -> (l ->> 'id') ->> 'note', '')) = '' then
          return (l ->> 'label') || ': justificar a resposta';
        end if;
      end loop;
    when 'isolamento' then
      n := jsonb_array_length(coalesce(v -> 'rows', '[]'));
      need := greatest(case when req then 1 else 0 end, coalesce((it ->> 'minRows')::integer, 0));
      if n < need then return case when need > 1 then nm || ': ' || n || ' de ' || need || ' pontos' else nm end; end if;
      for r in select * from jsonb_array_elements(coalesce(v -> 'rows', '[]')) loop
        i := i + 1;
        lack := array_remove(array[
          case when btrim(coalesce(r ->> 'point', '')) = '' then 'ponto' end,
          case when coalesce(r ->> 'energy', '') = '' then 'energia' end,
          case when btrim(coalesce(r ->> 'method', '')) = '' then 'método' end,
          case when btrim(coalesce(r ->> 'lock', '')) = '' then 'cadeado/etiqueta' end,
          case when coalesce(r ->> 'zero', '') = '' then 'energia zero' end,
          case when coalesce(r ->> 'by', '') = '' then 'aplicado por' end], null);
        if cardinality(lack) > 0 then return nm || ' · ponto ' || i || ': ' || array_to_string(lack, ', '); end if;
      end loop;
    when 'grupo' then
      n := jsonb_array_length(coalesce(v -> 'rows', '[]'));
      need := greatest(case when req then 1 else 0 end, coalesce((it ->> 'minRows')::integer, 0));
      if n < need then return case when need > 1 then nm || ': ' || n || ' de ' || need || ' linhas' else nm end; end if;
      for r in select * from jsonb_array_elements(coalesce(v -> 'rows', '[]')) loop
        i := i + 1;
        for c in select * from jsonb_array_elements(coalesce(it -> 'columns', '[]')) loop
          m := ptw.item_missing(c, r -> 'answers' -> (c ->> 'id'));
          if m is not null then return nm || ' · linha ' || i || ' · ' || m; end if;
        end loop;
      end loop;
    else null;
  end case;
  return null;
end $$;

-- Primeiro item que falta nas seções da etapa p_stage (seção sem etapa conta para a primeira etapa
-- da versão); item oculto pela condição não conta; itens de outras etapas não contam.
create function ptw.permit_missing(p_unit uuid, p_permit uuid, p_stage text) returns text
  language plpgsql stable as $$
declare form jsonb; answers jsonb; first_stage text; r record; m text;
begin
  select ptw.permit_form(pm.unit_id, pm.id),
         (select st.id::text from ptw.stage st where st.unit_id = pm.unit_id and st.version_id = pm.version_id order by st.position limit 1)
    into form, first_stage
    from ptw.permit pm where pm.unit_id = p_unit and pm.id = p_permit;
  select coalesce(jsonb_object_agg(item_id, value), '{}') into answers from ptw.permit_answer where unit_id = p_unit and permit_id = p_permit;
  for r in select f.item from ptw.form_items(form) f
            where coalesce(f.stage_id, first_stage) = p_stage loop
    continue when not ptw.answer_visible(answers, r.item -> 'showWhen');
    m := ptw.item_missing(r.item, answers -> (r.item ->> 'id'));
    if m is not null then return m; end if;
  end loop;
  return null;
end $$;

-- A assinatura de uma etapa só entra sem bloqueio nas seções até ela e com as seções dela completas
-- (PTW16). Outra assinatura ativa da mesma etapa e revisão já passou pela completude.
create function ptw.signature_gate() returns trigger language plpgsql as $$
declare pos integer; b text; stg uuid;
begin
  select st.position, st.id into pos, stg from ptw.sign_slot sl join ptw.stage st on st.unit_id = sl.unit_id and st.id = sl.stage_id
   where sl.unit_id = new.unit_id and sl.id = new.slot_id;
  b := ptw.permit_blocker(new.unit_id, new.permit_id, coalesce(pos, 0));
  if b is null and stg is not null and not exists (
       select 1 from ptw.signature g join ptw.sign_slot s2 on s2.unit_id = g.unit_id and s2.id = g.slot_id
        where g.unit_id = new.unit_id and g.permit_id = new.permit_id and g.rev = new.rev and g.voided_at is null and s2.stage_id = stg) then
    b := ptw.permit_missing(new.unit_id, new.permit_id, stg::text);
    if b is not null then b := 'Falta responder: ' || b; end if;
  end if;
  if b is not null then
    raise exception 'Assinatura bloqueada: %', b using errcode = 'PTW16';
  end if;
  return new;
end $$;
create trigger signature_gate before insert on ptw.signature
  for each row execute function ptw.signature_gate();
