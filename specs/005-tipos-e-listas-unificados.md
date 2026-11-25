# SPEC 005: Unificação de Tipos e Listas em "Catálogos"

| | |
|---|---|
| Status | **Executada em 25/11/2026** (decisões da seção 9 aprovadas como recomendado; mockup em `005-mockups/`) |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Telas atuais | `#tipos` (Configuração › Tipos) e `#listas` (Configuração › Listas) |

## 1. Análise do que existe hoje

### Tipos (`#tipos`, `TypesView`)

Quatro famílias, escolhidas numa coluna à esquerda; os tipos da família aparecem à direita.

| Família | Para que serve | Quem usa | Particularidades |
|---|---|---|---|
| **Locais** | Planta, Área, Sala, Linha… | Locais (`location.type_id`), **escopo dos modelos de PT** (`locationTypeIds`), árvore da Gestão de Ativos | Ícone escolhido; "Planta" e "Área" com `systemKey` |
| **Ativos** | Bomba, Válvula, Painel… | Ativos (`asset.type_id`), escopo dos modelos (`assetTypeIds`) | Ícone escolhido |
| **Cargos** | Técnico, Supervisora, Eletricista NR-10… | Cargos das pessoas (com validade e escopo), **assinaturas dos modelos** (`roleIds`) | Ícone fixo |
| **Relações** | "é parte de", "alimenta"… | Relações entre ativos; "é parte de" define a **trava de equipamento** e o aninhamento | `systemKey` `parte_de` não pode ser removido |

Ações por item:
- criar e renomear (no próprio campo, salvo ao parar de digitar);
- trocar ícone;
- **Desativar/Reativar** (deixa de ser oferecido; o histórico continua);
- **Remover**, só sem uso, com "Desfazer".

Cada linha mostra o uso: "12 locais", "3 pessoas e 2 modelos".

- **Banco:** uma tabela só, `ptw.type_def` (`family`, `label`, `icon`, `system_key`, `active`). As outras tabelas apontam para ela por chave composta que **garante a família**: um local só aponta para tipo de local.

### Listas (`#listas`, `ListsView`)

Listas de opções reutilizadas nas perguntas de **Marcação** e **Verificação** dos formulários de PT (EPI, perigos, documentos…).
- **Tela 1:** tabela de listas, com nome, nº de itens ativos, uso e "Nova lista".
- **Tela 2:** detalhe de uma lista, com os itens em ordem, cada um com o nome editável e a chave Ativo/Inativo, e "+ Item".
  - Item **nunca é removido**, só inativado, porque respostas antigas apontam para ele.
  - A lista pode ser renomeada e só pode ser removida se nenhum modelo a usa.
  - Mostra os modelos que usam a lista.
- **Banco:** `ptw.option_list` + `ptw.option_item` (`label`, `active`, `position`). Os modelos guardam o `listId` no formulário e as respostas guardam o id do item.

### Sobreposições

| Aspecto | Tipos | Listas | Sobrepõe? |
|---|---|---|---|
| Natureza | Catálogo de valores com nome | Catálogo de valores com nome | **Sim** |
| Agrupamento | Família fixa (4) | Lista criada pela pessoa (N) | Parecido: "grupo → itens" |
| Ativo/Inativo | Desativar/Reativar | Chave Ativo | **Sim**, com visual diferente |
| Uso mostrado | Por item | Por lista | Parcial |
| Remover | Item sem uso, com Desfazer | Nunca o item; a lista sem uso | Diferente de propósito |
| Ordem dos itens | Alfabética | Definida (posição) | Diferente |
| Ícone | Locais e Ativos | Não | Só Tipos |
| Item do sistema | Planta, Área, "é parte de" | Não | Só Tipos |
| Permissão | Gestão de cadastros; os demais consultam | Igual | **Sim** |
| Menu | Configuração (ou Consultas) | Configuração (ou Consultas) | **Sim**: duas entradas vizinhas |

**Conclusão:** para quem usa, as duas telas são a mesma coisa: **"os valores pré-cadastrados que o resto do sistema oferece"**. A diferença está nas regras de cada grupo, não na forma de gerenciar. As duas telas hoje têm layouts diferentes para a mesma tarefa: Tipos usa colunas, Listas usa tabela + página de detalhe.

### Dependências e impactos

