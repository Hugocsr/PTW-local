# PERF-08 — aceite integrado e publicação

Estado: **proposta, aguardando validação**. Prioridade P0, fechamento. Dependências: PERF-02 a PERF-06 e decisão documentada de PERF-07.

## Objetivo

Entregar uma versão comprovadamente mais rápida, mantendo a segurança e os ciclos das duas PTs. Publicação segue local → testes locais → Git → Vercel Preview; `main`/Production ficam preservados.

## Protocolo de medição proposto

1. Fixar dados, commit, browser, largura, rede, região, configuração e concorrência. Não comparar ganho de código usando regiões diferentes sem separar os fatores.
2. Medir pelo menos 20 observações por cenário aquecido, com uma e quatro sessões; primeira carga separada. Respeitar rate limit real: escalonar ensaios, sem desabilitar controle ou transformar o teste em negação de serviço.
3. Login e reload terminam apenas em Minha área útil, conforme a spec do programa. Para listas, aguardar os dados corretos e fim de carregamento, não usar tempo fixo de espera como medida.
4. Medir Modelos, Quadro, Ativos e detalhe de PT; contar chamadas/bytes e registrar erros HTTP/JS. Navegações com dados já em memória e primeiras visitas são cenários separados.
5. Reproduzir 32 segundos sem interação no Quadro e dez minutos de quatro sessões com navegação/reload. Coletar só os logs do intervalo/deploy correto, respeitando retenção disponível.
6. Calcular mediana/p95/máximo, tamanho da amostra e diferenças relativas. Não misturar duração interna da API com tempo de navegador nem estatística SQL cumulativa com delta do ensaio.

## Matriz funcional obrigatória

| Área | Verificação |
|---|---|
| Sessão | Marina, Rafael e Paulo; senha inválida; logout/reload; conta desativada/vencida; sessão expirada |
| Permissões | Administração exclusiva de quem possui grant; cargo/local/assinatura corretos; isolamento entre unidades/sessões |
| PT vigente | Solicitar, preparar, emitir, aceitar, parar/retomar, entregar e encerrar com identidades distintas |
| Preparação 2027 | Turno e impeditivas; revalidação pelo emitente elegível; novo aceite; entrega/encerramento |
| Dados | Atualização entre duas pessoas, exclusões/versões, falha parcial, reconexão e respostas atrasadas após logout |
| Evidências | Anexos recuperáveis/hash; trilha íntegra; PT encerrada preservada |
| Falha | Banco/API/SSE indisponíveis em teste controlado; gravação recusada; Parar e recuperação conforme contrato |
| Interface | 390/768/1024/1440 px, tema preservado, sem rolagem horizontal/erro JS |

No local, rodar checks/builds e suites relevantes, além dos ciclos completos. No Preview, usar novos registros fictícios identificados; não reabrir nem alterar as PTs encerradas anteriores. Falhas de dependência só são induzidas em ambiente isolado, nunca derrubando o Supabase compartilhado para simular queda.

## Critérios de aceite

- AC01: todas as invariantes da spec do programa e a matriz funcional aprovadas.
- AC02: metas de desempenho validadas pelo responsável atendidas, com resultados antes/depois. Se falhar, registrar e voltar ao refinamento; não declarar concluída com exceção implícita.
- AC03: nenhuma saturação de conexões/5xx no intervalo controlado; auditoria íntegra após os ciclos. Isso não é garantia de ausência permanente de falhas fora do ensaio.
- AC04: mudanças de esquema/configuração, se houver, têm backup, compatibilidade e reversão documentados. Segredos ficam fora do Git e dos relatórios.
- AC05: Git publicado antes do deploy, sem force push; árvore do commit, configuração da região/pool, alias e deploy Ready conferidos. URL entregue corresponde à versão efetivamente testada.
- AC06: proteção da Vercel preservada; teste automatizado usa mecanismo autorizado. Não tornar Preview público como atalho.

## Publicação e reversão

Conferir a autorização de publicação existente para o escopo desta entrega; na ausência dela, preparar código/evidências e solicitar a aprovação final concreta. Não pedir novamente se a autorização já cobrir a ação.

Manter o deploy anterior e configuração compatível. Interromper a promoção se houver erro de integridade, autorização, perda de atualização ou regressão; restaurar o deploy anterior sem resetar dados ou descartar novas evidências. Planejar convivência de clientes/deploys antigos e novos, incluindo orçamento de conexões.

## Entrega

Relatório com baseline/candidato, amostras, metas, limitações, decisões dos índices, testes efetivamente executados, URL/commit/deploy e roteiro manual curto. Atualizar o backlog com o estado real de cada task; separar “proposta”, “validada”, “implementada” e “verificada”.
