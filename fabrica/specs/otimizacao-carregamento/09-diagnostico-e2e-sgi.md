# Diagnóstico hospedado — SGI, 24/11/2026

Estado: investigação e refinamento; não autoriza implementação. Deploy `dpl_3JpeGEwRdRCGkTbtHG3Q74zszTzg`, commit `8a3de91372cdb0e8cf0d8ac0e217a4a9d31f6a3e`. Evidências locais em `outputs/perf02-e2e-2026-11-23/`, fora do Git. Cenário fictício identificado por `QA-PERF-2311`.

## Constatações e ordem proposta

| Prioridade / task | Evidência | Mudança a especificar | Aceite proposto |
|---|---|---|---|
| P0 / PERF-03A | Locais não estabilizou em 35 s, com 15 locais. Foram 167 GET de ativos concluídos na fase de observação e limpeza; resposta máxima no navegador: 18.366 ms. | Contagem de ativos em lote para os locais visíveis; compartilhar promessa pendente de totais. Contrato no OpenAPI antes do código. | Uma consulta de contagens por página, sem consulta por linha; filtros, unidade e descendentes equivalentes ao comportamento atual. |
| P0 / PERF-02 | SSE e timer chamam refresh sem exclusão mútua; toda rodada invalida consultas mesmo sem mudança. Audit notify publica também eventos de sistema/acesso. | Coordenador por sessão, invalidação por domínio, tratamento explícito de eventos administrativos e recuperação de sequência. | Uma rodada em andamento; eventos durante a rodada convergem; nenhuma perda de atualização, auditoria ou checagem de disponibilidade. |
| P0 / PERF-06 | 183 eventos de início e 176 de parada já no recorte parcial das 02:41 até aproximadamente 03:12 UTC. | Correlacionar instância, SIGTERM, concorrência, SSE e LISTEN; investigar ciclo de realimentação, sem presumir crash. | Explicar cada classe de encerramento; orçamento de conexões e quatro sessões sem saturação. Não apagar auditoria para reduzir tráfego. |
| P0 / PERF-04 + PERF-03 | Entradas observadas perto de 9–11 s até DOM útil; modelos na API chegaram a 2,30 s na nova coleta. Bootstrap carrega cadastros e modelos antes de abrir a sessão na interface. | Reduzir viagens sequenciais e separar dados necessários de complementares. | Medir conteúdo útil, sem considerar só cabeçalho; preservar autorizações e estado de segurança. |
| P1 / consistência de edição | Segunda alteração de escopo do modelo recebeu 409 após uma gravação bem-sucedida. Preenchimento rápido do checklist também exigiu conferir o valor persistido. | Serializar escritas por registro, usar revisão devolvida, tratar conflito e respostas antigas explicitamente. | Alterações sucessivas não perdem resposta anterior; falha é visível; reload corresponde ao que foi confirmado. Reproduzir isoladamente antes de atribuir causalidade. |
| P1 / Storage | Consulta agregada posterior mostrou 104 recusas 403 AccessDenied; upload de evidência desta PT respondeu com sucesso. | Identificar operação/origem e request ID; separar sondas de controle de acesso de falhas de usuário. | Anexo autorizado grava e relê com hash; recusa indevida tem causa corrigida; bucket continua privado. |
| P1 / PERF-05 | API iad1 e banco us-west-2. | Ensaio isolado de proximidade de região após reduzir chamadas. | Comparação controlada; não atribuir todo tempo à região por inferência. |
| P2 / PERF-07 | Advisor: 34 FKs sem índice e 21 índices não usados. | Investigar planos das consultas ainda custosas. | Não criar/remover índices por alerta isolado; considerar escritas e escala. |

## Banco, logs e limites da amostra

O delta de pg_stat_statements entre 02:42:47 e 11:41:45 UTC inclui o intervalo entre sessões e atividade de outros clientes. Não é uma baseline exclusiva do navegador. Foram 5.899 chamadas a set_context, média de execução SQL de 0,95 ms; 507 chamadas a audit_system, média 131,43 ms e 66,63 s acumulados. Isso aponta custo relevante do ciclo de sistema/auditoria, além de viagens e filas, sem provar sozinho a origem da espera. Query IDs foram agregados entre papéis; não houve reset de estatísticas.

A consulta de logs do Supabase até 11:40 UTC mostrou PostgreSQL LOG/00000 e Supavisor info no agregado consultado. Isso não demonstra ausência de toda falha na aplicação. Os avisos de Storage exigem correlação própria.

A Vercel limita retenção neste plano. A coleta inicial foi preservada; a tentativa de recuperar toda a janela antiga foi recusada. A coleta nova usa janela de 25 minutos e deduplica logs por evento da aplicação, não por invocação externa. Não usar as quantidades duplicadas da primeira coleta como número de requisições únicas.

