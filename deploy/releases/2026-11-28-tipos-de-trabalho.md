# Publicação: Tipos de trabalho no modelo (SPEC 012)

- **Pré-requisito:** banco com a publicação de 26/11 (`2026-11-26-delegacoes-edicao.sql`).
- **Conteúdo:**
  - novo catálogo fixo "Tipos de trabalho";
  - campo "Tipos de trabalho" na aba Escopo do modelo (um ou mais; obrigatório para ativar);
  - "Retenção da trilha" removida da tela do modelo.
- **Banco hospedado (Supabase):** rodar `2026-11-28-tipos-de-trabalho.sql` **antes** do push, em duas etapas:
  1. só a linha `alter type ... add value 'trabalho'` (rodar e confirmar);
  2. o restante do arquivo (tabela, gatilhos, RLS, permissões e cópia dos valores iniciais).

  Não altera dados existentes. Não é reexecutável depois da etapa 2.
- **Sem o script:** salvar o modelo falha (tabela inexistente).
- **Local (Docker):** esquema mudou; recrie o banco:

  ```
  docker compose rm -sf db
  docker volume rm ptw_pgdata
  ```

- **Conferir:** Catálogos › Tipos de trabalho lista os valores; um modelo em rascunho mostra o seletor na aba Escopo; ativar sem tipo é recusado.
- **Limites:** versões já ativas não têm tipos até criar uma nova versão; modelos importados precisam de escolha antes de ativar.
