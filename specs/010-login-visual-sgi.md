# SPEC 010: Tela de Login no visual do protótipo SGI (Amanda)

| | |
|---|---|
| Status | **Executada (25/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência visual | Protótipo SGI Forces (Amanda): login do **Backoffice** ("Backoffice de Configuração") e do **Front-Office** ("Operação de campo"); `PTW-digital-design-system.html` (painel de login, sombra `0 24px 70px rgba(7,20,50,.45)`, templates de identidade) |

## 1. Contexto

### Como é no protótipo SGI

Há duas telas de login, com o **mesmo cartão** e fundos diferentes:

| | Backoffice | Front-Office |
|---|---|---|
| **Fundo** | Gradiente azul da marca (`#005EB8 → #1068EB`) com **ilustração industrial** em traço branco: refinarias nas laterais, hexágonos, malha de pontos, ondas na base | Gradiente liso lilás/índigo, sem ilustração |
| **Topo direito** | Seletor de idioma em pílula translúcida | Igual |
| **Cartão** (420 px, cantos 16 px, sombra do painel de login) | Marca em quadrado com gradiente e sombra, nome 20/600 e subtítulo; texto de apoio centralizado; **um botão principal largo** com ícone ("Entrar com sua conta corporativa"); linha de segurança com escudo ("Autenticação única via SSO…"); divisória; domínio em fonte mono | Igual |
| **Celular** | O cartão ocupa a largura com 16 px de margem; o fundo continua | Igual |

### Como é hoje no PTW

- **O cartão já segue o protótipo:** tamanho, sombra, marca, nome, subtítulo, texto de apoio, escudo, divisória e domínio.
- **As diferenças estão em volta e no botão:**
  1. **Fundo** navy-índigo em gradiente, sem a ilustração industrial.
  2. **Entrada por login e senha** (AD/LDAP), com dois campos; o SGI tem só o botão de SSO. Em desenvolvimento há também a aba **"Logar como"**, com a lista de pessoas.
  3. **"Servidor no ar"** aparece **fora** do cartão, sobre o fundo; o protótipo não tem isso.
  4. Não há seletor de idioma, porque o PTW é só em português.
  5. A linha de segurança diz "Cada entrada abre uma sessão auditada pelo servidor".

## 2. Objetivo

A tela de login do PTW com o **look and feel do protótipo SGI**, sem mudar o fluxo de autenticação (login e senha pelo AD e, em dev, "Logar como").

## 3. Escopo

**Entra**
1. **Fundo no estilo do Backoffice** (ver decisão 1):
   - gradiente da marca com a ilustração industrial do protótipo, otimizada;
   - a cor acompanha a **Identidade visual** do PTW (template Azul, Índigo etc.).
2. **Cartão:**
   - mesma estrutura do protótipo;
   - campos Login e Senha no padrão do Design System (altura 44 px, rótulo acima);
   - botão principal largo, com ícone e o texto **"Entrar"**.
3. **Linha de segurança:** "Autenticação pelo AD corporativo · sessão auditada" (ver decisão 3).
4. **"Servidor no ar"** dentro do cartão, junto do domínio no rodapé (ver decisão 4).
5. **"Logar como"** (só em dev/local) continua como aba, no estilo do Design System, sem disputar com o botão principal.
6. Responsividade:
   - celular: cartão com 16 px de margem;
   - tablet;
   - desktop largo: a ilustração preenche sem distorcer.
   - Em telas baixas (altura < 640 px), o cartão rola, e o fundo fica parado.

**Não entra**
- SSO/Azure AD: o PTW autentica por AD/LDAP com login e senha. O botão "Entrar com conta corporativa" do SGI vira "Entrar".
- Seletor de idioma (ver decisão 2).
- Seleção de planta depois do login (é do Front-Office do SGI; não existe no PTW).
- Mudanças na API, no banco ou no Supabase.

## 4. Regras

1. **O fundo respeita a identidade:**
   - a ilustração é aplicada sobre o gradiente da cor da marca (`--brand-navy` e `--primary`) com mistura de luminosidade;
   - com o template Azul fica igual ao protótipo; com outros templates, a ilustração acompanha a cor.
2. **Logo do cliente:** se a Identidade visual tiver logo enviado, ele aparece no lugar do quadrado da marca, como hoje.
3. **Acessibilidade:**
   - a ilustração é decorativa (`aria-hidden`), e o contraste do cartão não muda;
   - foco visível nos campos e no botão;
   - "Servidor no ar/sem resposta" com ícone e texto, nunca só a cor.
4. **Erros:**
   - o alerta de "Não foi possível entrar" fica dentro do cartão, acima dos campos;
   - "Tentar novamente" continua.
5. **Desempenho:**
   - a ilustração vira WebP em tons de cinza, com cerca de 55 KB (o PNG do protótipo tem 1,7 MB); a cor vem da marca;
   - carrega só na tela de login e não atrasa o formulário: o gradiente aparece primeiro.
6. **Movimento reduzido:** respeita `prefers-reduced-motion`, sem animação de entrada.

## 5. Dados e API

Sem mudança. Só `LoginView.tsx`, o CSS da tela (`.app-login`) e um arquivo de imagem novo em `src/assets/`.

## 6. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | Lado a lado com o login do Backoffice do protótipo, a tela do PTW tem o mesmo fundo, cartão, hierarquia de textos, botão largo, escudo, divisória e domínio. |
| CA-02 | Os componentes são os do Design System (Input, Button, Alert, abas). |
| CA-03 | Login e senha entram e saem como hoje; "Logar como" (dev) funciona; erros e "Tentar novamente" funcionam. |
| CA-04 | Trocar o template em Identidade visual muda a cor do fundo e do botão no login. |
| CA-05 | 1440, 1024, 820, 390 e 360 px, e altura de 600 px: sem rolagem lateral, cartão inteiro alcançável e ilustração sem distorção. |
| CA-06 | A imagem de fundo tem até cerca de 60 KB, e o formulário aparece antes dela. |

## 7. Casos de teste

**Tela** (Playwright)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | Capturas lado a lado: protótipo × PTW em 1440 e 390 px. |
| CT-UI-02 | "Logar como" Marina entra; sair; volta ao login. |
| CT-UI-03 | Com login e senha habilitados (API com LDAP de teste), um login errado mostra o alerta no cartão e um login certo entra. |
| CT-UI-04 | Trocar o template de identidade e conferir a cor do fundo e do botão no login. |
| CT-UI-05 | API desligada: "Servidor sem resposta" no rodapé do cartão, com "Tentar novamente". |
| CT-UI-06 | Resoluções do CA-05. |

## 8. Prévia para validação

Montagem estática com a imagem real do protótipo e as propostas desta spec, em `specs/010-mockups/`:

- `mock-azul-1440.png`: template Azul, desktop;
- `mock-indigo-1440.png`: template Índigo, mostrando a ilustração acompanhando a marca;
- `mock-azul-390.png`: celular;
- `prototipo-backoffice.png` e `prototipo-frontoffice.png`: as referências;
- `ptw-atual-1440.png`: o login de hoje (modo dev, aba "Logar como").

## 9. Pontos para você decidir

1. **Qual fundo?**
   - **Proposta:** o do **Backoffice**, com a ilustração industrial, aplicada sobre a cor da marca. É a tela mais marcante do protótipo e combina com o PTW (planta industrial).
   - **Alternativa:** o do **Front-Office**, gradiente liso, mais leve e sem imagem.
2. **Seletor de idioma no topo direito:**
   - **Proposta:** **não**, porque o PTW só tem português e um seletor sem opção engana.
   - **Alternativa:** mostrar só "Português (BR)", desativado, para fidelidade visual.
3. **Texto da linha de segurança:**
   - **Proposta:** "Autenticação pelo AD corporativo · sessão auditada".
   - **Alternativa:** manter "Cada entrada abre uma sessão auditada pelo servidor".
4. **"Servidor no ar":**
   - **Proposta:** dentro do cartão, no rodapé, ao lado do domínio, discreto.
   - **Alternativa:** mostrar só quando houver problema ("Servidor sem resposta").
5. **Subtítulo debaixo do nome:**
   - **Proposta:** manter "Gestão de permissões de trabalho".
   - **Alternativa:** seguir o SGI com "Operação de campo".

## 10. Resultado da execução

**Decisões aplicadas:**
1. Fundo do **Backoffice**, com a ilustração.
2. **Sem** seletor de idioma, que fica para uma spec futura.
3. Linha de segurança **mantida**: "Cada entrada abre uma sessão auditada pelo servidor".
4. **"Servidor sem resposta" só quando o servidor não responde**, no rodapé do cartão, ao lado do domínio. O "Servidor no ar" sobre o fundo saiu.
5. Subtítulo **mantido**: "Gestão de permissões de trabalho".

**Como ficou:**
- `src/assets/login-bg.webp`: a ilustração do protótipo em cinza, com 55 KB (antes era um PNG de 1,7 MB).
- `workspace.css` › `.app-login`: a imagem fica sobre o degradê `--brand-navy → --primary`, misturada por luminosidade.
- `LoginView.tsx`: botão "Entrar" com 48 px e ícone; rodapé com o domínio e o aviso de servidor fora. O fluxo, os campos, "Logar como", os erros e "Tentar novamente" ficaram como estavam.
- API, banco e Supabase: sem mudança.

| Caso | Resultado |
|---|---|
| CT-UI-01/06 1440×950, 1024×768, 820×1180, 390×844, 360×640 e 1280×600: sem rolagem lateral, cartão inteiro alcançável, ilustração aplicada | Passou |
| CT-UI-02 "Logar como" Marina entra; Sair volta ao login | Passou |
| CT-UI-03 login e senha (modo com senha simulado na resposta de `/health`): erro "Login ou senha incorretos" dentro do cartão | Passou |
| CT-UI-04 template Verde publicado: o login fica verde (`--primary #0a7a50`); restaurado, volta ao padrão | Passou |
| CT-UI-05 API fora: "Servidor sem resposta" no rodapé e "Tentar novamente" | Passou |

Testes do app: 457 passaram. tsc, eslint e build limpos; 0 erros JS no e2e.

**Capturas** em `specs/010-mockups/`: `resultado-1440.png`, `resultado-390.png`, `resultado-verde.png` e `resultado-sem-servidor.png`.
