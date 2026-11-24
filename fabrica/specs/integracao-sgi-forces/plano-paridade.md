# Plano de execução — completar a integração funcional

Estado: **proposta para validação**, 23/11/2026. Não implementado nesta tarefa. [Inventário completo](paridade-funcional.md). O plano detalha o backlog SGI existente, mantendo seus IDs; os sufixos abaixo representam partes da mesma task, não um segundo backlog concorrente.

## Resultado e estratégia

Entregar as capacidades dos dois HTMLs em uma única aplicação, com Operação/Administração, persistência, autorização e auditoria reais. Priorizar **identidade visual e delegações**, explicitamente destacadas pelo responsável. A entrega anterior de visual/navegação permanece preservada.

Cada lote segue: spec → refinamento → validação pelo responsável → implementação → testes locais/Docker → demonstração → autorização de publicação → Git/Preview. Criar este plano não equivale a validar todas as decisões. Publicação continua separada da execução local.

## Sequência proposta

| Ordem | Lote / tasks existentes | Entrega concreta | Dependências principais | Porte relativo |
|---|---|---|---|---|
| 0 | Fechar gate inicial — SGI-14; tratar SGI-15 por aditivo | Completar dois ciclos de PT no Docker, anexos reais, auditoria e baseline; registrar estado anterior e reversão | Docker atual funcional, três perfis e modelos existentes | Médio |
| 1 | Navegação unificada — SGI-16 | Menu lateral único por perfil, sem toggle Operação/Administração | Matriz de leitura/gestão e organização visual validadas | Pequeno/médio |
| 2 | Identidade visual — SGI-11A | Administração → Identidade visual: logo/símbolo, nome, presets, prévia, salvar/restaurar e persistência | Tema atual + contrato de configuração/upload aprovado | Médio |
| 3 | Governança mínima — SGI-07A/B/C | Pessoas/perfis funcionais, grupos/membros e alçadas nomeadas reutilizando etapas/slots existentes | Cargos/escopos atuais e decisões de autorização/versionamento | Grande |
| 4 | Delegações — SGI-08 | Criar, consultar, revogar e usar delegação em slots explicitamente delegáveis, com autoria real | Lote 3 e spec de delegação validada | Grande |
| 5 | Ativos e importações — SGI-04A/B/C | Árvore integrada, ficha empresarial/SAP e carga Excel/CSV de cadastros | Estruturas atuais; mapeamento de campos/chaves/duplicatas aprovado | Grande |
| 6 | Proteções/intertravamentos — SGI-05 | Cadastro especializado, protegidos N:M, bypass e checklists de restabelecimento | Lote 5; processo técnico revisado; classe padrão só quando lote 7 disponível | Grande |
| 7 | Tipos, risco, SLA e biblioteca — SGI-06A/B/C | Tipos de PT, classes, prazos distintos, banco de perguntas e checklists associados | Versionamento atual; ligação com alçadas do lote 3 e ativos do lote 5 | Grande |
| 8 | Jornada guiada — SGI-03A/B | Nova PT em etapas e checklist guiado, com salvar/retomar/revisar e fluxo real | Atos atuais; conectar recursos dos lotes 3/5/6/7 conforme cada modelo | Médio/grande |
| 9 | Avisos — SGI-10A/B/C | Inbox persistente, catálogo/destinatários/canais; e-mail com entrega/teste reais | Eventos das capacidades já entregues; provedor de e-mail apenas após decisão | Grande |
| 10 | Painéis — SGI-02B | Dashboard administrativo e indicadores operacionais por tipo/risco/prazo | Domínios e métricas definidos nos lotes anteriores; consultas agregadas | Médio |
| 11 | Idiomas — SGI-11B | pt-BR/EN/ES completos, preferência persistente e formatação consistente | Catálogo de textos e terminologia dos fluxos consolidados | Médio/grande |
| 12 | Múltiplas plantas — SGI-09 | Vínculos por unidade, contexto de sessão, seletor e consolidação autorizada | Contrato de isolamento; revisar grupos/delegações/arquivos/avisos por unidade | Grande |
| 13 | SSO e JIT — SGI-12A/B | Provedor federado real, associação segura, provisionamento e revogação | Provedor escolhido, política de acesso e rede; LDAP preservado | Grande + integração externa |
| 14 | Organização/licença e PDF — SGI-13A/B | Dados reais da organização/contrato; consumo/limites/validade; comprovante PDF preservado | Modelo comercial validado; armazenamento e snapshot/auditoria para PDF | Médio/grande |
| 15 | Recursos condicionados — SGI-13C/D/E/F; aditivo de retenção | Ditado, IA de fotos, PIN, biometria e eventual editor de retenção com controles próprios | Decisões explícitas de produto, segurança, operação/custo e regras existentes | A dimensionar por aditivo |

