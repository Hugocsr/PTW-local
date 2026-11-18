# PTW in a Box — guia para agentes

Sistema de Permissão de Trabalho (PT) para uma planta, rodando localmente, sem nuvem. O app usa a API Fastify (`ptw-server/api`), PostgreSQL e SeaweedFS. Cadastros, modelos, PTs, anexos e auditoria são persistidos no servidor. Login LDAP/AD configurável com TLS, permissões por grupos, bloqueio de tentativas e expiração por inatividade. `ptw-server/OPERACAO.md` orienta instalação, laboratório local, manutenção, backup e restauração. A entrada sem senha continua exclusiva de `PTW_DEV_LOGIN=1`; não habilitar na planta.

**Antes de mexer no código, leia `CONVENCOES.md`** (onde cada coisa mora, camadas, receitas) e termine com `sh check.sh` sem nenhum erro.

## Mapa do repositório

| Pasta / arquivo | O que é | Pode editar? |
|---|---|---|
| `README.md` | Apresentação para quem chega: o que o sistema faz, como rodar, onde está cada coisa. | Sim; mantenha os comandos iguais aos reais. |
| `PRODUCT.md` | Produto: usuários, propósito, princípios. | Sim, quando o produto mudar. |
| `CONVENCOES.md` | **Convenções do código**: camadas, tamanho, receitas, o que conferir. O lint confere as camadas. | Sim, junto com `eslint.config.js`. |
| `check.sh` | Confere app e API sem Docker (tipos, lint, testes, cópia do núcleo). | Sim. |
| `DESIGN.md` | **Fonte única de UI**: cores (inclusive cor de estado), tipografia, layout, componentes, o que fazer e evitar. | Sim; mantenha-o igual ao código. |
| `ptw-mockup-v2/` | O app (React + Vite + shadcn), ligado à API. O nome da pasta é histórico: não é protótipo. Dados em memória ficam só nos testes. Ver `ptw-mockup-v2/AGENTS.md`. | Sim. |
| `ptw-server/` | O sistema inteiro em Docker: app (Caddy, HTTPS), PostgreSQL 18 (modelo de dados completo, regras na raiz) e SeaweedFS (S3) para fotos, vídeos e arquivos. Ver `ptw-server/AGENTS.md` e `README.md`. | Sim; rode `sh ptw-server/test.sh` depois. |
| `ptw-research/` | Pesquisa, especificações e capturas de concorrentes. Referência. Inclui `ai-form-mapping-research-2026-11-08.md`, `ai-differentiators-research-2026-11-08.md` e `form-samples/` (38 formulários reais, com `manifest.csv`; licenças variam: uso interno, não distribuir). | **Não** edite, salvo pedido explícito. |
| `ptw-mockup-v2/src/demo/` | Dados de teste em memória, fora do produto: `exemplo`, `celulose` (fábrica de celulose, com o modelo de intertravamento) e `carga` (~20 mil ativos e 100 mil PTs). O navegador nunca os carrega. | Sim, com os testes da pasta. |
| `clientes/` | Material de clientes (formulários, pacotes `ptw.modelo/1`, tema com logotipo). Fora do git; uso interno. | Só quando a tarefa for sobre o cliente. |
| `ptw-server/tema/`, `tema-exemplos/`, `tema.sh` | A aparência da planta servida em `/tema/` (o conteúdo ativo fica fora do git), um tema de exemplo e o comando que troca. | Sim. |
| `nr-mapper/` | Projeto separado (mapeador de NRs, Python). Tem o próprio `AGENTS.md`. | Só quando a tarefa for sobre ele. |
| `.impeccable/` | Configuração da skill impeccable (`config.json`, `design.json`). | Só via impeccable. |
| `.claude/skills/ptw-modelo-de-formulario/` | Skill que lê o formulário de PT da planta (PDF, foto, Word, Excel; qualquer idioma) e gera o pacote `ptw.modelo/1` (esquema e exemplo junto). | Sim, junto com `core/templatePackage.ts`. |
| `.claude/` (resto) | Skills impeccable e shadcn. | Não. |

