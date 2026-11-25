# Publicação: melhorias em Delegações (SPEC 003)

- **Pré-requisito:** o banco já tem a publicação de 25/11 (`2026-11-25-grupos-perfis.sql`).
- **Conteúdo:**
  - calendário em todos os campos de data;
  - edição de delegação agendada;
  - coluna Ações escondida quando não há ação.
- **Banco hospedado (Supabase):** rodar `2026-11-26-delegacoes-edicao.sql` **antes** do push. O script:
  - substitui `ptw.delegation_guard` e `ptw.audit_row`;
  - libera o UPDATE dos campos editáveis para `ptw_app`;
  - registra `sistema.esquema.alterado`.

  Não cria tabela nem muda dados. Ensaio: esquema de 25/11 → script → `pg_dump -s` idêntico ao do zero.
- **Sem o script:** a tela funciona, mas "Salvar alterações" de uma delegação agendada é recusado com erro de permissão.
- **Local (Docker):** como o esquema mudou, o instalador recusa o banco antigo. Recrie o banco antes de reinstalar:

  ```
  docker compose rm -sf db
  docker volume rm ptw_pgdata
  python tools/ptw_instalar.py --local
  ```