O porte expressa esforço relativo, não prazo fechado. Datas e estimativas em dias só depois de refinar contratos e critérios dos lotes. Na primeira implementação de grupos/delegações, o escopo é a unidade atual; o lote 12 estende essa capacidade com autorização entre unidades. Não exibir seletor multi-planta antes disso.

## Decomposição e aceite por capacidade

### SGI-16 — Menu lateral único por perfil

- Remover o seletor de área do cabeçalho e do drawer; reunir destinos autorizados em grupos do mesmo menu.
- Derivar visibilidade da sessão/grants e consultas permitidas, sem regras por nome de pessoa. Preservar links de referência, URLs, cargos e autorização da API.
- Aceite: Marina vê seus destinos operacionais/administrativos simultaneamente; Rafael/Paulo veem operação e consultas permitidas, sem links de gestão/Auditoria; busca global/deep links e mobile seguem a mesma política. Sem novos pedidos ao backend.
- [Spec para refinamento/validação](menu-lateral-por-perfil.md). Implementar antes de SGI-11A.

### SGI-11A — Identidade visual (G01/G02)

- Tela, preview local, logo/símbolo, paletas, nome/sigla e reset do tema. Fonte configurada existente continua válida; novas fontes/imagem de fundo dependem de formato/limites definidos.
- Configuração persistente, versionada, permissão e auditoria; uploads reais com validação. Compatibilidade com `/tema/tema.json` atual.
- Aceite: Marina salva; outra sessão/reload vê a marca; Rafael/Paulo não alteram por chamada direta; conflito de edição e falha no upload não produzem sucesso falso; contraste e cores de estado preservados.
- [Spec inicial para refinamento](identidade-visual.md).

### SGI-07A/B/C — Pessoas, grupos e alçadas (G17/G18/G19)

- A: integrar o cadastro atual de pessoas a uma visão de perfis funcionais, conta/situação/validade e escopo; não converter grant LDAP em cargo técnico.
- B: grupos com nome, finalidade, membros, escopo e situação, mantendo histórico de adesão e permissões de gestão.
- C: alçadas com nome/revisão, níveis, ordem e participantes; expansão em Stage/SignSlot, sequencial entre etapas e paralela nos slots. Mostrar por que uma pessoa é elegível ou não. Composição manual não pode retirar exigências de modelo ativo.
- Aceite: grupo sem cargo válido não habilita assinatura; alterar/inativar grupo/alçada não reescreve PT em curso ou encerrada; montagem sequencial/paralela persiste; recusas são auditadas.
- Refinar antes do código: governança de membros, quem publica alçadas, instante de congelamento e política de substituição. **SGI-06 deixa de ser dependência obrigatória de toda SGI-07**: o mínimo usa modelos/cargos atuais; SLA e classes são integrados no lote 7.

### SGI-08 — Delegações (G20)

- Delegante, delegado, período com fuso, motivo e escopo explícito. Estados calculados/agendados, vigência e revogação preservam histórico; não apagar uma delegação usada.
- Apenas slots marcados como delegáveis na versão aprovada. Delegado mantém identidade própria e precisa cumprir os cargos/escopos/validade exigidos; a delegação não cria habilitação.
- Aceite: uso permitido e recusado nos limites de tempo/escopo; revogação imediata; sem auto-delegação, cadeia/ciclo, acúmulo de dupla assinatura ou mudança retroativa de autoria. Revalidação que exige o emitente original continua exigindo essa pessoa.
- [Spec inicial para refinamento](delegacoes.md).

