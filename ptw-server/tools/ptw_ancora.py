#!/usr/bin/env python3
"""Âncora diária da trilha de auditoria (rodar uma vez por dia, pelo agendador do host).

1. Verifica a cadeia de cada unidade no banco (ptw.audit_check) e registra o resultado
   (sistema.verificacao). Unidade com problema não é ancorada e o script sai com 1.
2. Lê a ponta de cada unidade (seq e hash), assina com HMAC-SHA256 usando a chave que fica só no
   host (secrets/audit_anchor_key, nunca montada em contêiner) e acrescenta uma linha em
   DESTINO/<código da unidade>/<AAAA-MM>.jsonl. O DESTINO deve ficar fora deste host: pasta de
   rede, disco USB ou outra máquina.
3. Registra a âncora no banco (ptw.audit_anchor e o evento sistema.ancora.gravada).

Quem reescrever a trilha inteira no banco não consegue refazer as âncoras já gravadas fora:
tools/ptw_verifica.py compara e aponta.

Uso: python3 tools/ptw_ancora.py --destino /mnt/ptw-ancoras [--chave secrets/audit_anchor_key]
"""
import argparse
import datetime
import hashlib
import hmac
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ptw_db  # noqa: E402
from ptw_verifica import anchor_mac, key_id  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description='Grava a âncora diária da auditoria fora do servidor.')
    ap.add_argument('--destino', required=True, help='pasta fora do host (rede, USB, outra máquina)')
    ap.add_argument('--chave', default=os.path.join(ptw_db.SERVER, 'secrets', 'audit_anchor_key'))
    ap.add_argument('--rotulo', help='nome do destino gravado no banco (padrão: o caminho)')
    ptw_db.add_args(ap)
    args = ap.parse_args()

    with open(args.chave, 'rb') as f:
        key = f.read().strip()
    if len(key) < 32:
        sys.exit('Chave curta demais (mínimo 32 bytes): rode setup.sh')
    kid = key_id(key)
    day = datetime.date.today().isoformat()
    label = args.rotulo or os.path.abspath(args.destino)

    status = 0
    failed = set()
    for unit_id, code in ptw_db.query(args, 'select id, code from ptw.unit order by code'):
        rows = ptw_db.query(args, "select problema, seq, detalhe from ptw.audit_check(:'u')", u=unit_id)
        problems = [{'problema': p, 'seq': int(s), 'detalhe': d} for p, s, d in rows]
        result = 'falhou' if problems else 'integra'
        text = ('Verificação da trilha: problema no seq %s (%s)' % (problems[0]['seq'], problems[0]['problema'])
                if problems else 'Verificação da trilha: íntegra')
        ptw_db.query(args, "select ptw.audit_system('sistema.verificacao', :'t', :'d'::jsonb, :'u')",
                     t=text, u=unit_id, d=json.dumps({'resultado': result, 'problemas': problems}, ensure_ascii=False))
        print('%s: %s' % (code, text))
        if problems:
            failed.add(unit_id)
            status = 1

    for unit_id, code, seq, head in ptw_db.query(args, 'select unit_id, code, seq, hash from ptw.audit_heads()'):
        if unit_id in failed:
            print('%s: não ancorada (verificação falhou)' % code)
            continue
        a = {'v': 1, 'unidade': unit_id, 'dia': day, 'seq': int(seq), 'hash': head, 'chave': kid}
        a['mac'] = anchor_mac(key, a)
        line = dict(a, codigo=code, gerado_em=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
        folder = os.path.join(args.destino, code)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, day[:7] + '.jsonl')
        with open(path, 'a', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(line, ensure_ascii=False, sort_keys=True) + '\n')
            f.flush()
            os.fsync(f.fileno())
        ptw_db.query(args, "select ptw.audit_anchor_record(:'u', :'s', :'h', :'d', :'k', :'m', :'l')",
                     u=unit_id, s=seq, h=head, d=day, k=kid, m=a['mac'], l=label)
        print('%s: âncora seq %s gravada em %s' % (code, seq, path))
    return status


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