## Regras de produto (decididas; não reabrir)

- **Estado da PT**: rascunho, em análise, devolvida, emitida, ativa, suspensa, entregue, encerrada, cancelada, expirada. "Não verificável" não é estado: só aparece quando o servidor não confirma.
- **Painel "Desabilitados agora"** (`core/bypass.ts`): PTs abertas de versões que não prendem o equipamento, em três grupos (desabilitado agora, a reabilitar, aguardando aprovação). Lê as respostas pela lista (`GET /permits?answers=true`), sem abrir cada PT.
- **"Trabalho liberado"** só aparece no bloco de estado da PT (`EstadoAutorizacao`) e só quando a regra do núcleo (`workRelease`) diz que o trabalho está liberado agora.
- **Um equipamento, uma PT aberta.** Ninguém abre uma PT em equipamento que já tem PT aberta (qualquer estado exceto rascunho, encerrada, cancelada), incluindo ativos ligados por "parte de", em qualquer profundidade. Barrado no núcleo (`core/equipmentLock.ts`), no envio e na loja de dados. Não existe "conflito" manual. Exceção por versão do modelo: **"Prende o equipamento"** (`holds_equipment` / `holdsEquipment`, padrão ligado; congelado na versão ativa). Desligado (ex.: desabilitação de intertravamento), a PT nem prende o equipamento nem é barrada por outra PT aberta nele; duas PTs de versões que prendem continuam colidindo. Pacote: `modelo.prende_equipamento`.
- **A área sempre pode ser devolvida.** PT expirada, ou suspensa sem Retomada (serviço abandonado), aceita só a Entrega → entregue; depois o Aceite da área → encerrada, o que libera o equipamento. Expirada não é estado final.
- **Servidor fora do ar** trava tudo que salva (inclusive respostas do formulário), em todas as telas, e a loja de dados recusa; **Parar** continua disponível e é registrado com a mudança de estado.
- **A loja valida toda transição** (`core/permitActs.ts`, com `canMove`); o que for recusado não muda nada e fica na auditoria como negado. A trava do equipamento também vale no cadastro: relação "é parte de" (inclusive "Desfazer") que juntaria duas PTs abertas é recusada na loja.
- **Devolver, Assinar e Retomar** concluem com o botão; não se pede login de novo.
- **Assinatura "obrigatória só quando"** cuja condição não vale com as respostas da PT não é pedida nessa PT: não é oferecida (`pickSlot`) e é recusada no núcleo e no banco (`PTW20`).
- **Prorrogar** (a janela da PT): só quem pode emitir a PT (mesma regra de Retomar), com a PT emitida ou ativa e a janela ainda aberta; novo fim depois do atual + justificativa (até 500); respeita o prazo máximo do modelo contado do início original. Um evento `pt.prorrogada` é o registro. Núcleo: `core/extension.ts` (`PTW31`–`PTW33`).
- **Prazo máximo da janela** é por versão do modelo (`maxWindowHours`; nulo = sem limite), conferido ao enviar, ao emitir e ao prorrogar (`PTW31`, `core/windowLimit.ts`).
- **Sem aviso de simulação** na interface ("Simulação · não autoriza trabalho" foi removido).
- **Remover**: o que tem conteúdo pede confirmação; item solto sai na hora com "Desfazer".
- **Vocabulário**: Estado (só PT) / Situação (registros e versões), Devolver, Pessoa indicada, Elegível / não elegível, Remover.
- Endereços inválidos são normalizados; trocar de aba não cria entrada no histórico; "Voltar" nunca sai do app.

## Controles elétricos versionados (2026-11-18)

- `FormSpec.electrical` congela a base normativa, referências documentais, sequências e limites de turno. Base vigente e preparação 2027 são modelos independentes; PT encerrada nunca é reescrita.
- A janela de 2027 cabe no turno explícito, inclusive Prorrogar (`PTW34`). Revalidar é ato próprio, pelo emitente original ainda elegível, com documentos/equipe válidos e confirmações de avaliação local e condições preservadas. Registra autoria/turno/justificativa/hash da equipe, invalida o aceite anterior e aguarda novo aceite por outra pessoa. Alterações exigem nova PT neste processo interno.
- Procedimentos reais e exceções precisam de revisão/aprovação da engenharia/SST. Os modelos Actemium e seus anexos de teste são fictícios. O sistema registra evidências e impede transições; não comprova a condição física do equipamento.

