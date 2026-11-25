# SPEC 002: Grupos no formato SGI com Perfis de acesso

| | |
|---|---|
| Status | **Rascunho, aguardando validação** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência visual | Protótipo SGI Forces Backoffice: "Grupos SGI" e modal "Novo grupo SGI" |

## 1. Contexto

### Como funciona hoje

- **Tela "Grupos de pessoas"** (`#grupos`, menu Governança, exige o papel "cadastro"):
  - tabela com nome, nº de membros, situação e revisão;
  - modal com nome, descrição, ativo e lista de membros com caixas de seleção.
- **Grupos só organizam pessoas.** Não concedem nada. A própria tela diz: "Grupos não concedem cargos técnicos nem permissões administrativas".
- **Permissões de acesso da sessão** (`cadastro`, `modelos`, `auditoria`, `exportacao`):
  - vêm **só do diretório (LDAP)**, no login, pelos grupos do AD configurados em `grantGroups`;
  - ficam gravadas na sessão;
  - a API confere a permissão em cada chamada.
- **Cargos** (Técnico, Supervisora, Eletricista autorizado…) são outra coisa:
  - ficam na pessoa, com escopo de local e validade (treinamento NR-10, por exemplo);
  - dizem quem pode **assinar** cada etapa da PT.

### Como funciona no protótipo SGI

- Lista de grupos à esquerda: ícone, nome, nº de membros e pílula do tipo.
- Detalhe à direita: nome, pílula do tipo, "Editar grupo", "Remover", descrição, plantas e membros (avatar, nome, e-mail, remover), com "+ Adicionar membro".
- Modal com Nome, **Tipo / papel**, **Plantas** e Descrição.
- Tipos de papel do protótipo: Administrador, Gestor SMS, Aprovador, Executante e Solicitante.

## 2. Objetivo

- Reformular a tela de Grupos no formato SGI.
- Criar o conceito de **Perfil de acesso**: um conjunto nomeado de permissões, configurado em uma tela nova na seção **Cadastros**.
- Cada grupo recebe um ou mais perfis, e **todos os membros ganham as permissões desses perfis**, somadas às que já vêm do diretório.
- As permissões passam a valer na hora (na próxima ação da pessoa), sem novo login.

## 3. Escopo

**Entra**
1. Tela **Grupos** no layout SGI: lista com detalhe, criar, editar, desativar e reativar, adicionar e remover membros.
2. Campos novos do grupo: **Perfis** (vários), **Plantas** (vários) e descrição.
3. Tela nova **Perfis de acesso** (`#perfis`): lista, criar, editar, desativar. Cada perfil mostra os grupos que o usam e quantas pessoas recebem as permissões dele.
4. **Permissões efetivas** da pessoa = permissões do diretório **mais** as dos perfis dos grupos ativos de que ela participa.
5. **Proteção contra autoconcessão:** ninguém concede uma permissão que não tem.
6. Na ficha da Pessoa: bloco **"Permissões de acesso"** mostrando cada permissão e sua origem (diretório ou grupo/perfil).
7. Perfis iniciais nos dados de exemplo.
8. Banco, API, testes e script de atualização do banco hospedado (Supabase).

**Não entra**
- **Cargos de assinatura por grupo:** os cargos continuam na pessoa, com validade individual (ver decisão 1).
- **Permissão por planta:** as permissões continuam valendo para a unidade inteira. As plantas do grupo são registradas e exibidas (ver decisão 2).
- **Novas permissões além das quatro atuais.** O catálogo fica pronto para crescer.
- **Perfil atribuído direto na pessoa:** só pelo grupo, como no requisito.
- **Alçadas de aprovação do SGI:** são outro requisito.

## 4. Regras

**Regras que não mudam**
1. **Diretório:** as permissões que vêm do diretório (LDAP) continuam valendo como hoje. Grupos e perfis só **acrescentam**, nunca retiram.
2. **Cargos e assinatura:** cargos, delegações e regras de assinatura não mudam.
3. **Nada é apagado:** grupos e perfis são **desativados**, não removidos, e o histórico fica na auditoria. O botão "Remover" do SGI vira **"Desativar"**.
4. **Isolamento por unidade:** RLS e auditoria encadeada continuam valendo em todas as tabelas novas.

