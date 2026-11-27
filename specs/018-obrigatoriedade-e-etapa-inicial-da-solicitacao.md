# SPEC 018: Sinalização de campos obrigatórios e etapa inicial na navegação da Solicitação

| | |
|---|---|
| Status | **Executada (27/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (`NewPermitView`), página da PT (`PermitDetailView`, `StageRail`, aba Formulário), formulário da PT (`FillItem`), cabeçalho de página (`PageHeader`) |

## 1. Resposta curta

1. **Obrigatório hoje é implícito.** No formulário da PT vale "obrigatório é o padrão": só o **opcional** é marcado ("opcional" ao lado do rótulo). Na Nova PT, Modelo, Local, Serviço e as duas datas são obrigatórios e **não têm marca nenhuma**; só a Equipe e os Ativos dizem "opcional". A ficha impressa da PT usa " *", e nada mais no app usa asterisco. O pedido inverte a leitura: a pessoa deve **ver o que é obrigatório** antes de tentar concluir.
2. **A etapa inicial não existe na trilha.** A trilha de etapas da PT (`StageRail`) nasce das etapas do modelo (Solicitação, Emissão…); os dados do rascunho (modelo, local, serviço, janela, ativos, equipe) vivem numa tela à parte (Nova PT / "Editar rascunho" no menu "⋯"). Depois de criado, não há ponto visível para voltar a eles.
3. **A seta de voltar** (`← Solicitações de PT`) aparece em **toda página** pelo `PageHeader`, na Nova PT e na página da PT. Na Nova PT ela e o botão "Cancelar" fazem a mesma coisa (sair), e "Cancelar" sugere descartar quando, desde a SPEC 014, o rascunho **é guardado**. A confusão vem desses dois sinais contraditórios.

O que já protege os dados (SPEC 014): salvamento automático, salvar ao sair, aviso "Sair sem salvar?" quando não dá para salvar, "Excluir rascunho" com confirmação, rascunho em "Meus rascunhos".

## 2. Como funciona hoje (conferido)

| Item | Hoje |
|---|---|
| Marca de obrigatório na Nova PT | Nenhuma nos 5 campos obrigatórios; "opcional" em Ativos e Equipe; o navegador marca `required` mas sem texto |
| Marca no formulário da PT | "opcional" nos itens não obrigatórios (`item.required`); obrigatório sem marca |
| Antes de concluir | A etapa mostra "Faltam N respostas" junto do botão de assinar, sem dizer quais |
| Trilha de etapas | `StageRail`: só as etapas do modelo; clicar rola até o cartão da etapa; no celular "Etapa n de N" |
| Dados iniciais depois de criados | Menu "⋯" › "Continuar editando" (rascunho) / "Editar rascunho" (devolvida); a ficha da PT mostra os dados em "Fatos" (`PermitFacts`) sem ligação com a trilha |
| Seta de voltar | `PageHeader.back`, em todas as páginas; na PT, "Voltar" desfaz a última navegação (`goBack`); o rastro "Operação › Solicitações de PT" já existe no topo (migalha) |
| Cancelar (Nova PT) | Chama o mesmo `leave()` da seta: salva o pendente e sai; abre "Sair sem salvar?" só se nada foi salvo ou falhou |

## 3. Objetivo

1. **Ver o que é obrigatório** antes de concluir, com um padrão único.
2. **Etapa inicial** ("Dados da solicitação") **visível** como a primeira etapa, **acessível sempre** para consultar e, quando o estado permite, editar.
3. **Navegar sem perder** o que foi preenchido, e sem seta que pareça "voltar e jogar fora".

## 4. Escopo

**Dentro**
- Componente de marca de obrigatório no `FieldLabel` (`required`): asterisco vermelho depois do rótulo, escondido da leitura e com texto "obrigatório" para leitor de tela, e a legenda "* Obrigatório" no alto de cada formulário que a usa.
- Aplicar na Nova PT / Editar rascunho (Modelo, Local, Serviço, Início, Fim) e no formulário da PT (itens com `required`), mantendo "opcional" onde já existe.
- Etapa inicial na `StageRail` como passo 1, com cartão "Dados da solicitação" na aba Formulário (resumo + "Editar" quando o estado permite).
- Na Nova PT, mostrar a mesma trilha como prévia (passo 1 ativo; as etapas do modelo aparecem depois de escolher o modelo).
- Remover a seta de voltar da Nova PT / Editar rascunho e da página da PT; o caminho de volta fica na migalha do topo e no menu lateral. Trocar "Cancelar" por "Sair" (salva o que há e sai).
- Aviso de pendência: quando faltarem respostas, dizer quais e levar à primeira.
- Testes, DESIGN.md.

**Fora**
- Seta de voltar das demais páginas (cadastros, modelos, auditoria): continuam como estão.
- Formulários de cadastro (Pessoas, Locais, Ativos…): ficam para depois, usando o mesmo componente.
- Mudar quais campos são obrigatórios, o salvamento automático (SPEC 014) ou as regras de assinatura.
- Banco e API: **sem mudança**.

## 5. Comportamento esperado

**Obrigatório.** "Serviço *", "Início da janela *"… em vermelho suave (`text-destructive-text`), e no topo "* Obrigatório" em `type-meta`. Campo obrigatório ainda vazio não pinta de erro antes da pessoa tentar; o asterisco basta. Leitor de tela: "Serviço, obrigatório".

**Etapa inicial.** Trilha: ① Dados da solicitação · ② Solicitação · ③ Emissão … O passo ① é concluído (verde) quando a PT saiu do rascunho; atual enquanto é rascunho; "não feita" nunca. Clicar leva ao cartão "Dados da solicitação" na aba Formulário: modelo, local, serviço, janela, ativos, equipe. Com o estado Rascunho ou Devolvida, **para o solicitante** (só ele edita, como hoje), o cartão tem "Editar" (abre a tela de edição com o retorno para a PT). Em outros estados o cartão é só leitura, com a frase "Já enviada: para mudar, devolva a PT".

**Na Nova PT.** A trilha aparece acima do formulário com ① ativo; antes de escolher o modelo, os demais passos aparecem como "As etapas do modelo aparecem depois de escolher o modelo". "Salvar e continuar" leva à PT no passo ② (ou ao primeiro pendente).

**Voltar.** Sem seta nas duas páginas. Para sair: a migalha do topo ("Solicitações de PT"), o menu lateral e o botão "Sair" (Nova PT). Todos passam pelo mesmo `leave()`: salvam o pendente e só perguntam "Sair sem salvar?" quando não há como salvar. O botão voltar do navegador também salva ao sair (já acontece).

## 6. Decisões (27/11/2026)

- **2 Padrão de obrigatório (mudou):** **retirar o texto "opcional"**; asterisco **vermelho** nos obrigatórios; legenda do asterisco **no rodapé da tela**.
- **Pedidos novos:** melhorar a visualização da edição da primeira página da criação e a **disposição das seções** (quatro cartões numerados).
- **Status:** a etapa inicial segue o **status real** (sem inventar "em andamento": concluída porque a PT já tem seus dados; as etapas do modelo mantêm o estado que já têm).
- **7 "Cancelar":** **mantém o nome**.
- **6 Edição:** **em outra tela, como hoje** (o "Editar" do cartão abre a tela de edição atual).
- **8 Lista de pendências:** **não precisa** (fica "Faltam N respostas"); o obrigatório precisa **chamar atenção** (asterisco vermelho).
- **Assumidas por mim** (não respondidas, seguiram a recomendação): 1 sem seta de voltar na Nova PT/Editar e na página da PT; 3 só o fluxo da PT; 4 passo 1 na trilha + cartão na aba Formulário; 5 "Editar" em Rascunho e Devolvida.

## 7. Plano de testes

- Componente: `FieldLabel required` mostra o asterisco e o texto de leitor de tela; a legenda aparece uma vez por formulário.
- Nova PT: asterisco nos 5 obrigatórios e nenhum em Ativos e Equipe; sem seta de voltar; "Sair" salva e sai; trilha com ① ativo e aviso antes do modelo.
- Página da PT: trilha com ①; rascunho (① atual, "Editar" no cartão), devolvida (① editável), em análise e depois (① concluído, só leitura); clicar em ① rola até o cartão; sem seta de voltar; migalha leva a Solicitações de PT.
- Dados preservados: editar ① e voltar mantém tudo; navegar por etapas e abas não perde resposta; abrir `#nova-pt/<id>` continua funcionando.
- Pendências: o aviso lista os itens e cada um leva ao campo.
- Celular (390 px): "Etapa n de N" inclui o passo ①; asterisco legível; sem rolagem horizontal.
- `npm run check`, conferência no navegador, `sync-shared`.

## 8. Como entregar

Só o app (sem API nem banco; Supabase sem script). Ctrl+F5 e git como nas entregas anteriores.

## 9. Resultado da execução

- **Obrigatório:** `RequiredMark`/`RequiredLegend` (`components/ui/required.tsx`). Asterisco vermelho em Modelo, Local, Serviço, Início, Fim e nos itens obrigatórios da PT; "opcional" removido (Ativos, cargos da equipe, itens, assinaturas). Legenda no rodapé fixo da Nova PT e no fim da aba Formulário.
- **Nova PT:** `FormSection` com 4 blocos (O serviço, Local e ativos, Janela de execução, Equipe), rodapé fixo em cartão com Cancelar, legenda e Salvar. Sem seta de voltar.
- **Página da PT:** sem seta de voltar; passo 1 "Dados da solicitação" na trilha (`StageRail lead`); `RequestDataCard` na aba Formulário com "Editar" (Rascunho/Devolvida, só o solicitante); etapas numeradas de 2 em diante.
- **Não mudou:** "Faltam N respostas", salvamento automático (SPEC 014), regras, API e banco.
- **Achado:** `FieldGroup` (`@container`) colapsava a altura dos blocos 1 e 2 no Chrome depois de escolher o modelo; as seções usam `div flex`.
- **Testes:** `npm run check` (474), lint limpo; navegador (1280 e 390 px): asteriscos, legenda, sem "opcional", trilha com passo 1, cartão e "Editar" abrindo a edição, sem rolagem horizontal.
- **Limite:** os cadastros e o editor de modelos ainda mostram "obrigatório/opcional" por texto (fora do escopo desta spec).

