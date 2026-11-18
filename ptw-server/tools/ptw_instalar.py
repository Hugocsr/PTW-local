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


def run_docker(cmd, env, hint, *, capture=False):
    try:
        result = subprocess.run(cmd, cwd=SERVER, env=env, check=True, capture_output=capture)
    except FileNotFoundError:
        raise SystemExit('Docker não encontrado. Instale o Docker com Compose e abra um novo terminal.') from None
    except PermissionError:
        raise SystemExit('O terminal não tem permissão para executar o Docker. Abra um terminal com a conta que usa o Docker.') from None
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or b'').decode('utf-8', 'replace').strip()
        message = f'{hint}\nComando: {" ".join(cmd)} (código {error.returncode})'
        raise SystemExit(f'{message}\n{detail}' if detail else message) from None
    return result.stdout.decode('utf-8', 'replace').strip() if capture else None


def prepare_secrets(folder):
    try:
        folder.mkdir(exist_ok=True, mode=0o700)
        for name, size in [('db_owner',40),('db_api',40),('s3_api_key',20),('s3_api_secret',40),('audit_anchor_key',64)]:
            path = folder / name
            if not path.exists() or not path.stat().st_size:
                path.write_text(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(size)),encoding='ascii')
            path.chmod(0o600 if name == 'audit_anchor_key' else 0o644)
    except OSError as error:
        raise SystemExit(f'Não foi possível preparar os arquivos de segredo em {folder}. Confira as permissões da conta que executa o instalador.\n{error}') from None


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
    env = dict(os.environ, PTW_UNIT='UN-01' if args.local else args.unidade)
    compose = ['docker','compose','-f','compose.yaml','-f','compose.ldap-test.yaml' if args.local else 'compose.ldap.yaml']
    selected_copy = ptw_db.local_setting('PTW_DB_NAME', 'ptw') != 'ptw'
    if selected_copy:
        if not ptw_db.local_setting('COMPOSE_FILE'):
            p.error('Banco selecionado sem COMPOSE_FILE; confira o relatório da atualização local.')
        compose = ['docker', 'compose']  # Preserve the selected database, volumes and LDAP files.
    run_docker(['docker', 'compose', 'version'], env, 'Docker Compose indisponível. Confira a instalação.', capture=True)
    engine_os = run_docker(
        ['docker', 'info', '--format', '{{.OSType}}'], env,
        'O terminal não conseguiu acessar o motor do Docker. No Windows, abra o Docker Desktop, aguarde o motor iniciar e use a mesma conta no PowerShell.',
        capture=True,
    )
    if engine_os != 'linux':
        p.error('O PTW usa contêineres Linux. No Docker Desktop, selecione o motor de contêineres Linux.')
    prepare_secrets(SERVER / 'secrets')
    run_docker(
        compose+['up','-d','--wait','db','storage'], env,
        'Falha ao iniciar PostgreSQL ou armazenamento. Se o Docker indicar acesso negado em secrets, confira se a conta do Docker Desktop pode ler esses arquivos.',
    )
    db = SimpleNamespace(banco=ptw_db.local_setting('PTW_DB_NAME', 'ptw'),container=None)
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
    if args.local and not selected_copy:
        run_docker(
            ['docker','compose','-f','compose.yaml','-f','api/compose.seed.yaml','run','--rm','--build','seed'],
            env, 'Falha ao carregar os dados fictícios do laboratório.',
        )
    elif not args.local:
        # Cadastro inicial sem cargos de segurança; os grupos reais do LDAP concedem administração.
        ptw_db.query(db,"""begin;
          insert into ptw.unit(code,name) values(:'code',:'name') on conflict(code) do nothing;
          select ptw.set_context(id,null,null,'servico','instalacao') from ptw.unit where code=:'code';
          insert into ptw.person(unit_id,name,login,enabled)
            select ptw.current_unit(),:'person',:'login',true
            where not exists(select 1 from ptw.person where unit_id=ptw.current_unit() and lower(login)=lower(:'login'));
          select ptw.audit_system('sistema.instalacao.conferida','Instalação conferida','{}'::jsonb,ptw.current_unit());
          commit;""",code=args.unidade,name=args.nome,person=args.admin_nome,login=args.admin_login)
    startup_hint = 'Falha ao iniciar os serviços. Confira a saída do Docker acima.'
    if args.local:
        startup_hint += ' Se uma porta estiver ocupada, pare o serviço conflitante ou configure PTW_HTTP_PORT e PTW_HTTPS_PORT no terminal.'
    run_docker(compose+['up','-d','--build','--wait'], env, startup_hint)
    if args.local:
        address = run_docker(compose+['port','web','8443'], env, 'Não foi possível localizar a porta HTTPS do laboratório.', capture=True)
        port = address.rsplit(':', 1)[-1]
        url = 'https://localhost' if port == '443' else f'https://localhost:{port}'
        print(f'Laboratório integrado pronto em {url} (LDAP de teste e PostgreSQL local).')
        print('Teste local: marina.costa (admin) / paulo.lima (operação); senha fictícia: Teste-local-2026!')
    else:
        print('Instalação pronta no endereço definido em PTW_HOSTS.')


if __name__ == '__main__':
    main()
