# SPEC 013: Janela de execução da PT: limite do modelo visível e validado ao selecionar

| | |
|---|---|
| Status | **Rascunho, aguardando decisão** (o erro das 4 h × 8 h ainda não foi reproduzido: ver seção 3) |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (`NewPermitView`), bloco "Enviar a PT" na página da PT, Prorrogar |

## 1. Contexto

### Como funciona hoje

- **Onde o limite vive:** na **versão** do modelo (`template_version.max_window`, "Prazo máximo da janela", em horas; nulo = sem limite). Congela quando a versão é ativada.
- **Quando é conferido (PTW31):** ao **Enviar**, ao **Emitir** e ao **Prorrogar**. O banco confere `fim − início ≤ limite`; o app repete a mesma regra (`core/windowLimit.ts`, `windowLimitDenied`).
- **Na tela de Nova PT / Editar rascunho:**
  - os campos são "Início da janela" e "Fim da janela" (`datetime-local`);
  - o limite aparece só como texto pequeno sob o "Fim": "Prazo máximo: N horas." (e **nada** quando o modelo não tem limite);
  - **nenhuma validação do limite** acontece ali: dá para criar o rascunho com uma janela de 14 h num modelo de 12 h. A recusa só aparece depois, na página da PT, no bloco de Enviar ("Bloqueado: A janela passa do prazo máximo deste modelo (até 12 horas)"), que é o "final do preenchimento" da queixa.
  - Antes de escolher o modelo, o limite não existe na tela. Ao escolher, ele só aparece sob o campo "Fim", abaixo do serviço, sem destaque.
  - A mensagem de recusa diz o máximo, mas **não diz quanto a janela escolhida tem**.
  - A dica escreve sempre "N horas", mesmo quando o limite é em dias (a regra usa "até 3 dias").
- **Dois pontos que já estão certos (conferidos):**
  - **Regra do núcleo:** `windowLimitDenied` aceita 4 h com limite de 8 h, aceita 8 h exatas e recusa 8 h 01 min, inclusive com horários em formatos misturados (UTC, com fuso, sem fuso).
  - **Banco e API:** com uma versão de 12 h, uma janela de 14 h foi recusada com `PTW31` ao enviar; depois de editar a janela para 4 h, a API devolveu a janela nova e o envio passou do `PTW31` (parou na pergunta obrigatória seguinte, `PTW16`).

## 2. Objetivo

1. O limite do modelo aparece **assim que o modelo é escolhido** e permanece visível enquanto a janela é preenchida, em destaque.
2. A janela **não pode passar do limite**: o campo impede, a mensagem explica e o botão não avança.
3. A duração escolhida aparece ao vivo ("4 h de até 8 h").
4. O erro de "4 h reportado como mais de 8 h" é encontrado e corrigido.
5. Interface, núcleo e banco usam **a mesma conta**, e um teste garante isso.

## 3. O erro "4 horas, mas diz que passa de 8"

**Situação da investigação:**

- A regra de comparação **não é a causa** (seção 1: núcleo, API e banco aceitam 4 h com limite de 8 h).
- Também reproduzi o caminho "criar com janela longa → recusado ao enviar → editar a janela para menor → salvar": a recusa **some** depois de salvar. Esse caminho funciona.
- **Não consegui reproduzir** o relato nos dados de teste desta sessão. As causas que restam, e que a execução verifica **no seu `https://localhost`** antes de qualquer mudança:

