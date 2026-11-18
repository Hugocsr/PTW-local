---
name: PTW — Permissão de Trabalho
description: Mockup operacional de Permissão de Trabalho; claro, denso, previsível, cor só para estado.
colors:
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  secondary: "oklch(0.97 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.5 0 0)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.63 0 0)"
  ring: "oklch(0.45 0 0)"
  surface-canvas: "oklch(0.975 0 0)"
  surface-well: "oklch(0.95 0 0)"
  surface-fixed: "oklch(0.92 0 0)"
  surface-row: "oklch(1 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-text: "oklch(0.5 0.2 27)"
  st-ok-surface: "oklch(0.955 0.045 150)"
  st-ok-border: "oklch(0.83 0.09 150)"
  st-ok-fg: "oklch(0.40 0.11 150)"
  st-ok-solid: "oklch(0.5 0.14 150)"
  st-pending-surface: "oklch(0.955 0.03 250)"
  st-pending-border: "oklch(0.82 0.08 250)"
  st-pending-fg: "oklch(0.42 0.15 255)"
  st-pending-solid: "oklch(0.5 0.19 255)"
  st-attention-surface: "oklch(0.965 0.05 85)"
  st-attention-border: "oklch(0.84 0.11 80)"
  st-attention-fg: "oklch(0.45 0.11 60)"
  st-attention-solid: "oklch(0.72 0.16 70)"
  st-stop-surface: "oklch(0.955 0.03 27)"
  st-stop-border: "oklch(0.82 0.09 27)"
  st-stop-fg: "oklch(0.48 0.19 27)"
  st-stop-solid: "oklch(0.577 0.245 27.325)"
  st-neutral-surface: "oklch(0.95 0 0)"
  st-neutral-border: "oklch(0.88 0 0)"
  st-neutral-fg: "oklch(0.42 0 0)"
  st-neutral-solid: "oklch(0.6 0 0)"
typography:
  page:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.375rem"
  subtitle:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "-0.005em"
  section:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  field:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  meta:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
    fontFeature: "tnum"
  data-title:
    fontFamily: "Geist Mono Variable, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.field}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-primary-touch:
    height: "44px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "36px"
  button-stop:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "44px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "36px"
  status-badge-ok:
    backgroundColor: "{colors.st-ok-surface}"
    textColor: "{colors.st-ok-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  status-badge-pending:
    backgroundColor: "{colors.st-pending-surface}"
    textColor: "{colors.st-pending-fg}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  status-badge-attention:
    backgroundColor: "{colors.st-attention-surface}"
    textColor: "{colors.st-attention-fg}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  status-badge-stop:
    backgroundColor: "{colors.st-stop-surface}"
    textColor: "{colors.st-stop-fg}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  status-badge-neutral:
    backgroundColor: "{colors.st-neutral-surface}"
    textColor: "{colors.st-neutral-fg}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: PTW — Permissão de Trabalho

## Overview

**Creative North Star: "O Quadro de Bloqueio"**

Uma ferramenta de segurança operacional, não uma vitrine. Tudo é cinza neutro e preto sobre fundo branco; a cor existe apenas para dizer em que situação algo está (liberado, sua vez, revisar, parado). Quem abre uma PT precisa achar a próxima ação no mesmo lugar em toda tela, ler o estado sem interpretar e não se enganar sobre o que é perigoso.

A densidade é de produto operacional: escala tipográfica fixa em rem, grade de 4 px, uma moldura de página única encostada à esquerda, quatro modelos de tela e nenhum outro. Hierarquia vem de estrutura (h1 → h2 → h3, linhas com divisória, painel lateral) e não de texto explicativo ou decoração. Tema claro.

**Key Characteristics:**
- Neutros acromáticos (croma 0); botões pretos; cor reservada a estado.
- Cinco tons de estado, sempre acompanhados de ícone ou palavra.
- Moldura de 72rem encostada à esquerda, título na mesma borda em todas as telas.
- Uma primária preenchida por região; destrutivo nunca no lugar da primária.
- Alvos de toque ≥ 44 px abaixo de `md`.
- Geist para texto; Geist Mono só para identificadores.

## Colors

Paleta acromática com cinco famílias de estado; nenhuma cor de marca.

### Primary
- **Preto Operacional** (`primary`): botão preenchido, a única ação principal de cada região. Não muda de cor por contexto: uma ação "boa" continua preta.

### Neutral
- **Branco** (`background`, `card`, `surface-row`): fundo da página, cartões e linhas.
- **Tinta** (`foreground`): texto principal.
- **Cinza de Apoio** (`muted-foreground`): rótulos, meta, contagens, ícones de linha.
- **Divisória** (`border`) e **Contorno de Campo** (`input`, L 0.63): linhas de tabela e bordas de campo; o contorno de campo tem ≥ 3:1 contra o branco e contra o poço, para que o que se preenche se reconheça de relance. Botões de escolha (toggle) usam o mesmo contorno; o escolhido é tonal (fundo `secondary`, texto em tinta, anel de 2 px em tinta), nunca preto cheio: preto é só da ação principal; botão primário desativado vira superfície `muted` com texto `muted-foreground`, sem opacidade; botões de ação em contorno usam a divisória, mais clara.
- **Anel de Foco** (`ring`): foco visível, cinza escuro a 50%.
- **Superfícies tonais** (`surface-canvas` < `surface-well` < `surface-row`; `surface-fixed` é o poço mais escuro para itens fixos do produto): profundidade por tom, não por sombra.

### Status (Cor de estado)
Cada tom tem quatro papéis: `surface` (fundo suave), `border` (borda de bloco), `fg` (texto/ícone, ≥ 4.5:1 sobre a própria superfície) e `solid` (pontos, barra de acento à esquerda, marcadores de etapa).
- **ok — Verde Liberado** (`st-ok-*`): concluído, assinado, liberado, em uso.
- **pending — Azul Sua Vez** (`st-pending-*`): a ação está com você ou em andamento (sua vez, em análise, emitida, entregue).
- **attention — Âmbar Revisar** (`st-attention-*`): precisa de revisão ou vence em breve (devolvida, expirada, revisar, rascunho de versão).
- **stop — Vermelho Parado** (`st-stop-*`): falhou, bloqueado, parado (suspensa, fora da faixa, equipamento com outra PT aberta, erro).
- **neutral — Cinza Aguardando** (`st-neutral-*`): aguardando outra pessoa, rascunho de PT, finalizado sem destaque.
- **Vermelho de Ação** (`destructive`, `destructive-text`): botão Parar (preenchido) e texto de ações de remoção. `destructive-text` é o vermelho mais escuro para texto vermelho sobre branco.

### Named Rules
**The Cor É Estado Rule.** Cor saturada só comunica estado. Botões ficam pretos (ou contorno); o único botão colorido é o vermelho de Parar e o de confirmação destrutiva.

**The Nunca Só Cor Rule.** Todo tom de estado vem com ícone ou palavra (`StatusBadge` exige texto; ícones isolados têm `aria-label`). Quem não distingue verde de vermelho lê o mesmo estado.

**The Um Significado Por Tom Rule.** Escolha o tom pelo significado da tabela acima, nunca pela estética. Azul não é "destaque", é "sua vez".

## Typography

