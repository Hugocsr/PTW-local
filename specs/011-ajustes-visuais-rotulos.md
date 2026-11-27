# SPEC 011: Ajustes visuais (rótulos): "Quadro de PTs" passa a "Solicitações de PT"

| | |
|---|---|
| Status | **Executada (26/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Referência | Item 1 do pedido: "Ajustar o rótulo atual **Quadro de PTs** para **Solicitações de PT**". Esta spec reúne os ajustes visuais; novos itens entram numerados abaixo. |

## 1. Contexto

### Onde o rótulo "Quadro de PTs" aparece hoje

| Onde | Arquivo | Texto atual |
|---|---|---|
| **Menu lateral** (grupo Operação), **busca global** (Ctrl+K) e título da aba | `components/shell/nav.ts` › `NAV.quadro.title` | "Quadro de PTs" |
| **Título da página** | `components/work/QuadroView.tsx` (linha 130) | "Quadro de PTs" |
| **Link de voltar** da tela Nova PT | `components/work/NewPermitView.tsx` (linha 67) | "← Quadro de PTs" |
| **Rodapé do painel Desabilitados agora** (Dashboard) | `components/work/Dashboard/ProtectionsPanel.tsx` (linha 92) | "Veja todas no Quadro de PTs." |
| **Documentação** | `DESIGN.md` (linhas 339 e 608), `ptw-mockup-v2/README.md` (linha 16), `specs/001-dashboard.md` (histórico) | "Quadro de PTs" |

A tela é a lista de **todas** as PTs (busca, filtros e segmentos), aberta em `#quadro`.

### O que não é rótulo

- A rota `#quadro`, a chave `quadro` em `NAV`/`navigation.ts` e o componente `QuadroView` são nomes internos. O comentário em `nav.ts` diz "do not rename" (as chaves são hashes canônicos).
- "Solicitação" também é o nome da **primeira etapa** de cada fluxo (kind `solicitacao`, "Solicita a PT"). Isso **não muda**.
- "Quadro de força", "Quadro de iluminação" etc. são nomes de equipamentos nos dados de exemplo. **Não mudam.**

## 2. Objetivo

Trocar o texto exibido **"Quadro de PTs" → "Solicitações de PT"** em todas as telas, mantendo links, rotas e favoritos funcionando.

## 3. Escopo

**Entra**
1. `NAV.quadro.title` = "Solicitações de PT" (menu, busca global e o que mais lê `NAV`).
2. Título da página em `QuadroView`.
3. Link de voltar da Nova PT: "← Solicitações de PT".
4. Texto do rodapé do painel Desabilitados agora: "Veja todas em Solicitações de PT."
4b. **Rota e chave do menu**: `#quadro` → `#solicitacoes` (decisão 4).
5. `DESIGN.md` e `README.md` com o novo nome (a `specs/001` é registro histórico e **não** é reescrita).
6. Busca global: **sem** a palavra "quadro" (decisão 2).

**Não entra**
- Renomear o componente `QuadroView` e os arquivos (nomes internos).
- Mudar o ícone, a ordem do menu, os filtros ou o conteúdo da tela.
- Banco, API e Supabase.
- Renomear a etapa "Solicitação" dos modelos.

## 4. Comportamento esperado

- No menu, o item de Operação mostra **Solicitações de PT** no lugar de "Quadro de PTs".
- A página aberta pelo item tem o título **Solicitações de PT**, com a contagem e "Nova PT" (o botão "Tela de parede" saiu na SPEC 016).
- Em Nova PT, o link de voltar diz "Solicitações de PT" (quando vem da lista).
- A busca global acha a tela digitando "solicitações"; "quadro" não acha mais.
- A tela abre em `#solicitacoes`. O endereço antigo `#quadro` não é mais reconhecido e cai no Dashboard (sem apelido, por decisão).

## 5. Impacto

- **Só texto de tela**: 4 arquivos de código e 2 de documentação. Sem mudança de dados, contrato ou regras.
- **Testes:** nenhum teste automático cita o rótulo (conferido); `core/navigation.test.ts` usa só as chaves. Os roteiros de e2e que clicam por texto no menu ("Quadro de PTs") precisam trocar o texto.
- **Largura:** "Solicitações de PT" tem 18 caracteres contra 14; confiro que o menu lateral, o cabeçalho e o link de voltar não quebram linha em 390, 768, 1024 e 1440 px.

## 6. Decisões (26/11/2026)

1. **Conteúdo da tela:** só renomear.
2. **Busca global:** **não** manter "quadro" como palavra-chave.
3. **Rodapé do Dashboard:** trocar junto.
4. **Rota:** pode mudar (ainda em desenvolvimento): `#solicitacoes`, sem apelido para `#quadro`.

## 7. Plano de testes

| Caso | O que conferir |
|---|---|
| CT-01 | Menu, título da página e busca global mostram "Solicitações de PT"; "Quadro de PTs" não aparece em nenhuma tela. |
| CT-02 | Busca global: "solicitações" acha a tela; "quadro" não. |
| CT-03 | Nova PT aberta a partir da lista: link de voltar com o novo nome e volta à lista. |
| CT-04 | Dashboard › Desabilitados agora, com 100 PTs ou mais: rodapé com o novo texto. |
| CT-05 | `#solicitacoes` direto na barra de endereço abre a tela; `#quadro` cai no Dashboard. |
| CT-06 | 390, 768, 1024 e 1440 px: sem quebra de linha nem rolagem lateral no menu e no cabeçalho. |
| CT-07 | `npm run check` limpo; busca por "Quadro de PTs" no código e na documentação ativa não encontra mais nada. |

## 8. Como entregar

Front-end apenas: `docker compose ... up -d --build --wait` na pasta `ptw-server`, Ctrl+F5 e push. Sem script de banco.

## 9. Resultado da execução

**Como ficou:**
- `shell/nav.ts`: chave `solicitacoes`, título "Solicitações de PT" (menu, busca e breadcrumb). A chave de rota seguiu o nome: `App.tsx`, `core/navigation.ts` (+ teste), `work/nav.ts`, `PermitDetailView`, `NewPermitView`, `WallView` (sair da tela de parede) e `QuadroView` usam `solicitacoes`.
- Título da página, link de voltar da Nova PT e rodapé do Dashboard com o novo texto.
- `DESIGN.md` e `README.md` atualizados; `specs/001` ficou como registro histórico.
- Ficaram com o nome antigo, por serem internos: componente `QuadroView`, `stateKey` da lista e comentários do código.
- Banco, API e Supabase: sem mudança.

| Caso | Resultado |
|---|---|
| CT-01 menu, título e breadcrumb; nenhum "Quadro de PTs" na tela (1440, 1024, 768 e 390 px) | Passou |
| CT-02 busca global "quadro" → "Nada encontrado" | Passou |
| CT-03 Nova PT aberta da lista mostra o link de voltar com o novo nome | Passou |
| CT-04 rodapé do Dashboard (100 PTs ou mais) | Não exercitado: o banco de teste tem 0 PTs; é texto fixo conferido no código |
| CT-05 `#solicitacoes` abre a tela; `#quadro` cai no Dashboard | Passou |
| CT-06 sem rolagem lateral; item do menu cabe em uma linha, inclusive na gaveta de 390 px | Passou |
| CT-07 tsc e eslint limpos, 457 testes passaram, nenhuma ocorrência do rótulo antigo no código e na documentação ativa | Passou |

**Atenção:** favoritos com `#quadro` deixam de funcionar. Roteiros de e2e que clicam em "Quadro de PTs" precisam do novo texto.
