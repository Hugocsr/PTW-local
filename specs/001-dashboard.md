# SPEC 001: Dashboard (une "Minha área" e "Desabilitados agora")

| | |
|---|---|
| Status | **Implementada** (aprovada em 24/11/2026 com as propostas da seção 11) |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 24/11/2026 |
| Referência visual | Protótipo "Dashboard" enviado no requisito |

## 1. Contexto

Hoje, o grupo **Operação** do menu tem três telas:

| Tela | Rota | O que mostra |
|---|---|---|
| Minha área | `#minha-area` | Resumo com 3 contadores (Sua vez, Aguardando, Em campo) e um quadro com 3 colunas de cartões de PT. Cada coluna tem ações (Assinar/Preencher, Retomar, Parar, Entregar) e "Mostrar mais". Mostra também avisos de servidor fora, bloqueios de cargo e cargos vencendo. No menu "⋯" fica "Seus cargos e conta" (`#minha-area/eu`). O botão "Nova PT" fica no topo. |
| Desabilitados agora | `#desabilitados` | 3 contadores (Desabilitados agora, A reabilitar, Aguardando aprovação) e 3 listas de PTs de desabilitação de intertravamento ou proteção. Cada linha mostra os dados principais (tag, classe, OS), a situação, o tempo restante e a janela. É só leitura: a linha abre a PT. |
| Quadro de PTs | `#quadro` | Todas as PTs, com busca e filtros. **Não muda.** |

Minha área é a tela inicial após o login, e o item dela no menu mostra o número de "Sua vez".

## 2. Objetivo

Ter **uma única página, "Dashboard"**, que junte as duas telas no layout do protótipo e mantenha todas as funções delas. O menu passa a ter só um ponto de entrada para a visão do dia.

## 3. Escopo

**Entra**
- Nova página `#dashboard`, que vira a tela inicial.
- Painel **Desabilitados agora**: os 3 contadores e o "Detalhamento das proteções", com os 3 grupos abrindo e fechando.
- Painel **Minha Área**: os blocos Sua vez, Aguardando e Em campo, com os cartões e as ações de hoje.
- Avisos (servidor fora, bloqueios, cargos vencendo), "Nova PT" e "Seus cargos e conta".
- Menu com "Dashboard" no lugar dos dois itens. As rotas antigas continuam funcionando, como apelidos.
- Layout para desktop, tablet e celular, usando só os componentes e tokens do design system SGI já aplicado.
- Testes automáticos e roteiro manual.

**Não entra**
- Quadro de PTs (continua igual e separado).
- Novos indicadores ou gráficos (por exemplo, PTs por tipo).
- Qualquer mudança no banco ou na API: a página usa os mesmos dados e as mesmas consultas de hoje.

## 4. Regras que não mudam

1. O que conta como "Sua vez", "Aguardando" e "Em campo" continua definido pelas mesmas funções de hoje (`useMyWork`, `mustActCount`, `waitingList`).
2. Os grupos "Desabilitados agora", "A reabilitar" e "Aguardando aprovação" continuam definidos por `bypassGroup`. Os dados de cada linha continuam vindo de `bypassFacts`.
3. As ações dos cartões continuam as mesmas, com as mesmas permissões:
   - Assinar abre o diálogo de assinatura.
   - Preencher abre a PT.
   - Retomar abre o diálogo de retomada.
   - Entregar.
   - **Parar** continua disponível com o servidor fora.
4. Servidor fora: os contadores mostram "—" e os botões que dependem do servidor ficam desativados, com o mesmo aviso de hoje.
5. Quem pode ver: as duas telas são liberadas para qualquer pessoa logada, e o Dashboard também.
6. O número no menu continua sendo a contagem de "Sua vez".

## 5. Experiência

### 5.1 Navegação

- No menu, o grupo **Operação** fica com **Dashboard** (ícone de grade, com o número de "Sua vez") e **Quadro de PTs**. Os itens "Minha área" e "Desabilitados agora" saem do menu.
- Rotas:

| Rota | Comportamento |
|---|---|
| `#dashboard` | Abre a página. É também a tela inicial e a rota usada quando a rota pedida não existe. |
| `#dashboard/eu` | Seus cargos e conta. O botão Voltar leva ao Dashboard. |
| `#minha-area`, `#pendencias`, `#campo` | Abrem o Dashboard. |
| `#minha-area/pts` | Abre o Dashboard rolado até o bloco "Aguardando". |
| `#minha-area/eu` | Abre `#dashboard/eu`. |
| `#desabilitados` | Abre o Dashboard rolado até o painel "Desabilitados agora". |

- A busca do topo (Ctrl K) passa a listar "Dashboard". Os links "Voltar para Minha área" e "De: Minha área" passam a dizer "Dashboard".

### 5.2 Estrutura da página (desktop, a partir de 1024 px)

```
┌ Cabeçalho ───────────────────────────────────────────────────────────────┐
│ [▦] Dashboard                                    [⋯]  [+ Nova PT]        │
│     Visão geral das operações e Permissões de Trabalho                   │
└──────────────────────────────────────────────────────────────────────────┘
 Avisos (só quando existem): servidor fora · bloqueios de cargo · cargos vencendo
┌ Desabilitados agora (≈ 2/3) ──────────────────────┐ ┌ Minha Área (≈ 1/3) ──┐
│ [🛡] Desabilitados agora                          │ │ [👤] Minha Área      │
│  Acompanhe o status das proteções…                │ │  Acompanhamento das… │
│ ┌KPI ↗┐ ┌KPI ↗┐ ┌KPI ↗┐                           │ │ ┌Sua vez ↗────────┐  │
│ │ 0   │ │ 0   │ │ 0   │                           │ │ │ 0 · Ações que…  │  │
│ └─────┘ └─────┘ └─────┘                           │ │ │ cartões / vazio │  │
│ ┌ Detalhamento das proteções       n registros ┐ │ │ └─────────────────┘  │
│ │ ▸ Desabilitados agora        (n)  ⌃          │ │ │ ┌Aguardando ↗─────┐  │
│ │   linhas ou vazio                            │ │ │ └─────────────────┘  │
│ │ ▸ A reabilitar               (n)  ⌃          │ │ │ ┌Em campo ↗───────┐  │
│ │ ▸ Aguardando aprovação       (n)  ⌃          │ │ │ └─────────────────┘  │
│ └──────────────────────────────────────────────┘ │ └──────────────────────┘
└───────────────────────────────────────────────────┘
```

**Cabeçalho.** Ícone em quadrado suave da cor principal, título "Dashboard" e o subtítulo do protótipo. O botão principal é "Nova PT". O menu "⋯" tem "Seus cargos e conta".

**Painel "Desabilitados agora"** (cartão com borda 1 px e raio de 8 px):
- **3 contadores, cada um com cor, ícone e texto vazio próprios:**

| Contador | Cor | Ícone | Texto quando vazio |
|---|---|---|---|
| Desabilitados agora | vermelho | escudo cortado | "Nenhuma proteção desabilitada." |
| A reabilitar | âmbar | escudo com check | "Nenhuma proteção aguardando reabilitação." |
| Aguardando aprovação | roxo/índigo | relógio | "Nenhuma solicitação aguardando aprovação." |

  Cada contador mostra ícone em quadrado da cor, número grande e rótulo. A seta ↗ leva ao grupo correspondente no detalhamento: abre o grupo e rola até ele.
- **"Detalhamento das proteções"** com o total de registros. São 3 grupos, cada um com ícone colorido, título, contador em pílula da mesma cor e seta ⌃ ⌄ para abrir e fechar.
  - O conteúdo de cada grupo são as linhas de hoje (tela Desabilitados): nome do serviço, nº da PT, ativos, dados principais, situação, quem é o próximo, tempo restante e janela. Quando o prazo vence, aparece "Prazo vencido: reabilite". Clicar na linha abre a PT.
  - Grupo vazio: caixa cinza com ícone e o texto da tabela acima.
  - **Começam abertos** os grupos que têm itens. Grupos vazios também começam abertos, para mostrar o estado vazio como no protótipo. Ao abrir ou fechar, o estado fica guardado só enquanto a página está aberta.

**Painel "Minha Área"** (cartão do mesmo estilo):
- **3 blocos, nesta ordem:**

