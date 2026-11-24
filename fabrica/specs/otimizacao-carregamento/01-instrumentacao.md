# PERF-01 — instrumentação e baseline

Estado: **validada pelo responsável em 18/11/2026 (“execute a task 1”); implementação local em validação**. Prioridade P0. Dependências: nenhuma. As demais specs continuam propostas.

## Problema

Os logs atuais mostram a duração total da API, mas não separam aquisição de conexão, autenticação, execução SQL, rede e espera na carga inicial. Uma única medição de navegador não permite concluir p95 de uma tela.

## Escopo e contrato proposto

1. Correlacionar navegação/requisição com o `requestId` existente, endpoint normalizado, código HTTP e instância/deploy. Usar identificador efêmero de instância sem dados de pessoa.
2. Medir no cliente: clique Entrar → Minha área útil; reload → Minha área útil; navegação → dados úteis; número de chamadas, bytes e falhas por etapa. Separar sessão ausente, primeira carga e instância aquecida.
3. Medir na API: autenticação, transações, consultas, contagem de instruções e duração total. Nomear exatamente o que é observado: o tempo até o callback de `begin` inclui BEGIN e eventual espera/rede; não chamá-lo de fila pura sem medição suportada pelo driver.
4. Registrar início/prontidão/parada da instância e tempos de provisionamento de Preview. Preservar a trilha de auditoria; métricas operacionais não substituem eventos auditados.
5. Produzir relatório por endpoint e cenário com tamanho da amostra, mediana, p95 e máximo, sempre identificado por commit/deploy/região/configuração.
6. Usar logs estruturados e ferramentas existentes. Nenhum serviço de observabilidade pago faz parte desta task.

## Privacidade e limites

Não registrar senha, bind LDAP, cookie/token/CSRF, cabeçalhos de bypass/OIDC, parâmetros SQL, corpos de resposta/formulário ou nomes de pessoas. Não criar labels por UUID de PT/ativo que gerem cardinalidade ilimitada. Não habilitar logs detalhados globais do PostgreSQL nem resetar estatísticas compartilhadas.

Implementação deve documentar ativação, volume/retencão e amostragem. Testes de redaction são obrigatórios. Cronômetros sem suporte a separar execução de rede devem permanecer identificados como tempo composto.

## Critérios de aceite

- AC01: uma navegação pode ser correlacionada às chamadas, sem expor dados sensíveis.
- AC02: coleta reproduzível de pelo menos 20 observações por cenário aquecido para uma e quatro sessões, reportando a amostra e o método de percentil; primeira carga separada. Respeitar limites de login existentes e evitar carga artificial contínua.
- AC03: custo da instrumentação medido com ativação/desativação; meta proposta ≤ 5% de aumento na mediana, sem atraso artificial nas escritas.
- AC04: relatório identifica lacunas que ainda impedem atribuir tempo a rede, fila ou CPU. Não inventar decomposição.
- AC05: baseline local e hospedada separadas, com dados equivalentes; nunca comparar números entre ambientes como prova de ganho.

## Testes e evidências

Testes de temporização em sucesso/erro, identificação da operação e ocultação de segredos. Ensaio de navegação com Chrome, mesmas larguras/dados/configuração antes e depois. Verificar erros e auditoria. Artefatos sanitizados ficam fora do repositório; metodologia e resumo podem ser versionados.

## Reversão e fora de escopo

Reverter a instrumentação/ativação preserva o comportamento funcional e a auditoria. Esta task não altera pools, regiões, consultas ou sequência de telas.

## Decisões para refinamento

Validar metas globais e o orçamento de instrumentação; confirmar quais timings o driver expõe e a política de coleta. Se precisar de novo campo/header público, registrar o contrato antes de implementar.

## Contrato de implementação desta etapa

- Instrumentação da API desligada por padrão; `PTW_PERF=1` habilita taxa uniforme `PTW_PERF_SAMPLE_RATE`, padrão 10%. No ensaio curto, 100% é permitido. Nenhuma mudança de endpoint/header ou de autorização.
- ALS isola métricas por requisição. Consultas explícitas são contadas/temporizadas sem ler SQL/argumentos; tempo de await é composto e não representa execução SQL pura. BEGIN/COMMIT e tarefas de fundo fora de requisição têm limites documentados.
- Coleta cliente opt-in por `sessionStorage`, sem persistir dados de negócio. Request IDs existentes correlacionam navegador/API; nenhum ID de navegação é inserido no contrato HTTP.
- Lifecycle do launcher e API usa identidade efêmera compartilhada no Preview; “processo do proxy iniciado” não é uma comprovação de prontidão do proxy/dependências.
- Logs novos passam por projeção de campos, não por cópia de request/erro. Logs antigos continuam privados. Ativação, retenção, contagens/limites e reversão estão no [manual](../../../ptw-server/tools/performance/README.md).
- O coletor separa a primeira carga observada de 20 observações aquecidas por cenário/concorrência. Não força cold start nem usa espera fixa como medida de tela útil.

## Evidência e pendências

- Testes locais de sucesso/erro, query lazy, contexto concorrente, autenticação/revogação e projeção de dados sensíveis implementados. Checks/builds locais aprovados durante a execução; estado final consolidado no relatório da task.
- Ensaio isolado com PostgreSQL/PGlite e Fastify.inject: seis rodadas alternadas desligado/10%/100%/100%/10%/desligado, 100 leituras por concorrência/rodada; custo abaixo da meta de 5% na mediana nessa amostra e auditoria sem inconsistências. Não prova o custo de Docker/LDAP/TCP/Preview.
- Baseline do Preview atual em coleta, com commit remoto explicitamente identificado; a instrumentação local não foi publicada.
- A conta do agente recebeu acesso negado ao Docker; também não pôde inicializar PostgreSQL nativo por restrição de token do Windows. Um ativador local revisável foi preparado e a execução solicitada ao responsável. Não recriar a instalação nem contornar permissões.
- AC02/AC05 e aceite completo de AC03 continuam pendentes até a coleta local representativa e a comparação de custo local completa. Não marcar PERF-01 concluída apenas pelo microbenchmark.