**Regras novas**
5. **Catálogo de permissões:** há 4 permissões de acesso, cada uma com nome e explicação na tela.

| Chave | Nome na tela | O que libera |
|---|---|---|
| `cadastro` | Gestão de cadastros | Gestão de Ativos, Pessoas, Tipos, Listas, Grupos, Perfis e Delegações (criar e revogar) |
| `modelos` | Gestão de modelos | Modelos de PT (criar, importar, ativar) e Identidade visual |
| `auditoria` | Auditoria | Tela de Auditoria e verificação da trilha |
| `exportacao` | Exportação de auditoria | Gerar e baixar exportações da trilha |

6. **Perfil:**
   - nome único na unidade (até 80 caracteres), descrição (até 500), **ao menos uma permissão** e situação (ativo/inativo);
   - perfil inativo não concede nada.
7. **Grupo:**
   - nome único, descrição, situação, **0 a 10 perfis**, **0 ou mais plantas** e membros (até 1.000);
   - grupo inativo não concede nada.
8. **Permissões efetivas** de uma pessoa, recalculadas em **cada chamada à API**: diretório ∪ permissões dos perfis **ativos** dos grupos **ativos** de que ela é membro.
   - Pessoa com conta desativada ou expirada não entra, como hoje.
   - Ao tirar alguém de um grupo, ou desativar o grupo ou o perfil, a permissão cai na ação seguinte da pessoa.
9. **Sem autoconcessão** (conferido na API **e** no banco). Quem age precisa ter **todas** as permissões envolvidas para:
   - criar ou alterar um perfil (as permissões do perfil);
   - pôr um perfil num grupo, ou tirar dele;
   - adicionar alguém a um grupo que tem perfis (as permissões de todos os perfis do grupo).

   Exemplo: quem só tem `cadastro` não cria perfil com `auditoria` e não põe ninguém num grupo de Administradores. Tentativa recusada → 403, registrada na auditoria como negada.
10. **Quem gerencia:** Grupos e Perfis exigem `cadastro` (como hoje). Quem não tem `cadastro` pode **ver** os perfis e as próprias permissões, mas não edita.
11. **Auditoria:** criar, alterar e desativar perfil; vínculo e desvínculo entre grupo e perfil; inclusão e retirada de planta e de membro. Cada evento registra o antes e o depois. O login passa a registrar as permissões efetivas e de onde cada uma veio.
12. **Proteção contra perder o último administrador:** não é possível desativar ou alterar um perfil, nem tirar um membro, se isso deixar **ninguém** com `cadastro` na unidade. Essa conta considera também quem tem a permissão pelo diretório. A mensagem é: "Ninguém mais teria Gestão de cadastros".

## 5. Experiência

### 5.1 Navegação

- **Cadastros:** Gestão de Ativos · Pessoas · **Grupos** · **Perfis de acesso**. Grupos sai de "Governança e sistema" e vem para Cadastros, perto de Pessoas.
- **Governança e sistema:** Delegações · Auditoria.
- **Quem não tem `cadastro`** vê "Perfis de acesso" em **Consultas**, só leitura.
- **Rotas:** `#grupos`, `#grupos/<id>` (grupo aberto), `#perfis` e `#perfis/<id>`.

### 5.2 Tela Grupos (desktop)

```
┌ Grupos ──────────────────────────────────────────────────── [+ Novo grupo] ┐
│ Agrupamento de pessoas por papel: base dos perfis de acesso e notificações │
├───────────────────────────┬────────────────────────────────────────────────┤
│ 🔍 Buscar grupo           │ Administradores  [Administrador]  [✎ Editar]  │
│ GRUPOS (4)  [Ativos ▾]    │                                  [⊘ Desativar]│
│ ┌──┐ Administradores [ADM]│ Gestão completa do PTW na unidade             │
│ │👥│ 2 membros            │ [Planta Norte] [Planta Sul]                   │
│ ┌──┐ Gestores SMS   [SMS] │ PERMISSÕES CONCEDIDAS                         │
│ │👥│ 1 membro             │ ✓ Gestão de cadastros  ✓ Gestão de modelos …  │
│ …                         │ MEMBROS (2)                 [+ Adicionar]     │
│                           │ (MC) Marina Costa · marina.costa          ✕   │
│                           │ (JR) Joana Reis · joana.reis              ✕   │
└───────────────────────────┴────────────────────────────────────────────────┘
```

