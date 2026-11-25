# SPEC 007: Usuários no formato SGI (perfis, grupos e cargos num só lugar)

| | |
|---|---|
| Status | **Executada (25/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência visual | Protótipo SGI Forces Backoffice: tela "Usuários" e modais "Editar usuário", "Pré-provisionar usuário", "Importar usuários" e "Confirmar alteração de status" |

## 1. Contexto

### Como funciona no protótipo SGI

- **Uma tabela:** Ativo (chave), Usuário (avatar e nome), E-mail, Plantas (pílulas PNO/PSU), Perfis (pílulas em caixa alta) e Ações (um botão).
- **Barra:** busca por nome ou e-mail, filtro de planta, filtro de status e "N resultado(s)".
- **No topo:** "Importar CSV" e "Pré-provisionar", com um aviso amarelo explicando o pré-provisionamento.
- **"Editar usuário"** é um modal com nome, e-mail, **Plantas** e **Perfis** escolhidos por pílulas clicáveis. Tudo o que define o acesso de alguém fica num lugar só.
- **A chave Ativo** pede confirmação: "Desativar o usuário …? O histórico é preservado."

### Como funciona hoje no PTW

- A tela **Pessoas** (Cadastros) é uma tabela com Pessoa, Empresa, Login, Cargos e Conta. Clicar abre a página da pessoa.
- **O acesso está espalhado em três lugares:**
  - **Cargos** (o que a pessoa assina, com local e validade) ficam na página da pessoa, no botão "+ Cargo";
  - **Perfis de acesso** só chegam por **grupo**: para dar um perfil a alguém, é preciso ir em Acesso › Grupos SGI, abrir o grupo e adicionar a pessoa;
  - **Permissões** aparecem só como leitura, no fim da página da pessoa.
- **Na lista** não se vê o perfil nem a planta de ninguém.

### O problema

Para responder "o que o Marcos pode fazer?" ou "dar acesso de aprovador à Ana", o administrador passa por três telas. No SGI, isso é uma linha da tabela e um modal.

## 2. Objetivo

Dar à tela de usuários a **experiência do SGI**: ver e mudar o acesso de uma pessoa **na própria linha**, sem trocar de tela.

**O conceito não muda:**
- perfis continuam sendo concedidos **por grupo**;
- cargos continuam na pessoa, com local e validade;
- nada é apagado e tudo fica na auditoria.

Muda só **onde e como** se faz.

## 3. Escopo

**Entra**
1. A tabela no formato SGI: Ativo, Usuário, Login, Plantas, Perfis, Cargos e Ações.
2. Barra com busca, filtro de planta, filtro de status e contador.
3. **Modal "Acesso do usuário"** (o "Editar usuário" do SGI), com **Grupos**, que dão os perfis, e **Cargos**, editáveis ali mesmo.
4. Chave Ativo com o modal de confirmação do SGI.
5. "Nova pessoa" e "Importar" no topo, como "Pré-provisionar" e "Importar CSV" (ver decisão 2).
6. A página da pessoa (`#pessoas/<id>`) continua, para o detalhe completo e a auditoria.

**Não entra**
- Perfil atribuído direto à pessoa, sem grupo: mudaria o conceito (ver decisão 3).
- Mudanças no banco: as tabelas de grupo, perfil e cargo são as mesmas.
- SSO/JIT do SGI: o PTW continua com AD/LDAP e cadastro manual.

## 4. Regras

1. **Colunas da tabela:**

   | Coluna | O que mostra |
   |---|---|
   | **Ativo** | Chave. Desativada nas pessoas vindas do AD, com a dica "Situação vem do AD". |
   | **Usuário** | Avatar e nome. Embaixo, a empresa. |
   | **Login** | O login, ou "sem login". Fica no lugar do e-mail do SGI, porque o PTW identifica a pessoa pelo login. |
   | **Plantas** | Pílulas PNO/PSU, como no SGI: a soma das plantas dos grupos e das plantas onde a pessoa tem cargo. Nome completo no title. |
   | **Perfis** | Pílulas em caixa alta, com a cor por perfil da SPEC 002. Saem dos grupos ativos da pessoa. "—" se não tiver. |
   | **Cargos** | Os nomes; o vencido fica em âmbar com "(vencido)", como hoje. |
   | **Ações** | Botão "Editar acesso" (ícone de pessoa com engrenagem, como no SGI) e menu "Abrir página". |

   - Clicar no nome abre a página da pessoa.
   - Abaixo de 1024 px, Plantas e Cargos vão para baixo do nome; no celular a linha vira cartão.
2. **Barra:**
   - busca por nome, login ou matrícula;
   - filtros: "Todas as plantas" / planta, e "Todos os status" / Ativos / Inativos / Sem login;
   - contador "N resultado(s)".
3. **Modal "Acesso do usuário"**, com ícone em quadrado, título e subtítulo, como os modais do SGI:
   - **Cabeçalho:** nome e login, só leitura. Os dados de cadastro continuam em "Editar" na página.
   - **Grupos:** uma pílula clicável por grupo ativo, no estilo das Plantas/Perfis do SGI.
     - Ao lado de cada grupo, o perfil que ele dá, como "Manutenção Norte · APROVADOR".
     - Marcar ou desmarcar põe ou tira a pessoa do grupo.
   - **Resumo vivo, "Com isso, terá":**
     - as pílulas dos **perfis** e as **permissões** resultantes, recalculados a cada clique;
     - as **plantas** que vêm dos grupos.
   - **Cargos:** a lista atual (nome, local, validade), cada um com ✕, e "+ Cargo" na mesma linha (cargo, local, válido até), sem abrir outro modal.
   - **Rodapé:** Cancelar e "Salvar alterações". Nada é gravado antes de salvar. Sem mudança, o botão fica desabilitado.
4. **Segurança (a mesma de hoje):**
   - um grupo cujo perfil dá permissão que **quem edita não tem** aparece travado, com cadeado e a dica "Seu acesso não permite conceder este perfil";
   - grupo inativo não aparece;
   - pessoa **sem login** não recebe grupo (perfil não vale sem sessão): a seção mostra "Defina um login para dar perfis" e só cargos ficam editáveis.
5. **Salvar** grava tudo de uma vez: entra e sai de grupos e cargos numa só transação, com um registro de auditoria por grupo alterado (como hoje) e um para os cargos.
   - Se alguém mudou um dos grupos nesse meio tempo, nada é gravado e o modal avisa: "O grupo X mudou; reabra para ver a versão atual."
6. **Chave Ativo:**
   - pede a confirmação do SGI: "Desativar «Nome»? Ela não entra mais no PTW e não pode assinar. O histórico é preservado.";
   - reativar também confirma;
   - desativar **não** tira a pessoa dos grupos: ela só deixa de valer enquanto inativa.
7. **Sem permissão de cadastro:** a tela fica só leitura, sem chave, sem "Editar acesso" e sem os botões do topo, como hoje.

## 5. Experiência

- **Onde fica:** ver decisão 1.
- **Tablet e celular:**
  - o modal ocupa a tela inteira abaixo de 640 px;
  - as pílulas quebram linha;
  - toques de no mínimo 44 px.
- **Teclado:**
  - Tab percorre as pílulas, e Espaço marca ou desmarca;
  - Esc fecha o modal, e pede confirmação se houver mudança não salva.

## 6. Dados e API

- **Banco:** sem mudança.
- **API:** uma rota nova, `PUT /people/{id}/access-assignments`, para salvar de uma vez.
  - **Entrada:** `{ groupIds, groupRevisions, roles, revision }`.
  - Valida as mesmas regras de hoje (escalada de permissão 42501, revisão 409, login obrigatório para grupo) e grava numa transação.
  - Alternativa sem API nova: ver decisão 4.
- **Leitura:** a tabela usa o que já existe (pessoas, grupos e perfis), cruzado na tela; nenhuma consulta nova por linha.
- **Supabase:** só se a decisão 4 ficar com a rota nova; mesmo assim, sem script de banco.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | A tabela mostra Ativo, Usuário, Login, Plantas, Perfis, Cargos e Ações, no visual do SGI. |
| CA-02 | Pelo "Editar acesso" dá para pôr e tirar grupos (e ver os perfis e permissões resultantes) e incluir e remover cargos, sem sair da tela. |
| CA-03 | Perfis continuam vindo só de grupos; a página do grupo reflete as entradas e saídas feitas pelo modal. |
| CA-04 | Grupo com perfil acima do acesso de quem edita fica travado; pessoa sem login não recebe grupo. |
| CA-05 | Salvar é tudo ou nada, com auditoria; conflito de revisão avisa e não grava. |
| CA-06 | A chave Ativo confirma antes; pessoa do AD não tem a chave. |
| CA-07 | Filtros de planta e status e a busca funcionam juntos. Sem rolagem lateral em 820 e 390 px. Os testes atuais continuam passando. |

## 8. Casos de teste

**App (unitários):** plantas e perfis derivados de grupos e cargos; resumo "Com isso, terá"; travamento por escalada.

**API:** a rota nova grava grupos e cargos na mesma transação; 42501 ao conceder perfil acima do próprio acesso; 409 por revisão; 422 para grupo de pessoa sem login.

**Tela** (Playwright, API real)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | A tabela mostra perfis e plantas de quem está em grupo (ex.: Marina, com o perfil do grupo dela e a planta). |
| CT-UI-02 | Editar acesso de uma pessoa: marcar um grupo ativo do seed; o resumo mostra o perfil e as permissões; salvar; a linha mostra a pílula nova, e o grupo, o membro novo. |
| CT-UI-03 | No mesmo modal, "+ Cargo" Executante em Planta Norte até 31/12; salvar; aparece na coluna Cargos e na página. |
| CT-UI-04 | Um editor com só "Gestão de cadastros" vê travado o grupo cujo perfil dá "Auditoria". |
| CT-UI-05 | Pessoa sem login: grupos desabilitados com o motivo; cargos editáveis. |
| CT-UI-06 | Desativar pela chave: confirmação, a linha fica esmaecida, e o filtro "Inativos" a encontra. |
| CT-UI-07 | Filtro Planta Sul combinado com a busca. |
| CT-UI-08 | Capturas em 1440, 820 e 390 px; modal em tela cheia no celular. |

## 9. Pontos para você decidir

1. **Nome e lugar da tela:**
   - **Proposta:** "**Usuários**" na seção **Acesso**, junto de Grupos SGI e Perfis de acesso, como no SGI. `#pessoas` continua funcionando, e quem não tem cadastro a vê em Consultas.
   - **Alternativa:** manter "Pessoas" em Cadastros, só com o visual novo.
   - **Observação:** a tela também lista quem não tem login (só assina em papel ou é do cadastro); por isso o filtro "Sem login".
2. **Botões do topo:**
   - **Proposta:** "**Importar**" (o import de pessoas que já existe) e "**Nova pessoa**" como botão principal, sem o aviso amarelo de SSO/JIT, que não se aplica ao PTW.
   - **Alternativa:** usar os nomes do SGI ("Importar CSV", "Pré-provisionar").
3. **Perfil direto na pessoa** (como o SGI faz):
   - **Proposta:** **não**. O modal mostra os **grupos**, cada um com seu perfil; é o mesmo clique, e o conceito de grupo continua.
   - **Alternativa:** mostrar pílulas de **perfil**; ao marcar uma, o sistema põe a pessoa num grupo daquele perfil. Ambíguo quando há mais de um grupo com o mesmo perfil.
4. **Como salvar:**
   - **Proposta:** a **rota nova**, tudo ou nada.
   - **Alternativa:** a tela chama as rotas atuais em sequência (cada grupo e depois os cargos). Não precisa de API nova, mas uma falha no meio deixa parte salva.
5. **Coluna Cargos na tabela:**
   - **Proposta:** **manter**, porque no PTW é o cargo que diz quem assina, o que o SGI chama de Aprovador e Executante.
   - **Alternativa:** tirar da tabela e deixar só no modal e na página, mais fiel ao SGI.

## 10. Resultado da execução

**Decisões aplicadas:**
1. "Usuários" na seção Acesso. `#pessoas` continua; `#usuarios` é apelido.
2. Só "Nova pessoa", sem o aviso de SSO/JIT.
3. O modal mostra grupos com seus perfis; não há perfil direto na pessoa.
4. Uma rota nova, tudo ou nada.
5. A coluna Cargos fica.

**Correção em relação à proposta:** o PTW **não tem importação de pessoas**. A importação que existe é a de modelos de PT, e as pessoas vêm do AD ou do cadastro manual. Por isso o botão "Importar" não foi criado. Importar usuários por CSV/XLSX, como no SGI, pode ser uma próxima spec.

**Ajustes na execução:**
- A pessoa sem login recebe **400** (não 422): "Pessoa sem login não recebe grupo".
- Não há menu "Abrir página": o nome já abre a página.

**Como ficou:**
- **API:** `PUT /people/{id}/access-assignments` (operação 100 do contrato), em `repo/groups.ts` › `saveAccessAssignments`.
  - Reusa `saveGroup` (mesmas travas do banco: 42501 e "última pessoa com cadastro") e `updatePerson` para os cargos.
  - 409 cita o grupo que mudou.
- **App:**
  - `core/userAccess.ts`;
  - `Users/UsersView.tsx` e `Users/AccessDialog.tsx`;
  - `GroupPort.saveAssignments`, que põe a pessoa devolvida no cache;
  - `useAccessAssignments`;
  - navegação, com Pessoas → Usuários em Acesso.
- **Banco:** sem mudança.

| Caso | Resultado |
|---|---|
| CT-UI-01 menu Acesso › Grupos SGI, Usuários, Perfis; linha da Marina com PNO PSU e ADMINISTRADOR | Passou |
| CT-UI-02 Luís entra em "Gestores SMS": o resumo mostra GESTOR SMS, Auditoria e Exportação; gravado e auditado | Passou |
| CT-UI-03 no mesmo modal, cargo Executante em Planta Norte; aparece na coluna e no banco | Passou |
| CT-UI-04 sessão com só cadastro: "Administradores" travado com o motivo; "Executantes Norte" livre | Passou |
| CT-UI-05 sem login: grupos indisponíveis com o motivo; cargos editáveis | Passou |
| CT-UI-05b Esc com mudança pede "Descartar?"; descartar não grava | Passou |
| CT-UI-06 desativar pela chave com confirmação; o filtro Inativos acha; a chave do AD fica desativada | Passou |
| CT-UI-07 Planta Norte (inclui quem tem cargo lá) combinado com a busca | Passou |
| CT-UI-08 820 e 390 px sem rolagem lateral, na lista e no modal | Passou |

**Testes:**
- API com banco: 216 passaram.
  - CT-09 a CT-12 cobrem a rota nova: grupo e cargo juntos; 409 por revisão; sem login; escalada 403; tudo ou nada.
- App: 457 passaram.
- tsc, eslint e build limpos; 0 erros JS no e2e.

**Para subir:** deploy do **front e da API**; não há script do Supabase.
