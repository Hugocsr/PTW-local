# PERF-02 — sincronização sem trabalho duplicado

Estado: **autorizada e implementada localmente** em 24/11/2026. Publicação e aceite global pendentes. Prioridade P0. Dependência: PERF-01. Recorte pareado com [PERF-03A](03a-contagens-locais.md). [Resultados e limites](10-validacao-local.md).

## Problema

`data/api/index.ts` agenda atualização por polling e SSE. `syncReference` faz consultas separadas de alterações/totais, em sequência, e não há coordenação de execuções sobrepostas. Uma aba parada gerou 26 chamadas em 32 segundos na reprodução.

## Escopo e contrato proposto

1. Uma sincronização em andamento por sessão. Eventos recebidos durante ela marcam trabalho pendente, consolidado em nova rodada; não são descartados.
2. A consolidação deve identificar sessão/unidade e invalidar callbacks da sessão anterior no logout/troca de pessoa. Uma resposta antiga nunca repõe permissões ou dados de outra identidade.
3. Atualizar somente os domínios afetados quando o evento permitir identificá-los. Os eventos atuais contêm unidade/PT/sequência, não uma classificação completa de cadastro: evento ambíguo exige atualização segura mais ampla. Não inferir ausência de alteração.
4. Preferir protocolo de delta/versão e remoções explícitas a consultas redundantes de totais. Se o contrato atual não permite detectar exclusões, manter mecanismo seguro até aprovar o novo contrato no OpenAPI.
5. Reutilizar uma consulta em andamento quando consumidores pedirem o mesmo recurso na mesma sessão. Não cachear autenticação/autorização.
6. Preservar a checagem atual de disponibilidade e o fallback periódico. Alterar seus intervalos exige refinamento explícito; ocultar a aba não pode pausar controles de segurança necessários.

## Critérios de aceite

- AC01: SSE e timer simultâneos não causam duas rodadas concorrentes da mesma sessão.
- AC02: alteração durante uma rodada, remoção, mudança de modelo e sequência perdida/reconexão são recuperadas sem exigir reload manual.
- AC03: falha permite nova tentativa controlada, sem fila infinita ou disparo contínuo.
- AC04: logout/troca de pessoa encerra timers/stream e impede aplicação de respostas antigas.
- AC05: meta proposta ≤ 12 chamadas em 32 segundos sem interação, mesmos dados/tela do baseline, sem atrasar a sinalização atual de indisponibilidade.
- AC06: teste registra convergência após evento e após fallback; meta proposta de dado visível ≤ 5 s com SSE ativo e até um ciclo de fallback mais sua duração quando SSE está indisponível. Ações críticas continuam revalidadas no servidor.

## Testes e evidências

Relógio controlado para rajada de eventos, timer durante atualização, erro e recuperação, exclusão e eventos ambíguos. Testar duas pessoas alterando PT/cadastro, reconexão SSE, modelo arquivado e conta revogada. Medir uma/quatro sessões e volume de chamadas, sem desabilitar rate limit para facilitar o ensaio.

## Áreas previstas

`ptw-mockup-v2/src/data/api/index.ts`, `registry.ts`, `queries.ts`; contrato/API de delta somente se a proposta for refinada para incluí-lo. A interface não acessa `fetch` diretamente.

## Reversão e fora de escopo

Reverter o coordenador restaura o mecanismo anterior com compatibilidade de contratos. Não alterar regras de PT, duração do turno, validade de sessão ou frequência de expiração do servidor.

## Decisões para refinamento

### Coordenador e aplicação dos resultados

Um coordenador por sessão/unidade acumula os domínios sujos. Uma rodada usa uma fotografia desse conjunto; eventos posteriores entram no conjunto seguinte. Timer e SSE passam pelo mesmo coordenador. A rodada não é cancelada e reiniciada a cada evento. Ao terminar, executa no máximo uma próxima rodada consolidada, mantendo apenas um conjunto pendente, não uma fila por evento. Em falha, preservar pendências e programar nova tentativa limitada a uma rodada por intervalo de fallback de 30 s; novas mensagens não podem criar um laço imediato de tentativas falhas. Recuperação por ação explícita do usuário continua disponível.

