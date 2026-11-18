-- Electrical controls are opt-in, immutable template/form policy, never inferred from model names.
set search_path = ptw, public;

create function ptw.electrical_policy_problem(f jsonb) returns text language plpgsql immutable as $$
declare p jsonb := f -> 'electrical'; k text; i jsonb; seq jsonb; ref text;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'object' or coalesce(p ->> 'standard', '') not in ('vigente2019', 'preparacao2027') then return 'Referência NR-10 inválida'; end if;
  foreach k in array array['procedure', 'riskAssessment', 'authorizations', 'workKind'] loop
    i := ptw.form_item(f, p ->> k);
    if i is null or i ->> 'required' is distinct from 'true' or i ? 'showWhen' then return 'Política elétrica exige itens obrigatórios e visíveis'; end if;
    if k <> 'workKind' and (i ->> 'kind' <> 'documento' or i ->> 'attach' is distinct from 'true' or i ->> 'validity' is distinct from 'true') then return 'Documento elétrico exige anexo e validade'; end if;
    if k = 'workKind' and (i ->> 'kind' <> 'marcacao' or i ->> 'multiple' = 'true' or i ->> 'other' = 'true' or i ? 'listId'
      or jsonb_array_length(i -> 'options') <> 2) then return 'Classificação elétrica inválida'; end if;
  end loop;
  foreach k in array array['isolation', 'restoration'] loop
    seq := p -> k;
    if jsonb_typeof(seq) is distinct from 'array' then return 'Sequência elétrica inválida'; end if;
    if jsonb_array_length(seq) = 0 or (select count(distinct value) from jsonb_array_elements(seq)) <> jsonb_array_length(seq) then return 'Sequência elétrica inválida'; end if;
    for ref in select jsonb_array_elements_text(seq) loop
      i := ptw.form_item(f, ref);
      if i is null or i ->> 'required' is distinct from 'true' or i ? 'showWhen' or i ->> 'kind' <> 'verificacao'
        or i ->> 'answers' <> 'sim_nao' or jsonb_array_length(i -> 'lines') <> 1 or not (i -> 'lines' -> 0 -> 'blockOn') ? 'nao' then return 'Etapa elétrica exige uma verificação obrigatória Sim/Não'; end if;
    end loop;
  end loop;
  if exists (select 1 from jsonb_array_elements_text(p -> 'isolation') a join jsonb_array_elements_text(p -> 'restoration') b on a.value = b.value) then return 'Sequência elétrica inválida'; end if;
  if p ->> 'standard' = 'preparacao2027' and not p ? 'shift' then return 'Modelo 2027 exige os limites do turno'; end if;
  if p ? 'shift' then
    foreach k in array array['startDate', 'startTime', 'endDate', 'endTime'] loop
      i := ptw.form_item(f, p -> 'shift' ->> k);
      if i is null or i ->> 'required' is distinct from 'true' or i ? 'showWhen'
        or i ->> 'kind' <> (case when k like '%Date' then 'data' else 'horario' end) then return 'Limites do turno inválidos'; end if;
    end loop;
  end if;
  return null;
end $$;

create function ptw.electrical_template_guard() returns trigger language plpgsql as $$
declare problem text; p jsonb := new.form -> 'electrical'; k text; ref text; st record;
begin
  problem := ptw.electrical_policy_problem(new.form);
  if problem is not null then raise exception '%', problem using errcode = 'PTW34'; end if;
  if p is not null and new.status = 'ativa' then
    foreach k in array array['procedure', 'riskAssessment', 'authorizations', 'workKind'] loop
      select s.kind into st from ptw.form_items(new.form) f join ptw.stage s on s.unit_id = new.unit_id and s.id::text = f.stage_id
        where f.item ->> 'id' = p ->> k and s.version_id = new.id;
      if not found or st.kind is distinct from 'solicitacao'::ptw.stage_kind then raise exception 'Documentos, classificação e turno devem estar na Solicitação' using errcode = 'PTW34'; end if;
    end loop;
    for ref in select value from jsonb_each_text(coalesce(p -> 'shift', '{}')) loop
      select s.kind into st from ptw.form_items(new.form) f join ptw.stage s on s.unit_id = new.unit_id and s.id::text = f.stage_id
        where f.item ->> 'id' = ref and s.version_id = new.id;
      if not found or st.kind is distinct from 'solicitacao'::ptw.stage_kind then raise exception 'Documentos, classificação e turno devem estar na Solicitação' using errcode = 'PTW34'; end if;
    end loop;
    foreach k in array array['isolation', 'restoration'] loop
      for ref in select jsonb_array_elements_text(p -> k) loop
        select s.kind, s.position into st from ptw.form_items(new.form) f join ptw.stage s on s.unit_id = new.unit_id and s.id::text = f.stage_id
          where f.item ->> 'id' = ref and s.version_id = new.id;
        if not found or (k = 'restoration' and st.kind is distinct from 'aceite_area'::ptw.stage_kind)
          or (k = 'isolation' and st.position >= (select position from ptw.stage where unit_id = new.unit_id and version_id = new.id and kind = 'emissao')) then
          raise exception 'Isolamento deve preceder Emissão; reenergização pertence ao Aceite da área' using errcode = 'PTW34';
        end if;
      end loop;
    end loop;
  end if;
  return new;
