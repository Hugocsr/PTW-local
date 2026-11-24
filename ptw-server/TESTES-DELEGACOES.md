# Casos de teste — Delegações (SGI · Aprovação › Delegações)

Tela `#delegacoes`, no formato do SGI Forces. Os casos usam o cadastro de exemplo carregado pelo
instalador depois de zerar o banco (`python tools/ptw_instalar.py --local`).

## Dados de exemplo usados

| Pessoa | Login | Papel no teste |
|---|---|---|
| Joana Reis | joana.reis | Aprovadora nominal de "Soldagem em tubulação de vapor · Aprova a soldagem (gerência da área)"; Supervisão na unidade toda |
| Marina Costa | marina.costa | Admin; aprovadora nominal de "Intervenção desenergizada em painel · Autoriza a intervenção (gerência)"; Supervisão na unidade toda |
| Rafael Nunes | rafael.nunes | Supervisão **só na Planta Norte** |
| Paulo Lima | paulo.lima | Sem cargo de Supervisão |

## Automatizados

| Onde | O que cobre | Como rodar |
|---|---|---|
| `db/tests/delegations.sql` (dentro de `invariants.sql`) | Regras do banco: mandato geral, escopo, sete dias, início no passado, sobreposição, revogação, auditoria, assinatura técnica indelegável | `db/tests` com o banco de teste |
| `api/test/delegations.test.ts` (CT-01 a CT-06, banco de verdade) | Criação, recusas (422/409), escopo por planta, assinatura da PT pelo delegado em nome da Joana, revogação, visibilidade sem papel de cadastro | `PTW_TEST_DB=1 npx vitest run test/delegations.test.ts` |
| `ptw-mockup-v2/src/core/delegationView.test.ts` e `delegation.test.ts` | Delegantes, delegados elegíveis por escopo, período em dias, rótulos, filtros, quando revogar | `npm test` |

## Roteiro manual em https://localhost (resultado esperado entre parênteses)

Entrar como **marina.costa** e abrir **Governança › Delegações**.

1. **CT-UI-01:** tela vazia (título "Delegações", subtítulo "Transferência temporária de poderes de aprovação", "Nenhuma delegação registrada.").
2. **CT-UI-02:** abrir "Nova delegação" e a lista Delegante (só Joana Reis e Marina Costa).
3. **CT-UI-03:** Delegante Joana, Escopo "Todas as plantas", lista Delegado (só Marina Costa).
4. **CT-UI-04:** mudar Escopo para Planta Norte (Rafael Nunes passa a aparecer; Joana nunca aparece).
5. **CT-UI-05:** Delegado Rafael, Fim daqui a 10 dias ("A delegação vale no máximo 7 dias corridos.", botão bloqueado).
6. **CT-UI-06:** Fim daqui a 3 dias, Observação "Viagem técnica", Criar (linha Joana → Rafael, Planta Norte, status **ativa**).
7. **CT-UI-07:** nova delegação Joana → Marina, todas as plantas, até amanhã (o banco recusa: "Já existe delegação sobreposta…"; nada é criado).
8. **CT-UI-08:** nova delegação Marina → Joana, início daqui a 2 dias, fim daqui a 4, "Recesso" (status **agendada**).
9. **CT-UI-09:** filtro "Agendada" ("1 de 2").
10. **CT-UI-10:** Limpar e "Período de" = daqui a 4 dias (só a "Recesso").
11. **CT-UI-11:** Limpar ("2 de 2").
12. **CT-UI-12:** ícone vermelho de revogar na linha Joana → Rafael (botão "Revogar delegação" bloqueado até informar o motivo).
13. **CT-UI-13:** motivo "Retorno antecipado", revogar (status **revogada**, sem ação; as assinaturas anteriores continuam).
14. **CT-UI-14 (uso na PT):** com uma delegação Joana → Rafael ativa na Planta Norte, criar uma PT de "Soldagem em tubulação de vapor" numa área da Planta Norte e enviar. Entrar como rafael.nunes (a pendência "Aprovação da gerência" aparece para ele; ao assinar, a PT mostra Rafael em nome de Joana Reis). Numa área da Planta Sul, Rafael não pode assinar.
15. **CT-UI-15 (visibilidade):** quem não tem o papel de cadastro vê só as delegações em que é delegante ou delegado e não cria nem revoga.

Os passos 1 a 13 foram executados automaticamente (Playwright) contra a API e o PostgreSQL com o
cadastro de exemplo: 13 de 13 passaram. Os passos 14 e 15 estão cobertos por CT-04 e CT-06 da API.
