# PTW in a Box: o sistema inteiro em Docker

Para instalar o laboratório com LDAP local: `python tools/ptw_instalar.py --local`. Configuração da planta, manutenção, backup e recuperação: [OPERACAO.md](OPERACAO.md).

Na homologação Vercel/Supabase, consultas podem usar pool transacional com uma sessão separada para LISTEN (`PTW_DB_PORT=6543`, `PTW_DB_LISTEN_PORT=5432`, `PTW_DB_PREPARE=0`, `PTW_DB_POOL=1`, `PTW_DB_IDLE_SECONDS=5`). O canal de avisos só existe enquanto houver assinantes; auditoria e expiração permanecem ligadas. Esses ajustes são do Preview e não mudam os padrões do Compose local. Consulte o [guia de publicação](../deploy/releases/2026-11-18-nr10.md).

Quatro contêineres do sistema e dois de monitoramento. A configuração LDAP adiciona um repassador TCP para um único servidor da planta; só ele tem rede de saída. Só o `web` publica portas (HTTPS); API, banco e arquivos ficam em redes internas sem saída para a internet. O app lê e grava no PostgreSQL pela API.

| Serviço | Imagem | Limite | Uso em repouso |
|---|---|---|---|
| `web`: o app (frontend compilado) servido pelo Caddy, HTTPS com CA interna | `ptw-web:local` (Caddy 2.10, 145 MB) | 0,5 CPU · 64 MB | ~16 MB |
| `db`: PostgreSQL 18 | `postgres:18.6-alpine` | 1 CPU · 512 MB | ~60 MB |
| `api`: Fastify, como `ptw_api`, sem porta publicada | `ptw-api:local` (Node 22) | 0,5 CPU · 160 MB | ~43 MiB (10/11) |
| `storage`: SeaweedFS (S3) para fotos, vídeos e arquivos | `chrislusf/seaweedfs:4.50` | 1 CPU · 384 MB | ~80–130 MB |
| `stats`: coletor de recursos (Python, só biblioteca padrão) | `ptw-stats:local` (69 MB) | 0,25 CPU · 48 MB | ~12 MB |
| `stats-docker`: repassador só leitura da API do Docker | `tecnativa/docker-socket-proxy:v0.4.1` (49 MB), com `stats/haproxy.cfg` | 0,25 CPU · 32 MB | ~11 MB |

```sh
sh setup.sh                    # gera os segredos em ./secrets (fora do git), inclusive a chave das âncoras
docker compose up -d --build   # compila o app, sobe tudo; com o volume vazio, cria o banco de db/schema
sh db/reset.sh                 # desenvolvimento: apaga o banco (volume ptw_pgdata) e cria de novo de db/schema
sh test.sh                     # tudo; ou só seções: sh test.sh banco auditoria arquivos app recursos api
```

**Só desenvolvimento, DBeaver:** `docker compose -f compose.yaml -f compose.dbeaver.yaml up -d dbproxy` liga um repassador TCP (socat) em `127.0.0.1:55432` (`PTW_DB_DEV_PORT`) até o banco, que continua sem porta e na rede interna. Desligar: `docker compose -f compose.yaml -f compose.dbeaver.yaml rm -sf dbproxy`. O `db/reset.sh` religa o repassador se ele estava ligado. Nunca use em implantação.

Abra `https://localhost` (ou o nome em `PTW_HOSTS`, ex.: `PTW_HOSTS="ptw.planta.local, 10.0.0.20"`). O certificado vem da CA interna do Caddy, guardada no volume `webdata`. Para os tablets confiarem nele, instale a raiz uma vez: `docker compose cp web:/data/caddy/pki/authorities/local/root.crt .`

**Demonstração com o banco real**

```sh
docker compose up -d db storage
docker compose -f compose.yaml -f api/compose.seed.yaml run --rm --build seed
docker compose -f compose.yaml -f compose.demo.yaml up -d --build
# Abra https://localhost; escolha a pessoa na entrada ou use Trocar pessoa.
docker compose stop
```

A carga é explícita: 10 pessoas, 15 ativos e 3 modelos de exemplo, pelas mesmas regras de escrita da API. Só a criação da unidade usa `ptw_owner`; os registros usam `ptw_api` com `auth=servico`. A segunda execução não altera os cadastros já carregados. Não importa PTs antigas nem desliga gatilhos. O arquivo `api/seed/dados/exemplo.json` é um pacote local de carga, não um cenário executado pelo navegador.

Na demonstração **não há senha**: a pessoa é escolhida e recebe uma sessão real. Trocar de pessoa encerra a sessão anterior e registra a nova na auditoria. Contas desativadas, vencidas ou sem login continuam inelegíveis. A lista pública de nomes e logins (`GET /api/v1/session/dev-people`) e a entrada sem senha só existem com `PTW_DEV_LOGIN=1`, definido por `compose.demo.yaml`; no Compose normal respondem 404. LDAP/AD com TLS e grupos está disponível em configuração separada; laboratório local e instalação em [OPERACAO.md](OPERACAO.md).

**App (`web/`)**
- **Build:** a imagem compila `../ptw-mockup-v2` em dois estágios e roda TypeScript e testes antes de gerar os arquivos. Os testes de modelos recebem o contexto `modelo` com o esquema e o exemplo da skill. Só os arquivos estáticos vão para a imagem final. O produto usa exclusivamente a API; `?cenario=` e `PTW_CENARIO` não escolhem dados no navegador.
- **Cache:** os arquivos `/assets/*` levam cache de um ano, porque têm hash no nome; as páginas são sempre revalidadas.
- **Compressão:** zstd ou gzip.
- **Cabeçalhos:** CSP só do próprio servidor, HSTS, `nosniff`, sem `Server` e sem uso dentro de frames.
- **API:** `/api/*` é repassado ao serviço `api:3000` pela rede interna `apiweb`, sem cache e sem espera para o SSE. O banco é a fonte dos dados; o navegador mantém apenas cache de leitura e a fila de parada, vinculada à pessoa que registrou a ação.
- **Build da API:** compila o TypeScript e resolve os imports do núcleo compartilhado para Node ESM (`scripts/resolve-dist.mjs`). `node api/scripts/sync-shared.mjs --check` confere que a cópia do núcleo de modelos segue o app.

