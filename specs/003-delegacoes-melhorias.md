# SPEC 003: Melhorias em Delegações (calendário, edição de agendadas, coluna Ações) e teste do uso pelo delegado

| | |
|---|---|
| Status | **Executada em 25/11/2026** (decisões da seção 11 aprovadas como recomendado) |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência | Tela `#delegacoes` (SGI · Aprovação › Delegações) e `ptw-server/TESTES-DELEGACOES.md` |

## 1. Contexto

### Como funciona hoje

- **Datas** (Início, Fim e o filtro "Período"): campo digitado `dd/mm/aaaa`, com o botão "Hoje". Não há calendário para escolher o dia.
- **Delegação agendada** (começa no futuro): só pode ser **revogada**.
  - Para corrigir o delegado, o período ou a observação, é preciso revogar e criar outra.
  - O banco impede qualquer alteração além da revogação ("Delegação só pode ser revogada; preserve a autorização original").
- **Coluna "Ações"**: mostra o botão Revogar nas delegações ativas ou agendadas. Nas expiradas e revogadas mostra "—". Quando nenhuma linha tem ação (por exemplo, no filtro "Expirada", ou para quem não tem o papel de cadastro), a coluna fica inteira com "—".
- **Uso pelo delegado:**
  - durante a vigência, o delegado vê a aprovação do delegante como pendência ("Sua vez" no Dashboard) e pode assinar;
  - a PT registra "Rafael Nunes em nome de Joana Reis";
  - isso está coberto por teste de API (CT-04), mas **não por um teste de tela de ponta a ponta**.

## 2. Objetivo

1. Escolher datas por **calendário**, sem perder a digitação.
2. Permitir **editar uma delegação agendada** enquanto ela não entrou em vigor.
3. **Esconder a coluna Ações** quando nenhuma linha mostrada tem ação.
4. **Testar de ponta a ponta** a aprovação indo para o delegado, e não indo fora do escopo, do período ou depois da revogação.

## 3. Escopo

**Entra**
1. Calendário no componente de data (ver decisão 1).
2. Editar delegação **agendada**: botão "Editar" na linha, modal "Editar delegação" igual ao de criação, já preenchido.
3. Banco, API e auditoria da edição (`delegacao.alterada`, com o antes e o depois).
4. Coluna Ações escondida quando não houver ação nas linhas mostradas (tabela) e nenhum botão nos cartões (celular).
5. Testes de tela da aprovação pelo delegado (seção 8).
6. Script de atualização do banco hospedado (Supabase), porque a regra do banco muda.

**Não entra**
- Editar delegação **ativa**: depois que entrou em vigor, a delegação continua só revogável (ver decisão 2).
- Editar delegação expirada ou revogada.
- Notificação por e-mail ou push ao delegado: o sistema ainda não tem notificações. O aviso continua sendo a pendência no Dashboard e no Quadro.
- Mudar quem pode criar ou revogar (continua o papel de cadastro).

## 4. Regras

1. **Só agendada é editável:** a delegação não pode estar revogada, e o início precisa ser no futuro, conferido **no banco** na hora de salvar. Se ela começou enquanto o modal estava aberto, a gravação é recusada com: "A delegação já entrou em vigor: não pode mais ser editada. Revogue e crie outra, se precisar."
2. **Campos editáveis:** delegado, início, fim, escopo (planta), aprovação e observação. **O delegante não muda** (ver decisão 3).
3. **Todas as regras da criação valem de novo:**
   - até 7 dias corridos;
   - início hoje ou no futuro;
   - cargo e conta válidos do delegante e do delegado no escopo;
   - sem sobreposição com outra delegação do mesmo delegante (a própria delegação não conta);
   - observação obrigatória.
4. **Concorrência:** a edição usa a revisão (`If-Match`). Se outra pessoa editou ou revogou antes, a resposta é 409 "Alguém alterou esta delegação: recarregue".
5. **Auditoria:** `delegacao.alterada`, com os campos de antes e de depois. O histórico mostra "Editou a delegação (delegado, fim)".
6. **Quem pode editar:** quem tem o papel de cadastro, como para criar e revogar.
7. **Coluna Ações:**
   - aparece só se ao menos uma das linhas **mostradas** (depois dos filtros) tem Editar ou Revogar;
   - para quem não tem o papel de cadastro, nunca aparece;
   - no celular, o cartão sem ação não mostra a área de botões.
