# SPEC 017: Seleção de Local e Ativos em árvore na criação da Solicitação

| | |
|---|---|
| Status | **Rascunho, aguardando decisão** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (`NewPermitView`: campos Local e Ativos), componente de árvore de Gestão de Ativos, API de locais |

## 1. Resposta curta

1. **O componente de árvore da Amanda já está no app:** é a "Árvore de ativos" da Gestão de Ativos (SGI Forces, `AssetManagement/Tree.tsx`): Planta → Área → Equipamento → equipamento aninhado, com busca, contagem por nó, ícones por nível, teclado e papéis de acessibilidade. Dá para **reaproveitar o visual e o comportamento**; o código hoje está preso àquela tela (seleção de nó para o painel de detalhe, equipamento sempre exibido), então a proposta é **extrair a parte de locais** para um componente compartilhado.
2. **Hoje o Local é uma lista plana** (`PLE-UTL · Utilidades`, `PNO-CAL · Caldeiraria`…): sem hierarquia e sem saber se o local tem ativo. Escolhido um local sem ativo, a pessoa só descobre ao ver "nada" na lista de Ativos.
3. **A contagem de ativos por local já existe** (`GET /locations/asset-counts`, soma o local e todos os descendentes), mas **não serve para o filtro como está**: conta ativo de qualquer tipo e situação (inclusive inativo e de tipo que o modelo não aceita), aceita só 100 locais por chamada e o app não a usa na Nova PT.

## 2. Como funciona hoje (conferido)

| Item | Hoje |
|---|---|
| Local da Nova PT | `Select` plano com todo local `ativo` cujo **tipo** o modelo aceita (`version.locationTypeIds`; vazio = qualquer). Nome mostrado: `código · nome`, sem pai |
| Ativos da Nova PT | Aparecem depois de escolher o local: busca + caixas, só `ativo` e de tipo aceito pelo modelo (`assetTypeIds`); "opcional agora"; primeiros 25 |
| O que "ativos do local" significa | O local **e todos os descendentes** (API: `path <@`; memória: `assetsUnder`) |
| Contagem por local | `locationAssetCounts`: distinta, com descendentes, **todas as situações**, máx. 100 locais |
| Hierarquia | Planta (raiz) → Área → (mais níveis possíveis); `locationKind` decide planta/área pelo tipo ou pela profundidade |
| Quem escolhe local mais tarde | Só a Nova PT / Editar rascunho (o local define a elegibilidade da equipe, SPEC 015, e o escopo dos cargos) |
| Trocar o local | Já limpa os ativos escolhidos |

## 3. Objetivo

1. A lista de locais **só tem** quem tem ativo para aquele modelo.
2. A escolha é uma **árvore** (planta → área), igual em aparência e comportamento à da Amanda.
3. Escolhido o local, a lista de ativos é a **daquele local**.
4. Nenhuma tela do fluxo sugere um local que depois "não tem nada".

## 4. Escopo

**Dentro**
- Extrair de `AssetManagement/Tree.tsx` um componente de árvore de **locais** (linha, recuo, chevron, contagem, ícones, teclado, busca) usado pela Gestão de Ativos (sem mudar o que ela faz) e pelo seletor da Nova PT.
- Seletor "Local" em árvore, com busca por código e nome, contagem de ativos por nó e caminho completo ("Planta › Área") no campo depois de escolher.
- Filtro: só aparecem (e só se escolhem) locais com ao menos um ativo **elegível para o modelo**; plantas e áreas intermediárias aparecem como agrupadores quando algum descendente serve.
- Endpoint novo e leve na API para o filtro (ver decisão 3), com testes.
- Mensagem quando nenhum local serve.
- Testes (função pura, componente, API com banco real, navegador) e documentação.

**Fora**
- Mudar a árvore da Gestão de Ativos (continua igual).
- Mudar quem pode ser escolhido como equipe (SPEC 015) ou o limite de 25 ativos listados.
- Banco de dados: **sem script** (é leitura sobre `asset_location`).

## 5. Comportamento esperado

