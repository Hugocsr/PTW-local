# Publicação: rascunho salvo sozinho, equipe elegível e ajustes das SPECs 004 a 016

- **Pré-requisito:** o banco já tem a publicação de 26/11 (`2026-11-26-delegacoes-edicao.sql`). **Nenhuma** das SPECs abaixo muda o esquema.
- **Conteúdo:**
  - SPEC 004 a 007: ajustes de Ativos e formulários, Tipos e Listas unificados, busca e dica nos Catálogos, Usuários no formato SGI;
  - SPEC 010: login no visual do protótipo SGI;
  - SPEC 011: "Quadro de PTs" passa a se chamar **Solicitações de PT** (a rota `#quadro` deixa de existir);
  - SPEC 014: **rascunho salvo sozinho** (espera de 5 s), "Meus rascunhos", Excluir rascunho, e o rascunho só é visível para o solicitante em toda leitura por id (404 para os demais);
  - SPEC 015: equipe e campo "Pessoa" listam só pessoas elegíveis; a API recusa equipe não elegível ao criar, alterar e enviar (`PTW08`);
  - SPEC 016: o botão "Tela de parede" saiu de Solicitações de PT (`#parede` continua pelo endereço).
- **Banco hospedado (Supabase):** nenhum script. Nada a rodar antes do push.
- **API:** reconstruir (mudou: leitura de rascunho, anexos, `GET /health`, validação da equipe).
- **Variável nova, opcional:** `PTW_DRAFT_AUTOSAVE_SECONDS` (1 a 60, padrão 5), a espera do salvamento automático. Sem ela vale 5. Para mudar na Vercel, defina a variável no projeto da API e republique.
- **Local (Docker):**

  ```
  cd ptw-server
  docker compose -f compose.yaml -f compose.ldap-test.yaml up -d --build --wait
  cd ..
  ```

  Depois Ctrl+F5 no navegador.
- **Conferência rápida:** Nova PT cria o rascunho sozinho (indicador "Salvo às…" no título); "Meus rascunhos" lista o rascunho; a equipe só mostra quem tem o cargo válido para o local.