8. **Calendário:**
   - dias anteriores a hoje ficam desabilitados no Início e no Fim da delegação;
   - no Fim, ficam desabilitados os dias antes do início e depois de início + 6 dias, e o intervalo escolhido aparece destacado;
   - nos filtros de Período, nenhum dia fica desabilitado;
   - a digitação `dd/mm/aaaa` e o botão "Hoje" continuam funcionando.

## 5. Experiência

### Campo de data com calendário

- Campo `dd/mm/aaaa` com um **ícone de calendário** dentro, à direita, e o botão "Hoje" ao lado, como hoje.
- **Abrir o calendário:** clicar no ícone abre um calendário em popover, em português ("novembro de 2026", semana começando no domingo, "Hoje" marcado). O teclado também abre (Alt+↓ no campo).
- **Escolher um dia:** clicar preenche o campo e fecha o calendário. Esc fecha sem mudar nada.
- **Teclado:** setas, PageUp/PageDown (mês) e Enter.
- **No celular:** o calendário abre como folha embaixo, com toques de no mínimo 44 px.
- **Visual:** componente Calendar do shadcn (react-day-picker), com os tokens atuais: dia escolhido em índigo e intervalo em índigo suave.

### Editar delegação agendada

- **Na tabela:** na coluna Ações das linhas agendadas aparecem **Editar** (lápis, contorno) e **Revogar** (ícone vermelho atual). Na ativa, só Revogar.
- **No celular:** os botões "Editar" e "Revogar" ficam no cartão.
- **Modal "Editar delegação":**
  - mesmo layout do "Nova delegação", já preenchido;
  - Delegante só leitura;
  - subtítulo "Agendada · começa em 02/12/2026";
  - botão "Salvar alterações".
- **Depois de salvar:** aviso "Delegação atualizada." e a linha atualizada.

### Coluna Ações

- Some do cabeçalho e das linhas quando nenhuma linha mostrada tem ação. A tabela usa a largura que sobrar.

## 6. Dados e API

- **Banco** (`26_governance.sql`, `delegation_guard`):
  - **Hoje:** UPDATE só para revogar.
  - **Novo:** UPDATE também para editar, quando `old.revoked_at is null`, `old.starts_at > now()` e o delegante não muda.
  - **Na edição:** valida tudo como no INSERT, com a sobreposição excluindo o próprio id, e incrementa a revisão.
  - **Revogação:** continua igual.
  - **Auditoria:** a ação do UPDATE passa a ser `delegacao.alterada` quando não é revogação.
- **API:**
  - `PUT /delegations/{id}` (`updateDelegation`, tag governança), com corpo `DelegationInput` sem o delegante, `If-Match` e `Idempotency-Key`;
  - respostas 200, 409 (revisão) e 422 (regras, inclusive "já entrou em vigor").
- **App:**
  - `canEdit(d, now)` em `core/delegation.ts`;
  - o modal de delegação recebe `existing?`;
  - `DateInput` ganha o calendário, com `min`, `max` e `rangeFrom` opcionais;
  - dependência nova: `react-day-picker` (Calendar do shadcn).
- **Supabase:** `deploy/releases/2026-11-26-delegacoes-edicao.sql`, que substitui as funções `delegation_guard` e `audit_row` e libera o UPDATE dos campos editáveis. Sem tabela nova.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | Todos os campos de data abertos pelo `DateInput` têm calendário. Digitar e "Hoje" continuam funcionando. |
| CA-02 | No modal de delegação, o calendário desabilita dias inválidos e destaca o intervalo. |
| CA-03 | Delegação agendada mostra "Editar". A edição salva, valida as mesmas regras da criação e fica na auditoria. |
| CA-04 | Ativa, expirada e revogada não mostram "Editar". A API e o banco recusam a edição delas. |
| CA-05 | A edição concorrente dá 409, sem perder o que já foi salvo. |
| CA-06 | A coluna Ações some quando nenhuma linha mostrada tem ação. |
| CA-07 | Durante a vigência, a aprovação aparece para o delegado e ele assina em nome do delegante. Fora do escopo, antes do início, depois do fim ou depois da revogação, não aparece e é recusada. |
| CA-08 | Celular e tablet sem rolagem lateral, com toques de no mínimo 44 px. Contraste AA e teclado no calendário. |
| CA-09 | Os testes atuais continuam passando. |

## 8. Casos de teste

