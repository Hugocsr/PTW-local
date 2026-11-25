# SPEC 004: Ajustes nos formulários da Gestão de Ativos (campos SAP, Tipo da área, Planta e equipamento pai pré-selecionados)

| | |
|---|---|
| Status | **Executada em 25/11/2026** (decisões da seção 11 aprovadas como recomendado) |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 25/11/2026 |
| Referência | Tela `#ativos` (SGI Forces · Gestão de Ativos), modais Nova planta / Nova área / Novo equipamento / Equip. aninhado |

## 1. Contexto

### Como funciona hoje

Os modais desenham os campos da ficha a partir de três listas em `core/assetAttrs.ts`. O painel de detalhe da direita usa as mesmas listas.

| Modal | Campos fixos | Ficha (`attrs`) |
|---|---|---|
| **Nova planta** | Nome, Código, Ativa | Fuso horário, Localização, **WERKS, IWERK, BUKRS, REGIO** |
| **Nova área** | Planta, Nome, Código, Ativa | **TPLNR, BEBER, KOSTL** |
| **Novo equipamento / aninhado** | Planta, Área, Nome, Código/TAG, Tipo, Ativo, bloco "É dispositivo de proteção?" | **EQUNR**, Fabricante, Modelo, Nº de série, Status operacional, **TPLNR/FLOC, Categoria SAP, Nº inventário, KOSTL, IWERK, INGRP, ANSDT, MATNR** |

Em negrito, os campos SAP que o requisito pede para esconder.

- **Tipo da área:** a área nova recebe sempre o tipo "Área", criado automaticamente. O modal não oferece escolha.
  - A versão anterior do PTW (tela Locais, antes do formato SGI) tinha o campo Tipo, com os tipos de local de Configuração › Tipos: sala, linha, ponto de trabalho etc.
  - O tipo **importa para a PT**: cada versão de modelo diz em quais **tipos de local** ela pode ser aberta. Uma área "Sala elétrica" só recebe PTs de modelos que aceitam "Sala elétrica".
- **Planta no Novo equipamento:**
  - o modal tenta preencher a Planta a partir da área selecionada na árvore, pelo pai direto da área;
  - no ambiente de teste com os dados de exemplo, a Planta veio preenchida ao abrir a partir de uma área;
  - no seu uso, veio vazia. Tentei reproduzir no seu https://localhost, mas ele estava sendo recompilado e não abriu. Vou reproduzir lá na execução.
  - **Causas prováveis:** a área não é filha direta da planta, ou o modal foi aberto por um caminho em que nenhuma área estava selecionada.
- **Equipamento aninhado:**
  - o subtítulo diz "Aninhado em Bomba de Polpa 201 (BP-201)", e Planta e Área vêm do pai;
  - **não há um campo** mostrando o equipamento pai;
  - não é possível escolher outro pai no próprio modal.

## 2. Objetivo

1. Formulários mais curtos: esconder os campos SAP que a operação não usa hoje.
2. Área com **Tipo** escolhido pela pessoa (sala, linha, ponto de trabalho…).
3. Novo equipamento sempre com a **Planta** (e a Área) já preenchidas a partir do que está selecionado.
4. Equipamento aninhado mostrando o **Equipamento pai** já preenchido.

## 3. Escopo

**Entra**
1. **Nova planta:** esconder WERKS, IWERK, BUKRS e REGIO. Ficam Nome, Código, Fuso horário, Localização e Ativa.
2. **Nova área:**
   - esconder TPLNR, BEBER e KOSTL;
   - incluir **Tipo** (obrigatório, padrão "Área").
3. **Novo equipamento e Equip. aninhado:**
   - esconder EQUNR, TPLNR/FLOC, Categoria SAP, Nº inventário, KOSTL, IWERK, INGRP, ANSDT e MATNR;
   - ficam Planta, Área, Nome, Código/TAG, Tipo, Fabricante, Modelo, Nº de série, Status operacional, dispositivo de proteção e Ativo.
4. **Painel de detalhe:** os mesmos campos escondidos também saem do painel. Ver decisão 1.
5. **Planta pré-selecionada:**
   - ao criar equipamento a partir de uma área, a Planta é a **planta-raiz** da área (subindo a hierarquia) e a Área é a própria área;
   - a correção vale para todos os caminhos que abrem o modal.