| Bloco | Cor | Ícone | Frase | Texto quando vazio |
|---|---|---|---|---|
| Sua vez | azul | lápis | "Ações que dependem de você" | "Nada esperando por você." |
| Aguardando | cinza | ampulheta | "Próximas ações de outras pessoas" | "Nenhuma PT esperando outra pessoa." |
| Em campo | verde | play | "Suas PTs em acompanhamento" | "Nenhuma PT sua em campo agora." |

  Cada bloco mostra ícone em quadrado, título, número grande e a frase.
- **Os cartões de PT** são os mesmos de hoje, com as mesmas três faixas (identificação, local e ativo, ação). Cada bloco mostra **até 3 cartões**. A seta ↗ e o botão "Ver todas (n)" abrem o **bloco expandido**: o mesmo bloco ocupando a largura da página, com "Mostrar mais" de 30 em 30 e "← Dashboard" para voltar. A rota é `#dashboard/sua-vez`, `#dashboard/aguardando` ou `#dashboard/em-campo`.
- O bloco vazio usa a caixa cinza com ícone de bandeja e o texto da tabela acima.

### 5.3 Tablet (768 a 1023 px)

- Uma coluna, nesta ordem: Minha Área, depois Desabilitados agora.
- Em Minha Área, os 3 blocos ficam lado a lado (3 colunas), com até 2 cartões cada.
- Os 3 contadores de Desabilitados ficam em uma linha. As linhas do detalhamento são empilhadas (texto em cima, janela embaixo).

### 5.4 Celular (abaixo de 768 px)

- Uma coluna, nesta ordem:
  1. Avisos.
  2. Minha Área, com os blocos na ordem **Em campo → Sua vez → Aguardando**. É a mesma regra de hoje: segurança antes da papelada.
  3. Desabilitados agora.
- Os contadores de Desabilitados ficam em 3 colunas compactas: número e rótulo curto, sem a frase e com o ícone menor.
- Botões e áreas de toque com no mínimo 44 px. Nenhuma rolagem lateral na página.
- "Nova PT" fica no cabeçalho, como hoje no celular.

### 5.5 Estados

| Estado | Comportamento |
|---|---|
| Carregando | Contadores com "–"; detalhamento com "Carregando…". |
| Erro ao carregar o painel de proteções | Alerta vermelho no painel ("Não foi possível carregar: …"). Minha Área continua funcionando. |
| Servidor fora | Faixa de aviso de hoje no topo; contadores de Minha Área com "—"; Parar continua ativo. |
| Pessoa sem nenhuma PT e sem proteções | A página inteira mostra os estados vazios do protótipo. |

### 5.6 Design system

- Usa só os tokens SGI já aplicados:
  - cor principal índigo e suas versões suaves;
  - cores de status `st-ok`, `st-attention`, `st-stop`, `st-neutral` e `primary-soft`;
  - raios de 6 e 8 px, sombra `elev-2` e fonte do sistema.
- Usa os componentes existentes: `Page`, `PageHeader`, `Button`, `Collapsible`, os cartões de PT de hoje, `WindowMeter`, `MiniRail` e `PermitStateBadge`.
- Mesmos ícones da aplicação (lucide).
- Acessibilidade:
  - cada painel é uma `section` com título;
  - os grupos usam `aria-expanded` e os contadores têm rótulo para leitor de tela;
  - a cor nunca é a única pista (sempre há texto junto);
  - o foco fica visível.

## 6. Dados e API

Nada muda. A página reaproveita:
- **Minha Área:** `useMyWork()`, que já alimenta a tela e o número do menu.
- **Desabilitados:** `usePermitBoard({ segment: "andamento", pageSize: 100 })` e `bypassGroup`/`bypassFacts`.

