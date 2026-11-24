-- Testes das regras na raiz. Rode como dono sobre um banco recém-criado (db/schema):
--   psql -v ON_ERROR_STOP=1 -f tests/invariants.sql
-- Cada verificação levanta exceção se falhar; o fim imprime "OK: n verificações".
\set QUIET on
set search_path = ptw, public;

create schema if not exists t;
create table if not exists t.ok (n serial, label text);
grant usage on schema t to ptw_app;
grant insert, select on t.ok to ptw_app;
grant usage on sequence t.ok_n_seq to ptw_app;

-- Executa sql e exige o código de erro esperado (ou sucesso, se code = '').
create or replace function t.expect(code text, label text, sql text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate = code then insert into t.ok (label) values (label); return; end if;
    raise exception 'FALHOU [%]: esperado %, veio % (%)', label, nullif(code, ''), sqlstate, sqlerrm;
  end;
  if code <> '' then raise exception 'FALHOU [%]: esperado erro %, passou', label, code; end if;
  insert into t.ok (label) values (label);
end $$;
create or replace function t.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU [%]', label; end if;
  insert into t.ok (label) values (label);
end $$;
-- Atalhos: t.id('d1') = 00000000-0000-7000-8000-0000000000d1; t.ev(ação) = último evento; t.n() = total.
create or replace function t.id(s text) returns uuid language sql immutable
  return ('00000000-0000-7000-8000-' || lpad(s, 12, '0'))::uuid;
create or replace function t.ev(a text) returns ptw.audit_event language sql stable
  as $$ select * from ptw.audit_event where action = a order by seq desc limit 1 $$;
create or replace function t.n() returns bigint language sql stable
  as $$ select count(*) from ptw.audit_event $$;
-- Formulário de teste com todos os tipos de item (estrutura em db/schema/40_formulario.sql);
-- t.ans grava uma resposta na P8.
create or replace function t.form() returns jsonb language sql immutable return $j${"sections": [
  {"id": "s0", "title": "Pedido", "stageId": "00000000-0000-7000-8000-0000000000f1", "items": [
    {"id": "x", "kind": "texto", "label": "Observação", "required": false, "long": true},
    {"id": "aviso", "kind": "aviso", "label": "", "required": false, "text": "Use os EPIs da área"},
    {"id": "m", "kind": "marcacao", "label": "Riscos", "required": true, "options": [{"id": "a", "label": "Choque"}, {"id": "b", "label": "Arco elétrico"}], "multiple": true, "other": false},
    {"id": "dia", "kind": "data", "label": "Data do serviço", "required": true, "notBeforeToday": true, "max": "2099-12-31"},
    {"id": "resp", "kind": "pessoa", "label": "Responsável", "required": true, "multiple": false, "roleId": "00000000-0000-7000-8000-0000000000a3", "mustBeEligible": true}]},
  {"id": "s1", "title": "Liberação", "stageId": "00000000-0000-7000-8000-0000000000f2", "items": [
    {"id": "o2", "kind": "numero", "label": "O₂", "required": true, "unit": "%", "decimals": 1, "negative": false, "min": 19.5, "max": 23},
    {"id": "arco", "kind": "numero", "label": "Distância do arco", "required": false, "unit": "m", "decimals": 1, "negative": false, "min": 0, "max": 5, "showWhen": {"itemId": "m", "anyOf": ["b"]}},
    {"id": "hora", "kind": "horario", "label": "Hora da medição", "required": true, "seconds": false},
    {"id": "v", "kind": "verificacao", "label": "Checagens", "required": true, "answers": "sim_nao_na", "lines": [{"id": "l1", "label": "Área isolada", "blockOn": ["nao"], "noteOn": ["na"]}]},
    {"id": "foto", "kind": "anexo", "label": "Foto do bloqueio", "required": false, "accept": ["foto"], "min": 1, "hint": ""},
    {"id": "doc", "kind": "documento", "label": "ASO", "required": true, "pattern": "NR-##-###", "attach": false, "validity": true},
    {"id": "iso", "kind": "isolamento", "label": "Pontos de isolamento", "required": true, "minRows": 1},
    {"id": "grp", "kind": "grupo", "label": "Medições", "required": true, "minRows": 1, "columns": [
      {"id": "g_t", "kind": "texto", "label": "Ponto", "required": true, "long": false},
      {"id": "g_n", "kind": "numero", "label": "LEL", "required": true, "unit": "%", "decimals": 0, "negative": false, "min": 0, "max": 10},
      {"id": "g_h", "kind": "horario", "label": "Hora", "required": false, "seconds": false}]}]}]}$j$::jsonb;
create function t.ans(item text, v text) returns void language sql as $$
  insert into ptw.permit_answer (unit_id, permit_id, item_id, value, answered_by)
  values (ptw.current_unit(), t.id('108'), item, v::jsonb, t.id('d2'))
  on conflict (unit_id, permit_id, item_id) do update set value = excluded.value $$;
-- Responde tudo o que a etapa Emissão do t.form() exige (completude da assinatura, PTW16) na PT p.
create function t.fill_emissao(p uuid) returns void language sql as $$
  insert into ptw.permit_answer (unit_id, permit_id, item_id, value, answered_by)
  select ptw.current_unit(), p, a.i, a.v::jsonb, t.id('d2') from (values
    ('o2', '{"t": "numero", "v": 20.9}'),
    ('hora', '{"t": "horario", "v": "07:30"}'),
    ('v', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}'),
    ('doc', '{"t": "documento", "code": "NR-10-123", "files": [], "validUntil": "2030-01-31"}'),
    ('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "eletrica", "method": "Disjuntor aberto", "lock": "C-114", "zero": "sim", "by": "00000000-0000-7000-8000-0000000000d3"}]}'),
    ('grp', '{"t": "grupo", "rows": [{"id": "r1", "answers": {"g_t": {"t": "texto", "v": "Boca 1"}, "g_n": {"t": "numero", "v": 5}}}]}')) a(i, v)
  on conflict (unit_id, permit_id, item_id) do update set value = excluded.value $$;
-- Origem da importação válida (G1) para o pacote com o conteúdo dado.
create function t.src(pkg text) returns jsonb language sql immutable return jsonb_build_object(
  'pacote', jsonb_build_object('arquivo', 'pt-espaco.ptw-modelo.json', 'sha256', encode(sha256(convert_to(pkg, 'UTF8')), 'hex')),
  'documentos', jsonb_build_array(jsonb_build_object('arquivo', 'PET-confined.pdf', 'sha256', repeat('ab', 32), 'paginas', 2)),
  'ferramenta', 'ptw-modelo-de-formulario 1.0', 'modelo', 'claude-opus', 'idioma', jsonb_build_object('documento', 'en', 'rotulos', 'pt-BR'),
  'importadoEm', '2026-11-09T10:00:00-03:00',
  'trechos', jsonb_build_object('o2', jsonb_build_object('pagina', 1, 'trecho', 'O2 19.5–23 %', 'arquivo', 'PET-confined.pdf', 'original', 'Oxygen', 'confianca', 'alta')));
-- Assina como a pessoa "who": a assinatura é sempre de quem está na sessão (42501), então a sessão
-- passa a ser "who" só durante a inclusão (uma recusa desfaz também a troca).
create function t.sig(p uuid, r int, slot uuid, who uuid) returns void language plpgsql as $$
declare prev text := current_setting('ptw.person_id', true);
begin
  perform set_config('ptw.person_id', who::text, false);
  insert into ptw.signature (unit_id, permit_id, rev, slot_id, person_id) values (ptw.current_unit(), p, r, slot, who);
  perform set_config('ptw.person_id', coalesce(prev, ''), false);
end $$;
grant execute on all functions in schema t to ptw_app;

-- ---------- Dados mínimos (como dono) ----------
insert into unit (id, code, name) values
  ('00000000-0000-7000-8000-000000000001', 'UN-01', 'Unidade 1'),
  ('00000000-0000-7000-8000-000000000002', 'UN-02', 'Unidade 2');
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000001', false);
\set U '''00000000-0000-7000-8000-000000000001'''

insert into type_def (unit_id, id, family, label, system_key) values
  (:U, '00000000-0000-7000-8000-0000000000a1', 'local', 'Área', null),
  (:U, '00000000-0000-7000-8000-0000000000a2', 'ativo', 'Painel', null),
  (:U, '00000000-0000-7000-8000-0000000000a3', 'cargo', 'Emitente', null),
  (:U, '00000000-0000-7000-8000-0000000000a4', 'cargo', 'Executante', null),
  (:U, '00000000-0000-7000-8000-0000000000a5', 'relacao', 'Parte de', 'parte_de'),
  (:U, '00000000-0000-7000-8000-0000000000a6', 'relacao', 'Alimenta', null);

insert into location (unit_id, id, parent_id, type_id, code, name) values
  (:U, '00000000-0000-7000-8000-0000000000b1', null, '00000000-0000-7000-8000-0000000000a1', 'PRED', 'Prédio de Produção'),
  (:U, '00000000-0000-7000-8000-0000000000b2', '00000000-0000-7000-8000-0000000000b1', '00000000-0000-7000-8000-0000000000a1', 'SALA-CCM', 'Sala CCM');

insert into asset (unit_id, id, type_id, code, name) values
  (:U, '00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000a2', 'CCM-L2-01', 'CCM'),
  (:U, '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a2', 'CCM-L2-01.C03', 'Gaveta C03'),
  (:U, '00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000a2', 'CCM-L2-01.C04', 'Gaveta C04'),
  (:U, '00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000a2', 'M-201', 'Motor'),
  (:U, '00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000a2', 'QF-01', 'Quadro');
-- C03 e C04 são parte do CCM.
insert into asset_relation (unit_id, from_id, to_id, kind_id) values
  (:U, '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000a5'),
  (:U, '00000000-0000-7000-8000-0000000000c3', '00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000a5'),
  (:U, '00000000-0000-7000-8000-0000000000c4', '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a6');

insert into person (unit_id, id, name, login) values
  (:U, '00000000-0000-7000-8000-0000000000d1', 'Marina Costa', 'marina'),
  (:U, '00000000-0000-7000-8000-0000000000d2', 'Rafael Nunes', 'rafael'),
  (:U, '00000000-0000-7000-8000-0000000000d3', 'Paulo Lima', 'paulo'),
  (:U, '00000000-0000-7000-8000-0000000000d4', 'Joana (vencida)', 'joana'),
  (:U, '00000000-0000-7000-8000-0000000000d5', 'Contato sem login', null);
insert into person_role (unit_id, person_id, role_id, scope_location_id, valid_until) values
  (:U, '00000000-0000-7000-8000-0000000000d1', '00000000-0000-7000-8000-0000000000a3', '00000000-0000-7000-8000-0000000000b1', current_date + 365),
  (:U, '00000000-0000-7000-8000-0000000000d2', '00000000-0000-7000-8000-0000000000a3', null, current_date + 365),
  (:U, '00000000-0000-7000-8000-0000000000d4', '00000000-0000-7000-8000-0000000000a3', null, current_date - 2);

insert into template (unit_id, id, name) values (:U, '00000000-0000-7000-8000-0000000000e1', 'Painel elétrico');
insert into template_version (unit_id, id, template_id, number, form) values
  (:U, '00000000-0000-7000-8000-0000000000e2', '00000000-0000-7000-8000-0000000000e1', 1, t.form());
insert into stage (unit_id, id, version_id, position, name, kind, locked) values
  (:U, '00000000-0000-7000-8000-0000000000f1', '00000000-0000-7000-8000-0000000000e2', 0, 'Solicitação', 'solicitacao', true),
  (:U, '00000000-0000-7000-8000-0000000000f2', '00000000-0000-7000-8000-0000000000e2', 1, 'Emissão', 'emissao', true);
insert into sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values
  (:U, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000e2', '00000000-0000-7000-8000-0000000000f2', 0, 'Emite a PT', '{00000000-0000-7000-8000-0000000000a3}'),
  (:U, '00000000-0000-7000-8000-0000000000f4', '00000000-0000-7000-8000-0000000000e2', '00000000-0000-7000-8000-0000000000f2', 1, 'Confere a emissão', '{00000000-0000-7000-8000-0000000000a3}');
insert into separation (unit_id, version_id, slot_a, slot_b) values
  (:U, '00000000-0000-7000-8000-0000000000e2', '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000f4');
select version_activate(:U, '00000000-0000-7000-8000-0000000000e2');

-- Cria rascunhos P1..P6 com um ativo cada (o solicitante é a pessoa da sessão: Rafael, d2).
create function t.draft(n int, asset uuid) returns uuid language plpgsql as $$
declare id uuid := ('00000000-0000-7000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid;
begin
  insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
  values (ptw.current_unit(), id, '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e2',
          '00000000-0000-7000-8000-0000000000d2', '00000000-0000-7000-8000-0000000000b2',
          tstzrange(now() - interval '1 hour', now() + interval '8 hours'), 'Serviço ' || n);
  insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), id, asset);
  return id;
end $$;
grant execute on function t.draft(int, uuid) to ptw_app;

-- ---------- A partir daqui, como a API ----------
create role ptw_api_test login in role ptw_app;
set role ptw_api_test;
select set_config('ptw.person_id', '00000000-0000-7000-8000-0000000000d2', false);

select t.draft(1, '00000000-0000-7000-8000-0000000000c2');   -- C03
select t.draft(2, '00000000-0000-7000-8000-0000000000c1');   -- CCM (pai de C03)
select t.draft(3, '00000000-0000-7000-8000-0000000000c3');   -- C04 (irmã de C03)
select t.draft(4, '00000000-0000-7000-8000-0000000000c2');   -- C03 de novo
select t.draft(5, '00000000-0000-7000-8000-0000000000c4');   -- M-201 (só "alimenta")
select t.draft(6, '00000000-0000-7000-8000-0000000000c5');   -- QF-01

-- Trava de equipamento
select t.expect('', 'enviar P1 (C03)', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000101')$$);
select t.check((select number ~ '^PT-UN01-\d{4}-00001$' from ptw.permit where id = '00000000-0000-7000-8000-000000000101'), 'número PT-UN01-AAAA-00001');
select t.expect('PTW10', 'pai (CCM) com filha aberta é recusado', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000102')$$);
select t.expect('', 'irmã (C04) é permitida', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000103')$$);
select t.expect('PTW10', 'mesmo ativo (C03) é recusado', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000104')$$);
select t.expect('', '"alimenta" não trava (M-201)', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000105')$$);
select t.expect('', 'enviar P6 (QF-01)', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000106')$$);
select t.check((select state = 'rascunho' and number is null from ptw.permit where id = '00000000-0000-7000-8000-000000000102'), 'recusa não muda a PT');
select t.check((select count(*) = 1 from ptw.permit_counter), 'contador sem lacuna: recusas não gastam número');
select t.check((select max(last) = 4 from ptw.permit_counter), '4 números emitidos');
select t.expect('PTW10', 'relação "parte de" que junta duas PTs abertas é recusada',
  $$insert into ptw.asset_relation (unit_id, from_id, to_id, kind_id) values (ptw.current_unit(), '00000000-0000-7000-8000-0000000000c5', '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a5')$$);
select t.expect('PTW11', 'ciclo em "parte de" é recusado',
  $$insert into ptw.asset_relation (unit_id, from_id, to_id, kind_id) values (ptw.current_unit(), '00000000-0000-7000-8000-0000000000c1', '00000000-0000-7000-8000-0000000000c2', '00000000-0000-7000-8000-0000000000a5')$$);
select t.expect('PTW04', 'ativos não mudam depois de enviada',
  $$insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), '00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-0000000000c5')$$);

-- Máquina de estados
select t.expect('PTW05', 'em_analise → ativa é recusado', $$update ptw.permit set state = 'ativa' where id = '00000000-0000-7000-8000-000000000101'$$);
select t.expect('', 'P1 até ativa', $$update ptw.permit set state = 'emitida' where id = '00000000-0000-7000-8000-000000000101';
                                     update ptw.permit set state = 'ativa' where id = '00000000-0000-7000-8000-000000000101'$$);
select t.check((select released from ptw.v_permit_board where id = '00000000-0000-7000-8000-000000000101'), 'trabalho liberado: ativa e na janela');
select t.expect('PTW05', 'ativa → cancelada não existe', $$update ptw.permit set state = 'cancelada' where id = '00000000-0000-7000-8000-000000000101'$$);
select t.expect('PTW05', 'número não muda', $$update ptw.permit set number = 'X' where id = '00000000-0000-7000-8000-000000000101'$$);

-- Assinaturas: elegibilidade e separação
select t.expect('PTW08', 'sem cargo não assina', $$select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000d3')$$);
select t.expect('PTW08', 'cargo vencido não assina', $$select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000d4')$$);
select t.expect('PTW08', 'contato sem login não assina', $$select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000d5')$$);
select t.expect('', 'cargo com escopo no prédio cobre a sala', $$select t.fill_emissao('00000000-0000-7000-8000-000000000103'); select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000d1')$$);
select t.expect('PTW09', 'mesma pessoa nas duas pontas separadas', $$select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f4', '00000000-0000-7000-8000-0000000000d1')$$);
select t.expect('', 'outra pessoa na outra ponta', $$select t.sig('00000000-0000-7000-8000-000000000103', 1, '00000000-0000-7000-8000-0000000000f4', '00000000-0000-7000-8000-0000000000d2')$$);
select t.expect('PTW07', 'revisão errada', $$select t.sig('00000000-0000-7000-8000-000000000106', 2, '00000000-0000-7000-8000-0000000000f3', '00000000-0000-7000-8000-0000000000d1')$$);
select t.expect('42501', 'API não apaga assinatura', $$delete from ptw.signature$$);
select t.expect('PTW01', 'assinatura só pode ser anulada', $$update ptw.signature set voided_at = null, voided_reason = null where permit_id = '00000000-0000-7000-8000-000000000103'$$);

-- Fim da trava: encerrar P1 e cancelar P3 libera o CCM para P2
select t.expect('', 'P1 entregue e encerrada', $$update ptw.permit set state = 'entregue' where id = '00000000-0000-7000-8000-000000000101';
                                                 update ptw.permit set state = 'encerrada' where id = '00000000-0000-7000-8000-000000000101'$$);
select t.expect('PTW10', 'CCM ainda preso por C04 (P3)', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000102')$$);
select t.expect('', 'P3 cancelada', $$update ptw.permit set state = 'cancelada', state_note = 'Teste' where id = '00000000-0000-7000-8000-000000000103'$$);
select t.expect('', 'CCM livre: P2 enviada', $$select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000102')$$);
select t.check((select count(*) = 1 from ptw.v_equipment_hold where asset_id = '00000000-0000-7000-8000-0000000000c1'), 'CCM preso só por P2');

-- Respostas
select t.expect('PTW15', 'horário inválido', $$insert into ptw.permit_answer values (ptw.current_unit(), '00000000-0000-7000-8000-000000000102', 'hora', '{"t":"horario","v":"25:00"}', default, '00000000-0000-7000-8000-0000000000d2')$$);
select t.expect('', 'número guardado e extraído', $$insert into ptw.permit_answer values (ptw.current_unit(), '00000000-0000-7000-8000-000000000102', 'o2', '{"t":"numero","v":20.9}', default, '00000000-0000-7000-8000-0000000000d2')$$);
select t.check((select num = 20.9 from ptw.permit_answer where item_id = 'o2' and permit_id = t.id('102')), 'num = 20,9');
select t.expect('PTW06', 'PT encerrada não aceita resposta', $$insert into ptw.permit_answer values (ptw.current_unit(), '00000000-0000-7000-8000-000000000101', 'x', '{"t":"texto","v":"a"}', default, '00000000-0000-7000-8000-0000000000d2')$$);

-- Versões
select t.expect('PTW03', 'versão ativa não muda', $$update ptw.template_version set note = 'x' where id = '00000000-0000-7000-8000-0000000000e2'$$);
select t.expect('PTW03', 'etapa de versão ativa não muda', $$update ptw.stage set name = 'x' where id = '00000000-0000-7000-8000-0000000000f2'$$);

-- Auditoria e permissões
select t.expect('42501', 'API não altera auditoria', $$update ptw.audit_event set text = 'x'$$);
select t.expect('42501', 'API não lê a ponta da cadeia', $$select * from ptw.audit_head$$);
select t.expect('42501', 'API não grava direto na auditoria (só pelas funções)', $$insert into ptw.audit_event (unit_id, action, ok, text, prev_hash, hash) values (ptw.current_unit(), 'x', true, 'x', '\x00', '\x00')$$);
select t.check((select count(*) = 10 from ptw.audit_event where action = 'pt.estado'), '10 mudanças de estado registradas automaticamente');

-- ---------- Auditoria completa ----------
-- Contexto do ator: vale só na transação e entra no evento (e no hash).
begin;
select ptw.set_context(t.id('1'), t.id('d1'), t.id('a3'), 'senha', 'tablet-07', 'req-123');
update ptw.asset set name = 'Motor 201 (bomba)' where id = t.id('c4');
commit;
select t.check((select actor_id = t.id('d1') and role_id = t.id('a3') and auth = 'senha' and client = 'tablet-07'
                       and request_id = 'req-123' and asset_id = t.id('c4') and entity = 'asset' and entity_id = t.id('c4')
                  from t.ev('cadastro.ativo.alterado')), 'contexto: pessoa, cargo, autenticação, aparelho e requisição');
select t.check((select data = '{"de": {"name": "Motor"}, "para": {"name": "Motor 201 (bomba)"}}' and text = 'Ativo alterado: M-201 (nome)'
                  from t.ev('cadastro.ativo.alterado')), 'diff só com a coluna alterada, antes e depois');
select t.check(ptw.ctx('client') is null and ptw.current_person() = t.id('d2'), 'contexto some no fim da transação');
select t.expect('PTW14', 'contexto com autenticação inválida', $$select ptw.set_context(t.id('1'), t.id('d1'), null, 'magica')$$);
select t.expect('PTW14', 'contexto com pessoa de outra unidade', $$select ptw.set_context(t.id('2'), t.id('d1'))$$);
select t.expect('PTW14', 'contexto com cargo que não é cargo', $$select ptw.set_context(t.id('1'), t.id('d1'), t.id('a1'))$$);

-- Sem mudança, sem evento.
select t.n() as n0 \gset
update ptw.asset set name = name, aliases = aliases where id = t.id('c4');
update ptw.person set name = name where id = t.id('d3');
select t.check(t.n() = :n0, 'alteração sem mudança não gera evento');

-- Cadastro: cada família de tabela.
insert into ptw.type_def (unit_id, id, family, label, icon) values (t.id('1'), t.id('a7'), 'local', 'Tanque', 'tanque');
select t.check((select data -> 'para' ->> 'label' = 'Tanque' and entity_id = t.id('a7') from t.ev('cadastro.tipo.criado')), 'tipo criado');
insert into ptw.location (unit_id, id, parent_id, type_id, code, name) values
  (t.id('1'), t.id('b3'), null, t.id('a1'), 'PRED2', 'Prédio de Utilidades'),
  (t.id('1'), t.id('b4'), t.id('b1'), t.id('a7'), 'TQ-01', 'Tanque 01'),
  (t.id('1'), t.id('b5'), t.id('b4'), t.id('a1'), 'TQ-01.BOCA', 'Boca de visita');
select t.check((select count(*) = 3 from ptw.audit_event where action = 'cadastro.local.criado' and entity_id in (t.id('b3'), t.id('b4'), t.id('b5'))), 'locais criados');
select t.n() as n0 \gset
update ptw.location set parent_id = t.id('b3') where id = t.id('b4');
select t.check(t.n() = :n0 + 1, 'mover local: um evento (o caminho dos filhos não é ruído)');
select t.check((select data = jsonb_build_object('de', jsonb_build_object('parent_id', t.id('b1')), 'para', jsonb_build_object('parent_id', t.id('b3')))
                  from t.ev('cadastro.local.alterado')), 'local movido: diff do pai');
insert into ptw.asset_location values (t.id('1'), t.id('c4'), t.id('b4'));
select t.check((select asset_id = t.id('c4') and text = 'Local do ativo incluído: M-201' from t.ev('cadastro.ativo.local.incluido')), 'ativo incluído no local');
delete from ptw.asset_location where asset_id = t.id('c4') and location_id = t.id('b4');
select t.check((select data -> 'de' ->> 'location_id' = t.id('b4')::text from t.ev('cadastro.ativo.local.removido')), 'ativo removido do local');
insert into ptw.asset_relation (unit_id, id, from_id, to_id, kind_id) values (t.id('1'), t.id('e9'), t.id('c5'), t.id('c4'), t.id('a6'));
delete from ptw.asset_relation where id = t.id('e9');
select t.check((select count(*) = 1 from ptw.audit_event where action = 'cadastro.ativo.relacao.removida' and entity_id = t.id('e9'))
           and (select count(*) = 1 from ptw.audit_event where action = 'cadastro.ativo.relacao.criada' and entity_id = t.id('e9')), 'relação criada e removida');
insert into ptw.person (unit_id, id, name, login, company) values (t.id('1'), t.id('d6'), 'Ana Souza', 'ana', 'Contratada X');
select t.check((select data -> 'para' ->> 'company' = 'Contratada X' from t.ev('cadastro.pessoa.criada')), 'pessoa criada');
update ptw.person set enabled = false where id = t.id('d6');
select t.check((select data = '{"de": {"enabled": true}, "para": {"enabled": false}}' and text = 'Conta alterada: Ana Souza (conta ativa)'
                  from t.ev('cadastro.conta.alterada')), 'conta desativada vira "conta alterada"');
update ptw.person set company = 'Contratada Y' where id = t.id('d6');
select t.check((select text = 'Pessoa alterada: Ana Souza (empresa)' from t.ev('cadastro.pessoa.alterada')), 'pessoa alterada');
insert into ptw.person_role (unit_id, id, person_id, role_id, valid_until) values (t.id('1'), t.id('e8'), t.id('d6'), t.id('a4'), '2027-01-31');
update ptw.person_role set valid_until = '2027-06-30' where id = t.id('e8');
select t.check((select data = '{"de": {"valid_until": "2027-01-31"}, "para": {"valid_until": "2027-06-30"}}' and text = 'Cargo alterado: Ana Souza (validade)'
                  from t.ev('cadastro.cargo.alterado')), 'validade do cargo: antes e depois');
delete from ptw.person_role where id = t.id('e8');
select t.check((select text = 'Cargo revogado: Ana Souza' and data -> 'de' ->> 'role_id' = t.id('a4')::text from t.ev('cadastro.cargo.revogado'))
           and exists (select 1 from ptw.audit_event where action = 'cadastro.cargo.concedido' and entity_id = t.id('e8')), 'cargo concedido e revogado');
insert into ptw.option_list (unit_id, id, name) values (t.id('1'), t.id('e7'), 'EPIs');
insert into ptw.option_item (unit_id, id, list_id, label, position) values (t.id('1'), t.id('e6'), t.id('e7'), 'Luva', 0);
update ptw.option_item set active = false where id = t.id('e6');
select t.check(exists (select 1 from ptw.audit_event where action = 'cadastro.lista.criada' and entity_id = t.id('e7'))
           and (select text = 'Item de lista alterado: Luva (em uso)' from t.ev('cadastro.lista.item.alterado')), 'lista e item');

-- Modelo: versão, etapas, assinaturas, separação, escopo, formulário e ativação.
insert into ptw.template (unit_id, id, name, retention_class) values (t.id('1'), t.id('e3'), 'Espaço confinado', 'pet');
insert into ptw.template_version (unit_id, id, template_id, number) values (t.id('1'), t.id('e4'), t.id('e3'), 1);
insert into ptw.version_location_type (unit_id, version_id, type_id) values (t.id('1'), t.id('e4'), t.id('a7'));
insert into ptw.stage (unit_id, id, version_id, position, name, kind) values (t.id('1'), t.id('f5'), t.id('e4'), 0, 'Emissão', 'emissao');
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values
  (t.id('1'), t.id('f6'), t.id('e4'), t.id('f5'), 0, 'Supervisor de entrada', array[t.id('a3')]),
  (t.id('1'), t.id('f7'), t.id('e4'), t.id('f5'), 1, 'Vigia', array[t.id('a4')]);
insert into ptw.separation (unit_id, version_id, slot_a, slot_b) values (t.id('1'), t.id('e4'), t.id('f6'), t.id('f7'));
update ptw.template_version set form = '{"sections": [{"id": "s1", "title": "Atmosfera", "items": []}]}' where id = t.id('e4');
select ptw.version_activate(t.id('1'), t.id('e4'));
insert into ptw.template_version (unit_id, id, template_id, number) values (t.id('1'), t.id('e5'), t.id('e3'), 2);
select ptw.version_activate(t.id('1'), t.id('e5'));
select t.check((select data -> 'para' ->> 'retention_class' = 'pet' from t.ev('modelo.criado')), 'modelo criado com classe de retenção');
select t.check((select data -> 'para' -> 'form' ->> 'sha256' = encode(sha256(convert_to('{"sections": [{"id": "s1", "items": [], "title": "Atmosfera"}]}', 'UTF8')), 'hex')
                       and not (data -> 'para' -> 'form' ? 'sections')
                  from t.ev('modelo.versao.alterada')), 'formulário alterado: guarda o SHA-256, não o JSON');
select t.check((select count(*) = 2 from ptw.audit_event where action = 'modelo.versao.ativada' and entity_id in (t.id('e4'), t.id('e5')))
           and (select entity_id = t.id('e4') and text = 'Versão 1 arquivada' from t.ev('modelo.versao.arquivada')), 'versão ativada e anterior arquivada');
select t.check((select count(*) = 1 from ptw.audit_event where action = 'modelo.etapa.criada' and entity_id = t.id('f5'))
           and (select count(*) = 2 from ptw.audit_event where action = 'modelo.assinatura.criada' and entity_id in (t.id('f6'), t.id('f7')))
           and (select count(*) = 1 from ptw.audit_event where action = 'modelo.separacao.criada' and entity_id = t.id('e4'))
           and (select count(*) = 1 from ptw.audit_event where action = 'modelo.versao.escopo.incluido'), 'etapa, assinaturas, separação e escopo');

-- PT: campos, ativos, equipe, respostas, anexos, parada e retomada, revisão.
update ptw.permit set scope = 'Troca da gaveta e reaperto' where id = t.id('106');
select t.check((select data = '{"de": {"scope": "Serviço 6"}, "para": {"scope": "Troca da gaveta e reaperto"}}' and permit_id = t.id('106') and rev = 1
                       and text = 'PT alterada (escopo)' from t.ev('pt.alterada')), 'PT: escopo alterado');
update ptw.permit set work_window = tstzrange(lower(work_window), upper(work_window) + interval '1 hour') where id = t.id('106');
select t.check((select data -> 'para' ? 'work_window' and text = 'PT alterada (janela)' from t.ev('pt.alterada')), 'PT: janela alterada');
update ptw.permit set state = 'emitida' where id = t.id('106');
update ptw.permit set hold_reason = 'Vazamento de gás', hold_by = t.id('d2'), hold_at = now() where id = t.id('106');
select t.check((select text = 'Parada: Vazamento de gás' and data -> 'para' ->> 'hold_by' = t.id('d2')::text from t.ev('pt.parada')), 'PT parada');
select set_config('ptw.person_id', t.id('d1')::text, false);
update ptw.permit set hold_reason = null, hold_by = null, hold_at = null,
       resumed_reason = 'Vazamento contido', resumed_by = t.id('d1'), resumed_at = now() where id = t.id('106');
select set_config('ptw.person_id', t.id('d2')::text, false);
select t.check((select text = 'Retomada: Vazamento contido' and data -> 'de' ->> 'hold_reason' = 'Vazamento de gás' from t.ev('pt.retomada')), 'PT retomada');
select t.draft(7, t.id('c5'));
select t.check((select permit_id = t.id('107') and asset_id = t.id('c5') and text = 'Ativo da PT incluído: QF-01' from t.ev('pt.ativo.incluido')), 'ativo incluído na PT');
delete from ptw.permit_asset where permit_id = t.id('107');
select t.check((select asset_id = t.id('c5') from t.ev('pt.ativo.removido')), 'ativo removido da PT');
insert into ptw.permit_team (unit_id, permit_id, role_id, person_id) values (t.id('1'), t.id('106'), t.id('a4'), t.id('d3'));
select t.check((select text = 'Equipe incluída: Paulo Lima' from t.ev('pt.equipe.incluida')), 'equipe incluída');
insert into ptw.permit_answer values (t.id('1'), t.id('106'), 'o2', '{"t":"numero","v":20.9}', default, t.id('d2'));
select t.n() as n0 \gset
update ptw.permit_answer set value = '{"t":"numero","v":20.9}' where permit_id = t.id('106') and item_id = 'o2';
select t.check(t.n() = :n0, 'mesma resposta de novo: nenhum evento');
update ptw.permit_answer set value = '{"t":"numero","v":19.5}' where permit_id = t.id('106') and item_id = 'o2';
select t.check((select data = '{"de": {"value": {"t": "numero", "v": 20.9}}, "para": {"value": {"t": "numero", "v": 19.5}}}' and text = 'Respondeu: o2 (valor)'
                  from t.ev('pt.resposta')), 'resposta alterada: antes e depois');
insert into ptw.blob (unit_id, sha256, size, mime) values (t.id('1'), sha256('foto do bloqueio'), 16, 'image/jpeg');
insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, captured_by)
values (t.id('1'), t.id('aa1'), t.id('106'), 'foto', 'foto', sha256('foto do bloqueio'), 'bloqueio-CCM.jpg', t.id('d2'));
select t.check((select data -> 'para' ->> 'file_name' = 'bloqueio-CCM.jpg' and permit_id = t.id('106') from t.ev('pt.anexo.incluido')), 'anexo incluído');
insert into ptw.permit_revision (unit_id, permit_id, rev, reason, sha256) values (t.id('1'), t.id('106'), 1, 'Escopo revisto', sha256('r1'));
select t.check((select text = 'Nova revisão 1: Escopo revisto' and rev = 1 from t.ev('pt.revisao')), 'revisão registrada');
select t.check((select actor_id = t.id('d2') and permit_id = t.id('103') from t.ev('pt.assinatura')), 'assinatura: ator é quem assinou');

-- Negação: a regra desfaz tudo, inclusive a trilha; a API registra em OUTRA transação.
select t.n() as n0 \gset
select t.expect('PTW08', 'assinatura negada (PTW08)', $$select t.sig(t.id('106'), 1, t.id('f3'), t.id('d3'))$$);
select t.check(t.n() = :n0, 'sem audit_denied a negação se perde no rollback');
begin;
select ptw.set_context(t.id('1'), t.id('d3'), t.id('a4'), 'sessao', 'tablet-01', 'req-neg');
select ptw.audit_denied('pt.assinatura', 'PTW08', 'Pessoa não elegível: sem o cargo válido para este local', t.id('106'), jsonb_build_object('slot', t.id('f3')));
commit;
select t.check((select not ok and actor_id = t.id('d3') and request_id = 'req-neg' and permit_id = t.id('106') and rev = 1
                       and data ->> 'erro' = 'PTW08' and data ->> 'slot' = t.id('f3')::text
                       and text = 'Negado (PTW08): Pessoa não elegível: sem o cargo válido para este local'
                  from ptw.audit_event where action = 'pt.assinatura' order by seq desc limit 1), 'negação registrada com ok = false, código e ator');
select t.expect('PTW14', 'negação sem código válido', $$select ptw.audit_denied('pt.assinatura', 'x', 'y')$$);

-- Leituras sensíveis e sessão.
begin;
select ptw.set_context(t.id('1'), t.id('d2'), null, 'sessao', 'notebook-sala', 'req-r1');
select ptw.audit_access('acesso.pt.aberta', t.id('106'));
select ptw.audit_access('acesso.anexo.baixado', null, t.id('aa1'));
select ptw.audit_access('acesso.auditoria.busca', null, null, null, '{"filtro": {"acao": "pt.", "negados": true}}');
commit;
select t.check((select permit_id = t.id('106') and data ->> 'arquivo' = 'bloqueio-CCM.jpg' and entity_id = t.id('aa1')
                       and data ->> 'sha256' = encode(sha256('foto do bloqueio'), 'hex') and text = 'Baixou o anexo bloqueio-CCM.jpg'
                  from t.ev('acesso.anexo.baixado')), 'download de anexo registrado');
select t.check(exists (select 1 from ptw.audit_event where action = 'acesso.pt.aberta' and permit_id = t.id('106'))
           and exists (select 1 from ptw.audit_event where action = 'acesso.auditoria.busca'), 'abrir PT e buscar na auditoria registrados');
select t.check((select count(*) = 0 from ptw.v_permit_history where action like 'acesso.%')
           and (select count(*) > 0 from ptw.v_permit_history where permit_id = t.id('106')), 'Histórico da PT sem as leituras');
select t.expect('PTW14', 'exportação sem motivo', $$select ptw.audit_access('acesso.exportacao')$$);
select t.expect('PTW14', 'leitura com ação fora de acesso.*', $$select ptw.audit_access('pt.estado')$$);
select ptw.audit_log('sessao.entrada', true, 'Entrou', '{"metodo": "senha"}', t.id('d1'));
select ptw.audit_log('sessao.entrada', false, 'Senha errada', '{"login": "mariana"}');
select ptw.audit_log('conta.bloqueada', true, 'Conta bloqueada após 5 tentativas', '{}', t.id('d6'));
select t.check((select count(*) = 2 from ptw.audit_event where action = 'sessao.entrada')
           and (select not ok from t.ev('sessao.entrada'))
           and (select entity_id = t.id('d6') from t.ev('conta.bloqueada')), 'entrada, falha de entrada e bloqueio de conta');
select t.expect('PTW14', 'sessão não grava ação de PT', $$select ptw.audit_log('pt.estado', true, 'x')$$);
select t.check(ptw.audit_system('sistema.servidor.iniciado', 'API iniciada', '{"versao": "0.1.0"}') = 1, 'API grava evento do sistema só na sua unidade');
select t.check((select actor_id is null and auth = 'sistema' from t.ev('sistema.servidor.iniciado')), 'evento do sistema sem pessoa');
select t.expect('42501', 'API não chama a gravação interna', $$select ptw.audit_emit(ptw.current_unit(), 'x', true, 'x', '{}')$$);
select t.expect('42501', 'API não arquiva partição', $$select ptw.audit_archive('ptw.audit_event_default', 'x')$$);
select t.expect('42501', 'API não altera âncora', $$delete from ptw.audit_anchor$$);
select t.check((select count(*) > 0 from ptw.v_audit where not ok), 'API lê a tela de auditoria');

-- ---------- Formulário que se adapta ----------
-- Estrutura do formulário.
select t.expect('PTW15', 'formulário: tipo de item desconhecido', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "a", "kind": "foguete", "label": "A"}]}]}')$$);
select t.expect('PTW15', 'formulário: documento não entra em grupo', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "g", "kind": "grupo", "label": "G", "columns": [{"id": "d", "kind": "documento", "label": "D"}]}]}]}')$$);
select t.expect('PTW15', 'formulário: grupo com "items" em vez de "columns"', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "g", "kind": "grupo", "label": "G", "minRows": 1, "items": [{"id": "t", "kind": "texto", "label": "T"}]}]}]}')$$);
select t.expect('PTW15', 'formulário: coluna de grupo com condição', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "g", "kind": "grupo", "label": "G", "columns": [{"id": "t", "kind": "texto", "label": "T", "showWhen": {"itemId": "g", "anyOf": ["x"]}}]}]}]}')$$);
select t.expect('PTW15', 'formulário: data com mínimo depois do máximo', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "d", "kind": "data", "label": "D", "notBeforeToday": false, "min": "2026-12-01", "max": "2026-11-01"}]}]}')$$);
select t.expect('PTW15', 'formulário: linha de verificação com blockOn inválido', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "v", "kind": "verificacao", "label": "V", "answers": "sim_nao", "lines": [{"id": "l", "label": "L", "blockOn": ["talvez"], "noteOn": []}]}]}]}')$$);
select t.expect('PTW15', 'formulário: condição para item inexistente', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "a", "kind": "texto", "label": "A", "showWhen": {"itemId": "zz", "anyOf": ["x"]}}]}]}')$$);
select t.expect('PTW15', 'formulário: formato de documento vazio', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "d", "kind": "documento", "label": "D", "pattern": " ", "attach": false, "validity": false}]}]}')$$);
select t.expect('PTW15', 'formulário: id repetido', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "a", "kind": "data", "label": "A"}, {"id": "a", "kind": "data", "label": "B"}]}]}')$$);
select t.expect('PTW15', 'formulário: cargo do item pessoa não é um id', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, '{"sections": [{"id": "s", "items": [{"id": "p", "kind": "pessoa", "label": "P", "roleId": "Emitente"}]}]}')$$);

