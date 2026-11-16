#!/usr/bin/env python3
"""Verificador portátil da trilha de auditoria do PTW in a Box.

Um arquivo só, só a biblioteca padrão do Python 3 (3.8+). Não precisa do Postgres nem de rede.
Recalcula a cadeia de hashes de uma exportação (JSONL + manifesto) e compara com as âncoras
diárias guardadas fora do servidor.

Uso:
  python3 ptw_verifica.py MANIFESTO.json [--ancoras PASTA] [--chave ARQUIVO] [--exigir-ancora]
  python3 ptw_verifica.py --jsonl EVENTOS.jsonl [--ancoras PASTA] [--chave ARQUIVO]

Saída 0 = íntegra; 1 = problema (o seq exato é mostrado); 2 = erro de uso.

Forma canônica v2 (igual à do banco, ver README do servidor):
  hash = SHA-256( prev_hash (32 bytes) || UTF-8( JSON canônico do evento ) )
  objeto: "{" + '"chave": valor' separados por ", " + "}", chaves ordenadas pelo tamanho em bytes
  UTF-8 e depois byte a byte; lista: "[" + valores separados por ", " + "]"; texto com escape mínimo
  (\\" \\\\ \\b \\f \\n \\r \\t e \\u00XX minúsculo para < 0x20), resto literal em UTF-8; número em
  notação decimal simples, sem expoente, com as casas gravadas; true, false, null.
  Chaves do evento: action actor asset at auth client data entity entity_id ok permit reason
  request rev role seq text unit v.
"""
import argparse
import decimal
import hashlib
import hmac
import json
import os
import sys

HASHED = ('action', 'actor', 'asset', 'at', 'auth', 'client', 'data', 'entity', 'entity_id', 'ok',
          'permit', 'reason', 'request', 'rev', 'role', 'seq', 'text', 'unit', 'v')
ZERO = '0' * 64


def canon(v):
    """Serializa um valor JSON na forma canônica v2."""
    if v is None:
        return 'null'
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, decimal.Decimal):
        if v.is_zero():
            v = abs(v)                      # -0.0 vira 0.0
        return format(v, 'f')               # nunca expoente; mantém as casas
    if isinstance(v, float):
        raise ValueError('número lido sem Decimal')
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return '[' + ', '.join(canon(x) for x in v) + ']'
    if isinstance(v, dict):
        keys = sorted(v, key=lambda k: (len(k.encode('utf-8')), k.encode('utf-8')))
        return '{' + ', '.join(json.dumps(k, ensure_ascii=False) + ': ' + canon(v[k]) for k in keys) + '}'
    raise ValueError('tipo inesperado: %r' % type(v))


def parse(line):
    return json.loads(line, parse_float=decimal.Decimal)


def event_hash(ev):
    body = {k: ev[k] for k in HASHED}
    return hashlib.sha256(bytes.fromhex(ev['prev']) + canon(body).encode('utf-8')).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    n = 0
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


MAC_FIELDS = ('chave', 'dia', 'hash', 'seq', 'unidade', 'v')


def anchor_mac(key, a):
    """HMAC-SHA256 da âncora: forma canônica só dos campos assinados."""
    body = {k: a[k] for k in MAC_FIELDS}
    return hmac.new(key, canon(body).encode('utf-8'), hashlib.sha256).hexdigest()


def key_id(key):
    return hashlib.sha256(key).hexdigest()[:16]


def mac_state(key, a):
    """'ok' = assinatura conferida com a chave dada; 'invalida' = da chave dada, mas não confere;
    'outra' = de outra chave (não conferível: não conta como conferida); 'sem_chave' = nenhuma chave dada."""
    if key is None:
        return 'sem_chave'
    if a.get('chave') != key_id(key):
        return 'outra'
    return 'ok' if hmac.compare_digest(anchor_mac(key, a), str(a.get('mac', ''))) else 'invalida'


def load_anchors(folder, unit, key, problems):
    """Lê as âncoras (JSONL) de uma pasta, recursivo. Confere o HMAC se a chave foi dada."""
    found = []
    for root, _dirs, files in os.walk(folder):
        for name in sorted(files):
            if not name.endswith('.jsonl'):
                continue
            path = os.path.join(root, name)
            with open(path, 'rb') as f:
                for i, raw in enumerate(f, 1):
                    if not raw.strip():
                        continue
                    a = parse(raw.decode('utf-8'))
                    if a.get('unidade') != unit:
                        continue
                    st = mac_state(key, a)
                    if st == 'invalida':
                        problems.append('âncora com assinatura inválida: %s linha %d (seq %s)' % (path, i, a.get('seq')))
                        continue
                    found.append(dict(a, assinatura=st))
    return found


