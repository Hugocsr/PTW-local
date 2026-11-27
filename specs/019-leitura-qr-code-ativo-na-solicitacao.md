# SPEC 019: Leitura de QR Code para identificar o ativo na criação da Solicitação

| | |
|---|---|
| Status | **Executada (27/11/2026)** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 27/11/2026 |
| Onde aparece | Nova PT / Editar rascunho (`NewPermitView`: campos Local e Ativos), `lib/qr.ts`, Gestão de Ativos (etiqueta), `web/Caddyfile` |

## 1. Resposta curta

1. **O app já escreve QR, mas não lê.** `lib/qr.ts` (`qrcode-generator`) gera o QR da PT impresso na folha. Não há leitor, câmera nem biblioteca de leitura no projeto.
2. **O ativo não tem hoje um QR nem um conteúdo definido para ele.** O que o identifica é o `code` (a tag, 1–64 caracteres, único sem diferenciar maiúsculas). O QR lido precisa carregar esse código, ou uma URL que o contenha.
3. **O caminho de "escolher ativo e já preencher o local" existe** (SPEC 017: `onPickAsset(asset, placeId)` define o local e o ativo). A leitura do QR reaproveita isso: achou o ativo, preenche como se tivesse escolhido na busca.
4. **A câmera exige conexão segura.** O Docker local usa HTTPS (`tls internal`) e o `Caddyfile` já libera `camera=(self)`. Em `localhost` o navegador também permite. Em HTTP puro por IP da rede, a câmera não abre.
5. **Leitura pelo navegador:** o `BarcodeDetector` nativo funciona no Chrome/Edge/Android, mas não no Safari do iPhone nem no Firefox. Para cobrir todos é preciso uma biblioteca de leitura empacotada no app (funciona sem internet).

## 2. Como funciona hoje (conferido)

| Item | Hoje |
|---|---|
| Escolha do ativo | Busca por código/nome + caixas, só ativos `ativo` e de tipo aceito pelo modelo; ou pelo seletor de local em árvore (SPEC 017) |
| Ao escolher ativo pela busca de local | Define o local do ativo e seleciona o ativo |
| Ativo com mais de um local | Possível (`locationIds`); o seletor usa o local onde o ativo foi achado |
| Identificação do ativo | `code` único ignorando maiúsculas; `aliases` extras para busca |
| QR no sistema | Só o da PT (folha impressa), conteúdo: URL da PT |
| Permissão de câmera | `Permissions-Policy: camera=(self)` já no `Caddyfile` |

## 3. Proposta

Botão **"Ler QR Code"** ao lado do campo Ativos (e dentro do seletor de local). Abre um painel com a imagem da câmera; ao ler:

1. Extrai o código do ativo do conteúdo lido.
2. Procura o ativo pelo código exato (sem diferenciar maiúsculas).
3. Confere: está `ativo`, o tipo é aceito pelo modelo, o local está entre os aceitos.
4. Se tudo bate, preenche **local e ativo** como o seletor já faz e fecha o painel, com aviso "Ativo CCM-L2-01 identificado".
5. Se não bate, mostra o motivo e deixa tentar de novo ou escolher à mão.

Fluxo manual continua intacto: o botão é um atalho, nunca a única forma.

### Tratamento de erros

| Situação | Mensagem proposta |
|---|---|
| Câmera negada ou inexistente | "Não foi possível usar a câmera. Escolha o ativo na lista ou digite o código." (campo de código manual no painel) |
| Conteúdo que não é de ativo | "Este QR Code não é de um ativo." |
| Código não cadastrado | "Nenhum ativo com o código XXX." |
| Ativo inativo | "O ativo XXX está inativo." |
| Tipo não aceito pelo modelo | "O modelo escolhido não aceita ativos do tipo YYY." |
| Modelo ainda não escolhido | Botão desabilitado com "Escolha o modelo primeiro" |

## 4. Pontos a decidir