| Item | Impacto da unificação |
|---|---|
| **Banco** (`type_def`, `option_list`, `option_item`) | **Nenhum, se unificar só a tela.** Juntar as tabelas quebraria as chaves que garantem a família (local → tipo de local) e as respostas das PTs que apontam para itens de lista. Não recomendado. |
| **API** (`/types`, `/option-lists`) | Nenhum. |
| **Modelos de PT** | O editor do formulário tem o link "Editar em Configuração › Listas" (`#listas`), que passa a apontar para a lista em Catálogos. O Escopo do modelo usa tipos e não muda. |
| **Gestão de Ativos** | Nova área › Tipo e Novo equipamento › Tipo: o texto "Cadastre tipos em Configuração › Tipos" muda para Catálogos. |
| **Auditoria** | Os links "Abrir Tipos" e "Abrir Listas" passam a abrir o grupo certo em Catálogos. |
| **Importação de modelos** | Cria listas e tipos novos. Só o texto do resumo muda. |
| **Menu, busca Ctrl+K, rotas** | Uma entrada no lugar de duas; `#tipos` e `#listas` continuam funcionando como apelidos. |
| **Supabase** | Nenhum script. |

## 2. Objetivo

Um único lugar, **Catálogos**, para todos os valores pré-cadastrados: tipos de local, tipos de ativo, cargos, relações e listas de opções. Uma navegação só e o mesmo jeito de criar, renomear, ativar e ver o uso, mantendo as regras próprias de cada grupo.

## 3. Proposta de estrutura

### Menu

- **Configuração › Catálogos** (`#catalogos`), no lugar de "Tipos" e "Listas".
- Quem não tem Gestão de cadastros vê **Consultas › Catálogos**, só para leitura, como hoje.

### Tela (layout SGI de duas colunas, como Grupos SGI e Perfis de acesso)

**Coluna esquerda: "Catálogos"**

```
TIPOS
  📍 Tipos de local          5
  📦 Tipos de ativo         12
  🛡 Cargos                  6
  ↔ Relações                3
LISTAS DE OPÇÕES          + Nova lista
  ☰ EPI obrigatório         14
  ☰ Perigos                  9
  ☰ Documentos               6
  ...
[ Buscar em todos os catálogos ]
```

- Grupos fixos ("Tipos") e listas criadas pela pessoa ("Listas de opções") na mesma coluna, com o número de itens ativos.
- A busca acha **itens** de qualquer catálogo (ex.: "luva" → EPI obrigatório › Luva de raspa) e abre o catálogo com o item em destaque.

**Coluna direita: o catálogo escolhido**

- **Cabeçalho:** nome do catálogo, descrição curta ("Usado no escopo dos modelos e na Gestão de Ativos"), uso ("12 locais · 3 modelos") e, nas listas, "Renomear" e "Remover", este só sem uso.
- **Itens no mesmo padrão de linha para todos:**
  - ícone (escolhível em Locais e Ativos; fixo nos demais);
  - nome editável no próprio campo;
  - uso do item ("4 ativos", "2 pessoas e 1 modelo"); nas listas, o uso do item fica para depois (ver decisão 4);
  - **chave Ativo**: a mesma nos dois, no lugar dos botões Desativar/Reativar dos Tipos;
  - **Remover**: nos Tipos, só sem uso (como hoje); nas listas, não existe, porque o item só é inativado;
  - itens do sistema (Planta, Área, "é parte de") com cadeado e a explicação, como hoje.
- **"+ Item"** no fim, digitando o nome e Enter.
- **Ordem:** Tipos em ordem alfabética; Listas na ordem definida, com subir e descer (ver decisão 3).
- **Filtro** "Ativos / Inativos / Todos" no topo dos itens.

**Celular e tablet:** a coluna esquerda vira a tela inicial; tocar num catálogo abre os itens, com "← Catálogos".

### Rotas

- `#catalogos`: abre o primeiro catálogo.
- `#catalogos/tipos-local`, `#catalogos/tipos-ativo`, `#catalogos/cargos`, `#catalogos/relacoes`, `#catalogos/lista/<id>`.
- **Apelidos:**
  - `#tipos` → `#catalogos/tipos-local`;
  - `#listas` → `#catalogos`, com o primeiro catálogo de lista aberto;
  - o link do editor de formulário abre direto a lista daquela pergunta.

## 4. Regras (nada muda nas regras de dados)

1. Tipos continuam em `type_def` e listas em `option_list`/`option_item`. **Sem mudança de banco ou API.**
2. Os itens do sistema (Planta, Área, "é parte de") continuam sem poder ser removidos nem desativados.
3. Item de lista continua **sem remoção**, só inativação. A lista só é removida sem uso.
4. Tipo continua removível só sem uso, com Desfazer.
5. Gerenciar exige Gestão de cadastros; os demais só consultam.
6. Toda ação continua auditada como hoje, com as mesmas ações de auditoria.