-- Cargo sem ninguém, assinatura condicional e versão importada (origem sugerida + pacote).
insert into ptw.type_def (unit_id, id, family, label) values (t.id('1'), t.id('a8'), 'cargo', 'Vigia de espaço confinado');
select t.check(not exists (select 1 from ptw.person_role where role_id = t.id('a8')), 'cargo criado sem nenhuma pessoa');
select t.expect('23514', 'versão sugerida exige o pacote de origem', $$insert into ptw.template_version (unit_id, template_id, number, form, origin) values (t.id('1'), t.id('e3'), 91, t.form(), 'sugerida')$$);
begin;
insert into ptw.template_version (unit_id, id, template_id, number, form, origin, source_sha256, import_source)
values (t.id('1'), t.id('e10'), t.id('e3'), 3, t.form(), 'sugerida', sha256('pacote ptw.modelo/1'), t.src('pacote ptw.modelo/1'));
insert into ptw.stage (unit_id, id, version_id, position, name, kind) values (t.id('1'), t.id('f8'), t.id('e10'), 0, 'Emissão', 'emissao');
select ptw.audit_import(t.id('e10'), jsonb_build_object('cargos', jsonb_build_array(t.id('a8'))));
commit;
select t.expect('23514', 'condição de assinatura sem valores', $$insert into ptw.sign_slot (unit_id, version_id, stage_id, position, meaning, role_ids, required_when_item) values (t.id('1'), t.id('e10'), t.id('f8'), 0, 'X', array[t.id('a8')], 'm')$$);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids, required_when_item, required_when_values)
values (t.id('1'), t.id('f9'), t.id('e10'), t.id('f8'), 0, 'Vigia (só com arco elétrico)', array[t.id('a8')], 'nao_existe', '{b}');
select t.expect('PTW15', 'ativar com assinatura condicionada a item inexistente', $$select ptw.version_activate(t.id('1'), t.id('e10'))$$);
update ptw.sign_slot set required_when_item = 'm' where id = t.id('f9');
select t.check((select data = '{"de": {"required_when_item": "nao_existe"}, "para": {"required_when_item": "m"}}' from t.ev('modelo.assinatura.alterada')), 'condição da assinatura auditada');
select t.expect('', 'ativar versão importada com cargo sem ninguém e assinatura condicional', $$select ptw.version_activate(t.id('1'), t.id('e10'))$$);
select t.check((select data -> 'para' ->> 'origin' = 'sugerida' and data -> 'para' ->> 'source_sha256' = '\x' || encode(sha256('pacote ptw.modelo/1'), 'hex')
                  from ptw.audit_event where action = 'modelo.versao.criada' and entity_id = t.id('e10')), 'origem e pacote da versão auditados');
select t.expect('PTW03', 'origem da versão em uso não muda', $$update ptw.template_version set origin = 'manual', source_sha256 = null where id = t.id('e10')$$);

-- Respostas dos tipos novos (PT 8, enviada com o formulário de teste).
insert into ptw.asset (unit_id, id, type_id, code, name) values (t.id('1'), t.id('c6'), t.id('a2'), 'BOMBA-01', 'Bomba de água gelada');
-- Ficha SGI (attrs): objeto pequeno, buscável por EQUNR/TPLNR e na trilha da linha.
update ptw.asset set attrs = '{"equnr": "10001234", "fabricante": "KSB", "protecao": {"tipo": "sensor_de_processo"}}' where id = t.id('c6');
select t.check((select search like '%10001234%' from ptw.asset where id = t.id('c6')), 'ficha: EQUNR entra na busca do ativo');
select t.check((select data -> 'para' -> 'attrs' ->> 'fabricante' = 'KSB' from t.ev('cadastro.ativo.alterado')), 'ficha: atributos na trilha do ativo');
select t.expect('23514', 'ficha: atributos precisam ser um objeto', $$update ptw.asset set attrs = '["x"]' where id = t.id('c6')$$);
select t.expect('23514', 'ficha: atributos até 8 KiB', $$update ptw.asset set attrs = jsonb_build_object('obs', repeat('x', 9000)) where id = t.id('c6')$$);
select t.expect('23514', 'ficha do local precisa ser um objeto', $$update ptw.location set attrs = '"x"' where id = (select id from ptw.location where unit_id = ptw.current_unit() limit 1)$$);
select t.draft(8, t.id('c6'));
select t.expect('', 'enviar P8', $$select ptw.permit_submit(ptw.current_unit(), t.id('108'))$$);
select t.expect('PTW15', 'resposta para item que não existe', $$select t.ans('nao_existe', '{"t": "texto", "v": "x"}')$$);
select t.expect('PTW15', 'resposta do tipo errado', $$select t.ans('o2', '{"t": "texto", "v": "20"}')$$);
select t.expect('PTW15', 'aviso não tem resposta', $$select t.ans('aviso', '{"t": "texto", "v": "x"}')$$);
select t.expect('PTW15', 'número negativo sem permissão', $$select t.ans('o2', '{"t": "numero", "v": -1}')$$);
select t.expect('PTW15', 'casas decimais demais', $$select t.ans('o2', '{"t": "numero", "v": 20.95}')$$);
select t.expect('PTW15', 'horário com segundos onde não cabe', $$select t.ans('hora', '{"t": "horario", "v": "07:30:10"}')$$);
select t.expect('PTW15', 'marcação com opção inexistente', $$select t.ans('m', '{"t": "marcacao", "ids": ["z"]}')$$);
select t.expect('PTW15', 'verificação com resposta fora da lista', $$select t.ans('v', '{"t": "verificacao", "lines": {"l1": {"a": "talvez"}}}')$$);
select t.expect('PTW15', 'anexo de outra PT', $$select t.ans('foto', '{"t": "anexo", "files": ["00000000-0000-7000-8000-000000000aa1"]}')$$);
select t.expect('PTW15', 'anexo como objeto, não como id', $$select t.ans('foto', '{"t": "anexo", "files": [{"id": "00000000-0000-7000-8000-000000000aa1", "kind": "foto", "name": "bloqueio-CCM.jpg"}]}')$$);
select t.expect('PTW15', 'validade do documento fora de AAAA-MM-DD', $$select t.ans('doc', '{"t": "documento", "code": "NR-10-123", "files": [], "validUntil": "01/01/2030"}')$$);
select t.expect('PTW15', 'data impossível', $$select t.ans('dia', '{"t": "data", "v": "2026-02-30"}')$$);
select t.expect('PTW15', 'data em dd/mm/aaaa (o banco guarda AAAA-MM-DD)', $$select t.ans('dia', '{"t": "data", "v": "31/12/2098"}')$$);
select t.expect('PTW15', 'data incompleta', $$select t.ans('dia', '{"t": "data", "v": "2098-12"}')$$);
select t.expect('PTW15', 'pessoa sem o cargo pedido', $$select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d3"]}')$$);
select t.expect('PTW08', 'pessoa com o cargo vencido não é elegível', $$select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d4"]}')$$);
select t.expect('PTW15', 'só uma pessoa', $$select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d1", "00000000-0000-7000-8000-0000000000d2"]}')$$);
select t.expect('PTW15', 'isolamento com energia desconhecida', $$select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "nuclear", "method": "", "lock": ""}]}')$$);
select t.expect('PTW15', 'isolamento com ativo que não é da PT', $$select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "assetId": "00000000-0000-7000-8000-0000000000c1", "energy": "eletrica", "method": "", "lock": ""}]}')$$);
select t.expect('PTW15', 'isolamento com os nomes antigos (tag, zeroVerified)', $$select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "tag": "DJ-01", "energy": "eletrica", "zeroVerified": true}]}')$$);
select t.expect('PTW15', 'energia zero fora de sim/nao', $$select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "method": "", "lock": "", "zero": true}]}')$$);
select t.expect('PTW15', 'grupo com coluna inexistente', $$select t.ans('grp', '{"t": "grupo", "rows": [{"id": "r1", "answers": {"g_x": {"t": "texto", "v": "a"}}}]}')$$);
select t.expect('PTW15', 'grupo com "values" em vez de "answers"', $$select t.ans('grp', '{"t": "grupo", "rows": [{"id": "r1", "values": {"g_t": {"t": "texto", "v": "a"}}}]}')$$);
select t.expect('PTW15', 'grupo com horário inválido', $$select t.ans('grp', '{"t": "grupo", "rows": [{"id": "r1", "answers": {"g_h": {"t": "horario", "v": "7h"}}}]}')$$);
-- Anexos desta PT: a resposta guarda só os ids (nome, tipo e arquivo ficam em attachment).
insert into ptw.blob (unit_id, sha256, size, mime) values (t.id('1'), sha256('aso.pdf'), 7, 'application/pdf');
insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, captured_by) values
  (t.id('1'), t.id('aa2'), t.id('108'), 'foto', 'foto', sha256('foto do bloqueio'), 'bloqueio-B01.jpg', t.id('d2')),
  (t.id('1'), t.id('aa3'), t.id('108'), 'doc', 'arquivo', sha256('aso.pdf'), 'aso.pdf', t.id('d2'));
select t.expect('PTW15', 'anexo de tipo que o item não aceita', $$select t.ans('foto', '{"t": "anexo", "files": ["00000000-0000-7000-8000-000000000aa3"]}')$$);
select t.expect('PTW15', 'anexo repetido na resposta', $$select t.ans('foto', '{"t": "anexo", "files": ["00000000-0000-7000-8000-000000000aa2", "00000000-0000-7000-8000-000000000aa2"]}')$$);
select t.expect('', 'respostas válidas de todos os tipos', $$
  select t.ans('x', '{"t": "texto", "v": "Troca de disjuntor"}');
  select t.ans('m', '{"t": "marcacao", "ids": ["a"]}');
  select t.ans('dia', '{"t": "data", "v": "2098-12-31"}');
  select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d1"]}');
  select t.ans('o2', '{"t": "numero", "v": 17.0}');
  select t.ans('arco', '{"t": "numero", "v": 9}');
  select t.ans('hora', '{"t": "horario", "v": "07:30"}');
  select t.ans('v', '{"t": "verificacao", "lines": {"l1": {"a": "na", "note": "Área já cercada pela obra"}}}');
  select t.ans('foto', '{"t": "anexo", "files": ["00000000-0000-7000-8000-000000000aa2"]}');
  select t.ans('doc', '{"t": "documento", "code": "NR-10-123", "files": ["00000000-0000-7000-8000-000000000aa3"], "validUntil": "2020-01-31"}');
  select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "assetId": "00000000-0000-7000-8000-0000000000c6", "energy": "eletrica", "method": "Disjuntor aberto e extraído", "lock": "C-114", "zero": "sim", "by": "00000000-0000-7000-8000-0000000000d3"}, {"id": "r2", "point": "V-07", "energy": "pneumatica", "method": "", "lock": ""}]}');
  select t.ans('grp', '{"t": "grupo", "rows": [{"id": "r1", "answers": {"g_t": {"t": "texto", "v": "Boca 1"}, "g_n": {"t": "numero", "v": 15}, "g_h": {"t": "horario", "v": "07:40"}}}]}')$$);