## Auditoria (decidida; não reabrir)

- **Tudo é registrado** numa cadeia única encadeada por SHA-256: toda escrita (PT, cadastro, configuração) com antes/depois só do que mudou, cada "Desfazer" como evento próprio, tentativas negadas, acessos (PT aberta, anexo, exportação (sempre com motivo), busca na Auditoria), sessão (login/logout, troca de pessoa simulada) e sistema (queda/volta do servidor, relógio, migrações, backup).
- O histórico da PT lê da mesma trilha; não há segundo registro.
- A forma canônica do hash é **uma só, a v2 do banco** (README do servidor; `core/audit.ts` no app; `ptw-server/tools/ptw_verifica.py`): `SHA-256(prev 32 bytes ‖ UTF-8(JSON canônico))`, chaves por tamanho em bytes e depois byte a byte, `", "`/`": "`, número sem expoente, `at` em µs. Os vetores de `core/audit.test.ts` vêm do próprio verificador; a exportação do app (JSONL + manifesto `ptw-auditoria/2`) passa nele como `ÍNTEGRA`.
- O evento guarda o que o banco guarda: `data = {"de", "para"}` com nomes de coluna e valores crus (só o que mudou); nomes e frases para pessoas são montados na leitura (`eventChanges`, `auditValueText`). Recusas usam o código do banco (`core/ptwErrors.ts`, hoje `PTW01`–`PTW34`).
- **Desfazer** é a escrita inversa marcada: ação `<ação>.desfeito`, texto `Desfazer: …`, motivo `Desfazer` (no banco, `set_context(..., p_undo => true)`; no app, `runAsUndo`).
- Nada apaga auditoria; a retenção mínima é 5 anos (PET pela NR-33). Um resumo diário assinado (âncora) vai para fora do servidor.

## Modelos de PT e importação (decidida; não reabrir)

- O sistema se adapta ao formulário da planta: se o papel tem, o app representa. Tipos de item: Texto, Marcação, Verificação, Número (unidade, casas, faixa), Horário, Data, Documento, Pessoa, Pontos de isolamento, Grupo repetível, Aviso, Foto/vídeo/arquivo; assinatura pode ser obrigatória só quando uma condição vale.
- Opção de marcação pode **impedir a etapa** (como "Não" numa verificação); a verificação pode ter as **respostas de uma lista** (ex.: "SIM / N.A."); uma assinatura pode aceitar **vários cargos** (qualquer um assina). Pacote: opção `impede`, `respostas: "lista"` + `lista_respostas`, `cargo` texto ou lista, `modelo.prazo_maximo_horas`, `modelo.prende_equipamento` (ausente = verdadeiro).
- **A IA fica fora do app.** A skill `ptw-modelo-de-formulario` gera o pacote `ptw.modelo/1`; o app só recebe o arquivo ("Importar modelo"). O app nunca depende de internet nem de IA.
- Cada elemento do pacote cita a origem (página + trecho literal); rótulo sem trecho que o sustente é erro ("item inventado"). Formulário em outro idioma: rótulo em pt-BR, original guardado ao lado.
- **Nada é criado antes da lista completa** do que será criado e da confirmação com os totais. Com erro, nada é criado. Cargo, lista ou tipo desconhecido é criado como novo e aparece marcado na lista.
- A importação cria só uma versão em **rascunho** marcada "Sugerida pela importação"; uma pessoa revisa e ativa. Validação: `scripts/validar-modelo.ts` (mesmas regras do app).
- IA no produto em geral: só sugere, cita a fonte e nunca assina, muda estado de PT, responde item de segurança ou diz "pode começar".

## Regras de UI (resumo; detalhe em `DESIGN.md`)

