#!/bin/sh
# A tabela de códigos PTW do README e a de db/MODELO.md listam exatamente os códigos que o esquema
# levanta (errcode = 'PTWnn' em db/schema). Roda no host, sem banco: sh db/tests/ptw_codes.sh
# (invariants.sql confere o mesmo conjunto dentro do banco, pelo pg_proc).
set -eu
cd "$(dirname "$0")/../.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
grep -ohE "errcode = 'PTW[0-9]{2}'" db/schema/*.sql | grep -oE 'PTW[0-9]{2}' | sort -u > "$T/schema"
grep -oE '^\|.*\| `PTW[0-9]{2}` \|$' README.md | grep -oE 'PTW[0-9]{2}' | sort -u > "$T/readme"
grep -oE '^\| `PTW[0-9]{2}` \|' db/MODELO.md | grep -oE 'PTW[0-9]{2}' | sort -u > "$T/modelo"
ok=0
for f in readme modelo; do
  if diff "$T/schema" "$T/$f" > "$T/diff"; then
    echo "OK: códigos PTW do esquema = tabela de $f ($(wc -l < "$T/schema" | tr -d ' ') códigos)"
  else
    echo "FALHOU: códigos PTW do esquema (<) diferentes da tabela de $f (>):"; cat "$T/diff"; ok=1
  fi
done
exit $ok