select t.check((select count(*) >= 12 from ptw.audit_event where action = 'pt.resposta' and permit_id = t.id('108'))
           and (select data -> 'para' -> 'value' -> 'rows' -> 0 ->> 'energy' = 'eletrica' from ptw.audit_event where action = 'pt.resposta' and permit_id = t.id('108') and data -> 'para' ->> 'item_id' = 'iso'),
               'respostas novas auditadas como as outras');
-- Fora da faixa e vencido ficam gravados, mas bloqueiam a assinatura da etapa.
select t.check((select value ->> 'v' = '17.0' from ptw.permit_answer where permit_id = t.id('108') and item_id = 'o2'), 'leitura fora da faixa fica registrada');
select t.expect('PTW16', 'O₂ fora da faixa bloqueia a assinatura', $$select t.sig(t.id('108'), 1, t.id('f3'), t.id('d1'))$$);
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) like 'O₂ fora da faixa%', 'bloqueio diz o motivo');
select t.ans('o2', '{"t": "numero", "v": 20.9}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'ASO vencido em 31/01/2020', 'documento vencido bloqueia');
select t.ans('doc', '{"t": "documento", "code": "NR-10-123", "files": [], "validUntil": "2030-01-31"}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) like 'Medições › LEL fora da faixa%', 'número fora da faixa dentro do grupo bloqueia');
select t.ans('grp', '{"t": "grupo", "rows": [{"id": "r1", "answers": {"g_t": {"t": "texto", "v": "Boca 1"}, "g_n": {"t": "numero", "v": 5}}}]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) is null, 'item oculto (arco sem "Arco" marcado) não bloqueia');
select t.ans('m', '{"t": "marcacao", "ids": ["a", "b"]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) like 'Distância do arco fora da faixa%', 'item que aparece pela condição passa a bloquear');
select t.ans('arco', '{"t": "numero", "v": 2.5}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 0) is null, 'etapa anterior não vê as seções da etapa seguinte');
-- Os demais bloqueios, um a um.
select t.ans('v', '{"t": "verificacao", "lines": {"l1": {"a": "nao"}}}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'Área isolada: "Não" impede a etapa', 'verificação respondida num valor de blockOn bloqueia');
select t.ans('v', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}');
select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "eletrica", "method": "Disjuntor", "lock": "C-114", "zero": "sim"}, {"id": "r2", "point": "V-07", "energy": "pneumatica", "method": "Válvula", "lock": "C-115", "zero": "nao"}]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'Pontos de isolamento · ponto 2 (V-07): energia zero não verificada', 'ponto com energia zero "nao" bloqueia');
select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "eletrica", "method": "Disjuntor", "lock": "C-114", "zero": "sim"}]}');
select t.ans('dia', '{"t": "data", "v": "2020-01-01"}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'Data do serviço: 01/01/2020 está antes de hoje', 'data antes de hoje bloqueia (notBeforeToday)');
select t.ans('dia', '{"t": "data", "v": "2100-01-01"}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'Data do serviço: 01/01/2100 está depois de 31/12/2099', 'data depois do máximo bloqueia');
select t.ans('dia', '{"t": "data", "v": "2098-12-31"}');
select t.ans('doc', '{"t": "documento", "code": "NR-1-12", "files": []}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'ASO: fora do formato NR-##-###', 'código do documento fora do formato fica gravado e bloqueia');
select t.ans('doc', '{"t": "documento", "code": "nr-10-123", "files": []}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'ASO: falta a validade', 'formato sem caixa; documento sem a validade exigida bloqueia');
select t.ans('doc', '{"t": "documento", "code": "NR-10-123", "files": [], "validUntil": "2030-01-31"}');
-- Pessoa: elegível ao responder, deixa de ser (cadastro em revisão, depois cargo vencido) → bloqueia.
reset role;
insert into ptw.person (unit_id, id, name, login, status) values
  (t.id('1'), t.id('d7'), 'Bruno Alves', 'bruno', 'ativo'), (t.id('1'), t.id('d8'), 'Carla (inativa)', 'carla', 'inativo'),
  (t.id('1'), t.id('d9'), 'Vigia sem login', null, 'ativo');
insert into ptw.person_role (unit_id, person_id, role_id, scope_location_id, valid_until) values
  (t.id('1'), t.id('d7'), t.id('a3'), null, current_date + 30), (t.id('1'), t.id('d8'), t.id('a3'), null, current_date + 30),
  (t.id('1'), t.id('d9'), t.id('a3'), null, current_date + 30);
set role ptw_api_test;
select t.expect('PTW08', 'pessoa com cadastro inativo não é elegível no item', $$select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d8"]}')$$);
select t.expect('', 'contato sem login é elegível no item (mas não assina)', $$select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d9"]}')$$);
select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d7"]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) is null, 'pessoa elegível não bloqueia');
update ptw.person set status = 'em_revisao' where id = t.id('d7');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) = 'Responsável: Bruno Alves não elegível (cadastro em revisão)', 'pessoa que deixou de ser elegível bloqueia a assinatura');
update ptw.person set status = 'ativo' where id = t.id('d7');
update ptw.person_role set valid_until = current_date - 2 where person_id = t.id('d7');
select t.check(ptw.permit_blocker(t.id('1'), t.id('108'), 1) like 'Responsável: Bruno Alves não elegível (cargo vencido%', 'cargo vencido depois de responder bloqueia');
select t.ans('resp', '{"t": "pessoa", "ids": ["00000000-0000-7000-8000-0000000000d1"]}');
select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "eletrica", "method": "Disjuntor aberto", "lock": "C-114", "zero": "sim", "by": "00000000-0000-7000-8000-0000000000d3"}, {"id": "r2", "point": "V-07", "energy": "pneumatica", "method": "", "lock": ""}]}');
select t.expect('PTW16', 'completude: ponto de isolamento incompleto barra a assinatura', $$select t.sig(t.id('108'), 1, t.id('f3'), t.id('d1'))$$);
select t.ans('iso', '{"t": "isolamento", "rows": [{"id": "r1", "point": "DJ-01", "energy": "eletrica", "method": "Disjuntor aberto", "lock": "C-114", "zero": "sim", "by": "00000000-0000-7000-8000-0000000000d3"}]}');
select t.expect('', 'sem bloqueio, assina', $$select t.sig(t.id('108'), 1, t.id('f3'), t.id('d1'))$$);
-- Assinatura: cadastro inativo ou em revisão não assina.
select t.expect('PTW08', 'cadastro inativo não assina', $$select t.sig(t.id('108'), 1, t.id('f4'), t.id('d8'))$$);
update ptw.person set status = 'em_revisao' where id = t.id('d2');
select t.expect('PTW08', 'cadastro em revisão não assina', $$select t.sig(t.id('108'), 1, t.id('f4'), t.id('d2'))$$);
update ptw.person set status = 'ativo' where id = t.id('d2');

-- ---------- Entrega e Aceite da área a partir de expirada e suspensa; reenvio; chaves compostas ----------
-- Modelo com as cinco etapas do ciclo; Emissão pede duas pessoas (min = 2).
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e20'), 'Ciclo completo');
insert into ptw.template_version (unit_id, id, template_id, number, form) values (t.id('1'), t.id('e21'), t.id('e20'), 1, $j${"sections": [
  {"id": "se", "title": "Emissão", "stageId": "00000000-0000-7000-8000-000000000f21", "items": [{"id": "em_obs", "kind": "texto", "label": "Observação da emissão", "required": false, "long": false}]},
  {"id": "sn", "title": "Entrega", "stageId": "00000000-0000-7000-8000-000000000f23", "items": [{"id": "ent", "kind": "verificacao", "label": "Entrega", "required": true, "answers": "sim_nao", "lines": [{"id": "limpa", "label": "Área limpa", "blockOn": ["nao"], "noteOn": []}]}]},
  {"id": "sa", "title": "Encerramento", "stageId": "00000000-0000-7000-8000-000000000f24", "items": [{"id": "enc", "kind": "texto", "label": "Condição da área", "required": true, "long": true}]}]}$j$::jsonb);
insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked) values
  (t.id('1'), t.id('f20'), t.id('e21'), 0, 'Solicitação', 'solicitacao', true),
  (t.id('1'), t.id('f21'), t.id('e21'), 1, 'Emissão', 'emissao', true),
  (t.id('1'), t.id('f22'), t.id('e21'), 2, 'Aceite no campo', 'aceite_campo', true),
  (t.id('1'), t.id('f23'), t.id('e21'), 3, 'Entrega', 'entrega', true),
  (t.id('1'), t.id('f24'), t.id('e21'), 4, 'Aceite da área', 'aceite_area', true);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids, min) values
  (t.id('1'), t.id('f25'), t.id('e21'), t.id('f21'), 0, 'Emite', array[t.id('a3')], 2),
  (t.id('1'), t.id('f26'), t.id('e21'), t.id('f23'), 0, 'Entrega a área', array[t.id('a3')], 1),
  (t.id('1'), t.id('f27'), t.id('e21'), t.id('f24'), 0, 'Aceita a área', array[t.id('a3')], 1);
select ptw.version_activate(t.id('1'), t.id('e21'));
-- Chaves compostas: assinatura e separação não apontam para etapa ou assinatura de outra versão.
insert into ptw.template_version (unit_id, id, template_id, number) values (t.id('1'), t.id('e22'), t.id('e20'), 2);
insert into ptw.stage (unit_id, id, version_id, position, name) values (t.id('1'), t.id('f28'), t.id('e22'), 0, 'Emissão');
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values (t.id('1'), t.id('f29'), t.id('e22'), t.id('f28'), 0, 'Emite', array[t.id('a3')]);
select t.expect('23503', 'assinatura do rascunho na etapa da versão em uso é recusada',
  $$insert into ptw.sign_slot (unit_id, version_id, stage_id, position, meaning, role_ids) values (t.id('1'), t.id('e22'), t.id('f21'), 5, 'Intrusa', array[t.id('a3')])$$);
select t.expect('23503', 'separação do rascunho com assinatura da versão em uso é recusada',
  $$insert into ptw.separation (unit_id, version_id, slot_a, slot_b) values (t.id('1'), t.id('e22'), t.id('f25'), t.id('f29'))$$);
select t.expect('PTW03', 'mover assinatura da versão em uso para o rascunho continua recusado',
  $$update ptw.sign_slot set version_id = t.id('e22'), stage_id = t.id('f28') where id = t.id('f25')$$);

reset role;
create function t.cycle(n int, asset uuid) returns uuid language plpgsql as $$
declare pid uuid := ('00000000-0000-7000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid;
begin
  insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
  values (ptw.current_unit(), pid, t.id('e20'), t.id('e21'), t.id('d2'), t.id('b2'),
          tstzrange(now() - interval '1 hour', now() + interval '8 hours'), 'Ciclo ' || n);
  insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), pid, asset);
  perform ptw.permit_submit(ptw.current_unit(), pid);
  return pid;
end $$;
create function t.sign(p uuid, slot text, who text, r int default 1) returns void language sql as $$
  select t.sig(p, r, t.id(slot), t.id(who)) $$;
create function t.ansp(p uuid, item text, v text) returns void language sql as $$
  insert into ptw.permit_answer (unit_id, permit_id, item_id, value, answered_by) values (ptw.current_unit(), p, item, v::jsonb, t.id('d2'))
  on conflict (unit_id, permit_id, item_id) do update set value = excluded.value $$;
-- G7: PT do modelo "Ciclo assinado" (e30/e31) com janela relativa a agora; t.as troca a pessoa da sessão.
create function t.g7(n int, asset uuid, lo interval, hi interval) returns uuid language plpgsql as $$
declare pid uuid := t.id('33' || n);
begin
  insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
  values (ptw.current_unit(), pid, t.id('e30'), t.id('e31'), t.id('d2'), t.id('b2'), tstzrange(now() + lo, now() + hi), 'G7 ' || n);
  insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), pid, asset);
  return pid;
end $$;
-- Trava: PT na versão e2 (prende) ou e71 (não prende), com um ativo.
create function t.hd(n text, ver text, asset text) returns uuid language plpgsql as $$
begin
  insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
  values (ptw.current_unit(), t.id(n), case ver when 'e2' then t.id('e1') else t.id('e70') end, t.id(ver), t.id('d2'), t.id('b2'),
          tstzrange(now() - interval '1 hour', now() + interval '8 hours'), 'Trava ' || n);
  insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), t.id(n), t.id(asset));
  return t.id(n);
end $$;
create function t.as(who text) returns void language sql as $$ select set_config('ptw.person_id', t.id(who)::text, false) $$;
grant execute on all functions in schema t to ptw_app;
insert into ptw.asset (unit_id, id, type_id, code, name) values
  (t.id('1'), t.id('ca1'), t.id('a2'), 'G7-01', 'Painel G7 1'), (t.id('1'), t.id('ca2'), t.id('a2'), 'G7-02', 'Painel G7 2'),
  (t.id('1'), t.id('ca3'), t.id('a2'), 'G7-03', 'Painel G7 3'), (t.id('1'), t.id('ca4'), t.id('a2'), 'G7-04', 'Painel G7 4');
insert into ptw.asset (unit_id, id, type_id, code, name) values
  (t.id('1'), t.id('c7'), t.id('a2'), 'EXP-01', 'Painel que expira'), (t.id('1'), t.id('c8'), t.id('a2'), 'SUS-01', 'Painel suspenso'),
  (t.id('1'), t.id('c9'), t.id('a2'), 'REV-01', 'Painel devolvido');
set role ptw_api_test;

-- Expirada: a área sempre é devolvida. Entrega → entregue → Aceite da área → encerrada; o equipamento solta.
select t.cycle(1, t.id('c7'));
update ptw.permit set state = 'emitida' where id = t.id('201');
update ptw.permit set state = 'ativa' where id = t.id('201');
update ptw.permit set state = 'expirada', state_note = 'Janela encerrada' where id = t.id('201');
select t.expect('PTW06', 'expirada: seção de outra etapa (Emissão) não aceita resposta', $$select t.ansp(t.id('201'), 'em_obs', '{"t": "texto", "v": "x"}')$$);
select t.expect('PTW06', 'expirada: Encerramento ainda não aceita resposta', $$select t.ansp(t.id('201'), 'enc', '{"t": "texto", "v": "x"}')$$);
select t.expect('PTW16', 'expirada: Entrega com "Área limpa: Não" bloqueia', $$select t.ansp(t.id('201'), 'ent', '{"t": "verificacao", "lines": {"limpa": {"a": "nao"}}}'); select t.sign(t.id('201'), 'f26', 'd1')$$);
select t.expect('', 'expirada: responde e assina a Entrega', $$select t.ansp(t.id('201'), 'ent', '{"t": "verificacao", "lines": {"limpa": {"a": "sim"}}}'); select t.sign(t.id('201'), 'f26', 'd1')$$);
select t.expect('', 'expirada → entregue', $$update ptw.permit set state = 'entregue' where id = t.id('201')$$);
select t.expect('PTW06', 'entregue: a Entrega já não aceita resposta', $$select t.ansp(t.id('201'), 'ent', '{"t": "verificacao", "lines": {"limpa": {"a": "nao"}}}')$$);
select t.expect('', 'entregue: responde o Encerramento e assina o Aceite da área', $$select t.ansp(t.id('201'), 'enc', '{"t": "texto", "v": "Área limpa e liberada"}'); select t.sign(t.id('201'), 'f27', 'd2')$$);
select t.expect('', 'entregue → encerrada', $$update ptw.permit set state = 'encerrada' where id = t.id('201')$$);
select t.check(not exists (select 1 from ptw.v_equipment_hold where asset_id = t.id('c7')), 'encerrada: o equipamento da PT expirada fica livre');
select t.expect('PTW06', 'encerrada não aceita resposta, nem na etapa final', $$select t.ansp(t.id('201'), 'enc', '{"t": "texto", "v": "depois"}')$$);
select t.expect('', 'nova PT no equipamento liberado', $$select t.cycle(3, t.id('c7'))$$);

-- Suspensa sem retomada: Entrega → entregue → Aceite da área → encerrada.
select t.cycle(2, t.id('c8'));
update ptw.permit set state = 'emitida' where id = t.id('202');
update ptw.permit set state = 'ativa' where id = t.id('202');
update ptw.permit set state = 'suspensa', state_note = 'Chuva forte' where id = t.id('202');
select t.expect('', 'suspensa → Entrega assinada → entregue → Aceite da área → encerrada', $$
  select t.ansp(t.id('202'), 'ent', '{"t": "verificacao", "lines": {"limpa": {"a": "sim"}}}');
  select t.sign(t.id('202'), 'f26', 'd1');
  update ptw.permit set state = 'entregue' where id = t.id('202');
  select t.ansp(t.id('202'), 'enc', '{"t": "texto", "v": "Sem pendências"}');
  select t.sign(t.id('202'), 'f27', 'd1');
  update ptw.permit set state = 'encerrada' where id = t.id('202')$$);
select t.check(not exists (select 1 from ptw.v_equipment_hold where asset_id = t.id('c8')), 'encerrada: o equipamento da PT suspensa fica livre');

-- Reenvio depois de devolvida (min = 2 na Emissão): nova revisão; a assinatura anterior não conta mais.
select t.cycle(4, t.id('c9'));
select t.sign(t.id('204'), 'f25', 'd1');
select snapshot_sha256 as snap4 from ptw.permit where id = t.id('204') \gset
select set_config('ptw.person_id', t.id('d1')::text, false);
update ptw.permit set state = 'devolvida', state_note = 'Devolvida: falta a APR' where id = t.id('204');
select set_config('ptw.person_id', t.id('d2')::text, false);
select t.expect('', 'reenviar a PT devolvida', $$select ptw.permit_submit(ptw.current_unit(), t.id('204'))$$);
select t.check((select revision = 2 and state = 'em_analise' from ptw.permit where id = t.id('204')), 'reenvio abre a revisão 2');
select t.check((select reason = 'Reenviada após devolução' and sha256 is not null from ptw.permit_revision where permit_id = t.id('204') and rev = 2)
           and exists (select 1 from ptw.audit_event where action = 'pt.revisao' and permit_id = t.id('204') and rev = 2), 'revisão 2 registrada e auditada');
select t.check((select snapshot_sha256 = :'snap4'::bytea from ptw.permit where id = t.id('204')), 'reenvio mantém o formulário congelado no primeiro envio');
select t.check((select voided_at is not null and voided_reason like 'Reenviada após devolução%' from ptw.signature where permit_id = t.id('204') and person_id = t.id('d1'))
           and exists (select 1 from ptw.audit_event where action = 'pt.assinatura.anulada' and permit_id = t.id('204')), 'assinatura da revisão 1 anulada e auditada');
select t.expect('PTW07', 'assinar a revisão antiga é recusado', $$select t.sign(t.id('204'), 'f25', 'd2', 1)$$);
select t.sign(t.id('204'), 'f25', 'd2', 2);
select t.check((select count(*) = 1 from ptw.signature where permit_id = t.id('204') and slot_id = t.id('f25') and rev = 2 and voided_at is null),
               'Emissão (min = 2) conta 1 assinatura na revisão 2, não 2');
select t.expect('', 'a pessoa da revisão anterior assina de novo na nova revisão', $$select t.sign(t.id('204'), 'f25', 'd1', 2)$$);

-- ---------- G1/G2: origem da importação e evento modelo.importado ----------
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e40'), 'Importado G');
select t.check((select data -> 'para' -> 'import_source' ->> 'sha256' = encode(sha256(convert_to(t.src('pacote ptw.modelo/1')::text, 'UTF8')), 'hex')
                       and not (data -> 'para' -> 'import_source' ? 'trechos')
                  from ptw.audit_event where action = 'modelo.versao.criada' and entity_id = t.id('e10')), 'origem da importação auditada só pelo SHA-256');
select t.check((select text = 'Importou “Espaço confinado” v3 como rascunho sugerido de pt-espaco.ptw-modelo.json: 1 etapa, 13 itens, 0 assinaturas, 0 listas novas, 0 tipos novos, 1 cargo novo'
                       and entity = 'template_version' and actor_id = t.id('d2')
                       and data -> 'totais' = '{"versao": 3, "etapas": 1, "assinaturas": 0, "secoes": 2, "itens": 13, "listasNovas": 0, "tiposNovos": 0, "cargosNovos": 1, "separacoes": 0}'
                       and data -> 'novos' -> 'cargos' = jsonb_build_array(t.id('a8')) and data ->> 'modelo' = 'claude-opus'
                       and data -> 'documentos' -> 0 ->> 'arquivo' = 'PET-confined.pdf' and data -> 'idioma' ->> 'documento' = 'en'
                  from ptw.audit_event where action = 'modelo.importado' and entity_id = t.id('e10')), 'modelo.importado com pacote, documentos, IA, idioma e totais');
select t.expect('PTW14', 'modelo.importado uma vez só por versão', $$select ptw.audit_import(t.id('e10'))$$);
select t.expect('PTW14', 'versão sugerida sem modelo.importado é recusada no commit', $$
  insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source)
  values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), t.src('p'));
  set constraints all immediate$$);
select t.expect('PTW14', 'modelo.importado com item novo que não existe', $$
  insert into ptw.template_version (unit_id, id, template_id, number, origin, source_sha256, import_source)
  values (t.id('1'), t.id('e41'), t.id('e40'), 1, 'sugerida', sha256('p'), t.src('p'));
  select ptw.audit_import(t.id('e41'), '{"listas": ["00000000-0000-7000-8000-00000000ffff"]}')$$);
select t.expect('PTW14', 'modelo.importado em versão manual', $$select ptw.audit_import(t.id('e2'))$$);
select t.expect('23514', 'versão manual não tem origem de importação', $$insert into ptw.template_version (unit_id, template_id, number, import_source) values (t.id('1'), t.id('e40'), 1, t.src('p'))$$);
select t.expect('PTW15', 'origem: SHA-256 do pacote diferente de source_sha256', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('outro'), t.src('p'))$$);
select t.expect('PTW15', 'origem: elemento sem o trecho literal', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), jsonb_set(t.src('p'), '{trechos,o2,trecho}', '" "'))$$);
select t.expect('PTW15', 'origem: trecho de um arquivo que não é documento de origem', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), jsonb_set(t.src('p'), '{trechos,o2,arquivo}', '"outro.pdf"'))$$);
select t.expect('PTW15', 'origem: página que não é inteiro positivo', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), jsonb_set(t.src('p'), '{trechos,o2,pagina}', '0'))$$);
select t.expect('PTW15', 'origem: campo desconhecido', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), t.src('p') || '{"x": 1}')$$);
select t.expect('PTW15', 'origem: sem a ferramenta que gerou', $$insert into ptw.template_version (unit_id, template_id, number, origin, source_sha256, import_source) values (t.id('1'), t.id('e40'), 1, 'sugerida', sha256('p'), t.src('p') - 'ferramenta')$$);
select t.expect('', 'origem de pacote exportado de outra planta (sem documentos)', $$
  insert into ptw.template_version (unit_id, id, template_id, number, origin, source_sha256, import_source)
  values (t.id('1'), t.id('e42'), t.id('e40'), 1, 'sugerida', sha256('p'), jsonb_set(t.src('p'), '{documentos}', '[]') #- '{trechos,o2,arquivo}');
  select ptw.audit_import(t.id('e42'))$$);

-- ---------- G5/G6: condição por linha; rascunho sem cargo e sem significado ----------
insert into ptw.stage (unit_id, id, version_id, position, name, kind) values (t.id('1'), t.id('f40'), t.id('e42'), 0, 'Emissão', 'emissao');
select t.expect('', 'rascunho: assinatura sem cargo e sem significado', $$insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position) values (t.id('1'), t.id('f41'), t.id('e42'), t.id('f40'), 0)$$);
select t.expect('PTW28', 'ativar com assinatura sem cargo', $$select ptw.version_activate(t.id('1'), t.id('e42'))$$);
update ptw.sign_slot set role_ids = array[t.id('a3')] where id = t.id('f41');
select t.expect('PTW28', 'ativar com assinatura sem significado', $$select ptw.version_activate(t.id('1'), t.id('e42'))$$);
update ptw.sign_slot set meaning = 'Emite' where id = t.id('f41');
select t.expect('23514', 'linha da condição sem o item', $$insert into ptw.sign_slot (unit_id, version_id, stage_id, position, meaning, role_ids, required_when_line) values (t.id('1'), t.id('e42'), t.id('f40'), 1, 'X', array[t.id('a3')], 'l1')$$);
update ptw.template_version set form = '{"sections": [{"id": "s", "title": "S", "items": [{"id": "chk", "kind": "verificacao", "label": "Condições", "answers": "sim_nao", "lines": [{"id": "l1", "label": "Espaço confinado"}]}]}]}' where id = t.id('e42');
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids, required_when_item, required_when_line, required_when_values)
values (t.id('1'), t.id('f42'), t.id('e42'), t.id('f40'), 1, 'Vigia', array[t.id('a3')], 'chk', 'zz', '{sim}');
select t.expect('PTW15', 'ativar com condição numa linha que não existe', $$select ptw.version_activate(t.id('1'), t.id('e42'))$$);
update ptw.sign_slot set required_when_line = 'l1' where id = t.id('f42');
select t.check((select data = '{"de": {"required_when_line": "zz"}, "para": {"required_when_line": "l1"}}' and text = 'Assinatura do modelo alterada: Vigia (linha da condição)'
                  from t.ev('modelo.assinatura.alterada')), 'linha da condição auditada');