**Recursos (`stats/`, rodapé do app)**
- **O que mostra:** por serviço, RAM usada / limite, CPU usada / limite (em núcleos; o app mostra % do limite), disco (tamanho dos volumes do serviço) e situação (no ar, parado, com falha); no total, a soma, o tamanho das imagens ("Tamanho do sistema"), dos volumes e o livre / total do disco do Docker. Desconhecido é `null` e aparece como "—".
- **Como:** o `stats` lê a API do Docker a cada 5 s (`/containers/json` do projeto, `/containers/<id>/stats` uma vez, inspeção para os limites; `/system/df?type=image&type=volume` a cada minuto, ou 15 s depois de aparecer imagem nova) e grava `status.json` no volume `status`, por troca atômica. O `web` monta esse volume só leitura e serve `/status.json` com `Cache-Control: no-store`; sem o arquivo, responde `{"v":1,"absent":true}` (nunca 404). Formato em `stats/coletor.py`. A CPU é a diferença entre duas leituras: a primeira sai `null`. O disco é o `statvfs` da raiz do contêiner, que fica no disco do Docker (no Docker Desktop, o disco virtual da VM: o total é o máximo dele, não o do Windows).
- **Por que um repassador e não cgroups:** no Docker Desktop (WSL2) os cgroups dos outros contêineres não aparecem dentro de um contêiner sem `cgroupns: host` e a montagem de `/sys/fs/cgroup`, e mesmo assim faltaria saber qual id é qual serviço e o tamanho dos volumes. A API dá tudo isso, com os mesmos números do `docker stats` e do `docker system df`.
- **Segurança:** o socket do Docker equivale a root no host, então só o `stats-docker` o monta (só leitura) e ele, com a configuração própria `stats/haproxy.cfg` no lugar da da imagem, só deixa passar quatro `GET`: `/containers/json`, `/containers/<id>/json`, `/containers/<id>/stats` e `/system/df`. Todo o resto volta 403: `POST` (iniciar, parar, criar, exec), `/info`, `/images`, e também `/containers/<id>/archive`, `/logs` e `/export`, que o modelo da imagem liberaria com `CONTAINERS=1` e que leem arquivos (segredos) e saída de qualquer contêiner. `sh test.sh recursos` confere. Ele roda sem root (65534) com o grupo dono do socket (`PTW_DOCKER_GID`, padrão 0, o do Docker Desktop; num Linux, `getent group docker`), só leitura, sem capacidades, numa rede `docker` interna onde só o `stats` entra: o `web` não o alcança, e nenhum dos dois publica porta nem sai para a internet. **O que se aceita:** a inspeção (`/containers/<id>/json`) mostra a configuração de qualquer contêiner do host, inclusive variáveis de ambiente de outros projetos, e `/system/df` lista imagens e volumes do host; quem tomasse o `stats` leria isso (não muda nada). Os segredos do PTW vêm de arquivos (`/run/secrets`), não de variáveis. O `stats` só publica os campos acima, só dos contêineres do projeto `ptw`. Para não ter nem isso, pare os dois (`docker compose stop stats stats-docker`): o rodapé mostra "indisponível".

A API entra nas redes `interna` e `apiweb` (ambas internas), fala com o banco como `ptw_api` e com o S3 como `ptw_api`. O login `ptw_api` (criado por `db/init.sh`) vem com `search_path = ptw, public` (as extensões `ltree` e `pg_trgm` vivem em `public`), `statement_timeout = 5s` e `lock_timeout = 3s`. As 81 operações estão no contrato `api/openapi.yaml`. Uploads atravessam a API em fluxo; SHA-256 e tamanho são conferidos antes de publicar a chave final. A exportação de auditoria preserva as linhas canônicas do banco e guarda o manifesto exato para download e verificação.

## Modelo de dados (`db/schema`)

**Não há migrações.** O esquema em `db/schema/` é a fonte única: um arquivo por domínio, aplicados em ordem numa transação só, cada tabela com todas as colunas, restrições, chaves compostas e índices na própria definição, e cada função, gatilho e política uma vez, na forma final. Mudou o esquema, o banco é recriado do zero (`sh db/reset.sh`); migrações só passam a existir depois da primeira implantação real. Ao criar, `db/init.sh` grava em `ptw.schema_info` (uma linha, somente inclusão, protegida contra DROP) o SHA-256 de cada arquivo: é o que identifica o esquema em uso. Não há evento na trilha, porque a trilha é por unidade e nenhuma unidade existe na criação.

**O modelo de dados é a referência.** O app (tipos em `ptw-mockup-v2/src`) segue o banco. `db/MODELO.md` resume cada entidade, os estados, as formas JSON do formulário e das respostas, as transições e os códigos `PTWnn`, para alinhar os tipos do app.

