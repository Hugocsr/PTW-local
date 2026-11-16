#!/bin/sh
# Corrida na trava de equipamento: duas transações ao mesmo tempo, uma na gaveta (filha) e outra
# no painel (pai). A segunda precisa esperar a primeira e ser recusada (PTW10), nunca passar junto.
# Corrida na trilha: a transação que começou antes e grava depois fica depois no seq E na hora.
# Uso: tests/concurrency.sh <contêiner>   (depois de invariants.sql)
set -e
C=${1:-ptwdb-test}
U=00000000-0000-7000-8000-000000000001
q() { docker exec -i -e PGPASSWORD="${PGPASSWORD:-}" "$C" psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -At "$@"; }
# Quem envia é o solicitante das PTs de teste (t.draft): Rafael (d2).
SET="select set_config('ptw.unit_id','$U',false); select set_config('ptw.person_id','00000000-0000-7000-8000-0000000000d2',false);"

q >/dev/null <<SQL
$SET
insert into ptw.asset (unit_id, id, type_id, code, name) values
 ('$U','00000000-0000-7000-8000-0000000002a1','00000000-0000-7000-8000-0000000000a2','PN-X','Painel X'),
 ('$U','00000000-0000-7000-8000-0000000002a2','00000000-0000-7000-8000-0000000000a2','PN-X.G1','Gaveta G1');
insert into ptw.asset_relation (unit_id, from_id, to_id, kind_id) values
 ('$U','00000000-0000-7000-8000-0000000002a2','00000000-0000-7000-8000-0000000002a1','00000000-0000-7000-8000-0000000000a5');
select t.draft(21,'00000000-0000-7000-8000-0000000002a2'), t.draft(22,'00000000-0000-7000-8000-0000000002a1');
SQL

# A: envia a gaveta e segura a transação por 3 s.
( q <<SQL
$SET
begin;
select 'A enviou ' || ptw.permit_submit('$U','00000000-0000-7000-8000-000000000121');
select pg_sleep(3);
commit;
SQL
) > /tmp/a.out 2>&1 &
sleep 1
# B: tenta o painel pai enquanto A ainda não confirmou.
START=$(date +%s)
q > /tmp/b.out 2>&1 <<SQL || true
$SET
select ptw.permit_submit('$U','00000000-0000-7000-8000-000000000122');
SQL
WAITED=$(( $(date +%s) - START ))
wait
cat /tmp/a.out; cat /tmp/b.out
HOLDERS=$(q -c "$SET select count(*) from ptw.permit where id in ('00000000-0000-7000-8000-000000000121','00000000-0000-7000-8000-000000000122') and holds" | tail -1)
echo "B esperou ${WAITED}s; PTs abertas no painel X: $HOLDERS"
grep -q "já tem a" /tmp/b.out && [ "$HOLDERS" = "1" ] && [ "$WAITED" -ge 1 ] && echo "OK: corrida serializada" || { echo "FALHOU"; exit 1; }