| # | Hipótese | Como conferir |
|---|---|---|
| H1 | A janela que a regra lê não é a que a pessoa viu: a tela de Enviar usou uma janela antiga (a PT em cache, antes de salvar) | Repetir o fluxo com as DevTools abertas: janela na resposta do `PATCH` × janela na PT mostrada |
| H2 | A PT foi criada numa **versão** diferente da que a pessoa tem em mente (limite de 8 h é da versão do rascunho, não da ativa hoje) | Comparar `versionId` da PT com o limite de cada versão do modelo |
| H3 | A pessoa mudou **só o horário** e a **data** do fim ficou no dia seguinte (ou o início mudou de dia): a janela real era maior que 8 h | Ver os valores gravados de início e fim |
| H4 | O problema ocorreu em **Prorrogar** (o limite é contado do **início original**, não do início da última janela) e foi lido como se fosse a janela da solicitação | Conferir o texto da recusa e a origem (Enviar, Emitir ou Prorrogar) |
| H5 | Modelo elétrico (preparação 2027): a janela é conferida contra o **turno** e o prazo é contado do primeiro início das revalidações (`electrical_window_check`) | Ver se o modelo tem `electrical` |

- **Preciso de você** (uma vez): o **nome do modelo**, a **PT** (ou os horários digitados de início e fim) e **em que tela** a mensagem apareceu. Se não tiver mais isso, a execução tenta H1 a H5 na sua stack e documenta a causa.
- Seja qual for a causa, a mudança do item 3 da seção 4 (mensagem com a duração escolhida e janela única como fonte) torna a divergência **visível** na hora.

## 4. Escopo

**Entra**
1. **Limite visível:** na Nova PT, uma faixa em destaque (informativa, não texto pequeno) **acima dos campos de início e fim** (decisão 2), que aparece assim que o modelo é escolhido:
   - com limite: "Prazo máximo da janela deste modelo: **8 horas**" (ou "3 dias", pela mesma função `maxWindowText`);
   - sem limite: "Este modelo não tem prazo máximo para a janela";
   - antes de escolher o modelo, nada (não há o que mostrar).
   A faixa vale também no "Editar rascunho". Na prévia à direita, a linha "Janela" mostra "4 h de até 8 h".
2. **Duração ao vivo:** sob os dois campos, "Duração: 4 h" em tom neutro; "Duração: 10 h, passa do máximo de 8 h" em tom de bloqueio.
3. **Fonte única da conta** em `core/windowLimit.ts`: uma função `windowCheck(versão, início, fim)` devolve duração, máximo, "passou?" e o **fim mais tarde permitido**. Tela, Enviar, Emitir e Prorrogar usam **ela**. A mensagem passa a dizer a duração: "A janela tem 10 h e passa do prazo máximo deste modelo (até 8 horas)".
4. **Impedir a seleção acima do limite:**
   - o campo "Fim" recebe `min` (o início) e `max` (início + limite): o seletor do navegador já bloqueia dias e horários fora;
   - ao mudar o **início** ou o **modelo**, o fim **não muda sozinho**; se ficar acima do limite, aparece o erro e o botão fica desativado, com o motivo escrito ("A janela passa de 8 h: o fim deve ser até 27/11 16:00");
   - botão **"Usar o máximo"** ao lado do erro: ajusta o fim para o limite.
5. **Não avança:** "Criar rascunho / Salvar rascunho" fica desativado enquanto a janela estiver acima do limite (o texto do motivo já existe, `draft-why`, e ganha este caso).
6. **Prorrogar:** a conta já é a mesma; passa a usar `windowCheck` e a mostrar o fim máximo permitido (contado do início original).
7. **Testes** (seção 7), inclusive a **concordância núcleo × banco** nos limites (7 h 59, 8 h, 8 h 01, em dias, com segundos).
8. `DESIGN.md` (campo de janela com limite) e esta spec com o resultado.
9. A correção da causa do erro 4 h × 8 h, **depois** de reproduzida (seção 3).

**Não entra**
- Mudar **onde** o limite é configurado (continua na versão do modelo, Escopo).
- Mudar o banco, a API ou o contrato (o limite continua conferido no banco ao Enviar, Emitir e Prorrogar; o app só antecipa a mesma regra). Se a causa for no banco, vira ajuste à parte.
- Limitar o rascunho pela API: a tela impede, mas o banco continua aceitando um rascunho acima do limite (a recusa dura é ao Enviar). Se quiser a trava no banco também, é decisão 3.

