#!/usr/bin/env python3
"""Manutenção no host, backup consistente e restauração em destinos novos. Sem dependências pip."""
import argparse
import contextlib
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import time
from types import SimpleNamespace

import ptw_db

SERVER = Path(ptw_db.SERVER)
COMPOSE = ['docker', 'compose']


def run(cmd, **kwargs):
    return subprocess.run(cmd, cwd=SERVER, check=True, **kwargs)


def output(cmd):
    return run(cmd, stdout=subprocess.PIPE).stdout.decode().strip()


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(path, value):
    with open(path, 'x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())


def signature(manifest):
    key = (SERVER / 'secrets/audit_anchor_key').read_bytes().strip()
    if len(key) < 32:
        raise RuntimeError('Chave de auditoria ausente ou curta')
    body = {k: v for k, v in manifest.items() if k != 'signature'}
    canonical = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hmac.new(key, b'ptw-backup/1\x00' + canonical, hashlib.sha256).hexdigest()


@contextlib.contextmanager
def lock():
    # mkdir atômico também no Windows. Após queda abrupta, conferir processos antes de remover.
    folder = SERVER / '.operacao.lock'
    folder.mkdir()
    try:
        yield
    finally:
        folder.rmdir()


def event(args, action, text, data=None):
    ptw_db.query(args, "select ptw.audit_system(:'a',:'t',:'d'::jsonb)", a=action, t=text, d=json.dumps(data or {}))


def service(name):
    cid = output(COMPOSE + ['ps', '-a', '-q', name])
    if not cid:
        raise RuntimeError('Serviço ausente: ' + name)
    return json.loads(output(['docker', 'inspect', cid]))[0]


def pgcmd(args, tool, extra):
    cid = ptw_db._container(args)
    env = dict(os.environ, PGPASSWORD=(SERVER / 'secrets/db_owner').read_text().strip(),
               PGOPTIONS='-c ptw.ddl_quiet=on', PGCLIENTENCODING='UTF8')
    return ['docker', 'exec', '-i', '-e', 'PGPASSWORD', '-e', 'PGOPTIONS', '-e', 'PGCLIENTENCODING',
            cid, tool, '-U', 'ptw_owner'] + extra, env


def heads(args):
    return ptw_db.query(args, "select unit_id,last_seq,encode(last_hash,'hex') from ptw.audit_head order by unit_id")


def check_chain(args):
    for (unit,) in ptw_db.query(args, 'select id from ptw.unit'):
        bad = ptw_db.query(args, "select * from ptw.audit_check(:'u')", u=unit)
        if bad:
            raise RuntimeError('Auditoria não íntegra: ' + repr(bad))


def tar_command(image, user, volume, restore=False):
    return ['docker', 'run', '--rm', '-i', '--network', 'none', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--user', user, '--memory=64m', '--cpus=0.5',
            '--mount', 'type=volume,src=%s,dst=/data%s' % (volume, '' if restore else ',readonly'),
            '--entrypoint', 'tar', image, '-C', '/data', '-xf' if restore else '-cf', '-'] + ([] if restore else ['.'])


def backup(args):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    dest = Path(args.destino).resolve() / ('ptw-' + stamp)
    dest.mkdir(parents=True, mode=0o700)
    api, storage, web = [service(n) for n in ('api', 'storage', 'web')]
    stopped = []
    try:
        # Primeiro drena a API; depois congela SeaweedFS e a CA/certificados do Caddy.
        for item in (api, storage, web):
            if item['State']['Running']:
                stopped.append(item['Id'])
                run(['docker', 'stop', '--time', '40', item['Id']], stdout=subprocess.DEVNULL)
        event(args, 'sistema.backup.iniciado', 'Backup consistente iniciado', {'pasta': str(dest)})
        check_chain(args)
        manifest = {'format': 'ptw-backup/1', 'at': stamp, 'database': args.banco, 'heads': heads(args),
                    'partitions': json.loads(ptw_db.query(args, "select coalesce(jsonb_agg(p),'[]') from ptw.audit_partition p")[0][0]),
                    'files': {}, 'volumes': {}}
        cmd, env = pgcmd(args, 'pg_dump', ['-Fc', '--exclude-table-data=ptw.audit_partition', '-d', args.banco])
        with open(dest / 'database.dump', 'xb') as f:
            run(cmd, env=env, stdout=f)
        for name, item in [('files', storage), ('webdata', web)]:
            volume = next(m['Name'] for m in item['Mounts'] if m['Destination'] == '/data' and m['Type'] == 'volume')
            image, user = item['Config']['Image'], item['Config']['User']
            if not user or user in ('0', 'root', '0:0'):
                raise RuntimeError('O serviço deve usar usuário sem root')
            manifest['volumes'][name] = {'image': image, 'user': user}
            with open(dest / (name + '.tar'), 'xb') as f:
                run(tar_command(image, user, volume), stdout=f)
        for name in ('database.dump', 'files.tar', 'webdata.tar'):
            manifest['files'][name] = {'sha256': digest(dest / name), 'bytes': (dest / name).stat().st_size}
        if any(json.loads(output(['docker', 'inspect', item['Id']]))[0]['State']['Running'] for item in (api, storage, web)):
            raise RuntimeError('Um serviço reiniciou durante a cópia; backup recusado')
        manifest['signature'] = signature(manifest)
        write_json(dest / 'manifesto.json', manifest)
        event(args, 'sistema.backup.feito', 'Backup consistente concluído', {'pasta': str(dest), 'manifesto_sha256': digest(dest / 'manifesto.json')})
        print(str(dest), flush=True)
        return dest
    except BaseException:
        event(args, 'sistema.backup.falhou', 'Backup não concluído', {'pasta': str(dest)})
        raise
    finally:
        # Restaura só os serviços que estavam ligados; mantém suas configurações originais.
        for cid in reversed(stopped):
            run(['docker', 'start', cid], stdout=subprocess.DEVNULL)


def validate_tar(path):
    with tarfile.open(path, 'r:') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or '\\' in member.name or not (member.isdir() or member.isfile()):
                raise RuntimeError('Entrada de arquivo não permitida: ' + member.name)


def restore(args):
    source = Path(args.origem).resolve()
    manifest = json.loads((source / 'manifesto.json').read_text(encoding='utf-8'))
    if manifest['format'] != 'ptw-backup/1' or set(manifest['files']) != {'database.dump', 'files.tar', 'webdata.tar'}:
        raise RuntimeError('Formato de backup inválido')
    if not hmac.compare_digest(manifest.get('signature',''), signature(manifest)):
        raise RuntimeError('Assinatura do backup não confere com a chave de auditoria deste host')
    for name, metadata in manifest['files'].items():
        if digest(source / name) != metadata['sha256'] or (source / name).stat().st_size != metadata['bytes']:
            raise RuntimeError('Arquivo de backup não confere: ' + name)
    for name in ('files.tar', 'webdata.tar'):
        validate_tar(source / name)
    if not re.fullmatch(r'ptw_restore_[a-z0-9_]{1,32}', args.novo_banco):
        raise RuntimeError('Destino novo obrigatório: ptw_restore_<nome>')
    dest = SimpleNamespace(banco=args.novo_banco, container=args.container)
    if ptw_db.query(args, "select 1 from pg_database where datname=:'d'", d=dest.banco):
        raise RuntimeError('Banco já existe; nada foi alterado')
    volumes = {n: dest.banco + '_' + n for n in ('files', 'webdata')}
    existing = set(output(['docker', 'volume', 'ls', '-q']).splitlines())
    if existing.intersection(volumes.values()):
        raise RuntimeError('Volume de destino já existe; nada foi alterado')
    # Imagens do próprio sistema, nunca comandos indicados pelo manifesto recebido.
    images = {n: service(s)['Config'] for n, s in [('files', 'storage'), ('webdata', 'web')]}
    ptw_db.query(args, 'create database :"d" template template0', d=dest.banco)
    for section in ('pre-data', 'data'):
        cmd, env = pgcmd(dest, 'pg_restore', ['--exit-on-error', '--single-transaction', '--section=' + section, '-d', dest.banco])
        with open(source / 'database.dump', 'rb') as f:
            run(cmd, env=env, stdin=f)
    # OIDs mudam ao restaurar. Refaz só o catálogo técnico; os eventos/hashes não mudam.
    ptw_db.query(dest, """select set_config('ptw.restore_partitions', :'p', false);
      insert into ptw.audit_partition(rel,name,lower,upper,state,created_at)
      select to_regclass('ptw.'||quote_ident(p.name))::oid,p.name,p.lower,p.upper,p.state,p.created_at
      from jsonb_populate_recordset(null::ptw.audit_partition, :'p'::jsonb) p where p.state='ativa';
      do $$ declare r record; n bigint := 4294967295; begin
        for r in select * from jsonb_populate_recordset(null::ptw.audit_partition, current_setting('ptw.restore_partitions')::jsonb) where state='arquivada' loop
          while exists(select 1 from pg_class where oid=n::oid) or exists(select 1 from ptw.audit_partition where rel=n::oid) loop n:=n-1; end loop;
          insert into ptw.audit_partition values(n::oid,r.name,r.lower,r.upper,r.state,r.created_at); n:=n-1;
        end loop;
      end $$;""", p=json.dumps(manifest['partitions']))
    cmd, env = pgcmd(dest, 'pg_restore', ['--section=post-data', '-f', '-'])
    with open(source / 'database.dump', 'rb') as f:
        sql = run(cmd, env=env, stdin=f, stdout=subprocess.PIPE).stdout
    # Compatibilidade com backups anteriores ao teste de restauração: pg_restore usa search_path
    # vazio, e IS DISTINCT FROM de ltree não acha o operador da extensão no WHEN do gatilho.
    # O esquema atual já usa texto; o cast é equivalente para o caminho canônico de ltree.
    sql = sql.replace(b'WHEN ((old.path IS DISTINCT FROM new.path))', b'WHEN ((old.path::text IS DISTINCT FROM new.path::text))')
    cmd, env = pgcmd(dest, 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-d', dest.banco])
    run(cmd, env=env, input=sql, stdout=subprocess.DEVNULL)
    if heads(dest) != manifest['heads']:
        raise RuntimeError('Pontas da auditoria restaurada divergem do backup')
    check_chain(dest)
    for name, volume in volumes.items():
        run(['docker', 'volume', 'create', volume], stdout=subprocess.DEVNULL)
        config = images[name]
        with open(source / (name + '.tar'), 'rb') as f:
            run(tar_command(config['Image'], config['User'], volume, True), stdin=f)
    # Sessões anteriores não voltam a valer depois de um desastre/restauração.
    ptw_db.query(dest, """do $$ declare u record; s record; begin
      for u in select id from ptw.unit loop
        perform ptw.set_context(u.id,null,null,'sistema','restauracao');
        for s in update ptw.api_session set ended_at=now() where unit_id=u.id and ended_at is null returning person_id loop
          perform ptw.audit_log('sessao.expirada',true,'Sessão encerrada pela restauração','{}',s.person_id);
        end loop;
      end loop; end $$; analyze;""")
    event(dest, 'sistema.restauracao.feita', 'Backup restaurado e cadeia conferida', {'origem': str(source)})
    result = {'database': dest.banco, 'volumes': volumes, 'audit': 'integra', 'source': str(source)}
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


def maintenance(args):
    ptw_db.query(args, """select set_config('ptw.idle_seconds', :'idle', false); select ptw.audit_maintenance();
      do $$ declare u record; begin
        for u in select id from ptw.unit loop
          perform ptw.set_context(u.id,null,null,'sistema','operacao');
          perform ptw.expire_due(u.id);
          perform ptw.session_expire(current_setting('ptw.idle_seconds')::integer);
        end loop; end $$;
      delete from ptw.api_session where ended_at < now()-interval '30 days';
      delete from ptw.api_idempotency where created_at < now()-interval '30 days';
      delete from ptw.login_attempt where started_at < now()-interval '1 day';
      """, idle=args.inatividade_minutos * 60)
    event(args, 'sistema.manutencao.feita', 'Partições, expiração e limpeza técnica conferidas')


def cycle(args):
    maintenance(args)
    today = dt.datetime.now().date().isoformat()
    state_path = Path(args.destino).resolve() / 'operacao.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    if state.get('anchor_day') != today:
        cmd = [sys.executable, str(SERVER / 'tools/ptw_ancora.py'), '--destino', args.ancoras, '--banco', args.banco]
        if args.container:
            cmd += ['--container', args.container]
        run(cmd)
        state['anchor_day'] = today
    now = time.time()
    if now - state.get('backup_at', 0) >= args.intervalo_backup_minutos * 60:
        backup(args)
        state['backup_at'] = now
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix('.tmp')
    tmp.write_text(json.dumps(state), encoding='utf-8')
    tmp.replace(state_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for action in ('backup', 'restaurar', 'manutencao', 'ciclo'):
        p = sub.add_parser(action)
        ptw_db.add_args(p)
        if action in ('backup', 'ciclo'):
            p.add_argument('--destino', required=True)
        if action in ('manutencao', 'ciclo'):
            p.add_argument('--inatividade-minutos', type=int, default=30)
        if action == 'restaurar':
            p.add_argument('--origem', required=True)
            p.add_argument('--novo-banco', required=True)
        if action == 'ciclo':
            p.add_argument('--ancoras', required=True)
            p.add_argument('--intervalo-backup-minutos', type=int, default=60)
            p.add_argument('--continuo', action='store_true')
    args = parser.parse_args()
    if getattr(args, 'inatividade_minutos', 1) <= 0 or getattr(args, 'intervalo_backup_minutos', 1) <= 0:
        parser.error('Intervalos devem ser positivos')
    while True:
        with lock():
            {'backup': backup, 'restaurar': restore, 'manutencao': maintenance, 'ciclo': cycle}[args.action](args)
        if not getattr(args, 'continuo', False):
            break
        time.sleep(60)


if __name__ == '__main__':
    main()