### SGI-04A/B/C — Ativos, ficha e planilhas (G08/G09/G11)

- A: árvore e ficha integradas sobre Unit/Location/Asset/Parte de; incluir os locais existentes do cenário Actemium sem duplicar cadastros.
- B: dicionário dos identificadores/campos empresariais do inventário, opcionalidade, domínio e unicidade; identificar o que é cadastro manual e o que seria futura integração ERP.
- C: templates e importador real de locais/ativos/pessoas; plantas só após SGI-09 permitir sua gestão. Download do modelo, análise, prévia, validação por linha, detecção de duplicatas e confirmação transacional. Preservar zeros à esquerda em códigos SAP e neutralizar fórmulas perigosas nas exportações.
- Aceite: refazer a importação não duplica; falha não deixa carga parcial indevida; relações inválidas/ciclos/mistura de unidades são recusados; histórico e trava de equipamento preservados.

### SGI-05 — Proteções (G10 e parte de G16)

- Tipo/princípio de ação, sistema de controle, classe padrão, método de bypass e equipamentos protegidos N:M. Preservar a relação Parte de com sua regra própria.
- Associar evidências/checklists de ativação do bypass, retorno e teste funcional. Situação operacional é distinta da situação cadastral e do estado da PT.
- Aceite: vínculo e histórico corretos; apenas proteções compatíveis/ativas podem ser escolhidas quando exigidas; nenhum switch decorativo declara proteção fisicamente restabelecida ou trabalho liberado.

### SGI-06A/B/C — Tipos, risco e biblioteca (G12/G13/G14/G15/G16)

- A: catálogo de tipos de permissão, referência/descrição, situação e vínculo com modelos; seis exigências do HTML devem corresponder a verificações reais da versão.
- B: classes, política de duração operacional e SLA de aprovação separados. Definir início/pausa/fim do relógio, unidade/fuso e evento de atraso. Prazo comercial/gerencial não aumenta validade/turno nem autoriza trabalho.
- C: biblioteca de perguntas, revisões e checklists por ação/tipo/local/ativo, com origem e uso rastreado. Atualizar biblioteca não troca perguntas de PT antiga.
- Aceite: tipo sem requisitos completos não é ativado; ativos/modelos existentes continuam utilizáveis; histórico conserva versão/classe/exigências; obrigação não é contornada pelo solicitante.

### SGI-03A/B — Jornada operacional (G06/G07)

- Assistente de solicitação: modelo/tipo → local/ativos/proteção → serviço/janela/equipe → formulário/evidências → revisão. Adaptar ordem/etapas ao modelo, sem impor ausência de campos ou alçada manual ao fluxo atual.
- Checklist guiado com navegação, resumo, retorno e indicação inequívoca de o que falta; captura real de fotos/anexos atual reutilizada.
- Aceite: rascunho parcial pode ser salvo quando a regra atual permite; recarga/outro usuário recuperam o mesmo registro; envio/assinatura recusam obrigatórias, impeditivas, cargo, conflito, documento ou turno inválido; etapa futura não é pulada.

### SGI-10A/B/C — Notificações (G24/G25)

- A: eventos/outbox e caixa In-App com contador, leitura e deep link. B: catálogo, perfis/grupos destinatários e preferências auditadas. C: e-mail com provedor, fila/retries, teste e resultado de entrega.
- Rastrear as 32 referências do catálogo do protótipo; mapear às ações/estados canônicos e marcar eventos dependentes ou não aplicáveis, em vez de inventar transições.
- Aceite: evento não é perdido nem duplicado em retry; alerta não vaza PT entre usuários/unidades; usuário revogado perde acesso; erro de provedor não vira “enviado”; falha de e-mail não impede Parar/Entrega.

### SGI-02B / SGI-11B — Painéis e idiomas (G03/G04/G05)

