# PERF-03A e PERF-02 — implementação e validação local

Data: 24/11/2026. Autorização do responsável: “pode seguir com as duas implementações”. Estado: implementadas localmente; publicação e aceite global de desempenho pendentes.

## O que mudou

- Locais lê as contagens dos IDs visíveis em um lote autenticado, com limite de 100. Conta ativos distintos no local e descendentes, incluindo inativos como a consulta anterior. ID externo/inexistente recusa o lote inteiro. Erro não vira zero.
- Consultas iguais compartilham promessa/resultado por geração, unidade e sessão. Logout/troca de identidade limpa os caches. Resultados antigos não repõem uma geração nova.
- Timer e SSE passam por um coordenador por sessão/unidade. Uma rodada em andamento e um conjunto pendente de domínios substituem execuções sobrepostas e filas por evento.
- O aviso do banco acrescenta domains sem remover seq/permit. Avisos de acesso e início/parada de API permanecem na trilha e no stream, mas não recarregam cadastros/PTs. Ações desconhecidas e payloads legados recuperam amplamente.
- Reconexão do stream ou retorno da rede provoca recuperação ampla, inclusive se havia uma falha aguardando retry. Eventos comuns durante falha respeitam o fallback, sem tentativas contínuas.
- Polling de disponibilidade de 5 s, fallback de 30 s, autenticação do stream e expirações foram preservados. Nenhum pool, plano, região ou regra de assinatura foi alterado.
- Leituras de outra sessão são descartadas; uma PT recebida com rowVersion inferior não substitui a mais recente. Isso não implementa o backlog de serialização de gravações ou a correção de devolução delegada/PTW29.

## Comparação controlada da tela Locais

Frontend anterior extraído de HEAD (`84a5a9a3af403a84cc40dff8f2a15a75737fc3c4`) e frontend novo, ambos sobre a mesma API/PostgreSQL nativo locais. Fixtures: 100 locais, 40 ativos, página de 25. Uma passagem de aquecimento descartada e 20 amostras de reload autenticado por versão. A medição exige a tabela e todas as contagens preenchidas; não termina no cabeçalho.

| Medida | Antes | Depois |
|---|---:|---:|
| Buscas de ativos por abertura | 100 | 0 |
| Chamadas de contagens em lote | 0 | 1 |
| Mediana até tabela/contagens úteis | 1.585 ms | 1.059 ms |
| p95 até tabela/contagens úteis | 1.751 ms | 1.094 ms |

Redução aproximada: 99% das chamadas destinadas a obter contagens, 33% na mediana e 38% no p95 deste cenário. O cabeçalho, autenticação e restante do bootstrap ainda têm seus próprios custos. São resultados de desenvolvimento em loopback, com dataset pequeno e modelos/PTs vazios; não representam Vercel, cold start de Container, volume enterprise ou SLA.

Uma observação sem interação de 32 s no Quadro permaneceu em **19 chamadas antes/depois**. Não foi reduzida a frequência de disponibilidade nem removido o mecanismo atual de totais/exclusões. A meta global de 12 chamadas/32 s continua aberta para os próximos recortes.

Em uma rajada controlada de dez avisos fictícios de ciclo de servidor, gravados somente no banco descartável: o frontend anterior fez **13 recargas de dados**; o novo fez **zero**, mantendo `/status`. Isso demonstra a redução por classificação de eventos, não uma solução para a frequência de inicializações da infraestrutura (PERF-06).

## Verificações funcionais

