#!/bin/sh
# Teste de ponta a ponta do servidor rodando.
#   sh test.sh                    tudo (banco, auditoria, arquivos, app, recursos, API)
#   sh test.sh banco auditoria    só as seções pedidas (o app não precisa estar no ar)
# Seções:
#   banco      cria o esquema (db/schema) num banco descartável "ptw_test", roda as regras e a corrida
#   auditoria  exporta, ancora e verifica a trilha fora do Postgres (Python 3), com adulteração
#              de um byte e reescrita completa (precisa de "banco" antes)
#   arquivos   grava, lê e confere um arquivo pelo S3 interno; o que precisa ser recusado
#   app        HTTPS, cabeçalhos e portas (precisa do web no ar)
#   recursos   /status.json do rodapé (precisa de web e stats no ar); o repassador do Docker só lê
#   api        contrato e rotas contra PostgreSQL e S3, exportação portátil e upload de 200 MiB
set -eu
# Git Bash no Windows: não converter caminhos como /dev/null nos argumentos do docker.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
SECOES=${*:-banco auditoria arquivos app recursos api}
quer() { case " $SECOES " in *" $1 "*) return 0;; *) return 1;; esac; }
DB=$(docker compose ps -q db)
NET=ptw_interna
export PGPASSWORD=$(cat secrets/db_owner)
PSQL="docker exec -i -e PGPASSWORD $DB psql"
fail() { echo "FALHOU: $*"; exit 1; }
RESULTADO=falhou
evento() {  # registra o resultado no banco principal (sistema.teste.executado)
  $PSQL -q -U ptw_owner -d ptw -v r="$RESULTADO" -v s="$SECOES" >/dev/null 2>&1 <<'SQL' || true
select ptw.audit_system('sistema.teste.executado', 'test.sh: ' || :'r', jsonb_build_object('resultado', :'r', 'secoes', :'s'));
SQL
}
trap evento EXIT

