# SPEC 014: Salvamento automático de solicitações em Rascunho

| | |
|---|---|
| Status | **Executada (26/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (`NewPermitView`), Solicitações de PT, Dashboard, página da PT (`#pt/<id>`), API de leitura de PTs |

## 1. Resposta curta

O Rascunho **já existe** como estado da PT, e boa parte do pedido já funciona. Os furos são três:

1. **A tela Nova PT não salva sozinha.** O rascunho só nasce quando a pessoa clica em "Criar rascunho". Se sair antes, **perde tudo** (modelo, local, serviço, janela, ativos, equipe).
2. **Rascunho de uma pessoa pode ser lido por outra** se ela souber o endereço (`#pt/<id>`): a API devolve a PT inteira e o histórico (anexos e respostas por id seguem o mesmo caminho e a execução confere). Só as **listas** escondem.
3. **O rascunho é difícil de achar depois:** "Em andamento", o filtro padrão do Quadro, **não inclui rascunho**, e não há um "Meus rascunhos".

## 2. Como funciona hoje (conferido)

| Item do pedido | Hoje | Situação |
|---|---|---|
| Estado Rascunho | `permit_state = 'rascunho'` (padrão ao criar); só o **Enviar** tira dele (`permit_submit`, em análise, com número) | **Existe** |
| Seguir ao fluxo só depois de concluído e enviado | Rascunho não tem número, não prende equipamento, não aparece para quem assina | **Existe** |
| Só o autor altera | Gatilho `draft_owner_check` (`PTW17`): outra pessoa recebe 422 "Só o solicitante altera o rascunho" ao editar, responder ou descartar (testado) | **Existe** |
| Editar o próprio rascunho | Página da PT › menu › "Editar rascunho"; respostas do formulário **salvam ao serem dadas** | **Existe** (mas a tela inicial não salva sozinha) |
| Excluir o próprio rascunho | "Descartar": rascunho → `cancelada`, só pelo autor, com motivo obrigatório (`permit_discard`). Nada é apagado | **Existe**, com outro nome |
| Não aparecer para outros nas **listas** | O Quadro, "Minhas" e o Dashboard filtram (`número não nulo ou autor = você`); a regra é a mesma no app e na API | **Existe** |
| Não aparecer para outros **por link/API** | `GET /permits/{id}` e `/history` respondem 200 com o conteúdo para qualquer pessoa da unidade (testado com duas outras pessoas); anexos e respostas por id não foram testados | **Furo** |
| Auditoria | Eventos do rascunho entram na trilha e aparecem para quem tem a permissão de Auditoria | Ver decisão 3 |
| Salvar automaticamente o que foi iniciado | Nova PT só cria no clique; Editar rascunho só salva no clique | **Furo** |
| Localizar e continuar depois | Dashboard (Minha área) mostra o rascunho do autor; no Quadro, só em "Em preparação" ou "Minhas ações"; o padrão ("Em andamento") não mostra | **Parcial** |

Dados mínimos de um rascunho no banco (`ptw.permit`): **modelo, versão, local, janela e serviço (1 a 500 caracteres)** são obrigatórios. Sem esses cinco, não há linha para guardar.

## 3. Objetivo

1. Quem começa uma solicitação e sai **não perde** o que preencheu.
2. O rascunho é **só do autor**, em qualquer caminho (lista, link, API).
3. O autor o **encontra** e **continua**.
4. O autor **edita ou exclui**.
5. Ele só entra no fluxo normal ao ser **enviado**.

## 4. Escopo

**Entra**

1. **Salvamento automático na Nova PT e no Editar rascunho:**
   - assim que houver **modelo, local e serviço** (os dados que o banco exige), o app **cria o rascunho em silêncio**; a partir daí cada mudança (local, serviço, janela, ativos, equipe) é salva **~1,5 s depois da última digitação**, ao sair de um campo e ao sair da tela;
   - indicador discreto ao lado do título: "Salvando…", "Salvo às 14:03", "Não foi possível salvar. Tentar de novo";
   - antes de existirem os três dados, um aviso curto: "Escolha o modelo, o local e descreva o serviço para o rascunho começar a ser salvo." (e confirmação ao sair, porque nada ainda foi guardado);
   - o botão "Criar rascunho" vira **"Salvar e continuar"** (leva à página da PT para responder o formulário, como hoje);
   - o primeiro salvamento troca o endereço para a PT criada, sem perder a posição no formulário; atualizar a página volta ao rascunho.
2. **Servidor fora do ar:** o salvamento pausa, o indicador diz "Sem conexão com o servidor: alterações não salvas" e o app tenta de novo quando voltar (a regra de "servidor fora trava tudo que salva" continua).
3. **Conflito (duas abas, mesma pessoa):** o salvamento usa a revisão da PT (`If-Match`); em conflito, o app recarrega o rascunho e avisa, sem sobrescrever.
4. **Janela acima do limite do modelo** (SPEC 013): o salvamento não grava uma janela inválida; mostra o erro e mantém o último valor válido salvo.
5. **Privacidade na leitura (API):** o rascunho de uma pessoa responde **404 "PT não encontrada"** a qualquer outra (a mesma resposta de uma PT que não existe), em `GET /permits/{id}`, histórico, respostas, anexos, revisões, `access` e demais leituras por id; inclusive nas buscas e nos eventos em tempo real (que não carregam o conteúdo).
6. **Localizar:** no Quadro (Solicitações de PT), o segmento **"Meus rascunhos"** (só os do usuário, mais recentes primeiro) e contador no cabeçalho do Dashboard quando houver; o cartão do rascunho abre direto na tela de continuar.
7. **Editar / Excluir** no menu do rascunho e na linha da lista: "Continuar editando" e **"Excluir rascunho"** (confirmação sem texto livre; ver decisão 2).
8. Testes (seção 7), `DESIGN.md`, `ptw-server/OPERACAO.md` (nota sobre rascunhos).

**Não entra**

- Mudar o estado, a numeração, o fluxo de assinaturas ou o que acontece após o Enviar.
- Guardar rascunho no navegador (`localStorage`): o dado de negócio vive no servidor, como o resto.
- Salvar nada antes de existirem modelo, local e serviço (o banco não aceita; ver decisão 1).
- Expirar ou limpar rascunhos antigos automaticamente.

## 5. Comportamento esperado

| Situação | Resultado |
|---|---|
| Abre Nova PT, escolhe modelo e local, descreve o serviço | Em ~1,5 s: "Salvo às HH:MM". O rascunho já existe. |
| Fecha a aba / volta para a lista no meio do preenchimento | O rascunho está na lista "Meus rascunhos", com o que foi preenchido. |
| Escolhe só o modelo e sai | Confirmação "Nada foi salvo ainda": o banco precisa de modelo, local e serviço. |
| Volta depois | Abre o rascunho pelo Dashboard ou por "Meus rascunhos" e continua. |
| Outra pessoa abre o endereço do rascunho | "PT não encontrada" (404), sem conteúdo. |
| Outra pessoa olha o Quadro, o Dashboard ou a busca | Não vê o rascunho. |
| Autor clica "Excluir rascunho" | Confirma; a PT sai das listas dele e de todos; fica registrada como cancelada (nada é apagado). |
| Rascunho enviado | Ganha número, entra em análise e segue o fluxo normal. |

## 6. Decisões (26/11/2026)

1. **Quando começa a salvar:** com modelo, local e serviço (sem mudança de banco).
2. **Excluir:** mantém o descarte (rascunho → cancelada), sem apagar.
3. **Auditoria:** continua mostrando os eventos de todo rascunho a quem tem a permissão.
4. **Meus rascunhos:** segmento no Quadro e aviso no Dashboard.
5. **Espera do salvamento:** 5 segundos, **configurável** pela propriedade `PTW_DRAFT_AUTOSAVE_SECONDS` (1 a 60), em vez de fixa.

## 7. Plano de testes

| Caso | O que conferir |
|---|---|
| CT-01 | Nova PT: modelo + local + serviço → rascunho criado sozinho; indicador "Salvo". |
| CT-02 | Mudar janela, ativos e equipe: salvos sem clicar; recarregar a página mantém tudo. |
| CT-03 | Sair no meio (Voltar, menu, fechar aba): o rascunho aparece em "Meus rascunhos" com o que foi preenchido. |
| CT-04 | Só modelo escolhido, sair: confirmação "Nada foi salvo ainda". |
| CT-05 | Servidor fora: indicador de não salvo; ao voltar, salva sem duplicar (a chamada de criar repetida não cria uma segunda PT). |
| CT-06 | Duas abas editando: o conflito recarrega e avisa, sem perder o texto da aba atual. |
| CT-07 | Janela acima do limite do modelo: erro, último valor válido preservado no servidor. |
| CT-08 | Outra pessoa: `GET /permits/{id}`, histórico, respostas, anexos e revisões → 404; Quadro, Minhas, Dashboard, busca e tela de parede sem o rascunho. |
| CT-09 | Outra pessoa tentando editar/responder/excluir (API) → `PTW17`, como hoje. |
| CT-10 | Excluir: confirma, some das listas, estado `cancelada`, trilha com o evento; não volta pelo link (404 para os outros; para o autor aparece em Finalizadas). |
| CT-11 | Enviar rascunho: ganha número, aparece para quem assina; antes disso não aparece para ninguém. |
| CT-12 | Auditoria: o rascunho aparece para quem tem a permissão, conforme a decisão 3. |
| CT-13 | 390/768/1024/1440 px; `npm run check` e testes da API limpos. |

## 8. Como entregar

- **Sem mudança de banco** (decisões 1a e 2a): app + API (regra de leitura). `docker compose ... up -d --build --wait` na pasta `ptw-server`, Ctrl+F5 e push.
- **Se a decisão 1 for (b):** script de atualização do esquema no Supabase.

## 9. Resultado da execução

**Como ficou:**
- **Propriedade configurável:** `PTW_DRAFT_AUTOSAVE_SECONDS` (`api/src/config.ts`, padrão 5, aceita 1 a 60, senão a API não sobe), repassada pelo `compose.yaml` e entregue ao app em `GET /health` (`draftAutosaveSeconds`, contrato atualizado). O app usa `useSim().draftAutosaveMs`.
- **Salvamento:** `core/draftSave.ts` (regras e textos, testados) e `components/work/useDraftAutosave.ts` (espera, salvar ao sair, aviso ao fechar a aba, offline, conflito). `NewPermitView` usa o hook: indicador no título, botão "Salvar e continuar"/"Salvar e voltar", aviso "Sair sem salvar?", endereço `#nova-pt/<id>` depois do primeiro salvamento.
- **Privacidade (API):** `resolvePermitId` (PT, histórico, abertura) e `attachment()` (anexo, conteúdo e prévia) devolvem 404 para quem não é o solicitante de uma PT sem número. A mesma regra do Quadro (inclui o rascunho excluído).
- **Achar e excluir:** segmento `rascunhos` (API: enum, contagem; app: memória e lista), rota `#solicitacoes/rascunhos`, `RascunhosAviso` no Dashboard, "Continuar editando" e "Excluir rascunho" (sem texto livre; volta à lista).
- **Banco e Supabase:** sem mudança.

**Diferenças em relação à proposta:**
- "Excluir" está no menu da página do rascunho; a **linha da lista não ganhou botão próprio** (a linha abre a PT, onde ficam Continuar editando e Excluir).
- O segmento "Meus rascunhos" usa a ordem padrão do Quadro (estado, depois janela mais recente primeiro), sem ordem própria por última alteração.
- Uma criação repetida depois de uma falha de rede no meio da chamada reaproveita o mesmo id; se o servidor já tiver criado e o corpo mudou, a recusa aparece no indicador (caso raro, não coberto por teste).

| Caso | Resultado |
|---|---|
| CT-01 modelo + local + serviço → rascunho criado sozinho, "Salvo às 18:36" | Passou (navegador) |
| CT-02 alterações salvas sem clicar; sair antes dos 5 s salva na saída; abrir `#nova-pt/<id>` abre o rascunho com a alteração | Passou (navegador) |
| CT-03 sair no meio: aparece em "Meus rascunhos" e no Dashboard | Passou |
| CT-04 só modelo escolhido + Cancelar → "Sair sem salvar?" | Passou |
| CT-05 servidor fora / CT-06 conflito de abas / CT-07 janela inválida | Cobertos pelas regras puras (`draftSave.test.ts`); não exercitados no navegador |
| CT-08 outra pessoa: PT, histórico, abertura, anexo, conteúdo e prévia → 404; Quadro, contagem, Minha área e segmento sem o rascunho; na tela, "PT não encontrada" | Passou (`drafts.test.ts` com banco real e navegador) |
| CT-09 outra pessoa editando ou excluindo → `PTW17` | Passou |
| CT-10 Excluir: confirma, volta à lista, some de "Meus rascunhos"; estado `cancelada`; outros continuam sem ver | Passou |
| CT-11 enviar rascunho | Sem mudança no fluxo (coberto pelos testes existentes) |
| CT-12 Auditoria mostra o rascunho a quem tem a permissão | Mantido por decisão; sem mudança |
| CT-13 `npm run check` (461 testes) e testes da API (221, 8 pulados que dependem do armazenamento de arquivos) | Passou |

**Atualização:** `permits.test.ts` ("cada abertura grava…") foi ajustado: agora Carla recebe 404 ao abrir o rascunho da Ana.

