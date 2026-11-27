# Publicação: leitura de QR Code do ativo (SPEC 019)

- **Pré-requisito:** publicação de 28/11 (`2026-11-28-tipos-de-trabalho`) aplicada.
- **Conteúdo:**
  - botão "Ler QR Code do ativo" na Nova PT (câmera, com código digitado como alternativa);
  - QR Code e "Imprimir etiqueta" no detalhe do equipamento (Gestão de Ativos).
- **Banco e API:** sem mudança. Não há script SQL.
- **App:** nova dependência (`jsqr`), então o container `web` precisa ser reconstruído (`--build`).
- **Câmera:** exige https ou localhost. O Docker local já serve https e o Caddy libera a câmera (`Permissions-Policy`). Em http por IP da rede a câmera não abre.
- **Conferir:** abrir um equipamento em Gestão de Ativos, imprimir a etiqueta; na Nova PT, escolher o modelo, tocar em "Ler QR Code do ativo" e apontar para a etiqueta.