| Arquivo | Conteúdo |
|---|---|
| `00_base` | Extensões (`pg_trgm`, `ltree`, `unaccent`), schema, tipos (enums), contexto da transação (`ctx`, unidade e pessoa da sessão), funções de texto, data ISO e formato de código, gatilhos genéricos (revisão, somente inclusão). |
| `10_cadastro` | Unidade, tipos (com ícone), locais (árvore `ltree`), ativos, local do ativo, relações e o fecho de "parte de" (com a recusa de ciclo e de juntar PTs abertas), pessoas, cargos com escopo e validade, elegibilidade, listas. Tipo do sistema (`system_key`, ex.: "parte de") não sai e a chave não muda (`23514`). |
| `20_modelos` | Classes de retenção, modelo, versões (no máximo uma em uso; imutáveis fora do rascunho; com revisão para a edição concorrente do rascunho; origem manual ou sugerida com o pacote e a origem de cada elemento importado), escopo, etapas, assinaturas (um ou mais cargos; com "obrigatória só quando", por opção marcada ou por linha de verificação; no rascunho, sem cargo e sem significado), prazo máximo da janela, separação (chaves compostas: assinatura só na etapa da mesma versão, separação só entre assinaturas da mesma versão), formulário congelado (montado no banco por `frozen_form`, com as opções das listas copiadas) e deduplicado por SHA-256. |
| `30_pt` | PT (com o texto de busca), máquina de estados, número sem lacunas, ativos com a trava de equipamento, equipe, respostas (uma linha por item), arquivos, revisões, assinaturas (elegibilidade e separação), a etapa em curso e os atos de quem está na sessão, um por função: enviar com a assinatura da Solicitação (reenvio abre revisão nova e anula as assinaturas anteriores), assinar com o avanço do estado, devolver, descartar o rascunho, parar, retomar, prorrogar; e expirar. Autoria (solicitante, quem capturou o anexo) é a pessoa da sessão; o rascunho só o solicitante altera. `changed_at`: a última mudança da PT ou de um filho (assinatura, resposta, anexo, ativo, equipe, revisão, prorrogação), para o `updatedSince` da Minha área. |
| `40_formulario` | Estrutura do formulário, resposta conferida contra o item (quem respondeu é a pessoa da sessão; `permit_answer_put` junta as linhas da verificação), etapa em curso da PT expirada ou entregue, bloqueio da assinatura (`permit_blocker`). |
| `50_auditoria` | Trilha somente inclusão, encadeada por SHA-256 e particionada por mês: forma canônica, contexto do ator, evento automático com diff em toda tabela, negações, leituras, sessão, sistema, âncora, exportação, arquivamento, verificação, registro do esquema, visões da tela, proteção contra DDL. |
| `60_acesso` | Unidade pelo código, sessão e idempotência da API (`api_session`, `api_idempotency`), quem move a seguir e Minha área (`permit_next_rows`, `my_permits`), visões do Quadro e da trava, isolamento por unidade (RLS) em toda tabela com `unit_id`, papel `ptw_app` e privilégios mínimos. |

**Decisões de desenho**
- **Chaves:** UUID v7 (ordenado no tempo, bom para índice; gerado no cliente offline sem colisão). Toda tabela tem a chave `(unit_id, id)`: chaves estrangeiras compostas impedem misturar unidades, e o RLS usa o começo do índice.
- **Regra no núcleo da aplicação, garantia no banco:** a tela continua usando `ptw-mockup-v2/src/core`, e o banco recusa sozinho o que não pode acontecer:

| Garantia no banco | Código |
|---|---|
| Registro somente inclusão (formulário congelado, arquivo, revisão, evento, âncora, exportação, registro do esquema); identidade da sessão da API e sessão encerrada não mudam; a chave de idempotência só recebe a resposta, uma vez | `PTW01` |
| Local dentro de si mesmo | `PTW02` |
| Versão em uso ou arquivada não muda | `PTW03` |
| PT nasce rascunho, na versão em uso; ativos só mudam no rascunho ou na PT devolvida | `PTW04` |
| Máquina de estados (não existe ativa → cancelada); número e revisão não voltam; o solicitante não muda; janela da PT emitida em diante só muda por Prorrogar; devolver só em análise; descartar só o rascunho | `PTW05` |
| PT encerrada ou cancelada não aceita resposta; expirada só na Entrega, entregue só nas etapas depois dela (Aceite da área) | `PTW06` |
| Assinatura na revisão atual, na versão da PT | `PTW07` |
| Pessoa não elegível: cadastro inativo ou em revisão, sem login, conta desativada ou vencida, sem o cargo válido para o local (também no item "pessoa" com `mustBeEligible`, onde login não é exigido) | `PTW08` |
| Mesma pessoa nas duas pontas de uma separação | `PTW09` |
| **Equipamento ocupado:** um equipamento só tem uma PT aberta, contando "parte de" em qualquer nível (só PTs de versões que prendem o equipamento, `template_version.holds_equipment`) | `PTW10` |
| Ciclo em "parte de" | `PTW11` |
| Evento de auditoria com hora que não é a do servidor ou que volta em relação ao evento anterior | `PTW12` |
| Trilha protegida: partição, tabela ou gatilho de auditoria não sai por DDL; arquivamento antes do prazo de retenção, sem exportação ou de partição que não é uma faixa contínua de seq | `PTW13` |
| Chamada de auditoria ou da API inválida: contexto (`set_context`), negação, acesso, evento de sessão ou do sistema mal formados; manifesto de exportação que não confere com o SHA-256; idempotência sem sessão ou com chave reservada sem resposta | `PTW14` |
| Formulário ou resposta fora da estrutura (tipo de item, campos, opção, linha, horário, data `AAAA-MM-DD` completa, anexo de outra PT ou repetido, ativo de outra PT, item inexistente) | `PTW15` |
| Assinatura bloqueada pelo que impede a etapa ou pelo que falta responder nela (lista abaixo, em Formulário) | `PTW16` |
| Só o solicitante envia (e reenvia) a PT, assina a Solicitação, descarta o rascunho (com motivo; sem ele, `23514`) e altera o rascunho (campos, ativos, equipe, respostas, anexos; sem pessoa na sessão, só o dono em manutenção) | `PTW17` |
| O solicitante não devolve a própria PT; devolver exige pessoa na sessão | `PTW18` |
| Estado que não aceita assinatura: rascunho/devolvida (envie antes); suspensa sem Retomada e expirada, só a Entrega | `PTW19` |
| Assinatura fora da etapa em curso (`permit_current_stage`), ou assinatura "obrigatória só quando" cuja condição não vale nesta PT | `PTW20` |
| Parada registrada barra o Aceite no campo e o Aceite da área até a Retomada; a PT já parada não é parada de novo | `PTW21` |
| Quem registrou a Retomada não faz o novo Aceite no campo | `PTW22` |
| Aceite no campo fora da janela; depois do fim da janela, só a devolução da área | `PTW23` |
| Parar sem login ativo, ou em nome de outra pessoa | `PTW24` |
| Parar PT que não está em campo (só emitida, ativa, suspensa, entregue) | `PTW25` |
| Retomar sem parada, em nome de outra pessoa ou sem ser elegível para a primeira assinatura da Emissão | `PTW26` |
| Suspensa volta a ativa sem a Retomada e o novo Aceite no campo | `PTW27` |
| Ativar versão com assinatura sem nenhum cargo ou sem significado | `PTW28` |
| Devolver sem ser elegível (com login) para uma assinatura pendente da etapa em curso | `PTW29` |
| A mesma pessoa assina duas vezes a mesma etapa (na mesma revisão) | `PTW30` |
| A janela passa do prazo máximo do modelo (`template_version.max_window`), ao enviar, emitir ou prorrogar | `PTW31` |
| Prorrogar sem ser elegível para a primeira assinatura da Emissão, ou em nome de outra pessoa | `PTW32` |
| Prorrogação sem justificativa (1–500), com fim que não passa do atual, ou fora de emitida/ativa antes do fim da janela | `PTW33` |
| Política elétrica, sequência, turno ou revalidação não atendidos | `PTW34` |