**Campo Local.** Mostra "Escolha o local" ou o caminho escolhido ("Utilidades › Caldeiraria"). Ao tocar, abre o seletor (painel lateral no celular, janela no computador) com a busca e a árvore. Nó com filhos abre e fecha; nó escolhível é um botão que escolhe e fecha o seletor; agrupador (sem ativo próprio ou nível não escolhível) só expande. Cada nó mostra a contagem de ativos elegíveis embaixo dele.

**Ativos.** Igual a hoje, mas já sabendo que existe ao menos um. O texto de apoio diz "Ativos de *Caldeiraria* aceitos por este modelo".

**Nada serve.** "Nenhum local tem ativos aceitos por este modelo. Cadastre ou ative ativos em Gestão de Ativos." (com o atalho para quem tem permissão de cadastro).

**Rascunho com local que deixou de servir** (os ativos saíram depois): o campo mostra o local com o aviso "sem ativos aceitos agora", o salvamento não é bloqueado, mas a PT não avança sem trocar (ver decisão 6).

## 6. Pontos para decisão

1. **O que é escolhível na árvore.** Recomendo **só áreas** (nível abaixo da planta) e níveis mais profundos; a **planta é só agrupador**. Alternativa: qualquer local que o modelo aceite e que tenha ativo embaixo (inclui a planta, com todos os ativos dela).
2. **O que conta como "ter ativos".** Recomendo ativo **ativo e de tipo aceito pelo modelo** (o mesmo filtro da lista de Ativos). Alternativa: qualquer ativo (a contagem que já existe), aceitando que alguns locais ainda mostrem a lista vazia.
3. **Como a API entrega o filtro.** Recomendo um **endpoint novo** (`GET /locations/with-assets?assetTypeIds=…`) que devolve, numa consulta, os ids dos locais com ativo elegível (com descendentes): não tem o teto de 100 locais e não faz uma chamada por nó. Alternativa: reaproveitar `asset-counts` em lotes de 100 (mais chamadas, conta ativos de qualquer situação).
4. **Onde fica a árvore.** Recomendo um **seletor aberto pelo campo** (janela no computador, painel no celular): a coluna do formulário tem 38 rem e a árvore é alta. Alternativa: árvore fixa dentro do formulário.
5. **A árvore mostra equipamentos?** Recomendo **não**: ela termina na área; os equipamentos aparecem na lista de Ativos logo abaixo, como hoje (menos risco, mesma regra de limite de 25). Alternativa: mostrar os equipamentos como na Gestão de Ativos e marcar o ativo direto na árvore (escolhe o local e já marca o ativo).
6. **Rascunho cujo local deixou de servir.** Recomendo **manter selecionado com aviso** e bloquear o envio até trocar. Alternativa: limpar o local sozinho (a pessoa perde o contexto).
7. **A API também recusa criar PT em local sem ativo elegível?** Recomendo **não, só a tela**: ativo é "opcional agora" na criação, ativos podem entrar depois e vários testes e importações criam PT sem ativo. Alternativa: recusar com um código novo (quebra esses casos).
8. **Tipos de local do modelo.** Recomendo manter: se o modelo restringe os tipos de local, os agrupadores de outros tipos aparecem **apagados** (só expandem), como as plantas. Alternativa: esconder tudo que não for dos tipos aceitos (a hierarquia some).

## 7. Plano de testes

- Função pura (`core/assetTree.ts`/novo): locais com ativo elegível (tipo e situação), descendentes contam, agrupadores só quando algum filho serve, escolhível por nível e por tipo do modelo.
- API (banco real): o endpoint devolve só locais com ativo ativo do tipo pedido; inclui ancestrais por descendência; ignora ativo inativo e de outro tipo; unidade isolada (RLS); contrato.
- Componente/navegador: o campo abre a árvore; busca filtra e abre os nós; escolher uma área mostra o caminho e a lista de ativos dela; plantas não se escolhem; modelo sem ativos mostra a mensagem; celular (390 px) usa o painel; teclado (setas, Enter, Esc); rascunho com local sem ativos mostra o aviso.
- Gestão de Ativos: a árvore continua igual (testes e conferência visual).
- `npm run check`, testes da API, `sync-shared`, `gen:api` nos dois lados.

## 8. Como entregar

Sem mudança de banco (Supabase sem script). A API ganha um endpoint (reconstruir o `ptw-server`); o app, Ctrl+F5. Docker e git como nas entregas anteriores.
