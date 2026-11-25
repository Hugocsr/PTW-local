# SPEC 006: Catálogos: aviso em tooltip e buscas separadas (catálogos × itens)

| | |
|---|---|
| Status | **Executada (25/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência | Tela `#catalogos` (SPEC 005); anexos 1 (aviso destacado em amarelo) e 2 (busca do topo da coluna esquerda) |

## 1. Contexto

### Como funciona hoje

- **Aviso fixo:** ao lado do filtro "Ativos e inativos", cada lista mostra sempre o texto "Itens não são removidos: inative para deixar de oferecer. Respostas antigas continuam legíveis." (anexo 1). Ele ocupa a linha inteira da barra.
- **Busca do topo da coluna esquerda** ("Buscar em todos os catálogos", anexo 2):
  - busca **nos nomes dos catálogos e em todos os itens** de todos eles ao mesmo tempo;
  - ao digitar, a lista de catálogos dá lugar a uma lista de resultados mistos (catálogo ou item), e clicar abre o catálogo com o item em destaque.
- **Dentro do catálogo aberto não há busca:** numa lista longa (EPI, Perigos, Tipos de ativo), é preciso rolar para achar um item.

### O problema

- **A busca global confunde:** quem a usa espera achar um catálogo, e aparecem itens de vários catálogos misturados.
- **Falta buscar dentro de uma lista**, justamente onde as listas crescem.
- **O aviso fixo ocupa espaço** e repete uma informação que só é preciso ler uma vez.

## 2. Objetivo

1. O aviso aparece **só ao passar o mouse** (ou tocar) num ícone ⓘ.
2. **Duas buscas com papéis claros:**
   - **coluna esquerda:** procura **catálogos** pelo nome;
   - **dentro do catálogo aberto:** procura **itens** daquele catálogo, logo depois do filtro Ativos/Inativos.

## 3. Escopo

**Entra**
1. Ícone ⓘ ao lado do filtro, com o aviso em tooltip, nas listas de opções e nos tipos (ver decisão 1).
2. A busca da coluna esquerda passa a filtrar só os **catálogos** (tipos e listas), pelo nome.
3. Busca de itens dentro do catálogo aberto, depois do filtro Ativos/Inativos, em todos os catálogos (ver decisão 2).

**Não entra**
- Mudanças em banco, API ou regras: tudo é só tela.
- Buscar itens de todos os catálogos de uma vez (ver decisão 3).

## 4. Regras

1. **Tooltip:**
   - ícone ⓘ com nome acessível "Sobre os itens desta lista";
   - abre ao passar o mouse, com foco pelo teclado (Tab) e com toque no celular;
   - Esc fecha.
   - **Texto nas listas:** "Itens não são removidos: inative para deixar de oferecer. Respostas antigas continuam legíveis."
   - **Texto nos tipos:** "Tipos em uso não podem ser removidos, só desativados. Os do sistema (com cadeado) só podem ser renomeados."
2. **Busca da coluna esquerda: "Buscar catálogo"**
   - filtra as duas seções (Tipos e Listas de opções) pelo nome, sem diferenciar acentos nem maiúsculas;
   - as seções que ficarem vazias somem;
   - sem resultado: "Nenhum catálogo com “xyz”";
   - **não** busca itens.
3. **Busca de itens: "Buscar item"**
   - filtra os itens do catálogo aberto pelo nome, sem diferenciar acentos, e combina com o filtro Ativos/Inativos;
   - o contador mostra "3 de 14 itens";
   - o botão ✕ limpa a busca;
   - trocar de catálogo limpa a busca.
4. **Ordem das listas com a busca ativa:**
   - subir e descer ficam **desabilitados** enquanto houver texto na busca;
   - ao passar o mouse aparece o motivo: "Limpe a busca para reordenar";
   - isso evita trocar de lugar com um item que não está visível.
5. **Novo item com a busca ativa:**
   - o item é adicionado normalmente e aparece se combinar com a busca;
   - se não combinar, o aviso "Item adicionado: limpe a busca para vê-lo" informa onde ele foi parar.

## 5. Experiência

**Barra do catálogo aberto** (uma linha só no desktop):

```
[Ativos e inativos ▾]  [🔍 Buscar item           ✕]  ⓘ                         3 de 14 itens
```

- **No celular,** a barra quebra em duas linhas: filtro + ⓘ, e embaixo a busca na largura toda, com toques de no mínimo 44 px.
- **Coluna esquerda:** placeholder "Buscar catálogo". O resultado mantém o mesmo visual de hoje (seções e linhas), só filtrado.

## 6. Dados e API

Sem mudança no banco, na API ou no Supabase. **Arquivos:**

- `core/catalogs.ts`: `filterCatalogs` (por nome) e `filterItems` (por nome + ativo); `searchCatalogs` deixa de ser usado.
- `Catalogs/CatalogsView.tsx`: a busca filtra os catálogos.
- `Catalogs/shared.tsx`: `ItemSearch` e `InfoTip`.
- `TypeCatalogPanel.tsx` e `ListCatalogPanel.tsx`: busca, contador, ⓘ e reordenação travada com busca.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | O aviso não aparece mais fixo; aparece no tooltip do ⓘ (mouse, teclado e toque). |
| CA-02 | A busca da coluna esquerda encontra catálogos pelo nome e não mostra itens. |
| CA-03 | Cada catálogo tem "Buscar item" depois do filtro, combinado com Ativos/Inativos, com contador e ✕. |
| CA-04 | Com busca ativa, subir/descer ficam desabilitados com o motivo. |
| CA-05 | Celular e tablet sem rolagem lateral; toques de no mínimo 44 px. Os testes atuais continuam passando. |

## 8. Casos de teste

**App (unitários):** `filterCatalogs` e `filterItems` (acento, maiúscula, combinação com ativo, vazio).

**Tela** (Playwright, API real)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | Abrir "Documentos com a PT": o aviso não está na tela; passar o mouse no ⓘ mostra o texto; Tab até o ⓘ também mostra. |
| CT-UI-02 | Coluna esquerda: "epi" deixa só a lista EPI; "tipos" deixa os 4 catálogos de tipo; "luva" mostra "Nenhum catálogo com “luva”". |
| CT-UI-03 | Na lista EPI, "Buscar item" = "luv" mostra só "Luvas", "1 de 8 itens"; ✕ volta aos 8. |
| CT-UI-04 | Com busca ativa, subir/descer desabilitados com "Limpe a busca para reordenar". |
| CT-UI-05 | Tipos de ativo: "bom" mostra só "Bomba"; somado ao filtro "Só inativos", nenhum resultado. |
| CT-UI-06 | Capturas em 1440, 820 e 390 px. |

## 9. Pontos para você decidir

1. **O ⓘ também nos tipos?**
   - **Proposta:** sim, com o texto das regras dos tipos, para as duas telas ficarem iguais.
   - **Alternativa:** só nas listas.
2. **"Buscar item" também nos tipos?**
   - **Proposta:** sim, em todos os catálogos (Tipos de ativo já tem 12 itens e cresce).
   - **Alternativa:** só nas listas de opções.
3. **A busca de itens em todos os catálogos de uma vez** (a de hoje, que achava "Luvas" a partir de qualquer tela):
   - **Proposta:** retirar, como você pediu; quem sabe o catálogo usa a busca dele.
   - **Alternativa:** mantê-la na busca rápida Ctrl+K do topo, como "Itens de catálogo".

## 10. Resultado da execução

Decisões aplicadas: ⓘ também nos Tipos; busca de itens em todos os catálogos; busca global de itens retirada.

| Caso | Resultado |
|---|---|
| CT-UI-01 aviso no ⓘ (mouse e teclado) | Passou |
| CT-UI-02 busca de catálogo só por nome | Passou |
| CT-UI-03 "luv" na EPI → 1 de 8 | Passou |
| CT-UI-04 subir/descer travados na busca | Passou |
| CT-UI-05 busca + Inativos nos Tipos, ⓘ nos Tipos | Passou |
| CT-UI-05b trocar de catálogo limpa a busca | Passou |
| CT-UI-06 820/390 px sem rolagem lateral; toque abre o ⓘ | Passou |

- Testes unitários: 453 passaram (inclui `filterCatalogs`/`filterItems`). tsc, eslint e build limpos; 0 erros JS no e2e.
- Banco, API e Supabase: sem mudança. Basta rebuild do front e push.
