-- Volume: 20 mil ativos, 100 mil PTs (10 mil abertas), 300 mil eventos de auditoria encadeados.
-- Rode depois de invariants.sql, num banco criado de db/schema. Carga direta como dono (sem
-- gatilhos) e medições como a API.
\timing off
\set QUIET on
set search_path = ptw, public;
select set_config('ptw.unit_id', '00000000-0000-7000-8000-000000000001', false);
select set_config('ptw.person_id', '00000000-0000-7000-8000-0000000000d2', false);   -- solicitante das PTs de teste
\set U '''00000000-0000-7000-8000-000000000001'''
set session_replication_role = replica;
insert into asset (unit_id, id, type_id, code, name)
select :U, uuidv7(), '00000000-0000-7000-8000-0000000000a2', 'B-' || g, 'Ativo de carga ' || g from generate_series(1, 20000) g;
insert into asset_part select unit_id, id, id, 1 from asset where code like 'B-%';
create temp table ba as select id, row_number() over (order by code) n from asset where code like 'B-%';
insert into permit (unit_id, id, number, template_id, version_id, state, author_id, location_id, work_window, scope, snapshot_sha256, snapshot_at)
select :U, uuidv7(), 'PT-B-' || g,
  '00000000-0000-7000-8000-0000000000e1', '00000000-0000-7000-8000-0000000000e2',
  (case when g <= 10000 then 'ativa' else 'encerrada' end)::permit_state,
  '00000000-0000-7000-8000-0000000000d2', '00000000-0000-7000-8000-0000000000b2',
  tstzrange(now() - (g || ' hours')::interval, now() - (g || ' hours')::interval + interval '8 hours'),
  'Serviço de carga ' || g, (select sha256 from form_snapshot limit 1), now()
from generate_series(1, 100000) g;
create temp table bp as select id, row_number() over (order by holds desc, number) n, holds from permit where number like 'PT-B-%';
insert into permit_asset select :U, bp.id, ba.id, bp.holds from bp join ba on ba.n = ((bp.n - 1) % 20000) + 1;
insert into permit_team select :U, id, '00000000-0000-7000-8000-0000000000a4', 'cargo',
  case when n % 50 = 0 then '00000000-0000-7000-8000-0000000000d1'::uuid else '00000000-0000-7000-8000-0000000000d3'::uuid end from bp;
set session_replication_role = origin;
analyze;

-- INSERT direto (o gatilho da cadeia, sem audit_emit), em 10 lotes de 30 mil. Em VM o relógio
-- às vezes recua alguns milissegundos entre duas linhas e a cadeia recusa (PTW12, como deve):
-- o lote é refeito. Pela API isso não acontece (audit_emit acompanha a hora da cadeia).
\echo 'Inserindo 300 mil eventos pela cadeia de hash (gatilho real)...'
\timing on
do $$
declare b integer := 0; refeitos integer := 0;
begin
  while b < 10 loop
    begin
      insert into ptw.audit_event (unit_id, action, ok, permit_id, rev, text)
      select '00000000-0000-7000-8000-000000000001', 'pt.carga', true, bp.id, 1, 'Evento de carga'
        from bp, generate_series(1, 3) where bp.n > b * 10000 and bp.n <= (b + 1) * 10000;
      b := b + 1;
    exception when sqlstate 'PTW12' then
      refeitos := refeitos + 1;
    end;
  end loop;
  raise notice 'lotes refeitos pelo relógio: %', refeitos;
end $$;
\timing off
analyze;

set role ptw_api_test;
\echo '--- Quadro: abertas, por início da janela (50 primeiras)'
explain (analyze, costs off, timing on, summary on)
select * from v_permit_board where state = 'ativa' order by window_start desc limit 50;
\echo '--- Minha área: PTs abertas onde a pessoa está na equipe'
explain (analyze, costs off, summary on)
select p.id from permit p join permit_team t on t.unit_id = p.unit_id and t.permit_id = p.id
 where t.person_id = '00000000-0000-7000-8000-0000000000d1' and p.holds;