**Lista (coluna de 21 rem)**
- Busca por nome e filtro de situação (Ativos, Inativos, Todos).
- Cada item mostra ícone em quadrado índigo escuro (`brand-navy`), nome, "n membro(s)" e a pílula do primeiro perfil (com "+1" quando há mais de um).
- O grupo inativo aparece esmaecido, com a marca "inativo".

**Detalhe**
- **Cabeçalho:** nome, pílulas dos perfis, "Editar grupo" (contorno) e "Desativar"/"Reativar" (contorno vermelho/verde), descrição e pílulas das plantas.
- **Bloco "Permissões concedidas":** a soma das permissões dos perfis ativos, com ícone e nome. Se não houver nenhuma: "Este grupo não concede permissões de acesso".
- **Bloco "Membros (n)":**
  - cada membro com avatar de iniciais, nome, login e ✕ para remover (pede confirmação);
  - "+ Adicionar membro" abre um modal com busca e seleção múltipla de pessoas ativas que ainda não estão no grupo;
  - pessoa sem login mostra a marca "contato · não entra no sistema".

**Modal "Novo grupo" / "Editar grupo"** (com ícone em quadrado, título e subtítulo, como nos modais do SGI):
- **Nome do grupo** (placeholder "Ex.: Aprovadores Leste").
- **Perfis:** seleção múltipla dos perfis ativos. Cada opção mostra as permissões do perfil. Perfis que a pessoa não pode conceder aparecem desativados, com a explicação "Você não tem Auditoria".
- **Plantas:** seleção múltipla das plantas ativas.
- **Descrição.**
- **Ativo:** chave liga/desliga, só na edição.
- **Prévia:** "Membros deste grupo passam a ter: Gestão de cadastros, Auditoria".
- Botões **Cancelar** e **Criar grupo** / **Salvar alterações**.

### 5.3 Tela Perfis de acesso

- **Cabeçalho:** "Perfis de acesso", "Conjuntos de permissões concedidos às pessoas pelos grupos" e "+ Novo perfil".
- **Tabela:**
  - Perfil (nome e descrição);
  - Permissões (pílulas);
  - Grupos (quantos, com link);
  - Pessoas com o perfil (quantas, únicas);
  - Situação;
  - Ações: Editar e Desativar/Reativar.
- **Modal do perfil:**
  - Nome e Descrição;
  - **Permissões:** caixas de seleção com nome e explicação de cada uma (tabela da regra 5). As que a pessoa não tem ficam desativadas;
  - Ativo.

  Ao alterar um perfil em uso, aparece o aviso: "Afeta n pessoas em m grupos".
- **Linha clicada** (`#perfis/<id>`): detalhe com as permissões, os grupos que usam o perfil e as pessoas que o recebem.

### 5.4 Pessoa (ficha)

Bloco novo **"Permissões de acesso"**: cada permissão efetiva com a origem, por exemplo "Diretório (LDAP)" ou "Grupo Administradores · perfil Administrador". Sem permissões: "Somente operação (assinar e acompanhar PTs conforme os cargos)".

### 5.5 Tablet e celular

- **Grupos:**
  - abaixo de 1024 px vira **lista → detalhe**, com "← Grupos" para voltar;
  - membros em lista de toque com no mínimo 44 px;
  - os modais viram folha inferior no celular, como nos outros cadastros.
- **Perfis:** abaixo de 768 px a tabela vira cartões.
- Nenhuma rolagem lateral.

### 5.6 Estados

| Estado | Comportamento |
|---|---|
| Sem grupos ou perfis | Estado vazio com ícone e botão "Novo grupo" / "Novo perfil". |
| Recusa por autoconcessão | Mensagem do servidor no modal. Nada é gravado. |
| Recusa por último administrador | Mensagem: "Ninguém mais teria Gestão de cadastros". |
| Revisão desatualizada (outra pessoa editou) | "Este grupo foi alterado por outra pessoa. Recarregue." |
| Servidor fora | Botões desativados, como nas outras telas. |

