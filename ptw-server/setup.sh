#!/bin/sh
# Gera os segredos locais (uma vez). Ficam em ./secrets, fora do git.
set -eu
cd "$(dirname "$0")"
mkdir -p secrets
gen() { [ -s "secrets/$1" ] || { head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$2" > "secrets/$1"; echo "criado secrets/$1"; }; }
gen db_owner 40
gen db_api 40
gen s3_api_key 20
gen s3_api_secret 40
# Chave das âncoras diárias da auditoria (HMAC). Fica só no host: não é montada em nenhum contêiner,
# então nenhum papel do banco a lê. Guarde uma cópia junto com as âncoras de quem audita.
gen audit_anchor_key 64
# Os contêineres rodam como usuários sem privilégio; os segredos deles precisam ser legíveis.
chmod 644 secrets/db_owner secrets/db_api secrets/s3_api_key secrets/s3_api_secret
chmod 600 secrets/audit_anchor_key
echo "Segredos prontos. Suba com: docker compose up -d"
echo "Agende a âncora diária e a manutenção da auditoria (README, \"Operação da auditoria\")."