select t.expect('', 'ativar com cargo, significado e condição por linha', $$select ptw.version_activate(t.id('1'), t.id('e42'))$$);
select t.check((select ptw.slot_required(s, '{"chk": {"t": "verificacao", "lines": {"l1": {"a": "sim"}}}}')
                       and not ptw.slot_required(s, '{"chk": {"t": "verificacao", "lines": {"l1": {"a": "nao"}}}}')
                       and not ptw.slot_required(s, '{}') from ptw.sign_slot s where id = t.id('f42')), 'condição por linha: vale só com a resposta pedida');
select t.check((select ptw.slot_required(s, '{"m": {"t": "marcacao", "ids": ["a", "b"]}}') and not ptw.slot_required(s, '{"m": {"t": "marcacao", "ids": ["a"]}}')
                  from ptw.sign_slot s where id = t.id('f9')), 'condição por marcação: vale com a opção marcada');

-- ---------- G3: Desfazer é evento próprio ----------
begin;
select ptw.set_context(t.id('1'), t.id('d1'), null, 'sessao', 'tablet-07', 'req-undo', null, p_undo => true);
update ptw.asset set name = 'Motor' where id = t.id('c4');
commit;
select t.check((select text = 'Desfazer: Ativo alterado: M-201 (nome)' and reason = 'Desfazer' and actor_id = t.id('d1')
                       and data = '{"de": {"name": "Motor 201 (bomba)"}, "para": {"name": "Motor"}}'
                  from t.ev('cadastro.ativo.alterado.desfeito')), 'Desfazer: ação <ação>.desfeito, texto e motivo');
select t.check((select action = 'cadastro.ativo.alterado' and reason is null from ptw.audit_event where entity_id = t.id('c4') and action like 'cadastro.ativo.alterado%' order by seq desc offset 1 limit 1),
               'a escrita original continua com a ação normal');
select t.expect('PTW14', 'contexto com desfazer nulo', $$select ptw.set_context(t.id('1'), t.id('d1'), null, 'sessao', null, null, null, null)$$);

-- ---------- G7: regras de segurança que eram só do app ----------
-- Modelo com as cinco etapas, uma assinatura em cada; a Emissão tem a Vigia, obrigatória só quando
-- a linha "Espaço confinado" do pedido é "Sim".
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e30'), 'Ciclo assinado');
insert into ptw.template_version (unit_id, id, template_id, number, form) values (t.id('1'), t.id('e31'), t.id('e30'), 1, $j${"sections": [
  {"id": "sq", "title": "Pedido", "stageId": "00000000-0000-7000-8000-000000000f30", "items": [{"id": "chk", "kind": "verificacao", "label": "Condições", "required": false, "answers": "sim_nao", "lines": [{"id": "l1", "label": "Espaço confinado", "blockOn": [], "noteOn": []}]}]}]}$j$::jsonb);
insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked) values
  (t.id('1'), t.id('f30'), t.id('e31'), 0, 'Solicitação', 'solicitacao', true), (t.id('1'), t.id('f31'), t.id('e31'), 1, 'Emissão', 'emissao', true),
  (t.id('1'), t.id('f32'), t.id('e31'), 2, 'Aceite no campo', 'aceite_campo', true), (t.id('1'), t.id('f33'), t.id('e31'), 3, 'Entrega', 'entrega', true),
  (t.id('1'), t.id('f34'), t.id('e31'), 4, 'Aceite da área', 'aceite_area', true);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids, required_when_item, required_when_line, required_when_values) values
  (t.id('1'), t.id('f35'), t.id('e31'), t.id('f30'), 0, 'Solicita', array[t.id('a3')], null, null, null),
  (t.id('1'), t.id('f36'), t.id('e31'), t.id('f31'), 0, 'Emite', array[t.id('a3')], null, null, null),
  (t.id('1'), t.id('f37'), t.id('e31'), t.id('f31'), 1, 'Vigia', array[t.id('a3')], 'chk', 'l1', '{sim}'),
  (t.id('1'), t.id('f38'), t.id('e31'), t.id('f32'), 0, 'Aceita no campo', array[t.id('a3')], null, null, null),
  (t.id('1'), t.id('f39'), t.id('e31'), t.id('f33'), 0, 'Entrega', array[t.id('a3')], null, null, null),
  (t.id('1'), t.id('f3a'), t.id('e31'), t.id('f34'), 0, 'Aceita a área', array[t.id('a3')], null, null, null);
select ptw.version_activate(t.id('1'), t.id('e31'));
select t.g7(0, t.id('ca1'), interval '-1 hour', interval '8 hours');   -- P330: janela agora
select t.g7(1, t.id('ca2'), interval '-1 hour', interval '8 hours');   -- P331: fica em rascunho
select t.g7(2, t.id('ca3'), interval '2 hours', interval '10 hours');  -- P332: janela no futuro
select t.g7(3, t.id('ca4'), interval '-10 hours', interval '-2 hours'); -- P333: janela vencida

-- Enviar, Devolver, estados e etapa atual.
select t.as('d1');
select t.expect('PTW17', 'só o solicitante envia', $$select ptw.permit_submit(ptw.current_unit(), t.id('330'), false)$$);
select t.as('d2');
select t.expect('PTW19', 'rascunho não aceita assinatura', $$select t.sign(t.id('331'), 'f35', 'd2')$$);
select ptw.permit_submit(ptw.current_unit(), t.id('330'), false);
select t.expect('PTW20', 'só a etapa atual (Solicitação) aceita assinatura', $$select t.sign(t.id('330'), 'f36', 'd1')$$);
select t.expect('PTW17', 'só o solicitante assina a Solicitação', $$select t.sign(t.id('330'), 'f35', 'd1')$$);
select t.ansp(t.id('330'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "nao"}}}');
select t.sign(t.id('330'), 'f35', 'd2');
select t.check(ptw.permit_current_stage(t.id('1'), t.id('330')) = t.id('f31'), 'Solicitação assinada: a etapa atual é a Emissão');
select t.expect('PTW18', 'o solicitante não devolve a própria PT', $$update ptw.permit set state = 'devolvida' where id = t.id('330')$$);
select t.expect('PTW20', 'assinatura condicional não pedida (linha "Não") não é aceita', $$select t.sign(t.id('330'), 'f37', 'd1')$$);
select t.sign(t.id('330'), 'f36', 'd1');
select t.check(ptw.permit_current_stage(t.id('1'), t.id('330')) = t.id('f32'), 'Vigia não obrigatória (linha "Não"): a Emissão fecha com uma assinatura');
select t.expect('PTW20', 'etapa já concluída não aceita assinatura', $$select t.sign(t.id('330'), 'f37', 'd2')$$);
update ptw.permit set state = 'emitida' where id = t.id('330');

-- Parar.
select t.expect('PTW25', 'parar PT que não está em campo', $$update ptw.permit set hold_reason = 'x', hold_by = t.id('d2'), hold_at = now() where id = t.id('331')$$);
select t.as('d5');
select t.expect('PTW24', 'parar sem login ativo', $$update ptw.permit set hold_reason = 'Chuva', hold_by = t.id('d5'), hold_at = now() where id = t.id('330')$$);
select t.as('d2');
select t.expect('PTW24', 'parada em nome de outra pessoa', $$update ptw.permit set hold_reason = 'Chuva', hold_by = t.id('d1'), hold_at = now() where id = t.id('330')$$);
update ptw.permit set hold_reason = 'Chuva', hold_by = t.id('d2'), hold_at = now() where id = t.id('330');
select t.expect('PTW21', 'parada barra o Aceite no campo', $$select t.sign(t.id('330'), 'f38', 'd1')$$);

-- Retomar.
select t.expect('PTW26', 'retomar sem parada', $$update ptw.permit set resumed_reason = 'x', resumed_by = t.id('d2'), resumed_at = now() where id = t.id('331')$$);
select t.as('d3');
select t.expect('PTW26', 'retomar sem ser elegível para a Emissão', $$update ptw.permit set hold_reason = null, hold_by = null, hold_at = null, resumed_reason = 'Tempo firme', resumed_by = t.id('d3'), resumed_at = now() where id = t.id('330')$$);
select t.as('d1');
select t.expect('PTW26', 'retomada em nome de outra pessoa', $$update ptw.permit set hold_reason = null, hold_by = null, hold_at = null, resumed_reason = 'Tempo firme', resumed_by = t.id('d2'), resumed_at = now() where id = t.id('330')$$);
update ptw.permit set hold_reason = null, hold_by = null, hold_at = null, resumed_reason = 'Tempo firme', resumed_by = t.id('d1'), resumed_at = now() where id = t.id('330');
select t.as('d2');
select t.expect('PTW22', 'quem retomou não faz o Aceite no campo', $$select t.sign(t.id('330'), 'f38', 'd1')$$);
select t.sign(t.id('330'), 'f38', 'd2');
update ptw.permit set state = 'ativa', resumed_reason = null, resumed_by = null, resumed_at = null where id = t.id('330');

-- Parar a PT ativa (suspensa), Retomada anula o aceite, novo aceite de outra pessoa.
update ptw.permit set state = 'suspensa', hold_reason = 'Vazamento', hold_by = t.id('d2'), hold_at = now() where id = t.id('330');
select t.expect('PTW19', 'suspensa sem Retomada não aceita o Aceite no campo', $$select t.sign(t.id('330'), 'f38', 'd1')$$);
select t.expect('PTW27', 'suspensa não volta a ativa sem Retomada', $$update ptw.permit set state = 'ativa' where id = t.id('330')$$);
select t.as('d1');
update ptw.permit set hold_reason = null, hold_by = null, hold_at = null, resumed_reason = 'Vazamento contido', resumed_by = t.id('d1'), resumed_at = now() where id = t.id('330');
select t.as('d2');
select t.check((select voided_reason = 'Retomada: novo Aceite no campo exigido' from ptw.signature where permit_id = t.id('330') and slot_id = t.id('f38'))
           and (select data ->> 'motivo' = 'Retomada: novo Aceite no campo exigido' from t.ev('pt.assinatura.anulada')), 'Retomada anula o Aceite no campo (e fica na trilha)');
select t.check(ptw.permit_current_stage(t.id('1'), t.id('330')) = t.id('f32'), 'depois da Retomada a etapa atual volta a ser o Aceite no campo');
select t.expect('PTW27', 'retomada sem o novo aceite não volta a ativa', $$update ptw.permit set state = 'ativa' where id = t.id('330')$$);
select t.expect('PTW22', 'quem retomou não faz o novo aceite', $$select t.sign(t.id('330'), 'f38', 'd1')$$);
select t.expect('', 'novo aceite de outra pessoa e a PT volta a ativa', $$select t.sign(t.id('330'), 'f38', 'd2');
  update ptw.permit set state = 'ativa', resumed_reason = null, resumed_by = null, resumed_at = null where id = t.id('330')$$);

-- Janela.
select ptw.permit_submit(ptw.current_unit(), t.id('332'), false);
select t.sign(t.id('332'), 'f35', 'd2');
-- Devolver só quem pode assinar a etapa pendente (PTW29); uma assinatura por pessoa na etapa (PTW30).
select t.as('d3');
select t.expect('PTW29', 'devolver sem poder assinar a etapa pendente', $$update ptw.permit set state = 'devolvida' where id = t.id('332')$$);
select t.as('d2');
select t.ansp(t.id('332'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}');
select t.sign(t.id('332'), 'f36', 'd1');
select t.expect('PTW30', 'a mesma pessoa não assina duas vezes a mesma etapa', $$select t.sign(t.id('332'), 'f37', 'd1')$$);
select t.expect('', 'Vigia (linha "Sim") assinada por outra pessoa', $$select t.sign(t.id('332'), 'f37', 'd2')$$);
update ptw.permit set state = 'emitida' where id = t.id('332');
select t.expect('PTW23', 'Aceite no campo antes da janela', $$select t.sign(t.id('332'), 'f38', 'd2')$$);
select ptw.permit_submit(ptw.current_unit(), t.id('333'), false);
select t.expect('PTW23', 'janela encerrada: só a devolução da área', $$select t.sign(t.id('333'), 'f35', 'd2')$$);
select t.as('d1');
select t.expect('', 'quem pode assinar a etapa pendente devolve', $$update ptw.permit set state = 'devolvida', state_note = 'Janela vencida' where id = t.id('333')$$);
select t.as('d2');

-- ---------- R1–R5: opções que impedem, respostas de uma lista, prazo máximo da janela, vários cargos, prorrogação ----------
reset role;
-- Listas: "SIM / N.A." (respostas da verificação) e "Condição da área" (opções da marcação).
insert into ptw.option_list (unit_id, id, name) values (t.id('1'), t.id('5a0'), 'SIM / N.A.'), (t.id('1'), t.id('5b0'), 'Condição da área');
insert into ptw.option_item (unit_id, id, list_id, label, position) values
  (t.id('1'), t.id('5a1'), t.id('5a0'), 'SIM', 0), (t.id('1'), t.id('5a2'), t.id('5a0'), 'N.A.', 1), (t.id('1'), t.id('5a3'), t.id('5a0'), 'NÃO', 2),
  (t.id('1'), t.id('5b1'), t.id('5b0'), 'Boa', 0), (t.id('1'), t.id('5b2'), t.id('5b0'), 'Ruim', 1);
create function t.fr(block_on text) returns jsonb language sql immutable return replace($j${"sections": [
  {"id": "sp", "title": "Pedido", "stageId": "00000000-0000-7000-8000-000000000f50", "items": [
    {"id": "risco", "kind": "marcacao", "label": "Risco", "required": true, "options": [{"id": "ok", "label": "Sem risco"}, {"id": "gas", "label": "Gás presente", "blocks": true}], "multiple": false, "other": false},
    {"id": "cond", "kind": "marcacao", "label": "Condição", "required": true, "options": [], "listId": "00000000-0000-7000-8000-0000000005b0", "blockOptionIds": ["00000000-0000-7000-8000-0000000005b2"], "multiple": false, "other": false},
    {"id": "chk", "kind": "verificacao", "label": "Checagens", "required": true, "answers": "lista", "answerListId": "00000000-0000-7000-8000-0000000005a0",
     "lines": [{"id": "l1", "label": "Área sinalizada", "blockOn": ["BLOCK"], "noteOn": ["00000000-0000-7000-8000-0000000005a2"]}]}]}]}$j$, 'BLOCK', block_on)::jsonb;
grant execute on function t.fr(text) to ptw_app;
set role ptw_api_test;

-- Estrutura (PTW15).
select t.expect('PTW15', 'R2: verificação "lista" sem a lista de respostas', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, t.fr(t.id('5a3')::text) #- '{sections,0,items,2,answerListId}')$$);
select t.expect('PTW15', 'R2: lista de respostas sem answers = "lista"', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, jsonb_set(t.fr(t.id('5a3')::text), '{sections,0,items,2,answers}', '"sim_nao"'))$$);
select t.expect('PTW15', 'R2: com lista, blockOn leva ids de itens', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, t.fr('nao'))$$);
select t.expect('PTW15', 'R1: "blocks" que não é sim/não', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, jsonb_set(t.fr(t.id('5a3')::text), '{sections,0,items,0,options,1,blocks}', '"sim"'))$$);
select t.expect('PTW15', 'R1: opções da lista que impedem sem a lista', $$insert into ptw.template_version (unit_id, template_id, number, form) values (t.id('1'), t.id('e3'), 90, t.fr(t.id('5a3')::text) #- '{sections,0,items,1,listId}')$$);
select t.expect('23514', 'R3: prazo máximo zero', $$insert into ptw.template_version (unit_id, template_id, number, max_window) values (t.id('1'), t.id('e3'), 90, interval '0')$$);
select t.check(ptw.window_label(interval '3 days') = '3 dias' and ptw.window_label(interval '1 day') = '1 dia'
               and ptw.window_label(interval '12 hours') = '12 horas' and ptw.window_label(interval '36 hours') = '36 horas'
               and ptw.window_label(interval '90 minutes') = '1,5 horas', 'R3: prazo como frase (dias ou horas)');

-- Modelo: prazo de 3 dias; a Emissão aceita Vigia OU Executante (nenhum dos dois é o Emitente).
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e50'), 'Contratos R1–R5');
insert into ptw.template_version (unit_id, id, template_id, number, form, max_window) values (t.id('1'), t.id('e51'), t.id('e50'), 1, t.fr(t.id('5b1')::text), interval '3 days');
insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked) values
  (t.id('1'), t.id('f50'), t.id('e51'), 0, 'Solicitação', 'solicitacao', true), (t.id('1'), t.id('f51'), t.id('e51'), 1, 'Emissão', 'emissao', true),
  (t.id('1'), t.id('f52'), t.id('e51'), 2, 'Aceite no campo', 'aceite_campo', true);
select t.expect('23503', 'R4: cargo que não é cargo (tipo de local)', $$insert into ptw.sign_slot (unit_id, version_id, stage_id, position, meaning, role_ids) values (t.id('1'), t.id('e51'), t.id('f50'), 9, 'X', array[t.id('a1')])$$);
select t.expect('23514', 'R4: cargo repetido', $$insert into ptw.sign_slot (unit_id, version_id, stage_id, position, meaning, role_ids) values (t.id('1'), t.id('e51'), t.id('f50'), 9, 'X', array[t.id('a3'), t.id('a3')])$$);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values
  (t.id('1'), t.id('f53'), t.id('e51'), t.id('f50'), 0, 'Solicita', array[t.id('a3')]),
  (t.id('1'), t.id('f54'), t.id('e51'), t.id('f51'), 0, 'Emite', '{}'),
  (t.id('1'), t.id('f55'), t.id('e51'), t.id('f52'), 0, 'Aceita no campo', array[t.id('a3')]);
select t.expect('PTW28', 'R4: ativar com assinatura sem nenhum cargo', $$select ptw.version_activate(t.id('1'), t.id('e51'))$$);
update ptw.sign_slot set role_ids = array[t.id('a8'), t.id('a4')] where id = t.id('f54');
select t.check((select data = jsonb_build_object('de', jsonb_build_object('role_ids', '[]'::jsonb), 'para', jsonb_build_object('role_ids', jsonb_build_array(t.id('a8'), t.id('a4'))))
                       and text = 'Assinatura do modelo alterada: Emite (cargos)' from t.ev('modelo.assinatura.alterada')), 'R4: cargos da assinatura auditados');
select t.expect('PTW15', 'R2: ativar com blockOn que não é item da lista de respostas', $$select ptw.version_activate(t.id('1'), t.id('e51'))$$);
update ptw.template_version set form = t.fr(t.id('5a3')::text) where id = t.id('e51');
select t.expect('', 'R1–R4: ativar com listas, prazo e vários cargos', $$select ptw.version_activate(t.id('1'), t.id('e51'))$$);
select t.expect('23503', 'R4: cargo usado em assinatura não sai', $$delete from ptw.type_def where id = t.id('a4')$$);
insert into ptw.person_role (unit_id, person_id, role_id, scope_location_id, valid_until) values (t.id('1'), t.id('d3'), t.id('a4'), null, current_date + 30);
insert into ptw.asset (unit_id, id, type_id, code, name) values (t.id('1'), t.id('ca5'), t.id('a2'), 'R-01', 'Painel R1–R5');
insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
values (t.id('1'), t.id('5c0'), t.id('e50'), t.id('e51'), t.id('d2'), t.id('b2'), tstzrange(now() - interval '1 hour', now() + interval '4 days'), 'R1–R5');
insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('5c0'), t.id('ca5'));

-- R3: prazo ao enviar.
select t.expect('PTW31', 'R3: enviar com janela além do prazo', $$select ptw.permit_submit(t.id('1'), t.id('5c0'), false)$$);
update ptw.permit set work_window = tstzrange(lower(work_window), lower(work_window) + interval '2 days') where id = t.id('5c0');
select t.expect('', 'R3: enviar dentro do prazo', $$select ptw.permit_submit(t.id('1'), t.id('5c0'), false)$$);
select t.expect('PTW31', 'R3: em análise, a janela não passa do prazo', $$update ptw.permit set work_window = tstzrange(lower(work_window), lower(work_window) + interval '73 hours') where id = t.id('5c0')$$);

-- R1: opção que impede (do item e da lista).
select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005a1"}}}');
select t.ansp(t.id('5c0'), 'cond', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b1"]}');
select t.ansp(t.id('5c0'), 'risco', '{"t": "marcacao", "ids": ["gas"]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('5c0'), 0) = 'Risco: “Gás presente” impede a etapa', 'R1: opção com "blocks" impede (mensagem)');
select t.expect('PTW16', 'R1: opção que impede bloqueia a assinatura', $$select t.sign(t.id('5c0'), 'f53', 'd2')$$);
select t.ansp(t.id('5c0'), 'risco', '{"t": "marcacao", "ids": ["ok"]}');
select t.ansp(t.id('5c0'), 'cond', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b2"]}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('5c0'), 0) = 'Condição: “Ruim” impede a etapa', 'R1: item da lista em blockOptionIds impede (rótulo do item)');
select t.expect('PTW16', 'R1: opção da lista que impede bloqueia a assinatura', $$select t.sign(t.id('5c0'), 'f53', 'd2')$$);
select t.ansp(t.id('5c0'), 'cond', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b1"]}');

-- R2: respostas da lista.
select t.expect('PTW15', 'R2: resposta fora da lista ("sim")', $$select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}')$$);
select t.expect('PTW15', 'R2: item de outra lista', $$select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005b1"}}}')$$);
select t.expect('', 'R2: item da lista com justificativa', $$select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005a2", "note": "Área interna"}}}')$$);
select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005a3"}}}');
select t.check(ptw.permit_blocker(t.id('1'), t.id('5c0'), 0) = 'Área sinalizada: "NÃO" impede a etapa', 'R2: item da lista em blockOn impede (rótulo do item)');
select t.expect('PTW16', 'R2: resposta que impede bloqueia a assinatura', $$select t.sign(t.id('5c0'), 'f53', 'd2')$$);
select t.ansp(t.id('5c0'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005a1"}}}');
select t.expect('', 'R1/R2: sem opção que impede, assina', $$select t.sign(t.id('5c0'), 'f53', 'd2')$$);

-- R4: Emissão por qualquer um dos cargos.
select t.expect('PTW08', 'R4: sem nenhum dos cargos não assina', $$select t.sign(t.id('5c0'), 'f54', 'd1')$$);
select t.expect('', 'R4: com um dos cargos (Executante) assina', $$select t.sign(t.id('5c0'), 'f54', 'd3')$$);

-- R3: prazo ao emitir (janela gravada fora da regra, como num banco antigo: só o superusuário consegue).
reset role;
set session_replication_role = replica;
update ptw.permit set work_window = tstzrange(lower(work_window), lower(work_window) + interval '4 days') where id = t.id('5c0');
set session_replication_role = origin;
set role ptw_api_test;
select t.expect('PTW31', 'R3: emitir com janela além do prazo', $$update ptw.permit set state = 'emitida' where id = t.id('5c0')$$);
reset role;
set session_replication_role = replica;
update ptw.permit set work_window = tstzrange(lower(work_window), lower(work_window) + interval '2 days') where id = t.id('5c0');
set session_replication_role = origin;
set role ptw_api_test;
select t.expect('', 'R3: emitir dentro do prazo', $$update ptw.permit set state = 'emitida' where id = t.id('5c0')$$);

-- R5: prorrogação.
select t.expect('PTW05', 'R5: a janela da PT emitida não muda direto', $$update ptw.permit set work_window = tstzrange(lower(work_window), upper(work_window) + interval '1 hour') where id = t.id('5c0')$$);
select t.expect('PTW32', 'R5: quem não pode emitir não prorroga', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select upper(work_window) + interval '1 hour' from ptw.permit where id = t.id('5c0')), 'Chuva')$$);
select t.as('d3');
select t.expect('PTW33', 'R5: sem justificativa', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select upper(work_window) + interval '1 hour' from ptw.permit where id = t.id('5c0')), '  ')$$);
select t.expect('PTW33', 'R5: fim que não passa do atual', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select upper(work_window) from ptw.permit where id = t.id('5c0')), 'Chuva')$$);
select t.expect('PTW33', 'R5: justificativa longa demais', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select upper(work_window) + interval '1 hour' from ptw.permit where id = t.id('5c0')), repeat('x', 501))$$);
select t.expect('PTW31', 'R5: prorrogar além do prazo (contado do início original)', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select lower(work_window) + interval '73 hours' from ptw.permit where id = t.id('5c0')), 'Chuva')$$);
select t.expect('PTW33', 'R5: PT que não está emitida nem ativa', $$select ptw.permit_extend(t.id('1'), t.id('331'), now() + interval '20 hours', 'Chuva')$$);
select t.expect('PTW32', 'R5: prorrogação em nome de outra pessoa', $$insert into ptw.permit_extension (unit_id, permit_id, new_end, reason, person_id) values (t.id('1'), t.id('5c0'), (select upper(work_window) + interval '1 hour' from ptw.permit where id = t.id('5c0')), 'Chuva', t.id('d2'))$$);
select upper(work_window) as end0 from ptw.permit where id = t.id('5c0') \gset
select t.expect('', 'R5: quem pode emitir prorroga com justificativa', $$select ptw.permit_extend(t.id('1'), t.id('5c0'), (select upper(work_window) + interval '10 hours' from ptw.permit where id = t.id('5c0')), ' Montagem atrasou pela chuva ')$$);
select t.check((select upper(p.work_window) = :'end0'::timestamptz + interval '10 hours' and e.old_end = :'end0'::timestamptz and e.new_end = upper(p.work_window)
                       and e.person_id = t.id('d3') and e.revision = 1 and e.reason = 'Montagem atrasou pela chuva'
                  from ptw.permit p join ptw.permit_extension e on e.unit_id = p.unit_id and e.permit_id = p.id where p.id = t.id('5c0')), 'R5: janela avançada e prorrogação gravada');