6. **Equipamento pai no aninhado:**
   - campo **"Equipamento pai"** já preenchido com o equipamento selecionado ("BP-201 · Bomba de Polpa 201");
   - Planta e Área continuam herdadas do pai e bloqueadas.
7. **Tipos de área de exemplo:** "Sala", "Linha" e "Ponto de trabalho" nos dados de exemplo (Configuração › Tipos, família Local, com ícone). Ver decisão 3.

**Não entra**
- **Apagar dados SAP já gravados.** Os valores continuam no banco, são preservados ao editar e continuam valendo na busca. Também continuam podendo ser preenchidos pela importação.
- Mudar o banco ou a API: os campos são da ficha (`attrs`), então nada muda no esquema. **Não há script de Supabase.**
- Tipo da planta: continua "Planta".

## 4. Regras

1. **Esconder não é apagar.** Ao editar uma planta, área ou equipamento que já tem, por exemplo, EQUNR, o valor continua salvo, mesmo sem aparecer no formulário. O código já preserva chaves que o formulário não conhece.
2. **A busca continua achando pelos códigos SAP** (TPLNR, WERKS, EQUNR), porque eles continuam no banco.
3. **Tipo da área:**
   - as opções são os tipos de local ativos em Configuração › Tipos, menos o tipo de planta;
   - o padrão é "Área";
   - se não houver nenhum tipo além de Planta, o tipo "Área" é criado na hora, como hoje.
4. **Tipo e modelos de PT:**
   - o modal mostra, abaixo do Tipo, quantos modelos ativos aceitam aquele tipo ("3 modelos de PT aceitam Área");
   - se nenhum aceita: "Nenhum modelo de PT aceita este tipo ainda: inclua-o no Escopo do modelo para abrir PTs aqui".
5. **Planta:**
   - a planta pré-selecionada é a **raiz** da área, nunca uma área intermediária;
   - criando a partir de uma planta, a Planta vem preenchida e a Área vazia.
6. **Equipamento pai:**
   - só leitura no modal de aninhado, com o código e o nome;
   - para trocar o pai, crie a partir de outro equipamento (ver decisão 4).

## 5. Experiência

- **Nova planta:** Nome da planta, Código / Fuso horário, Localização / Planta ativa. O modal fica com duas linhas de campos.
- **Nova área:**
  - Planta (a selecionada, em destaque), Nome da área, Código;
  - **Tipo**: lista com o ícone de cada tipo, mais a linha de ajuda com a contagem de modelos;
  - Área ativa.
- **Novo equipamento:** Planta e Área preenchidas, Nome, Código/TAG, Tipo, Fabricante, Modelo, Nº de série, Status operacional, o bloco de proteção e Equipamento ativo.
- **Equip. aninhado:**
  - **primeira linha:** "Equipamento pai", ocupando as duas colunas, só leitura, com o ícone do tipo, "BP-201 · Bomba de Polpa 201" e a ajuda "O novo equipamento fica dentro dele (é parte de)";
  - Planta e Área só leitura ("Herdada do equipamento pai");
  - depois, os demais campos.
- **Painel de detalhe:**
  - planta mostra Fuso e Localização;
  - área mostra o **Tipo**;
  - equipamento mostra Fabricante, Modelo, Nº de série e Status.
  - Os campos escondidos somem (decisão 1).

## 6. Dados e API

- **App:**
  - `core/assetAttrs.ts`: as três listas ficam só com os campos visíveis. Os campos SAP passam para uma lista de **campos guardados** (`SAP_HIDDEN`), usada para documentar e testar que continuam preservados.
  - `NodeDialog`:
    - Tipo na área, com a contagem de modelos (`state.templates`, versões ativas, `locationTypeIds`);
    - Planta pela raiz (`locationPath`);
    - campo Equipamento pai no aninhado.
  - `Detail`: Tipo da área; os campos escondidos somem.
- **Dados de exemplo:** novos tipos de local Sala, Linha e Ponto de trabalho (`exemplo.json` e a carga de exemplo).
- **Banco e API:** sem mudança.