**Display Font:** nenhuma; o sistema não tem tipo de exibição.
**Body Font:** Geist Variable (com ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono Variable (com ui-monospace, Menlo, Consolas), algarismos tabulares.

**Character:** Uma sans neutra e estável para tudo que se lê; a mono aparece só onde um código precisa ser comparado caractere a caractere.

### Hierarchy
Os papéis são utilitários `type-*`; use-os em vez de combinar tamanho e peso à mão.
- **Página** (`type-page`, 600, 22/28, −0.015em): o único `h1` de cada tela.
- **Título** (`type-title`, 600, 18/24): títulos de diálogo, destaques de cartão de trabalho e **nome da etapa** (PT, Testar, Fluxo, prévia da importação).
- **Subtítulo** (`type-subtitle`, 600, 16/24): **seção de formulário** e "Assinaturas" da etapa (com linha embaixo); áreas "Preencher"/"Assinar" do Fluxo e da prévia.
- **Seção** (`type-heading`, 600, 15/22): `h2` de `PageSection`, sem ícone e sem cartão.
- **Grupo** (`type-section`, 600, 14/20): `h3` de grupo ou cartão.
- **Corpo** (`type-body`, 400, 14/20): texto corrido, valores de propriedade.
- **Campo** (`type-field`, 500, 14/20): legenda de grupo de controles, mesmo peso de um rótulo de campo.
- **Rótulo** (`type-label`, 500, 12/16, cinza): rótulo de propriedade (`dt`).
- **Meta** (`type-meta`, 400, 12/16, cinza): linha de meta do cabeçalho, contagens, datas.
- **Dado** (`type-data`, mono 12/16, tabular) e **Dado-título** (`type-data-title`, mono 600 18/24): códigos como PT‑…, CCM‑…, tag de ativo.

Títulos usam `text-wrap: balance`; parágrafos `pretty`. Datas, contagens, células de tabela e selos usam algarismos tabulares.

### Named Rules
**The Mono Só Para Código Rule.** Geist Mono apenas para identificadores (número da PT, tag de ativo). Nunca para nomes de serviço, títulos ou texto.

**The Escala Fixa Rule.** Tamanhos em rem e fixos; nada de `clamp` ou escala fluida. O zoom do navegador continua valendo.

## Layout

**Moldura única.** O `main` tem `px-4 md:px-6 lg:px-8` e `pt-4 md:pt-6`. Dentro dele, toda tela renderiza exatamente um `Page`: largura total até 72rem (1152 px), **encostado à esquerda**, nunca centralizado. A borda esquerda do título é a mesma em todas as telas e em todos os monitores; a sobra em telas largas fica à direita. Nenhuma tela define outro `max-w` no contêiner da página.

**Conteúdo estreito** (`Narrow`) alinha à esquerda dentro da moldura: formulários até 40rem (≈ 65ch), árvores e listas simples até 48rem. Tabelas e quadros usam a largura inteira. Estados vazios também ficam alinhados à esquerda.

**Quatro modelos de tela, e nenhum outro:**
- **A. Lista** (Quadro, Modelos, Listas, **Ativos**, **Locais**): cabeçalho → barra de ferramentas → tabela (`DataTable`, paginada) sem cartão. Ativos e Locais: a linha abre a página própria do registro (`#ativos/<id>`, `#locais/<id>`, "← Ativos"/"← Locais", seções Cadastro · Onde está/Dentro de · Relações/Sublocais · Ativos · PTs/Cargos; "Editar" abre o formulário em diálogo; "Inativar" no ⋯ com confirmação e Desfazer, pois ativo e local não são apagados). Locais aparece na ordem da hierarquia, com recuo por nível e a coluna "Dentro de".
- **B. Lista‑detalhe** (Tipos, Auditoria): lista de 20rem à esquerda + detalhe de leitura à direita; no celular, o toque abre o detalhe em tela própria com "← Lista".
- **Cadastros com registro próprio** (Ativos, Locais, Pessoas): tabela de todos (modelo A) e, ao tocar na linha, a página do registro (`#ativos/<id>`, `#locais/<id>`, `#pessoas/<id>`) com "← de onde veio". Na tabela de Pessoas, a coluna Cargos mostra cada cargo uma vez (com "(vencido)" em âmbar só quando todas as concessões venceram) e a coluna Conta só a exceção.
- **Quadro**: o serviço fica sob o número em cinza; ativo e local dividem uma coluna ("Ativo · Local"); nenhuma coluna pode ser cortada em 1440 px.
- **Uma ação preenchida por tela na PT**: o botão preto é o do bloco de ações do cabeçalho; o do rodapé da etapa é contorno. Em Minha área, "Parar" é vermelho cheio só com o trabalho rodando; em PT já parada é contorno vermelho. Editar é preenchido nas três páginas de registro (Ativo, Local, Pessoa).
- **Editor do Fluxo**: cada etapa é um cartão branco com borda (campo editável sempre sobre branco); alternadores (Cargo | Pessoa) usam o estilo suave de seleção, nunca preto; o resumo "Assina: …" só aparece quando a assinatura é de uma pessoa nomeada.
- **Sem repetir**: seção única com o mesmo nome da etapa não ganha segundo título; etapa ainda não alcançada mostra os cargos que assinam, sem a lista de nomes; "Registrado" na Auditoria é cinza (só "Negado" chama atenção); serviço de desenvolvimento parado (DBeaver) não é alerta no rodapé.
- **C. Registro** (Modelo, Versão, Lista; a PT é a exceção abaixo): link de volta → cabeçalho → abas na coluna principal + `SidePanel` de 20rem a partir de `xl`, fixo no topo (ações em cima, propriedades embaixo). Abaixo de `xl` as ações vêm antes do conteúdo e as propriedades aparecem numa lista compacta logo abaixo delas (não existe aba Resumo). A **PT** não usa painel lateral. O cabeçalho lê numa ordem só: **número** (h1, `type-page`) → **serviço** (escopo, `type-title` 400, em `foreground`) → **faixa de cabeçalho** acima das abas, separada por uma linha, para o formulário ocupar a largura inteira da moldura. Na faixa, à esquerda (24rem a partir de `lg`): o bloco `EstadoAutorizacao` (o **único** lugar do estado: sem selo nem linha de meta repetindo estado, modelo ou código do local; quando o título do bloco não é o nome do estado, como "Parada registrada" ou "Trabalho liberado", a última linha diz "Estado: Suspensa · Trabalho não liberado.") → "Próxima: …" → a primária na largura da coluna → secundárias e **Parar** numa linha só, dividindo a largura, Parar sempre no fim; motivos de bloqueio logo abaixo. À direita (a partir de `lg`, com divisória vertical): os **dados** em grade, rótulo (`type-label`) sobre valor, cada um uma vez: Local (caminho, último nível em 500, código em `type-data`), Ativo(s) (nome + código), Janela, Modelo, Solicitante, Revisão; uma coluna em `lg`, duas em `xl`, três em `2xl`. Abaixo de `lg` os dados vêm depois das ações, em duas colunas (no celular Local, Ativo, Janela e Modelo ocupam a linha toda). A PT abre direto na aba Formulário (Formulário · Equipe · Histórico). A prévia de importação também é registro: lista do que será criado na coluna principal, arquivo, totais e "Criar rascunho" no painel.
- **D. Trabalho do dia** (Minha área): cabeçalho → quadro de colunas; no celular, colunas empilhadas com "Em campo" primeiro. Cada coluna mostra os primeiros 30 cartões; o resto vem por "Mostrar mais 30 · N de M" (botão contorno na largura da coluna, depois dos cartões), para que uma pessoa com milhares de PTs abertas tenha o quadro na hora.

**Responsivo.** Abaixo de `md`: uma coluna, `px-4`, sem rolagem horizontal da página. Prefira empilhar em coluna a linhas largas de controles. Revisar em 390 / 768 / 1024 / 1440 px.

**Ritmo (grade de 4 px):**
| Entre | Valor |
|---|---|
| link de volta → título | 8 |
| título → meta | 4 |
| cabeçalho → abas/barra | 16 |
| barra → conteúdo | 12 |
| seção → seção | 32 |
| padding de cartão | 16 (12 no celular / cartão `sm`) |
| linhas de propriedade | 8 |
| colunas lado a lado | 24 |

**The Proximidade Rule.** O espaço dentro de um grupo é sempre menor que o espaço entre grupos.

## Elevation & Depth

Plano por padrão. Profundidade vem de tom (`surface-canvas` / `surface-well` / `surface-fixed` / `surface-row`) e de linha (divisórias de 1 px, anel de 1 px em `foreground/10` nos cartões). Não há vocabulário de sombra próprio; sombras só existem nas camadas flutuantes herdadas do shadcn (popover, menu, diálogo, toast). Campos embutidos em linhas removem a sombra (`shadow-none`) e ganham fundo `surface-row` ao passar o mouse ou focar.

**The Tom Antes de Sombra Rule.** Para separar uma área, mude o tom da superfície ou use uma divisória; não adicione sombra.

## Shapes

Cantos suavemente arredondados a partir de uma base de 10 px (`--radius: 0.625rem`): `sm` 6 px, `md` 8 px (selos de estado), `lg` 10 px (botões, campos), `xl` 14 px (cartões). Círculos só em marcadores de etapa (28 px, borda de 2 px ou preenchido com `solid`). A barra de acento de estado é uma faixa de 3 px na borda esquerda, cor `solid`. Bordas de 1 px; borda tracejada indica uma escolha opcional ainda vazia.

## Components

### Buttons
Contidos e firmes; a hierarquia é feita por preenchimento, não por cor.
- **Shape:** cantos de 10 px (`rounded.lg`).
- **Altura:** 44 px abaixo de `md`, 36 px acima (`h-11 md:h-9`; ícones `size-11 md:size-9`). Exceção: botões do painel de ação da PT ficam com no mínimo 44 px em todos os tamanhos (ação de segurança); rótulo longo ("Preencher e assinar: …") quebra em duas linhas, nunca é cortado.
- **Primary:** preto (`primary`) com texto claro. **Uma primária preenchida por região** (cabeçalho, painel, cartão, diálogo). Duas pretas na mesma região = uma está errada.
- **Outline:** secundárias; até 2 no cabeçalho, à esquerda da primária.
- **Ghost:** "+ Item" no cabeçalho de seção, ações de linha, link de volta.
- **Stop:** vermelho preenchido (`destructive`), só para Parar (e Devolver a PT no fluxo de assinatura). Parar fica sempre visível.
- **Destructive:** fundo vermelho a 10% e texto vermelho; confirmação de remoção. No cabeçalho, remover aparece como item do `⋯` ou contorno com texto `destructive-text`, nunca como primária.
- **Hover / Focus:** primária escurece para 80%; contorno e fantasma ganham `muted`. Foco: borda `ring` + anel de 3 px a 50%. Pressionar desloca 1 px para baixo.
- **Rótulo:** verbo + objeto, idêntico em todo lugar onde a mesma ação aparece ("Nova versão", "Novo ativo").

### Status Badge (`StatusBadge`)
- **Style:** superfície do tom + texto `fg`, 8 px de canto, `type-meta` 500, ícone de 14 px opcional + palavra obrigatória, sem quebra de linha.
- **Variações de tom:** `TONE_BADGE` (selo), `TONE_BLOCK` (aviso/banner com borda), `TONE_TEXT` (linha de motivo, ícone), `TONE_SOLID` (ponto, barra de acento, marcador de etapa).
- **Posição:** selo de Estado/Situação fica na linha de meta do cabeçalho, não em linha própria. Exceção: o detalhe da PT não tem selo; o estado está só no bloco `EstadoAutorizacao`.
- O selo cinza (`secondary`) é só para a contagem ao lado do título.

### Cards / Containers
- **Corner Style:** 14 px.
- **Background:** branco, anel de 1 px em `foreground/10`.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Internal Padding:** 16 px (12 px no tamanho `sm`).
- **Uso:** só painel lateral, cartões de trabalho (Minha área, etapa da PT) e blocos do detalhe no modelo B. Tabelas, listas e árvores **sem cartão** (linhas com divisória e cabeçalho de colunas). Nunca cartão dentro de cartão; nunca caixa cinza envolvendo cartões.

### Inputs / Fields
- **Style:** borda de 1 px em `input` (≥ 3:1), fundo branco nos formulários (transparente nas barras), 10 px de canto, 44 px abaixo de `md`, 36 px acima.
- **Focus:** borda `ring` + anel de 3 px a 50%.
- **Error / Disabled:** `aria-invalid` deixa a borda vermelha com anel vermelho a 20%; desativado a 50% de opacidade.
- **Campo embutido em linha** (nome de etapa, título de seção, texto da assinatura; um só componente, `InlineName` em `FormEditor`): sublinhado tracejado de 1 px (`input`) em repouso, ícone de lápis ao passar o mouse, `surface-row` e sublinhado cheio ao focar. Nome fixo (etapa do esqueleto) é texto puro com o cadeado "Fixa".
- O título da página nunca é um campo editável. Renomear é uma ação ("Renomear" no `⋯` ou dentro de "Editar"). Em Tipos, a linha é texto (ícone + nome + "Em uso"); o lápis transforma só aquela linha em campo, que salva ao digitar (Enter ou sair encerra, Esc restaura).
- Lista de pessoas mostra só a exceção de conta ("Sem login", "Revisar"); "Conta ativa" fica no detalhe. Rótulo com tooltip leva um ícone de info de 12 px, nunca sublinhado pontilhado. Nos detalhes de Local e Ativo, a ação de seção é sempre ghost no cabeçalho; botão-link de valor leva `-ml-2` para alinhar com os outros valores; chips de relação têm o mesmo estilo (`type-data` sobre `surface-well`) e o verbo fica em `type-body`.

### Navigation
Barra lateral do shadcn à esquerda; barra superior de 48 px com divisória. Link de volta acima do título só em páginas de detalhe, com o nome real do pai ("← Quadro de PTs"), nunca só "Voltar". Abas **ou** barra de ferramentas abaixo do cabeçalho, nunca as duas no mesmo nível. Histórico da PT: um só nível sob as abas (Todos · Assinaturas · Negados · Revisões). Quadro: a célula da PT leva o serviço (escopo) em `type-body` sob o número. Motivo de bloqueio de permissão (Retomar, Assinar): `neutral` com cadeado, não `stop`; a primária bloqueada vai em contorno. No bloco de estado só título e ícone levam o tom; o texto explicativo fica em `foreground`. Em Minha área, o cartão Aguardando tem a linha de ação em `type-meta`. Botão de enviar/assinar do cartão da etapa, enquanto faltam respostas: contorno.

### PageHeader
Anatomia fixa: link de volta (opcional) → linha do título (`h1` + contagem em selo cinza só em listas; ações à direita) → uma linha de meta cinza. Ações: 1 primária à direita de tudo, até 2 secundárias em contorno, o resto no menu `⋯` ("Mais ações"). Abaixo de `md` as secundárias vão para o `⋯`; a primária fica na linha do título se o rótulo tiver até 2 palavras e o título até 20 caracteres, senão ocupa uma linha própria em largura total abaixo do meta. Itens do menu com conteúdo pedem confirmação em popover. Código como título usa `type-data-title`.

### PageSection e PropertyList
`PageSection`: `h2` 15/600 sem ícone e sem cartão, ação fantasma opcional à direita, conteúdo 12 px abaixo; seções consecutivas ficam 32 px apart. `PropertyList`: coluna de rótulos de 7rem (`type-label`) + valor `type-body`, 8 px entre linhas.

### SidePanel (painel de ação)
Coluna de 20rem a partir de `xl`, fixa no topo. Ordem sempre igual: estado → próxima pessoa → primária → secundárias; propriedades abaixo de uma divisória. Fluxo da PT (Assinar, Devolver, Parar, Entregar, Retomar, Prorrogar) mora aqui. **Prorrogar** é secundária (contorno, ícone de calendário), entre Devolver e Parar, e só aparece para quem pode emitir a PT, com ela emitida ou ativa e a janela ainda aberta; sem servidor fica desativada com o motivo. O diálogo pede "Novo fim" (data + hora, com "No máximo até …" quando o modelo tem prazo) e "Justificativa" (até 500); o Histórico mostra "Janela prorrogada: até DD/MM HH:MM → até DD/MM HH:MM · justificativa" com ícone de calendário, cinza.

### ListToolbar
Ordem fixa: busca (20rem no desktop, largura total no celular, ícone de lupa, botão de limpar) → filtros (segmentado se ≤ 4 opções, seleção se mais) → "Limpar filtros" só com filtro ativo → total "N de M <coisas>" encostado à direita sempre que alguma linha está escondida (inclusive por filtro padrão, como "Em andamento" no Quadro; sem nada escondido, "M <coisas>") (`type-meta`, anunciado em `aria-live`). O total aparece só aqui. Empilha em contêineres estreitos. **Carregando** (Quadro e Ativos, quando o servidor pagina a lista): a página anterior continua na tela, esmaecida e com `aria-busy`, até chegar a próxima; a busca espera uma pausa na digitação antes de perguntar; falha vira a frase "Não foi possível carregar a lista: …". Com muitos filtros (Auditoria), `filtersBelow` põe os filtros e "Limpar filtros" numa linha própria abaixo da busca.

### Diálogos e folhas
Criar e editar registros curtos (Local, Ativo, Pessoa, Lista) em modal: Dialog no desktop, Sheet de baixo no celular. **Tamanho fixo entre abas** (`h-[min(42rem,90svh)]`): trocar de aba não faz o modal pular. Rodapé à direita, primária por último, Cancelar à esquerda dela; no celular empilhado, primária em cima, largura total. Configuração em lista edita na própria linha e salva ao sair do campo; conteúdo longo edita na própria aba com meta "Alterações salvas". O detalhe do modelo B é sempre leitura.

**Retorno das operações.** Enviar, Assinar, Devolver, Retomar, Prorrogar e Parar aguardam a resposta final antes de fechar o diálogo ou anunciar a conclusão. Durante a espera, mostram "Registrando…", bloqueiam repetição e fechamento; uma recusa mantém os campos e um alerta persistente com o motivo, permitindo corrigir e tentar novamente. "Servidor fora do ar" é reservado à indisponibilidade, nunca a erro de permissão ou versão desatualizada. Parar sem conexão continua disponível: o aviso diz "Parada guardada neste aparelho", aguardando envio ao servidor, e orienta parar com segurança e avisar a área.

Trocar entre folha de celular e diálogo de computador preserva os campos, a escolha do motivo de parada e o feedback, inclusive com a requisição pendente ou recusada. `PermitActDialog` mantém a mesma árvore de componentes e muda só a apresentação; até datas e horas digitadas pela metade permanecem no campo. Em Prorrogar, um valor incompleto ou inválido bloqueia a confirmação até ser corrigido. Fechar e reabrir inicia um formulário novo.

### Remover
- **Item solto** (uma linha, uma opção, uma relação, uma assinatura, seção vazia): remove na hora e mostra toast com **"Desfazer"**, que devolve o item no mesmo lugar.
- **Coisa com conteúdo** (etapa com seções, seção com perguntas, versão, lista): `ConfirmRemove`, popover que pergunta "Remover “nome”?", diz o que vai junto e confirma com botão destrutivo.
- Ações de linha (editar, adicionar filho, remover) ficam no fim da linha, sempre visíveis (nunca só no hover), com nome acessível.
- **Tipos** (local, ativo, cargo, relação): tipo sem uso sai na hora com "Desfazer"; tipo em uso não sai: a linha oferece **Desativar** (deixa de ser oferecido; o que já usa continua mostrando, com selo cinza "Inativo") e **Reativar**. O tipo do sistema ("parte de", que define a trava de equipamento) mostra um cadeado com o motivo: pode ser renomeado, nunca removido nem desativado.

### Itens de formulário
**Cinco níveis, iguais em toda tela de formulário** (PT, Testar, respostas só leitura, diálogo Assinar):
1. **Etapa** = o cartão (`rounded-xl`): marcador de 28 px + nome `type-title` 18/600 + estado. A etapa da sua vez é branca com contorno de 2 px em tinta; as outras ficam no tom `surface-canvas` com borda de 1 px.
2. **Seção** = `FormSectionHeader`: `type-subtitle` 16/600 sobre uma linha `foreground/20` que atravessa a coluna, "Falta N" em cinza à direita; 40 px entre seções, 24 px da linha até a primeira pergunta. "Assinaturas" usa o mesmo cabeçalho (só quando a etapa tem formulário).
3. **Pergunta** = `type-field` 14/500 em tinta, 8 px acima do controle. Rótulo de coluna dentro de linha repetida e subcampo (Documento, ponto de isolamento): 12/500 em tinta. "Linha N"/"Ponto N": `type-label` cinza.
4. **Campo** = superfície branca com contorno `input` (≥ 3:1), 44/36 px; escolhas em botão contorno, a escolhida preta. **Só leitura** = texto puro, sem caixa: rótulo `type-label` cinza sobre o valor `type-body` 400 em tinta.
5. **Instrução/detalhe** = `type-meta` cinza colada ao rótulo; aviso = poço cinza com ícone.

**Leitura da etapa em preenchimento.** A etapa da sua vez ocupa a largura inteira do cartão, em todas as larguras: título da etapa → seções → perguntas → controle → ajuda ou motivo. Depois do formulário vem a seção "Assinaturas" (texto, sem caixa: uma caixa branca pareceria campo) e, no rodapé, o botão com o motivo ao lado quando desativado ("Faltam 3 respostas" em cinza; "Bloqueada por uma resposta: …" em `stop`). Etapas só leitura (concluída, aguardando) mostram as respostas ao lado de "Assinaturas" a partir de `@2xl`; a etapa futura mostra só uma linha por seção ("Seção · N perguntas") e quem assina, sem cabeçalhos, e "Ainda não chegou" em texto cinza, sem selo. **Um sinal só:** nenhum ícone de ✓ por item e nenhum selo "Completa"/"Impede a etapa" por seção; a seção mostra só "Falta N" em cinza, e o motivo que trava fica embaixo do item que trava (`stop`, ícone + palavras). Pergunta com o mesmo nome da seção não repete o título (fica só para leitor de tela). **Avisos** são um poço cinza (`surface-well`, sem borda) com ícone de informação e texto cinza: lê-se, não se preenche; uma sequência de 3 ou mais avisos com rótulos próprios (a tabela de classes do papel) vira uma linha "Consultar · Classe 5, Classe 4, …" que abre uma tabela compacta; escolhida uma opção com o mesmo rótulo de um aviso ("Classe 4"), o detalhe dele aparece junto da resposta (`core/formLayout.ts`). **Marcação:** até 6 opções, botões; mais de 6, seleção com busca (`SearchSelect`; múltipla: `PickList`). O mesmo vale para Pessoa e para toda seleção do formulário (ativo, energia e "Aplicado por" dos pontos de isolamento).

**Gramática do formulário (o que é campo, rótulo, instrução e detalhe).**
- **Campo** (preenchível): fundo branco, borda de 1 px em `input`, 44/36 px de altura, anel de foco; texto curto e seleções até 36rem (`max-w-xl`), texto longo até 42rem, verificações na largura inteira. Botões de escolha em contorno branco; o escolhido fica preto. Sem resposta = campo vazio ou nenhum botão preto; a seção diz "Falta N".
- **Seleção com busca** (`SearchSelect`, `PickList`): lupa à esquerda, seta para baixo à direita, texto "Buscar na lista…" / "Buscar no cadastro…"; ao abrir, o cursor já está na busca. **Seleção simples** (até 6): só a seta. **Texto**: sem ícone.
- **Rótulo** (a pergunta): `type-field` em tinta, logo acima do controle (8 px); "opcional" em `type-meta` ao lado. Subcampo (Documento, ponto de isolamento): 12/500 em tinta.
- **Instrução** ("Permitido: …", "Formato …", dica do anexo, "Mínimo N …"): `type-meta` cinza, **entre o rótulo e o controle**, colada ao rótulo (2 px). Sempre nesse lugar.
- **Detalhe** (Aviso, detalhe da opção escolhida, tabela "Consultar"): poço cinza com ícone de informação, nunca borda de campo.
- **Problema**: embaixo do controle, `stop`, ícone + palavras.
- **Ritmo**: rótulo → controle 8 px; pergunta → pergunta 24 px; seção → seção 40 px, com a linha embaixo do título da seção. Linhas repetidas (ponto, linha de grupo) ficam num poço cinza com os campos brancos dentro; lista vazia, borda tracejada.
- **Versão do modelo em uso ou arquivada** (Fluxo e Escopo): nunca o editor desativado; `FlowReadOnly` mostra etapas → seções → itens → assinaturas como texto (sem botões, seletores nem ×), e o Escopo lista os tipos escolhidos em linhas simples.
- **Só leitura** (etapa concluída, vez de outra pessoa, sem servidor): nunca um campo desativado nem caixa; rótulo `type-label` cinza sobre o valor em `type-body` (`FormAnswersView`), em duas colunas a partir de `@xl`; verificação, linhas repetidas, anexos e texto longo ocupam a linha inteira; verificação lista as linhas com divisória e a resposta à direita.
- **Valores escolhidos** (`PickList`: tipos do Escopo, cargos, pessoas): um poço cinza com divisórias e "×" por linha, sem contorno de campo; só o botão de busca abaixo acrescenta. Assinaturas condicionais não exigidas, quando são duas ou mais na etapa, viram uma linha cinza ("4 assinaturas não exigidas · só para Classe 4, Classe 3, Classe 2 ou Classe 1") que abre a lista.

Um mesmo componente preenche a PT e o Testar (`StageCard` + `FormFill`). Tipos: Texto, Marcação, Verificação (tocar de novo desfaz a resposta), Número (digitação natural: "18" é 18, vírgula ou ponto separa as casas, no máximo as casas do item, recusa com mensagem abaixo do campo; milhar e casas fixas só ao sair do campo; unidade ao lado, "Permitido: …"), Horário (hh:mm[:ss], botão "Agora"), Data (digitada e mostrada dd/mm/aaaa, botão "Hoje"; guardada AAAA-MM-DD), Documento (formato opcional, anexo, validade dd/mm/aaaa), Pessoa (do cadastro, filtro por cargo, elegibilidade), Pontos de isolamento e Grupo repetível (linhas com "+ Ponto"/"+ Linha"), Aviso, Foto/vídeo/arquivo. Valor fora da faixa, documento vencido, "Energia zero verificada: Não" ou uma opção de marcação que impede ("Classe: “Classe 5” impede a etapa") travam a etapa no tom `stop`, com o motivo junto do item; a resposta é salva mesmo assim. Verificação com respostas de uma lista mostra os itens da lista como botões (ex.: "SIM" · "N.A."), no lugar de Sim/Não/N/A. Etapa concluída: marcador verde preenchido com ✓. Etapa deixada sem assinatura porque a área está sendo devolvida (PT expirada ou suspensa sem Retomada): selo cinza "Não feita". Sem servidor, as respostas ficam só leitura (nada salva; só Parar registra); o Testar do modelo continua preenchível, porque não salva nada. Horário ou data pela metade (ou inexistente, 30/02) fica só no campo, com o motivo abaixo em `stop`, e nunca substitui a resposta salva; esvaziar o campo limpa a resposta. Texto (resposta, justificativa, "Outro", pontos de isolamento) e, no editor, rótulos, títulos, nomes de etapa e significados são salvos ao sair do campo ou 1,5 s depois de parar de digitar: um registro por resposta, não por tecla. Foto, vídeo e arquivo: a resposta guarda só a referência ao anexo da PT; "Remover" tira o arquivo da resposta, o anexo continua na PT. Tipo de arquivo que o item não aceita é recusado com aviso junto do botão.

### Modelos
A página do modelo mostra, acima das versões, **Retenção da trilha** (seleção: PET, PT de trabalho, Cadastro; mínimo de 5 anos). "Nova versão" copia a versão com etapas e assinaturas novas; os itens do formulário mantêm a identidade. No Fluxo, escolher "Pessoa" numa assinatura só grava quando a pessoa é escolhida; "Obrigatória só quando" só grava depois de escolhida ao menos uma resposta. Assinatura sem cargo ou sem significado fica no rascunho e impede só a ativação. Uma assinatura pode aceitar **vários cargos** (qualquer um assina): o Fluxo os escolhe numa lista de seleção ("+ Cargo", linhas removíveis) e as telas os juntam com "ou" ("Gerente industrial, Gerente de manutenção ou Gerente da área"). No editor, cada opção digitada de uma marcação tem a chave "Impede a etapa"; numa marcação de lista, "Opções que impedem a etapa" escolhe os itens. A verificação escolhe "Itens de uma lista" e a lista; cada linha tem, por item, "impede a etapa" e "exige justificativa" (nunca os dois). **Construção do Fluxo.** O nome da etapa é `type-title` 18/600 (campo embutido). Cada etapa (cartão) tem duas áreas separadas por uma linha, cada uma com título `type-subtitle` e ícone: **Preencher** (prancheta; "N seções · N itens"; "+ Seção" à direita) e **Assinar** (caneta; "N assinaturas", "em paralelo"; "+ Assinatura"). Cada seção e cada assinatura é um bloco marcado por uma **régua à esquerda** (2 px, `foreground/25`), sem caixa: a seção abre com "Seção N · N itens" (`type-label`), depois o título editável (15/600) e suas ações (+ Item, subir, descer, remover). Cada item mostra o **ícone do tipo** num quadradinho (mapa único `KINDS` em `FormEditor`, o mesmo do menu "+ Item" e das colunas do grupo), o rótulo e uma linha meta "Tipo · detalhes · obrigatório/opcional" (unidade, casas e faixa no Número; lista na Marcação); abaixo, só quando houver, sinais com ícone: "Impede a etapa", "Mostrar quando Pergunta = A ou B", "Origem · p. N". No celular, subir/descer/remover do item ficam dentro do item aberto (botões com nome). A assinatura lê numa linha "Assina: A, B ou C · 2 assinaturas · obrigatória só quando …". O Escopo da versão tem **Janela de trabalho** › "Prazo máximo da janela" (número + Horas/Dias; vazio = sem prazo), lido como "até 3 dias" / "até 12 horas", e **Equipamento** › chave "Prende o equipamento" com uma linha `type-meta` ("Desligado: esta PT pode existir junto com outra PT aberta no mesmo equipamento, por exemplo a desabilitação de um intertravamento."); em versão em uso ou arquivada vira texto ("Não prende o equipamento" + a mesma ideia em `type-meta`). No detalhe da PT, o fato **Modelo** ganha a linha `type-meta` "Não prende o equipamento" quando a versão não prende.

### Assinatura condicional
Assinatura obrigatória só sob uma condição, quando as respostas não a exigem, não espera ninguém: aparece em cinza (`text-muted-foreground`, ícone de menos) como "Não exigida · só para Classe 4" (a condição que a exigiria), sem lista de quem pode assinar. Exigida pela resposta: "· exigida por uma resposta". Vale na PT, no painel e no Testar (`slotNeed` em `core/form.ts`).

A versão do modelo tem uma quarta aba, **JSON**: prévia do pacote `ptw.modelo/1` da versão (`exportarModelo`), gerada na hora (acompanha o rascunho), em bloco monoespaçado somente leitura com rolagem só dentro do bloco. "Copiar" e "Baixar" (`<modelo>-v<n>.ptw-modelo.json`) aparecem com permissão de exportação, pedem motivo e leem o pacote da API, que registra o ato; ficam bloqueados sem servidor. "Importar JSON…" aparece com permissão para modelos e abre a importação, que aceita arquivo ou texto colado. A linha de resumo traz tamanho, etapas, itens, assinaturas e "Pacote válido" (ou a lista de problemas em `stop`). O menu da página do modelo tem "Importar nova versão de JSON" para quem pode editar.

### Origem (importação)
Elemento vindo de um pacote importado mostra "Origem · p. N", que abre o trecho literal do documento (e o texto original quando o formulário é de outro idioma). A versão importada leva o selo âmbar "Sugerida pela importação" até ser ativada; depois de ativada, o Fluxo (somente leitura) continua mostrando "Origem · p. N" em cada etapa, assinatura e item, discreto e fechado. Nada é criado antes da lista completa e da confirmação com os totais.

### Auditoria
Situação da cadeia no topo ("Cadeia íntegra · N eventos" em `done`, ou o primeiro evento quebrado em `stop`). Grupos: Alterações, Acessos, Sessão e sistema, Negadas; abre em Alterações + Negadas. Negadas em `stop`, com a mensagem da regra como frase (o código PTW fica em Dados). Os eventos guardam a linha crua do banco; a tela lê com `components/audit/reader.ts`: chave de item vira o rótulo do formulário, rascunho se chama "Rascunho de <autor>" (número só depois de Enviar), e embaixo do evento vai só o que mudou e o título ainda não diz, em palavras (resposta formatada pelo tipo do item; anexo numa linha "Foto: foto.jpg"; estado nunca repete o título). Detalhe: Evento (o alvo da PT é link para ela) · Alterações (as mesmas linhas) · Dados (todos os campos, com rótulos humanos: ids por nome, medidas, hashes curtos, código da ação) · Integridade. Nenhum uuid aparece na interface. O Histórico da PT lê da mesma trilha, com o mesmo leitor, e termina com "Acessos: N · Ver na auditoria".

### Bloqueio por equipamento
Uma PT não pode ser aberta em equipamento que está com outra PT aberta. A interface mostra o motivo no tom `stop`: cadeado com `aria-label` no Quadro, bloco "Envio bloqueado: equipamento com outra PT aberta" com as PTs que seguram o equipamento em Minha área, e botões desativados com `aria-describedby` apontando o porquê.

### Entrada e sessão
Antes da sessão, a tela usa `Page` + `Narrow`: título "Entrar no PTW" e ação "Entrar". Os modos vêm do servidor. Quando a entrada por senha está disponível, mostra "Login" e "Senha", com preenchimento automático próprio de credenciais e senha oculta; não expõe detalhes do diretório. A senha sai do campo após cada tentativa. Quando a entrada de demonstração está habilitada, lista contas reais em "Pessoa" e informa "Entrada para demonstração, sem senha. As alterações ficam gravadas para a pessoa escolhida." Com os dois modos disponíveis, login/senha abre primeiro e "Entrar para demonstração" alterna o formulário. O cabeçalho mostra a pessoa atual; seu menu permite sair e só oferece troca sem senha quando habilitada pelo servidor. Não há seletor de cenário, restauração de exemplo, relógio editável ou queda simulada. Carregamento e falha são explícitos; a tela de trabalho só abre após o cadastro e Minha área chegarem. Falha de conexão preserva o motivo e oferece "Tentar novamente"; credencial recusada mantém o formulário para corrigir a entrada.

As permissões administrativas vêm da sessão: `cadastro` oferece escritas de cadastros, `modelos` oferece edição/importação/ativação de modelos, `auditoria` mostra o menu e a tela de Auditoria e `exportacao` oferece as exportações. Leitura de cadastros, modelos, histórico da PT e anexos continua disponível para trabalhar. Ação não permitida é omitida; conteúdo permanece legível, sem editor desativado. Essas permissões não alteram cargos nem elegibilidade para assinar. Sessão encerrada retorna à entrada e limpa pessoa e permissões. Interações reais de ponteiro/teclado informam atividade ao servidor no máximo uma vez por minuto; relógio, consultas automáticas e sincronização não prolongam a sessão.

### Criar e editar PT
"Nova PT" é a ação primária de Minha área e do Quadro. A página reúne Modelo, Local, Serviço, janela, busca de Ativos e Equipe; os campos paralelos de início/fim ficam lado a lado a partir de `md`. "Criar rascunho" espera a resposta do servidor antes de abrir a PT. O rascunho próprio oferece edição e descarte com motivo. Escritas mostram "Salvando…", impedem repetição enquanto pendentes e preservam o formulário quando recusadas. A importação mostra a prévia devolvida pelo servidor e confirma exatamente aquela prévia, sem gerar uma lista nova ao confirmar.

### Rodapé de recursos (`ResourceFooter`)
Faixa fina no fim de toda tela, abaixo do `main` (borda superior de 1 px, mesmo recuo do `main`, conteúdo até 72rem encostado à esquerda), em `type-meta`, cinza, sem cartão. Mostra o que os contêineres usam e o máximo deles: por serviço (nome para pessoas + nome técnico entre parênteses), situação ("No ar", "Iniciando", "Parado", "Com falha"), RAM "usado de limite", CPU "% de N CPU" (percentual do limite) e disco (volumes do serviço); no total, "N de M no ar", a soma da RAM e da CPU, o tamanho dos volumes, "Tamanho do sistema" (imagens), "Disco do Docker: X livres de Y" e "Atualizado às HH:MM:SS". Desconhecido é "—". **Recolhido por padrão em toda largura:** só a linha de resumo ("Recursos · RAM … · CPU …"), um botão de 44 px que abre os detalhes; serviço parado ou com falha aparece na linha com ícone e palavra em `stop`. Aberto: `lg`+ tabela sem cartão (uma linha por serviço e o Total em 500); `md`–`lg` lista em duas colunas; celular lista em uma coluna. Cor só perto do limite: âmbar a partir de 80 %, vermelho a partir de 95 %, sempre com ícone e palavra ("perto do limite", "no limite"); dado com mais de 30 s vira "Desatualizado desde HH:MM:SS" em âmbar; "Com falha" em `stop`. Sem o arquivo do servidor: "Recursos · indisponível (monitor parado)"; no `vite` de desenvolvimento, o caminho é repassado ao Docker local e mostra a mesma telemetria real. Lê `/status.json` a cada 5 s, só com a aba visível.

## Do's and Don'ts

### Do:
- **Do** renderizar exatamente um `Page` por tela, 72rem, encostado à esquerda.
- **Do** escolher um dos modelos A–D antes de desenhar uma tela.
- **Do** usar alvos de 44 px abaixo de `md` (`h-11 md:h-9`, `size-11 md:size-9`).
- **Do** manter uma primária preta por região; destrutivo no `⋯` ou em contorno com texto vermelho.
- **Do** acompanhar todo tom de estado com ícone ou palavra (`StatusBadge`, `TONE_*`).
- **Do** usar os utilitários `type-*` e a grade de 4 px da tabela de ritmo.
- **Do** usar "Desfazer" para itens soltos e `ConfirmRemove` para coisas com conteúdo.
- **Do** manter o tamanho do modal fixo entre abas.
- **Do** usar o vocabulário: **Estado** só para PT, **Situação** para registros; **Devolver**; **Pessoa indicada**; **Elegível / não elegível**; **Remover**.
- **Do** mostrar o motivo de um bloqueio no tom `stop`, ao lado do controle bloqueado.
- **Do** revisar em 390 / 768 / 1024 / 1440 px.

### Don't:
- **Don't** centralizar a moldura da página, conteúdo estreito ou estados vazios.
- **Don't** colorir botões para "destacar"; vermelho é só para Parar e destrutivo.
- **Don't** usar cor sozinha para comunicar estado.
- **Don't** escrever "Trabalho liberado" fora de `EstadoAutorizacao`; só o núcleo decide quando o trabalho está liberado.
- **Don't** permitir abrir uma PT em equipamento que está com outra PT aberta.
- **Don't** usar Geist Mono para títulos, nomes de serviço ou texto.
- **Don't** pôr cartão em volta de tabelas, listas ou árvores; nunca cartão dentro de cartão.
- **Don't** colocar abas e barra de ferramentas no mesmo nível, nem a contagem "N de M" fora da barra.
- **Don't** esconder ações de linha atrás do hover.
- **Don't** usar só "Voltar" no link de volta.
- **Don't** adicionar nota de simulação na interface nem pedir login digitado de novo para assinar (removidos por decisão do usuário).
- **Don't** criar rótulos‑sobrescritos em caixa alta acima de títulos (kickers); a hierarquia é h1/h2/h3.
- **Don't** introduzir tema escuro como padrão; o produto é claro.
- **Don't** criar nada a partir de um pacote importado sem mostrar antes a lista completa e pedir confirmação.
- **Don't** repetir em texto o que a interface já mostra (listas "Falta N: …", "Sua parte: …", rodapés explicativos); o motivo vai junto do controle.

## Base visual (2026-11-11)

- **Neutros com leve tom frio** (matiz 265): tinta `oklch(0.2 0.02 265)`, fundo do app `surface-canvas`, raio base 0,75rem. A ação preenchida continua em tinta escura; cor segue só para estado.
- **Casca:** o menu fica sobre o fundo do app e o conteúdo numa folha branca arredondada (`Sidebar variant="inset"`). Item ativo do menu: branco com sombra leve. Barra do topo fixa, translúcida, com o avatar (iniciais) da pessoa.
- **Entrada** (`LoginView.tsx`, arte em `LoginArt.tsx`): a partir de `lg`, dois painéis: formulário à esquerda (24rem, campos e botão de 44 px, título 28/32 em 600, rodapé com ponto de estado + "Servidor da planta · sem nuvem", vermelho quando o servidor não responde) e painel de marca escuro à direita, com um cartão de PT desenhado com divs (trilho de etapas, cadeia de assinaturas ligada por SHA-256, "Um equipamento, uma PT aberta"; só ilustração, sem dados reais), a promessa em 40/48 e três pontos de estado. Abaixo de `lg`, uma faixa escura compacta (marca + promessa) com a folha branca arredondada sobre ela. Entrada em fade + subida curta, desligada com `prefers-reduced-motion`.
- **Título de página:** 26/650, espaçamento −0,025em.
- **Tabelas:** cabeçalho em faixa cinza arredondada com texto cinza 13/500; linhas com 10 px de respiro e realce ao passar o mouse; "Nenhum resultado" com título e explicação.
- **Minha área:** cada coluna é um bloco arredondado sobre o fundo; coluna vazia mostra a mensagem numa caixa tracejada.
- **PT:** o título é o serviço; o número (ou "Rascunho, ainda sem número") vai numa etiqueta abaixo. Estado, ações e dados ficam num bloco arredondado. A etapa da vez é um cartão branco com contorno e halo azul (vermelho se bloqueada); etapas concluídas são cartões brancos; etapas que ainda não chegaram são linhas compactas, só com o nome, as seções e quem assina, sem "Aguardando assinatura".
- **Auditoria:** segue o modelo Lista como o Quadro e Ativos: tabela na largura toda, uma linha por evento (hora e nº juntos), grupos e filtros numa fileira só. O evento abre numa folha lateral à direita só quando é escolhido; nenhum evento vem aberto. O selo da cadeia não repete a contagem do título.
- **Folhas e diálogos:** fundo escurecido em tinta a 32 %, sem desfoque.
- **Busca rápida** (`shell/CommandPalette.tsx`): Ctrl/⌘+K em qualquer tela ou o botão "Buscar…" da barra do topo (com a tecla `Ctrl K` a partir de `md`; só o ícone, 44 px, no celular). Painel `rounded-2xl` sobre o fundo de tinta; no celular, folha de largura total descendo do topo. Sem texto: Recentes (PTs abertas nesta sessão, só em memória), Ir para (as telas que o menu mostra, Auditoria só com o acesso) e Ações (Nova PT). Digitando: PTs e Ativos (consultados no servidor, com pausa de 250 ms), Locais, Pessoas e Modelos, até 5 por grupo, com o estado da PT em `StatusBadge` e o trecho achado sublinhado. "Buscando…", "Nada encontrado" e "Sem servidor" são linhas de texto; a navegação continua sem servidor.
- **Marcas do produto (2026-11-11):** trilho de etapas no topo da PT (`work/StageRail.tsx`) e em miniatura nos cartões (`signal/MiniRail.tsx`); medidor de janela com o tempo que resta (`signal/WindowMeter.tsx`) no bloco "Trabalho liberado" e no cartão "Em campo".
- **Texto:** a interface não explica o sistema. Sem slogans, sem frases de apoio que repetem o que a estrutura já mostra, sem termos técnicos de criptografia (usar "código de verificação" e "impressão digital"). A entrada é um cartão único centralizado: marca, alternador "Login e senha" | "Logar como" (lista de pessoas com busca; um clique entra, só com `PTW_DEV_LOGIN=1`) e a situação do servidor.
- **Direção "Documento de engenharia" (2026-11-11, escolhida pelo dono):** folha branca sobre papel quente, tinta quase preta, cantos de 6 px, linhas finas em tinta. Rótulos e cabeçalhos de tabela em caixa alta pequena com espaçamento (`type-label`, `type-th`); tabela com régua de tinta em cima e embaixo do cabeçalho, sem faixa cinza. Utilitários em `index.css`: `doc-block`/`doc-cell` (bloco de legenda, como o de um desenho técnico), `stamp` (carimbo) e `stamp-in`.
- **PT como documento:** título = serviço; sob régua dupla, o número em mono e "Permissão de trabalho · Revisão N"; dados da PT num bloco de legenda. Assinatura feita = carimbo verde "ASSINADO" com nome, hora e revisão; a assinatura recém-feita cai animada.
- **Segurar para assinar:** `signal/HoldButton.tsx` (900 ms; soltar antes cancela; teclado: segurar Enter/Espaço). Usado no diálogo Assinar. Scripts de navegador precisam segurar, não clicar.
- **Parar:** no celular, barra fixa no rodapé da PT em campo ("Parar o trabalho", 56 px). PT parada: faixa vermelha cheia "Trabalho parado" no topo da página, com motivo e hora.
- **Histórico da PT:** linha do tempo por dia (hora em mono, ícone, texto, quem), negados em vermelho com a palavra; "Revisões" continua em tabela.
- **Tela de parede** (`#parede`, link no Quadro): escura, para TV; relógio, contagens, "Trabalho parado" em vermelho, "Em campo" com o tempo que resta em figuras grandes, "Aguardando"; só leitura, atualiza a cada 20 s.
- **Documento em todo o app (2026-11-11):** `PageHeader` desenha a régua dupla sob o título de toda página; `PropertyList` é um bloco de legenda (`doc-block`, células rótulo-sobre-valor, 2 colunas a partir de `sm`). Diálogos: moldura em tinta, título 18/600, rodapé com linha de tinta. Parar: barra vermelha de 6 px no topo e título em caixa alta vermelha.
- **Fluxo do modelo:** trilho horizontal de etapas (Etapa N, nome, itens · assinaturas; a escolhida em tinta cheia; "+" entre as etapas onde dá para inserir) e **uma etapa aberta por vez** abaixo. No celular o trilho rola de lado.
- **Nova PT:** a partir de `xl`, uma folha de prévia ao lado do formulário (carimbo "Rascunho", serviço, bloco de legenda com modelo, local, ativos e janela, e as etapas numeradas do modelo), preenchida enquanto a pessoa escolhe.
- **Desabilitados agora** (`#desabilitados`, menu Trabalho; 2026-11-11): PTs abertas de versões que **não prendem o equipamento** (desabilitação de intertravamento / dispositivo de segurança). Bloco de legenda com três contagens e três grupos: "Desabilitados agora" (ativa sem parada; barra vermelha, medidor da janela, "Prazo vencido: reabilite" quando a janela acabou), "A reabilitar" (suspensa, entregue, expirada ou ativa com parada; âmbar) e "Aguardando aprovação" (em análise, devolvida, emitida; cinza). Cada linha: serviço, número e ativos; o que foi pedido (até três respostas de escolha única ou texto curto, na ordem do formulário); estado e próximo; janela. Três colunas a partir de `xl`, uma coluna abaixo. Só leitura; a linha abre a PT. A tela de parede ganhou a contagem "Desabilitados".
- **Ícone do tipo em todo lugar (2026-11-11):** onde um ativo ou local é citado fora do Cadastro (Quadro, Minha área, dados da PT, Desabilitados agora, tela de parede, Nova PT, relações do ativo, vínculo de ativo ao local, Testar do modelo, busca rápida), o ícone do tipo vem antes do código ou nome: use `<AssetIcon id>` / `<LocationIcon id>` de `components/shell/TypeIcon.tsx` (16 px, cinza, decorativo). Na Minha área o ícone substitui as palavras "Local" e "Ativo". O catálogo tem 80 ícones em cinco grupos (Locais, Elétrica, Mecânica e processo, Instrumentos e automação, Segurança e veículos), em `registry/typeIcons.ts`; o seletor em Tipos mostra os grupos e rola. Ícone novo: chave + rótulo num grupo de `typeIcons.ts` e o desenho em `TypeIcon.tsx`; chave nunca é renomeada (fica no banco).

## Tema da planta (2026-11-11)

A aparência padrão é a do produto. Uma planta pode trocar **nome, sigla, logotipo largo, símbolo quadrado, três cores (marca, fundo, tinta) e a fonte** por um `tema.json` na pasta `ptw-server/tema/`, servida em `/tema/`, sem reconstruir nada (`sh ptw-server/tema.sh <pasta>`; regras em `ptw-server/tema/README.md`).

- Regra e conferência em `core/brand.ts` (com teste); carregamento em `data/brand.ts` (`loadBrand` antes da primeira pintura, `useBrand()`); marca em `shell/BrandMark.tsx` (`BrandMark`: símbolo ou letras; `BrandLogo`: logotipo largo).
- O tema escreve variáveis CSS na raiz: `--primary`, `--ring`, `--foreground`, `--surface-canvas`, `--sidebar`, `--app-font` e os cinzas (`--surface-well`, `--surface-fixed`, `--muted`, `--secondary`, `--accent`, `--border`, `--muted-foreground`), que saem do fundo misturado com a tinta para a página inteira ter o tom do papel da planta.
- **As cores de estado nunca mudam** (`--st-*`, vermelho de Parar): são sinal de segurança.
- Cor que não lê é recusada e o padrão fica: tinta 7:1 sobre branco e sobre o fundo; texto branco ou tinta 4,5:1 sobre a marca. O motivo aparece no console (`tema.json: …`).
- Ao escrever tela nova: nunca cor ou fonte literal para marca, fundo ou cinza; use os tokens (`bg-primary`, `bg-muted`, `border`, `text-muted-foreground`, `font-sans`), senão o tema não alcança a tela.
- Tema de cliente (logotipo, fonte) fica em `clientes/<cliente>/tema/`, fora do git; `ptw-server/tema-exemplos/floresta` é o exemplo fictício.

## Imprimir (2026-11-11)

A PT impressa **não é a tela**: é um formulário de papel próprio (`work/PermitSheet.tsx` + `work/SheetItem.tsx`, estilos `.sheet-*` em `index.css`, medidas em pt e mm), escondido na tela e o único conteúdo no papel.

- **Imprimir** (botão do cabeçalho da PT): a folha preenchida. **Imprimir em branco** (menu "⋯"): a mesma folha vazia, para preencher à mão no campo.
- Estrutura: cabeçalho (marca da planta, "Permissão de trabalho", número, revisão, QR que abre a PT no sistema) → quadro de identificação (serviço, local, ativos, janela, estado na impressão, solicitante, modelo, equipe) → cada etapa numa faixa preta numerada, com as perguntas como campos e as assinaturas como quadros → rodapé.
- Campos: linha para resposta curta, caixa para texto longo, caixas de marcar com X na opção escolhida (as outras opções continuam na folha, como no papel), verificação em tabela com uma coluna por resposta, tabelas com linhas vazias para pontos de isolamento e grupos. Sem resposta, o campo fica vazio para escrever.
- Assinatura: assinada no sistema mostra nome, data, hora e revisão; pendente (ou folha em branco) mostra as linhas Nome, Assinatura, Data e hora. Assinatura condicional não pedida nesta PT não sai na folha preenchida.
- Em todas as páginas, na margem: número da PT, quem imprimiu e quando, e "Página N de M". No fim: "Cópia impressa. O estado válido é o do sistema." (em branco: "Só a PT no sistema autoriza o trabalho.").
- Preto sobre branco, legível em impressora monocromática; a cor da marca aparece só no fio do cabeçalho. Nada de cor de estado no papel: o estado vai por extenso.
- Qualquer outra tela impressa pelo navegador sai sem menu, barra do topo e rodapé de recursos.
- Tipo de item novo no formulário: acrescente o campo em `SheetItem.tsx` (o `switch` não compila sem ele).

## Controles NR-10 na PT

O painel lateral mostra a base normativa e o turno explícito. Revalidar abre diálogo com três horários locais, justificativa e três confirmações inicialmente desmarcadas. O ato aguarda confirmação do servidor e deixa a PT aguardando novo aceite. A impressão identifica a última revalidação e seu responsável; o formulário original permanece visível.