### 5.7 Design system

- Mesmos tokens e componentes já usados:
  - `Page` e `PageHeader`;
  - `FormDialog` largo;
  - `SearchSelect` e `PickList` para as seleções múltiplas;
  - pílulas `primary-soft`, avatar de iniciais e cartões com borda de 1 px e raio de 8 px.
- Ícones lucide: grupo, escudo com check para perfil e chave para permissão.

## 6. Dados e API

### 6.1 Banco (aditivo)

| Objeto | Descrição |
|---|---|
| `ptw.access_profile` | `unit_id, id, name, description, permissions text[]` (subconjunto do catálogo, ≥ 1), `active, revision, updated_at`. Nome único (sem diferenciar maiúsculas). RLS e auditoria. |
| `ptw.person_group_profile` | `unit_id, group_id, profile_id` (PK). RLS e auditoria (`cadastro.grupo.perfil.incluido/removido`). |
| `ptw.person_group_scope` | `unit_id, group_id, location_id` (só plantas: local sem pai). RLS e auditoria. |
| `ptw.person_access_grants(unit, person)` | Devolve as permissões dos perfis ativos dos grupos ativos da pessoa. É usada pela API em cada chamada e pela ficha da pessoa. |
| `ptw.set_context(…, p_grants text[])` | O contexto passa a levar as permissões efetivas de quem age, para as travas do banco. |
| Gatilhos de trava | Autoconcessão (regra 9) e último administrador (regra 12). Erro `42501` / `PTW35`. |

A sessão (`api_session.grants`) continua gravando só o que veio do diretório no login. O que vem dos grupos é somado em cada chamada.

### 6.2 API (contrato `openapi.yaml`)

- `GET/POST /access-profiles`, `PUT /access-profiles/{id}`: alterar exige If-Match, e desativar é `active:false`.
- `PersonGroup` ganha `profileIds` e `plantIds`. Criar e alterar grupo seguem as rotas atuais, com as regras 9 e 12.
- `GET /session` passa a devolver as `grants` efetivas e `grantSources: [{ grant, from: "diretorio" | "grupo", groupId?, profileId? }]`.
- `GET /people/{id}` ganha `accessGrants` com as origens (para quem tem `cadastro`, ou a própria pessoa).
- A verificação de permissão de cada operação (`checkGrants`) passa a usar as efetivas.

### 6.3 App

- `core/accessProfiles.ts` (regras puras):
  - catálogo de permissões e textos;
  - soma das permissões de um grupo;
  - verificação de autoconcessão;
  - pessoas afetadas por uma mudança.
- O app consulta a sessão novamente depois de salvar grupo, perfil ou membro e quando chega o evento de cadastro. Assim o menu da própria pessoa muda na hora (por exemplo, Cadastros aparece ou some).

### 6.4 Dados de exemplo (instalação nova)

| Perfil | Permissões |
|---|---|
| Administrador | as 4 |
| Gestor de cadastros | `cadastro` |
| Gestor de modelos | `modelos` |
| Gestor SMS | `auditoria`, `exportacao` |

