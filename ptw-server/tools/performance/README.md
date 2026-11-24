# PERF-01 — medir sem alterar regras

Instrumentação opt-in, independente das otimizações PERF-02 a PERF-07. Não altera consultas, pools, regiões, autenticação ou sequência de carregamento. O estado da task e seu aceite ficam em `fabrica/specs/otimizacao-carregamento/01-instrumentacao.md`.

## Ativação

API: `PTW_PERF=1`. Amostragem: `PTW_PERF_SAMPLE_RATE=0.1` por padrão (10% das requisições, uniforme e aleatória); para uma coleta curta, usar `1`. Desligar removendo `PTW_PERF` ou usando `0`. Configuração inválida de taxa é recusada. A amostragem não elimina eventos da auditoria.

No navegador: `sessionStorage.setItem('ptw.performance', '1')` e recarregar. Remover a chave e recarregar para desativar. O coletor faz isso automaticamente por `--client-metrics 1`; não há UI ou chamada a serviço externo. Eventos sanitizados são emitidos em `ptw:performance`. O coletor associa esses eventos às etapas da navegação e aos request IDs já existentes.

### Docker local já instalado

Execute na conta com acesso ao Docker:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "CAMINHO_DO_PROJETO\ptw-server\tools\performance\ativar-local.ps1"
```

O script exige a composição atual em `COMPOSE_FILE` do ambiente/`.env`; mantém seus overrides, banco selecionado e volumes. Cria override externo em `../outputs/perf01`, constrói API/web antes de substituir e usa `up --no-deps`. Não muda os serviços db/storage. Durante a troca de API/web pode haver interrupção breve; não executar durante backup.

Desativar: mesmo comando com `-Desativar`. A alteração não é gravada na configuração padrão da instalação. Um futuro Compose que não inclua o override pode recriar a API sem instrumentação.

## O que é medido

| Campo/evento | Significado |
|---|---|
| `ptw.performance.request` | Uma resposta amostrada; operação do contrato, request ID, status e instância/deploy |
| `totalMs` | Tempo entre hook inicial e finish/close da resposta; em SSE é duração do stream e deve ser separado |
| `authMs` | Autenticação da requisição, incluindo suas transações/viagens; não inclui todo o custo do bind/login LDAP dentro da rota |
| `transactions`, `transactionFailures` | Tentativas de transação explícitas da aplicação, inclusive repetição/falha |
| `beginToCallbackMs` | Início de `begin` até entrada do callback, ou falha antes dele; inclui espera, rede e BEGIN, não é fila pura |
| `transactionMs` | Duração das transações, incluindo contexto, queries e commit/rollback |
| `queries`, `queryFailures` | Instruções explícitas observadas por await, incluindo `set_context`; não conta automaticamente BEGIN/COMMIT, descoberta de tipos do driver ou LISTEN |
| `queryRoundtripMs` | Soma do tempo observado de await das queries; inclui driver/rede/parse e espera. Não é execução SQL pura |
| `ptw.performance.lifecycle` | API criada, ouvindo e fechada; prontidão HTTP não comprova saúde de todas as dependências |
| `ptw.performance.startup` | Marcos cumulativos do launcher de Preview: preparação de diretório, health da API e processo do proxy iniciado |
| Span `bootstrap` / `restore` / `login` | Fluxo da camada de dados; o coletor mede também a tela útil no navegador |
| Cliente `bodyBytes` | Bytes UTF-8 do corpo textual lido; não equivale a bytes comprimidos transferidos |

As durações se sobrepõem: **não somar** auth, transações e queries para obter o total. Trabalho de fundo fora de requisição não é atribuído a uma pessoa. Depois de fechar a resposta, timers derivados não continuam somando na métrica dela. A contagem de queries observa as formas atuais `tx\`...\`` e `tx.unsafe`; novos modos de streaming/cursor/savepoint precisam de teste e cobertura explícita antes de usar o número como inventário completo.

## Privacidade, volume e retenção

Nenhum registro novo inclui SQL, argumentos, corpo, query string, nome, senha, cookie, token, CSRF, bind LDAP, cabeçalhos de bypass/OIDC ou UUID de PT como label. Operações fora do contrato aparecem como `unmatched`. Request IDs não UUID são representados por SHA-256 nos registros novos; a resposta/contrato existente não muda. Metadados de deploy têm tamanho/formato limitados. Identidade de instância é aleatória e efêmera.