end $$;
create trigger electrical_template_guard before insert or update on ptw.template_version for each row execute function ptw.electrical_template_guard();

create table ptw.permit_revalidation (
  unit_id uuid not null,
  id uuid not null default uuidv7(),
  permit_id uuid not null,
  revision integer not null,
  old_window tstzrange not null,
  new_window tstzrange not null,
  shift_window tstzrange not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  conditions_unchanged boolean not null check (conditions_unchanged),
  team_unchanged boolean not null check (team_unchanged),
  assessment_confirmed boolean not null check (assessment_confirmed),
  team_sha256 bytea not null,
  person_id uuid not null,
  at timestamptz not null default now(),
  primary key (unit_id, id),
  foreign key (unit_id, permit_id) references ptw.permit (unit_id, id),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id),
  check (not isempty(new_window) and not lower_inf(new_window) and not upper_inf(new_window) and new_window <@ shift_window)
);
create index permit_revalidation_ix on ptw.permit_revalidation(unit_id, permit_id, at desc, id desc);
create trigger permit_revalidation_frozen before update or delete on ptw.permit_revalidation for each row execute function ptw.forbid_change();
create trigger touch_permit before insert on ptw.permit_revalidation for each row execute function ptw.permit_touch();

-- Latest revalidation replaces the shift, never the original signed form answers.
create function ptw.electrical_shift(p_unit uuid, p_permit uuid) returns tstzrange language plpgsql stable as $$
declare sh jsonb; a jsonb; tz text; w tstzrange; sd text; ed text; st text; et text;
begin
  select shift_window into w from ptw.permit_revalidation where unit_id = p_unit and permit_id = p_permit order by at desc, id desc limit 1;
  if w is not null then return w; end if;
  select ptw.permit_form(p_unit, p_permit) -> 'electrical' -> 'shift', u.timezone into sh, tz
    from ptw.permit p join ptw.unit u on u.id = p.unit_id where p.unit_id = p_unit and p.id = p_permit;
  if sh is null then return null; end if;
  select jsonb_object_agg(item_id, value) into a from ptw.permit_answer where unit_id = p_unit and permit_id = p_permit;
  sd := a -> (sh ->> 'startDate') ->> 'v'; ed := a -> (sh ->> 'endDate') ->> 'v';
  st := a -> (sh ->> 'startTime') ->> 'v'; et := a -> (sh ->> 'endTime') ->> 'v';
  if sd is null or ed is null or st is null or et is null then return null; end if;
  if ((ed || 'T' || et)::timestamp at time zone tz) <= ((sd || 'T' || st)::timestamp at time zone tz) then return null; end if;
  return tstzrange((sd || 'T' || st)::timestamp at time zone tz, (ed || 'T' || et)::timestamp at time zone tz, '[)');
end $$;

create function ptw.electrical_window_check(p_unit uuid, p_permit uuid, w tstzrange) returns void language plpgsql stable as $$
declare sh tstzrange; first_start timestamptz; ver uuid;
begin
  if ptw.permit_form(p_unit, p_permit) -> 'electrical' ->> 'standard' is distinct from 'preparacao2027' then return; end if;
  sh := ptw.electrical_shift(p_unit, p_permit);
  if sh is null or not (w <@ sh) then raise exception 'A janela da PT deve estar contida no turno informado' using errcode = 'PTW34'; end if;
  select version_id, coalesce((select min(lower(r.old_window)) from ptw.permit_revalidation r where r.unit_id=p_unit and r.permit_id=p_permit), lower(work_window))
    into ver, first_start from ptw.permit where unit_id=p_unit and id=p_permit;
  perform ptw.window_check(p_unit, ver, tstzrange(first_start, upper(w), '[)'));