- **Códigos `PTW01`–`PTW34`**: os controles elétricos versionados usam `PTW34`; ato sem motivo é `23514`, PT inexistente num ato é `23503`. Esta tabela, a de `db/MODELO.md` e os códigos que o esquema levanta são conferidos juntos (`db/tests/ptw_codes.sh`, chamado na seção `banco` do `test.sh`, e o mesmo conjunto em `db/tests/invariants.sql`).
- **`permit.changed_at`** (índice `(unit_id, changed_at)`, coluna de `v_permit_board`): avança a cada escrita na PT e em cada filho (gatilho `touch_permit`, depois das regras do filho). A escrita só dela não passa pelas regras da PT, não soma `row_version` e fica fora do diff da trilha, como `updated_at`. A Minha área com `updatedSince` filtra `v_permit_board where id = any(my_permits(...)) and changed_at > $desde`.
- **Quem age é a pessoa da sessão:** os atos sobre a PT (`PTW17`, `PTW18`, `PTW24`, `PTW26`) comparam com `ptw.current_person()`, que vem de `set_context`; o solicitante da PT, quem respondeu e quem capturou o anexo são preenchidos pelo banco com ela (o que o cliente mandar é ignorado). **Um ato, uma função** (`permit_submit`, `permit_sign`, `permit_return`, `permit_discard`, `permit_stop`, `permit_resume`, `permit_extend`, `permit_answer_put`; tabela em `db/MODELO.md`): a API não monta o `UPDATE` nem decide o estado. `permit_sign` inclui a assinatura e, se a etapa fechou, avança o estado como `stateAfterSign` do app (a mesma tabela de casos está em `db/tests/invariants.sql`). **A Retomada anula o aceite:** retomar uma PT suspensa anula as assinaturas do Aceite no campo da revisão atual (motivo "Retomada: novo Aceite no campo exigido", evento `pt.assinatura.anulada`). Parar = `hold_*` preenchido (em ativa, junto com `state = 'suspensa'`); Retomar = `hold_*` limpo e `resumed_*` preenchido, numa escrita.
- **Trava de equipamento sem corrida:** um índice único parcial cobre o mesmo ativo. Pai e filho são conferidos pelo fecho de "parte de", com as linhas de ativo travadas em ordem; duas transações simultâneas na gaveta e no painel se enfileiram, e a segunda é recusada (`db/tests/concurrency.sh`).
- **Arquivos:** o conteúdo vai para o S3 com a chave `<unidade>/<aa>/<sha256>`, e o banco guarda só os metadados (`blob`, `attachment`). Um mesmo arquivo é gravado uma vez só. A miniatura da foto e a capa do vídeo são geradas no aparelho, ao capturar, e gravadas como outro blob (`preview_sha256`), sem serviço de imagem no servidor.

## Auditoria

Uma trilha só (`ptw.audit_event`), por unidade, somente inclusão, encadeada por SHA-256 e particionada por mês. Guarda toda mudança, toda tentativa negada, toda leitura sensível e os eventos do sistema. É também o Histórico da PT (`v_permit_history`, sem as leituras) e a fonte do aviso em tempo real (`NOTIFY ptw`).

**O que entra, e quem grava**

| Família | Ação (exemplos) | Quem grava |
|---|---|---|
| Cadastro: unidade, tipos, locais, ativos, local do ativo, relações, pessoas, contas, cargos e validade, listas e itens | `cadastro.ativo.criado/alterado/removido`, `cadastro.conta.alterada`, `cadastro.cargo.concedido/alterado/revogado` | gatilho no banco |
| Modelos: modelo, versão, escopo, etapas, assinaturas, separação, ativação | `modelo.versao.ativada`, `modelo.versao.arquivada`, `modelo.etapa.alterada` | gatilho no banco |
| Importação de modelo: pacote, documentos de origem, ferramenta e modelo de IA, idioma, totais | `modelo.importado` | **API**, `ptw.audit_import` (obrigatório: versão sugerida sem ele é recusada no commit, `PTW14`) |
| Desfazer: a escrita inversa como evento próprio | `<ação>.desfeito` (ex.: `cadastro.ativo.alterado.desfeito`), texto "Desfazer: …", motivo "Desfazer" | gatilho no banco, com `set_context(…, p_undo => true)` |
| PT: campos, estado, parada e retomada, ativos, equipe, respostas, anexos, revisões, assinaturas | `pt.criada`, `pt.alterada`, `pt.estado`, `pt.parada`, `pt.retomada`, `pt.resposta`, `pt.anexo.incluido`, `pt.revisao`, `pt.assinatura(.anulada)` | gatilho no banco |
| Tentativa negada (`ok = false`) | a ação tentada, com o código (`PTW08`…) | **API**, `ptw.audit_denied` |
| Leitura sensível | `acesso.pt.aberta`, `acesso.anexo.visto/baixado`, `acesso.exportacao`, `acesso.auditoria.busca/evento` | **API**, `ptw.audit_access` |
| Sessão e conta | `sessao.entrada` (ok ou falha), `sessao.saida`, `sessao.expirada`, `conta.bloqueada/desbloqueada`, `conta.credencial.alterada` | **API**, `ptw.audit_log` |
| Sistema (ator nulo = sistema) | `sistema.servidor.iniciado/parado`, `sistema.relogio.desvio`, `sistema.backup.feito`, `sistema.restauracao.feita` | **API** ou scripts, `ptw.audit_system` / `tools/ptw_sistema.py` |
| Sistema, automático | `sistema.ddl` (todo DDL, inclusive GRANT/REVOKE), `sistema.particao.criada/arquivada`, `sistema.retencao.alterada`, `sistema.ancora.gravada`, `sistema.verificacao` (resultado), `sistema.teste.executado` | banco e scripts deste diretório |

