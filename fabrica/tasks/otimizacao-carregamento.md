# Tasks — otimização do carregamento

Estado do programa: **em execução por recortes**. Criado em 18/11/2026. PERF-01 acompanha o release SGI; baseline global e aceite ainda pendentes. PERF-02/PERF-03A foram autorizadas e implementadas localmente em 24/11/2026. Demais tasks aguardam validação.

Objetivo: reduzir o tempo para entrar e navegar no PTW-SGI, preservando os controles das PTs e os dados locais/hospedados.

Referência: [spec do programa](../specs/otimizacao-carregamento/README.md). Cada task tem sua própria spec e só avança depois da validação do responsável pelo produto.

| ID | Task | Prioridade | Dependências | Entrega e aceite principal | Spec |
|---|---|---|---|---|---|
| PERF-01 | Medir carga inicial, rede, consultas e filas | P0 | Nenhuma | Baseline reproduzível; tempos separados e logs sem dados sensíveis | [Instrumentação](../specs/otimizacao-carregamento/01-instrumentacao.md) |
| PERF-02 | Consolidar sincronização e atualizações de fundo | P0 | PERF-01 | Uma atualização por sessão em andamento; menos chamadas sem perder eventos | [Sincronização](../specs/otimizacao-carregamento/02-sincronizacao.md) |
| PERF-03 | Reduzir viagens ao banco nas leituras | P0 | PERF-01 | Menos consultas sequenciais, com isolamento e autenticação preservados | [Leituras da API](../specs/otimizacao-carregamento/03-leituras-api.md) |
| PERF-03A | Contar ativos dos locais visíveis em lote | P0, primeiro recorte | Baseline local e PERF-02 para invalidação externa | Uma chamada por página/geração; sem busca de ativos por linha; RLS e totais equivalentes | [Contagens de locais](../specs/otimizacao-carregamento/03a-contagens-locais.md) |
| PERF-04 | Reduzir o que bloqueia a abertura das telas | P0 | PERF-01, PERF-02 e PERF-03 | Minha área abre com os dados necessários; dados complementares sob demanda | [Carga inicial](../specs/otimizacao-carregamento/04-carga-inicial.md) |
| PERF-05 | Aproximar a região da API e a do banco | P1 | PERF-01 | Comparação controlada de regiões, sem mover banco ou aumentar plano | [Região](../specs/otimizacao-carregamento/05-regiao.md) |
| PERF-06 | Controlar inicializações, estáticos e orçamento de conexões | P0 | PERF-01 | Explicar ciclo das instâncias; evitar saturação no ensaio de concorrência | [Container e conexões](../specs/otimizacao-carregamento/06-container-conexoes.md) |
| PERF-07 | Investigar índices somente com evidência | P2, condicional | PERF-01 e PERF-03 | Planos/medições justificam mudanças ou decisão de não alterar índices | [Índices](../specs/otimizacao-carregamento/07-indices.md) |
| PERF-08 | Validar desempenho e publicar a versão aprovada | P0, fechamento | PERF-02 a PERF-06; decisão registrada de PERF-07 | Comparativo antes/depois, testes dos dois modelos e Preview validado | [Aceite e publicação](../specs/otimizacao-carregamento/08-aceite-publicacao.md) |

PERF-01: **implementada e publicada com o release SGI, desligada por padrão; baseline global e aceite pendentes**. PERF-02 e PERF-03A: **autorizadas e implementadas localmente em 24/11/2026**; [validação e limites](../specs/otimizacao-carregamento/10-validacao-local.md). As demais tasks aguardam refinamento/validação. Nenhuma otimização deste lote foi publicada.

## Sequência sugerida

Refinamento de 24/11/2026: priorizar **PERF-03A — contagens de ativos em lote na tela Locais** e **PERF-02 — coordenação/invalidação da sincronização**, investigando PERF-06 em paralelo conceitual. Acrescentar consistência das gravações e classificação dos 403 de Storage. Critérios e limites em [diagnóstico E2E](../specs/otimizacao-carregamento/09-diagnostico-e2e-sgi.md). Nenhuma dessas correções está implementada ou validada por este registro. A instrumentação PERF-01 acompanha o release SGI; o aceite de desempenho permanece pendente.

1. Validar PERF-01 e o protocolo de medição; obter baseline local e do Preview.
2. Executar PERF-02, PERF-03 e PERF-06 por mudanças pequenas, medindo cada uma. PERF-06 pode antecipar os demais se houver saturação ativa.
3. Executar PERF-04 com os contratos de leitura definidos.
4. Executar o ensaio de região de PERF-05 isoladamente, para separar o ganho de infraestrutura do ganho de código.
5. Decidir PERF-07 com base nas consultas que ainda estiverem lentas.
6. Fechar PERF-08: testes locais primeiro; Git e Preview depois; conferir o deploy exato entregue.

As dependências representam prontidão técnica, não autorização automática. Trabalho independente pode ser sequenciado em outra ordem se a decisão for registrada; não há autorização para agentes paralelos.

## Lote refinado para validação — 24/11/2026

1. Registrar baseline local reproduzível do recorte, incluindo Locais e navegação sem interação.
2. Implementar PERF-03A localmente: OpenAPI, rota agregada, promessa compartilhada e tabela.
3. Implementar PERF-02 localmente: coordenador, envelope SSE compatível, invalidação por domínio e recuperação conservadora.
4. Testar contrato/RLS, concorrência de leituras, ambas as PTs elétricas e ausência de regressão; comparar antes/depois.
5. Apresentar evidências para revisão; Git/Vercel ficam para publicação explicitamente autorizada.

O responsável autorizou as duas implementações (“pode seguir com as duas implementações”). Código e testes locais foram concluídos no recorte; publicação e validação integrada na composição Docker atual continuam pendentes. A meta global de 12 chamadas/32 s continua pendente: manter o fallback atual é requisito de integridade neste recorte. Defeitos de gravação, devolução delegada e recusas de Storage seguem como itens separados.

## Checklist de acompanhamento por task

- [ ] Spec refinada e validada pelo responsável, com data e referência da decisão.
- [ ] Implementação local dentro do escopo validado.
- [ ] Testes funcionais e de segurança aplicáveis aprovados.
- [ ] Medições comparáveis antes/depois anexadas, com limitações.
- [ ] Documentação e plano de reversão atualizados.
- [ ] Publicação autorizada para a entrega, quando aplicável.
- [ ] Git publicado e Preview conferido, quando aplicável; Production preservada.

Não marcar uma task concluída apenas porque não houve HTTP 5xx. Desempenho, atualização dos dados e integridade fazem parte do aceite.