Foram percorridos 13 menus em duas rodadas. O coletor limita observação de estabilização a 10 s nas rodadas posteriores; resultados com leituras pendentes são censurados, não tempos completos de carregamento. Status 0 ao fechar o navegador representa aborto, não HTTP 5xx. Esta investigação não substitui a baseline de 20 repetições e quatro sessões da PERF-01.

## Cobertura e continuidade

Cadastros criados pela interface: tipos, sublocal/galpão fictício, dois ativos, lista com três itens, contato sem login e grupo com dois membros. Modelo de ensaio preparado via API, escopos/ativação/exportação/importação de rascunho pela interface. Delegação administrativa criada pela interface. PT `01a20d58-42ae-72f0-a380-ec04e4b410e0` criada pela interface, com checklist/documento/anexo; um ajuste corretivo de resposta feito via API deve constar da cobertura, sem afirmar teste exclusivamente visual.

### Resultado da rodada

PT **PT-UN01-2026-00006**, encerrada. Passaram pela interface: criação, preenchimento dos campos obrigatórios e anexo, envio, assinatura administrativa delegada, emissão, aceite em campo, parada, retomada, novo aceite, entrega, encerramento, abas, reload e impressão. Houve ajuste do checklist pela API após observar corrida entre respostas; portanto não declarar o preenchimento integral exclusivamente visual aprovado. Campo opcional de contato não foi concluído pela automação.

A devolução oferecida ao delegado falhou com HTTP 422 **PTW29**, confirmado na auditoria: “Só quem pode assinar a etapa pendente devolve a PT”. A assinatura da mesma etapa pelo delegado funcionou. Registrar inconsistência da devolução; o reenvio após devolução não foi validado neste cenário. Não contornar essa recusa alterando regras nesta investigação.

O mandato utilizado foi revogado via API após o encerramento; a releitura confirmou a assinatura histórica preservada. O conteúdo do anexo foi relido com `mode=visto` e seu SHA-256 conferido. Evidência em `verificacao-final.json`. A tentativa inicial de revogar pela interface encontrou duas linhas de mandatos do mesmo modelo e falhou por seletor ambíguo; isso não comprova defeito na revogação da aplicação.

Também passaram: relação entre os dois ativos fictícios, cargo do contato sem login, prévia/validação/descarte da identidade visual, exportação real da auditoria em JSONL + manifesto e menu do operador sem Identidade visual, Grupos e Auditoria. Não houve publicação de identidade nesta rodada. A relação criada é genérica; não substituir por aceite do bloqueio hierárquico parte-de.

Não confundir varredura dos 13 menus com teste exaustivo de todas as combinações. Não foram repetidos aqui: quatro sessões concorrentes, escala de milhares de registros, offline, expiração por inatividade, Prorrogar, revalidação elétrica dos dois modelos e a matriz completa de permissões. SSO, e-mail e recursos futuros não implementados não ganham aceite por esta varredura.

`check.sh` concluiu sem erros: 409 testes de frontend, 160 de API e sete scripts auxiliares passaram; 38 testes de API dependentes do ambiente foram omitidos pelo runner, não contam como aprovados. Nenhuma alteração de código do produto, banco ou infraestrutura foi feita.

### Correlação da Vercel

Na coleta encerrada às 11:52:08 UTC, duas páginas de logs foram obtidas, sem página restante. Após deduplicação de eventos da aplicação: 2.007 respostas completas classificadas (1.875 HTTP 200, quatro 201, 42 204, 84 401 e duas 422), sem 5xx nessa janela. Os 401 incluem sondagem de sessão sem login; não equivalem automaticamente a falha percebida pelo usuário. Os 422 devem ser classificados pela auditoria, não descartados como problema de rede.

GET modelos: n=180, mediana 1.632 ms, p95 2.527 ms. GET Minha área: n=96, mediana 1.239 ms, p95 2.095 ms. Assinaturas: n=6, mediana 2.323 ms, p95 2.554 ms. Anexos: n=14, mediana 1.407 ms, p95 2.850 ms. São tempos da API nesta amostra mista de homologação, não o carregamento total da tela nem SLA. `/events` é SSE: duração de conexão de até 51 s não deve ser classificada como leitura lenta comum.

Coleta final disponível em `vercel-runtime.json`, encerrada às 11:55:02 UTC: 2.263 respostas classificadas, sem 5xx; inclui 112 respostas 401, duas 400 e duas 422. Pelo menos uma 400 foi provocada pelo verificador ao omitir o parâmetro obrigatório `mode` do anexo; com `mode=visto`, o conteúdo e o hash passaram. Modelos: n=201, mediana 1.632 ms e p95 2.519 ms. Exportação: criação 3.535 ms e download JSONL 6.588 ms, uma amostra de cada. O tempo da exportação completa não deve ser comparado diretamente à meta de leitura paginada comum.

Próximo passo: refinar e validar PERF-03A e PERF-02 em conjunto, com testes de consistência das gravações. Desenvolver e testar localmente; publicar somente após autorização. Nenhuma otimização de produto foi implementada nesta investigação.