- **Diff compacto:** `data = {"de": {…}, "para": {…}}` só com as colunas que mudaram (inclusão: só `para`; remoção: só `de`). Colunas derivadas (busca, caminho, `holds`, contadores, datas de controle) ficam fora. Nada mudou, nada é gravado. O formulário e a origem da importação de uma versão entram como `{"sha256": …}` (o do formulário é o mesmo de `form_snapshot`), não o JSON inteiro.
- **Ator e contexto:** cada evento guarda pessoa, cargo com que agiu, método de autenticação (`senha`, `ldap`, `pin`, `sessao`, `emergencia`, `servico`, `sistema`), aparelho, id da requisição e motivo, todos dentro do hash. Vêm de `ptw.set_context(...)`, válido só na transação. Assinatura: o ator é quem assinou.
- **A API não grava direto** na tabela (sem INSERT), só pelas funções; lê pela visão `v_audit` (com nome da pessoa, cargo, número da PT, código do ativo) e não altera nada. Índices para a tela: período, pessoa, prefixo de ação, PT, ativo e só negados; leituras (`acesso.*`) num índice separado, fora do Histórico.

**Obrigações da API**

Implementadas nesta fase: contexto por transação, sessão de demonstração, idempotência, recusas, acessos, importação, histórico e eventos de início/parada/desvio de relógio. Os testes de integração usam PostgreSQL e S3 reais. LDAP/AD, bloqueio por tentativas (desligado por padrão; `PTW_LOGIN_LIMIT=1` liga) e expiração absoluta/por inatividade também estão implementados; senhas não são armazenadas no PTW.

0. Resolver a unidade (`ptw.unit_by_code(PTW_UNIT)`), guardar a sessão em `ptw.api_session` (só o SHA-256 do cookie) e a `Idempotency-Key` em `ptw.api_idempotency` (`idempotency_begin` / `idempotency_finish`, na mesma transação da escrita). Usar as funções dos atos, uma PT por transação; assinar por `ptw.permit_sign` (o banco recusa assinatura em nome de outra pessoa).
1. Abrir **toda** transação com `select ptw.set_context(unidade, pessoa, cargo, autenticação, aparelho, id_da_requisição, motivo)`; num "Desfazer", acrescentar `p_undo => true` (a escrita inversa sai como `<ação>.desfeito`).
2. **Negação:** um `PTWnn` desfaz a transação inteira, inclusive o que ela gravaria na trilha (o Postgres não tem transação autônoma). Ao pegar o erro, abrir **outra** transação, repetir `set_context` e chamar `ptw.audit_denied(ação_tentada, código, mensagem, pt, dados)`. Vale também para negações da própria API (401 de sessão, 403 de papel): código de 5 caracteres, ex. `PTA01`.
3. Chamar `ptw.audit_access` ao abrir uma PT (**toda** abertura é um evento; não há janela de agrupamento), ver ou baixar anexo (antes de entregar o arquivo), exportar (motivo obrigatório; `audit_export_record` com o texto do manifesto, que fica guardado em `audit_export.manifest` e conferido contra o SHA-256) e buscar ou abrir evento na tela de auditoria.
4. Importar modelo numa transação só: versão sugerida (com `import_source`), etapas, assinaturas, listas e tipos novos, e por fim `ptw.audit_import(versão, {"listas", "tipos", "cargos"} criados)`.
5. Chamar `ptw.audit_log` na entrada (sucesso e falha), saída, expiração de sessão, bloqueio e desbloqueio de conta e troca de credencial; `ptw.audit_system` ao iniciar e parar e ao detectar desvio de relógio.
6. Mostrar o Histórico por `v_permit_history` e a tela de auditoria por `v_audit`.

**Forma canônica v2** (a mesma no banco e em `tools/ptw_verifica.py`, conferida byte a byte no `test.sh`)
- `hash = SHA-256( prev_hash (32 bytes) ‖ UTF-8( JSON canônico ) )`; o primeiro `prev_hash` é 32 zeros.
- Chaves do evento: `action actor asset at auth client data entity entity_id ok permit reason request rev role seq text unit v` (`v = 2`; `at` = microssegundos desde 1970 UTC, inteiro; uuid em minúsculas; ausente = `null`).
- Objeto: `{"chave": valor, …}` com `", "` e `": "`; chaves ordenadas pelo **tamanho em bytes UTF-8** e, no empate, byte a byte. Lista: `[a, b]`. Vazios: `{}` e `[]`.
- Texto: escapa só `\" \\ \b \f \n \r \t` e `\u00XX` (hexa minúsculo) para os demais abaixo de 0x20; o resto vai literal em UTF-8 (acentos, emoji).
- Número: notação decimal simples, sem expoente, com as casas gravadas (`1.50` fica `1.50`, `1e2` fica `100`, `-0.0` fica `0.0`).
- É exatamente a saída do tipo `jsonb` do PostgreSQL (9.4 a 18), por isso o banco calcula sem custo. Se uma atualização do Postgres mudar esse formato, o teste de concordância falha antes de qualquer evento novo.

**Hora e seq andam juntos.** A hora do evento é tomada depois de travar a ponta da unidade (`clock_timestamp()`, nunca antes do evento anterior), não no início da transação: assim a ordem do seq é a ordem da hora, e cada partição mensal guarda uma faixa contínua de seq. A verificação segue o seq em todas as partições; o arquivamento recusa (`PTW13`) partição que não seja a faixa seguinte ao último marcador.

**Âncora fora do host.** Quem tem o arquivo do banco pode reescrever a cadeia inteira e recalcular todos os hashes (o teste faz isso: `audit_verify` passa). Por isso, uma vez por dia, `tools/ptw_ancora.py` verifica a cadeia, lê a ponta de cada unidade e grava `{unidade, dia, seq, hash, chave}` assinado com HMAC-SHA256 numa pasta **fora do host** (`DESTINO/<unidade>/<AAAA-MM>.jsonl`). A chave fica em `secrets/audit_anchor_key`, não é montada em nenhum contêiner e nenhum papel do banco a lê. O verificador compara a cadeia com as âncoras e acusa a reescrita.

