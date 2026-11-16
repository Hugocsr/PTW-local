#!/bin/sh
# Desenvolvimento: apaga o banco e cria de novo a partir de db/schema (o volume ptw_pgdata some,
# com todos os dados). Se o repassador do DBeaver (dbproxy) estava ligado, liga de novo.
# Uso: sh db/reset.sh
set -eu
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
DEV="-f compose.yaml -f compose.dbeaver.yaml"
PROXY=$(docker compose $DEV ps -q dbproxy 2>/dev/null || true)
[ -n "$PROXY" ] && docker compose $DEV rm -sf dbproxy >/dev/null
docker compose rm -sf db >/dev/null
docker volume rm ptw_pgdata >/dev/null 2>&1 || true
docker compose up -d --wait db
# O healthcheck já passa durante a criação (servidor temporário): espera o esquema registrado.
export PGPASSWORD=$(cat secrets/db_owner)
i=0
until R=$(docker compose exec -T -e PGPASSWORD db psql -X -At -U ptw_owner -d ptw -h 127.0.0.1           -c "select string_agg(key, ', ' order by key) from ptw.schema_info, jsonb_object_keys(files) key" 2>/dev/null) && [ -n "$R" ]; do
  i=$((i + 1)); [ "$i" -lt 60 ] || { echo "O banco não ficou pronto; veja: docker compose logs db"; exit 1; }
  sleep 1
done
echo "Esquema criado: $R"
if [ -n "$PROXY" ]; then
  docker compose $DEV up -d dbproxy >/dev/null && echo "dbproxy ligado de novo (127.0.0.1:${PTW_DB_DEV_PORT:-55432})"
fi
