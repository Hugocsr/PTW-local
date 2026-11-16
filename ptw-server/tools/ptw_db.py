"""Acesso ao banco para os scripts de operação (âncora, exportação, evento do sistema).

O banco não publica porta: os scripts rodam no host e falam com o psql dentro do contêiner `db`
(docker exec), como o dono do schema. Valores entram por variáveis do psql (:'nome'), nunca por
concatenação de texto.
"""
import os
import subprocess
import sys

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def add_args(ap):
    ap.add_argument('--banco', default=os.environ.get('PTW_DB_NAME', 'ptw'), help='nome do banco (padrão: ptw)')
    ap.add_argument('--container', default=os.environ.get('PTW_DB_CONTAINER'), help='contêiner do banco (padrão: o serviço db do compose)')


def _container(args):
    if args.container:
        return args.container
    r = subprocess.run(['docker', 'compose', 'ps', '-q', 'db'], cwd=SERVER, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    cid = r.stdout.decode().strip()
    if r.returncode or not cid:
        sys.exit('Banco não está rodando (docker compose up -d db)')
    return cid


def _cmd(args, variables):
    cmd = ['docker', 'exec', '-i', '-e', 'PGPASSWORD', '-e', 'PGCLIENTENCODING=UTF8', _container(args),
           'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t', '-U', 'ptw_owner', '-d', args.banco]
    for k, v in (variables or {}).items():
        cmd += ['-v', '%s=%s' % (k, '' if v is None else v)]
    with open(os.path.join(SERVER, 'secrets', 'db_owner'), 'rb') as f:
        env = dict(os.environ, PGPASSWORD=f.read().decode().strip())
    return cmd, env


def query(args, sql, **variables):
    """Roda o SQL e devolve as linhas (lista de listas de texto)."""
    cmd, env = _cmd(args, variables)
    r = subprocess.run(cmd, input=sql.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if r.returncode:
        sys.exit('Erro no banco: ' + r.stderr.decode('utf-8', 'replace').strip())
    out = r.stdout.decode('utf-8')
    return [line.split('\t') for line in out.splitlines() if line]


def stream(args, sql, **variables):
    """Roda o SQL e entrega a saída linha a linha, em bytes (exportações grandes)."""
    cmd, env = _cmd(args, variables)
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    p.stdin.write(sql.encode('utf-8'))
    p.stdin.close()
    for line in p.stdout:
        yield line
    err = p.stderr.read()
    if p.wait():
        sys.exit('Erro no banco: ' + err.decode('utf-8', 'replace').strip())