**Banco** (`db/tests/delegations.sql`)
- Editar agendada (delegado, período, escopo, observação): aceito, revisão +1 e auditoria `delegacao.alterada`.
- Editar ativa, expirada ou revogada: recusado.
- Trocar o delegante: recusado.
- Edição que cria sobreposição, passa de 7 dias ou põe o início no passado: recusada.

**API** (`api/test/delegations.test.ts`)
- **CT-07:** PUT numa agendada → 200 com os dados novos.
- **CT-08:** PUT numa ativa → 422.
- **CT-09:** PUT com revisão velha → 409.
- **CT-10:** PUT sem o papel de cadastro → 403, registrado como negado.

**Tela** (Playwright, API real e dados de exemplo)

| Caso | Roteiro |
|---|---|
| CT-UI-16 | Calendário: abrir no Início, escolher um dia, ver o campo preenchido. No Fim, os dias depois de início + 6 aparecem desabilitados. Digitar `dd/mm/aaaa` continua funcionando. |
| CT-UI-17 | Criar Marina → Joana agendada; Editar; trocar o fim e a observação; salvar. A linha mostra os novos dados e a auditoria mostra a alteração. |
| CT-UI-18 | Linha ativa: sem "Editar", com "Revogar". |
| CT-UI-19 | Filtro "Expirada" (ou usuário sem o papel de cadastro): a coluna Ações não aparece. |
| CT-UI-20 | **Aprovação para o delegado:** <ol><li>Delegação Joana → Rafael ativa na Planta Norte.</li><li>Paulo cria e envia uma PT de "Soldagem em tubulação de vapor" numa área da Planta Norte.</li><li>Rafael vê a pendência "Aprova a soldagem" em "Sua vez" e assina; a PT mostra "Rafael Nunes em nome de Joana Reis".</li></ol> |
| CT-UI-21 | A mesma PT numa área da **Planta Sul**: a pendência não aparece para Rafael e a assinatura é recusada. |
| CT-UI-22 | Depois de **revogar** a delegação, uma nova PT da Planta Norte não aparece para Rafael. A PT já assinada continua íntegra. |
| CT-UI-23 | Com a delegação **agendada** (ainda não começou), a pendência não aparece para Rafael. |
| CT-UI-24 | Durante a vigência, **Joana continua podendo aprovar**; a primeira assinatura vale e a pendência some para o outro (ver decisão 4). |

**Roteiro manual no localhost:** CT-UI-16, 17, 19 e 20, com Joana, Rafael e Paulo em janelas diferentes.

## 9. Impacto e riscos

- **Segurança:** a edição abre uma porta que hoje é fechada no banco. Por isso ela vale só antes do início e reaplica todas as regras no banco.
- **Supabase:** um script curto (troca de função), para rodar antes do push.
- **Calendário em todo `DateInput`:** também muda os campos de data das PTs, da Gestão de Ativos e da prorrogação. É bom no celular, mas mexe em várias telas (decisão 1).
- **Documentação:** `DESIGN.md`, `AGENTS.md`, `db/MODELO.md`, `TESTES-DELEGACOES.md` e o contrato.

## 10. Plano de execução

1. **Banco:** `delegation_guard` com a edição, auditoria e testes de invariantes.
2. **API:** contrato `PUT /delegations/{id}`, repositório, testes CT-07 a CT-10.
3. **App:**
   - Calendar (shadcn) e `DateInput` com calendário;
   - modal de criação e edição;
   - Editar na tabela e nos cartões;
   - coluna Ações condicional.
4. **Testes de tela** CT-UI-16 a 24, com capturas em 1440, 820 e 390 px.
5. **Script do Supabase** ensaiado sobre o esquema de 25/11, documentação e cópia para a sua pasta.

## 11. Pontos para você decidir

1. **Onde entra o calendário.**
   - **Proposta:** no componente `DateInput`, ou seja, em **todas** as datas digitadas do sistema (Delegações, campos de data da PT, Gestão de Ativos, Prorrogação), para manter o padrão.
   - **Alternativa:** só na tela de Delegações.
2. **Até quando editar.**
   - **Proposta:** só **agendada** (antes do início). Depois que começou, só revogar, porque alguém pode já ter assinado em nome do delegante.
   - **Alternativa:** permitir encurtar o fim de uma ativa.
3. **Trocar o delegante na edição.**
   - **Proposta:** não; para outro delegante, revogue e crie outra. Isso mantém claro de quem é o poder transferido.
   - **Alternativa:** permitir trocar enquanto agendada.
