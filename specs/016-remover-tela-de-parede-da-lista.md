# SPEC 016: Remover o atalho da Tela de Parede da lista de Solicitações

| | |
|---|---|
| Status | **Executada (26/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Solicitações de PT (`QuadroView`, cabeçalho) |

## 1. Resposta curta

O único ponto de entrada da Tela de parede era o botão **"Tela de parede"** (ação secundária) no cabeçalho de Solicitações de PT, ao lado de "Nova PT". Não havia outro atalho no app (menu lateral, paleta de comandos, Dashboard). O pedido é tirar esse botão; nada mais depende dele.

## 2. Escopo

**Dentro:** remover a ação secundária do cabeçalho. Sem ela, o cabeçalho tem a contagem e o botão "Nova PT"; o menu "Mais" (que só existia para recolher a ação secundária no celular) deixa de aparecer, e "Nova PT" fica sozinho à direita.

**Fora (decisão tomada por ser o mais seguro; avise se quiser outra):** a tela `#parede` e a rota **continuam existindo** e abrem pelo endereço (para quem já usa a TV de controle com o link guardado). Só o atalho some.

## 3. Critérios de aceite

- O botão "Tela de parede" não aparece em Solicitações de PT, em tela larga nem no celular.
- Contagem, "Nova PT", busca, segmentos, filtros e lista continuam como antes.
- `#parede` ainda abre a tela escura de TV.

## 4. Resultado da execução

- `QuadroView.tsx`: removida a ação secundária `{ label: "Tela de parede", href: "#parede" }`.
- `DESIGN.md` e a SPEC 011 (menção ao botão) atualizados no texto; a rota não mudou.
- Verificação: `npm run check` e conferência no navegador (cabeçalho só com "Nova PT"; `#parede` abre).
