#!/bin/sh
# Criação do banco (docker-entrypoint-initdb.d, só com o volume vazio): aplica db/schema numa
# transação só, registra o SHA-256 de cada arquivo (ptw.schema_info) e cria o login da API com a
# senha do segredo. Não há migrações: mudou o esquema, recrie o banco (sh db/reset.sh).
set -eu
cat /ptw/schema/*.sql | psql -v ON_ERROR_STOP=1 -q --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"
FILES=$(for f in /ptw/schema/*.sql; do printf '"%s": "%s", ' "$(basename "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"; done)
psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select ptw.schema_record('{${FILES%, }}')"

API_PASSWORD=$(cat /run/secrets/db_api)
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$API_PASSWORD" <<'SQL'
create role ptw_api login in role ptw_app connection limit 30 password :'pw';
alter role ptw_api set statement_timeout = '5s';
alter role ptw_api set lock_timeout = '3s';
alter role ptw_api set search_path = ptw, public;   -- ltree e pg_trgm vivem em public
revoke all on database ptw from public;
grant connect on database ptw to ptw_api;
SQL