**Retenção.** Classes em `ptw.retention_class` (mínimo 5 anos, garantido por CHECK); o modelo de PT aponta a sua (`template.retention_class`). Uma partição mensal mistura classes, então a trilha guarda pelo **maior** prazo. Nenhuma partição, tabela ou gatilho da trilha sai por DDL (event triggers `audit_ddl_end`, `audit_sql_drop`, ativos também em modo réplica). A única saída é `ptw.audit_archive(partição, motivo)`: só depois do prazo, só a mais antiga, só se uma exportação registrada cobrir todos os eventos dela; deixa na trilha, por unidade, o marcador com faixa de seq, hash final e SHA-256 do manifesto, e a verificação continua dali. Remoção legal é esse evento governado, nunca um DELETE.

| Classe | Prazo | Base |
|---|---|---|
| `pet` | 5 anos | NR-33 §33.5.10 (PET arquivada por cinco anos) |
| `pt` | 5 anos | mínimo do produto; NR-10 e NR-35 não fixam prazo |
| `cadastro` | 5 anos | mínimo do produto (cadastro, modelos, acessos, sistema) |

**Limites.** O superusuário do Postgres ainda pode desligar os event triggers e os gatilhos (o teste simula isso); comandos de papel (`CREATE/ALTER ROLE`) não passam por event trigger; `session_replication_role = replica` (só superusuário) pula os gatilhos de diff, que é como o `bench.sql` carrega volume. Esses casos não somem: a âncora fora do host e o verificador pegam o que foi mudado na trilha.

## Operação da auditoria

```sh
# Âncora diária: verifica, ancora fora do host e registra (sai com 1 se a cadeia tiver problema).
python3 tools/ptw_ancora.py --destino /mnt/ptw-ancoras
# Exportação (JSONL + manifesto + verificador): fica registrada na trilha com o motivo.
python3 tools/ptw_exporta.py --unidade UN-01 --de 2026-11-01 --ate 2026-12-01 --motivo "Pedido da fiscalização" --destino /mnt/export
# Verificação em qualquer máquina com Python 3.8+, sem Postgres:
python3 ptw_verifica.py ptw-auditoria-UN-01-1-5321.manifesto.json --ancoras /mnt/ptw-ancoras --chave audit_anchor_key
# Evento do sistema pelos scripts de operação (backup, restauração):
python3 tools/ptw_sistema.py sistema.backup.feito "Backup das 14h" --dados '{"arquivo": "ptw-1400.dump"}'
```

Agenda do host (cron; no Windows, Agendador de Tarefas com os mesmos comandos):

```cron
# Diário: partições do mês atual e dos 3 seguintes
10 0 * * *  cd /opt/ptw-server && docker compose exec -T db psql -U ptw_owner -d ptw -c "select ptw.audit_maintenance()"
# Diário: âncora fora do host
20 0 * * *  cd /opt/ptw-server && python3 tools/ptw_ancora.py --destino /mnt/ptw-ancoras
# A cada minuto (agendador da API, quando existir): expirar PTs vencidas
# select ptw.expire_due(<unidade>)
```

O verificador sai com 0 (íntegra) ou 1 e mostra o `seq` exato: conteúdo alterado, elo quebrado, lacuna, linha fora da forma canônica, arquivo diferente do manifesto, âncora com assinatura inválida ou que não confere ("a trilha foi reescrita"). Guarde a chave das âncoras também com quem audita: sem ela o verificador ainda compara os hashes, mas nenhuma âncora conta como conferida. Com `--chave`, âncora de **outra** chave é ignorada (qualquer um forja uma) e avisada; `--exigir-ancora` exige `--chave` e falha se nenhuma âncora assinada com ela cobrir a faixa.

## Formulário

O formulário da versão é JSON (`{"sections": [{"id", "title", "stageId"?, "items": [Item]}]}`, chaves em camelCase); cada resposta é uma linha em `permit_answer` com `value` na forma do tipo do item (`"t"` = `kind` do item). O banco confere a estrutura do formulário ao gravar a versão e ao congelar na PT, e cada resposta contra o item do formulário da PT (o congelado, ou o da versão no rascunho). Completude (item obrigatório sem resposta, justificativa que falta) fica no app. Todos os tipos e formas estão em `db/MODELO.md`; os que pedem mais cuidado:

| Item | Campos | Resposta (`permit_answer.value`) |
|---|---|---|
| `verificacao` | `answers`, `lines[{id, label, blockOn[], noteOn[]}]` | `{"t":"verificacao","lines":{<linha>:{"a","note"?}}}` |
| `anexo` | `accept`, `min`, `hint` | `{"t":"anexo","files":[<id de anexo desta PT>]}`; nome, tipo e arquivo ficam em `attachment` |
| `documento` | `pattern?` (`#` dígito, `A` letra, o resto literal: `APR-####`), `attach`, `validity` | `{"t":"documento","code":…,"files":[<id de anexo>],"validUntil":"AAAA-MM-DD"?}` |
| `data` | `notBeforeToday`, `min?`, `max?` (`AAAA-MM-DD`) | `{"t":"data","v":"AAAA-MM-DD"}` (completa; o banco recusa data incompleta ou inexistente) |
| `pessoa` | `multiple`, `roleId?` (filtro de cargo), `mustBeEligible` | `{"t":"pessoa","ids":[<pessoa>…]}` |
| `isolamento` | `minRows` | `{"t":"isolamento","rows":[{"id","point","assetId"?,"energy"?,"method","lock","zero"?:"sim"\|"nao","by"?}]}`; `assetId` é um ativo da PT; `energy` ∈ eletrica, mecanica, hidraulica, pneumatica, termica, quimica, gravitacional, outra |
| `grupo` | `columns` (texto, numero, horario, marcacao, verificacao; sem `showWhen`), `minRows` | `{"t":"grupo","rows":[{"id","answers":{<coluna>: <resposta da coluna>}}]}` |