select t.check((select actor_id = t.id('d3') and permit_id = t.id('5c0') and rev = 1 and data ->> 'motivo' = 'Montagem atrasou pela chuva'
                       and (data -> 'de' ->> 'fim')::timestamptz = :'end0'::timestamptz
                       and (data -> 'para' ->> 'fim')::timestamptz = :'end0'::timestamptz + interval '10 hours'
                       and text ~ '^Janela prorrogada: até \d\d/\d\d \d\d:\d\d → até \d\d/\d\d \d\d:\d\d · Montagem atrasou pela chuva$'
                  from t.ev('pt.prorrogada')), 'R5: evento pt.prorrogada com de/para do fim e motivo');
select t.check((select action from ptw.audit_event where permit_id = t.id('5c0') order by seq desc limit 1) = 'pt.prorrogada', 'R5: prorrogação não vira "PT alterada" nem evento extra');
select t.expect('42501', 'R5: a API não altera prorrogação', $$update ptw.permit_extension set reason = 'outra' where permit_id = t.id('5c0')$$);
select t.as('d2');
reset role;
select t.expect('PTW01', 'R5: prorrogação não muda nem some (nem pelo dono)', $$delete from ptw.permit_extension where permit_id = t.id('5c0')$$);
set role ptw_api_test;

-- Versão que não prende o equipamento (ex.: desabilitação de intertravamento): convive com PT aberta
-- no mesmo ativo e em pai/filha; duas versões que prendem continuam colidindo.
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e70'), 'Desabilitação de intertravamento');
insert into ptw.template_version (unit_id, id, template_id, number, holds_equipment) values (t.id('1'), t.id('e71'), t.id('e70'), 1, false);
select ptw.version_activate(t.id('1'), t.id('e71'));
insert into ptw.asset (unit_id, id, type_id, code, name) values
  (t.id('1'), t.id('cb1'), t.id('a2'), 'ANA-01', 'Analisador 1'), (t.id('1'), t.id('cb2'), t.id('a2'), 'ANA-01.S1', 'Sonda do analisador 1'),
  (t.id('1'), t.id('cb3'), t.id('a2'), 'ANA-02', 'Analisador 2'), (t.id('1'), t.id('cb4'), t.id('a2'), 'ANA-02.S1', 'Sonda do analisador 2');
insert into ptw.asset_relation (unit_id, from_id, to_id, kind_id) values
  (t.id('1'), t.id('cb2'), t.id('cb1'), t.id('a5')), (t.id('1'), t.id('cb4'), t.id('cb3'), t.id('a5'));
select t.hd('371', 'e2', 'cb1'), t.hd('372', 'e71', 'cb1'), t.hd('373', 'e71', 'cb2'), t.hd('374', 'e2', 'cb2'),
       t.hd('375', 'e71', 'cb4'), t.hd('376', 'e2', 'cb3');
select t.expect('', 'trava: PT que prende no ANA-01', $$select ptw.permit_submit(ptw.current_unit(), t.id('371'))$$);
select t.expect('', 'trava: PT que não prende convive no mesmo ativo', $$select ptw.permit_submit(ptw.current_unit(), t.id('372'))$$);
select t.expect('', 'trava: PT que não prende convive na filha de ativo preso', $$select ptw.permit_submit(ptw.current_unit(), t.id('373'))$$);
select t.check((select bool_and(not holds) from ptw.permit_asset where permit_id in (t.id('372'), t.id('373')))
           and (select count(*) = 1 from ptw.v_equipment_hold where asset_id = t.id('cb1')), 'trava: PT que não prende não marca os ativos');
select t.expect('PTW10', 'trava: duas PTs que prendem ainda colidem (filha de ativo preso)', $$select ptw.permit_submit(ptw.current_unit(), t.id('374'))$$);
select t.expect('', 'trava: PT que não prende na filha, depois', $$select ptw.permit_submit(ptw.current_unit(), t.id('375'))$$);
select t.expect('', 'trava: PT que prende no pai de ativo com PT que não prende', $$select ptw.permit_submit(ptw.current_unit(), t.id('376'))$$);
select t.expect('PTW03', 'trava: "prende o equipamento" não muda na versão ativa', $$update ptw.template_version set holds_equipment = true where id = t.id('e71')$$);
select t.expect('PTW05', 'trava: a versão da PT não muda depois do envio', $$update ptw.permit set template_id = t.id('e1'), version_id = t.id('e2') where id = t.id('372')$$);
select t.expect('', 'trava: rascunho de versão pode mudar "prende o equipamento"', $$insert into ptw.template_version (unit_id, id, template_id, number) values (t.id('1'), t.id('e72'), t.id('e70'), 2);
                                                                                    update ptw.template_version set holds_equipment = false where id = t.id('e72')$$);
select t.check((select text like '%prende o equipamento%' from ptw.audit_event where entity_id = t.id('e72') order by seq desc limit 1), 'trava: mudança registrada como "prende o equipamento"');

-- ---------- F1-00: o que a API chama (lacunas L1–L7 e L9 de fabrica/fase-1.md) ----------
-- Modelo com as cinco etapas, uma assinatura (Emitente) em cada; o pedido tem uma verificação de duas
-- linhas e uma marcação que usa a lista "Condição da área" (Ruim impede).
reset role;
create function t.l(n text, asset text, lo interval default '-1 hour', hi interval default '8 hours') returns uuid language plpgsql as $$
begin
  insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
  values (ptw.current_unit(), t.id(n), t.id('e80'), t.id('e81'), ptw.current_person(), t.id('b2'), tstzrange(now() + lo, now() + hi), 'Lacuna ' || n);
  insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (ptw.current_unit(), t.id(n), t.id(asset));
  return t.id(n);
end $$;
create function t.st(n text) returns ptw.permit_state language sql as $$ select state from ptw.permit where id = t.id(n) $$;
-- t.psign: a pessoa "who" assina por ptw.permit_sign (devolve o estado); t.after: o que stateAfterSign diria agora.
-- O que um ato grava é conferido na instrução seguinte (a mesma instrução não enxerga a própria escrita).
create function t.psign(n text, slot text, who text, r int default 1) returns ptw.permit_state language plpgsql as $$
begin
  perform t.as(who);
  return ptw.permit_sign(ptw.current_unit(), t.id(n), t.id(slot), r);
end $$;
create function t.after(n text) returns ptw.permit_state language plpgsql as $$ begin return ptw.permit_state_after_sign(ptw.current_unit(), t.id(n)); end $$;
grant execute on all functions in schema t to ptw_app;
set role ptw_api_test;
select t.as('d2');
insert into ptw.asset (unit_id, id, type_id, code, name)
select t.id('1'), t.id('cc' || g), t.id('a2'), 'L-0' || g, 'Painel das lacunas ' || g from generate_series(1, 9) g;
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e80'), 'Lacunas L1–L9');
insert into ptw.template_version (unit_id, id, template_id, number, form) values (t.id('1'), t.id('e81'), t.id('e80'), 1, $j${"sections": [
  {"id": "sl", "title": "Pedido", "stageId": "00000000-0000-7000-8000-000000000f80", "items": [
    {"id": "chk2", "kind": "verificacao", "label": "Condições", "required": false, "answers": "sim_nao", "lines": [
      {"id": "la", "label": "Área sinalizada", "blockOn": [], "noteOn": []}, {"id": "lb", "label": "Extintor no local", "blockOn": [], "noteOn": []}]},
    {"id": "epi", "kind": "marcacao", "label": "Condição da área", "required": false, "options": [], "listId": "00000000-0000-7000-8000-0000000005b0",
     "blockOptionIds": ["00000000-0000-7000-8000-0000000005b2"], "multiple": false, "other": false}]}]}$j$::jsonb);
insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked) values
  (t.id('1'), t.id('f80'), t.id('e81'), 0, 'Solicitação', 'solicitacao', true), (t.id('1'), t.id('f81'), t.id('e81'), 1, 'Emissão', 'emissao', true),
  (t.id('1'), t.id('f82'), t.id('e81'), 2, 'Aceite no campo', 'aceite_campo', true), (t.id('1'), t.id('f83'), t.id('e81'), 3, 'Entrega', 'entrega', true),
  (t.id('1'), t.id('f84'), t.id('e81'), 4, 'Aceite da área', 'aceite_area', true);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values
  (t.id('1'), t.id('f85'), t.id('e81'), t.id('f80'), 0, 'Solicita', array[t.id('a3')]), (t.id('1'), t.id('f86'), t.id('e81'), t.id('f81'), 0, 'Emite', array[t.id('a3')]),
  (t.id('1'), t.id('f87'), t.id('e81'), t.id('f82'), 0, 'Aceita no campo', array[t.id('a3')]), (t.id('1'), t.id('f88'), t.id('e81'), t.id('f83'), 0, 'Entrega a área', array[t.id('a3')]),
  (t.id('1'), t.id('f89'), t.id('e81'), t.id('f84'), 0, 'Aceita a área', array[t.id('a3')]);

-- L6: revisão do rascunho de versão (concorrência otimista), fora da trilha.
select t.n() as n0 \gset
update ptw.template_version set note = 'Primeira leitura' where id = t.id('e81') and revision = 1;
select t.check((select revision = 2 and updated_at is not null from ptw.template_version where id = t.id('e81')), 'L6: alterar o rascunho de versão soma 1 na revisão');
select t.check(t.n() = :n0 + 1 and (select data = '{"de": {"note": ""}, "para": {"note": "Primeira leitura"}}' from t.ev('modelo.versao.alterada')), 'L6: a revisão fica fora do diff da trilha');
with u as (update ptw.template_version set note = 'Leitura atrasada' where id = t.id('e81') and revision = 1 returning 1)
select t.check((select count(*) = 0 from u), 'L6: escrita com a revisão antiga não altera nada (conflito)');
select t.n() as n0 \gset
update ptw.template_version set note = note where id = t.id('e81') and revision = 2;
select t.check((select revision = 3 from ptw.template_version where id = t.id('e81')) and t.n() = :n0, 'L6: conferir a revisão sem mudar nada soma 1 e não gera evento (quem edita só etapas e assinaturas)');
select ptw.version_activate(t.id('1'), t.id('e81'));
select t.check((select revision = 4 and status = 'ativa' from ptw.template_version where id = t.id('e81')), 'L6: ativar soma 1 na revisão');
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e85'), 'Lacuna L6');
insert into ptw.template_version (unit_id, id, template_id, number) values (t.id('1'), t.id('e86'), t.id('e85'), 1), (t.id('1'), t.id('e87'), t.id('e85'), 2);
select ptw.version_activate(t.id('1'), t.id('e86'));
select t.expect('', 'L6: ativa → arquivada continua valendo com a revisão somada', $$select ptw.version_activate(t.id('1'), t.id('e87'))$$);
select t.check((select status = 'arquivada' and revision = 3 from ptw.template_version where id = t.id('e86')), 'L6: versão arquivada com a revisão seguinte');
select t.expect('PTW03', 'L6: versão arquivada continua sem mudar', $$update ptw.template_version set note = 'x' where id = t.id('e86')$$);

-- L3: formulário congelado montado no banco.
select t.check((select i -> 'options' = jsonb_build_array(jsonb_build_object('id', t.id('5b1'), 'label', 'Boa'), jsonb_build_object('id', t.id('5b2'), 'label', 'Ruim', 'blocks', true))
                       and not i ? 'listId' and not i ? 'blockOptionIds'
                  from ptw.form_items(ptw.frozen_form(t.id('1'), t.id('e81'))) f(i, s) where i ->> 'id' = 'epi'),
               'L3: frozen_form copia as opções da lista (a que impede sai com "blocks") e tira listId e blockOptionIds');
select t.check((select i = f.item from ptw.form_items(ptw.frozen_form(t.id('1'), t.id('e81'))) x(i, s), ptw.form_items((select form from ptw.template_version where id = t.id('e81'))) f
                 where i ->> 'id' = 'chk2' and f.item ->> 'id' = 'chk2'), 'L3: os outros itens ficam como estão');
select t.check(ptw.form_problem(ptw.frozen_form(t.id('1'), t.id('e81'))) is null, 'L3: o formulário congelado tem estrutura válida');
update ptw.option_item set active = false where id = t.id('5b2');
select t.check((select jsonb_array_length(i -> 'options') = 1 from ptw.form_items(ptw.frozen_form(t.id('1'), t.id('e81'))) f(i, s) where i ->> 'id' = 'epi'), 'L3: item de lista fora de uso não é copiado');
update ptw.option_item set active = true where id = t.id('5b2');
select t.expect('42883', 'L3: permit_submit não recebe mais o formulário', $$select ptw.permit_submit(ptw.current_unit(), t.id('101'), '{"sections": []}'::jsonb)$$);

-- L4: autoria é a da sessão.
insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
values (t.id('1'), t.id('801'), t.id('e80'), t.id('e81'), t.id('d1'), t.id('b2'), tstzrange(now() - interval '1 hour', now() + interval '8 hours'), 'Lacuna 801');
insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('801'), t.id('cc1'));
select t.check((select author_id = t.id('d2') from ptw.permit where id = t.id('801')), 'L4: o solicitante é a pessoa da sessão, não o que o cliente mandou');
select t.expect('PTW05', 'L4: o solicitante da PT não muda', $$update ptw.permit set author_id = t.id('d1') where id = t.id('801')$$);
insert into ptw.permit_answer (unit_id, permit_id, item_id, value, answered_by) values (t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b2"]}', t.id('d1'));
select t.check((select answered_by = t.id('d2') from ptw.permit_answer where permit_id = t.id('801') and item_id = 'epi'), 'L4: quem respondeu é a pessoa da sessão');
update ptw.permit_answer set value = '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b2"], "x": 1}'::jsonb - 'x', answered_by = t.id('d1') where permit_id = t.id('801') and item_id = 'epi';
select t.check((select answered_by = t.id('d2') from ptw.permit_answer where permit_id = t.id('801') and item_id = 'epi'), 'L4: regravar a resposta fica em nome da pessoa da sessão');
insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, captured_by, captured_at)
values (t.id('1'), t.id('aa8'), t.id('801'), 'chk2', 'foto', sha256('foto do bloqueio'), 'area.jpg', t.id('d1'), now() - interval '3 days');
select t.check((select captured_by = t.id('d2') and captured_at > now() - interval '1 minute' from ptw.attachment where id = t.id('aa8')), 'L4: quem capturou o anexo é a pessoa da sessão, na hora do servidor');

-- F1-00b: o rascunho é do solicitante (d2). Outra pessoa (d1) não altera nada dele (PTW17), e nada muda.
create temp table draft_before as
select (select to_jsonb(p) - 'search' from ptw.permit p where p.id = t.id('801')) as pm,
       (select count(*) from ptw.permit_answer where permit_id = t.id('801')) as answers,
       (select jsonb_agg(value order by item_id) from ptw.permit_answer where permit_id = t.id('801')) as vals,
       (select count(*) from ptw.attachment where permit_id = t.id('801')) as files,
       (select count(*) from ptw.permit_asset where permit_id = t.id('801')) as assets,
       (select count(*) from ptw.permit_team where permit_id = t.id('801')) as team;
