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

## Ambiente integrado

O frontend normal usa a API do PTW. O servidor, o PostgreSQL e o armazenamento de arquivos estão em `ptw-server`. Consulte o [guia de operação](ptw-server/OPERACAO.md) para subir o laboratório com Docker. Os dados do laboratório são separados do cenário em memória.

Para conferir o frontend, rode `npm.cmd run check` e `npm.cmd run build` em `ptw-mockup-v2`.

## Imagem única e implantação na Vercel

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
| `PTW_S3_URL`, `PTW_S3_KEY`, `PTW_S3_SECRET` | URL HTTPS do endpoint S3 e credenciais do bucket |
| `PTW_S3_REGION` | Região de assinatura do S3. Padrão `us-east-1` |
| `PTW_LDAP_CONFIG_JSON`, `PTW_LDAP_BIND_PASSWORD` | JSON com URL, DN, atributos e grupos conforme o [guia LDAP](ptw-server/OPERACAO.md), e senha da conta de busca em variável separada. A imagem prepara o arquivo de senha |
| `PTW_LDAP_CA_PEM` | CA em PEM quando o certificado LDAP é emitido por uma CA interna |
| `PTW_LOGIN_LIMIT` | Ative com `1` se os limites do aplicativo fizerem parte da política de autenticação |

Para construir localmente, execute `docker build -f Dockerfile.vercel -t ptw-sgi .` na raiz. O contêiner usa `PORT` (padrão 3000). Para testar o login dessa imagem, sirva-o atrás de HTTPS com certificado confiável. A imagem requer os serviços externos e recusa `PTW_DEV_LOGIN=1`.

Antes de publicar no Git, confira `git status --short` e revise o primeiro commit. Os segredos, arquivos de ambiente e certificados gerados no laboratório ficam fora do repositório. Configure manutenção, backups e verificação da auditoria no ambiente de operação conforme o [guia](ptw-server/OPERACAO.md).
