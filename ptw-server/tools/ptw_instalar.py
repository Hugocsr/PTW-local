#!/usr/bin/env python3
"""Instalação idempotente. --local usa apenas dados e identidades fictícias no computador."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import string
import subprocess
import time
from types import SimpleNamespace

import ptw_db

SERVER = Path(ptw_db.SERVER)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--local', action='store_true')
    p.add_argument('--unidade', default='UN-01')
    p.add_argument('--nome')
    p.add_argument('--admin-login')
    p.add_argument('--admin-nome')
    args = p.parse_args()
    if not args.local and not all([args.nome, args.admin_login, args.admin_nome]):
        p.error('Na planta, informe --nome, --admin-login e --admin-nome (sem senha)')
    if not args.local and not all((SERVER / 'secrets' / name).is_file() for name in ('ldap.json','ldap_bind','ldap-ca.pem')):
        p.error('Configure secrets/ldap.json, ldap_bind e ldap-ca.pem conforme OPERACAO.md')
    folder = SERVER / 'secrets'
    folder.mkdir(exist_ok=True, mode=0o700)
    for name, size in [('db_owner',40),('db_api',40),('s3_api_key',20),('s3_api_secret',40),('audit_anchor_key',64)]:
        path = folder / name
        if not path.exists() or not path.stat().st_size:
            path.write_text(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(size)),encoding='ascii')
        path.chmod(0o600 if name == 'audit_anchor_key' else 0o644)
    env = dict(os.environ, PTW_UNIT='UN-01' if args.local else args.unidade)
    compose = ['docker','compose','-f','compose.yaml','-f','compose.ldap-test.yaml' if args.local else 'compose.ldap.yaml']
    def run(cmd):
        subprocess.run(cmd,cwd=SERVER,env=env,check=True)
    run(compose+['up','-d','--wait','db','storage'])
    db = SimpleNamespace(banco='ptw',container=None)
    for attempt in range(60):
        try:
            if ptw_db.query(db,"select to_regclass('ptw.schema_info')")[0][0]:
                break
        except (SystemExit, IndexError):
            pass
        time.sleep(1)
    else:
        p.error('Esquema não ficou pronto; confira docker compose logs db')
    expected={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted((SERVER/'db/schema').glob('*.sql'))}
    actual=json.loads(ptw_db.query(db,'select files from ptw.schema_info')[0][0])
    if actual != expected:
        p.error('Banco de outra versão do esquema. Faça backup e restauração de prova antes de recriar pelo db/reset.sh; nada foi apagado.')
    if args.local:
        run(['docker','compose','-f','compose.yaml','-f','api/compose.seed.yaml','run','--rm','--build','seed'])
    else:
        # Cadastro inicial sem cargos de segurança; os grupos reais do LDAP concedem administração.
        ptw_db.query(db,"""begin;
          insert into ptw.unit(code,name) values(:'code',:'name') on conflict(code) do nothing;
          select ptw.set_context(id,null,null,'servico','instalacao') from ptw.unit where code=:'code';
          insert into ptw.person(unit_id,name,login,enabled)
            select ptw.current_unit(),:'person',:'login',true
            where not exists(select 1 from ptw.person where unit_id=ptw.current_unit() and lower(login)=lower(:'login'));
          select ptw.audit_system('sistema.instalacao.conferida','Instalação conferida','{}'::jsonb,ptw.current_unit());
          commit;""",code=args.unidade,name=args.nome,person=args.admin_nome,login=args.admin_login)
    run(compose+['up','-d','--build','--wait'])
    print('Pronto: https://localhost' if args.local else 'Instalação pronta no endereço definido em PTW_HOSTS.')
    if args.local:
        print('Teste local: marina.costa (admin) / paulo.lima (operação); senha fictícia: Teste-local-2026!')


if __name__ == '__main__':
    main()