select t.as('d1');
select t.expect('PTW17', 'F1-00b: outra pessoa não altera os campos do rascunho', $$update ptw.permit set scope = 'Invadido' where id = t.id('801')$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não troca a janela do rascunho', $$update ptw.permit set work_window = tstzrange(now(), now() + interval '1 hour') where id = t.id('801')$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não responde no rascunho (função)', $$select ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": []}')$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não regrava resposta do rascunho', $$update ptw.permit_answer set value = '{"t": "marcacao", "ids": []}' where permit_id = t.id('801') and item_id = 'epi'$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não remove resposta do rascunho', $$delete from ptw.permit_answer where permit_id = t.id('801')$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não anexa no rascunho', $$insert into ptw.attachment (unit_id, permit_id, item_id, kind, sha256, file_name, captured_by) values (t.id('1'), t.id('801'), 'chk2', 'foto', sha256('foto do bloqueio'), 'x.jpg', t.id('d1'))$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não inclui ativo no rascunho', $$insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('801'), t.id('cc9'))$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não remove ativo do rascunho', $$delete from ptw.permit_asset where permit_id = t.id('801')$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não muda a equipe do rascunho', $$insert into ptw.permit_team (unit_id, permit_id, role_id, person_id) values (t.id('1'), t.id('801'), t.id('a3'), t.id('d1'))$$);
select t.expect('PTW17', 'F1-00b: outra pessoa não descarta o rascunho', $$select ptw.permit_discard(t.id('1'), t.id('801'), 'não é meu')$$);
select set_config('ptw.person_id', '', false);
select t.expect('PTW17', 'F1-00b: sem pessoa na sessão, a API não altera o rascunho', $$update ptw.permit set scope = 'Sem dono' where id = t.id('801')$$);
select t.check((select b.pm = (select to_jsonb(p) - 'search' from ptw.permit p where p.id = t.id('801'))
                       and b.answers = (select count(*) from ptw.permit_answer where permit_id = t.id('801'))
                       and b.vals = (select jsonb_agg(value order by item_id) from ptw.permit_answer where permit_id = t.id('801'))
                       and b.files = (select count(*) from ptw.attachment where permit_id = t.id('801'))
                       and b.assets = (select count(*) from ptw.permit_asset where permit_id = t.id('801'))
                       and b.team = (select count(*) from ptw.permit_team where permit_id = t.id('801')) from draft_before b),
               'F1-00b: as recusas não mudam nada no rascunho');
select t.as('d2');
select t.expect('', 'F1-00b: o solicitante altera o próprio rascunho', $$update ptw.permit set scope = 'Lacuna 801' where id = t.id('801')$$);
select t.expect('', 'F1-00b: o solicitante muda a equipe do próprio rascunho', $$insert into ptw.permit_team (unit_id, permit_id, role_id, person_id) values (t.id('1'), t.id('801'), t.id('a3'), t.id('d1'));
                                                                                delete from ptw.permit_team where permit_id = t.id('801')$$);
-- Respostas pela função: as linhas da verificação são juntadas.
select t.check(ptw.permit_answer_put(t.id('1'), t.id('801'), 'chk2', '{"t": "verificacao", "lines": {"la": {"a": "sim"}}}') = '{"t": "verificacao", "lines": {"la": {"a": "sim"}}}', 'L4: permit_answer_put grava e devolve a resposta');
select t.check(ptw.permit_answer_put(t.id('1'), t.id('801'), 'chk2', '{"t": "verificacao", "lines": {"lb": {"a": "nao"}}}') = '{"t": "verificacao", "lines": {"la": {"a": "sim"}, "lb": {"a": "nao"}}}', 'L4: outra linha da verificação é juntada, não substitui');
select t.check(ptw.permit_answer_put(t.id('1'), t.id('801'), 'chk2', '{"t": "verificacao", "lines": {"la": {"a": "nao"}}}') -> 'lines' = '{"la": {"a": "nao"}, "lb": {"a": "nao"}}', 'L4: a mesma linha de novo troca só essa linha');
select t.check(ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": []}') = '{"t": "marcacao", "ids": []}', 'L4: nos outros tipos a resposta nova substitui');
select t.expect('PTW15', 'L4: permit_answer_put confere a resposta contra o item', $$select ptw.permit_answer_put(t.id('1'), t.id('801'), 'chk2', '{"t": "verificacao", "lines": {"zz": {"a": "sim"}}}')$$);
select t.expect('PTW15', 'L3: no rascunho a marcação já responde pelas opções copiadas da lista', $$select ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005a1"]}')$$);
select set_config('ptw.person_id', '', false);
select t.expect('23502', 'L4: responder exige uma pessoa na sessão', $$select ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": []}')$$);
select t.expect('PTW08', 'L1: assinar exige uma pessoa na sessão', $$select ptw.permit_sign(t.id('1'), t.id('108'), t.id('f4'), 1)$$);
select t.as('d2');

-- L2/L3: enviar congela o formulário do banco e assina a Solicitação na mesma chamada.
select ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b2"]}');
select t.check(ptw.permit_next_label(t.id('1'), t.id('801')) = 'Rafael · Enviar' and ptw.permit_mine(t.id('1'), t.id('801'), t.id('d2'))
               and not ptw.permit_mine(t.id('1'), t.id('801'), t.id('d1')), 'L5: rascunho espera o solicitante (Enviar)');
select t.check(t.after('801') = 'em_analise', 'L1 tabela: rascunho → em análise (o envio)');
select t.expect('PTW16', 'L2: enviar com resposta que impede a Solicitação é recusado', $$select ptw.permit_submit(t.id('1'), t.id('801'))$$);
select t.check((select state = 'rascunho' and number is null and snapshot_sha256 is null from ptw.permit where id = t.id('801')), 'L2: assinatura da Solicitação recusada, nada é enviado');
select ptw.permit_answer_put(t.id('1'), t.id('801'), 'epi', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b1"]}');
select t.as('d1');
select t.expect('PTW17', 'L2: só o solicitante envia (com a assinatura na mesma chamada)', $$select ptw.permit_submit(t.id('1'), t.id('801'))$$);
select t.as('d2');
select t.expect('', 'L2: enviar com a assinatura da Solicitação', $$select ptw.permit_submit(t.id('1'), t.id('801'))$$);
select t.check((select state = 'em_analise' and number is not null from ptw.permit where id = t.id('801'))
           and (select count(*) = 1 from ptw.signature where permit_id = t.id('801') and slot_id = t.id('f85') and person_id = t.id('d2') and rev = 1 and voided_at is null)
           and (select actor_id = t.id('d2') and text = 'Assinou: Solicita' from ptw.audit_event where action = 'pt.assinatura' and permit_id = t.id('801') order by seq desc limit 1),
               'L2: enviada, com a Solicitação assinada pelo solicitante e na trilha');
select t.check((select fs.form = ptw.frozen_form(t.id('1'), t.id('e81')) from ptw.permit p join ptw.form_snapshot fs on fs.unit_id = p.unit_id and fs.sha256 = p.snapshot_sha256 where p.id = t.id('801')),
               'L3: o formulário congelado é o da versão com as listas copiadas');
update ptw.option_item set label = 'Boa (novo)' where id = t.id('5b1');
select t.check((select i -> 'options' -> 0 ->> 'label' = 'Boa' from ptw.form_items(ptw.permit_form(t.id('1'), t.id('801'))) f(i, s) where i ->> 'id' = 'epi')
           and (select i -> 'options' -> 0 ->> 'label' = 'Boa (novo)' from ptw.form_items(ptw.frozen_form(t.id('1'), t.id('e81'))) f(i, s) where i ->> 'id' = 'epi'),
               'L3: renomear o item da lista depois não muda a PT enviada');
select t.l('802', 'cc2', '-10 hours', '-2 hours');
select t.expect('PTW23', 'L2: enviar com a janela já encerrada é recusado (a Solicitação não assina)', $$select ptw.permit_submit(t.id('1'), t.id('802'))$$);
select t.as('d3');
select t.l('808', 'cc8');
select t.expect('PTW08', 'L2: solicitante sem o cargo da Solicitação não envia', $$select ptw.permit_submit(t.id('1'), t.id('808'))$$);
select t.check(t.st('808') = 'rascunho', 'L2: envio recusado deixa o rascunho como estava');
select t.as('d2');

-- L1: permit_sign avança o estado como stateAfterSign do app (tabela de casos de core/signing.ts).
select t.check(ptw.permit_next_label(t.id('1'), t.id('801')) = 'Marina · Emissão' and ptw.permit_mine(t.id('1'), t.id('801'), t.id('d1'))
               and ptw.permit_mine(t.id('1'), t.id('801'), t.id('d2')) and not ptw.permit_mine(t.id('1'), t.id('801'), t.id('d3')), 'L5: em análise espera quem pode emitir');
select t.check(t.after('801') = 'em_analise', 'L1 tabela: em análise com a Emissão pendente → não muda');
select t.expect('PTW07', 'L1: permit_sign na revisão errada', $$select t.psign('801', 'f86', 'd1', 2)$$);
select t.expect('PTW08', 'L1: permit_sign de quem não tem o cargo', $$select t.psign('801', 'f86', 'd3')$$);
select t.expect('PTW20', 'L1: permit_sign fora da etapa em curso', $$select t.psign('801', 'f87', 'd1')$$);
select t.expect('23503', 'L1: permit_sign em PT que não existe', $$select ptw.permit_sign(t.id('1'), t.id('8ff'), t.id('f86'), 1)$$);
select t.as('d1');
select t.check(ptw.permit_sign(t.id('1'), t.id('801'), t.id('f86'), 1, t.id('9a1')) = 'emitida' and t.st('801') = 'emitida', 'L1 tabela: em análise + Emissão concluída → emitida');
select t.check((select actor_id = t.id('d1') and text = 'Em análise → Emitida' from ptw.audit_event where action = 'pt.estado' and permit_id = t.id('801') order by seq desc limit 1), 'L1: a mudança de estado fica na trilha em nome de quem assinou');
select t.check(ptw.permit_sign(t.id('1'), t.id('801'), t.id('f86'), 1, t.id('9a1')) = 'emitida'
           and (select count(*) = 1 from ptw.signature where permit_id = t.id('801') and slot_id = t.id('f86')), 'L1: repetir permit_sign com o mesmo id não assina de novo');
select t.expect('23505', 'L1: o mesmo id em outra assinatura é recusado', $$select ptw.permit_sign(t.id('1'), t.id('801'), t.id('f87'), 1, t.id('9a1'))$$);
select t.check(t.after('801') = 'emitida', 'L1 tabela: emitida com o Aceite no campo pendente → não muda');
select t.check(t.psign('801', 'f87', 'd2') = 'ativa', 'L1 tabela: emitida + Aceite no campo → ativa');
select t.check((select released and state = 'ativa' from ptw.v_permit_board where id = t.id('801')), 'L1: a PT ativa pela assinatura tem o trabalho liberado');
select t.check(t.after('801') = 'ativa', 'L1 tabela: ativa com a Entrega pendente → não muda');
-- Parar e Retomar pelas funções.
select t.as('d3');
select t.expect('23514', 'L2: parar sem motivo', $$select ptw.permit_stop(t.id('1'), t.id('801'), '  ')$$);
select t.expect('23514', 'L2: parar com motivo longo demais', $$select ptw.permit_stop(t.id('1'), t.id('801'), repeat('x', 501))$$);
select t.check(ptw.permit_stop(t.id('1'), t.id('801'), ' Vazamento de óleo ') = 'suspensa', 'L2: permit_stop na PT ativa devolve suspensa');
select t.check((select state = 'suspensa' and hold_reason = 'Vazamento de óleo' and hold_by = t.id('d3') and hold_at is not null from ptw.permit where id = t.id('801')),
               'L2: permit_stop registra a parada em nome da sessão e suspende a PT ativa');
select t.check((select text = 'Ativa → Suspensa' and actor_id = t.id('d3') and data -> 'para' ->> 'hold_reason' = 'Vazamento de óleo'
                  from ptw.audit_event where permit_id = t.id('801') order by seq desc limit 1), 'L2: a parada fica na trilha com a mudança de estado');
select t.expect('PTW21', 'L2: parar a PT já parada', $$select ptw.permit_stop(t.id('1'), t.id('801'), 'De novo')$$);
select t.check(t.after('801') = 'suspensa', 'L1 tabela: suspensa sem Retomada e sem a Entrega → não muda');
select t.check(ptw.permit_next_label(t.id('1'), t.id('801')) = 'Marina · Retomada' and ptw.permit_mine(t.id('1'), t.id('801'), t.id('d1'))
               and not ptw.permit_mine(t.id('1'), t.id('801'), t.id('d3')), 'L5: PT parada espera quem pode emitir (Retomada)');
select t.expect('PTW26', 'L2: permit_resume por quem não pode emitir', $$select ptw.permit_resume(t.id('1'), t.id('801'), 'Contido')$$);
select t.as('d1');
select t.expect('23514', 'L2: retomar sem motivo', $$select ptw.permit_resume(t.id('1'), t.id('801'), '')$$);
select t.check(ptw.permit_resume(t.id('1'), t.id('801'), 'Vazamento contido') = 'suspensa', 'L2: permit_resume devolve o estado (a suspensa espera o novo aceite)');
select t.check((select hold_reason is null and hold_by is null and resumed_reason = 'Vazamento contido' and resumed_by = t.id('d1') and resumed_at is not null from ptw.permit where id = t.id('801'))
           and (select voided_reason = 'Retomada: novo Aceite no campo exigido' from ptw.signature where permit_id = t.id('801') and slot_id = t.id('f87')),
               'L2: permit_resume limpa a parada, registra a retomada em nome da sessão e anula o Aceite no campo');
select t.expect('PTW26', 'L2: retomar sem parada', $$select ptw.permit_resume(t.id('1'), t.id('801'), 'De novo')$$);
select t.check(t.after('801') = 'suspensa', 'L1 tabela: suspensa retomada com o Aceite no campo anulado → não muda');
select t.check(ptw.permit_next_label(t.id('1'), t.id('801')) = 'Marina · Aceite no campo', 'L5: depois da Retomada, espera o novo Aceite no campo');
select t.expect('PTW22', 'L1: quem retomou não faz o novo aceite por permit_sign', $$select t.psign('801', 'f87', 'd1')$$);
select t.check(t.psign('801', 'f87', 'd2') = 'ativa', 'L1 tabela: suspensa com Retomada + novo Aceite no campo → ativa');
select t.check((select state = 'ativa' and resumed_reason is null and resumed_by is null and resumed_at is null from ptw.permit where id = t.id('801')),
               'L1: o novo aceite consome a Retomada (resumed_* limpos)');
select t.check(t.psign('801', 'f88', 'd1') = 'entregue', 'L1 tabela: ativa + Entrega → entregue');
select t.check(t.after('801') = 'entregue', 'L1 tabela: entregue com o Aceite da área pendente → não muda');
select t.check(t.psign('801', 'f89', 'd2') = 'encerrada', 'L1 tabela: entregue + Aceite da área → encerrada');
select t.check(not exists (select 1 from ptw.v_equipment_hold where asset_id = t.id('cc1')), 'L1: encerrada pela assinatura, o equipamento solta');
select t.check(t.after('801') = 'encerrada' and t.after('103') = 'cancelada', 'L1 tabela: encerrada e cancelada não mudam');
select t.expect('PTW07', 'L1: permit_sign em PT encerrada', $$select t.psign('801', 'f89', 'd1')$$);
select t.check(ptw.permit_next_label(t.id('1'), t.id('801')) = '—' and not ptw.permit_mine(t.id('1'), t.id('801'), t.id('d2')), 'L5: PT encerrada não espera ninguém');
-- Expirada: só a Entrega, e daí entregue.
select t.as('d2');
select t.l('803', 'cc3');
select ptw.permit_submit(t.id('1'), t.id('803'));
select t.check(t.psign('803', 'f86', 'd1') = 'emitida' and t.psign('803', 'f87', 'd2') = 'ativa', 'L1: PT 803 até ativa por permit_sign');
reset role;
set session_replication_role = replica;
update ptw.permit set work_window = tstzrange(now() - interval '10 hours', now() - interval '1 minute') where id = t.id('803');
set session_replication_role = origin;
set role ptw_api_test;
select t.check(ptw.expire_due(t.id('1')) = 1 and t.st('803') = 'expirada' and t.after('803') = 'expirada', 'L1 tabela: expirada sem a Entrega → não muda');
select t.expect('PTW19', 'L1: expirada só aceita a Entrega', $$select t.psign('803', 'f89', 'd1')$$);
select t.check(t.psign('803', 'f88', 'd1') = 'entregue', 'L1 tabela: expirada + Entrega → entregue');
select t.check(t.psign('803', 'f89', 'd2') = 'encerrada', 'L1 tabela: a PT expirada termina encerrada');
-- Suspensa sem Retomada (serviço abandonado): só a Entrega, e daí entregue.
select t.as('d2');
select t.l('804', 'cc4');
select ptw.permit_submit(t.id('1'), t.id('804'));
select t.psign('804', 'f86', 'd1'), t.psign('804', 'f87', 'd2');
select t.as('d3');
select ptw.permit_stop(t.id('1'), t.id('804'), 'Fim do turno');
select t.expect('PTW19', 'L1: suspensa sem Retomada não aceita o Aceite no campo', $$select t.psign('804', 'f87', 'd1')$$);
select t.check(t.psign('804', 'f88', 'd1') = 'entregue', 'L1 tabela: suspensa sem Retomada + Entrega → entregue');
select t.expect('PTW21', 'L1: entregue com parada registrada espera a Retomada para o Aceite da área', $$select t.psign('804', 'f89', 'd2')$$);
select t.as('d1');
select t.check(ptw.permit_resume(t.id('1'), t.id('804'), 'Área conferida') = 'entregue', 'L2: retomar a PT entregue mantém o estado');
select t.check(t.psign('804', 'f89', 'd2') = 'encerrada', 'L1 tabela: depois da Retomada, Aceite da área → encerrada');
-- Etapa com duas assinaturas da mesma assinatura (min = 2), assinatura condicional e etapa que a versão não tem.
select t.as('d2');
select t.cycle(5, t.id('cc5'));
select t.check(t.psign('205', 'f25', 'd1') = 'em_analise', 'L1 tabela: Emissão com min = 2 e uma assinatura → não muda');
select t.check(not ptw.permit_mine(t.id('1'), t.id('205'), t.id('d1')) and ptw.permit_mine(t.id('1'), t.id('205'), t.id('d2')), 'L5: quem já assinou não tem mais a vez; a outra pessoa tem');
select t.check(t.psign('205', 'f25', 'd2') = 'emitida', 'L1 tabela: Emissão com min = 2 e duas assinaturas → emitida');
select t.check(t.after('205') = 'ativa', 'L1 tabela: etapa sem assinatura exigida conta como concluída (como no app)');
select t.as('d2');
select t.g7(4, t.id('cc6'), interval '-1 hour', interval '8 hours'), t.g7(5, t.id('cc7'), interval '-1 hour', interval '8 hours');
select t.ansp(t.id('334'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}'), t.ansp(t.id('335'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "nao"}}}');
select ptw.permit_submit(t.id('1'), t.id('334')), ptw.permit_submit(t.id('1'), t.id('335'));
select t.check(t.psign('334', 'f36', 'd1') = 'em_analise', 'L1 tabela: assinatura condicional exigida (linha "Sim") ainda pendente → não muda');
select t.check(t.psign('334', 'f37', 'd2') = 'emitida', 'L1 tabela: com a assinatura condicional → emitida');
select t.check(t.psign('335', 'f36', 'd1') = 'emitida', 'L1 tabela: assinatura condicional não exigida (linha "Não") não conta → emitida');
select t.check(t.st('106') = 'emitida' and t.after('106') = 'emitida', 'L1 tabela: versão sem a etapa Aceite no campo → emitida não avança');
-- Prazo do modelo em toda assinatura da Emissão (PTW31).
select t.as('d2');
insert into ptw.asset (unit_id, id, type_id, code, name) values (t.id('1'), t.id('ca6'), t.id('a2'), 'R-02', 'Painel R 2');
insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
values (t.id('1'), t.id('5c1'), t.id('e50'), t.id('e51'), t.id('d2'), t.id('b2'), tstzrange(now() - interval '1 hour', now() + interval '2 days'), 'R3 por permit_sign');
insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('5c1'), t.id('ca6'));
select t.ansp(t.id('5c1'), 'risco', '{"t": "marcacao", "ids": ["ok"]}'), t.ansp(t.id('5c1'), 'cond', '{"t": "marcacao", "ids": ["00000000-0000-7000-8000-0000000005b1"]}'),
       t.ansp(t.id('5c1'), 'chk', '{"t": "verificacao", "lines": {"l1": {"a": "00000000-0000-7000-8000-0000000005a1"}}}');
select ptw.permit_submit(t.id('1'), t.id('5c1'));
reset role;
set session_replication_role = replica;
update ptw.permit set work_window = tstzrange(lower(work_window), lower(work_window) + interval '4 days') where id = t.id('5c1');
set session_replication_role = origin;
set role ptw_api_test;
select t.expect('PTW31', 'L1: assinar a Emissão com a janela além do prazo do modelo', $$select t.psign('5c1', 'f54', 'd3')$$);
select t.check(not exists (select 1 from ptw.signature where permit_id = t.id('5c1') and slot_id = t.id('f54')) and t.st('5c1') = 'em_analise', 'L1: recusa no avanço desfaz também a assinatura');

-- Completude (PTW16): a etapa só é assinada com o obrigatório e visível das suas seções respondido.
select t.as('d2');
insert into ptw.template (unit_id, id, name) values (t.id('1'), t.id('e7a'), 'Completude');
insert into ptw.template_version (unit_id, id, template_id, number, form) values (t.id('1'), t.id('e7b'), t.id('e7a'), 1, $j${"sections": [
  {"id": "c0", "title": "Pedido", "stageId": "00000000-0000-7000-8000-000000000f7a", "items": [
    {"id": "tx", "kind": "texto", "label": "Descrição", "required": true, "long": false},
    {"id": "ph", "kind": "anexo", "label": "Foto do local", "required": true, "accept": ["foto"], "min": 1, "hint": ""},
    {"id": "cnd", "kind": "marcacao", "label": "Há vizinhança?", "required": false, "options": [{"id": "s", "label": "Sim"}, {"id": "n", "label": "Não"}], "multiple": false, "other": false},
    {"id": "why", "kind": "texto", "label": "Motivo", "required": true, "long": false, "showWhen": {"itemId": "cnd", "anyOf": ["s"]}},
    {"id": "opt", "kind": "texto", "label": "Observação", "required": false, "long": false},
    {"id": "ck", "kind": "verificacao", "label": "Checagens", "required": true, "answers": "sim_nao_na", "lines": [
      {"id": "l1", "label": "Área isolada", "blockOn": [], "noteOn": []}, {"id": "l2", "label": "EPI conferido", "blockOn": [], "noteOn": []}]}]}]}$j$::jsonb);
insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked) values (t.id('1'), t.id('f7a'), t.id('e7b'), 0, 'Solicitação', 'solicitacao', true);
insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values (t.id('1'), t.id('f7b'), t.id('e7b'), t.id('f7a'), 0, 'Solicita', array[t.id('a3')]);
select t.expect('', 'completude: ativar o modelo', $$select ptw.version_activate(t.id('1'), t.id('e7b'))$$);
insert into ptw.asset (unit_id, id, type_id, code, name) values (t.id('1'), t.id('ca7a'), t.id('a2'), 'CP-01', 'Painel completude');
insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
values (t.id('1'), t.id('5c7a'), t.id('e7a'), t.id('e7b'), t.id('d2'), t.id('b2'), tstzrange(now() - interval '1 hour', now() + interval '8 hours'), 'Completude');
insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('5c7a'), t.id('ca7a'));
select t.expect('PTW16', 'completude: texto obrigatório sem resposta barra a assinatura', $$select ptw.permit_submit(t.id('1'), t.id('5c7a'))$$);
select t.check(ptw.permit_missing(t.id('1'), t.id('5c7a'), t.id('f7a')::text) = 'Descrição', 'completude: diz o que falta (texto)');
select t.ansp(t.id('5c7a'), 'tx', '{"t": "texto", "v": "Trocar disjuntor"}');
select t.expect('PTW16', 'completude: anexo obrigatório sem arquivo barra a assinatura', $$select ptw.permit_submit(t.id('1'), t.id('5c7a'))$$);
select t.check(ptw.permit_missing(t.id('1'), t.id('5c7a'), t.id('f7a')::text) = 'Foto do local', 'completude: diz o que falta (anexo)');
insert into ptw.blob (unit_id, sha256, size, mime) values (t.id('1'), sha256('local'), 5, 'image/jpeg');
insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, captured_by)
values (t.id('1'), t.id('ab1'), t.id('5c7a'), 'ph', 'foto', sha256('local'), 'local.jpg', t.id('d2'));
select t.ansp(t.id('5c7a'), 'ph', '{"t": "anexo", "files": ["00000000-0000-7000-8000-000000000ab1"]}');
select t.ansp(t.id('5c7a'), 'ck', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}}}');
select t.expect('PTW16', 'completude: verificação com uma linha sem resposta barra a assinatura', $$select ptw.permit_submit(t.id('1'), t.id('5c7a'))$$);
select t.check(ptw.permit_missing(t.id('1'), t.id('5c7a'), t.id('f7a')::text) = 'Checagens: EPI conferido', 'completude: diz a linha que falta');
select t.ansp(t.id('5c7a'), 'ck', '{"t": "verificacao", "lines": {"l1": {"a": "sim"}, "l2": {"a": "na"}}}');
select t.ansp(t.id('5c7a'), 'cnd', '{"t": "marcacao", "ids": ["s"]}');
select t.expect('PTW16', 'completude: item condicional mostrado e obrigatório barra a assinatura', $$select ptw.permit_submit(t.id('1'), t.id('5c7a'))$$);
select t.ansp(t.id('5c7a'), 'cnd', '{"t": "marcacao", "ids": ["n"]}');
select t.check(ptw.permit_missing(t.id('1'), t.id('5c7a'), t.id('f7a')::text) is null, 'completude: condicional oculto e opcional vazio não faltam');
select t.expect('', 'completude: etapa completa assina (opcional e oculto sem resposta)', $$select ptw.permit_submit(t.id('1'), t.id('5c7a'))$$);

-- L2: Devolver e Descartar.
select t.as('d2');
select t.l('805', 'cc9');
select ptw.permit_submit(t.id('1'), t.id('805'));
select t.expect('PTW18', 'L2: o solicitante não devolve por permit_return', $$select ptw.permit_return(t.id('1'), t.id('805'), 'Falta a APR')$$);
select t.as('d3');
select t.expect('PTW29', 'L2: permit_return por quem não pode assinar a etapa pendente', $$select ptw.permit_return(t.id('1'), t.id('805'), 'Falta a APR')$$);
select t.as('d1');
select t.expect('23514', 'L2: devolver sem motivo', $$select ptw.permit_return(t.id('1'), t.id('805'), ' ')$$);
select t.check(ptw.permit_return(t.id('1'), t.id('805'), ' Falta a APR ') = 'devolvida', 'L2: permit_return devolve o estado');
select t.check((select state = 'devolvida' and state_note = 'Falta a APR' from ptw.permit where id = t.id('805'))
           and (select text = 'Em análise → Devolvida: Falta a APR' and actor_id = t.id('d1') from ptw.audit_event where permit_id = t.id('805') order by seq desc limit 1),
               'L2: permit_return devolve com o motivo, na trilha');
select t.expect('PTW05', 'L2: devolver PT que não está em análise', $$select ptw.permit_return(t.id('1'), t.id('805'), 'De novo')$$);
select t.check(t.after('805') = 'em_analise' and ptw.permit_next_label(t.id('1'), t.id('805')) = 'Rafael · Reenviar', 'L1 tabela: devolvida → em análise (o reenvio); espera o solicitante');
select t.as('d2');
select ptw.permit_submit(t.id('1'), t.id('805'));
select t.check((select revision = 2 and state = 'em_analise' from ptw.permit where id = t.id('805'))
           and (select count(*) = 1 from ptw.signature where permit_id = t.id('805') and slot_id = t.id('f85') and rev = 2 and voided_at is null)
           and (select count(*) = 1 from ptw.signature where permit_id = t.id('805') and slot_id = t.id('f85') and rev = 1 and voided_at is not null),
               'L2: reenviar abre a revisão 2, anula a Solicitação da revisão 1 e assina a da revisão 2');
select t.expect('PTW05', 'D3: só o rascunho se descarta', $$select ptw.permit_discard(t.id('1'), t.id('805'), 'Não vai mais')$$);
select t.expect('PTW25', 'L2: permit_stop em PT que não está em campo', $$select ptw.permit_stop(t.id('1'), t.id('805'), 'Chuva')$$);
select t.as('d1');
select t.expect('PTW17', 'D3: só o solicitante descarta o rascunho', $$select ptw.permit_discard(t.id('1'), t.id('802'), 'Não vai mais')$$);
select t.as('d2');
select t.expect('23514', 'D3: descartar sem motivo', $$select ptw.permit_discard(t.id('1'), t.id('802'), '')$$);
select t.expect('23514', 'D3: rascunho → cancelada direto, sem motivo, é recusado', $$update ptw.permit set state = 'cancelada' where id = t.id('802')$$);
select t.check(ptw.permit_discard(t.id('1'), t.id('802'), 'Aberta por engano') = 'cancelada', 'D3: permit_discard devolve o estado');
select t.check((select state = 'cancelada' and state_note = 'Aberta por engano' and number is null from ptw.permit where id = t.id('802'))
           and (select text = 'Rascunho → Cancelada: Aberta por engano' and actor_id = t.id('d2') from ptw.audit_event where permit_id = t.id('802') order by seq desc limit 1),
               'D3: o solicitante descarta o rascunho com o motivo, na trilha');
-- Parar a PT emitida: o estado fica, a parada barra o aceite.
select t.l('807', 'cc2');
select ptw.permit_submit(t.id('1'), t.id('807'));
select t.psign('807', 'f86', 'd1');
select t.as('d5');
select t.expect('PTW24', 'L2: permit_stop sem login ativo', $$select ptw.permit_stop(t.id('1'), t.id('807'), 'Chuva')$$);
select t.as('d2');
select t.check(ptw.permit_stop(t.id('1'), t.id('807'), 'Chuva') = 'emitida', 'L2: permit_stop na PT emitida devolve emitida');
select t.check((select state = 'emitida' and hold_by = t.id('d2') and hold_reason = 'Chuva' from ptw.permit where id = t.id('807')), 'L2: parar a PT emitida grava a parada e mantém o estado');
select t.check(t.after('807') = 'emitida', 'L1 tabela: emitida com parada → não muda');
select t.expect('PTW21', 'L1: parada barra o Aceite no campo por permit_sign', $$select t.psign('807', 'f87', 'd2')$$);
select t.as('d2');

-- L5: quem move a seguir, a vez da pessoa, a busca e a Minha área.
select t.check((select search = ptw.search_text(number, 'Lacuna 807') and row_version > 1 from ptw.v_permit_board where id = t.id('807')), 'L5: o Quadro traz o texto de busca e a versão da linha');
select t.check((select jsonb_object_agg(permit_id, jsonb_build_array(stage_id, label, mine)) from ptw.permit_next_rows(t.id('1'), array[t.id('807'), t.id('805'), t.id('801'), t.id('808'), t.id('802'), t.id('5c1'), t.id('8ff')], t.id('d2')))
             = jsonb_build_object(t.id('807'), jsonb_build_array(t.id('f82'), 'Marina · Retomada', true), t.id('805'), jsonb_build_array(t.id('f81'), 'Marina · Emissão', true),
                                  t.id('801'), jsonb_build_array(null, '—', false), t.id('808'), jsonb_build_array(null, 'Paulo · Enviar', false),
                                  t.id('802'), jsonb_build_array(null, '—', false), t.id('5c1'), jsonb_build_array(t.id('f51'), 'Paulo · Emissão', false)),
               'L5: permit_next_rows responde a página inteira de uma vez (parada, em análise, encerrada, rascunho de outro, cancelada, outro cargo)');
select t.check(ptw.permit_next(t.id('1'), t.id('807'), t.id('d3')) = jsonb_build_object('stageId', t.id('f82'), 'stageName', 'Aceite no campo', 'label', 'Marina · Retomada', 'mine', false)
           and ptw.permit_next(t.id('1'), t.id('801'), t.id('d2')) = '{"stageId": null, "stageName": null, "label": "—", "mine": false}'
           and ptw.permit_next(t.id('1'), t.id('8ff'), t.id('d2')) is null,
               'L5: permit_next devolve a etapa pendente, quem move e se é a vez da pessoa');
select t.check((select count(*) = 1 from ptw.v_permit_board where search like '%' || ptw.search_text('LACUNA 807') || '%')
           and (select count(*) = 1 from ptw.permit where search like '%' || lower((select number from ptw.permit where id = t.id('807'))) || '%'), 'L5: busca por trecho do escopo e pelo número, sem caixa');
select t.check(not exists (select 1 from ptw.slot_candidates(t.id('1'), 'cargo', array[t.id('a8')], null, current_date, (select path from ptw.location where id = t.id('b2'))))
           and (select array_agg(name order by ok desc, name) = array['Rafael Nunes', 'Bruno Alves', 'Joana (vencida)', 'Vigia sem login'] and array_agg(ok order by ok desc, name) = array[true, false, false, false]
                  from ptw.slot_candidates(t.id('1'), 'cargo', array[t.id('a3')], null, current_date, (select path from ptw.location where id = t.id('b3'))))
           and (select name = 'Vigia sem login' and not ok from ptw.slot_candidates(t.id('1'), 'pessoa', '{}', t.id('d9'), current_date, (select path from ptw.location where id = t.id('b2')))),
               'L5: quem a assinatura alcança: ninguém sem o cargo; o escopo do cargo conta; cargo vencido, cadastro inativo e sem login não são elegíveis');
select t.check(not exists (
    select 1 from ptw.person pe, ptw.location l, (values (array[t.id('a3')]), (array[t.id('a4')]), (array[t.id('a8'), t.id('a3')])) r(roles)
     where (select c.ok from ptw.slot_candidates(t.id('1'), 'cargo', r.roles, null, current_date, l.path) c where c.person_id = pe.id)
           is distinct from case when pe.status <> 'inativo' and exists (select 1 from ptw.person_role pr left join ptw.location sc on sc.id = pr.scope_location_id
                                        where pr.person_id = pe.id and pr.role_id = any (r.roles) and (pr.scope_location_id is null or sc.path @> l.path))
                                 then ptw.person_ok(t.id('1'), pe.id, r.roles, current_date, l.path, true) end),
               'L5: "ok" de slot_candidates é person_ok, para toda pessoa, cargo e local');
select t.check(not exists (
    select 1 from ptw.person pe, ptw.location l,
           (values (array[t.id('a3')]), (array[t.id('a4')]), (array[t.id('a8'), t.id('a3')]), ('{}'::uuid[]), (null::uuid[])) r(roles)
     where ptw.person_ok(t.id('1'), pe.id, r.roles, current_date, l.path, false) is distinct from (ptw.person_ineligible_any(t.id('1'), pe.id, r.roles, current_date, l.path) is null)
        or ptw.person_ok(t.id('1'), pe.id, r.roles, current_date, l.path, true) is distinct from (pe.login is not null and ptw.person_ineligible_any(t.id('1'), pe.id, r.roles, current_date, l.path) is null)),
               'L5: person_ok decide igual a person_ineligible_any, para toda pessoa, cargo e local');
