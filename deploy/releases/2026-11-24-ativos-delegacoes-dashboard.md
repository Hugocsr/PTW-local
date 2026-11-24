# Publicação de homologação: Gestão de Ativos, Delegações (SGI) e Dashboard

Pedido em 24/11/2026: "suba tudo isso para o git e vercel".

- **Destino:** `Hugocsr/PTW-local`, branch `ptw-sgi`.
- **Vercel:** projeto `hc-4634/ptw` (Container, `Dockerfile.vercel`), deploy de Preview a partir do push.
- **Fora do escopo:** não promover `main` nem Production.

## Conteúdo

- **Gestão de Ativos no formato SGI Forces:**
  - planta, área, equipamento e equipamento aninhado numa tela só;
  - ficha SAP e dispositivo de proteção em `attrs`;
  - busca também por TPLNR/WERKS (local) e EQUNR/TPLNR (ativo).
- **Delegações no formato SGI:**
  - tabela com filtros e o modal "Nova delegação";
  - **delegação geral:** `slot_id` nulo vale para todas as aprovações nominais delegáveis do delegante;
  - as regras atuais não mudam: cargo no escopo, até 7 dias, sem sobreposição, revogação com motivo.
- **Dashboard (SPEC 001):**
  - "Minha área" e "Desabilitados agora" numa só página;
  - as rotas antigas continuam funcionando como apelidos;
  - sem mudança no banco.
- **Exemplos:**
  - pacote NR-10 para painéis (`ptw-server/exemplos-nr10-paineis`);
  - casos de teste de delegações (`ptw-server/TESTES-DELEGACOES.md`);
  - specs em `specs/`.

## Banco hospedado: atualização obrigatória ANTES do push

A API nova lê `location.attrs` e `asset.attrs` e grava delegação sem `slot_id`. Se o código for publicado antes da atualização do banco, as telas de cadastro e de delegações respondem erro 500.

Arquivo: `2026-11-24-ativos-delegacoes-dashboard.sql`. É aditivo e roda numa transação só:

1. **Função e colunas novas:** cria a função `ptw.attrs_ok` e a coluna `attrs` em `ptw.location` e `ptw.asset`, com padrão `{}`.
2. **Busca:** recria as colunas de busca geradas e seus índices trigram, para incluir os códigos SAP. Os dados não mudam.
3. **Delegação:**
   - `ptw.delegation.slot_id` passa a aceitar nulo;
   - cria o índice por delegante;
   - substitui `delegation_guard`, `delegation_for` e `slot_candidates_for`.
4. **Auditoria:** grava o evento `sistema.esquema.alterado` com os SHA-256 dos arquivos de `db/schema`.

Ensaio feito em 24/11/2026:
- esquema de 23/11 (commit 51f19b5) com os dados das 643 verificações;
- em seguida, este script;
- `pg_dump -s` comparado ao esquema novo criado do zero: estrutura idêntica (só mudam a ordem das colunas e um comentário do próprio teste).
- Verificações do esquema novo: 662 aprovadas.

## Verificações da versão

- **App:** 442 testes, `tsc`, `eslint` e `vite build`.
- **API:** 199 testes com PostgreSQL real; cópia compartilhada conferida.
- **Banco:** 662 verificações de invariantes.
- **Telas:**
  - Dashboard: CT-01 a CT-11;
  - Delegações: 13/13;
  - Gestão de Ativos e fluxo NR-10 completo na API real.

## Reversão

- **Código:** voltar a `ptw-sgi` para o commit anterior a esta publicação. A Vercel refaz o Preview.
- **Banco:** a atualização é aditiva, e o código anterior continua funcionando com as colunas novas (ele não as lê).
  - **Não remova** `attrs` sem antes conferir se alguém preencheu fichas.
  - **Não volte** `slot_id` para obrigatório enquanto houver delegações gerais. Revogue-as antes.