- Moldura de 72rem **encostada à esquerda**; nada centralizado.
- Quatro modelos de tela: Lista, Lista‑detalhe, Registro (abas + painel lateral a partir de `xl`), Trabalho do dia.
- Uma ação preenchida (preta) por região; cor é para estado, não para botão (vermelho só em Parar e remover).
- Cor de estado: verde concluído · azul pendente/sua vez · âmbar atenção · vermelho falhou/bloqueado/parado · cinza aguardando/sem destaque. Nunca só cor: sempre ícone ou palavra.
- Celular: uma coluna, alvos ≥ 44 px abaixo de `md`. Computador: colunas quando o conteúdo é paralelo.
- Conferir toda mudança de UI em **390, 768, 1024 e 1440 px**: sem rolagem horizontal, sem erro no console.
- **Imprimir**: a PT sai como formulário de papel próprio (`work/PermitSheet.tsx`), preenchida ou em branco, nunca como retrato da tela. Detalhe em `DESIGN.md`.
- **Tema da planta**: nome, logotipo, símbolo, três cores e fonte trocáveis por `ptw-server/tema/tema.json`, sem reconstruir (`core/brand.ts`). As cores de estado não entram no tema. Detalhe em `DESIGN.md`.

## Servidor (decidido em 2026-11-08)

- App (Caddy) + PostgreSQL 18 + SeaweedFS em Docker Compose, só o app publica porta; contêineres sem root, só leitura, com limite de recursos e rede interna sem saída. Substitui a recomendação de SQLite da pesquisa.
- **Não há migrações:** estamos em desenvolvimento. O esquema em `ptw-server/db/schema/` (um arquivo por domínio, cada objeto definido uma vez) é a fonte única; mudou, recrie o banco do zero (`sh ptw-server/db/reset.sh`). Não proponha nem escreva migrações. Toda regra nova de segurança entra no esquema com teste em `db/tests/invariants.sql`.
- Erros de regra usam a classe `PTWnn` (tabela no README do servidor); a API traduz para a mensagem da tela.
- Arquivos: chave = SHA-256 do conteúdo; o S3 nunca é exposto ao navegador.
- O que só a API poderá registrar (negadas, leituras, sessões, liga/desliga, relógio) está no README do servidor como obrigação dela; as funções já existem no banco.
- **Recursos no rodapé** (2026-11-09): o serviço `stats` lê a API do Docker por um repassador só leitura (`stats-docker`, único com o socket, rede própria interna, sem porta) e grava `/status.json`, que o `web` serve; o app mostra RAM, CPU e disco usados / máximos por serviço e no total.
- Módulos/add-ons e notificações: adiados (não implementar sem pedido).
- **Banco real e demonstração (2026-11-10):** o app não seleciona cenários em memória. `compose.demo.yaml` habilita troca de pessoa sem senha; não cria senhas compartilhadas nem afrouxa elegibilidade. A carga explícita (`api/compose.seed.yaml`) grava cadastros e modelos no banco, sem PTs históricas e sem desativar gatilhos. O Compose normal não faz carga nem habilita essa entrada.

## Como trabalhar aqui

- Português do Brasil em toda a interface e documentação de produto.
- **O modelo de dados ganha.** O esquema do banco (`ptw-server/db/schema/`, resumo em `ptw-server/db/MODELO.md`) é a referência: nomes, formatos, estados e regras. Os tipos e o núcleo do app seguem o banco; divergência se resolve mudando o app.
- Regras de negócio vão no núcleo puro (`ptw-mockup-v2/src/core`) com teste; a tela só mostra.
- Não faça commit sem pedido ou autorização na tarefa. Este fork usa `github.com/Hugocsr/PTW-local`; a origem de negócio é `joaoCarvalho1000/ptw-in-a-box`. Preparações de entrega usam branch local própria. O Preview Vercel `ptw` usa a branch `ptw-sgi`; `main` está configurada como Production. Conferir `deploy/releases/2026-11-18-nr10.md` antes de publicar. Segredos (`ptw-server/secrets/`), material de clientes (`clientes/`) e o tema ativo (`ptw-server/tema/`) nunca entram.
