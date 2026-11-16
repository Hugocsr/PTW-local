#!/bin/sh
# Troca o tema da planta (nome, logotipo, cores, fonte) sem reconstruir nada.
#   sh tema.sh <pasta>    copia tema.json e os arquivos da pasta para ./tema
#   sh tema.sh padrao     volta à aparência padrão
# Depois, recarregue a página. Regras do tema.json: tema/README.md.
set -eu
cd "$(dirname "$0")"
[ $# -eq 1 ] || { echo "uso: sh tema.sh <pasta-do-tema> | padrao"; exit 2; }
find tema -mindepth 1 ! -name README.md ! -name .gitignore -delete
if [ "$1" = "padrao" ]; then echo "Tema padrão. Recarregue a página."; exit 0; fi
[ -f "$1/tema.json" ] || { echo "FALHOU: $1/tema.json não existe"; exit 1; }
for f in "$1"/*; do
  case "$(basename "$f")" in
    tema.json|*.svg|*.png|*.webp|*.woff2|*.woff|*.ttf) cp "$f" tema/ ;;
  esac
done
echo "Tema de $1 copiado para ./tema. Recarregue a página."
