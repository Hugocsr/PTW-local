# SPEC 008: Investigação: o aviso "Trabalho não liberado" na tela da PT

| | |
|---|---|
| Status | **Executada (27/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Onde aparece | Página da PT (`#pt/<id>`), no bloco de estado do topo à esquerda, inclusive na solicitação (rascunho) |

## 1. Resposta curta

- **Não é um status da PT.** O estado da PT é outro, como Rascunho, Em análise ou Emitida.
- **É uma linha de segurança** que a tela escreve **sempre que o trabalho de campo não está liberado agora**, qualquer que seja o estado. O objetivo é que ninguém leia uma PT e entenda que pode trabalhar, exceto no único caso em que pode.
- **A regra existe e está correta.** Mas hoje ela também aparece onde não ajuda ninguém, como no rascunho da solicitação ("Ainda não enviada. Trabalho não liberado."). Ali é ruído.

## 2. Origem

| Camada | Onde | O quê |
|---|---|---|
| **Banco** (fonte da verdade) | `ptw-server/db/schema/30_pt.sql` › `ptw.work_released(p)` | `state = 'ativa' and hold_reason is null and work_window @> now()` |
| **API** | `repo/permits/read.ts` | Devolve `released` em cada PT e no Quadro (`v_permit_board.released`) |
| **Núcleo do app** | `core/permitView.ts` › `workRelease(permit, now)` | A mesma regra, recalculada com a hora do servidor. Diz também o porquê: `estado`, `parada`, `janela_encerrada` ou `antes_da_janela`. Testada em `core.test.ts` ("Trabalho liberado só quando está liberado agora"). |
| **Tela** | `components/work/state.tsx` › `EstadoAutorizacao` (linha 80) | Escreve "Trabalho não liberado." **sempre que `released` é falso**. |
| **Cartão do Dashboard** | `Dashboard/PermitCards.tsx` (linha 130) | Texto fixo só para a PT suspensa: "Aguarda o novo Aceite no campo. Trabalho não liberado." |
| **Regras do projeto** | `AGENTS.md` (linha 32) e `DESIGN.md` (linhas 274 e 437) | "Trabalho liberado" só aparece nesse bloco e só quando o núcleo decide. O bloco é o único lugar do estado na PT. |

## 3. Regra de negócio

**Trabalho liberado** = PT **Ativa** (Aceite no campo feito) **e** sem parada registrada **e** dentro da janela (início e fim inclusive), **agora**.

Fora disso, o trabalho **não** está liberado. Como o bloco é verde só no caso liberado, a frase reforça o que a cor já diz e protege quem não distingue cores (acessibilidade).

**Sem servidor:** o bloco fica cinza com "Não verificável". Na página da PT, diz "Trabalho não liberado" e "Último estado conhecido: … Isto não é liberação."

## 4. Comportamento atual, estado por estado

| Situação | Título do bloco | Linha final |
|---|---|---|
| Rascunho (solicitação) | Rascunho · "Ainda não enviada." | **Trabalho não liberado.** |
| Em análise | Em análise · "Aguardando assinaturas." | **Trabalho não liberado.** |
| Devolvida | Devolvida · motivo | **Trabalho não liberado.** |
| Emitida | Emitida · "Aguardando o aceite no campo." | **Trabalho não liberado.** |
| Ativa, dentro da janela, sem parada | **Trabalho liberado** (verde) + medidor da janela | Estado: Ativa |
| Ativa, antes da janela | Aguardando a janela | Estado: Ativa · **Trabalho não liberado.** |
| Ativa, janela encerrada | Janela encerrada (vermelho) · "Pare o trabalho e entregue a área." | Estado: Ativa · **Trabalho não liberado.** |
| Qualquer estado com parada registrada | Parada registrada (vermelho) | Estado: … · **Trabalho não liberado.** |
| Suspensa | Suspensa | **Trabalho não liberado.** |
| Entregue à área | Entregue à área | **Trabalho não liberado.** |
| Expirada | Expirada · "Entregue a área para liberar o equipamento." | **Trabalho não liberado.** |
| Encerrada / Cancelada | Encerrada / Cancelada | **Trabalho não liberado.** |
| Sem servidor | Não verificável (cinza) | **Trabalho não liberado.** + "Isto não é liberação." |

Na tela de **Nova PT** (formulário antes de criar o rascunho), o aviso **não** aparece.

## 5. Inconsistências encontradas

1. **Ruído na solicitação e no fim do ciclo.** Em Rascunho, Em análise e Devolvida, a PT nem foi emitida, e ninguém pensaria em trabalhar com ela. Em Encerrada e Cancelada, o ciclo acabou. Nesses estados a frase não protege nada e confunde: parece um status a mais e faz o usuário perguntar "o que falta para liberar?" enquanto ainda está preenchendo a solicitação.
2. **Parece um status, mas é um alerta.** A frase vem na mesma linha de "Estado: Ativa" e com a mesma aparência. Isso reforça a leitura de que é um estado.
3. **Duas fontes da mesma regra.** O app recalcula a regra (`workRelease`) em vez de usar o `released` que a API já manda.
   - É **intencional**: o bloco muda na hora em que a janela fecha, sem esperar o servidor, e o teste prova que a regra é igual à do banco.
   - Fica registrado para que ninguém mude uma sem mudar a outra.
4. **(Menor) "Rascunho" aparece duas vezes** no topo de uma PT sem número: no lugar do número, embaixo do título, e no bloco de estado.

## 6. Propostas

**A. Recomendada: mostrar só onde há risco de alguém achar que pode trabalhar**

| Mostra "Trabalho não liberado" | Não mostra |
|---|---|
| Emitida (assinada, mas sem o Aceite no campo) | Rascunho, Em análise, Devolvida (solicitação) |
| Ativa fora da janela ou com parada | Encerrada, Cancelada (ciclo acabou) |
| Suspensa, Entregue, Expirada | |
| Sem servidor (sempre) | |

- O verde continua exclusivo do caso liberado; nada muda na regra, no banco ou na API.
- Mudança em `EstadoAutorizacao` (uma lista de estados) e no teste da tela. O texto do cartão de PT suspensa no Dashboard continua.
- Opcional: na Nova PT e no rascunho, trocar por uma dica neutra, como "A liberação acontece no Aceite no campo, depois da emissão."

**B. Remover a frase de todos os estados**

- A cor e o título dariam a informação.
- **Não recomendo**: tira a proteção de acessibilidade (cor nunca sozinha) e o aviso explícito em Emitida, Suspensa e Janela encerrada, justamente onde há risco no campo.

**C. Manter como está**

- É seguro, mas deixa o ruído na solicitação, que motivou esta investigação.

**Complemento (com A ou C):** separar a frase visualmente do "Estado: …", em linha própria e com ícone de cadeado, para não ser lida como status. E tirar o "Rascunho" repetido do cabeçalho.

## 7. Decisões (27/11/2026)

- **Remover a informação "Trabalho não liberado" do estado Encerrada.** Nos demais estados ela **continua**, inclusive em Rascunho, Em análise, Devolvida e Cancelada (a proposta A, que a tiraria também desses, **não** foi escolhida).
- **Etiquetas (estilo Trello):** "Encerrada", "Ciclo concluído" e "Trabalho não liberado" viram **etiquetas**, cada uma um estado independente, **com tooltip** explicando o significado.
- **Fileira de etiquetas de situação** abaixo do título do bloco (o título do bloco continua). "Ciclo concluído" é etiqueta **só da Encerrada**.
- Assumidas por mim: a etiqueta do estado só aparece quando o título diz outra coisa (ou na Encerrada); "Entregue à área" mantém o aviso; sem dica neutra no rascunho; o complemento visual de "Rascunho" repetido no topo **não foi feito** (não foi respondido).

## 8. Resultado da execução

- **`core/permitTags.ts`** (`permitTags`, com os tooltips) e **`components/shell/StateTag.tsx`**; `EstadoAutorizacao` troca as duas linhas de texto por `<ul aria-label="Situação">` de etiquetas. "Ciclo concluído." saiu do texto de apoio da Encerrada.
- **Etiquetas por estado:** Encerrada = Encerrada + Ciclo concluído; Rascunho, Em análise, Devolvida, Emitida, Suspensa, Entregue, Expirada e Cancelada = Trabalho não liberado; Ativa liberada = nenhuma; Ativa fora da janela ou com parada = estado (neutra) + Trabalho não liberado; sem servidor = Trabalho não liberado.
- **Cor:** a etiqueta neutra usa o tom de texto escuro (o cinza sólido ficava pálido com texto branco).
- Banco, API e regra de liberação **não mudaram**. O espelho `core/form/conditions.ts` foi atualizado em `ptw-server/api/src/shared` (a frase "· opcional" da SPEC 018).
- **Testes:** app 480 passam (6 novos, de `permitTags`), lint limpo, `sync-shared --check` 41 iguais; conferido no navegador (etiqueta e tooltip no rascunho).
- **Não verificado no navegador:** o bloco Encerrada e Ativa fora da janela (só pelos testes da função).
