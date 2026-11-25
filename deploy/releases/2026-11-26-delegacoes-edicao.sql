-- Publicação 26/11/2026: edição de delegação agendada (SPEC 003). Calendário e coluna Ações são só da tela.
-- Atualização para um banco que já roda a publicação de 25/11/2026 (2026-11-25-grupos-perfis.sql).
-- Não cria tabela nem altera dados: troca a guarda da delegação e a regra de auditoria, e libera o UPDATE
-- dos campos editáveis para a API. Rodar como dono (postgres do Supabase), numa transação só.
-- Ensaiado em 25/11/2026: esquema de 25/11 → este script → estrutura idêntica à do esquema novo (pg_dump -s).
begin;
set local search_path = ptw, public;
set local lock_timeout = '10s';

-- 1) Guarda da delegação: além de revogar, edita a agendada (antes do início, sem trocar o delegante).
create or replace function ptw.delegation_guard() returns trigger language plpgsql as $$
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
    -- Edição (SPEC 003): só enquanto agendada, sem trocar o delegante; tudo é conferido de novo abaixo.
    if old.starts_at<=clock_timestamp() then
      raise check_violation using message='A delegação já entrou em vigor: não pode mais ser editada. Revogue e crie outra, se precisar.';
    end if;
    if new.delegator_id<>old.delegator_id or new.id<>old.id or new.unit_id<>old.unit_id then
      raise check_violation using message='O delegante não pode ser trocado: revogue e crie outra delegação';
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

-- 2) Auditoria: a edição vira o evento delegacao.alterada (a revogação continua delegacao.revogada).
create or replace function ptw.audit_row() returns trigger
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
  elsif tbl = 'delegation' and tg_op = 'UPDATE' and r ->> 'revoked_at' is null then
    act := 'delegacao.alterada'; txt := 'Delegação alterada';
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

-- 3) A API pode atualizar os campos editáveis (o delegante e a autoria continuam fechados).
grant update (revoked_at, revoked_by, revoked_reason, slot_id, delegate_id, scope_location_id, starts_at, ends_at, reason) on ptw.delegation to ptw_app;

-- 4) Registro na trilha.
select ptw.audit_system('sistema.esquema.alterado', 'Publicação 26/11/2026: edição de delegação agendada',
  jsonb_build_object('publicacao', '2026-11-26-delegacoes-edicao', 'arquivos', '{"00_base.sql": "d9c591c02cc5b647ff69102fa19c40effdb2248c85d6b686899d7677d0410722", "10_cadastro.sql": "4573110373f4de4dd8860c280e74a26e2a9a4d6ceb36e1f30daed687d41b6003", "20_modelos.sql": "b868bb983ae13a339bbf1c9cd47dd66df917b1b0dc20f24f942d72c179b56fbe", "25_appearance.sql": "f4a85bcf65df16c2a0553181d7a41a89600bdeb3c3fe14c288ee60d0a563728f", "26_governance.sql": "5c028be082ad806f456762602d78f1c175455ce480a87a54e39dd7d3b1a244f8", "30_pt.sql": "cfd62acb3bef8ee3ad651e879b5b1c291312032f13309a711cdcd1d0bc96620f", "40_formulario.sql": "8a7f24735d929e2e5ab19a120a44666c108b57b1d79d71f3a484b240b681fbd3", "45_eletrica.sql": "eedf1c321325ccc8da846e1d22356b36d40b61efb587cb87ba818116be385cf3", "50_auditoria.sql": "bed5f4a715aa90abf8212a725c48fd45fab7d80b895ac98f13d6626fa0ebcd7a", "60_acesso.sql": "c4b83cf249ecba89280fba6dbff2a72072e8db83dd66f7a950788744481e3723"}'::jsonb));
commit;