select t.check((select count(*) > 20 from ptw.person pe, ptw.location l) and exists (select 1 from ptw.person pe where not ptw.person_ok(t.id('1'), pe.id, array[t.id('a3')], current_date, (select path from ptw.location where id = t.id('b2')), true))
           and exists (select 1 from ptw.person pe where ptw.person_ok(t.id('1'), pe.id, array[t.id('a3')], current_date, (select path from ptw.location where id = t.id('b2')), true)), 'L5: a comparação acima cobre elegíveis e não elegíveis');
select t.check((select array_agg(x order by x) from ptw.my_permits(t.id('1'), t.id('d3')) x)
             = (select array_agg(x order by x) from unnest(array[t.id('106'), t.id('5c0'), t.id('5c1'), t.id('808')]) x),
               'L5: Minha área de quem está na equipe, assinou, solicitou ou tem assinatura a dar na etapa em curso');
select t.check(t.id('807') in (select ptw.my_permits(t.id('1'), t.id('d1'))) and t.id('805') in (select ptw.my_permits(t.id('1'), t.id('d1')))
           and t.id('802') not in (select ptw.my_permits(t.id('1'), t.id('d1'))) and t.id('808') not in (select ptw.my_permits(t.id('1'), t.id('d1'))),
               'L5: Minha área traz a PT que a pessoa pode retomar ou assinar; não traz rascunho de outra pessoa');
select t.check(t.id('801') in (select ptw.my_permits(t.id('1'), t.id('d2'))) and t.id('801') not in (select ptw.my_permits(t.id('1'), t.id('d2'), 0))
           and t.id('807') in (select ptw.my_permits(t.id('1'), t.id('d2'), 0)), 'L5: finalizadas só dentro do prazo pedido; abertas sempre');
select t.check(not exists (select 1 from ptw.my_permits(t.id('1'), t.id('d5'))) and not exists (select 1 from ptw.my_permits(t.id('1'), t.id('d6'))), 'L5: quem não tem cargo nem PT não tem Minha área');

-- D5: cada abertura de PT é um evento (sem janela de agrupamento).
select t.n() as n0 \gset
select ptw.audit_access('acesso.pt.aberta', t.id('807')), ptw.audit_access('acesso.pt.aberta', t.id('807'));
select t.check(t.n() = :n0 + 2, 'D5: duas aberturas seguidas da mesma PT geram dois eventos de acesso');

-- L7: sessão da API.
select t.expect('', 'L7: a API inclui a sessão', $$insert into ptw.api_session (unit_id, id, token_sha256, person_id, auth, client, created_at, expires_at)
  values (t.id('1'), t.id('5e1'), sha256('cookie-1'), t.id('d2'), 'sessao', 'tablet-07', now() - interval '1 year', now() + interval '8 hours')$$);
select t.check((select created_at > now() - interval '1 minute' and seen_at = created_at and ended_at is null from ptw.api_session where id = t.id('5e1')), 'L7: a hora da sessão é a do servidor');
select t.expect('23505', 'L7: o mesmo cookie não abre duas sessões', $$insert into ptw.api_session (unit_id, token_sha256, person_id, auth, expires_at) values (t.id('1'), sha256('cookie-1'), t.id('d1'), 'sessao', now() + interval '8 hours')$$);
select t.expect('23514', 'L7: sessão que já nasce vencida', $$insert into ptw.api_session (unit_id, token_sha256, person_id, auth, expires_at) values (t.id('1'), sha256('cookie-2'), t.id('d1'), 'sessao', now() - interval '1 hour')$$);
select t.expect('23503', 'L7: sessão de pessoa que não é da unidade', $$insert into ptw.api_session (unit_id, token_sha256, person_id, auth, expires_at) values (t.id('1'), sha256('cookie-3'), t.id('fff'), 'sessao', now() + interval '8 hours')$$);
select t.expect('42501', 'L7: a API não troca a pessoa da sessão', $$update ptw.api_session set person_id = t.id('d1') where id = t.id('5e1')$$);
select t.expect('42501', 'L7: a API não apaga sessão', $$delete from ptw.api_session$$);
select t.expect('', 'L7: a API marca atividade', $$update ptw.api_session set seen_at = now() where id = t.id('5e1')$$);
select t.expect('42501', 'F2: a API não estende o prazo absoluto', $$update ptw.api_session set expires_at=now()+interval '9 hours' where id=t.id('5e1')$$);
select t.expect('42501', 'F2: a API não promove sessão', $$update ptw.api_session set grants=array['cadastro'] where id=t.id('5e1')$$);
select t.expect('23514', 'F2: permissão desconhecida recusada', $$insert into ptw.api_session(unit_id,token_sha256,person_id,auth,expires_at,grants) values(t.id('1'),sha256('grant'),t.id('d1'),'ldap',now()+interval '1 hour',array['root'])$$);
select t.expect('42501', 'F2: a API não apaga bloqueio', $$delete from ptw.login_attempt$$);
select t.expect('PTW14', 'F2: chave inválida recusada', $$select ptw.login_reserve('senha')$$);
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: tentativa 1');
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: tentativa 2');
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: tentativa 3');
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: tentativa 4');
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: tentativa 5');
select t.check(ptw.login_reserve('login:'||repeat('a',64))>0,'F2: sexta tentativa bloqueada');
select ptw.login_succeeded('login:'||repeat('a',64));
select t.check(ptw.login_reserve('login:'||repeat('a',64))=0,'F2: sucesso libera login');
select t.expect('PTW14','F2: sucesso não zera origem',$$select ptw.login_succeeded('ip:'||repeat('a',64))$$);
select t.expect('PTW01', 'L7: a última atividade não volta', $$update ptw.api_session set seen_at = now() - interval '1 day' where id = t.id('5e1')$$);
update ptw.api_session set ended_at = now() - interval '1 day' where id = t.id('5e1');
select t.check((select ended_at > now() - interval '1 minute' from ptw.api_session where id = t.id('5e1')), 'L7: a API encerra a sessão, na hora do servidor');
select t.expect('PTW01', 'L7: sessão encerrada não volta', $$update ptw.api_session set ended_at = null where id = t.id('5e1')$$);
reset role;
select t.expect('PTW01', 'L7: nem o dono troca a identidade da sessão', $$update ptw.api_session set token_sha256 = sha256('outro') where id = t.id('5e1')$$);
set role ptw_api_test;

-- L7: idempotência.
select t.expect('PTW14', 'L7: chave reservada sem resposta é recusada no commit', $$select * from ptw.idempotency_begin(t.id('1d1'), 'signPermit', encode(sha256('a'), 'hex')); set constraints all immediate$$);
select t.expect('PTW14', 'L7: idempotência sem o SHA-256 do pedido', $$select * from ptw.idempotency_begin(t.id('1d1'), 'signPermit', 'xyz')$$);
begin;
select t.check((select situacao = 'nova' and status is null and response is null from ptw.idempotency_begin(t.id('1d1'), 'signPermit', encode(sha256('a'), 'hex'))), 'L7: chave nova é reservada');
select ptw.idempotency_finish(t.id('1d1'), 200, '{"body": "{\"state\": \"emitida\"}", "etag": "\"3\""}');
commit;
select t.check((select situacao = 'repetida' and status = 200 and response ->> 'etag' = '"3"' and created_at is not null from ptw.idempotency_begin(t.id('1d1'), 'signPermit', encode(sha256('a'), 'hex'))), 'L7: a mesma chave com o mesmo pedido devolve a resposta guardada');
select t.check((select situacao = 'diferente' and response is null from ptw.idempotency_begin(t.id('1d1'), 'signPermit', encode(sha256('b'), 'hex'))), 'L7: a mesma chave com outro pedido é "diferente"');
select t.check((select situacao = 'diferente' from ptw.idempotency_begin(t.id('1d1'), 'stopPermit', encode(sha256('a'), 'hex'))), 'L7: a mesma chave em outra operação é "diferente"');
select t.expect('PTW01', 'L7: a resposta guardada não muda', $$select ptw.idempotency_finish(t.id('1d1'), 500, '{}')$$);
select t.expect('PTW14', 'L7: resposta para chave que não foi reservada', $$select ptw.idempotency_finish(t.id('1d9'), 200, '{}')$$);
begin;
select * from ptw.idempotency_begin(t.id('1d2'), 'signPermit', encode(sha256('a'), 'hex'));
rollback;
select t.check(not exists (select 1 from ptw.api_idempotency where key = t.id('1d2')), 'L7: escrita desfeita solta a chave (a nova tentativa executa de novo)');
select t.as('d1');
begin;
select t.check((select situacao = 'nova' from ptw.idempotency_begin(t.id('1d1'), 'signPermit', encode(sha256('a'), 'hex'))), 'L7: a chave vale por pessoa');
select ptw.idempotency_finish(t.id('1d1'), 204, null);
commit;
select t.check((select status = 204 and response = 'null'::jsonb from ptw.api_idempotency where key = t.id('1d1') and person_id = t.id('d1')), 'L7: resposta sem corpo é guardada como null');
select t.as('d2');
select t.expect('42501', 'L7: a API não troca a operação da chave', $$update ptw.api_idempotency set operation = 'x' where key = t.id('1d1')$$);
select t.expect('42501', 'L7: a API não apaga chave de idempotência', $$delete from ptw.api_idempotency$$);
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000002', false);
select t.check((select count(*) = 0 from ptw.api_session) and (select count(*) = 0 from ptw.api_idempotency), 'L7: outra unidade não vê sessões nem chaves');
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000001', false);

-- L9: o manifesto da exportação fica guardado, conferido contra o SHA-256.
select t.expect('PTW14', 'L9: manifesto que não confere com o SHA-256 é recusado', $$select ptw.audit_export_record(t.id('1'), 1, 5, encode(sha256('jsonl'), 'hex'), encode(sha256('outro'), 'hex'), 'Fiscalização', '{"formato": "ptw-auditoria/2"}')$$);
select t.expect('', 'L9: exportação registrada com o manifesto', $$select ptw.audit_export_record(t.id('1'), 1, 5, encode(sha256('jsonl'), 'hex'),
  encode(sha256(convert_to(E'{"formato": "ptw-auditoria/2", "motivo": "Fiscalização: \\"NR-33\\" ✓"}\n', 'UTF8')), 'hex'), 'Fiscalização',
  E'{"formato": "ptw-auditoria/2", "motivo": "Fiscalização: \\"NR-33\\" ✓"}\n', t.id('9e1'))$$);
select t.check((select manifest = E'{"formato": "ptw-auditoria/2", "motivo": "Fiscalização: \\"NR-33\\" ✓"}\n' and sha256(convert_to(manifest, 'UTF8')) = manifest_sha256
                       and actor_id = t.id('d2') and first_seq = 1 and last_seq = 5 from ptw.audit_export where id = t.id('9e1'))
           and (select data ->> 'exportacao' = t.id('9e1')::text and reason is null and data ->> 'motivo' = 'Fiscalização' from t.ev('acesso.exportacao')),
               'L9: a API lê de volta os bytes exatos do manifesto, pelo id que escolheu; o acesso fica na trilha');
select t.expect('42501', 'L9: a API não grava exportação direto', $$insert into ptw.audit_export (unit_id, first_seq, last_seq, file_sha256, manifest_sha256, reason) values (t.id('1'), 1, 2, sha256('a'), sha256('b'), 'x')$$);
reset role;
select t.expect('23514', 'L9: nem o dono guarda manifesto diferente do SHA-256', $$insert into ptw.audit_export (unit_id, first_seq, last_seq, file_sha256, manifest_sha256, reason, manifest) values (t.id('1'), 1, 2, sha256('a'), sha256('b'), 'x', 'c')$$);
select t.expect('PTW01', 'L9: o manifesto guardado não muda', $$update ptw.audit_export set manifest = null where id = t.id('9e1')$$);
set role ptw_api_test;

-- A API continua sem apagar PT, anexo e trilha (assinatura: acima).
-- A assinatura é de quem está na sessão: o papel da API não assina em nome de outra pessoa.
select t.l('806', 'cc1');
select ptw.permit_submit(t.id('1'), t.id('806'));
select t.n() as n0 \gset
select t.expect('42501', 'a API não assina em nome de outra pessoa (sessão d2, assinatura de d1)', $$insert into ptw.signature (unit_id, permit_id, rev, slot_id, person_id) values (t.id('1'), t.id('806'), 1, t.id('f86'), t.id('d1'))$$);
select set_config('ptw.person_id', '', false);
select t.expect('42501', 'sem pessoa na sessão, a API não inclui assinatura', $$insert into ptw.signature (unit_id, permit_id, rev, slot_id, person_id) values (t.id('1'), t.id('806'), 1, t.id('f86'), t.id('d1'))$$);
select t.as('d2');
select t.check(t.n() = :n0 and not exists (select 1 from ptw.signature where permit_id = t.id('806') and slot_id = t.id('f86')), 'assinatura em nome de outra pessoa não grava nada');
select t.as('d1');
select t.check(ptw.permit_sign(t.id('1'), t.id('806'), t.id('f86'), 1) = 'emitida', 'a pessoa da sessão assina por permit_sign');
select t.check((select person_id = t.id('d1') from ptw.signature where permit_id = t.id('806') and slot_id = t.id('f86')), 'a assinatura fica em nome da pessoa da sessão');
select t.as('d2');
select t.expect('42501', 'API não apaga PT', $$delete from ptw.permit where id = t.id('802')$$);
select t.expect('42501', 'API não apaga anexo', $$delete from ptw.attachment where id = t.id('aa8')$$);
select t.expect('42501', 'API não apaga evento da trilha', $$delete from ptw.audit_event$$);

-- Isolamento por unidade
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000002', false);
select t.check((select count(*) = 0 from ptw.permit), 'outra unidade não vê PTs');
select t.expect('42501', 'outra unidade não grava na unidade 1', $$insert into ptw.option_list (unit_id, name) values ('00000000-0000-7000-8000-000000000001', 'x')$$);
select set_config('ptw.unit_id', '', false);
select t.check((select count(*) = 0 from ptw.asset), 'sem unidade na sessão, nada aparece');
select t.check(ptw.unit_by_code('UN-01') = t.id('1') and ptw.unit_by_code('UN-02') = t.id('2') and ptw.unit_by_code('UN-99') is null
               and ptw.unit_by_code('un-01') is null and ptw.unit_by_code(null) is null,
               'sem unidade na sessão, a API acha o id da unidade pelo código exato (PTW_UNIT)');
select t.check((select count(*) = 0 from ptw.unit), 'unit_by_code não abre a tabela de unidades: sem contexto, nenhuma linha');
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000001', false);

reset role;
select t.expect('PTW12', 'evento com hora retroativa', $$insert into ptw.audit_event (unit_id, at, action, ok, text, prev_hash, hash) values (ptw.current_unit(), now() - interval '1 day', 'x', true, 'x', '\x00', '\x00')$$);

-- Sistema: sem unidade na sessão, grava em todas. DDL e GRANT ficam na trilha.
select set_config('ptw.unit_id', '', false);
select t.check(ptw.audit_system('sistema.relogio.desvio', 'Relógio 4 s adiantado', '{"desvio_ms": 4000}') = 2, 'evento do sistema em todas as unidades');
select set_config('ptw.unit_id', :U, false);
select t.check((select count(*) = 1 and bool_and(files ->> '00_base.sql' ~ '^[0-9a-f]{64}$') from ptw.schema_info), 'esquema registrado uma vez, com o SHA-256 de cada arquivo');
select t.expect('PTW01', 'esquema não se registra de novo', $$select ptw.schema_record(jsonb_build_object('00_base.sql', repeat('ab', 32)))$$);
select t.expect('PTW01', 'registro do esquema não muda', $$update ptw.schema_info set files = '{}'$$);
comment on table ptw.asset is 'Ativos da planta';
grant select on ptw.asset to ptw_app;
select t.check(exists (select 1 from ptw.audit_event where action = 'sistema.ddl' and data ->> 'comando' = 'COMMENT')
           and exists (select 1 from ptw.audit_event where action = 'sistema.ddl' and data ->> 'comando' = 'GRANT'), 'DDL e GRANT registrados');
update ptw.unit set name = 'Unidade 1 · Planta Sul' where id = :U;
select t.check((select text = 'Unidade alterada: UN-01 (nome)' from t.ev('cadastro.unidade.alterada')), 'unidade alterada');

-- Retenção: a trilha não sai por DDL antes do prazo; só por audit_archive, depois de exportar.
select to_char(now(), '"audit_event_"YYYYMM') as part \gset
select t.expect('PTW13', 'desanexar partição atual é recusado', format('alter table ptw.audit_event detach partition ptw.%I', :'part'));
select t.expect('PTW13', 'apagar partição atual é recusado', format('drop table ptw.%I', :'part'));
select t.expect('PTW01', 'truncar partição é recusado', format('truncate ptw.%I', :'part'));
select t.expect('PTW13', 'desligar gatilho de auditoria é recusado', $$alter table ptw.asset disable trigger audit_row$$);
select t.expect('PTW13', 'apagar gatilho de auditoria é recusado', $$drop trigger audit_row on ptw.permit$$);
select t.expect('PTW13', 'apagar a âncora é recusado', $$drop table ptw.audit_anchor$$);
select t.expect('PTW13', 'arquivar antes do prazo é recusado', format('select ptw.audit_archive(%L, %L)', 'ptw.' || :'part', 'teste'));
select ptw.audit_partitions('2015-01-01', 1);
select t.expect('', 'partição vencida e vazia sai por audit_archive', $$select ptw.audit_archive('ptw.audit_event_201501', 'Fim da retenção')$$);
select t.check(to_regclass('ptw.audit_event_201501') is null
           and exists (select 1 from ptw.audit_event where action = 'sistema.particao.arquivada' and data ->> 'particao' = 'audit_event_201501')
           and exists (select 1 from ptw.audit_event where action = 'sistema.particao.criada' and data ->> 'particao' = 'audit_event_201501'), 'arquivamento e criação registrados');
select ptw.audit_maintenance();
select t.check(to_regclass(format('ptw.audit_event_%s', to_char(now() + interval '3 months', 'YYYYMM'))) is not null, 'manutenção cria as partições futuras');
select t.check((select min(years) >= 5 from ptw.retention_class) and ptw.audit_retention_years() >= 5, 'retenção mínima de 5 anos');
select t.expect('23514', 'retenção abaixo de 5 anos é recusada', $$update ptw.retention_class set years = 2 where code = 'pt'$$);

-- Hora e seq andam juntos: a ordem do seq é a ordem da hora (as partições guardam faixas contínuas).
select t.check(not exists (select 1 from (select at, lag(at) over (partition by unit_id order by seq) as before
                                            from ptw.audit_event) x where at < before), 'hora do evento nunca volta em relação ao seq');
select max(seq) + 1 as nseq from ptw.audit_event where unit_id = :U \gset
select t.expect('PTW12', 'evento com hora anterior à do evento anterior é recusado', format($$
  select set_config(ptw.audit_tip_var(%L), %s || ':' || repeat('00', 32) || ':' || (extract(epoch from now() + interval '1 hour') * 1000000)::bigint, true);
  insert into ptw.audit_event (unit_id, action, ok, text, prev_hash, hash) values (%L, 'x', true, 'x', '\x00', '\x00')$$, :U, :nseq - 1, :U));
-- Uma partição antiga com um seq fora da faixa (como ficava quando a hora era a do início da
-- transação): o arquivamento recusa em vez de deixar a verificação acusar adulteração falsa.
select t.expect('PTW13', 'arquivar partição cujos seq não são uma faixa contínua é recusado', $$
  select ptw.audit_partitions('2016-01-01', 1);
  alter event trigger audit_ddl_end disable;
  alter table ptw.audit_event disable trigger audit_chain;
  insert into ptw.audit_event (unit_id, seq, at, action, ok, text, prev_hash, hash)
  values (t.id('1'), 1000000, '2016-01-15', 'x', true, 'x', '\x00', '\x00');
  alter table ptw.audit_event enable always trigger audit_chain;
  alter event trigger audit_ddl_end enable always;
  insert into ptw.audit_export (unit_id, first_seq, last_seq, file_sha256, manifest_sha256, reason)
  values (t.id('1'), 1, 1000000, sha256('a'), sha256('b'), 'teste');
  select ptw.audit_archive('ptw.audit_event_201601', 'Fim da retenção')$$);

-- Forma canônica.
select t.check(jsonb_build_object('bb', 1, 'a', 2, 'é', 3, 'c', jsonb_build_object('z', null, 'y', 1.50, 'x', '1e2'::jsonb, 'w', '-0.0'::jsonb),
                                 'l', '[]'::jsonb, 'o', '{}'::jsonb, 's', E'a"\\\n\u0001')::text
             = '{"a": 2, "c": {"w": 0.0, "x": 100, "y": 1.50, "z": null}, "l": [], "o": {}, "s": "a\"\\\n\u0001", "bb": 1, "é": 3}',
               'JSON canônico: ordem por tamanho e bytes, separadores, números e escapes');
-- Evento com acentos, nulos, números e escapes: o verificador em Python precisa chegar ao mesmo hash.
begin;
select set_config('ptw.person_id', '', true);
select ptw.audit_log('conta.teste', true, E'Teste: "aspas", \\barra, nova\nlinha, tab\t, acentuação çãéõ, emoji 🦺',
  $j${"ação": "Liberação", "z": null, "A": [1, 1.50, 100, -0.0, 12345678901234567890.123456789, true, false, null, {}, []],
      "texto": "aspas \" barra \\ nova\nlinha\ttab \u0001 ✓ 🦺  ", "é": {"ñ": "çãõ", "N": -3.25e-3}}$j$::jsonb);
commit;

select t.check((select count(*) = 0 from ptw.audit_event e
                 where ptw.audit_canon(e.unit_id, e.seq, e.at, e.actor_id, e.role_id, e.auth, e.client, e.request_id, e.reason,
                         e.action, e.ok, e.permit_id, e.rev, e.asset_id, e.entity, e.entity_id, e.text, e.data)
                    <> jsonb_build_object('action', e.action, 'actor', e.actor_id, 'asset', e.asset_id,
                         'at', (extract(epoch from e.at) * 1000000)::bigint, 'auth', e.auth, 'client', e.client, 'data', e.data,
                         'entity', e.entity, 'entity_id', e.entity_id, 'ok', e.ok, 'permit', e.permit_id, 'reason', e.reason,
                         'request', e.request_id, 'rev', e.rev, 'role', e.role_id, 'seq', e.seq, 'text', e.text,
                         'unit', e.unit_id, 'v', 2)::text), 'envelope concatenado = objeto canônico, em todos os eventos');

-- ---------- F1-00b: permit.changed_at, tipo do sistema, códigos PTW ----------
-- changed_at avança a cada mudança da PT e de cada filho; mudança só de filho não soma row_version e
-- não gera "pt.alterada" (controle, fora do diff da trilha).
reset role;
insert into ptw.asset (unit_id, id, type_id, code, name) values
  (t.id('1'), t.id('ce1'), t.id('a2'), 'CH-01', 'Painel do changed_at'), (t.id('1'), t.id('ce2'), t.id('a2'), 'CH-02', 'Painel do changed_at 2');
create table t.mark (n text primary key, at timestamptz, rv integer, ev bigint);
grant select, insert, update on t.mark to ptw_app;
create function t.mark(n text) returns void language sql as $$
  insert into t.mark select n, changed_at, row_version, t.n() from ptw.permit where id = t.id(n)
  on conflict (n) do update set at = excluded.at, rv = excluded.rv, ev = excluded.ev $$;
-- Mexida desde a marca; quiet: sem nova row_version.
create function t.moved(n text, quiet boolean default true) returns boolean language sql stable as $$
  select p.changed_at > m.at and (not quiet or p.row_version = m.rv)
    from ptw.permit p join t.mark m on m.n = n where p.id = t.id(n) $$;
