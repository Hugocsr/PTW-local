# PERF-06 — ciclo das instâncias, estáticos e conexões

Estado: **proposta, aguardando validação**. Prioridade P0. Dependência: PERF-01.

## Problema

A auditoria mostrou 123 inícios em 25 minutos, incluindo testes. Cada instância de Preview prepara LDAP/certificado, API e proxy. Conteúdo estático passa pelo Container. Houve erro transitório de limite do papel `ptw_api`, mesmo após separar consultas transacionais de LISTEN.

## Escopo e contrato proposto

1. Correlacionar instância/prontidão com chamadas de API e estáticos; distinguir escala normal, deploy, desligamento e falha real. Não chamar todo evento de início de crash.
2. Medir etapas de partida e avaliar se estáticos podem ser servidos pela infraestrutura apropriada sem iniciar dependências de banco/LDAP. Refinar a arquitetura concreta após a medição, preservando CSP, tema e SPA/deep links.
3. Recursos com hash podem ter cache imutável se o contrato de entrega permitir; HTML/tema ativo precisam de atualização correta. API, sessão, anexos e conteúdo protegido nunca entram em cache público.
4. Dimensionar orçamento de conexões considerando instâncias simultâneas, consulta transacional, backend do pooler, sessões LISTEN, deploy antigo/novo e reserva operacional. Quatro conexões por instância não são garantia de teto global.
5. Manter consultas no pool transacional sem prepared statements e LISTEN separado, sob demanda e liberado sem assinantes; não aumentar limites como correção automática.
6. Validar fechamento e retomada do stream, falha de LISTEN e ausência de assinantes. Não desativar auditoria, expiração ou LDAP para reduzir partidas.
7. Definir no refinamento um limite/budget de concorrência compatível com o plano. Se a plataforma não oferecer controle suficiente, registrar alternativa e custo; não prometer eliminação de saturação sem prova.

## Critérios de aceite

- AC01: relatório explica inicializações observadas por cenário e separa o tempo de partida do tempo da requisição aquecida.
- AC02: orçamento documenta limite real de papel, pooler e plataforma, com reserva e coexistência de deploys. Nenhuma alteração de limite/plano nesta task.
- AC03: zero `53300`, `EMAXCONNSESSION` e falha de checkout por limite no ensaio controlado de quatro sessões por dez minutos, com abertura/reload e encerramento respeitando limites de login.
- AC04: com todas as abas do ensaio fechadas, recursos dedicados LISTEN retornam ao baseline em até dez segundos, meta proposta; conexões internas ociosas do Supavisor são medidas separadamente e não contadas como vazamento do cliente.
- AC05: falha de conexão resulta em recusa segura, sem escrita parcial; recuperação restaura sincronização sem novo privilégio ou nova credencial no cliente.
- AC06: se entrega de estáticos mudar, comprovar atualização após deploy, manutenção do tema, deep links, cabeçalhos e ausência de cache público de dados protegidos.

## Testes e evidências

Testes locais do ciclo de EventHub/driver e encerramento durante conexão pendente; integração com banco/LDAP local. No Preview: uma/quatro sessões, reconexão, logout, assets e duas revisões compatíveis durante troca. Coletar delta dos logs Supavisor e contagem de backend/cliente com timestamps. Usar ambiente/dados de teste; não provocar saturação intencional no banco compartilhado.

## Reversão e fora de escopo

Restaurar estratégia de entrega/configuração anterior e observar o encerramento das instâncias antigas. Nenhuma reversão apaga auditoria. O padrão do Docker local permanece preservado; mudar sua topologia exigiria aditivo próprio.

## Decisões para refinamento

Validar arquitetura candidata dos estáticos, controle de concorrência suportado e orçamento global antes de implementar. Mudança de serviço de autenticação ou hospedagem de backend fica fora desta proposta.
