# SPEC 009: Avaliação do tipo "Relações" (manter ou remover)

| | |
|---|---|
| Status | **Avaliação concluída, aguardando aprovação da remoção** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Onde aparece | Configuração › Catálogos › **Relações**; página antiga do equipamento (`#ativo/<id>`), seção **Relações** |

## 1. Resposta curta

"Relações" mistura **duas coisas de peso muito diferente**:

| Parte | O que é | Veredito |
|---|---|---|
| **"é parte de"** (tipo do sistema, com cadeado) | É como o PTW guarda o **Equipamento pai**: a árvore de Gestão de Ativos e a **trava de equipamento** (um equipamento, uma PT aberta, contando suas partes). | **Manter.** É regra de segurança; sem ela, duas PTs poderiam abrir no mesmo equipamento por partes diferentes. |
| **Relações livres** ("alimenta", "isola", "abastece" e as que o usuário criar) | Só **informativas**: ligam dois ativos com um rótulo. | **Pode remover.** Nenhuma regra, formulário, assinatura, quadro ou relatório as usa. |

**Recomendação:** tirar "Relações" da tela de Catálogos e a seção de relações livres da página do equipamento. "é parte de" continua por baixo, editada só pelo campo **Equipamento pai**, como já é hoje em Gestão de Ativos. O banco não muda.

## 2. Finalidade original

`ptw-server/db/schema/10_cadastro.sql`: *"Relações entre ativos (alimenta, isola, abastece, parte de…): from_id <relação> to_id."*

- **Tipos de relação** são o catálogo `type_def` da família `relacao`. Hoje existem 4: alimenta, isola, abastece e "é parte de" (`system_key = parte_de`).
- **Relações** são a tabela `ptw.asset_relation` (de, para, tipo).
- Só o "é parte de" tem regra: um gatilho mantém o fecho transitivo (`ptw.asset_part`), recusa ciclos (PTW11) e recusa juntar duas PTs abertas no mesmo equipamento (PTW10).

## 3. Mapa de dependências

### 3.1 "é parte de" (fica)

| Onde | Para quê |
|---|---|
| Banco: `asset_relation_part`, `asset_part`, `is_part_of`, trava de equipamento | Fecho da hierarquia; PTW10 e PTW11 |
| `core/equipmentLock.ts` (`partOfKindIds`, `assetsCollide`, `equipmentHolders`, `openCollisions`) | A mesma trava no app: aviso no rascunho, bloqueio na assinatura |
| `core/signing.ts` › `lockChecks`; `permit/reducer.ts`; `core/myWork.ts`; `QuadroView` | "Equipamento ocupado" ao assinar, no Quadro e no Dashboard |
| `core/assetTree.ts` › `partParents`; `AssetManagement/Tree.tsx`, `Detail.tsx` | A árvore Planta › Área › Equipamento › partes |
| `AssetManagement/NodeDialog.tsx` | O campo **Equipamento pai** (SPEC 004) grava uma relação "é parte de" |
| `data/memory/registry.ts`, `core/registryRules.ts` | As mesmas recusas (ciclo e colisão) no modo memória |

### 3.2 Relações livres (podem sair)

| Onde | Uso |
|---|---|
| **Catálogos › Relações** (`core/catalogs.ts`, `TypeCatalogPanel.tsx`) | Criar, renomear e desativar tipos de relação |
| **Página antiga do equipamento** (`AssetsView.tsx`, seção "Relações" e modal "Nova relação") | Listar, adicionar e remover relações. Chega-se nela pelo link "Relações, locais e histórico completo do equipamento" em Gestão de Ativos. |
| API: `GET/POST/DELETE /asset-relations`, `GET /types?family=relacao` | Leitura e gravação genéricas, também usadas pelo "é parte de" |
| Auditoria: `cadastro.ativo.relacao.*`, leitor da trilha | Histórico; continua legível |
| Dados atuais: seed local com 1 relação livre ("abastece") e 4 "é parte de"; demos `celulose`/`sgi` com algumas livres | Só exibição |

**Nenhum uso encontrado** de relações livres em:
- modelos de PT ou formulários;
- regras de emissão e assinatura;
- Quadro, Dashboard ou impressão;
- importação e exportação.

**No protótipo SGI** não encontrei tela de relações entre equipamentos; lá a hierarquia é só Planta › Área › Equipamento › Equipamento pai.

## 4. Impacto da remoção (das relações livres)

| Item | Impacto |
|---|---|
| Trava de equipamento, árvore, Equipamento pai | **Nenhum**: dependem só de "é parte de", que fica |
| Telas | Catálogos fica com 3 tipos (Tipos de local, Tipos de ativo, Cargos). A página antiga do equipamento perde a seção de relações livres e mostra **"Faz parte de / Partes"**, só leitura. |
| Dados existentes | Continuam no banco e na auditoria; só deixam de aparecer. Nada é apagado. |
| API e banco | **Sem mudança obrigatória.** A rota `/asset-relations` continua, porque o Equipamento pai a usa. |
| Supabase | Nenhum script. |
| Risco | Baixo. Os testes da trava e da árvore continuam valendo; os testes de catálogo e da página do equipamento serão ajustados. |

## 5. O que seria feito (se aprovado)

1. **Catálogos:** sai o item "Relações". `#catalogos/relacoes` cai em "Tipos de local". As palavras de busca Ctrl+K "relações" deixam de apontar para Catálogos.
2. **Página do equipamento** (`#ativo/<id>`):
   - a seção "Relações" e o modal "Nova relação" saem;
   - entra **"Hierarquia"**, só leitura: "Faz parte de: X" e "Partes: A, B", com link para Gestão de Ativos para mudar o Equipamento pai;
   - o link em Gestão de Ativos passa a dizer "Locais e histórico completo do equipamento".
3. **Código e testes:** remover `AddRelation` e o painel de tipos de relação; manter tudo o que é "é parte de"; atualizar `DESIGN.md`.
4. **Banco e API:** sem mudança (ver decisão 2).

## 6. Para você decidir

1. **Remover as relações livres da interface, mantendo "é parte de"?**
   - **Proposta:** sim, como na seção 5.
   - **Alternativa:** manter tudo como está.
2. **E os dados das relações livres que já existem?**
   - **Proposta:** **manter no banco**, só sem tela; a auditoria fica íntegra e dá para voltar atrás.
   - **Alternativa:** um script de release que apaga as relações livres e desativa os tipos (irreversível, mas auditado).
3. **Restringir a API** para aceitar só "é parte de" em `POST /asset-relations` (recusa com 400)?
   - **Proposta:** **não** agora, para evitar deploy de API por algo que a tela já não oferece.
   - **Alternativa:** sim, para fechar a porta de vez.