4. **O delegante continua aprovando durante a delegação?**
   - **Hoje:** sim, os dois podem; vale a primeira assinatura.
   - **Proposta:** manter assim (ex.: retorno antecipado sem precisar revogar).
   - **Alternativa:** durante a vigência, só o delegado aprova.
5. **Coluna Ações escondida considerando:**
   - **Proposta:** as linhas **mostradas** (depois dos filtros), como pedido.
   - **Alternativa:** todas as delegações, para a coluna não aparecer e sumir ao trocar de filtro.

## 12. Resultado da execução (25/11/2026)

**Decisões aprovadas:**
1. Calendário em **todas** as datas, presentes e futuras. Ficou registrado no `DESIGN.md` como regra: toda data usa `DateInput`.
2. Edição só enquanto agendada.
3. Sem trocar o delegante.
4. O delegante continua aprovando durante a delegação.
5. A coluna Ações considera as linhas mostradas.

**Verificações**

| Camada | Resultado |
|---|---|
| Banco (`invariants.sql`, com os casos novos de `delegations.sql`) | OK, 697 verificações (+10) |
| API (PostgreSQL real; CT-07 a CT-10 novos) | 211 testes passaram |
| App (`vitest`, inclui `rowActions`/`showActions`/`canEditDelegation`) | 447 testes passaram |
| `tsc`, `eslint`, `vite build`, `sync-shared --check` | sem erros |
| Script do Supabase (esquema de 25/11 → script) | `pg_dump -s` idêntico ao esquema novo criado do zero |

**Tela** (Playwright, API real, dados de exemplo; Marina, Joana, Rafael e Sérgio em janelas separadas)

| Caso | Resultado |
|---|---|
| CT-UI-16 | PASSOU: o calendário bloqueia o passado; no Fim, bloqueia depois de início + 6 e destaca o intervalo; a digitação continua. |
| CT-UI-17 | PASSOU: "Editar delegação" com delegante só leitura; fim e observação alterados; auditoria `delegacao.alterada`. |
| CT-UI-18 | PASSOU: ativa sem Editar, com Revogar. |
| CT-UI-19 | PASSOU: a coluna Ações some no filtro Revogada e para quem não tem o papel de cadastro. |
| CT-UI-20 | PASSOU: a PT da Planta Norte aparece em "Sua vez" do Rafael. Ele assina **pela tela**: o diálogo diz "Você assina em nome de Joana Reis" e a PT mostra "Rafael Nunes · Em nome de Joana Reis". |
| CT-UI-21 | PASSOU: a PT da Planta Sul não aparece para ele; a assinatura é recusada com PTW08. |
| CT-UI-22 | PASSOU: depois de revogar, a nova PT não vai para Rafael, e a assinada continua íntegra. |
| CT-UI-23 | PASSOU: agendada ainda não vale; a pendência não aparece e a assinatura é recusada. |
| CT-UI-24 | PASSOU: Joana aprova durante a vigência; a aprovação some da "Sua vez" do Rafael. |
| CT-UI-25 | PASSOU: celular sem rolagem lateral e dias do calendário com 44 px. |

**Diferenças em relação ao plano**

- No celular, o calendário abre em popover junto do campo, com dias de 44 px, e não como folha embaixo. Fica mais próximo do campo e passou no teste de toque.
- A regra da auditoria (`audit_row`) também foi trocada, para chamar a edição de `delegacao.alterada` sem mudar a revogação.
- O app tinha o `schema.d.ts` do contrato desatualizado desde a SPEC 002. Foi regenerado agora.

**Arquivos principais**

- **Banco:** `26_governance.sql`, `50_auditoria.sql`, `60_acesso.sql`, `db/tests/delegations.sql`.
- **API:**
  - `openapi.yaml` (`PUT /delegations/{id}`, `DelegationUpdate`);
  - `src/repo/delegations.ts`, `src/routes/delegations.ts`, `test/delegations.test.ts`, `test/contract.test.ts`.
- **App:**
  - componentes: `components/ui/calendar.tsx` (novo), `DateInput.tsx`, `NewDelegationDialog.tsx`, `DelegationsView.tsx`;
  - regras: `core/delegation.ts`, `core/delegationView.ts`;
  - dados: `data/*` e `data/api/schema.d.ts`;
  - `package.json` (`react-day-picker`).
- **Publicação:** `deploy/releases/2026-11-26-delegacoes-edicao.{sql,md}`.
- **Testes manuais:** `ptw-server/TESTES-DELEGACOES.md`.