grant execute on all functions in schema t to ptw_app;
set role ptw_api_test;
select t.as('d2');
select t.l('8c0', 'ce1');
select t.check((select changed_at = created_at from ptw.permit where id = t.id('8c0')), 'changed_at: nasce com a PT');
select t.mark('8c0');
insert into ptw.permit_asset (unit_id, permit_id, asset_id) values (t.id('1'), t.id('8c0'), t.id('ce2'));
select t.check(t.moved('8c0'), 'changed_at: avança ao incluir ativo, sem nova row_version');
select t.mark('8c0');
delete from ptw.permit_asset where permit_id = t.id('8c0') and asset_id = t.id('ce2');
select t.check(t.moved('8c0'), 'changed_at: avança ao remover ativo');
select t.mark('8c0');
insert into ptw.permit_team (unit_id, permit_id, role_id, person_id) values (t.id('1'), t.id('8c0'), t.id('a3'), t.id('d1'));
select t.check(t.moved('8c0'), 'changed_at: avança ao mudar a equipe');
select t.mark('8c0');
select ptw.permit_answer_put(t.id('1'), t.id('8c0'), 'chk2', '{"t": "verificacao", "lines": {"la": {"a": "sim"}}}');
select t.check(t.moved('8c0') and t.n() = (select ev + 1 from t.mark where n = '8c0'), 'changed_at: avança com a resposta; a trilha ganha só o evento da resposta');
select t.mark('8c0');
insert into ptw.attachment (unit_id, permit_id, item_id, kind, sha256, file_name, captured_by)
values (t.id('1'), t.id('8c0'), 'chk2', 'foto', sha256('foto do bloqueio'), 'ch.jpg', t.id('d2'));
select t.check(t.moved('8c0'), 'changed_at: avança com o anexo');
select t.mark('8c0');
update ptw.permit set scope = 'Lacuna 8c0 (escopo novo)' where id = t.id('8c0');
select t.check(t.moved('8c0', false), 'changed_at: avança quando a própria PT muda');
select t.mark('8c0');
select ptw.permit_submit(t.id('1'), t.id('8c0'));
select t.check(t.moved('8c0', false), 'changed_at: avança no envio (estado e assinatura da Solicitação)');
select t.mark('8c0');
select t.sig(t.id('8c0'), 1, t.id('f86'), t.id('d1'));
select t.check(t.moved('8c0'), 'changed_at: avança com a assinatura');
select t.mark('8c0');
update ptw.signature set voided_at = now(), voided_reason = 'Teste de changed_at' where permit_id = t.id('8c0') and slot_id = t.id('f86');
select t.check(t.moved('8c0'), 'changed_at: avança com a anulação da assinatura');
select t.mark('8c0');
select t.as('d1');
select ptw.permit_return(t.id('1'), t.id('8c0'), 'Faltou o extintor');
select t.as('d2');
select ptw.permit_submit(t.id('1'), t.id('8c0'));
select t.check(t.moved('8c0', false) and (select revision = 2 from ptw.permit where id = t.id('8c0')), 'changed_at: avança na devolução e no reenvio (revisão)');
select t.mark('8c0');
insert into ptw.permit_revision (unit_id, permit_id, rev, reason, sha256) values (t.id('1'), t.id('8c0'), 9, 'Teste de changed_at', sha256('rev'));
select t.check(t.moved('8c0'), 'changed_at: avança com a linha de revisão');
select t.check(t.psign('8c0', 'f86', 'd1', 2) = 'emitida', 'changed_at: PT 8c0 emitida');
select t.mark('8c0');
select ptw.permit_extend(t.id('1'), t.id('8c0'), (select upper(work_window) + interval '1 hour' from ptw.permit where id = t.id('8c0')), 'Teste de changed_at');
select t.check(t.moved('8c0', false), 'changed_at: avança com a prorrogação');
select t.check((select b.changed_at = p.changed_at from ptw.v_permit_board b join ptw.permit p on p.id = b.id where b.id = t.id('8c0')), 'changed_at: exposto no Quadro (v_permit_board)');
select t.check((select count(*) = 1 from ptw.audit_event where permit_id = t.id('8c0') and action = 'pt.alterada')
               and not exists (select 1 from ptw.audit_event where permit_id = t.id('8c0') and (data -> 'de' ? 'changed_at' or data -> 'para' ? 'changed_at')),
               'changed_at: fora da trilha (só a mudança de escopo é pt.alterada)');
select t.check(t.id('8c0') in (select ptw.my_permits(t.id('1'), t.id('d2'))), 'changed_at: a PT segue em my_permits');

-- O tipo do sistema não sai e a chave não muda, nem pela API nem pelo dono (23514).
select t.expect('23514', 'tipo do sistema: não é removido', $$delete from ptw.type_def where id = t.id('a5')$$);
select t.expect('23514', 'tipo do sistema: a chave não é apagada', $$update ptw.type_def set system_key = null where id = t.id('a5')$$);
select t.expect('23514', 'tipo do sistema: a chave não é trocada', $$update ptw.type_def set system_key = 'outra' where id = t.id('a5')$$);
select t.expect('23514', 'tipo do sistema: outro tipo não ganha chave depois', $$update ptw.type_def set system_key = 'alimenta' where id = t.id('a6')$$);
select t.expect('', 'tipo do sistema: o rótulo muda', $$update ptw.type_def set label = 'É parte de' where id = t.id('a5')$$);
reset role;
select t.expect('23514', 'tipo do sistema: nem o dono remove', $$delete from ptw.type_def where id = t.id('a5')$$);
select t.check((select system_key = 'parte_de' from ptw.type_def where id = t.id('a5')), 'tipo do sistema: continua com a chave');

-- Os códigos PTW que o esquema levanta são exatamente os da tabela do README (PTW01–PTW34).
-- Código novo: entra no esquema, no README, em db/MODELO.md e aqui (e db/tests/ptw_codes.sh confere o README).
select t.check((select array_agg(distinct c order by c) from (
                  select (regexp_matches(p.prosrc, 'errcode\s*=\s*''(PTW\d\d)''', 'g'))[1] as c
                    from pg_proc p where p.pronamespace = 'ptw'::regnamespace) x)
               = (select array_agg('PTW' || lpad(g::text, 2, '0') order by g) from generate_series(1, 34) g),
               'códigos PTW do esquema = tabela do README (PTW01–PTW34)');

-- Âncora, adulteração de um byte e reescrita completa.
select t.check(ptw.audit_verify(:U) is null, 'cadeia íntegra');
select t.check(not exists (select 1 from ptw.audit_check(:U)), 'verificação completa sem problema');
select seq as aseq, encode(hash, 'hex') as ahash from ptw.audit_event where unit_id = :U order by seq desc limit 1 \gset
select t.expect('PTW14', 'âncora que não confere é recusada', format('select ptw.audit_anchor_record(%L, %s, %L, current_date, %L, %L)', :U, :aseq, repeat('00', 32), '0123456789abcdef', repeat('ab', 32)));
select ptw.audit_anchor_record(:U, :aseq, :'ahash', current_date, '0123456789abcdef', repeat('ab', 32), 'teste');
select t.check((select (data ->> 'seq')::bigint = :aseq from t.ev('sistema.ancora.gravada')), 'âncora gravada e registrada');
create temp table bak as select * from ptw.audit_event where unit_id = :U;
create temp table bakhead as select * from ptw.audit_head where unit_id = :U;
-- Só um superusuário que desliga as proteções consegue alterar a trilha (simula acesso ao arquivo).
alter event trigger audit_ddl_end disable;
alter table ptw.audit_event disable trigger audit_frozen;
update ptw.audit_event set text = 'Rascunho criadO' where unit_id = :U and seq = 3;
select t.check(ptw.audit_verify(:U) = 3, 'adulteração apontada no seq 3');
select t.check((select problema = 'cadeia' and seq = 3 from ptw.audit_check(:U) limit 1), 'verificação aponta a cadeia no seq 3');
-- Reescrita completa: recalcula todos os hashes; a cadeia fica coerente, mas a âncora não.
do $$
declare e record; prev bytea := '\x0000000000000000000000000000000000000000000000000000000000000000'; h bytea;
begin
  for e in select * from ptw.audit_event where unit_id = t.id('1') order by seq loop
    h := ptw.audit_hash(prev, ptw.audit_canon(e.unit_id, e.seq, e.at, e.actor_id, e.role_id, e.auth, e.client, e.request_id,
           e.reason, e.action, e.ok, e.permit_id, e.rev, e.asset_id, e.entity, e.entity_id, e.text, e.data));
    update ptw.audit_event set prev_hash = prev, hash = h where unit_id = e.unit_id and seq = e.seq;
    prev := h;
  end loop;
  update ptw.audit_head set last_hash = prev where unit_id = t.id('1');
end $$;
select t.check(ptw.audit_verify(:U) is null, 'reescrita completa passa na cadeia');
select t.check((select problema = 'ancora' from ptw.audit_check(:U) limit 1), 'reescrita completa detectada pela âncora');
update ptw.audit_event e set text = b.text, prev_hash = b.prev_hash, hash = b.hash from bak b where e.unit_id = b.unit_id and e.seq = b.seq;
update ptw.audit_head h set last_hash = b.last_hash from bakhead b where h.unit_id = b.unit_id;
alter table ptw.audit_event enable always trigger audit_frozen;
alter event trigger audit_ddl_end enable always;
select t.check(ptw.audit_verify(:U) is null and not exists (select 1 from ptw.audit_check(:U)), 'trilha restaurada');

-- Run by invariants.sql on a disposable database; a separate unit keeps fixtures independent.
reset role;
insert into ptw.unit(id,code,name) values(t.id('ee01'),'UN-EL','Ensaios NR-10');
select set_config('ptw.unit_id',t.id('ee01')::text,false);
select set_config('ptw.person_id','',false);
insert into ptw.type_def(unit_id,id,family,label) values
(t.id('ee01'),t.id('ee11'),'local','Sala'),(t.id('ee01'),t.id('ee12'),'ativo','Painel'),(t.id('ee01'),t.id('ee13'),'cargo','Autorizado');
insert into ptw.location(unit_id,id,type_id,code,name) values(t.id('ee01'),t.id('ee21'),t.id('ee11'),'EL','Sala de ensaio');
insert into ptw.asset(unit_id,id,type_id,code,name) values(t.id('ee01'),t.id('ee41'),t.id('ee12'),'EL-01','Painel de ensaio');
insert into ptw.person(unit_id,id,name,login) values
(t.id('ee01'),t.id('ee31'),'Solicitante','el.tech'),(t.id('ee01'),t.id('ee32'),'Emitente','el.issuer'),(t.id('ee01'),t.id('ee33'),'Líder','el.leader');
insert into ptw.person_role(unit_id,person_id,role_id,valid_until)
select t.id('ee01'),t.id(x),t.id('ee13'),current_date+365 from unnest(array['ee31','ee32','ee33']) x;
insert into ptw.template(unit_id,id,name) values(t.id('ee01'),t.id('ee100'),'Teste NR-10');
create function t.el_form() returns jsonb language sql immutable return $json${"electrical": {"standard": "preparacao2027", "procedure": "proc", "riskAssessment": "apr", "authorizations": "auth", "workKind": "kind", "isolation": ["iso1", "iso2"], "restoration": ["ret1", "ret2"], "shift": {"startDate": "sd", "startTime": "st", "endDate": "ed", "endTime": "et"}}, "sections": [{"id": "request", "title": "Planejamento", "stageId": "00000000-0000-7000-8000-0000000ee110", "items": [{"id": "proc", "label": "proc", "kind": "documento", "required": true, "attach": true, "validity": true}, {"id": "apr", "label": "apr", "kind": "documento", "required": true, "attach": true, "validity": true}, {"id": "auth", "label": "auth", "kind": "documento", "required": true, "attach": true, "validity": true}, {"id": "kind", "kind": "marcacao", "label": "Classificação", "required": true, "multiple": false, "other": false, "options": [{"id": "rotineiro", "label": "Rotineiro"}, {"id": "nao_rotineiro", "label": "Não rotineiro"}]}, {"id": "sd", "label": "sd", "required": true, "kind": "data", "notBeforeToday": false}, {"id": "ed", "label": "ed", "required": true, "kind": "data", "notBeforeToday": false}, {"id": "st", "label": "st", "required": true, "kind": "horario", "seconds": false}, {"id": "et", "label": "et", "required": true, "kind": "horario", "seconds": false}]}, {"id": "prep", "title": "Preparação", "stageId": "00000000-0000-7000-8000-0000000ee111", "items": [{"id": "iso1", "label": "iso1", "kind": "verificacao", "required": true, "answers": "sim_nao", "lines": [{"id": "ok", "label": "iso1", "blockOn": ["nao"], "noteOn": []}]}, {"id": "iso2", "label": "iso2", "kind": "verificacao", "required": true, "answers": "sim_nao", "lines": [{"id": "ok", "label": "iso2", "blockOn": ["nao"], "noteOn": []}]}]}, {"id": "return", "title": "Reenergização", "stageId": "00000000-0000-7000-8000-0000000ee115", "items": [{"id": "ret1", "label": "ret1", "kind": "verificacao", "required": true, "answers": "sim_nao", "lines": [{"id": "ok", "label": "ret1", "blockOn": ["nao"], "noteOn": []}]}, {"id": "ret2", "label": "ret2", "kind": "verificacao", "required": true, "answers": "sim_nao", "lines": [{"id": "ok", "label": "ret2", "blockOn": ["nao"], "noteOn": []}]}]}]}$json$::jsonb;
insert into ptw.template_version(unit_id,id,template_id,number,form,max_window)
values(t.id('ee01'),t.id('ee101'),t.id('ee100'),1,t.el_form(),interval '8 hours');
insert into ptw.stage(unit_id,id,version_id,position,name,kind,locked)
select t.id('ee01'),t.id('ee11'||n),t.id('ee101'),n,label,kind::ptw.stage_kind,kind is not null from (values
(0,'Solicitação','solicitacao'),(1,'Preparação',null),(2,'Emissão','emissao'),(3,'Aceite no campo','aceite_campo'),(4,'Entrega','entrega'),(5,'Aceite da área','aceite_area')) s(n,label,kind);
insert into ptw.sign_slot(unit_id,id,version_id,stage_id,position,meaning,role_ids)
select t.id('ee01'),t.id('ee21'||n),t.id('ee101'),t.id('ee11'||n),0,'Assina '||n,array[t.id('ee13')] from generate_series(0,5) n;
insert into ptw.separation(unit_id,version_id,slot_a,slot_b,locked) values(t.id('ee01'),t.id('ee101'),t.id('ee212'),t.id('ee213'),true);
select ptw.version_activate(t.id('ee01'),t.id('ee101'));
select t.check(ptw.electrical_policy_problem(t.el_form()) is null,'NR10: política válida');
select t.check(ptw.electrical_policy_problem(jsonb_set(t.el_form(),'{electrical,isolation}','[]')) is not null,'NR10: sequência vazia recusada');
select t.check(ptw.electrical_policy_problem(t.el_form() #- '{electrical,shift}') is not null,'NR10: turno obrigatório no modelo 2027');
select t.check(ptw.electrical_policy_problem(jsonb_set(t.el_form(),'{electrical,standard}','"vigente2019"') #- '{electrical,shift}') is null,'NR10: base vigente sem obrigação nova de turno');
set role ptw_api_test;
select set_config('ptw.person_id',t.id('ee31')::text,false);
insert into ptw.permit(unit_id,id,template_id,version_id,author_id,location_id,work_window,scope)
values(t.id('ee01'),t.id('ee301'),t.id('ee100'),t.id('ee101'),t.id('ee31'),t.id('ee21'),tstzrange(now()-interval '30 min',now()+interval '1 hour','[)'),'Intervenção elétrica');
insert into ptw.permit_asset(unit_id,permit_id,asset_id) values(t.id('ee01'),t.id('ee301'),t.id('ee41'));
insert into ptw.permit_team(unit_id,permit_id,person_id,role_id) select t.id('ee01'),t.id('ee301'),t.id(x),t.id('ee13') from unnest(array['ee31','ee32','ee33']) x;
select t.expect('PTW34','NR10: envio sem turno recusado',$$select ptw.permit_submit(t.id('ee01'),t.id('ee301'))$$);
insert into ptw.permit_answer(unit_id,permit_id,item_id,value,answered_by)
select t.id('ee01'),t.id('ee301'),id,jsonb_build_object('t',kind,'v',v),t.id('ee31') from (values
('sd','data',to_char((now()-interval '1 hour') at time zone 'America/Sao_Paulo','YYYY-MM-DD')),
('st','horario',to_char((now()-interval '1 hour') at time zone 'America/Sao_Paulo','HH24:MI')),
('ed','data',to_char((now()+interval '2 hour') at time zone 'America/Sao_Paulo','YYYY-MM-DD')),
('et','horario',to_char((now()+interval '2 hour') at time zone 'America/Sao_Paulo','HH24:MI'))) a(id,kind,v);
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'kind','{"t":"marcacao","ids":["nao_rotineiro"]}');
select t.expect('PTW16','NR10: documentos ausentes impedem envio',$$select ptw.permit_submit(t.id('ee01'),t.id('ee301'))$$);
insert into ptw.blob(unit_id,sha256,size,mime) values(t.id('ee01'),decode(repeat('ab',32),'hex'),1,'application/pdf');
insert into ptw.attachment(unit_id,id,permit_id,item_id,kind,sha256,file_name,captured_by)
select t.id('ee01'),t.id('ee5'||n),t.id('ee301'),i,'arquivo',decode(repeat('ab',32),'hex'),'FICTICIO.pdf',t.id('ee31') from (values(0,'proc'),(1,'apr'),(2,'auth')) a(n,i);
insert into ptw.permit_answer(unit_id,permit_id,item_id,value,answered_by)
select t.id('ee01'),t.id('ee301'),i,jsonb_build_object('t','documento','code',i||'-REV02','files',jsonb_build_array(t.id('ee5'||n)),'validUntil',(current_date+365)::text),t.id('ee31') from (values(0,'proc'),(1,'apr'),(2,'auth')) a(n,i);
delete from ptw.permit_team where unit_id=t.id('ee01') and permit_id=t.id('ee301');
select t.expect('PTW34','NR10: equipe vazia impede envio',$$select ptw.permit_submit(t.id('ee01'),t.id('ee301'))$$);
insert into ptw.permit_team(unit_id,permit_id,person_id,role_id) select t.id('ee01'),t.id('ee301'),t.id(x),t.id('ee13') from unnest(array['ee31','ee32','ee33']) x;
update ptw.person_role set valid_until=(now() at time zone 'America/Sao_Paulo')::date-1 where unit_id=t.id('ee01') and person_id=t.id('ee33');
select t.expect('PTW34','NR10: autorização vencida de integrante impede envio',$$select ptw.permit_submit(t.id('ee01'),t.id('ee301'))$$);
update ptw.person_role set valid_until=current_date+365 where unit_id=t.id('ee01') and person_id=t.id('ee33');
select ptw.permit_submit(t.id('ee01'),t.id('ee301'));
select t.expect('PTW34','NR10: não pula isolamento',$$select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'iso2','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}')$$);
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'iso1','{"t":"verificacao","lines":{"ok":{"a":"nao"}}}');
select t.expect('PTW34','NR10: passo negativo bloqueia o próximo',$$select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'iso2','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}')$$);
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'iso1','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}');
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'iso2','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}');
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee211'),1);
select set_config('ptw.person_id',t.id('ee32')::text,false);
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee212'),1);
select set_config('ptw.person_id',t.id('ee33')::text,false);
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee213'),1);
select t.check((select ptw.work_released(p) from ptw.permit p where id=t.id('ee301')),'NR10: trabalho ativo dentro do turno');
select set_config('ptw.person_id',t.id('ee32')::text,false);
select t.expect('PTW34','NR10: prorrogação além do turno recusada',$$select ptw.permit_extend(t.id('ee01'),t.id('ee301'),now()+interval '3 hour','Mais tempo')$$);
select t.expect('PTW31','NR10: revalidar não reinicia prazo máximo',$$select ptw.permit_revalidate(t.id('ee01'),t.id('ee301'),now()-interval '1 hour',now()+interval '10 hour',now()+interval '9 hour','Reavaliação',true,true,true)$$);
select t.expect('PTW34','NR10: mudança de equipe exige nova PT',$$select ptw.permit_revalidate(t.id('ee01'),t.id('ee301'),now()-interval '1 hour',now()+interval '4 hour',now()+interval '3 hour','Reavaliação',true,false,true)$$);
select set_config('ptw.person_id',t.id('ee31')::text,false);
select t.expect('PTW34','NR10: outro autorizador recusado',$$select ptw.permit_revalidate(t.id('ee01'),t.id('ee301'),now()-interval '1 hour',now()+interval '4 hour',now()+interval '3 hour','Reavaliação',true,true,true)$$);
reset role;
set session_replication_role=replica;
update ptw.permit set work_window=tstzrange(now()-interval '2 hour',now()-interval '1 hour','[)') where id=t.id('ee301');
set session_replication_role=origin;
set role ptw_api_test;
select ptw.expire_due(t.id('ee01'));
select t.check((select state='expirada' and not ptw.work_released(p) from ptw.permit p where id=t.id('ee301')),'NR10: fim da validade interrompe liberação');
select set_config('ptw.person_id',t.id('ee32')::text,false);
select ptw.permit_revalidate(t.id('ee01'),t.id('ee301'),now()-interval '1 hour',now()+interval '4 hour',now()+interval '3 hour','Reavaliação no local',true,true,true);
select t.check((select state='suspensa' and not ptw.work_released(p) from ptw.permit p where id=t.id('ee301')),'NR10: revalidação aguarda novo aceite');
select t.check((select count(*)=1 and bool_and(voided_at is not null) from ptw.signature where permit_id=t.id('ee301') and slot_id=t.id('ee213')),'NR10: aceite anterior anulado');
select t.check((select count(*)=1 and bool_and(person_id=t.id('ee32') and octet_length(team_sha256)=32) from ptw.permit_revalidation where permit_id=t.id('ee301')),'NR10: autoria e equipe da revalidação preservadas');
select t.check((select count(*)=1 from ptw.audit_event where unit_id=t.id('ee01') and action='pt.revalidada'),'NR10: revalidação na trilha');
select t.expect('42501','NR10: API não apaga revalidação',$$delete from ptw.permit_revalidation where permit_id=t.id('ee301')$$);
select t.expect('PTW22','NR10: autorizador não faz o novo aceite',$$select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee213'),1)$$);
select set_config('ptw.person_id',t.id('ee33')::text,false);
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee213'),1);
select t.check((select state='ativa' and ptw.work_released(p) from ptw.permit p where id=t.id('ee301')),'NR10: novo aceite libera no turno revalidado');
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee214'),1);
select set_config('ptw.person_id',t.id('ee32')::text,false);
select t.expect('PTW16','NR10: entrega não autoriza encerramento sem reenergização',$$select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee215'),1)$$);
select t.expect('PTW34','NR10: não pula a sequência de reenergização',$$select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'ret2','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}')$$);
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'ret1','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}');
select ptw.permit_answer_put(t.id('ee01'),t.id('ee301'),'ret2','{"t":"verificacao","lines":{"ok":{"a":"sim"}}}');
select ptw.permit_sign(t.id('ee01'),t.id('ee301'),t.id('ee215'),1);
select t.check((select state='encerrada' from ptw.permit where id=t.id('ee301')),'NR10: ciclo encerrado');
select t.expect('PTW34','NR10: PT encerrada não revalida',$$select ptw.permit_revalidate(t.id('ee01'),t.id('ee301'),now()-interval '1 hour',now()+interval '4 hour',now()+interval '3 hour','Reavaliação',true,true,true)$$);
reset role;
select t.check(ptw.audit_verify(t.id('ee01')) is null,'NR10: cadeia íntegra');
select set_config('ptw.unit_id',t.id('1')::text,false);
select set_config('ptw.person_id',t.id('d2')::text,false);


-- Identity overrides: actor, unit isolation, immutable assets and chained audit.
set role ptw_api_test;
select set_config('ptw.unit_id',t.id('1')::text,false);
select set_config('ptw.person_id','',false);
select t.expect('42501','Identidade: publicação anônima recusada',$$insert into ptw.appearance(unit_id,brand,revision,updated_by) values(t.id('1'),null,1,t.id('d2'))$$);
select set_config('ptw.person_id',t.id('d2')::text,false);
insert into ptw.appearance(unit_id,brand,revision,updated_by) values(t.id('1'),null,99,t.id('d1'));
select t.check((select revision=1 and updated_by=t.id('d2') from ptw.appearance),'Identidade: revisão e autoria vêm do banco');
select t.expect('23503','Identidade: referência sem imagem recusada',$$update ptw.appearance set brand=jsonb_build_object('name','Planta','mark','PT','colors','{}'::jsonb,'logo',repeat('a',64)||'.png') where unit_id=t.id('1')$$);
select set_config('ptw.unit_id',t.id('2')::text,false);
select t.check((select count(*)=0 from ptw.appearance),'Identidade: outra unidade não lê a configuração');
select t.expect('42501','Identidade: outra unidade não publica',$$insert into ptw.appearance(unit_id,brand,revision,updated_by) values(t.id('1'),null,1,t.id('d2'))$$);
select set_config('ptw.unit_id',t.id('1')::text,false);
select t.expect('42501','Identidade: API não apaga configuração',$$delete from ptw.appearance$$);
select t.expect('42501','Identidade: API não apaga imagens',$$delete from ptw.appearance_asset$$);
update ptw.appearance set brand=null;
select t.check((select revision=2 from ptw.appearance),'Identidade: restauração incrementa revisão');
select t.check((select count(*)=2 from ptw.audit_event where action='identidade.restaurada'),'Identidade: restaurações auditadas');
reset role;
select t.check(ptw.audit_verify(t.id('1')) is null,'Identidade: cadeia íntegra');

-- Groups do not change technical roles or privileges.
set role ptw_api_test;
select set_config('ptw.unit_id',t.id('1')::text,false);
select set_config('ptw.person_id','',false);
select t.expect('42501','Grupos: autoria obrigatória',$$insert into ptw.person_group(unit_id,id,name) values(t.id('1'),t.id('aa90'),'Manutenção')$$);
select set_config('ptw.person_id',t.id('d2')::text,false);
insert into ptw.person_group(unit_id,id,name) values(t.id('1'),t.id('aa90'),'Manutenção');
insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('aa90'),t.id('d2'));
select t.expect('23505','Grupos: membro único',$$insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('aa90'),t.id('d2'))$$);
select t.expect('23503','Grupos: membro de outra unidade recusado',$$insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('aa90'),t.id('ee31'))$$);
select set_config('ptw.unit_id',t.id('2')::text,false);
select t.check((select count(*)=0 from ptw.person_group),'Grupos: isolamento de grupos');
select t.check((select count(*)=0 from ptw.person_group_member),'Grupos: isolamento de membros');
select set_config('ptw.unit_id',t.id('1')::text,false);
select t.expect('42501','Grupos: remoção de grupo não concedida',$$delete from ptw.person_group$$);
update ptw.person_group set active=false where id=t.id('aa90');
select t.check((select revision=2 from ptw.person_group where id=t.id('aa90')),'Grupos: desativação revisionada');
select t.check((select count(*)=1 from ptw.person_group_member where group_id=t.id('aa90')),'Grupos: desativação preserva membros');
select t.check((select count(*)=1 from ptw.audit_event where action='cadastro.grupo.membro.incluido'),'Grupos: membro auditado');
reset role;
select t.check(ptw.audit_verify(t.id('1')) is null,'Grupos: cadeia íntegra');

\ir delegations.sql
\set QUIET off
select 'OK: ' || count(*) || ' verificações' as resultado from t.ok;
