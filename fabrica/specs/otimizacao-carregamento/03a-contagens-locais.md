# PERF-03A — contagem de ativos por página de locais

Estado: **autorizada e implementada localmente** em 24/11/2026. Publicação e aceite integrado pendentes. Prioridade P0. Recorte independente de PERF-03, apoiado no [diagnóstico](09-diagnostico-e2e-sgi.md). [Resultados e limites](10-validacao-local.md).

## Resultado esperado

Abrir Locais sem uma busca de ativos para cada linha. A tabela mantém sua aparência, filtros, ordenação e paginação; a coluna Ativos apresenta o mesmo total de hoje. Carregamento e erro continuam explícitos, sem converter falha em zero.

## Contrato proposto

Adicionar `GET /api/v1/locations/asset-counts`, autenticado e com `Cache-Control: no-store`. Parâmetro obrigatório `locationIds`, array UUID serializado como parâmetros repetidos, de 1 a 100 elementos únicos. O cliente ordena os IDs para compartilhar requisições equivalentes. Parâmetro inválido, vazio ou acima do limite recebe 400. Definir primeiro no OpenAPI e regenerar os tipos.

Resposta 200: `{"items":[{"locationId":"<uuid>","count":0}]}`. Uma entrada por ID solicitado, na ordem solicitada; count inteiro não negativo. Qualquer ID inexistente ou de outra unidade resulta em 404 genérico para o lote inteiro, sem revelar a unidade ou existência externa. Nunca responder parcialmente com contagem de local não autorizado. A rota estática deve preceder a rota de detalhe por ID.

Semântica: contar ativos distintos vinculados ao local **ou aos seus descendentes**, usando o mesmo predicado de `/assets?locationId=...`. Um ativo vinculado a dois descendentes conta uma vez naquele ancestral, mas pode contar em duas linhas de locais diferentes. Incluir as situações de ativo que a consulta atual inclui; não acrescentar filtro de ativos ativos silenciosamente. A relação parte-de entre ativos não substitui o vínculo de localização.

No servidor, uma consulta agregada parametrizada resolve o lote dentro de `withContext`, com RLS e a autenticação atual. Não executar uma consulta por ID. Validação de existência e agregação devem compartilhar o contexto transacional. Sem tabelas novas, migração de dados, índices ou alteração das regras de PT neste recorte.

## Comportamento do cliente

- Uma chamada para os IDs visíveis da página, com total máximo de 100. Não consultar páginas ocultas nem montar `useAssetPage` por linha.
- Cache de resultados separado por sessão, unidade e geração de dados; compartilhar a promessa pendente do mesmo lote. Erro remove a promessa e permite nova tentativa controlada.
- Invalidar após alteração de ativo, seus vínculos de local ou hierarquia de locais; a PERF-02 define eventos externos e fallback. Resposta de geração anterior não repõe cache invalidado.
- Separadamente, compartilhar a consulta pendente do total global de ativos em `queries.assets`; filtros diferentes continuam buscando suas próprias páginas. Não usar contagem de local como total global.
- Logout/expiração limpa resultados e promessas. Respostas antigas não publicam dados na próxima sessão.

## Aceite e testes locais

| Caso | Resultado exigido |
|---|---|
| Páginas de 15, 25, 50 e 100 locais | Uma chamada de contagens por página/geração; nenhuma chamada de ativos por linha |
| Local vazio, ancestral, múltiplos vínculos e ativo inativo | Totais equivalentes à listagem atual, sem duplicação no ancestral |
| ID externo, inexistente, inválido ou lote excessivo | 404/400 conforme contrato, sem vazamento entre unidades |
| Dois consumidores simultâneos | Uma requisição pendente compartilhada; total global consultado no máximo uma vez por geração |
| Alteração durante consulta, troca de página e logout | Resposta obsoleta descartada; nova geração converge |
| Falha e recuperação | Estado de erro visível; não mostrar zero como sucesso; nova tentativa funciona |

Medir antes/depois no mesmo conjunto local: 20 aberturas, conteúdo da tabela e contagens concluídas, p50/p95, requisições e consultas por lote. Primeiro aceite determinístico: eliminar o crescimento de chamadas proporcional às linhas. O p95 global de 800 ms depende também das outras tasks; não prometê-lo isoladamente aqui. Rodar testes de contrato, RLS em PostgreSQL real, `check.sh` e inspeção da tela em 390/768/1024/1440 px se o componente mudar.

## Entrega, reversão e limites

Implementar e testar localmente. Para eventual publicação autorizada, disponibilizar API compatível antes do cliente; um frontend novo contra backend antigo é configuração não suportada, não motivo para restaurar consultas por linha silenciosamente. Reversão usa o par anterior API/frontend e preserva dados. Supabase, Docker instalado, Vercel e Git não serão alterados durante o refinamento.