- **Completude (`PTW16`, `ptw.permit_missing`)**: a etapa só é assinada com o obrigatório e visível das seções dela respondido (seção sem etapa conta para a primeira etapa; itens de outras etapas não contam; item oculto por "Mostrar quando" e item opcional não faltam). Falta: texto, número, data, horário, marcação, pessoa vazios; anexo abaixo do mínimo; documento sem código, arquivo ou validade exigidos; linha de verificação sem resposta ou sem a justificativa de `noteOn`; isolamento e grupo abaixo das linhas mínimas ou com ponto/coluna incompleto. Mensagem: `Assinatura bloqueada: Falta responder: <rótulo>`. Só vale na primeira assinatura da etapa na revisão (as demais já passaram por ela); Parar, Devolver e a entrega não assinam, e a Entrega confere só as seções da própria etapa.
- **Bloqueio da assinatura (`PTW16`, `ptw.permit_blocker`)**, nas seções da etapa e das anteriores, item oculto pela condição não conta: número fora da faixa; linha de verificação respondida num valor de `blockOn`; documento vencido; data antes de hoje (`notBeforeToday`) ou fora de `min`/`max`; pessoa não elegível com `mustBeEligible` (cadastro, conta ou cargo, avaliados na hora da assinatura); ponto de isolamento com `zero = "nao"`; tudo isso também dentro de grupo. Mais, do documento: código fora do formato, arquivo ou validade que faltam. As mensagens mostram datas como `dd/mm/aaaa`.
- A leitura real fica gravada: valor fora da faixa, documento vencido e código fora do formato **são aceitos ao gravar**.
- Pessoa com `mustBeEligible`: ao gravar, já recusa quem não é elegível (`PTW08`): cadastro ativo, conta ativa se tiver login (login não é exigido: vigia pode ser contato) e, com `roleId`, o cargo válido hoje e com escopo no local da PT.
- **PT em andamento:** encerrada e cancelada não aceitam resposta (`PTW06`). A área sempre é devolvida: expirada (ou suspensa sem retomada) aceita resposta só nas seções da etapa Entrega; entregue, só nas etapas depois da Entrega (Aceite da área). Daí Entrega → entregue → Aceite da área → encerrada, e o equipamento solta.
- **Reenvio** (PT devolvida): abre a revisão seguinte (`permit_revision`, com o SHA-256 do conteúdo), anula as assinaturas das revisões anteriores (ficam no histórico) e mantém o formulário congelado no primeiro envio.
- **Opções que impedem e respostas de uma lista:** opção de marcação com `blocks` (ou item da lista em `blockOptionIds`) impede a etapa como a verificação em `blockOn`; a verificação com `answers = "lista"` responde com itens da lista `answerListId` (a ativação confere as listas, `PTW15`).
- **Assinatura por vários cargos:** `sign_slot.role_ids[]`; elegível com qualquer um (`person_ineligible_any`); ativar exige ao menos um (`PTW28`).
- **Prazo e prorrogação da janela:** `template_version.max_window` (`PTW31`); `ptw.permit_extend` grava `permit_extension` e registra `pt.prorrogada` (`PTW32`, `PTW33`); fora disso a janela da PT emitida em diante não muda (`PTW05`).
- Assinatura "obrigatória só quando": `sign_slot.required_when_item` + `required_when_values` (opção marcada) e, opcional, `required_when_line` (a linha da verificação respondida num dos valores); a ativação confere o item e a linha. `ptw.slot_required(assinatura, respostas)` diz se ela conta para fechar a etapa.
- Rascunho: assinatura pode ficar sem cargo e sem significado (a importação não achou); ativar exige os dois (`PTW28`).
- Versão: `origin` (`manual` ou `sugerida`), `source_sha256` (pacote importado) e `import_source` (origem de cada elemento: página, trecho literal, rótulo original; documentos, ferramenta, modelo de IA, idioma), os dois obrigatórios quando sugerida. Forma em `db/MODELO.md`. Cargo pode ser criado sem ninguém.

## Velocidade medida

Num contêiner de 512 MB, com 20 mil ativos, 100 mil PTs (10 mil abertas) e 300 mil eventos (`db/tests/bench.sql`). A primeira coluna é a medição anterior; a segunda, a do esquema único (2026-11-09, três rodadas, host mais carregado: outros projetos em Docker no ar).

| Operação | Antes | Esquema único |
|---|---|---|
| Quadro: 50 PTs ativas mais recentes, com local, modelo e ativos | 4–7 ms | 5–6 ms |
| Quadro: a página com quem move a seguir e a vez da pessoa (`permit_next_rows` nos 50 ids; 2026-11-10) | | 33–45 ms na conexão quente (≈ 90 ms na primeira chamada da conexão) |
| Quadro: busca por trecho do escopo (`permit.search`, trigram), 50 primeiras com quem move a seguir | | ≈ 80 ms na primeira chamada |
| Detalhe: `permit_next` de uma PT | | 3 ms (≈ 18 ms nas 6 primeiras chamadas da conexão: plano) |
| Minha área: `my_permits` de quem só está em equipes | | 5 ms |
| Minha área: `my_permits` no pior caso sintético (a pessoa tem assinatura a dar nas 10 mil PTs abertas) | | 1,0–1,2 s |
| Minha área: PTs abertas onde a pessoa está na equipe | 11–13 ms | 9–25 ms (cache frio) |
| Histórico de uma PT (sem as leituras `acesso.*`) | ~1 ms | 1–2 ms |
| Tela de auditoria: negados do último dia | 0,4 ms | 0,3–0,5 ms |
| Busca de ativo por trecho do nome (trigram) | 4–8 ms | 6–15 ms |
| Enviar uma PT, com a trava conferida | 22–34 ms | 27–34 ms |
| Gravar 300 mil eventos encadeados (gatilho real, 7 índices) | 19,5–21 s | 25,6–31,5 s |
| 1000 leituras registradas (`acesso.pt.aberta`) | 0,36 s | 0,41–0,47 s |
| Alterar 11 mil ativos numa transação, evento com diff por linha | 6,5 s | 6,9–7,4 s |
| Recalcular o hash de 300 mil eventos | 3,5–4,5 s | 2,9–3,7 s |

