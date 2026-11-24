# Validação do primeiro lote SGI Forces / PTW-SGI

23/11/2026. Escopo SGI-01/02 autorizado pelo responsável: uma aplicação com Operação/Administração, visual SGI Forces e telas operacionais existentes. Implementado localmente; SGI-14 e publicação permanecem pendentes.

## Implementação

- Identidade padrão azul-violeta, fundo claro, cards e tabelas com bordas suaves. Tema da planta, fontes empacotadas e cores de estado preservados.
- Áreas derivadas da rota e grants existentes. Sem grant administrativo, consultas já disponíveis ficam na Operação; Auditoria mantém bloqueio no menu e na rota. Nenhuma autorização nova no servidor.
- Sidebar desktop e drawer abaixo de 1024 px; navegação fecha o drawer, Escape funciona inclusive com tooltip focado, foco retorna ao botão e permanece contido enquanto aberto.
- Minha área resume o mesmo cache do quadro pessoal, com atalhos e contagens reais. Nenhum pedido extra de métricas. No celular, resumo compacto em uma linha. Quadro, cadastros, prévia de rascunho e painéis de detalhe recebem a moldura.
- Login conserva autenticação e modos anunciados pelo servidor. Nova PT conserva o formulário/atos atuais; o novo assistente funcional é SGI-03.

## Evidências locais

Evidências fora do Git: `../outputs/sgi-merge-2026-11-23/`, relativo à raiz do projeto.

| Verificação | Resultado |
|---|---|
| `sh check.sh` | Frontend 403 testes; API 151; deploy 7; tipos/lint/cópia do núcleo aprovados. API mantém 38 testes de integração não executados por falta do ambiente externo exigido |
| Build Vite | Aprovado |
| SQL canônico isolado | 599 verificações aprovadas em PostgreSQL 18.6 via PGlite; sem modificar o banco da instalação |
| Comparação de telas | 12 telas × 4 larguras × 2 versões = 96 verificações; login também capturado nas quatro larguras. Zero erros JS e zero overflow do documento |
| Navegação e persistência | Troca de áreas, drawer em 390/768, Escape/retorno de foco, criação real de rascunho pela UI, recarga, impeditivas mantidas e logout aprovados |
| Tema/teclado | Tema personalizado aplicado; marca, fundo e tinta conferidos; paleta semântica preservada; 15 passos de Tab contidos no drawer e Escape aprovado |
| Consultas antes/depois | Mesma jornada com uma sessão: 26/26 leituras; quatro sessões: 104/104. Sem aumento de chamadas ao backend neste ensaio |

As contagens foram conferidas contra o quadro real: os rascunhos incompletos entram em Aguardando, com as respectivas impeditivas, conforme a regra existente. A nova apresentação não anuncia uma ação liberada por haver um rascunho.

O baseline foi servido a partir dos arquivos de UI do HEAD local, sem alterar o checkout, com o mesmo servidor e dataset SQL do depois. Tempos desse laboratório Vite/PGlite não são baseline de capacidade do Docker/Vercel nem demonstram resolução da lentidão hospedada. PERF-01 continua com seu aceite próprio pendente.

## Falha preexistente encontrada

`GET /audit/facets` devolve 500 por autor com nome nulo na fixture; reproduzido antes e depois. Diagnóstico: `response/actors/3/name: must be string`. Registrado na SGI-15, proposta para validar separadamente. Por isso a tela de Auditoria teve revisão de layout/erro, mas não recebe aceite funcional completo. Os 401 de restauração sem sessão na entrada são esperados.

## Limites e próximo gate

O Docker não estava acessível à conta do agente: configuração negada e pipe do mecanismo ausente. Não foi substituído nem reinicializado o ambiente do responsável. O laboratório isolado usa o esquema e a API reais com entrada de desenvolvimento explicitamente habilitada; não comprova LDAP/TLS, S3, LISTEN real, backup/restauração nem os dois ciclos completos no Docker.

Antes da publicação: ativar somente o frontend na composição atual, validar login LDAP, os dois modelos vigente/preparação 2027, três identidades, assinatura/impeditivas, anexos reais, parada/retomada, revalidação e auditoria. Nenhum reset, DDL, push ou deploy foi realizado por esta integração. O trabalho prévio de desempenho e o script manual do responsável foram preservados.

Atualizador preparado fora do Git: `../outputs/sgi-merge-2026-11-23/atualizar-interface.ps1`. Identifica COMPOSE_FILE existente, preserva a imagem anterior, constrói/recria apenas web, sem dependências. Reversão com o mesmo script e `-Reverter`; valida sintaxe PowerShell, mas a execução precisa do Docker acessível.


## Atualização após ativação pelo responsável — 23/11/2026

O responsável executou o atualizador e apresentou web saudável. Verificação HTTPS com a CA local explícita, sem desativar TLS, confirmou HTML/JavaScript/CSS HTTP 200 e SHA-256 dos assets idêntico ao build local. O nome antigo da tag da imagem não indica conteúdo antigo.

A primeira consulta de sessão retornou 503. Inspeção pelo Docker Desktop mostrou somente api/web em execução; db, storage, ldap-test, ldap-gateway, stats-docker e stats estavam parados. Foram iniciados os mesmos contêineres existentes pela interface, sem recriação/reset/alteração de volumes. Os oito serviços da composição passaram a estar em execução; o grupo é a nona linha exibida no Docker Desktop. Após iniciar as dependências, sessão anônima retornou 401, como esperado.

Validação via API HTTPS real: login LDAP de Marina, Rafael e Paulo HTTP 200, restauração da sessão 200, logout 204 e rejeição da sessão encerrada 401. Marina recebeu os quatro grants administrativos; Rafael/Paulo continuaram sem grants e receberam 403/PTA03 na Auditoria. Locais, ativos, modelos e PTs responderam 200 nos três perfis. O filtro da Auditoria respondeu 200 para Marina no banco Docker atual; a falha SGI-15 continua limitada à fixture com autor nulo e não foi reproduzida nesse banco.

Evidências: `verificacao-docker-publico.json` e `verificacao-login-docker.json`, em outputs/sgi-merge-2026-11-23. Essa verificação não substitui os dois ciclos completos de PT, anexos/S3 e E2E de navegador no Docker, que continuam pendentes. Nenhuma publicação no Git/Vercel.