end $$;

-- Sequence is recorded one item at a time; absence or a negative predecessor stops the next write.
create function ptw.electrical_answer_guard() returns trigger language plpgsql as $$
declare p jsonb; seq jsonb; ref text; a jsonb; i jsonb;
begin
  p := ptw.permit_form(new.unit_id, new.permit_id) -> 'electrical';
  if p is null then return new; end if;
  for seq in select p -> 'isolation' union all select p -> 'restoration' loop
    if not seq ? new.item_id then continue; end if;
    for ref in select jsonb_array_elements_text(seq) loop
      exit when ref = new.item_id;
      select value into a from ptw.permit_answer where unit_id = new.unit_id and permit_id = new.permit_id and item_id = ref;
      i := ptw.form_item(ptw.permit_form(new.unit_id, new.permit_id), ref);
      if a -> 'lines' -> (i -> 'lines' -> 0 ->> 'id') ->> 'a' is distinct from 'sim' then
        raise exception 'Confirme as verificações anteriores na ordem do procedimento' using errcode = 'PTW34';
      end if;
    end loop;
  end loop;
  return new;
end $$;
create trigger electrical_answer_guard before insert or update on ptw.permit_answer for each row execute function ptw.electrical_answer_guard();

create function ptw.electrical_team_check(p_unit uuid, p_permit uuid) returns void language plpgsql stable as $$
begin
  if ptw.permit_form(p_unit,p_permit) -> 'electrical' is null then return; end if;
  if not exists (select 1 from ptw.permit_team where unit_id=p_unit and permit_id=p_permit) then
    raise exception 'Informe a equipe e suas autorizações para esta PT' using errcode = 'PTW34';
  end if;
  if exists (select 1 from ptw.permit_team t join ptw.permit p on p.unit_id=t.unit_id and p.id=t.permit_id
    join ptw.unit u on u.id=p.unit_id join ptw.location l on l.unit_id=p.unit_id and l.id=p.location_id
    where t.unit_id=p_unit and t.permit_id=p_permit and ptw.person_ineligible(t.unit_id,t.person_id,t.role_id,(now() at time zone u.timezone)::date,l.path) is not null) then
    raise exception 'Equipe contém pessoa não elegível' using errcode = 'PTW34';
  end if;
end $$;

create function ptw.electrical_signature_guard() returns trigger language plpgsql as $$
declare k ptw.stage_kind; w tstzrange;
begin
  select st.kind into k from ptw.sign_slot sl join ptw.stage st on st.unit_id = sl.unit_id and st.id = sl.stage_id where sl.unit_id = new.unit_id and sl.id = new.slot_id;
  if k in ('solicitacao', 'emissao', 'aceite_campo') then
    select work_window into w from ptw.permit where unit_id = new.unit_id and id = new.permit_id;
    perform ptw.electrical_window_check(new.unit_id, new.permit_id, w);
    perform ptw.electrical_team_check(new.unit_id, new.permit_id);
  end if;
  return new;
end $$;
create trigger electrical_signature_guard before insert on ptw.signature for each row execute function ptw.electrical_signature_guard();

