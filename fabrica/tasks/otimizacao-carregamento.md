# Tasks — otimização do carregamento

Estado do programa: **em refinamento**. Criado em 18/11/2026. PERF-01 foi validada pelo responsável na conversa (“execute a task 1”) e está em implementação/validação local; demais tasks aguardam validação.

Objetivo: reduzir o tempo para entrar e navegar no PTW-SGI, preservando os controles das PTs e os dados locais/hospedados.

Referência: [spec do programa](../specs/otimizacao-carregamento/README.md). Cada task tem sua própria spec e só avança depois da validação do responsável pelo produto.

| ID | Task | Prioridade | Dependências | Entrega e aceite principal | Spec |
|---|---|---|---|---|---|
| PERF-01 | Medir carga inicial, rede, consultas e filas | P0 | Nenhuma | Baseline reproduzível; tempos separados e logs sem dados sensíveis | [Instrumentação](../specs/otimizacao-carregamento/01-instrumentacao.md) |
| PERF-02 | Consolidar sincronização e atualizações de fundo | P0 | PERF-01 | Uma atualização por sessão em andamento; menos chamadas sem perder eventos | [Sincronização](../specs/otimizacao-carregamento/02-sincronizacao.md) |
| PERF-03 | Reduzir viagens ao banco nas leituras | P0 | PERF-01 | Menos consultas sequenciais, com isolamento e autenticação preservados | [Leituras da API](../specs/otimizacao-carregamento/03-leituras-api.md) |
| PERF-04 | Reduzir o que bloqueia a abertura das telas | P0 | PERF-01, PERF-02 e PERF-03 | Minha área abre com os dados necessários; dados complementares sob demanda | [Carga inicial](../specs/otimizacao-carregamento/04-carga-inicial.md) |
| PERF-05 | Aproximar a região da API e a do banco | P1 | PERF-01 | Comparação controlada de regiões, sem mover banco ou aumentar plano | [Região](../specs/otimizacao-carregamento/05-regiao.md) |
| PERF-06 | Controlar inicializações, estáticos e orçamento de conexões | P0 | PERF-01 | Explicar ciclo das instâncias; evitar saturação no ensaio de concorrência | [Container e conexões](../specs/otimizacao-carregamento/06-container-conexoes.md) |
| PERF-07 | Investigar índices somente com evidência | P2, condicional | PERF-01 e PERF-03 | Planos/medições justificam mudanças ou decisão de não alterar índices | [Índices](../specs/otimizacao-carregamento/07-indices.md) |
| PERF-08 | Validar desempenho e publicar a versão aprovada | P0, fechamento | PERF-02 a PERF-06; decisão registrada de PERF-07 | Comparativo antes/depois, testes dos dois modelos e Preview validado | [Aceite e publicação](../specs/otimizacao-carregamento/08-aceite-publicacao.md) |

PERF-01: **validada; implementação local em validação**. PERF-02 a PERF-08: **aguardando refinamento/validação da spec**, sem implementação iniciada. Nenhuma publicação das otimizações foi realizada.

## Sequência sugerida

1. Validar PERF-01 e o protocolo de medição; obter baseline local e do Preview.
2. Executar PERF-02, PERF-03 e PERF-06 por mudanças pequenas, medindo cada uma. PERF-06 pode antecipar os demais se houver saturação ativa.
3. Executar PERF-04 com os contratos de leitura definidos.
4. Executar o ensaio de região de PERF-05 isoladamente, para separar o ganho de infraestrutura do ganho de código.
5. Decidir PERF-07 com base nas consultas que ainda estiverem lentas.
6. Fechar PERF-08: testes locais primeiro; Git e Preview depois; conferir o deploy exato entregue.

As dependências representam prontidão técnica, não autorização automática. Trabalho independente pode ser sequenciado em outra ordem se a decisão for registrada; não há autorização para agentes paralelos.

## Checklist de acompanhamento por task

- [ ] Spec refinada e validada pelo responsável, com data e referência da decisão.
- [ ] Implementação local dentro do escopo validado.
- [ ] Testes funcionais e de segurança aplicáveis aprovados.
- [ ] Medições comparáveis antes/depois anexadas, com limitações.
- [ ] Documentação e plano de reversão atualizados.
- [ ] Publicação autorizada para a entrega, quando aplicável.
- [ ] Git publicado e Preview conferido, quando aplicável; Production preservada.

Não marcar uma task concluída apenas porque não houve HTTP 5xx. Desempenho, atualização dos dados e integridade fazem parte do aceite.
