# PERF-04 — abertura das telas com dados necessários

Estado: **proposta, aguardando validação**. Prioridade P0. Dependências: PERF-01, PERF-02 e PERF-03.

## Problema

A entrada aguarda sete coleções de referência e depois Minha área. Modelos completos de todas as versões são carregados antes de a pessoa trabalhar, mesmo que não abra a configuração de modelos.

## Escopo e contrato proposto

1. Definir explicitamente o conjunto mínimo para Minha área útil: identidade/permissões atuais, PTs relevantes e versões/cargos/locais/ativos necessários para interpretar essas PTs e suas ações.
2. Diferir cadastros e conteúdo de versões não necessárias até o primeiro uso. Não omitir a versão congelada usada por uma PT histórica nem substituir por uma versão ativa mais recente.
3. Consumidores recebem estados explícitos de carregando/pronto/erro; dado ainda não buscado não é lista vazia, ausência de pendência ou permissão concedida.
4. A navegação para Modelos, Ativos, Locais, Pessoas, Quadro e Auditoria carrega suas dependências com uma busca compartilhada por sessão; mantém filtros, deep links, voltar e permissões.
5. Cache em memória apenas de dados de referência necessários, limitado à sessão/unidade e invalidado por versões/eventos. Não criar armazenamento persistente/offline ou cache de respostas protegidas em CDN.
6. Se uma resposta inicial agregada for a solução validada, descrever primeiro seu contrato OpenAPI, campos, paginação e tratamento de erro; não introduzir endpoint informal.

## Critérios de aceite

- AC01: Minha área mostra os mesmos estados, pendências, elegibilidade e ações do caminho atual para os mesmos dados, sem antecipar Trabalho liberado.
- AC02: sessão aberta não depende de conteúdo integral de versões que nenhuma PT/tela atual utiliza. Contagem e bytes desnecessários documentados antes/depois.
- AC03: erro em dependência crítica bloqueia as ações afetadas e oferece recuperação; falha de dado complementar não apaga PTs já carregadas nem declara ausência de trabalho.
- AC04: deep link de PT vigente/encerrada e nova PT recupera a versão correta; modelo arquivado e troca de sessão não deixam conteúdo antigo utilizável.
- AC05: metas propostas de login/reload útil: mediana ≤ 3 s e p95 ≤ 5 s após o conjunto das otimizações; não medir só o cabeçalho.
- AC06: preservar identidade visual e verificar 390, 768, 1024 e 1440 px, sem rolagem horizontal ou erro JavaScript.

## Testes e evidências

Login/reload com zero, uma e várias PTs; sessão expirada; erro parcial e recuperação; navegação rápida durante carregamento; logout durante requisição; dois usuários com privilégios distintos; versões históricas. Medir caminho útil e contar chamadas/bytes. Comparar interface e disponibilidade de Parar antes/depois.

## Áreas previstas

Camada `src/data/api`, contratos de `src/data/port.ts` e hooks; telas somente para estados de carregamento/erro. Decisões de elegibilidade continuam no núcleo/banco. Não manter dois algoritmos diferentes para determinar liberação de trabalho.

## Reversão e fora de escopo

Restaurar bootstrap anterior sem mudar os dados ou invalidar PTs. Clientes anteriores continuam atendidos durante a troca. Não redesenhar o produto ou adicionar modo offline nesta task.

## Decisões para refinamento

Validar o conjunto mínimo por tela e a UX de falha parcial. Registrar se a redução exige endpoint agregado ou somente coordenação das leituras existentes.