-- Guard INSERT as well as the public act: direct SQL by the app role cannot forge a revalidation.
create function ptw.revalidation_guard() returns trigger language plpgsql as $$
declare pm ptw.permit; me uuid := ptw.current_person(); why text; problem text; pos integer;
begin
  select * into pm from ptw.permit where unit_id = new.unit_id and id = new.permit_id for no key update;
  if ptw.permit_form(new.unit_id, new.permit_id) -> 'electrical' ->> 'standard' is distinct from 'preparacao2027'
    or pm.state not in ('emitida', 'ativa', 'suspensa', 'expirada') then raise exception 'Esta PT não admite revalidação' using errcode = 'PTW34'; end if;
  if pm.hold_reason is not null then raise exception 'Resolva a parada registrada antes de revalidar' using errcode = 'PTW34'; end if;
  if me is null or not exists (select 1 from ptw.signature g join ptw.sign_slot sl on sl.unit_id = g.unit_id and sl.id = g.slot_id
    join ptw.stage st on st.unit_id = sl.unit_id and st.id = sl.stage_id where g.unit_id = pm.unit_id and g.permit_id = pm.id
    and g.rev = pm.revision and g.voided_at is null and g.person_id = me and st.kind = 'emissao') then
    raise exception 'Só o responsável que autorizou esta PT pode revalidá-la' using errcode = 'PTW34';
  end if;
  why := ptw.issuer_ineligible(pm.unit_id, pm.version_id, pm.location_id, me);
  if why is not null then raise exception 'Responsável não elegível: %', why using errcode = 'PTW34'; end if;
  if new.conditions_unchanged is distinct from true or new.team_unchanged is distinct from true or new.assessment_confirmed is distinct from true then
    raise exception 'Revalidação exige condições e equipe preservadas e avaliação no local; mudanças exigem nova PT' using errcode = 'PTW34';
  end if;
  if new.shift_window is null or isempty(new.shift_window) or not (new.shift_window @> now()) or upper_inf(new.shift_window) or lower_inf(new.shift_window)
    or new.new_window is null or upper_inf(new.new_window) or upper(new.new_window) <= now()
    or lower(new.new_window) <> now() or not (new.new_window <@ new.shift_window) or length(btrim(coalesce(new.reason,''))) not between 1 and 500 then
    raise exception 'Informe turno atual, fim da atividade dentro do turno e justificativa' using errcode = 'PTW34';
  end if;
  perform ptw.window_check(pm.unit_id, pm.version_id, tstzrange(coalesce(
    (select min(lower(r.old_window)) from ptw.permit_revalidation r where r.unit_id=pm.unit_id and r.permit_id=pm.id), lower(pm.work_window)), upper(new.new_window), '[)'));
  select max(position) into pos from ptw.stage where unit_id = pm.unit_id and version_id = pm.version_id and kind = 'aceite_campo';
  problem := ptw.permit_blocker(pm.unit_id, pm.id, pos);
  if problem is not null then raise exception 'Revalidação bloqueada: %', problem using errcode = 'PTW34'; end if;
  perform ptw.electrical_team_check(pm.unit_id, pm.id);
  new.person_id := me; new.at := now(); new.revision := pm.revision; new.old_window := pm.work_window;
  select sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(role_id, person_id) order by role_id, person_id), '[]')::text,'UTF8'))
    into new.team_sha256 from ptw.permit_team where unit_id = pm.unit_id and permit_id = pm.id;
  new.reason := btrim(new.reason);
  return new;
end $$;
create trigger revalidation_guard before insert on ptw.permit_revalidation for each row execute function ptw.revalidation_guard();

create function ptw.permit_revalidate(p_unit uuid, p_permit uuid, p_start timestamptz, p_end timestamptz, p_new_end timestamptz,
  p_reason text, p_conditions boolean, p_team boolean, p_assessment boolean) returns uuid language plpgsql as $$
declare rid uuid;
begin
  perform 1 from ptw.permit where unit_id = p_unit and id = p_permit for no key update;
  insert into ptw.permit_revalidation(unit_id, permit_id, new_window, shift_window, reason, conditions_unchanged, team_unchanged, assessment_confirmed)
    values (p_unit, p_permit, tstzrange(now(), p_new_end, '[)'), tstzrange(p_start, p_end, '[)'), p_reason, p_conditions, p_team, p_assessment) returning id into rid;
  update ptw.signature g set voided_at = now(), voided_reason = 'Revalidação: novo aceite no campo necessário'
    where unit_id = p_unit and permit_id = p_permit and voided_at is null and slot_id in
      (select sl.id from ptw.sign_slot sl join ptw.stage st on st.unit_id = sl.unit_id and st.id = sl.stage_id where sl.unit_id = p_unit and st.kind = 'aceite_campo');
  update ptw.permit set work_window = tstzrange(now(), p_new_end, '[)'), state = 'suspensa', state_note = null,
    resumed_reason = p_reason, resumed_by = ptw.current_person(), resumed_at = now() where unit_id = p_unit and id = p_permit;
  return rid;
end $$;