## 7. Critérios de aceite

| # | Critério |
|---|---|
| CA-01 | Nova/Editar planta não mostram WERKS, IWERK, BUKRS nem REGIO. |
| CA-02 | Nova/Editar área não mostram TPLNR, BEBER nem KOSTL, e têm o campo Tipo, com padrão "Área" e a contagem de modelos. |
| CA-03 | Novo/Editar equipamento e aninhado não mostram EQUNR, TPLNR/FLOC, Categoria SAP, Nº inventário, KOSTL, IWERK, INGRP, ANSDT nem MATNR. |
| CA-04 | Editar e salvar um registro que tinha esses campos preenchidos **não apaga** os valores (conferido no banco), e a busca continua achando pelo TPLNR/EQUNR. |
| CA-05 | Novo equipamento a partir de uma área vem com Planta e Área preenchidas. |
| CA-06 | Equip. aninhado mostra "Equipamento pai" preenchido, com Planta e Área herdadas. Ao salvar, cria a relação "é parte de" com o pai. |
| CA-07 | Área criada com tipo "Sala" aparece com o ícone do tipo na árvore e o Tipo no detalhe. A PT só oferece modelos que aceitam "Sala". |
| CA-08 | Celular e tablet sem rolagem lateral. Os testes atuais continuam passando. |

## 8. Casos de teste

**App (unitários)**
- As listas visíveis não contêm as chaves escondidas.
- `sheetFrom` preserva as chaves escondidas ao salvar o formulário.
- Planta-raiz de uma área: direta e com área intermediária.
- Contagem de modelos por tipo.

**Tela** (Playwright, API real e dados de exemplo)

| Caso | Roteiro |
|---|---|
| CT-UI-01 | Nova planta: os campos SAP não aparecem. Criar "Planta Oeste" (POE). |
| CT-UI-02 | Nova área em Planta Oeste: Tipo "Sala", com a contagem de modelos. Criar "Sala elétrica E-03". O ícone e o tipo aparecem no detalhe. |
| CT-UI-03 | Selecionar a área e clicar "Novo equipamento": Planta "Planta Oeste" e Área "Sala elétrica E-03" já preenchidas. Os campos SAP não aparecem. Criar "CCM-03". |
| CT-UI-04 | Selecionar o CCM-03 e clicar "Equip. aninhado": "Equipamento pai: CCM-03 · …" preenchido. Criar a gaveta "CCM-03-1A". Na árvore, ela aparece dentro do CCM-03. |
| CT-UI-05 | Editar o XV-401 (tem EQUNR e TPLNR nos exemplos) e salvar só o nome. No banco, EQUNR e TPLNR continuam. A busca rápida acha "BR-PNO-REC…". |
| CT-UI-06 | Repetir CT-UI-03 no seu https://localhost, no caminho em que a Planta vinha vazia. |
| CT-UI-07 | Capturas em 1440, 820 e 390 px. |

## 9. Impacto e riscos

- **Sem banco nem script do Supabase.** É só código do app e dados de exemplo.
- **Tipo da área × modelos:** escolher um tipo que nenhum modelo aceita deixa a área sem PT possível. O aviso no modal mostra isso na hora.
- **Integração SAP futura:** os campos continuam no banco. Se voltarem a ser necessários, basta reexibir (decisão 1).
- **Documentação:** `DESIGN.md` (Gestão de Ativos) e `AGENTS.md`.

## 10. Plano de execução

1. `core/assetAttrs.ts`: listas visíveis, `SAP_HIDDEN` e testes.
2. `NodeDialog`: Tipo da área, Planta pela raiz, Equipamento pai. `Detail`: tipo e campos.
3. Dados de exemplo: tipos Sala, Linha e Ponto de trabalho.
4. Reproduzir o problema da Planta no seu localhost e confirmar a correção.
5. Testes de tela CT-UI-01 a 07, documentação e cópia para a sua pasta.

## 11. Pontos para você decidir

1. **Esconder também no painel de detalhe?**
   - **Proposta:** sim, some do formulário **e** do detalhe; os valores ficam guardados no banco.
   - **Alternativa:** no detalhe, mostrar uma seção recolhida "Integração SAP" só quando houver algum valor preenchido (útil para quem importou dados do SAP).
