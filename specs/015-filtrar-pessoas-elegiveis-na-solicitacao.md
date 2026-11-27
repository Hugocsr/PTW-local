# SPEC 015: Filtrar pessoas elegíveis na seleção de participantes da Solicitação

| | |
|---|---|
| Status | **Executada (26/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (bloco "Equipe"), campo "Pessoa" dos formulários da PT, API de gravação da equipe |

## 1. Resposta curta

A regra de elegibilidade **existe e é uma só** (banco `ptw.person_ineligible`, espelhada em `core/eligibility.ts`). O problema é que **as telas de escolha não a usam para filtrar**:

1. **Equipe da Nova PT:** a lista mostra quem tem `status = ativo` e o cargo. **Não confere** conta desativada ou vencida, validade do cargo nem se o escopo do cargo cobre o **local** da PT. Quem está nessa lista pode ser recusado depois: nas PTs com controle elétrico, a primeira assinatura (solicitação, emissão, aceite) volta **"Equipe contém pessoa não elegível" (PTW34)**. É o bloqueio "no final do fluxo" do pedido.
2. **Campo "Pessoa" do formulário** (vigia, executantes etc.): a lista mostra todo mundo que não está inativo e **só escreve "não elegível: motivo" ao lado do nome**; a pessoa ainda pode ser escolhida e a resposta é recusada ao salvar (PTW08).
3. Nas PTs sem controle elétrico, a equipe **nunca é validada**: a pessoa não elegível entra sem aviso, e só aparece como problema se alguém a assumir depois.

O pedido é transformar a regra em **filtro da lista**, mostrar **por que** a lista é curta e **validar antes** da conclusão.

## 2. Como funciona hoje (conferido)

| Lugar | O que lista hoje | O que confere | Quando o erro aparece |
|---|---|---|---|
| Equipe (`NewPermitView`, por cargo do modelo) | `ativo` + tem o cargo | Nada além disso | Só na assinatura de PT elétrica (PTW34, "Equipe contém pessoa não elegível"); em PT comum, nunca |
| Campo "Pessoa" com **Deve estar elegível hoje** (`FillItem`) | Não inativo (+ cargo, se o item pede um); inclui "em revisão", conta desativada e vencida | Só escreve o motivo ao lado do nome e uma linha vermelha | Ao salvar a resposta (PTW08): nada é gravado |
| Campo "Pessoa" sem a opção | Não inativo (+ cargo) | O banco só confere se a pessoa existe e tem o cargo | Não há problema de elegibilidade (decisão do modelo) |
| Assinatura (quem pode assinar o passo) | Já é só quem é elegível (`checkSlotAt`, `person_ok`) | Cargo, escopo, conta, login | Já filtrado: sem mudança |

A regra completa (`person_ineligible`): cadastro **ativo** (não inativo, não em revisão); se tem login, conta **ativa e não vencida**; com cargo exigido, o cargo **válido hoje** (`valid_until >= hoje`) e com **escopo que cubra o local** da PT. Quem assina precisa também de **login**; quem só participa (vigia, equipe) pode ser contato sem login.

Os dados já estão no app: `state.people` com cargos, validade, conta, e `pathIds` (o local e seus ancestrais) já chega ao formulário da PT. Na Nova PT o local é escolhido antes da equipe. A API de pessoas também aceita `eligibleAt` (devolve o motivo por linha).

## 3. Objetivo

1. Quem aparece para escolher **é elegível** para aquela PT, naquele local, hoje.
2. Quem **não** é elegível **não aparece**; a tela diz **o critério** em uma frase e, se ninguém serve, **por quê**.
3. A recusa **não surge só no fim**: o app e a API recusam ao escolher/salvar.
4. Com os outros requisitos atendidos, a solicitação **conclui**.

## 4. Escopo

**Dentro**
- Uma função pura única em `core/eligibility.ts` (`eligiblePeople`), usada por todos os seletores, com os testes da regra do banco.
- Equipe (Nova PT / Editar rascunho): só elegíveis para o cargo **no local escolhido**; sem local, a equipe avisa "Escolha o local primeiro".
- Campo "Pessoa" com **Deve estar elegível hoje**: lista só elegíveis.
- Texto de orientação sob o campo e mensagem de lista vazia.
- Quem já foi escolhido e **deixou de ser elegível** (cargo ou conta venceu depois): continua visível, **em vermelho com o motivo**, e **bloqueia o envio** até ser trocado.
- API: ao gravar a equipe (`POST/PATCH /permits`, `team`), recusa a pessoa não elegível com `PTW08` e o motivo (hoje só o controle elétrico confere, e só na assinatura).
- Testes (função pura, componente, API com banco real) e documentação.

**Fora**
- Regra de assinatura (já filtra) e delegação.
- Mudar quem é elegível (o critério é o do banco).
- Banco de dados: **sem script** para o Supabase (a conferência nova fica na API, que já tem acesso a `person_ineligible`).

## 5. Comportamento esperado

**Equipe.** Para cada cargo do modelo, a lista oferece só quem: tem cadastro ativo; tem conta ativa e no prazo, se tiver login; tem **aquele cargo válido hoje** e com escopo que cobre o local da PT. Sob o campo: "Aparecem só pessoas com o cargo *Eletricista* válido hoje para *Prensa 2*, com cadastro e conta ativos." Sem ninguém: "Ninguém atende ao cargo neste local. Peça ao administrador para conferir o cargo, a validade e o escopo."

**Campo "Pessoa".** Com **Deve estar elegível hoje**: só elegíveis (sem cargo no item: cadastro e conta; com cargo: o mesmo da equipe, usando o local da PT). Sem a opção: continua como hoje.

**Mudou depois.** Se a pessoa escolhida ficar não elegível, a linha mostra "Fulano: conta vencida" em vermelho e o botão de envio explica "Troque Fulano: conta vencida".

**API.** Gravar equipe com pessoa não elegível devolve 422 `PTW08` "Fulano não elegível (motivo)", sem gravar nada.

## 6. Decisões (26/11/2026)

1. **Equipe em PT sem controle elétrico:** filtrar sempre.
2. **Campo "Pessoa" sem "Deve estar elegível hoje":** filtrar também.
3. **Pessoa escolhida que deixa de ser elegível:** continua visível em vermelho e bloqueia o envio.
4. **API:** também valida e recusa.
5. **Equipe antes do local:** desabilitada, "Escolha o local primeiro".
6. **Quem fica de fora:** não é listado.

## 7. Plano de testes

- Função pura: cargo vencido, escopo fora do local, conta desativada, conta vencida, cadastro em revisão/inativo, contato sem login (entra na equipe, não assina), vários cargos; iguala `person_ineligible` do banco.
- App: equipe só com elegíveis para o local; troca de local refiltra e retira quem não serve; campo "Pessoa" filtra; lista vazia mostra a orientação; pessoa que vence depois fica em vermelho e bloqueia.
- API (banco real): equipe com pessoa não elegível → 422 `PTW08`; elegível → 200; PT elétrica conclui a assinatura sem PTW34 com a equipe filtrada.
- Fluxo completo no navegador: criar PT, escolher equipe, enviar e assinar sem recusa.
- `npm run check`, testes da API, `sync-shared`.

## 8. Como entregar

Sem mudança de banco. Docker e git como nas entregas anteriores; a API muda (recusa na equipe), então reconstruir o `ptw-server`.

## 9. Resultado da execução

**Como ficou:**
- `core/eligibility.ts`: `eligiblePeople`, `teamIneligible`, `eligibilityHint` e `NOBODY_ELIGIBLE` (cópia em `api/src/shared`, `sync-shared` com 41 arquivos iguais).
- **Equipe** (`NewPermitView`): só elegíveis para o cargo no local; desabilitada sem local; frase do critério ou aviso de lista vazia; quem venceu depois fica em vermelho e bloqueia o botão e o salvamento automático.
- **Campo "Pessoa"** (`FillItem`): só elegíveis (a mesma função); quem já estava escolhido e deixou de servir fica em vermelho com "Troque esta pessoa".
- **API** (`repo/permits/acts.ts`, `assertTeamEligible`): `createPermit`, `updatePermit` (com equipe ou local) e `submitPermit` devolvem 422 `PTW08` "Equipe: Nome não elegível (motivo)" e nada é gravado. Modo memória: o Enviar recusa igual (`reducer.ts`).
- Banco e Supabase: sem mudança. A API precisa ser reconstruída.

**Diferenças e limites:**
- Trocar o **local** de um rascunho com equipe fora do novo escopo agora é recusado pela API; na tela, o aviso vermelho aparece e o salvamento espera a troca.
- O filtro do campo "Pessoa" sem a opção "Deve estar elegível hoje" é só de tela: o banco continua aceitando quem tenha o cargo (decisão do modelo).
- O campo "Pessoa" foi conferido por tipos, lint e pela função pura; no navegador conferi a Equipe (lista, desabilitada sem local, lista vazia) mas não o campo "Pessoa" (fica em etapa posterior da PT demo).

| Caso | Resultado |
|---|---|
| Cargo vencido, escopo fora do local, conta desativada ou vencida, em revisão, inativo, contato sem login, outro cargo | Passou (`eligiblePeople`, igual a `personIneligible` para todos) |
| Equipe: sem local desabilitada; com local só elegíveis; lista vazia mostra a orientação | Passou (navegador) |
| API: criar elegível (contato sem login) 201; criar com não elegível 422 PTW08 e nada gravado | Passou (banco real, `team-eligibility.test.ts`) |
| API: alterar equipe com não elegível 422, equipe anterior intacta; enviar com cargo vencido depois 422 PTW08 | Passou (banco real) |
| `npm run check` (467 testes), API (225 passaram, 8 pulados), `sync-shared` | Passou |