\echo '--- Quadro: uma página adiante (50 a partir da 200ª) com quem move a seguir e a vez da pessoa (ptw.permit_next_rows nos 50 ids)'
explain (analyze, costs off, timing on, summary on)
with page as materialized (select * from v_permit_board where state = 'ativa' order by window_start desc limit 50 offset 200)
select page.*, n.stage_id, n.label, n.mine
  from page left join ptw.permit_next_rows(ptw.current_unit(), (select array_agg(id) from page), ptw.current_person()) n on n.permit_id = page.id;
\echo '--- Quadro: busca por trecho do escopo (trigram em permit.search), 50 primeiras, com quem move a seguir'
explain (analyze, costs off, summary on)
with page as materialized (select * from v_permit_board where search like '%carga 1234%' order by window_start desc limit 50)
select page.id, page.number, n.label, n.mine
  from page left join ptw.permit_next_rows(ptw.current_unit(), (select array_agg(id) from page), ptw.current_person()) n on n.permit_id = page.id;
\echo '--- Minha área: ptw.my_permits de quem tem assinatura a dar nas 10 mil abertas (pior caso), sem as finalizadas'
explain (analyze, costs off, summary on)
select count(*) from ptw.my_permits('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-0000000000d1', 0);
\echo '--- Minha área: ptw.my_permits de quem não tem cargo em nenhuma assinatura (só equipe), sem as finalizadas'
explain (analyze, costs off, summary on)
select count(*) from ptw.my_permits('00000000-0000-7000-8000-000000000001', '00000000-0000-7000-8000-0000000000d6', 0);
\echo '--- Detalhe: ptw.permit_next de uma PT'
explain (analyze, costs off, summary on)
select ptw.permit_next('00000000-0000-7000-8000-000000000001', (select id from permit where number = 'PT-B-777'), '00000000-0000-7000-8000-0000000000d1');
\echo '--- Histórico de uma PT (sem as leituras acesso.*)'
explain (analyze, costs off, summary on)
select * from v_permit_history where permit_id = (select id from permit where number = 'PT-B-777') order by seq;
\echo '--- Tela de auditoria: negados do último dia'
explain (analyze, costs off, summary on)
select seq, at, action, text from v_audit where not ok and at > now() - interval '1 day' order by at desc limit 50;
\echo '--- Busca de ativo por trecho'
explain (analyze, costs off, summary on)
select code from asset where search like '%carga 1234%' limit 20;
\echo '--- Trava: enviar uma PT com 10 mil abertas'
reset role;
select t.draft(90, (select a.id from ptw.asset a where a.code like 'B-%' and not exists (select 1 from ptw.permit_asset h where h.asset_id = a.id and h.holds) limit 1));
set role ptw_api_test;
\timing on
select ptw.permit_submit(ptw.current_unit(), '00000000-0000-7000-8000-000000000190');
\timing off
\echo '--- 1000 aberturas de PT (acesso.pt.aberta) registradas pela API'
select id as bpid from ptw.permit where number = 'PT-B-777' \gset
\timing on
select ptw.audit_access('acesso.pt.aberta', :'bpid') from generate_series(1, 1000) \g /dev/null
\timing off
reset role;
\echo '--- Alterar 10 mil ativos numa transação (evento com diff por linha)'
\timing on
update ptw.asset set name = name || ' (rev)' where code like 'B-1%';
\timing off
\echo '--- Recalcular o hash de todos os eventos (verificação completa)'
\timing on
select count(*) as eventos, count(*) filter (where ptw.audit_event_hash(e) <> hash) as com_problema from ptw.audit_event e where unit_id = :U;
\timing off
select pg_size_pretty(pg_database_size(current_database())) as tamanho_do_banco;
