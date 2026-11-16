#!/usr/bin/env python3
"""Exporta a trilha de auditoria de uma unidade e período para JSONL + manifesto.

Gera em DESTINO:
  ptw-auditoria-<unidade>-<primeiro>-<último>.jsonl          um evento por linha (forma canônica)
  ptw-auditoria-<unidade>-<primeiro>-<último>.manifesto.json  faixa de seq, hashes, SHA-256 do
                                                               arquivo, âncoras e retenção
  ptw_verifica.py                                              o verificador portátil

O período vira uma faixa contínua de seq (nenhum evento do meio fica de fora). A exportação fica
registrada no banco (ptw.audit_export e o evento acesso.exportacao, com o motivo) e é o que
ptw.audit_archive exige antes de arquivar uma partição vencida.

Uso: python3 tools/ptw_exporta.py --unidade UN-01 --de 2026-11-01 --ate 2026-12-01 \
       --motivo "Pedido da fiscalização" --destino /mnt/export [--pessoa <uuid>]
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ptw_db  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description='Exporta a auditoria (JSONL + manifesto + verificador).')
    ap.add_argument('--unidade', required=True, help='código da unidade (ex.: UN-01)')
    ap.add_argument('--de', required=True, help='início do período, no fuso da unidade (AAAA-MM-DD [HH:MM])')
    ap.add_argument('--ate', required=True, help='fim do período, exclusivo, no fuso da unidade')
    ap.add_argument('--motivo', required=True, help='por que a exportação foi feita (fica na trilha)')
    ap.add_argument('--destino', required=True)
    ap.add_argument('--pessoa', help='id da pessoa que pediu (fica como ator do evento)')
    ptw_db.add_args(ap)
    args = ap.parse_args()
    if not args.motivo.strip():
        sys.exit('Informe o motivo')

    rows = ptw_db.query(args, "select id, code, timezone from ptw.unit where code = :'c'", c=args.unidade)
    if not rows:
        sys.exit('Unidade %s não existe' % args.unidade)
    unit_id, code, tz = rows[0]
    rng = ptw_db.query(args, """select first_seq, last_seq, events, prev_hash, last_hash
        from ptw.audit_seq_range(:'u', (:'de')::timestamp at time zone :'tz', (:'ate')::timestamp at time zone :'tz')""",
                       u=unit_id, de=args.de, ate=args.ate, tz=tz)
    if not rng:
        sys.exit('Nenhum evento no período')
    first, last, events, prev0, head = rng[0]

    os.makedirs(args.destino, exist_ok=True)
    base = 'ptw-auditoria-%s-%s-%s' % (code, first, last)
    data_path = os.path.join(args.destino, base + '.jsonl')
    h, size, n = hashlib.sha256(), 0, 0
    with open(data_path, 'wb') as out:
        for line in ptw_db.stream(args, "select ptw.audit_export_lines(:'u', :'f', :'l')", u=unit_id, f=first, l=last):
            line = line.rstrip(b'\r\n') + b'\n'
            out.write(line)
            h.update(line)
            size += len(line)
            n += 1
    if n != int(events):
        sys.exit('Exportação incompleta: %d de %s eventos' % (n, events))

    anchors = [{'v': 1, 'unidade': unit_id, 'dia': d, 'seq': int(s), 'hash': hh, 'chave': k, 'mac': m}
               for s, hh, d, k, m in ptw_db.query(args, """select seq, encode(hash, 'hex'), day, key_id, encode(mac, 'hex')
                 from ptw.audit_anchor where unit_id = :'u' and seq between :'f' and :'l' order by seq""",
                                                   u=unit_id, f=first, l=last)]
    retention = [{'classe': c, 'anos': int(y), 'base': b}
                 for c, y, b in ptw_db.query(args, 'select code, years, basis from ptw.retention_class order by code')]
    here = os.path.dirname(os.path.abspath(__file__))
    verifier = os.path.join(args.destino, 'ptw_verifica.py')
    shutil.copyfile(os.path.join(here, 'ptw_verifica.py'), verifier)
    with open(verifier, 'rb') as f:
        verifier_sha = hashlib.sha256(f.read()).hexdigest()

    manifest = {
        'formato': 'ptw-auditoria/2',
        'unidade': unit_id, 'codigo': code, 'fuso': tz,
        'periodo': {'de': args.de, 'ate': args.ate},
        'primeiro_seq': int(first), 'ultimo_seq': int(last), 'eventos': n,
        'prev_hash_inicial': prev0, 'hash_final': head,
        'arquivo': {'nome': base + '.jsonl', 'bytes': size, 'sha256': h.hexdigest()},
        'ancoras': anchors,
        'retencao': retention,
        'verificador': {'nome': 'ptw_verifica.py', 'sha256': verifier_sha},
        'motivo': args.motivo,
        'gerado_em': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    }
    man_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode('utf-8')
    man_path = os.path.join(args.destino, base + '.manifesto.json')
    with open(man_path, 'wb') as f:
        f.write(man_bytes)
    man_sha = hashlib.sha256(man_bytes).hexdigest()

    seq = ptw_db.query(args, """begin;
        select ptw.set_context(:'u', nullif(:'p', '')::uuid, null, 'sistema', 'ptw_exporta.py', null, :'m');
        select ptw.audit_export_record(:'u', :'f', :'l', :'fs', :'ms', :'m');
        commit;""", u=unit_id, p=args.pessoa or '', m=args.motivo, f=first, l=last, fs=h.hexdigest(), ms=man_sha)
    print('Exportados %d eventos (seq %s a %s) da %s' % (n, first, last, code))
    print('Manifesto: %s (SHA-256 %s)' % (man_path, man_sha))
    print('Registrado na trilha: seq %s' % seq[-1][0])
    print('Verifique: python3 %s %s --ancoras <pasta das âncoras>' % (verifier, man_path))
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
