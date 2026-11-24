# Spec do programa — otimização do carregamento

Estado: **execução por recortes**. Criada em 18/11/2026; atualizada em 24/11/2026. PERF-01 e o lote PERF-02/PERF-03A foram autorizados pelo responsável pelo produto; demais recortes e aceite global continuam pendentes.

[Backlog e sequência de execução](../../tasks/otimizacao-carregamento.md).

## Problema e resultado desejado

Entrar e recarregar a aplicação exigem várias chamadas e viagens sequenciais ao banco. O objetivo é apresentar telas úteis mais rapidamente e reduzir trabalho repetido, sem mostrar liberação de trabalho baseada em dados incompletos ou desatualizados.

## Evidência de partida

Atualização: [diagnóstico E2E do SGI em 24/11/2026](09-diagnostico-e2e-sgi.md). Inclui repetição de consultas em Locais, sincronização, ciclo das instâncias e consistência das gravações. PERF-01 está presente no release SGI, desativada por padrão; isso não conclui a baseline repetida nem autoriza implementar as demais tasks.

Diagnóstico de 18/11/2026, commit `4857d82f411cdd92013c61e99016fbf9fb8ec9e7`, deploy `dpl_9xQfdDNA2Pz6EBVQKKbRiLwuugWP`:

| Indicador | Observação | Limite |
|---|---:|---|
| Login até Minha área | 6,19 s | Uma reprodução de navegador, não uma distribuição |
| Reload autenticado | 7,63 s | Mesma reprodução |
| API mediana / p95 | 841 / 1.472 ms | 145 respostas na janela de logs de 25 minutos |
| Modelos no navegador, login / reload | 2,43 / 2,66 s | Inclui rede/proxy |
| Chamadas sem interação | 26 em 32 s | Tela Quadro de PTs |
| Regiões | Vercel `iad1`; Supabase `us-west-2` | Configuração observada, reconferir no ensaio |
| Inicializações / paradas | 123 / 107 em 25 min | Período incluindo testes; não é taxa de uso normal |
| Erros de limite de conexões | Episódio 19h51min35s–19h52min11s | Mensagens duplicadas de cliente/servidor; não equivalem a ações únicas |

O PostgreSQL executou consultas comuns em poucos milissegundos nas estatísticas cumulativas; os tempos não são exclusivos da janela do ensaio. Rede, espera por conexão e inicialização ainda precisam ser separados pela instrumentação. Ausência de erro não comprova rapidez.

Evidências completas estão no scratchpad da entrega: `outputs/release-nr10-2026-11-18/diagnostico-lentidao.md`, `performance-vercel.json` e `performance-browser.json`. Não copiar arquivos de ambiente, backups ou credenciais para o Git. Os caminhos são referências de evidência local, não dependências de execução do projeto.

## Metas propostas para validação

| Indicador | Meta proposta para ambiente aquecido |
|---|---|
| Login até Minha área útil | Mediana ≤ 3 s; p95 ≤ 5 s |
| Reload até Minha área útil | Mediana ≤ 3 s; p95 ≤ 5 s |
| Leituras representativas da API | p95 ≤ 800 ms, separado por endpoint e tamanho da resposta |
| Trabalho em fundo | ≤ 12 chamadas de API em 32 s sem interação, mesmo cenário do baseline |
| Sincronização por sessão | No máximo uma execução em andamento, sem perder atualização recebida durante ela |
| Concorrência | Zero erros 5xx e de limite de conexão no ensaio controlado de quatro sessões |

Essas metas são **propostas**, não ganhos prometidos nem SLAs contratados. PERF-01 produzirá a baseline repetida. Se ela mostrar inviabilidade, o responsável refina/valida a meta antes da implementação que dela depende; não reduzir metas silenciosamente para declarar aceite.

Minha área útil significa: identidade e permissões atuais conferidas, lista/estado das PTs necessárias carregados, versões necessárias disponíveis e ações coerentes com a resposta do servidor. Um cabeçalho ou esqueleto visível não encerra a medição.

## Invariantes obrigatórias

- Conferência atual de conta/sessão no servidor; logout, expiração e revogação continuam efetivos. Não usar cache de autorização para acelerar leituras.
- TLS verificado, RLS, segregação por unidade/pessoa e auditoria preservados. Nunca expor credenciais nos logs ou no cliente.
- Trabalho liberado depende das regras atuais do núcleo/banco; dados incompletos não autorizam ação.
- Indisponibilidade continua bloqueando gravações, com Parar preservado conforme o comportamento existente. Não afrouxar a detecção atual como atalho de desempenho.
- Turno, revalidação, novo aceite, assinaturas separadas, isolamento, anexos e expiração das PTs permanecem válidos nos dois modelos.
- Nenhum reset do Supabase, perda de evidência, alteração de PT encerrada ou promoção para Production.
- Não aumentar plano, contratar serviço ou elevar limite de conexões sem escopo específico validado.
- Mudanças locais e testes locais precedem Git/Preview. Região/cold start só podem ter seu aceite específico completado no ambiente hospedado, depois do ensaio funcional local.

## Fluxo spec driven

Para cada task: proposta → refinamento → validação explícita do responsável → implementação local → testes locais → revisão das evidências → publicação autorizada em Git/Preview → aceite no deploy exato. A criação destes documentos não valida nenhuma task.

As alterações futuras de contrato começam em `openapi.yaml`; decisões que exigirem mudar o contrato desta spec voltam ao refinamento. Preservar a aplicação/infraestrutura atual até haver implementação testada e plano de reversão.

## Specs filhas

[Implementação e validação local de PERF-03A/PERF-02 — 24/11/2026](10-validacao-local.md). As duas implementações foram autorizadas pelo responsável; a publicação e o aceite global continuam pendentes.

1. [PERF-01 — instrumentação](01-instrumentacao.md)
2. [PERF-02 — sincronização](02-sincronizacao.md)
3. [PERF-03 — leituras da API](03-leituras-api.md)
   - [PERF-03A — contagens de ativos por página de locais](03a-contagens-locais.md), primeiro recorte refinado em 24/11/2026.
4. [PERF-04 — carga inicial](04-carga-inicial.md)
5. [PERF-05 — região](05-regiao.md)
6. [PERF-06 — Container e conexões](06-container-conexoes.md)
7. [PERF-07 — índices](07-indices.md)
8. [PERF-08 — aceite e publicação](08-aceite-publicacao.md)