def main(argv=None):
    ap = argparse.ArgumentParser(description='Verifica a trilha de auditoria exportada do PTW in a Box.')
    ap.add_argument('manifesto', nargs='?', help='manifesto JSON da exportação')
    ap.add_argument('--jsonl', help='arquivo JSONL (sem manifesto)')
    ap.add_argument('--ancoras', help='pasta com as âncoras diárias (cópia fora do servidor)')
    ap.add_argument('--chave', help='arquivo com a chave HMAC das âncoras (confere a assinatura)')
    ap.add_argument('--exigir-ancora', action='store_true',
                    help='falha se nenhuma âncora assinada com a chave dada (--chave) cobrir a exportação')
    args = ap.parse_args(argv)
    if not args.manifesto and not args.jsonl:
        ap.print_usage()
        return 2
    if args.exigir_ancora and not args.chave:
        print('--exigir-ancora precisa de --chave: sem a chave, nenhuma âncora pode ser conferida')
        return 2

    problems, notes = [], []
    man = None
    if args.manifesto:
        with open(args.manifesto, 'rb') as f:
            man = parse(f.read().decode('utf-8'))
        if man.get('formato') != 'ptw-auditoria/2':
            print('Formato desconhecido: %s' % man.get('formato'))
            return 2
        jsonl = args.jsonl or os.path.join(os.path.dirname(os.path.abspath(args.manifesto)), man['arquivo']['nome'])
        digest, size = sha256_file(jsonl)
        if digest != man['arquivo']['sha256'] or size != man['arquivo']['bytes']:
            problems.append('arquivo diferente do manifesto (SHA-256 ou tamanho)')
    else:
        jsonl = args.jsonl

    first = last = unit = None
    prev = man['prev_hash_inicial'] if man else None
    head = None
    count = 0
    chain_ok = True
    hashes = {}
    with open(jsonl, 'rb') as f:
        for lineno, raw in enumerate(f, 1):
            if not raw.strip():
                continue
            try:
                ev = parse(raw.decode('utf-8'))
                missing = [k for k in HASHED + ('hash', 'prev') if k not in ev]
                if missing:
                    raise ValueError('faltam ' + ', '.join(missing))
            except (ValueError, UnicodeDecodeError) as e:
                problems.append('linha %d ilegível: %s' % (lineno, e))
                chain_ok = False
                break
            seq = ev['seq']
            if ev['v'] != 2:
                problems.append('seq %s: formato %s não suportado' % (seq, ev['v']))
                chain_ok = False
                break
            if unit is None:
                unit, first = ev['unit'], seq
                if prev is None:
                    prev = ev['prev']
            count += 1
            if ev['unit'] != unit:
                problems.append('seq %s: outra unidade no mesmo arquivo' % seq)
                chain_ok = False
                break
            if last is not None and seq != last + 1:
                problems.append('seq %s: lacuna depois do seq %s' % (seq, last))
                chain_ok = False
                break
            if ev['prev'] != prev:
                problems.append('seq %s: elo quebrado (prev não é o hash do evento anterior)' % seq)
                chain_ok = False
                break
            if canon(ev).encode('utf-8') != raw.rstrip(b'\r\n'):
                problems.append('seq %s: linha fora da forma canônica (editada à mão?)' % seq)
                chain_ok = False
                break
            calc = event_hash(ev)
            if calc != ev['hash']:
                problems.append('seq %s: conteúdo alterado (hash recalculado não confere)' % seq)
                chain_ok = False
                break
            hashes[seq] = calc
            prev = head = calc
            last = seq

    if count == 0 and not problems:
        problems.append('arquivo sem eventos')
    if man and chain_ok:
        if man.get('unidade') != unit or man.get('primeiro_seq') != first or man.get('ultimo_seq') != last:
            problems.append('manifesto não descreve o arquivo (unidade ou faixa de seq)')
        if man.get('hash_final') != head:
            problems.append('hash final diferente do manifesto')

    # Âncoras: as da pasta (fora do servidor) e as citadas no manifesto.
    key = None
    if args.chave:
        with open(args.chave, 'rb') as f:
            key = f.read().strip()
    anchors = []
    if args.ancoras and unit:
        anchors += [dict(a, origem='pasta') for a in load_anchors(args.ancoras, unit, key, problems)]
    if man:
        for a in man.get('ancoras', []):
            st = mac_state(key, a)
            if st == 'invalida':
                problems.append('âncora do manifesto com assinatura inválida (seq %s)' % a.get('seq'))
                continue
            anchors.append(dict(a, origem='manifesto', assinatura=st))
    # Com a chave, âncora de outra chave não vale nada (qualquer um forja uma): fica de fora e é avisada.
    # Sem a chave, as âncoras ainda são comparadas, mas nenhuma conta como conferida.
    checked = signed = foreign = 0
    if chain_ok:
        for a in anchors:
            s = a.get('seq')
            if not (isinstance(s, int) and first is not None and first <= s <= last):
                continue
            if a['assinatura'] == 'outra':
                foreign += 1
                continue
            checked += 1
            if hashes.get(s) != a.get('hash'):
                problems.append('âncora de %s (%s) não confere no seq %s: a trilha foi reescrita'
                                % (a.get('dia'), a['origem'], s))
            elif a['assinatura'] == 'ok':
                signed += 1
    if foreign:
        notes.append('%d âncora(s) de outra chave ignorada(s): não podem ser conferidas' % foreign)
    if signed == 0:
        msg = ('nenhuma âncora assinada com a chave dada cobre os seq %s a %s' % (first, last) if key is not None
               else 'nenhuma âncora conferida com chave cobre os seq %s a %s (use --chave)' % (first, last))
        (problems if args.exigir_ancora else notes).append(msg)

    print('Unidade %s · seq %s a %s · %d eventos' % (unit, first, last, count))
    print('Âncoras comparadas: %d (%d com assinatura conferida pela chave)' % (checked, signed))
    for n in notes:
        print('Aviso: ' + n)
    if problems:
        for p in problems:
            print('PROBLEMA: ' + p)
        return 1
    print('ÍNTEGRA: hash final %s' % head)
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    sys.exit(main())
