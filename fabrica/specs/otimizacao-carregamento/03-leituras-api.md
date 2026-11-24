# PERF-03 — menos viagens ao banco nas leituras

Estado: **proposta, aguardando validação**. Prioridade P0. Dependência: PERF-01.

## Problema

Cada chamada protegida consulta sessão/conta e depois abre contexto para a rota. A montagem de modelos faz várias instruções sequenciais, apesar do tempo baixo de execução SQL. A distância entre API e banco amplifica esse custo.

## Escopo e contrato proposto

1. Inventariar instruções e viagens por `/templates`, `/permits/mine`, listagens e `/session`, antes de escolher a otimização.
2. Consolidar leituras compatíveis da montagem de modelos em SQL parametrizado/agrupado, mantendo paginação, ordenação, conteúdo, escopos, assinaturas e separações. Não trocar por uma consulta por item.
3. Investigar consolidação da leitura de sessão e situação da conta, mantendo checagem atual em toda requisição protegida. Não manter cache de permissão para economizar consulta.
4. Preservar `withContext`, RLS e transações. Não transferir contexto para estado de conexão de sessão, incompatível com pool transacional. Não reutilizar uma transação de requisição entre identidades.
5. Nesta proposta, não fundir genericamente a transação de autenticação com a escrita da rota: isso pode desfazer a auditoria/expiração de uma recusa. Qualquer mudança dessa fronteira exige aditivo com análise de atomicidade.
6. Evitar paralelismo indiscriminado de consultas na mesma transação ou aumento do pool como substituto da redução de viagens.

## Critérios de aceite

- AC01: snapshots/asserções de contrato mostram equivalência dos modelos completos e omitidos, paginação e filtros, inclusive modelo sem versões e versões arquivadas.
- AC02: número de instruções sequenciais de montagem de modelos cai ao menos 40% frente à baseline de PERF-01, meta proposta; não aumenta proporcionalmente à quantidade de itens.
- AC03: conta desativada/vencida, sessão encerrada e pessoa de outra unidade continuam recusadas em todas as rotas cobertas.
- AC04: recusas auditáveis e transações com falha mantêm os registros previstos; falha não grava parcialmente o ato.
- AC05: medir aquisição/transações e SQL separadamente quando possível; comparar p50/p95 de endpoints representativos sob uma/quatro sessões. Meta global proposta de leituras: p95 ≤ 800 ms após o conjunto de otimizações, não exigida isoladamente desta task.

## Testes e evidências

Testes de contrato e banco real com RLS ativo, usando o papel da API. Fixtures de uma e várias versões, assinaturas condicionais, escopos e histórico. Testar dois usuários/unidades sem vazamento; logout/revogação entre requisições. Comparar contagem de instruções e planos antes/depois. Rodar checks locais e invariantes SQL se funções/esquema forem alterados.

## Áreas previstas

`ptw-server/api/src/repo/templates/read.ts`, `session/auth.ts`, `session/person.ts`, `session/store.ts`, `db.ts` e respectivos testes. OpenAPI só muda se necessário e após refinamento; acelerar a implementação interna preservando contrato é a preferência.

## Reversão e fora de escopo

Reverter a leitura consolidada mantendo estrutura/dados originais. Novas funções de leitura, se necessárias, devem ser compatíveis com o deploy anterior e ter aplicação hospedada segura definida antes da publicação. Nenhum reset hospedado é permitido. Não modificar regras de assinatura ou bypass de RLS.

## Decisões para refinamento

Confirmar quais consultas serão consolidadas e o mecanismo de compatibilidade. A escolha depende das medições; registrar a contagem de viagens esperada antes de implementar.