| Verificação | Resultado |
|---|---|
| RLS real como papel da API, lote com ID de outra unidade/inexistente | 404 genérico, sem resultado parcial |
| Descendentes, ativo ligado a dois filhos, inativo, local vazio | Totais equivalentes à listagem anterior, sem duplicação no ancestral |
| IDs inválidos, repetidos, lote vazio/excessivo e falta de sessão | Recusas conforme contrato |
| Páginas de 25, 50 e 100 locais | Um lote para os IDs visíveis; nenhuma busca de ativos por linha |
| Rajada de 100 eventos, evento durante rodada e falha em voo | Sem execução concorrente; pendências preservadas e retry limitado |
| Promessa compartilhada, falha, limpeza de cache e geração nova | Sem contaminação por resultado antigo; erro permite retry |
| Remoção de cadastro e divergência do total | Coleção recuperada integralmente e registro removido do cache |
| Quatro sessões reais de navegador com API/PostgreSQL locais | Alteração de ativo convergiu nas quatro em aproximadamente 360 ms nesta reprodução |
| Queda de rede/reconexão | Alteração perdida recuperada em aproximadamente 300 ms após retorno nesta reprodução |
| Resposta 503 simulada na consulta de contagens | “Não disponível”; consulta posterior recuperou sem apresentar zero como sucesso |
| Telas em 390, 768, 1024 e 1440 px | Capturas inspecionadas; sem rolagem horizontal ou erro JavaScript no ensaio |
| Esquema e invariantes no PostgreSQL 18.4 nativo | 643 verificações passaram, incluindo controles elétricos versionados e auditoria |
| API com PostgreSQL real | 152 testes passaram em base, cadastro, PTs e modelos, incluindo NOTIFY/SSE |

`check.sh` e a checagem final `check.sh app` terminaram sem erros: **419 testes do frontend, 161 da API e sete scripts auxiliares passaram**. No check sem infraestrutura, 39 testes da API foram omitidos pelo runner; a suíte nativa separada executou os 152 casos dos quatro arquivos indicados. Os builds de frontend e API também passaram. Não somar os números das suítes de API, pois há sobreposição.

Os testes que exigem LDAP/S3/Docker não são considerados aprovados por execução sem esses serviços. O fluxo completo de navegador dos dois modelos Actemium não foi repetido neste laboratório: os controles elétricos foram conferidos pelos invariantes de banco; o ciclo genérico de PT e os modelos, pela suíte nativa da API. Repetir os dois ciclos integrados na composição Docker antes de autorizar publicação. O acesso ao pipe do Docker pela conta do agente foi negado; por isso a validação de banco desta rodada usou uma instância nativa separada, encerrada ao terminar.

## Evidências e reprodução

Scratchpad da sessão, fora do repositório: `outputs/perf-local/`.

- `browser-results.json`: 20 amostras por versão e contagens de chamadas.
- `browser-extra-results.json`: quatro sessões, paginação, falha/recuperação e reconexão. A seção idle desse primeiro ensaio coincidiu com edição/HMR; foi substituída pelo ensaio dedicado abaixo.
- `idle-sse-results.json`: janela dedicada sem edição do produto; 19/19 chamadas e rajada de avisos 13/0.
- `locais-{390,768,1024,1440}.png`: conferência visual.
- `native-invariants.log`, `api-native-final.log`, `check-final.log`, `check-app-final.log`, `frontend-build.log`: verificações e builds.
- Scripts locais de laboratório/medição no mesmo diretório; credenciais de teste não entram no Git. O PostgreSQL é descartável, em loopback/porta 55439, com papéis próprios. A instalação Docker original não foi alterada.

## Publicação futura e reversão

Nenhum push, deploy, atualização do Supabase ou ativação no Docker atual foi executado nesta entrega. Para publicar depois da validação integrada: preservar backup/seleção atual; disponibilizar a nova API antes do frontend; atualizar a função canônica audit_notify por procedimento de operação aprovado, preservando dados e cadeia. Não escrever migração nem resetar a instalação existente.

O cliente novo aceita avisos antigos sem domains e usa fallback amplo. Isso mantém convergência caso a função ainda não tenha sido atualizada, mas não entrega a redução de recargas por classificação até o envelope novo estar ativo. Cliente antigo ignora o campo adicional. Reversão do par API/frontend e da função deve usar a seleção/backup anterior e preservar registros; o modelo de dados e a forma de hash não foram alterados.

Continuam pendentes: meta global de chamadas, desempenho na Vercel, baseline de login com dados representativos, ensaio de escala, controles de Container/conexões, Storage 403 e o defeito funcional PTW29. Esta entrega não fecha o programa PERF-01 a PERF-08 inteiro.