Não haverá consulta nova ao servidor, e o tempo de carga deve ser igual à soma das duas telas de hoje.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | Existe a página **Dashboard** em `#dashboard`, com o cabeçalho, o subtítulo e os dois painéis do protótipo. |
| CA-02 | O menu mostra **Dashboard** (com o número de "Sua vez") e não mostra mais "Minha área" nem "Desabilitados agora". |
| CA-03 | Depois do login, e em rota desconhecida, a pessoa cai no Dashboard. |
| CA-04 | `#minha-area`, `#minha-area/pts`, `#minha-area/eu`, `#pendencias`, `#campo` e `#desabilitados` levam ao ponto certo do Dashboard (ver 5.1). |
| CA-05 | Os 3 contadores de Desabilitados mostram os mesmos números da tela antiga. A seta ↗ abre e rola até o grupo. |
| CA-06 | Os 3 grupos do detalhamento abrem e fecham, mostram o contador e listam as mesmas linhas da tela antiga. A linha abre a PT. |
| CA-07 | Sua vez, Aguardando e Em campo mostram os mesmos números e cartões da Minha área antiga, com até 3 cartões e "Ver todas (n)". |
| CA-08 | Assinar, Preencher, Retomar, Entregar e Parar funcionam a partir do Dashboard, com as mesmas regras. Parar continua disponível sem servidor. |
| CA-09 | O bloco expandido (`#dashboard/sua-vez` e os outros dois) mostra todos os cartões, com "Mostrar mais", e volta ao Dashboard. |
| CA-10 | "Seus cargos e conta" abre pelo menu "⋯" e o botão Voltar retorna ao Dashboard. Os avisos de bloqueio e de cargo vencendo aparecem acima dos painéis. |
| CA-11 | "Nova PT" abre a criação de PT. |
| CA-12 | Os estados vazio, carregando, erro e servidor fora aparecem como descrito em 5.5. |
| CA-13 | Em 390 × 844 (celular) e 820 × 1180 (tablet) não há rolagem lateral; a ordem segue 5.3 e 5.4; toques com no mínimo 44 px. |
| CA-14 | Só tokens e componentes do design system atual. Contraste AA. Navegação por teclado completa. |
| CA-15 | Nenhuma outra tela muda de comportamento. Os testes de hoje continuam passando. |

## 8. Casos de teste

**Automáticos**

| Onde | O que testa |
|---|---|
| `core/navigation.test.ts` | O grupo Operação fica com `dashboard` e `quadro`, e as permissões de leitura continuam iguais. |
| `core/dashboard.test.ts` (novo, regras puras) | Como cada rota antiga é traduzida (CA-04); quantos cartões aparecem por bloco (3) e o "Ver todas"; quais grupos começam abertos. |
| Testes de hoje | `myWork`, `bypass`, `board`: devem continuar passando sem mudança. |
| Verificações gerais | `tsc`, `eslint` e `vite build`. |

**Ensaio na tela (Playwright, na nuvem, com API e banco reais e os dados de exemplo)**

| Caso | Roteiro |
|---|---|
| CT-01 | Marina (admin): o Dashboard abre depois do login. Conferir menu, cabeçalho e os dois painéis (CA-01, 02, 03). |
| CT-02 | Criar uma PT de desabilitação de intertravamento ativa. Os contadores e o grupo "Desabilitados agora" mostram 1. A seta ↗ rola até o grupo; fechar e abrir o grupo (CA-05, 06). |
| CT-03 | Uma PT em análise com a vez da Marina aparece em "Sua vez" e no número do menu. Assinar pelo cartão faz a PT sair de "Sua vez" (CA-07, 08). |
| CT-04 | Uma PT ativa aparece em "Em campo". Parar pelo cartão e confirmar (CA-08). |
| CT-05 | Com mais de 3 PTs em um bloco: "Ver todas" abre o bloco expandido e "Voltar" retorna (CA-09). |
| CT-06 | Abrir cada rota antiga e conferir o destino (CA-04). |
| CT-07 | Servidor fora (modo de teste): contadores com "—", Parar disponível, Assinar desativado (CA-12). |
| CT-08 | Capturas em desktop 1440, tablet 820 e celular 390, conferindo a ordem e a ausência de rolagem lateral (CA-13). |
| CT-09 | Paulo (sem papel de cadastro): o Dashboard funciona e mostra só as PTs dele (CA-15). |

**Roteiro manual no seu localhost:** os mesmos passos CT-01 a CT-08, entrando com Marina e Paulo.

## 9. Impacto e riscos

