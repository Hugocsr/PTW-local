# PERF-05 — aproximar API e banco

Estado: **proposta, aguardando validação**. Prioridade P1. Dependência: PERF-01.

## Problema

O deploy observado usa `iad1`; o Supabase está em `us-west-2`. A API executa várias viagens ao banco por chamada. Aproximar as regiões pode reduzir latência, mas o benefício precisa ser medido com o mesmo código/configuração.

## Escopo e contrato proposto

1. Confirmar na implementação as regiões suportadas pelo runtime Container/plano atual da Vercel e sua forma oficial de configuração. A região candidata deve ser próxima do banco; não presumir identificador ou disponibilidade.
2. Manter o projeto e os dados do Supabase na região existente. Esta task não migra banco, arquivos ou identidades.
3. Comparar região atual e candidata em Preview controlado, com o mesmo commit, variáveis, pools e dados. Fazer ensaios sequenciais para não dobrar consumo de conexões por teste.
4. Separar primeira carga, chamadas aquecidas, latência do navegador no Brasil e duração interna da API. Melhorar API→banco não garante que todo trecho navegador→API melhore na mesma proporção.
5. Registrar custo/disponibilidade antes de agir. Se a região exigir plano pago ou mudança fora de Preview, concluir a avaliação e levar a alternativa ao refinamento; não contratar/alterar Production.

## Critérios de aceite

- AC01: configuração e região real do deploy candidato verificadas, não apenas arquivo editado.
- AC02: relatório antes/depois com amostras e variáveis equivalentes, incluindo tempos dos endpoints, login e reload; medir ganho em vez de prometê-lo.
- AC03: adotar a candidata somente se melhorar o indicador primário validado sem regressão > 10% no p95 dos demais cenários representativos; limiar proposto para refinamento.
- AC04: três logins, acesso a arquivos, SSE, health/status e RLS/auditoria aprovados na candidata; limites de conexão observados.
- AC05: nenhuma perda de dado, alteração de segredo ou custo/plano novo.

## Validação local e hospedada

Conferir localmente sintaxe/configuração e regressão funcional antes de publicar. Localhost não reproduz a rota entre regiões; esse critério é fechado somente no Preview. Publicação de experimento precisa estar incluída na validação desta spec; não fazer mudança de infraestrutura só com a aprovação da metodologia.

## Reversão

Restaurar região/configuração anterior e redeploy compatível, mantendo dados e esquema. Não exigir reversão de banco. Registrar alias/deploy anteriores e observar que instâncias anteriores podem coexistir transitoriamente.

## Fora de escopo e decisões

Não criar outro Supabase, não usar replicação multi-região nem desativar TLS. Validar região suportada, custo zero e indicador primário antes do ensaio.
