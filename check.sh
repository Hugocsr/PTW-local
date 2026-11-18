#!/bin/sh
# Confere o repositório inteiro sem Docker: tipos, lint (camadas e tamanho) e testes do app e da API,
# e se a cópia do núcleo na API está igual à do app. Rode antes de dizer "pronto" e antes de todo commit.
#   sh check.sh          tudo
#   sh check.sh app      só o app
#   sh check.sh api      só a API
# O banco e os contêineres têm a própria bateria: sh ptw-server/test.sh
set -e
cd "$(dirname "$0")"
what="${1:-tudo}"
if [ "$what" = "tudo" ] || [ "$what" = "app" ]; then
  echo "== app (ptw-mockup-v2) =="
  (cd ptw-mockup-v2 && npm run --silent check)
fi
if [ "$what" = "tudo" ] || [ "$what" = "api" ]; then
  echo "== api (ptw-server/api) =="
  (cd ptw-server/api && npm run --silent check)
fi
if [ "$what" = "tudo" ]; then
  node --test deploy/preview-users.test.mjs
fi
echo "== tudo certo =="
