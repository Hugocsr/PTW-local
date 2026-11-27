# SPEC 017: Seleção de Local e Ativos em árvore na criação da Solicitação

| | |
|---|---|
| Status | **Executada (27/11/2026)** |
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

## 6. Decisões (27/11/2026)

- **Componente:** analisar o Front-Office do protótipo e copiar. O Front-Office **não usa árvore expansível**: usa busca + lista que desce Planta › Área › Equipamento (com "N equip." e "Trocar"). Foi isso que se copiou (a árvore expansível é a do Backoffice, na Gestão de Ativos, que não mudou).
- **Só locais com equipamentos ativos** (decisão 2: ativo ativo de tipo aceito pelo modelo).
- **Rascunho com local que deixou de valer:** aviso e **não avança** (decisão 6).
- **Só dados restritos à configuração do modelo** (decisão 8): tipos de local e de ativo do modelo valem; o que não é aceito não é oferecido.
- **Assumidas por mim** (não respondidas, seguiram a recomendação ou o protótipo): só **áreas** se escolhem, a planta só agrupa (1); endpoint novo na API (3); lista no próprio formulário, como no protótipo (4); a lista de ativos continua abaixo do local, e a busca também acha ativos (5); a API **não** recusa PT em local sem ativo, só a tela (7).

## 7. Plano de testes

- Função pura (`core/assetTree.ts`/novo): locais com ativo elegível (tipo e situação), descendentes contam, agrupadores só quando algum filho serve, escolhível por nível e por tipo do modelo.
- API (banco real): o endpoint devolve só locais com ativo ativo do tipo pedido; inclui ancestrais por descendência; ignora ativo inativo e de outro tipo; unidade isolada (RLS); contrato.
- Componente/navegador: o campo abre a árvore; busca filtra e abre os nós; escolher uma área mostra o caminho e a lista de ativos dela; plantas não se escolhem; modelo sem ativos mostra a mensagem; celular (390 px) usa o painel; teclado (setas, Enter, Esc); rascunho com local sem ativos mostra o aviso.
- Gestão de Ativos: a árvore continua igual (testes e conferência visual).
- `npm run check`, testes da API, `sync-shared`, `gen:api` nos dois lados.

## 8. Como entregar

Sem mudança de banco (Supabase sem script). A API ganha um endpoint (reconstruir o `ptw-server`); o app, Ctrl+F5. Docker e git como nas entregas anteriores.

## 9. Resultado da execução

**Como ficou:**
- **API:** `GET /locations/with-assets?assetTypeIds=…` (`locationsWithAssets`): locais com ao menos um ativo `ativo` (dos tipos pedidos), descendentes contados, uma consulta, sem teto de locais, sem cache. Contrato 101 operações; `schema.d.ts` regenerado nos dois lados.
- **App:** `core/locationPicker.ts` (regras puras e testes), `useLocationsWithAssets` e `usePlaceProblem` (`data/hooks.ts`; memória conta do cadastro, servidor chama o endpoint), `components/work/PlacePicker.tsx` (busca, lista que desce, cartão "Trocar", busca de ativo que já marca o ativo) e a Nova PT / Editar rascunho usando-o.
- **Rascunho com local que deixou de servir:** a edição mostra o aviso e desabilita o botão; a página da PT bloqueia Enviar/Reenviar (`placeProblem` em `planSign`) com a mesma frase.
- Banco e Supabase: sem mudança. A API precisa ser reconstruída.

**Diferenças e limites:**
- A árvore expansível da Amanda (Backoffice) **não** foi usada: o Front-Office, que é o fluxo do solicitante, desce em níveis. Se quiser a árvore, o `PlacePicker` é o único ponto a trocar.
- No demo do banco hospedado, o modelo "Intervenção desenergizada em painel" aceita só o tipo de ativo "Painel / CCM" e **não há ativo desse tipo** na carga de exemplo: com ele nenhum local aparece (é o comportamento pedido; cadastre um ativo Painel / CCM para testar).
- A API aceita criar PT em qualquer local (decisão 7); quem usa a API direto não é barrado.
- Não testei o celular com o painel de busca preenchido; conferi a tela em 390 px sem rolagem horizontal.

| Caso | Resultado |
|---|---|
| Só locais com ativo ativo do tipo do modelo; planta só agrupa; ativo inativo e área vazia somem | Passou (função pura, API com banco real, navegador) |
| Lista desce Planta › Área com "N equip."; subir; "Trocar" | Passou (navegador) |
| Busca por local, por ativo (escolhe o local e marca o ativo), sem resultado | Passou (navegador) |
| Modelo sem nenhum local: mensagem "Nenhum local tem ativos…" | Passou (navegador) |
| Rascunho cujo ativo foi desativado: aviso na edição, botão desabilitado, Enviar bloqueado na PT | Passou (navegador) |
| API: contagem distinta, filtro de tipos, 400 em parâmetro inválido, 401 sem sessão | Passou (fake e banco real) |
| `npm run check` (474 testes), API (230 passaram, 8 pulados), `sync-shared`, lint | Passou |