## 5. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | Uma entrada "Catálogos" no menu substitui Tipos e Listas; `#tipos` e `#listas` continuam funcionando. |
| CA-02 | A coluna esquerda mostra os 4 grupos de tipos e todas as listas, com contagem; "+ Nova lista" cria e abre a lista. |
| CA-03 | Todos os catálogos usam o mesmo padrão de item: nome editável, chave Ativo, uso e, onde a regra permite, Remover. |
| CA-04 | As regras atuais continuam: itens do sistema travados, item de lista sem remoção, tipo removível só sem uso, lista removível só sem uso. |
| CA-05 | A busca acha itens de qualquer catálogo e abre o catálogo certo. |
| CA-06 | Os links do editor de formulário, da Gestão de Ativos e da Auditoria abrem o catálogo certo. |
| CA-07 | Quem não tem Gestão de cadastros vê Catálogos em Consultas, só para leitura. |
| CA-08 | Celular e tablet: lista de catálogos → itens, sem rolagem lateral e com toques de no mínimo 44 px. |
| CA-09 | Os testes atuais continuam passando (os testes de navegação são atualizados para a entrada nova). |

## 6. Casos de teste

**App (unitários)**
- Navegação: "catalogos" no lugar de "tipos" e "listas", nos dois perfis de acesso.
- Rotas antigas viram apelidos.
- Busca nos catálogos: acha por item e por nome de catálogo.
- Regras de remoção e de ativação por grupo.

**Tela** (Playwright, API real)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | Menu com Configuração › Catálogos e sem Tipos/Listas. `#tipos` e `#listas` abrem Catálogos. |
| CT-UI-02 | Tipos de local: criar "Galpão", trocar o ícone, desativar e reativar pela chave, remover (sem uso) e desfazer. |
| CT-UI-03 | Tipos de local › "Planta": cadeado e explicação; sem chave nem Remover. |
| CT-UI-04 | Listas: "+ Nova lista" "Ferramentas", adicionar 3 itens, mudar a ordem, inativar um item. Sem Remover no item. |
| CT-UI-05 | Lista usada por modelo: Remover desabilitado, com o motivo. |
| CT-UI-06 | Buscar "luva": resultado na lista de EPI; ao abrir, o item fica em destaque. |
| CT-UI-07 | No editor de formulário, "Editar em Catálogos" abre a lista da pergunta. Na Auditoria, "Abrir catálogo" abre o grupo certo. |
| CT-UI-08 | Usuário sem Gestão de cadastros: Consultas › Catálogos, sem botões de edição. |
| CT-UI-09 | Capturas em 1440, 820 e 390 px. |

## 7. Impacto e riscos

- **Baixo risco de dados:** só tela e navegação; o banco, a API e a auditoria não mudam.
- **Hábito:** quem já usa "Tipos" e "Listas" encontra tudo em "Catálogos". Os apelidos de rota e a busca Ctrl+K (que acha "Tipos" e "Listas" como sinônimos) amortecem a mudança.
- **Tamanho:** é uma tela nova que substitui duas (cerca de 480 linhas hoje). Ela fica dividida em componentes por grupo para respeitar o limite de 500 linhas por arquivo.
- **Documentação:** `DESIGN.md`, `AGENTS.md` e os textos de ajuda que citam "Configuração › Tipos/Listas".

## 8. Plano de execução

1. `core/catalogs.ts`: modelo único de catálogo (grupos de tipos e listas), contagem, uso, busca e regras de ação, com testes.
2. `CatalogsView` (duas colunas) + `CatalogItems` (padrão de item) + diálogos de nova lista e novo tipo, reaproveitando o que já existe em Tipos e Listas.
3. Menu, rotas, apelidos, busca Ctrl+K e os links do editor de formulário, da Gestão de Ativos e da Auditoria.
4. Remover `TypesView` e `ListsView` depois que a tela nova cobrir tudo.
5. Testes de tela CT-UI-01 a 09, documentação e cópia para a sua pasta.

## 9. Pontos para você decidir

1. **Nome da entrada.**
   - **Proposta:** "Catálogos".
   - **Alternativas:** "Tipos e listas" (mais literal) ou "Cadastros auxiliares".
2. **Onde fica no menu.**
   - **Proposta:** em **Configuração**, onde Tipos e Listas estão hoje.
   - **Alternativa:** em **Cadastros**, junto de Gestão de Ativos e Pessoas.
