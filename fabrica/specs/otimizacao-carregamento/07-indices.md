# PERF-07 — índices com evidência de necessidade

Estado: **proposta, aguardando validação; execução condicional**. Prioridade P2. Dependências: PERF-01 e PERF-03.

## Problema

O advisor identificou 26 chaves estrangeiras sem índice cobrindo-as. Os dados atuais não demonstram que essa seja a causa principal da demora das telas. Criar todos os índices ou remover os marcados como não usados pode piorar escrita e manutenção.

## Escopo e contrato proposto

1. Reavaliar consultas que permanecem lentas após reduzir viagens. Relacionar cada candidato a endpoint, consulta, plano, seletividade, volume e frequência.
2. Usar `EXPLAIN`/estatísticas e, quando adequado, `EXPLAIN (ANALYZE, BUFFERS)` para SELECT em ambiente controlado. Não executar escrita ou função de efeito colateral para obter plano no banco hospedado.
3. Testar em cópia local com dados sintéticos representativos e o papel/permissões reais da API. Dados sintéticos não autorizam importar dados pessoais ou backups sensíveis para o Git.
4. Índice candidato precisa ter benefício demonstrado em leitura ou verificação de integridade e custo medido de escrita/espaço. Não alterar políticas RLS ou funções de segurança para mudar o plano.
5. Fonte canônica continua `ptw-server/db/schema/`, conforme as convenções do projeto. Qualquer aplicação hospedada exige plano compatível e preservação de dados validado antes da execução; nenhuma recriação/reset hospedado é permitida.

## Critérios de aceite

- AC01: cada candidato recebe decisão criar/manter/adiar, com motivo e plano antes/depois.
- AC02: só implementar candidato com ganho mensurável na carga representativa e sem regressão material de escrita. Meta proposta: ≥ 20% de redução no tempo SQL da consulta afetada, custo de escrita ≤ 10%; diferenças abaixo do ruído não contam.
- AC03: se não houver gargalo SQL comprovado, concluir como “avaliada, nenhuma alteração justificada”, sem criar índice para cumprir quantidade.
- AC04: nenhuma remoção de índice baseada apenas em contagem zero de uso após reset/deploy ou amostra curta.
- AC05: se houver DDL, testes de invariantes e plano de bloqueios/aplicação/reversão aprovados antes de tocar no hospedado.

## Testes, reversão e limites

Testar inserção/alteração de PT, assinatura, anexos e auditoria além das leituras afetadas. Reversão de índice novo precisa de plano próprio de locks; não remover índice que sustente restrição. Nenhum upgrade, extensão nova ou plano pago faz parte desta task.

## Referência para triagem

[Advisor de chaves estrangeiras sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). O aviso informa risco potencial, não comprova um gargalo nesta aplicação.
