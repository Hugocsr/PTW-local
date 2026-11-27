# SPEC 012 — Retenção da trilha e tipos de trabalho

**Status:** Executada (28/11/2026)

## Decisões
- Remover o campo "Retenção da trilha" da tela do modelo (só esconder; coluna e API ficam sem uso). As opções A/B originais não foram adotadas.
- Novo catálogo fixo "Tipos de trabalho" (família `trabalho`), com valores copiados da lista de opções atual.
- Novo campo "Tipos de trabalho" na aba Escopo: seleção de um ou mais; obrigatório ao menos um para ativar.

## Resultado da execução
- Banco: enum `type_family` + `trabalho`, tabela `version_work_type` (guarda, auditoria, RLS, permissões). Script `deploy/releases/2026-11-28-tipos-de-trabalho.sql` testado em banco de ensaio.
- API: `workTypeIds` no conteúdo do modelo (obrigatório no contrato), leitura/escrita, seed e testes.
- App: catálogo, seletor no Escopo, auditoria, seeds. 480 testes do app e 230 da API passando; lint/tsc limpos; e2e conferido.

## Limites
- Exigência de ao menos um tipo é só da tela, como no tipo de ativo.
- Pacote `ptw.modelo/1` não leva tipos de trabalho; importado precisa de escolha antes de ativar.
- Versões ativas existentes ficam sem tipos até nova versão.
- Há dois "Tipos de trabalho" em Catálogos: o novo catálogo e a lista de opções antiga (pergunta de formulário).