Publicar dados somente quando a sessão e a geração correspondem à requisição. Cancelar/ignorar callbacks após logout, parada do serviço de dados ou troca de identidade. Comparar dados efetivamente recebidos antes de emitir notificações aos consumidores; eliminar `changed()` global incondicional. Uma alteração de PT não deve recarregar contagens de ativos sem motivo de cadastro/equipamento.

### Envelope SSE aditivo

Preservar `seq` e `permit` e acrescentar `domains`, lista de valores conhecidos: `permits`, `locations`, `assets`, `people`, `types`, `optionLists`, `templates`, `relations`, `delegations`, `appearance`, `groups`, `audit`. O servidor classifica por ação/entidade da auditoria; uma ação pode afetar mais de um domínio. Cadastro de ativo/local/relação invalida também os consumidores de contagens e bloqueios pertinentes. Alteração de pessoa/delegação atualiza elegibilidade sem transformar cache em autorização.

Eventos de acesso e início/parada de servidor continuam gravados e entregues para `audit`, mas não disparam recarga dos cadastros e Minha área. O classificador é conservador: ação desconhecida, payload legado sem domains, domínio desconhecido ou payload malformado solicita ressincronização ampla. Não descartar eventos desconhecidos. Clientes antigos ignoram o campo adicional e continuam relendo como hoje. Documentar envelope e exemplo no OpenAPI antes do código.

Na reconexão do stream, solicitar ressincronização ampla explícita; não interpretar sequência da auditoria como contador necessariamente contíguo por cliente. Não há promessa de replay de eventos. O fallback periódico de 30 s mantém leitura ampla e o mecanismo atual de totais para recuperar exclusões. O protocolo novo de tombstones/delta e a eliminação dessas leituras ficam para recorte posterior: retirá-las agora poderia perder remoções.

Preservar polling de disponibilidade a cada 5 s, heartbeat/autenticação SSE, expiração de sessão e expiração de PT no servidor. Não alterar intervalos para atingir a meta de chamadas. A carga de auditoria permanece própria, limitada/paginada; receber um aviso de auditoria não deve produzir uma nova busca auditada em laço.

### Aceite adicional da rodada

- AC07: rajada de 100 avisos antes/durante uma rodada não gera 100 rodadas, nem duas simultâneas; alteração na última rodada permanece pendente até convergir.
- AC08: avisos de acesso e ciclo do servidor não recarregam referências/PTs; o registro e a consulta de auditoria continuam íntegros. Mensagem desconhecida e reconexão recuperam alterações/remoções sem reload manual.
- AC09: requisições iguais de uma geração compartilham promessa; invalidação durante a leitura impede publicação obsoleta. Falha libera a promessa e não cria retry contínuo.
- AC10: uma tela sem alteração não recebe invalidação de todos os seus hooks em cada rodada. Alterações de cadastro, hierarquia, anexos, delegações e estado da PT atualizam os consumidores necessários.

O limite global proposto de 12 chamadas em 32 s **não é garantido neste recorte**: o fallback amplo atual já faz mais leituras. Registrar a contagem real e a redução por fonte, sem relaxar disponibilidade nem marcar AC05 aprovado. PERF-01/04 e eventual contrato de delta precisam fechar a meta global antes de PERF-08.

Testes: relógio controlado para concorrência/rajadas/erro; fixtures de cada domínio e ações desconhecidas; compatibilidade dos dois formatos SSE; duas pessoas alterando dados em PostgreSQL local; quatro sessões no ensaio controlado, com rate limit ativo; provas de exclusão, logout, pessoa revogada, anexo e ambos os modelos elétricos. Comparar baseline repetida antes/depois. Não implementar a correção de devolução delegada/PTW29 ou serialização de gravações nesta task: são defeitos distintos a especificar, embora respostas de leituras antigas já devam ser protegidas pelo coordenador.