2. **Os campos escondidos podem voltar sem programar?**
   - **Proposta:** não nesta entrega; ficam fixos no código, fáceis de reexibir.
   - **Alternativa:** uma chave em Configuração › Identidade/Unidade "Mostrar campos SAP", que reexibe todos de uma vez.
3. **Tipos de área de exemplo.**
   - **Proposta:** incluir Sala, Linha e Ponto de trabalho nos dados de exemplo; em produção, cada planta cadastra os seus em Configuração › Tipos.
   - **Alternativa:** só "Área", e a pessoa cria os outros.
4. **Trocar o equipamento pai no modal do aninhado.**
   - **Proposta:** só leitura (cria-se a partir do pai selecionado na árvore, como no SGI).
   - **Alternativa:** campo de busca para escolher outro pai dentro da mesma área.

## 12. Resultado da execução (25/11/2026)

**Decisões aprovadas como recomendado:**
1. Os campos SAP saem do formulário e do detalhe.
2. Sem chave para reexibir os campos SAP.
3. Sala, Linha e Ponto de trabalho entram nos dados de exemplo.
4. O equipamento pai é só leitura.

**Verificações**

| Camada | Resultado |
|---|---|
| App (`vitest`, inclui o teste novo de `SAP_HIDDEN`: chaves fora da tela e preservadas ao salvar) | 448 testes passaram |
| API (com o pacote de exemplo novo) | 211 testes passaram |
| `tsc`, `eslint`, `vite build` | sem erros |
| Banco / Supabase | sem mudança, sem script |

**Tela** (Playwright, API real, dados de exemplo)

| Caso | Resultado |
|---|---|
| CT-UI-01 | PASSOU: Nova planta só com Nome, Código, Fuso, Localização e Ativa; criada "Planta Oeste" (POE). |
| CT-UI-02 | PASSOU: Nova área com a Planta já selecionada e Tipo "Área" por padrão ("2 modelos de PT aceitam Área"). Com "Sala", o modal avisa que nenhum modelo aceita. Criada "Sala elétrica E-03"; o detalhe mostra Tipo Sala. |
| CT-UI-03 | PASSOU: Novo equipamento com Planta "Planta Oeste" e Área "Sala elétrica E-03" já preenchidas, sem campos SAP; criado CCM-03. |
| CT-UI-04 | PASSOU: Equip. aninhado com "Equipamento pai: CCM-03 · CCM da sala E-03", Planta e Área bloqueadas; a gaveta CCM-03-1A é criada com a relação "é parte de". |
| CT-UI-05 | PASSOU: editar o XV-401 sem os campos SAP mantém EQUNR 10001501 e EQTYP M no banco; o detalhe não os mostra; a busca rápida por 10001501 acha o XV-401. |
| CT-UI-06 | **Não reproduzido.** Testei a versão anterior em três caminhos e a Planta veio preenchida em todos (detalhes abaixo). |
| CT-UI-07 | PASSOU: 820 e 390 px sem rolagem lateral; nenhum erro de JavaScript. |

Caminhos testados no CT-UI-06, todos com a versão anterior:
- área de exemplo, na minha cópia;
- planta e área recém-criadas, logo depois de salvar e depois de recarregar;
- a Caldeiraria no seu https://localhost.

Mesmo assim, a Planta agora vem da raiz da área (subindo a hierarquia), o que cobre área dentro de área. **Se ainda acontecer, falta saber o caminho exato** (de qual nó, em qual ambiente) para reproduzir.

**Arquivos principais**

- **App:**
  - regras: `core/assetAttrs.ts`, `core/assetTree.test.ts`;
  - telas: `components/registry/AssetManagement/NodeDialog.tsx`, `Detail.tsx`, `components/registry/forms.tsx` (`SelectField disabled`);
  - dados de exemplo: `demo/sgi/registry.ts` (tipos Sala, Linha, Ponto de trabalho).
- **API:** `seed/dados/exemplo.json` (regenerado).
- **Documentação:** `DESIGN.md`, `ptw-mockup-v2/AGENTS.md`.