# A abre a transação (now() fica no início), B grava e confirma no meio, A grava no fim. Com a hora
# do início da transação, A teria seq maior e hora menor que B: numa virada de mês, as partições
# deixariam de guardar faixas contínuas de seq.
( q <<SQL
begin;
select now();
select pg_sleep(2);
select ptw.audit_system('sistema.teste.executado', 'corrida A', '{}', '$U');
commit;
SQL
) > /tmp/c.out 2>&1 &
sleep 1
q >/dev/null <<SQL
select ptw.audit_system('sistema.teste.executado', 'corrida B', '{}', '$U');
SQL
wait
ORDEM=$(q -c "select (a.seq > b.seq and a.at > b.at)::text from ptw.audit_event a, ptw.audit_event b
               where a.unit_id = '$U' and b.unit_id = '$U' and a.text = 'corrida A' and b.text = 'corrida B'" | tail -1)
[ "$ORDEM" = "true" ] && echo "OK: trilha sob corrida: seq e hora na mesma ordem" || { cat /tmp/c.out; echo "FALHOU: seq e hora fora de ordem ($ORDEM)"; exit 1; }

# Assinaturas ao mesmo tempo (ptw.permit_sign) e a chave de idempotência.
#  1. Duas pessoas assinam a mesma assinatura que fecha a etapa (min = 1): a segunda espera a primeira,
#     vê a etapa já concluída e é recusada (PTW20); o estado avança uma vez só.
#  2. Duas pessoas completam juntas uma assinatura com min = 2: as duas entram e o estado avança uma vez.
#  3. A mesma Idempotency-Key em duas requisições ao mesmo tempo: a segunda espera e repete a resposta.
#  4. Dois toques em linhas diferentes da mesma verificação: as duas linhas ficam.
AS() { echo "select set_config('ptw.unit_id','$U',false); select set_config('ptw.person_id','00000000-0000-7000-8000-0000000000$1',false);"; }
P1=00000000-0000-7000-8000-000000000336; P2=00000000-0000-7000-8000-000000000206; P3=00000000-0000-7000-8000-000000000809
KEY=00000000-0000-7000-8000-0000000001d7; HASH=$(printf 'corrida' | sha256sum | cut -d' ' -f1)
q >/dev/null <<SQL
$(AS d2)
insert into ptw.asset (unit_id, id, type_id, code, name) values
 ('$U','00000000-0000-7000-8000-0000000002a3','00000000-0000-7000-8000-0000000000a2','PN-Y','Painel Y'),
 ('$U','00000000-0000-7000-8000-0000000002a4','00000000-0000-7000-8000-0000000000a2','PN-Z','Painel Z'),
 ('$U','00000000-0000-7000-8000-0000000002a5','00000000-0000-7000-8000-0000000000a2','PN-W','Painel W');
select t.g7(6, '00000000-0000-7000-8000-0000000002a3', interval '-1 hour', interval '8 hours');
select ptw.permit_submit('$U', '$P1');
select t.cycle(6, '00000000-0000-7000-8000-0000000002a4');
select t.l('809', '2a5');
-- Enviada: as respostas abaixo são de d1, e o rascunho só o solicitante (d2) altera (PTW17).
select ptw.permit_submit('$U', '$P3');
SQL
# A primeira requisição de cada par, numa transação só (uma trava por vez, sempre na mesma ordem: a PT,
# depois a ponta da trilha), que fica aberta por 3 s.
( q <<SQL
$(AS d1)
begin;
select 'A assinou: ' || ptw.permit_sign('$U', '$P1', t.id('f36'), 1) || ' e ' || ptw.permit_sign('$U', '$P2', t.id('f25'), 1);
select 'A reservou: ' || situacao from ptw.idempotency_begin('$KEY', 'putPermitAnswer', '$HASH');
select ptw.permit_answer_put('$U', '$P3', 'chk2', '{"t": "verificacao", "lines": {"la": {"a": "sim"}}}');
select pg_sleep(3);
select ptw.idempotency_finish('$KEY', 200, '{"body": "A"}');
commit;
SQL
) > /tmp/d.out 2>&1 &
# Espera a primeira estar parada com tudo gravado (e não confirmado) antes de soltar as segundas.
i=0
until [ "$(q -c "select count(*) from pg_stat_activity where state = 'active' and query like 'select pg_sleep(3)%'" | tail -1)" = "1" ]; do
  i=$((i + 1)); [ "$i" -lt 100 ] || { cat /tmp/d.out; echo "FALHOU: a primeira transação não chegou à espera"; exit 1; }
  sleep 0.1
done
# As três segundas requisições saem juntas, com as primeiras ainda abertas; cada uma anota quanto esperou.
START=$(date +%s)
( q > /tmp/f.out 2>&1 <<SQL || true
$(AS d2)
select ptw.permit_sign('$U', '$P1', t.id('f36'), 1);
SQL
echo $(( $(date +%s) - START )) > /tmp/f.s ) &
( q > /tmp/g.out 2>&1 <<SQL || true
$(AS d2)
select 'B assinou: ' || ptw.permit_sign('$U', '$P2', t.id('f25'), 1);
SQL
echo $(( $(date +%s) - START )) > /tmp/g.s ) &
( q > /tmp/h.out 2>&1 <<SQL || true
$(AS d1)
select 'B chave: ' || situacao || ' ' || status || ' ' || (response ->> 'body') from ptw.idempotency_begin('$KEY', 'putPermitAnswer', '$HASH');
select 'B linhas: ' || (ptw.permit_answer_put('$U', '$P3', 'chk2', '{"t": "verificacao", "lines": {"lb": {"a": "nao"}}}') -> 'lines')::text;
SQL
echo $(( $(date +%s) - START )) > /tmp/h.s ) &
wait
cat /tmp/d.out /tmp/f.out /tmp/g.out /tmp/h.out
WF=$(cat /tmp/f.s); WG=$(cat /tmp/g.s); WH=$(cat /tmp/h.s)
R=$(q -c "$(AS d2) select (select state from ptw.permit where id = '$P1') || ' ' ||
  (select count(*) from ptw.signature where permit_id = '$P1' and slot_id = t.id('f36') and voided_at is null) || ' ' ||
  (select count(*) from ptw.audit_event where permit_id = '$P1' and action = 'pt.estado' and data -> 'para' ->> 'state' = 'emitida') || ' | ' ||
  (select state from ptw.permit where id = '$P2') || ' ' ||
  (select count(*) from ptw.signature where permit_id = '$P2' and slot_id = t.id('f25') and voided_at is null) || ' ' ||
  (select count(*) from ptw.audit_event where permit_id = '$P2' and action = 'pt.estado' and data -> 'para' ->> 'state' = 'emitida') || ' | ' ||
  (select count(*) from ptw.api_idempotency where key = '$KEY')" | tail -1)
echo "As segundas esperaram ${WF}s, ${WG}s e ${WH}s; $R"
grep -q "Só a etapa atual" /tmp/f.out && [ "$WF" -ge 1 ] && [ "${R%% |*}" = "emitida 1 1" ] \
  && echo "OK: duas assinaturas que fecham a mesma etapa: a segunda espera e é recusada; o estado avança uma vez" || { echo "FALHOU: assinaturas simultâneas (min = 1)"; exit 1; }
grep -q "A assinou: emitida e em_analise" /tmp/d.out && grep -q "B assinou: emitida" /tmp/g.out && [ "$WG" -ge 1 ] && echo "$R" | grep -q "| emitida 2 1 |" \
  && echo "OK: duas assinaturas que completam juntas a etapa (min = 2): as duas entram e o estado avança uma vez" || { echo "FALHOU: assinaturas simultâneas (min = 2)"; exit 1; }
grep -q "A reservou: nova" /tmp/d.out && grep -q "B chave: repetida 200 A" /tmp/h.out && [ "$WH" -ge 1 ] && [ "${R##*| }" = "1" ] \
  && echo "OK: a mesma Idempotency-Key ao mesmo tempo: a segunda espera e repete a resposta da primeira" || { echo "FALHOU: idempotência sob corrida"; exit 1; }
grep -q 'B linhas: {"la": {"a": "sim"}, "lb": {"a": "nao"}}' /tmp/h.out \
  && echo "OK: dois toques em linhas diferentes da verificação: as duas linhas ficam" || { echo "FALHOU: junção das linhas sob corrida"; exit 1; }
# Fora da corrida, mas na mesma seção "banco" do test.sh: tabelas de códigos PTW = esquema.
sh "$(dirname "$0")/ptw_codes.sh" || exit 1