Grupos de exemplo:
- **Administradores** (Marina): perfil Administrador, plantas Norte e Sul.
- **Gestores SMS** (Joana): perfil Gestor SMS.
- **Executantes Norte** (Paulo, Sérgio): sem perfil, só organização.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | A tela Grupos segue o layout SGI (lista + detalhe, pílulas, plantas, membros) e fica em Cadastros. |
| CA-02 | Criar, editar, desativar e reativar grupo funcionam, com auditoria. Nenhum grupo é apagado. |
| CA-03 | O modal do grupo tem Perfis (vários), Plantas (várias) e mostra a prévia das permissões concedidas. |
| CA-04 | Adicionar e remover membros pelo detalhe, com confirmação ao remover. |
| CA-05 | A tela Perfis de acesso (Cadastros) cria, edita, desativa e reativa perfis, com permissões explicadas, e mostra grupos e pessoas afetadas. |
| CA-06 | Membro de grupo ativo com perfil ativo recebe as permissões **sem novo login**: o menu e as ações aparecem na próxima ação. |
| CA-07 | Tirar a pessoa do grupo, ou desativar grupo ou perfil, retira a permissão na próxima chamada (a API responde 403 e o menu some). |
| CA-08 | As permissões do diretório continuam valendo e nunca são retiradas por grupo ou perfil. |
| CA-09 | Ninguém concede permissão que não tem: perfil, perfil no grupo, membro em grupo com perfis. Recusa com 403 na API **e** no banco, registrada como negada. |
| CA-10 | Não é possível ficar sem ninguém com `cadastro` na unidade. |
| CA-11 | A ficha da Pessoa mostra as permissões efetivas e a origem de cada uma. |
| CA-12 | A auditoria registra perfis, vínculos, membros e as permissões efetivas no login. A cadeia continua íntegra. |
| CA-13 | Tablet e celular sem rolagem lateral; lista → detalhe; toques com no mínimo 44 px. |
| CA-14 | Só tokens e componentes do design system atual. Contraste AA e teclado. |
| CA-15 | Cargos, assinatura, delegações e as demais telas sem mudança. Os testes atuais passam. |

## 8. Casos de teste

**Banco** (`db/tests/access_profiles.sql`, incluído em `invariants.sql`)
- Perfil sem permissão e permissão fora do catálogo são recusados.
- Nome duplicado é recusado.
- `person_access_grants`:
  - membro de grupo ativo com perfil ativo recebe as permissões;
  - grupo inativo, perfil inativo, pessoa desativada e conta expirada não recebem.
- Autoconcessão recusada (contexto só com `cadastro` tentando `auditoria`) nos três caminhos da regra 9.
- Último administrador protegido.
- RLS: outra unidade não lê.
- Auditoria registra os eventos e a cadeia continua íntegra.

**API** (`api/test/accessProfiles.test.ts`, PostgreSQL real)

| Caso | Roteiro |
|---|---|
| CT-01 | Marina (as 4 permissões) cria o perfil "Gestor de cadastros" e o grupo "Cadastro Norte" com esse perfil e Paulo como membro. |
| CT-02 | Paulo, **na mesma sessão aberta antes**, passa a conseguir criar um local (201). `GET /session` mostra `cadastro` com origem no grupo. |
| CT-03 | Marina tira Paulo do grupo. A chamada seguinte de Paulo recebe 403. |
| CT-04 | Desativar o perfil ou o grupo também retira a permissão. Reativar devolve. |
| CT-05 | Rafael, com só `cadastro` concedido por grupo, tenta criar um perfil com `auditoria`, pôr o perfil Administrador num grupo e adicionar alguém ao grupo Administradores: os três dão 403 e são registrados como negados. |
| CT-06 | Tentar tirar o último detentor de `cadastro`: 422 com a mensagem da regra 12. |
| CT-07 | Revisão desatualizada: 409. |

**App** (`core/accessProfiles.test.ts`): soma de permissões, autoconcessão e pessoas afetadas.

**Tela** (Playwright, API real e dados de exemplo)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | A lista e o detalhe seguem o SGI. Criar o grupo "Cadastro Norte" com o perfil Gestor de cadastros e a Planta Norte. |
| CT-UI-02 | Adicionar Paulo ao grupo. Em outra janela, logado como Paulo: depois de uma ação, o menu **Cadastros** aparece e ele cria um local. |
| CT-UI-03 | Remover Paulo do grupo: Cadastros some do menu dele e a criação é recusada. |
| CT-UI-04 | Tela Perfis: criar, editar com o aviso de pessoas afetadas, desativar e reativar. |
| CT-UI-05 | Perfis que a pessoa não pode conceder aparecem desativados, com a explicação. |
| CT-UI-06 | A ficha de Paulo mostra "Gestão de cadastros · Grupo Cadastro Norte". |
| CT-UI-07 | Capturas em 1440, 820 e 390 px, sem rolagem lateral. |

**Roteiro manual no localhost:** CT-UI-01 a CT-UI-06, com Marina e Paulo em janelas diferentes (uma delas anônima).

## 9. Impacto e riscos