1. **Conteúdo do QR do ativo.** (A) só o código (`CCM-L2-01`); (B) URL do sistema com o código (`https://ptw.planta/#ativo/CCM-L2-01`), que também serve para abrir o ativo com a câmera do celular; (C) aceitar os dois. **Recomendado: C.** O QR já colado nos equipamentos pode ser só o código (SGI Forces).
2. **Biblioteca de leitura.** (A) só `BarcodeDetector` (sem dependência, não cobre iPhone/Firefox); (B) biblioteca empacotada (`jsQR` ou `zxing`, cerca de 50–150 KB), cobre todos; (C) nativo quando existir, biblioteca como reserva. **Recomendado: C.**
3. **Mais de um ativo por leitura.** (A) cada leitura **substitui** o ativo; (B) cada leitura **adiciona** à lista, com o painel aberto para ler vários. **Recomendado: B** (PT costuma cobrir mais de um equipamento).
4. **Ativo com mais de um local.** (A) usa o primeiro/principal; (B) pergunta qual local, só nesse caso. **Recomendado: B.**
5. **Etiqueta com QR do ativo.** (A) fora desta spec, só leitura; (B) incluir, na Gestão de Ativos, ação "Imprimir etiqueta" com o QR do ativo (reaproveita `qrPath`). **Recomendado: A**, e tratar em outra spec se for pedido.
6. **Leitura sem o modelo escolhido.** (A) exigir o modelo antes (recomendado, os filtros dependem dele); (B) ler e escolher o modelo depois, sem validar o tipo na hora.
7. **Registro.** (A) nada além do que a PT já audita; (B) registrar na auditoria que o ativo foi identificado por QR. **Recomendado: A.**

## 5. Fora do escopo

Ler QR de PT para abrir a PT; leitura de código de barras; gerar/imprimir QR de ativo (ponto 5); leitura offline com fila de sincronização.

## 6. Plano

- `lib/qrScan.ts`: leitura (nativo + reserva), parse do conteúdo, testes do parse.
- `core/assetLookup.ts`: resolve código → ativo + validações (puro, testado); busca exata via API (filtro por código) sem baixar a lista inteira.
- `components/work/QrScanner.tsx`: painel com câmera, estados de permissão/erro, campo de código manual.
- `NewPermitView`: botão, ligação com `onPickAsset`.
- Testes de unidade, e2e com câmera simulada (arquivo de vídeo/imagem), DESIGN.md, AGENTS.md, nota de publicação (só app; sem mudança de banco, salvo filtro por código na API).

## 7. Decisões e resultado da execução

**Decisões (Hugo: "seguir com o recomendado", com uma mudança no ponto 5):**
1. O QR lido aceita o código puro e o link `…#ativo/<código>`. O QR que o sistema **gera** carrega o código puro (não depende do endereço do servidor).
2. Leitor: `BarcodeDetector` quando o navegador tem; `jsQR` (empacotado, funciona sem internet) como reserva.
3. Cada leitura **adiciona** o ativo; o painel fica aberto até "Concluir".
4. Ativo em mais de um local aceito: o painel pergunta qual local.
5. **Mudou:** a etiqueta entra nesta spec. Na tela de detalhe do ativo (Gestão de Ativos) há a seção "QR Code do ativo" com "Imprimir etiqueta".
6. Modelo obrigatório antes de ler (botão desabilitado sem modelo).
7. Sem registro extra na auditoria.

**Feito:**
- `lib/qrScan.ts` (leitura do texto, decodificador, mensagens de câmera), `core/assetLookup.ts` (regras puras), `components/work/QrScanDialog.tsx` (câmera, erros, código digitado, escolha de local), botão "Ler QR Code do ativo" na seção Local e ativos da Nova PT / Editar rascunho.
- `AssetLabel.tsx`: QR do ativo na tela de detalhe e etiqueta impressa sozinha (90 mm, QR + código + nome + caminho do local).
- Regras: ativo inativo, tipo fora do modelo e local fora do modelo são recusados com o motivo; ativo já na PT é avisado; com ativos já na PT, ativo de outro local é recusado (a PT tem um local só); sem ativos, o local acompanha o ativo lido.
- Sem câmera ou permissão negada: aviso e campo "Ou digite o código".
- Dependência nova: `jsqr`. Sem mudança de banco nem de API.
- Testes: 10 novos (leitura do texto, ida e volta gerar→ler, regras). App: 490 passando; lint e tsc limpos. Navegador com câmera simulada: QR de PT, código inexistente, tipo fora do modelo, ativo válido (local preenchido) e repetido, código digitado e câmera negada; etiqueta conferida em modo de impressão.

**Ajuste após o uso (27/11):** (a) a câmera piscava: o painel reiniciava a câmera a cada atualização da tela (o salvamento automático do rascunho renova a função `onAdd`); agora a câmera abre uma vez e a função vai por referência. (b) Ao reconhecer o ativo, a câmera cede lugar a um cartão de confirmação (nome, código, tipo, local; escolha do local quando há mais de um) com **Adicionar à PT** e **Ler outro**. O mesmo código ainda na frente da câmera não é lido de novo até sair do campo.

**Limites:**
- A câmera exige https ou localhost. Em http por IP da rede a leitura da câmera não abre (o código digitado funciona).
- Não testado em iPhone/Android reais; a leitura usa o mesmo caminho do navegador de teste.
- A etiqueta imprime uma por vez em página A4 (recorte manual); não há folha com várias.
- Não há tela que abra o ativo pelo link `#ativo/<código>` (o link só é aceito na leitura).
