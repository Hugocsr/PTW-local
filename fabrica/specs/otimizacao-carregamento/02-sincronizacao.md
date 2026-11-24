# PERF-02 — sincronização sem trabalho duplicado

Estado: **proposta, aguardando validação**. Prioridade P0. Dependência: PERF-01.

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

Validar o protocolo de remoções e a estratégia para eventos sem domínio. Identificar se mudanças de payload SSE exigem compatibilidade simultânea com clientes anteriores.