Por requisição amostrada, um registro pequeno de performance; lifecycle/startup são por instância e não seguem a taxa. Não habilitar debug global de SQL ou HTTP para coletar estas métricas. Os logs preexistentes de aplicação não passam a ser seguros só porque este coletor é sanitizado: arquivos brutos continuam privados.

Logs locais continuam sujeitos à rotação configurada do Docker (10 MB × 3 arquivos por serviço). A retenção hospedada é a do plano; consultar apenas a janela disponível e anotar lacunas. Não alterar retenção/custos nesta task. Guardar relatórios fora do Git; manter arquivos brutos apenas durante o ensaio e removê-los após extrair/verificar evidência sanitizada, conforme a política local. A auditoria tem retenção própria e nunca deve ser apagada por essa limpeza.

## Coleta reproduzível

Usar Chrome e indicar uma instalação já disponível do Playwright; o script não instala dependências. Credenciais entram por arquivo privado de ambiente, nunca por argumento de linha de comando. Definir `PTW_PERF_USERS_JSON` como array de objetos `{login,password}` com as três contas fictícias. Preview também aceita os nomes de variáveis privadas já usados pelo provisionamento; bypass só é enviado à URL conhecida do Preview.

```text
node ptw-server/tools/performance/collect-browser.mjs --base https://localhost --environment local --env-file CAMINHO_PRIVADO.env --output CAMINHO_FORA_DO_REPO/baseline-local.json --playwright-entry CAMINHO_PLAYWRIGHT/index.mjs --samples 20 --concurrency 1,4 --client-metrics 1
```

Para Preview, usar `--environment preview --base https://ptw-git-ptw-sgi-hc-4634.vercel.app --commit SHA_DO_DEPLOY`. A cópia local pode ter alterações ainda não publicadas: declarar o SHA remoto corretamente e não atribuir a ele a instrumentação local. A coleta normal não publica nada. TLS não é ignorado; no local a CA precisa estar confiada ao Chrome.

Cada worker faz uma rodada inicial separada e depois são distribuídas 20 observações aquecidas por cenário/concorrência. “Primeira observada” não é prova de cold start do Container. Cenários: login até Minha área útil, reload, primeira visita a Modelos/Ativos/Quadro por recarga. Relatório separa falhas, mediana, máximo e p95 pelo método nearest-rank (`ceil(0.95*n)`). Quatro sessões usam os três perfis, com Marina repetida. Nunca imprimir o mapa de credenciais.

O coletor aguarda heading, fim de carregamento e fim das chamadas críticas em andamento, excluindo SSE/status/health. Ele não prova que todas as linhas estão corretas: a equivalência funcional das PTs e auditoria exige os testes existentes. Capturas com status de erro não são sucesso de desempenho. Rate limit não é desligado: se estiver ativo, use `--pause-ms` compatível com o limite ou interrompa e registre amostra insuficiente; não insistir em bloqueios.

Extrair logs locais em arquivo privado e sanitizar:

```text
node ptw-server/tools/performance/collect-logs.mjs --input LOG_PRIVADO.txt --output RELATORIO_SANITIZADO.json
node --test ptw-server/tools/performance/stats.test.mjs deploy/performance.test.mjs
```

Correlacionar `requestId` do navegador com o registro da API. Reportar explicitamente quando amostragem ou retenção não fornecerem o par. Não inventar timings faltantes. Não somar métricas de ambientes, datasets ou modos de login distintos como se fossem comparáveis.

## Ensaio de custo

Alternar configuração desligada/10%/100%/100%/10%/desligada, com o mesmo binário/dados/caminho de log e aquecimento. Medir uma e quatro sessões e custo cliente ligado/desligado separadamente. Meta proposta: aumento de mediana ≤ 5%; resultado negativo pode ser ruído, não ganho causado pela instrumentação. Microbenchmark com PGlite/Fastify.inject valida mecanismo e custo isolado; não substitui Docker/TCP/TLS/LDAP nem o ensaio hospedado.

Reverter significa desativar a coleta e, se necessário, voltar ao código anterior; não exige modificar banco ou apagar eventos.