## 5. Comportamento esperado

| Situação | Resultado |
|---|---|
| Escolhe modelo com limite de 8 h | Faixa "Prazo máximo da janela deste modelo: 8 horas" aparece na hora e fica visível ao preencher. |
| Escolhe modelo sem limite | Faixa "Este modelo não tem prazo máximo para a janela". |
| Janela de 4 h (limite 8 h) | Aceita: "Duração: 4 h", botão ativo. |
| Janela de exatamente 8 h | Aceita. |
| Janela de 8 h 01 min | Erro na hora, botão desativado, "Usar o máximo" disponível. |
| Troca o modelo para um de limite menor com janela já preenchida | O erro aparece na hora; nada é alterado sem a pessoa. |
| Limite em dias (ex.: 3 dias) | Tudo escrito como "3 dias". |
| Editar rascunho / Prorrogar | Mesmo comportamento e mesma mensagem. |
| Servidor | Continua recusando acima do limite com `PTW31` (sem divergência: mesma conta). |

## 6. Pontos para decisão

1. **O que acontece quando o limite é ultrapassado?** (a) bloquear com erro e botão "Usar o máximo", sem mexer no fim sozinho; (b) corrigir o fim automaticamente para o máximo.
   - **Proposta:** (a). Mexer no horário sozinho pode esconder uma escolha da pessoa numa PT de segurança.
2. **Onde destacar o limite?** (a) faixa logo abaixo do campo Modelo, repetida junto da janela; (b) uma faixa só, junto da janela.
   - **Proposta:** (b), **junto da janela** (acima dos dois campos), e a prévia à direita com "4 h de até 8 h". Assim o limite não fica longe do que ele limita.
3. **Trava de rascunho no banco?** Hoje o banco aceita um rascunho acima do limite e só recusa ao enviar.
   - **Proposta:** manter assim (sem mudança de banco); a tela impede.
4. **Mensagem de recusa com a duração escolhida** ("A janela tem 10 h e passa do prazo máximo…").
   - **Proposta:** sim, em todas as telas e também na recusa do servidor quando vier do app.
5. **Erro 4 h × 8 h:** me passe o modelo, a PT e a tela (seção 3). Se não houver mais como obter, a execução investiga H1 a H5 na sua stack.

## 7. Plano de testes

| Caso | O que conferir |
|---|---|
| CT-01 | Núcleo: 4 h, 7 h 59, 8 h aceitas e 8 h 01 recusada com limite de 8 h; limite em dias; sem limite; horários com fuso diferente; janela que cruza a meia-noite. |
| CT-02 | Concordância núcleo × banco: as mesmas janelas contra `ptw.window_check` (nos limites) dão o mesmo resultado. |
| CT-03 | Nova PT: escolher o modelo mostra a faixa na hora (com e sem limite, horas e dias); some ao desescolher. |
| CT-04 | Fim acima do limite: erro com o fim máximo, botão desativado, "Usar o máximo" ajusta e libera; 4 h com limite de 8 h: botão ativo. |
| CT-05 | Trocar de modelo / mudar o início com a janela já preenchida: erro correto, nada alterado sozinho. |
| CT-06 | Editar rascunho (janela longa → corrigir para 4 h → salvar → Enviar): sem recusa de prazo. |
| CT-07 | Prorrogar: mostra o fim máximo desde o início original e recusa acima. |
| CT-08 | Servidor: janela longa continua recusada com `PTW31` ao enviar (sem divergência com a tela). |
| CT-09 | Reprodução do erro 4 h × 8 h na stack do usuário (H1 a H5) e teste de regressão da causa. |
| CT-10 | 390/768/1024/1440 px sem rolagem lateral; `npm run check` limpo. |

## 8. Como entregar

Front-end (e, se a causa do erro 4 h × 8 h estiver no banco, script de atualização do esquema à parte). `docker compose ... up -d --build --wait` na pasta `ptw-server`, Ctrl+F5 e push.