O tempo de planejamento das consultas com visão (10–30 ms) some com consultas preparadas na API. Uma gravação isolada pela API custa ~0,3 ms a mais pela trilha; uma carga em massa (CSV) pelos gatilhos, ~0,6 ms por linha. O host do teste é compartilhado: as faixas mostram a variação entre rodadas. Em VM (Docker Desktop) o relógio às vezes recua alguns milissegundos; o INSERT direto do `bench.sql` é então recusado (`PTW12`, como deve) e o lote é refeito. Pela API isso não acontece: `audit_emit` acompanha a hora da cadeia.

## Segurança

- **Permissões administrativas:** os grupos LDAP configurados concedem `cadastro`, `modelos`, `auditoria` e `exportacao`. A sessão guarda o resultado e a API recusa operações sem grant (`PTA03`). Leituras necessárias para a PT continuam disponíveis; os atos de segurança seguem os cargos do banco. O modo sem senha de desenvolvimento concede os quatro grants.
- **Assinatura é da pessoa da sessão:** o gatilho da assinatura recusa (`42501`) qualquer linha com `person_id` diferente de `ptw.current_person()`, venha de onde vier no papel da API; só o superusuário (manutenção) grava sem isso.
- **Cancelar depois do envio** não é ato da API (D3): a máquina de estados ainda aceita em análise / devolvida / emitida → cancelada por `UPDATE` direto, sem regra de quem pode. A API não expõe isso; a regra (quem, motivo, código) fica para decisão própria.
- **Banco começa do zero e limpo** (D6): `db/init.sh` cria só o esquema (e as classes de retenção); nenhuma unidade, pessoa ou PT é carregada sozinha. A semente de desenvolvimento é um comando à parte.

- **Contêineres:**
  - nenhum roda como root (no Caddy, a capacidade de abrir portas baixas foi removida: ele escuta em 8080/8443);
  - o sistema de arquivos é só leitura (`read_only`), com `cap_drop: ALL` e `no-new-privileges`;
  - há limite de CPU, memória e processos.
- **Rede:** a rede `interna` não tem rota para fora; só o `web` publica portas (443 e 80, que redireciona). A rede `docker` (também interna) liga só o `stats` ao repassador da API do Docker (ver Recursos).
- **Banco:**
  - senhas SCRAM e checksums de página;
  - a API usa um login sem privilégio de administração, com `statement_timeout` de 5 s;
  - a API não apaga PT, assinatura, arquivo nem auditoria (sem permissão de DELETE), não grava direto na trilha, não lê a ponta da cadeia e só vê a unidade da sessão (RLS).
- **Arquivos:**
  - o conteúdo fica cifrado no disco (`-filer.encryptVolumeData`); conferido, o texto não aparece nos arquivos do volume;
  - a credencial da API só lê, grava e lista no bucket `ptw-arquivos`, sem criar nem apagar buckets;
  - o S3 não é exposto: o navegador envia e baixa pela API, que confere o SHA-256 e registra o acesso (`acesso.anexo.baixado`).
- **Segredos:** os do banco e do S3 ficam legíveis para os contêineres; a chave das âncoras (`audit_anchor_key`, 0600) fica só no host. No Windows o NTFS ignora o `chmod`: restrinja a pasta `secrets` pelas permissões da pasta.

## Configuração na planta e limites atuais

- **Configuração da planta:** preencher servidor/CA/base/grupos LDAP e validar a integração na rede real. O laboratório local já permite testar o fluxo sem AD.
- **Operação:** scripts de manutenção, âncora diária, backup assinado e restauração isolada estão em [OPERACAO.md](OPERACAO.md). Instalar o agendamento e definir os destinos externos no host da planta.
- **`tools/ptw_exporta.py`** ainda não passa o texto do manifesto a `audit_export_record` (grava o arquivo no host); a API passa.
- **Backups e âncoras:** o destino externo e a guarda da chave dependem da instalação; testes no mesmo computador não substituem essa cópia externa.
- **Bloqueio de exclusão no S3:** a credencial de gravação do SeaweedFS também apaga. A imutabilidade dos arquivos vem das chaves pelo conteúdo, da API e dos backups, não de um bloqueio no S3.
- **Superusuário na criação:** o esquema marca `enum_eq` como LEAKPROOF (`60_acesso`) e cria event triggers (`50_auditoria`), o que exige superusuário (o dono, `ptw_owner`). Com isso o índice do Quadro funciona sob RLS: medi 25 ms sem e 0,2 ms com.


### Controles elétricos e comparação NR-10

O formulário pode conter `electrical`, política opcional congelada na versão e no primeiro envio. `vigente2019` conserva o procedimento da redação vigente; `preparacao2027` antecipa a redação com vigência em 01/06/2027. A seleção é explícita, sem troca automática por nome ou data. As PTs históricas conservam sua versão.

Os dois modelos exigem classificação, procedimento/revisão aprovado, análise de riscos, relação de envolvidos e autorizações anexadas com validade, avaliação no local e sequências de desenergização/reenergização. As verificações de sequência são itens separados; o banco recusa um passo quando os anteriores não foram confirmados. Reenergização pertence ao Aceite da área, após a Entrega. Fotos e declarações não comprovam por si mesmas a segurança física; engenharia/SST deve aprovar o procedimento real e suas exceções técnicas.

Em 2027, a janela e qualquer prorrogação devem caber nas datas e horas do turno, no fuso da unidade. `POST /permits/{id}/revalidations` exige If-Match, aceita Idempotency-Key e registra um novo turno/limite da atividade em `permit_revalidation`, somente inclusão, com RLS e auditoria. Apenas a pessoa que assinou a Emissão, ainda elegível, revalida. Verifica equipe atual, documentos e declarações de condições/equipe preservadas e avaliação local. A PT fica suspensa, com o aceite anterior anulado; outra pessoa deve aceitar novamente no campo. Mudança de equipe ou condições exige nova PT neste procedimento interno. Prorrogar continua limitado ao mesmo turno.

Validar com `sh check.sh`, `node --test ptw-server/tools/actemium-electrical.test.mjs` e `sh ptw-server/test.sh banco api`. Os scripts `node tools/actemium-local.mjs` e `node tools/actemium-local.mjs --base-vigente` criam versões e ciclos fictícios novos sem reescrever as PTs encerradas; dependem do servidor atualizado. Não recrie o banco com dados existentes sem backup verificado e planejamento da atualização local.
