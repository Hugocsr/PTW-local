#!/usr/bin/env python3
"""Registra um evento do sistema (sem pessoa) na trilha de auditoria de todas as unidades.

Para os scripts de operação: backup, restauração, início e parada, desvio de relógio.

Uso:
  python3 tools/ptw_sistema.py sistema.backup.feito "Backup das 14h" --dados '{"arquivo": "ptw-1400.dump", "sha256": "..."}'
  python3 tools/ptw_sistema.py sistema.restauracao.feita "Restaurado do backup de 08/11 14h" --dados '{"origem": "..."}'
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ptw_db  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description='Registra um evento do sistema na auditoria.')
    ap.add_argument('acao', help='sistema.<algo>, minúsculas e pontos')
    ap.add_argument('texto', help='frase em português')
    ap.add_argument('--dados', default='{}', help='objeto JSON com os detalhes')
    ap.add_argument('--unidade', help='código da unidade (padrão: todas)')
    ptw_db.add_args(ap)
    args = ap.parse_args()
    if not re.fullmatch(r'sistema(\.[a-z_]+)+', args.acao):
        sys.exit('A ação começa com "sistema." (ex.: sistema.backup.feito)')
    dados = json.loads(args.dados)
    if not isinstance(dados, dict):
        sys.exit('--dados precisa ser um objeto JSON')
    if args.unidade and not ptw_db.query(args, "select 1 from ptw.unit where code = :'c'", c=args.unidade):
        sys.exit('Unidade %s não existe' % args.unidade)
    rows = ptw_db.query(args, """select ptw.audit_system(:'a', :'t', :'d'::jsonb,
                                   (select id from ptw.unit where code = nullif(:'u', '')))""",
                        a=args.acao, t=args.texto, d=json.dumps(dados, ensure_ascii=False), u=args.unidade or '')
    print('Registrado em %s unidade(s)' % rows[0][0])
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