- **Banco:** não muda e não precisa ser zerado. Basta reconstruir (`python tools/ptw_instalar.py --local`).
- **Favoritos e links antigos:** continuam funcionando por causa dos apelidos de rota.
- **Documentação** (`DESIGN.md` e `AGENTS.md`): as seções "Minha área" e "Desabilitados agora" passam a descrever o Dashboard.
- **Desempenho:** o painel de proteções carrega até 100 PTs abertas, como hoje. Acima disso, mostra o aviso "Primeiros 100".

## 10. Plano de execução

1. `core/dashboard.ts` (rotas antigas, limites por bloco, grupos iniciais) e os testes dele; ajustar `core/navigation.ts` e o teste de navegação.
2. `components/work/Dashboard/`:
   - `DashboardView.tsx`: cabeçalho, avisos e grade.
   - `ProtectionsPanel.tsx`: aproveita as linhas de `BypassView`.
   - `MyAreaPanel.tsx`: aproveita os cartões e diálogos de `MinhaAreaView`.
   - `ExpandedBlock.tsx`: o bloco expandido.
3. `App.tsx` (rotas e apelidos), `shell/nav.ts` (menu e ícone), `AppSidebar` (número no menu), `CargosView` e `PermitDetailView` (rótulos de volta).
4. Remover `BypassView.tsx` e a parte de página de `MinhaAreaView.tsx`, depois de mover o que é reaproveitado (os cartões).
5. Atualizar `DESIGN.md` e `AGENTS.md`.
6. Rodar as verificações gerais e o ensaio na tela (CT-01 a CT-09), com capturas.
7. Copiar os arquivos para a sua pasta e pedir a reconstrução.

## 11. Pontos para você decidir

1. **Ordem no celular e no tablet:** proposta = Minha Área primeiro, depois Desabilitados. A alternativa é Desabilitados primeiro.
2. **Seta ↗ dos blocos de Minha Área:** proposta = bloco expandido dentro do Dashboard. A alternativa é abrir o Quadro de PTs filtrado, o que só funciona bem para "Sua vez" (filtro "Minhas ações").
3. **Cartões por bloco antes de "Ver todas":** proposta = 3 no desktop e 2 no tablet.
4. **Nome no menu:** "Dashboard", como no requisito. A alternativa é "Painel".


## 12. Resultado da execução (24/11/2026)

Decisões da seção 11: aprovadas as quatro propostas (Minha Área primeiro abaixo de `lg`; ↗ abre o bloco expandido; 3 cartões, 2 no tablet; nome "Dashboard").

Verificações gerais: `tsc`, `eslint` e `vite build` sem erros; 442 testes do app (4 novos em `core/dashboard.test.ts`); cópia compartilhada da API conferida.

| Caso | Resultado |
|---|---|
| CT-01 | PASSOU: o Dashboard abre depois da entrada (demonstração e API real); o menu mostra "Dashboard 4 · Quadro de PTs". |
| CT-02 | PASSOU: ↗ "A reabilitar" rola até o grupo; o grupo fecha e abre (`aria-expanded`); a linha abre a PT. |
| CT-03 | PASSOU: "Sua vez" com 4, 3 cartões e o número do menu igual; Assinar abre o diálogo. Na API real, Marina vê a emissão pendente. |
| CT-04 | PASSOU: Parar abre a confirmação (demonstração e API real, Paulo em campo). |
| CT-05 | PASSOU: "Ver todas (4)" abre `#dashboard/sua-vez` com 4 cartões; ↗ Aguardando abre `#dashboard/aguardando`; "← Dashboard" volta. |
| CT-06 | PASSOU: todas as rotas antigas e uma rota inexistente levam ao destino da tabela 5.1; Seus cargos e conta volta ao Dashboard. |
| CT-07 | PASSOU: sem servidor, a faixa de aviso aparece, os números mostram "—" e Parar continua ativo. |
| CT-08 | PASSOU: em 1440, 820 e 390 px, a largura da página é igual à da tela (sem rolagem lateral); ordem como em 5.3 e 5.4. |
| CT-09 | PASSOU: Paulo vê só as PTs dele (Em campo 1). |
| CT-11 | PASSOU: Nova PT abre a criação. |

Sem erros de página nos ensaios.