- Painéis: definição de cada indicador, período, universo e permissão, filtros equivalentes e estados sem dados/erro. Sem contagem “0” enquanto não carregou.
- Idiomas: catálogo integral das telas/erros, preferência e fallback; instantes preservam o fuso da unidade. Conteúdo técnico original/modelos ativos não são traduzidos silenciosamente.
- Aceite: total do card bate com a lista correspondente; uma/quatro sessões sem novas consultas por card; três idiomas cobrem jornadas e acessibilidade sem texto cortado nas quatro larguras.

### SGI-09 / SGI-12A/B — Unidades e identidade (G21/G22/G23)

- Múltiplas plantas: autorização por unidade na API/DB, troca de contexto/sessão, isolamento de cadastros/PT/anexos/avisos/busca e visão consolidada autorizada. Grupo/delegação não autoriza outra unidade por consequência.
- SSO: escolher um protocolo/provedor para o primeiro adaptador, configurar identidade/verificação e política de sessão/revogação. Não prometer simultaneamente SAML/OIDC/Entra sem implementação específica.
- JIT: associar por emissor/sujeito/tenant verificados, aprovação e permissões mínimas; evitar duplicação de pessoa e tomada de conta por e-mail.
- Aceite: trocar `unitId`/URL não dá acesso; host/provedor indisponível tem comportamento definido; LDAP local continua funcional; pessoa desligada deixa de operar; associação de identidade e recusas auditadas.

### SGI-13A/B/C/D/E/F — Complementos (G26–G32)

- A: separar dados institucionais de licença comercial; consumo vem de consulta real. Origem/edição, validade, alertas e política de expiração precisam de decisão do responsável. Nenhum bloqueio comercial novo pode impedir parar ou devolver uma área.
- B: PDF canônico do snapshot da PT, arquivos preservados, hash, motivo/acesso auditados e verificação; impressão atual segue disponível. Não chamar isso de certificação ou assinatura qualificada sem requisito/implementação próprios.
- C: ditado com revisão humana e fallback. D: IA só sugere com fonte/incerteza; jamais responde item de segurança ou assina automaticamente; exige aditivo à política atual de IA fora do app.
- E/F: definir a finalidade de PIN/autenticador biométrico antes de alterar a experiência de assinatura atual. Sem armazenar biometria bruta, sem substituir elegibilidade e com recuperação controlada.
- G33: eventual editor de retenção exige aditivo e revisão da política existente; purgação do HTML não será copiada.

## Gate de entrada de cada implementação

1. Refino inclui wireframe/fluxo, atores/permissões, campos e validações, núcleo/SQL, OpenAPI, estados de erro e critérios E2E. A spec tem decisão explícita do responsável.
2. Registrar baseline e ensaio de atualização com dados existentes; mudanças de esquema são testadas em instância separada e o método de aplicação/reversão é revisto antes de tocar no banco em uso. Não executar reset da instalação atual.
3. Implementar por camadas e usar a trilha existente. Nenhuma escrita/configuração importante só em memória, localStorage ou array do protótipo.
4. Validar no Docker local: positivo, negativo, três perfis, reload, outra sessão, sessão expirada, indisponibilidade, concorrência/retry, quatro larguras e impressão quando afetada. `sh check.sh` e build aprovados; SQL/API/arquivos conforme o lote.
5. Repetir os dois modelos Actemium no gate de release, incluindo documentos/impeditivas, separação de pessoas, isolamento, parada/retomada, turno/revalidação, entrega e encerramento. Conservar evidências/hashes/auditoria e registros anteriores.
6. Só declarar **concluída** uma task com evidências. Spec aprovada não é código entregue; código compilando não é teste integrado; entrega local não é deploy.
7. Publicar por lote após autorização: alterações revisáveis, segredo/material interno fora do Git, Preview exato conferido e reversão preparada. Não aumentar serviços/custos nem alterar Production por implicação.

## Próxima decisão proposta

Após fechar o gate do lote atual, refinar e validar **SGI-16 (Menu lateral único por perfil)** e depois **SGI-11A (Identidade visual)**. Em seguida, SGI-07 mínimo e SGI-08 para entregar **Delegações** com permissões e autoria corretas. As specs iniciais desses dois recursos estão preparadas; não houve implementação nova nesta tarefa.