- **Segurança.** Esta é a primeira vez que o PTW concede permissões fora do diretório. As principais proteções são as regras 9 e 12, conferidas também no banco, mais a auditoria.
- **Instalação nova:** zerar a base para ter os perfis e grupos de exemplo, ou rodar o script.
- **Banco hospedado (Supabase):** script aditivo `deploy/releases/2026-11-25-grupos-perfis.sql`, para rodar **antes** do push. Ele cria tabelas, funções e gatilhos e muda `set_context`. Os grupos existentes ficam sem perfis, ou seja, nada muda de permissão até alguém configurar.
- **LDAP de homologação na Vercel:** continua igual. As permissões do diretório seguem valendo.
- **Desempenho:** uma consulta indexada a mais por chamada (membros × grupos × perfis), com custo desprezível na escala da unidade.
- **Documentação:** `DESIGN.md`, `AGENTS.md`, `db/MODELO.md` e o contrato.

## 10. Plano de execução

1. **Banco:** tabelas, `person_access_grants`, `set_context` com permissões, gatilhos (regras 9 e 12), RLS, privilégios, auditoria e testes de invariantes.
2. **API:**
   - contrato `access-profiles` e os campos novos de grupo e sessão;
   - permissões efetivas por chamada no `checkGrants`, com as origens;
   - repositórios e testes com banco real.
3. **App (regras):** `core/accessProfiles.ts` e testes; porta de dados e hooks.
4. **App (telas):**
   - `GroupsView` no formato SGI (lista, detalhe, modal, adicionar membro);
   - `ProfilesView` (nova);
   - bloco na ficha da Pessoa;
   - menu (Cadastros) e rotas.
5. **Dados de exemplo** e script do Supabase, com ensaio sobre o esquema de 24/11.
6. **Verificações:** testes de tela CT-UI-01 a CT-UI-07, capturas, documentação e cópia para a sua pasta.

## 11. Pontos para você decidir

1. **O que um perfil concede.** Proposta: só **permissões de acesso** (as 4). Os **cargos de assinatura** continuam na pessoa, porque têm validade individual (treinamento NR-10) e escopo de local. A alternativa é o perfil também conceder cargos, como os tipos Aprovador e Executante do SGI, mas isso exige definir validade e escopo do cargo pelo grupo.
2. **Plantas do grupo.** Proposta: registrar e exibir, com as permissões valendo para a unidade inteira nesta versão. A alternativa é já limitar as permissões às plantas do grupo, o que é bem maior: cada tela de cadastro teria que filtrar e travar por planta.
3. **Quando a permissão passa a valer.** Proposta: **na hora** (próxima ação). A alternativa é só no próximo login, o que é mais simples mas deixa permissão retirada valendo até a sessão expirar (12 h).
4. **Onde fica Grupos.** Proposta: mover para **Cadastros**, junto de Perfis e Pessoas. A alternativa é deixar em Governança e pôr só Perfis em Cadastros.
5. **Perfis iniciais.** Proposta: Administrador, Gestor de cadastros, Gestor de modelos e Gestor SMS (seção 6.4). Quer outros nomes ou combinações?
6. **"Remover" do SGI.** Proposta: **Desativar/Reativar**, mantendo o histórico, como no resto do PTW.

## 12. Resultado da execução (25/11/2026)

Aprovado com "pode seguir com o recomendado": as 6 propostas da seção 11 foram seguidas.

**Verificações**

| Camada | Resultado |
|---|---|
| Banco (`db/tests/invariants.sql`, com `access_profiles.sql`) | OK, 687 verificações |
| API (PostgreSQL real; inclui `accessProfiles.test.ts` CT-01 a CT-08) | 207 testes passaram |
| App (`vitest`, inclui `core/governance.test.ts` e `core/navigation.test.ts`) | 446 testes passaram |
| `tsc`, `eslint` (app e API), `vite build`, `sync-shared --check` | sem erros |
| Script do Supabase (esquema de 24/11 → script) | `pg_dump -s` idêntico ao esquema novo criado do zero |

**Tela** (Playwright, API real, dados de exemplo; Marina, Paulo e Joana em janelas separadas e só com as permissões dos grupos)

