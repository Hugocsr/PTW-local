# PTW com interface do SGI

Aplicação independente de Permissão de Trabalho. A base de negócio veio do PTW in a Box (revisão `f1068a6`). A interface usa o azul, o fundo claro e o menu lateral branco do SGI, com os estados e as ações de uma PT.

## Abrir a demonstração

Com Node.js 24, rode no PowerShell a partir desta pasta.

```powershell
cd ptw-mockup-v2
npm.cmd ci
npm.cmd run dev:demo
```

Abra [a demonstração local](http://127.0.0.1:5176/). O cenário fictício de celulose abre em **Minha área**. Use **Quadro de PTs** para navegar pelos registros ou **Nova PT** para experimentar o rascunho. A demonstração roda em memória e volta ao cenário inicial ao recarregar.

Para gerar uma demonstração estática hospedável, rode `npm exec -- vite build --mode demo-public` no frontend. Ela usa o cenário genérico fictício do projeto e abre diretamente em **Minha área**. Use um projeto Vercel separado para publicar essa demonstração. O build normal continua usando a API.

## Ambiente integrado

O frontend normal usa a API do PTW. O servidor, o PostgreSQL e o armazenamento de arquivos estão em `ptw-server`. Consulte o [guia de operação](ptw-server/OPERACAO.md) para subir o laboratório com Docker. Os dados do laboratório são separados do cenário em memória.

Para conferir o frontend, rode `npm.cmd run check` e `npm.cmd run build` em `ptw-mockup-v2`.

## Imagem única e implantação na Vercel

A preparação da versão NR-10 de 18/11/2026 está no [roteiro de publicação de homologação](deploy/releases/2026-11-18-nr10.md), incluindo verificação do banco, destino Git/Preview e reversão. Os dados e modelos cadastrados localmente não são transportados pelo Git.

`Dockerfile.vercel` gera uma imagem com a interface, Caddy e a API Fastify. O navegador acessa a interface e a API no mesmo endereço. A Vercel termina o HTTPS. O laboratório local continua disponível pelo Compose para testar com OpenLDAP e dados fictícios.

1. Prepare um PostgreSQL de homologação com o esquema de `ptw-server/db/schema`, a unidade e um papel de aplicação com os privilégios do `ptw_api`. Use o [script de inicialização](ptw-server/db/init.sh) como referência e valide as extensões, papéis e a conexão direta com TLS. A API usa `LISTEN`, então a conexão precisa preservar a sessão do PostgreSQL.
2. Prepare um endpoint S3 compatível com HTTPS e o bucket privado `ptw-arquivos`. A chave deve ter acesso apenas a esse bucket. Provisione também um diretório LDAP/AD com TLS alcançável do ambiente hospedado. Cadastre no banco as contas autorizadas e vincule os grupos do diretório.
3. Importe o repositório privado na Vercel e selecione a raiz do projeto, onde está o `Dockerfile.vercel`. Use o runtime **Container**. Cadastre as variáveis abaixo no ambiente de homologação da Vercel e gere um deploy.
4. No URL HTTPS, valide login, logout, autorização, sincronização entre abas e anexos pequenos e grandes. Confirme que a plataforma mantém as conexões de eventos e aceita os tamanhos de arquivo esperados antes do uso operacional.

| Variáveis | Valor esperado |
| --- | --- |
| `PTW_UNIT` | Código da unidade já cadastrada, como `UN-01` |
| `PTW_DB_HOST`, `PTW_DB_PASSWORD` | Host PostgreSQL e senha do papel da aplicação |
| `PTW_DB_PORT`, `PTW_DB_NAME`, `PTW_DB_USER`, `PTW_DB_POOL` | Opcionais. Padrões `5432`, `ptw`, `ptw_api` e `10` |
| `PTW_DB_LISTEN_PORT`, `PTW_DB_PREPARE`, `PTW_DB_IDLE_SECONDS` | No Preview com pool transacional: porta de sessão para LISTEN (`5432`), prepared statements desligados (`0`) e tempo ocioso do cliente (`5`). Sem configuração, mantêm-se os padrões locais |
| `PTW_DB_CA_PEM` | Certificado da CA do PostgreSQL em PEM quando a CA não faz parte da lista padrão do Node |
| `PTW_S3_URL`, `PTW_S3_KEY`, `PTW_S3_SECRET` | URL HTTPS do endpoint S3 e credenciais do bucket |
| `PTW_S3_REGION` | Região de assinatura do S3. Padrão `us-east-1` |
| `PTW_LDAP_CONFIG_JSON`, `PTW_LDAP_BIND_PASSWORD` | JSON com URL, DN, atributos e grupos conforme o [guia LDAP](ptw-server/OPERACAO.md), e senha da conta de busca em variável separada. A imagem prepara o arquivo de senha |
| `PTW_LDAP_CA_PEM` | CA em PEM quando o certificado LDAP é emitido por uma CA interna |
| `PTW_LOGIN_LIMIT` | Ative com `1` se os limites do aplicativo fizerem parte da política de autenticação |

Para construir localmente, execute `docker build -f Dockerfile.vercel -t ptw-sgi .` na raiz. O contêiner usa `PORT` (padrão 3000). Para testar o login dessa imagem, sirva-o atrás de HTTPS com certificado confiável. A imagem requer os serviços externos e recusa `PTW_DEV_LOGIN=1`.

Para usar Supabase a partir de uma rede IPv4, configure `PTW_DB_HOST` com o host exibido no painel **Connect**, `PTW_DB_USER` com o nome do papel seguido de um ponto e da referência do projeto, e `PTW_DB_NAME` com o nome do banco provisionado. Baixe a CA em **Database Settings → SSL Configuration** e cole o PEM em `PTW_DB_CA_PEM`. Na Vercel, use o **Transaction pooler** nas consultas (`PTW_DB_PORT=6543`, `PTW_DB_PREPARE=0`, `PTW_DB_POOL=1`, `PTW_DB_IDLE_SECONDS=5`) e preserve uma sessão separada apenas para avisos (`PTW_DB_LISTEN_PORT=5432`). O LISTEN é aberto quando o navegador assina os avisos e fechado ao sair o último assinante. Instâncias que servem arquivos estáticos não reservam uma sessão de avisos. Auditoria e expiração continuam ligadas. No Docker local, sem essas opções, mantém-se a conexão normal da porta 5432.

Para homologar sem um diretório externo, configure `PTW_LDAP_MODE=preview` e uma senha de pelo menos 20 caracteres em `PTW_PREVIEW_LOGIN_PASSWORD` como segredo do Preview. Cadastre `marina.costa` na unidade de homologação no banco. A imagem inicia um OpenLDAP de teste em loopback, com TLS, e o login passa pela mesma API usada com LDAP externo. O contêiner recusa esse modo fora do ambiente Preview da Vercel.

Para o fluxo com pessoas distintas, `PTW_PREVIEW_USERS_JSON` pode conter as senhas individuais dos logins fictícios `rafael.nunes` e `paulo.lima`. Cada senha exige pelo menos 20 caracteres e deve diferir das demais, inclusive da senha de Marina. O valor fica somente nos segredos do Preview. Apenas Marina recebe os grupos administrativos; cargos e escopos de assinatura continuam no cadastro. Sem essa variável, o acesso de Marina permanece compatível com a configuração anterior. Ver [spec validada da publicação](fabrica/specs/publicacao-nr10-homologacao.md).

Antes de publicar no Git, confira `git status --short` e revise o primeiro commit. Os segredos, arquivos de ambiente e certificados gerados no laboratório ficam fora do repositório. Configure manutenção, backups e verificação da auditoria no ambiente de operação conforme o [guia](ptw-server/OPERACAO.md).