if quer banco; then
  echo "== Banco"
  sh db/tests/ptw_codes.sh || fail "códigos PTW divergentes"
  $PSQL -q -U ptw_owner -d ptw -c "drop database if exists ptw_test with (force)" -c "drop role if exists ptw_api_test" -c "create database ptw_test" >/dev/null
  cat db/schema/*.sql | $PSQL -q -v ON_ERROR_STOP=1 --single-transaction -U ptw_owner -d ptw_test >/dev/null || fail "esquema (db/schema)"
  FILES=$(for f in db/schema/*.sql; do printf '"%s": "%s", ' "$(basename "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"; done)
  $PSQL -q -v ON_ERROR_STOP=1 -U ptw_owner -d ptw_test -c "select ptw.schema_record('{${FILES%, }}')" >/dev/null || fail "registro do esquema"
  [ "$($PSQL -At -U ptw_owner -d ptw_test -c "select count(*) from ptw.schema_info, jsonb_object_keys(files)")" = "$(ls db/schema/*.sql | wc -l | tr -d ' ')" ]     && echo "OK: esquema criado do zero e registrado com o SHA-256 de cada arquivo" || fail "registro do esquema"
  OUT=$($PSQL -v ON_ERROR_STOP=1 -U ptw_owner -d ptw_test < db/tests/invariants.sql 2>&1) || true
  echo "$OUT" | grep -E "FALHOU|OK:|ERRO|ERROR" || { echo "$OUT" | tail -5; fail "regras"; }
  echo "$OUT" | grep -qE "FALHOU|ERRO|ERROR" && fail "regras"
  OUT=$(PGUSER=ptw_owner PGDATABASE=ptw_test sh db/tests/concurrency.sh "$DB") || { echo "$OUT"; fail "corrida"; }
  echo "$OUT" | grep -E "^(OK|FALHOU)"
  echo "$OUT" | grep -q "FALHOU" && fail "corrida"
  # O login da API não é superusuário e não cria nada.
  $PSQL -At -U ptw_owner -d ptw -c "select rolsuper or rolcreaterole or rolcreatedb from pg_roles where rolname = 'ptw_api'" | grep -qx f \
    && echo "OK: login da API sem privilégio de administração" || fail "ptw_api com privilégio"
fi

if quer auditoria; then
  echo "== Auditoria fora do Postgres"
  PY=
  for c in python3 python; do
    $c -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1 && { PY=$c; break; }
  done
  [ -n "$PY" ] || fail "Python 3.8+ não encontrado"
  T=$(mktemp -d)
  TW=$T; command -v cygpath >/dev/null 2>&1 && TW=$(cygpath -m "$T")   # Python nativo no Windows
  head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 64 > "$T/chave"
  ARGS="--banco ptw_test --container $DB"
  $PY tools/ptw_ancora.py $ARGS --destino "$TW/ancoras" --chave "$TW/chave" >/dev/null || fail "âncora"
  $PY tools/ptw_exporta.py $ARGS --unidade UN-01 --de 2000-01-01 --ate 2100-01-01 --motivo "Teste de exportação: \"aspas\" e acentuação" --destino "$TW/exp" >/dev/null \
    || fail "exportação"
  MAN=$(ls "$T"/exp/*.manifesto.json); MANW=$TW/exp/$(basename "$MAN"); JL=${MAN%.manifesto.json}.jsonl
  OUT=$($PY "$TW/exp/ptw_verifica.py" "$MANW" --ancoras "$TW/ancoras" --chave "$TW/chave" --exigir-ancora) || { echo "$OUT"; fail "verificador"; }
  echo "$OUT" | grep -q "^ÍNTEGRA" && echo "OK: verificador portátil: $(wc -l < "$JL" | tr -d ' ') linhas idênticas byte a byte à forma canônica e hashes iguais aos do banco; âncora conferida"
  # Âncora de outra chave (quem reescreve a trilha também escreve âncoras): com a chave dada, não conta.
  JLW=$TW/exp/$(basename "$JL"); mkdir -p "$T/forjadas"
  $PY -c "import json,sys; ev=json.loads(open(sys.argv[1],encoding='utf-8').readlines()[-1]); open(sys.argv[2],'w').write(json.dumps({'v':1,'unidade':ev['unit'],'dia':'2026-11-09','seq':ev['seq'],'hash':ev['hash'],'chave':'f'*16,'mac':'0'*64})+chr(10))" \
    "$JLW" "$TW/forjadas/a.jsonl" || fail "âncora forjada"
  OUT=$($PY tools/ptw_verifica.py --jsonl "$JLW" --ancoras "$TW/forjadas" --chave "$TW/chave" --exigir-ancora) && { echo "$OUT"; fail "âncora de outra chave contou como conferida"; }
  echo "$OUT" | grep -q "nenhuma âncora assinada com a chave dada" && echo "$OUT" | grep -q "de outra chave ignorada" \
    && echo "OK: âncora de outra chave é ignorada e não satisfaz --exigir-ancora" || { echo "$OUT"; fail "âncora de outra chave"; }
  $PY tools/ptw_verifica.py --jsonl "$JLW" --ancoras "$TW/ancoras" --chave "$TW/chave" --exigir-ancora >/dev/null \
    && echo "OK: a âncora verdadeira, da mesma chave, satisfaz --exigir-ancora" || fail "âncora verdadeira"
  RC=0; $PY tools/ptw_verifica.py --jsonl "$JLW" --ancoras "$TW/ancoras" --exigir-ancora >/dev/null || RC=$?
  [ "$RC" = 2 ] && echo "OK: --exigir-ancora sem --chave é recusado" || fail "--exigir-ancora sem chave"
  LC_ALL=C grep '"action": "conta.teste"' "$JL" | LC_ALL=C grep -q 'acentuação çãéõ, emoji 🦺' \
    && echo "OK: exportação traz o evento com acentos, emoji, aspas, barra, quebra de linha e controle" || fail "evento de teste ausente na exportação"
  # Um byte alterado no arquivo exportado: o verificador aponta o seq exato.
  cp "$JL" "$T/um-byte.jsonl"
  sed -i '5s/criado/criadO/' "$T/um-byte.jsonl"
  OUT=$($PY tools/ptw_verifica.py --jsonl "$TW/um-byte.jsonl") && fail "um byte alterado passou"
  echo "$OUT" | grep -q "PROBLEMA: seq 5:" && echo "OK: um byte alterado: o verificador aponta o seq 5" || { echo "$OUT"; fail "seq do byte alterado"; }
  # Reescrita completa no banco (superusuário com as proteções desligadas): a cadeia fica coerente,
  # mas a âncora gravada fora não.
  $PSQL -q -v ON_ERROR_STOP=1 -U ptw_owner -d ptw_test >/dev/null <<'SQL' || fail "simular reescrita"
alter event trigger audit_ddl_end disable;
alter table ptw.audit_event disable trigger audit_frozen;
update ptw.audit_event set text = 'Rascunho criado (reescrito)' where unit_id = '00000000-0000-7000-8000-000000000001' and seq = 36;
do $$
declare e record; prev bytea := '\x0000000000000000000000000000000000000000000000000000000000000000'; h bytea;
begin
  for e in select * from ptw.audit_event where unit_id = '00000000-0000-7000-8000-000000000001' order by seq loop
    h := ptw.audit_hash(prev, ptw.audit_canon(e.unit_id, e.seq, e.at, e.actor_id, e.role_id, e.auth, e.client, e.request_id,
           e.reason, e.action, e.ok, e.permit_id, e.rev, e.asset_id, e.entity, e.entity_id, e.text, e.data));
    update ptw.audit_event set prev_hash = prev, hash = h where unit_id = e.unit_id and seq = e.seq;
    prev := h;
  end loop;
  update ptw.audit_head set last_hash = prev where unit_id = '00000000-0000-7000-8000-000000000001';
end $$;
alter table ptw.audit_event enable always trigger audit_frozen;
alter event trigger audit_ddl_end enable always;
SQL
  [ -z "$($PSQL -At -U ptw_owner -d ptw_test -c "select ptw.audit_verify('00000000-0000-7000-8000-000000000001')")" ] \
    && echo "OK: reescrita completa passa na verificação interna (por isso a âncora)" || fail "reescrita não ficou coerente"
  rm -rf "$T/exp2"
  $PY tools/ptw_exporta.py $ARGS --unidade UN-01 --de 2000-01-01 --ate 2100-01-01 --motivo "Depois da reescrita" --destino "$TW/exp2" >/dev/null || fail "exportação 2"
  MAN2=$TW/exp2/$(basename "$(ls "$T"/exp2/*.manifesto.json)")
  OUT=$($PY tools/ptw_verifica.py "$MAN2" --ancoras "$TW/ancoras" --chave "$TW/chave") && fail "reescrita completa passou no verificador"
  echo "$OUT" | grep -q "a trilha foi reescrita" && echo "OK: reescrita completa: a âncora fora do servidor não confere" || { echo "$OUT"; fail "reescrita não detectada"; }
  OUT=$($PY tools/ptw_ancora.py $ARGS --destino "$TW/ancoras" --chave "$TW/chave") && fail "âncora sobre trilha reescrita"
  echo "$OUT" | grep -q "não ancorada" && echo "OK: o script de âncora verifica antes e não ancora trilha com problema" || { echo "$OUT"; fail "âncora sobre problema"; }
  rm -rf "$T"
fi
if quer banco || quer auditoria; then
  $PSQL -q -U ptw_owner -d ptw -c "drop database if exists ptw_test with (force)" -c "drop role if exists ptw_api_test" >/dev/null
fi

if quer arquivos; then
  echo "== Arquivos (S3 interno)"
  KEY=$(cat secrets/s3_api_key); SECRET=$(cat secrets/s3_api_secret)
  s3() { docker run --rm -i --network "$NET" --read-only curlimages/curl:8.17.0 -s "$@"; }
  SIG="--aws-sigv4 aws:amz:us-east-1:s3 --user $KEY:$SECRET"
  head -c 300000 /dev/urandom > /tmp/ptw-foto.bin
  HASH=$(sha256sum /tmp/ptw-foto.bin | cut -d' ' -f1)
  OBJ="http://storage:8333/ptw-arquivos/teste/$(echo "$HASH" | cut -c1-2)/$HASH"

  CODE=$(s3 -o /dev/null -w '%{http_code}' $SIG -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" -T - "$OBJ" < /tmp/ptw-foto.bin)
  [ "$CODE" = 200 ] && echo "OK: gravou 300 KB" || fail "PUT $CODE"
  GOT=$(s3 $SIG "$OBJ" | sha256sum | cut -d' ' -f1)
  [ "$GOT" = "$HASH" ] && echo "OK: leu de volta com o mesmo SHA-256" || fail "conteúdo diferente"
  CODE=$(s3 -o /dev/null -w '%{http_code}' "$OBJ")
  [ "$CODE" = 403 ] && echo "OK: sem credencial é recusado (403)" || fail "anônimo $CODE"
  CODE=$(s3 -o /dev/null -w '%{http_code}' $SIG -X PUT "http://storage:8333/outro-bucket")
  [ "$CODE" = 403 ] && echo "OK: a API não cria buckets (403)" || fail "criou bucket $CODE"
  docker run --rm --network ptw_interna --read-only curlimages/curl:8.17.0 -s -m 5 -o /dev/null https://example.com \
    && fail "a rede interna saiu para a internet" || echo "OK: rede interna sem saída para a internet"
  s3 -o /dev/null $SIG -X DELETE "$OBJ"
  rm -f /tmp/ptw-foto.bin
  for svc in db storage; do
    [ -z "$(docker port "$(docker compose ps -q $svc)")" ] || fail "$svc publicou porta"
  done
  echo "OK: banco e arquivos sem porta publicada"
fi

if quer app; then
  echo "== App (web)"
  PORT=${PTW_HTTPS_PORT:-443}
  [ "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:$PORT/)" = 200 ] && echo "OK: app responde em HTTPS" || fail "app"
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:${PTW_HTTP_PORT:-80}/)" = 308 ] && echo "OK: HTTP redireciona para HTTPS" || fail "redirecionamento"
  curl -skI https://localhost:$PORT/ | grep -qi "content-security-policy: default-src 'self'" && echo "OK: cabeçalhos de segurança" || fail "CSP"
  curl -skI https://localhost:$PORT/ | grep -qi "^server:" && fail "versão do servidor exposta" || echo "OK: sem cabeçalho Server"
fi

if quer recursos; then
  echo "== Recursos (rodapé)"
  PORT=${PTW_HTTPS_PORT:-443}
  # Validado pelo Python do próprio stats (o host não precisa de Python para esta seção).
  curl -sk https://localhost:$PORT/status.json | docker compose exec -T stats python -I -c '
import json, sys
d = json.load(sys.stdin)
assert d["v"] == 1 and {"web", "db"} <= {s["name"] for s in d["services"]}, d'     && echo "OK: /status.json é JSON válido, com web e db" || fail "status.json inválido"
  curl -skI https://localhost:$PORT/status.json | grep -qi "^cache-control: no-store" && echo "OK: /status.json sem cache" || fail "cache do status.json"
  for svc in stats stats-docker; do
    [ -z "$(docker port "$(docker compose ps -q $svc)")" ] || fail "$svc publicou porta"
  done
  echo "OK: stats e stats-docker sem porta publicada"
  # O repassador só deixa os quatro GETs do coletor; o resto (POST, /info, /images, /archive, /logs, /export) é 403.
  OUT=$(docker compose exec -T stats python -I -c '
import http.client
def st(m, p):
    c = http.client.HTTPConnection("stats-docker", 2375, timeout=10); c.request(m, p); return c.getresponse().status
db = "'"$DB"'"
print(st("GET", "/containers/json"), st("GET", f"/containers/{db}/stats?stream=false&one-shot=true"), st("GET", "/system/df?type=volume"),
      st("POST", f"/containers/{db}/stop"), st("GET", "/info"), st("GET", "/images/json"),
      st("GET", f"/containers/{db}/archive?path=/run/secrets"), st("GET", f"/containers/{db}/logs?stdout=1"), st("GET", f"/containers/{db}/export"))') || fail "repassador"
  [ "$OUT" = "200 200 200 403 403 403 403 403 403" ]     && echo "OK: repassador do Docker só lê lista, inspeção, stats e df (POST, /info, /images, /archive, /logs, /export: 403)" || fail "repassador: $OUT"
  [ "$(docker network inspect ptw_docker --format '{{len .Containers}} {{.Internal}}')" = "2 true" ]     && echo "OK: rede do repassador interna, só com stats e stats-docker" || fail "rede ptw_docker"
  docker inspect "$(docker compose ps -q web)" --format '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}' | grep -q "$(docker network inspect ptw_docker --format '{{.Id}}')"     && fail "web alcança o repassador" || echo "OK: web fora da rede do repassador"
fi

if quer api; then
  echo "== API: contrato, PostgreSQL e armazenamento reais"
  docker compose -f compose.yaml -f api/compose.test.yaml run --rm --build api-test || fail "API"
  [ -z "$(docker port "$(docker compose ps -q api)")" ] || fail "API publicou porta"
  echo "OK: API sem porta publicada"
fi

echo "== Recursos"
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}' $(docker compose ps -q)
RESULTADO=ok
echo "TUDO OK"