| Caso | Resultado |
|---|---|
| CT-UI-01 | PASSOU: Grupos SGI e Perfis de acesso na seção Acesso; Governança só com Delegações e Auditoria. |
| CT-UI-02 | PASSOU: lista com os 3 grupos e o perfil em pílula; detalhe com perfis, plantas, permissões concedidas e membros; `#grupos/<id>`. |
| CT-UI-03 | PASSOU: perfil "Leitor de auditoria" criado e aberto em `#perfis/<id>`. |
| CT-UI-04 | PASSOU: grupo "Auditores internos" com a prévia "passam a ter: Auditoria"; Paulo adicionado pelo "+ Adicionar membro". |
| CT-UI-05 | PASSOU: Paulo, sem novo login, ganha Auditoria no menu na navegação seguinte. |
| CT-UI-06 | PASSOU: ficha de Paulo mostra "Auditoria · Origem: grupo Auditores internos · perfil Leitor de auditoria". |
| CT-UI-07 | PASSOU: grupo desativado (com confirmação), Paulo perde Auditoria. |
| CT-UI-08 | PASSOU: Marina tentar sair de Administradores é recusado: "Ninguém mais teria Gestão de cadastros…". |
| CT-UI-09 a 11 | PASSOU: Joana (Gestor SMS) vê Perfis em Consultas, sem botões de edição, e não abre Grupos. |
| CT-UI-12 | PASSOU: celular, lista → detalhe com "← Grupos". |
| Larguras | 1440, 820 e 390 px sem rolagem lateral em Grupos, Perfis e detalhe. Nenhum erro de JavaScript. |

**Diferenças em relação ao plano**

- Regras do app em `core/governance.ts` (já existia e é copiado para a API), não em `core/accessProfiles.ts`.
- A função do banco se chama `ptw.person_access_sources` e devolve também grupo e perfil. As permissões efetivas vão para o contexto por `set_config('ptw.grants')`; `set_context` não mudou.
- `GET /people/{id}/access` devolve os nomes do grupo e do perfil, porque quem consulta o próprio acesso pode não ter `cadastro` para ler os grupos.
- O login de desenvolvimento continua concedendo as 4 permissões do "diretório". Para testar só pelos grupos, use o LDAP de homologação ou contas sem grupos no AD.

**Arquivos principais**

- Banco: `db/schema/26_governance.sql`, `50_auditoria.sql`, `60_acesso.sql`, `db/tests/access_profiles.sql`.
- API: `openapi.yaml`, `src/session/access.ts`, `src/session/auth.ts`, `src/db.ts`, `src/repo/groups.ts`, `src/routes/groups.ts`, `src/routes/session.ts`, `test/accessProfiles.test.ts`.
- App: `components/registry/GroupsView.tsx`, `ProfilesView.tsx`, `Groups/*`, `PeopleView.tsx`, `core/governance.ts`, `core/navigation.ts`, `shell/nav.ts`, `App.tsx`, `data/*`.
- Publicação: `deploy/releases/2026-11-25-grupos-perfis.{sql,md}`.

**Ajuste de UI fiel ao protótipo SGI (25/11, após revisão)**

- Menu: seção **Acesso** com "Grupos SGI" e "Perfis de acesso" (antes em Cadastros); breadcrumb "Acesso › Grupos SGI" visível a partir de tablet.
- Título "Grupos SGI" e subtítulo do protótipo; lista sem busca, com "GRUPOS (N)" e "N membro(s)".
- Pílula do perfil em caixa alta com borda e cor por perfil (como APROVADOR/GESTOR_SMS/EXECUTANTE no SGI).
- Plantas pelo código (PNO, PSU, PLE); botões do cabeçalho pequenos; seção "MEMBROS" com "+ Adicionar membro".
- Reexecutado: CT-UI-01 a 12 passaram; 1440/820/390 px sem rolagem lateral; 446 testes do app; build OK.
- Diferenças que ficam: "Desativar" no lugar de "Remover" (decisão 6); login no lugar do e-mail (o cadastro não tem e-mail); seção "Permissões concedidas" a mais (necessária para mostrar o efeito dos perfis); grupo sem perfil fica sem pílula.