3. **Ordem dos itens das listas.**
   - **Proposta:** incluir subir/descer, porque a ordem aparece nas perguntas das PTs e hoje só segue a ordem de criação.
   - **Alternativa:** manter sem reordenar.
4. **Uso por item de lista** (quantas PTs responderam aquele item).
   - **Proposta:** não nesta entrega, porque exige uma consulta nova na API.
   - **Alternativa:** incluir, mostrando "usado em N respostas".
5. **Unificar também no banco.**
   - **Proposta:** **não**. As tabelas têm garantias diferentes (família do tipo, itens que nunca somem) e a unificação não traria ganho para quem usa.

## 10. Resultado da execução (25/11/2026)

**Decisões aprovadas como recomendado:**
1. Nome "Catálogos".
2. Fica em Configuração.
3. Itens de lista com subir/descer.
4. Sem uso por item de lista.
5. Sem unificar o banco.

**Verificações**

| Camada | Resultado |
|---|---|
| App (`vitest`, inclui `core/catalogs.test.ts` novo e `navigation.test.ts` atualizado) | 453 testes passaram |
| `tsc`, `eslint`, `vite build` | sem erros |
| Banco / API / Supabase | sem mudança, sem script |

**Tela** (Playwright, API real, dados de exemplo)

| Caso | Resultado |
|---|---|
| CT-UI-01 | PASSOU: menu Configuração › Modelos de PT, **Catálogos**, Identidade visual; `#tipos` → `#catalogos/tipos-local`, `#listas` → `#catalogos`. |
| CT-UI-02 | PASSOU: "Galpão" criado, desativado e reativado pela chave, removido e desfeito (conferido no banco). |
| CT-UI-03 | PASSOU: Planta com cadeado, "Usado pelas regras do sistema", sem chave e sem Remover. |
| CT-UI-04 | PASSOU: "Nova lista" Ferramentas com 3 itens; subir mudou a ordem no banco; item inativado; sem Remover no item. |
| CT-UI-05 | PASSOU: EPI em uso por modelo: Remover desabilitado, com os modelos no cabeçalho. |
| CT-UI-06 | PASSOU: buscar "luva" abre a lista EPI com "Luvas" em destaque. |
| CT-UI-07 | Os links da Auditoria e do editor de formulário apontam para `#catalogos…` (conferido no código e pelo `tsc`). Não houve evento de tipo/lista na trilha para clicar no teste. |
| CT-UI-08 | PASSOU: sem Gestão de cadastros, Catálogos em Consultas, sem chaves, sem Adicionar e sem Nova lista. |
| CT-UI-09 | PASSOU: 820 e 390 px: catálogos → itens com "← Catálogos", sem rolagem lateral; nenhum erro de JavaScript. |

**Ajustes durante a execução**

- **Tipos de ativo com o servidor:** a tela antiga contava os ativos por tipo a partir de uma lista que, com o servidor, fica vazia. Por isso mostrava "Sem uso" e oferecia Remover para tipos com ativos.
  - Agora o uso vem do servidor, uma contagem por tipo (`useAssetTypeCounts`).
  - Enquanto conta, a linha mostra "Contando o uso…" e a lixeira fica bloqueada.
- **Uso de tipo de local/ativo:** passa a considerar também o **Escopo dos modelos**, porque o banco recusa remover um tipo que um modelo aceita.
- **Uso de lista:** passa a contar também as perguntas de **Verificação** que tiram as respostas da lista (`answerListId`). Antes, só contava Marcação.

**Arquivos**

- **Novos:**
  - `core/catalogs.ts` e `core/catalogs.test.ts`;
  - `components/registry/Catalogs/` (`CatalogsView`, `TypeCatalogPanel`, `ListCatalogPanel`, `ListNameDialog`, `shared`).
- **Alterados:**
  - navegação: `App.tsx`, `core/navigation.ts` + teste, `shell/nav.ts`, `shell/CommandPalette.tsx`;
  - dados: `data/hooks.ts`;
  - links e textos: `AuditView.tsx`, `FormEditor/ItemEditor.tsx`, `AssetManagement/NodeDialog.tsx`, `ImportView/Created.tsx`, `core/templatePackage/import.ts`;
  - comentários: `registry/types.ts`, `registry/modelTypes.ts`, `demo/celulose/lists.ts`, `core/form/permit.ts`;
  - documentação: `DESIGN.md`, `ptw-mockup-v2/AGENTS.md`.
- **Removidos:** `components/registry/TypesView.tsx` e `ListsView.tsx`. Na sua pasta, apague com `git rm`; a cópia não consegue apagar arquivos.
