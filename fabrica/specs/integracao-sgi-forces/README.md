# Integração SGI Forces → PTW-SGI

Estado: **programa completo autorizado por “implemente tudo isso”, com execução local por lotes**. Refinamentos confirmados: SSO/e-mail simulados, licença informativa e delegações apenas administrativas explicitamente habilitadas. [Execução e decisões](execucao-completa.md). Autorização do programa não equivale à entrega de todos os módulos.

## Resultado desejado

Uma aplicação com a experiência visual do SGI Forces e as regras, persistência, evidências e segurança do PTW-SGI. Não incorporar os HTMLs como um segundo sistema independente nem transportar seus dados/transições simulados para produção.

Decisão arquitetural validada pelo responsável em 23/11/2026: **uma aplicação com duas áreas**, Operação e Administração, exibidas conforme permissões. Um frontend e uma API. Trocar de área não troca pessoa, cargo, unidade ou autorização. Essa decisão não valida automaticamente o conteúdo funcional/visual dos lotes seguintes.

Aditivo solicitado em 23/11/2026: remover o toggle Operação/Administração e reunir as telas no menu lateral conforme perfil/permissões. SGI-16 e o lote de identidade/grupos/delegações estão ativos em https://localhost e publicados no Preview Vercel; [evidências locais](validacao-governanca-identidade.md) e [publicação hospedada](../../../deploy/releases/2026-11-23-sgi.md). Os módulos restantes continuam pendentes.

Fontes: HTMLs `SGI Forces Backoffice (standalone).html` e `SGI Forces Front-Office (standalone) (1).html`, em `C:/Users/Pichau/Desktop/outsystems/PTW/SGI`. Análise de código e navegação estão no scratchpad `outputs/sgi-analysis-2026-11-23`. Os originais não foram modificados; não adicionar seus assets, dados de exemplo ou referências de marca ao bundle do produto sem seleção/revisão.

- [Matriz de funcionalidades e lacunas](matriz-funcional.md)
- [Contrato visual e de navegação](visual-navegacao.md)
- [Tasks e sequência](../../tasks/integracao-sgi-forces.md)
- [Inventário detalhado de paridade — 33 itens](paridade-funcional.md)
- [Plano de execução para os recursos restantes](plano-paridade.md)
- [Spec inicial de identidade visual](identidade-visual.md)
- [Spec inicial de delegações](delegacoes.md)
- [SGI-16 — Menu lateral único por perfil, sem seletor de área](menu-lateral-por-perfil.md)
- [Evidências de implementação da SGI-16](validacao-sgi16.md)
- [Governança mínima e delegações administrativas refinadas](governanca-pessoas.md)
- [Validação e ativação de identidade/grupos/delegações](validacao-governanca-identidade.md)

## O que será preservado

1. Aplicação React/TypeScript/Vite/shadcn, camada DataPort/API Fastify, PostgreSQL e armazenamento de anexos; instalação Docker local e implantação de homologação existentes.
2. IDs, URLs existentes, cadastros, modelos/versionamento, PTs, arquivos e cadeia de auditoria. Não resetar o banco em uso nem substituir evidências por registros demonstrativos. Mudança de esquema na instalação atual usa cópia separada reconstruída, backup/restauração verificados, comparação dos dados e reversão preservada.
3. Estados canônicos: rascunho, em análise, devolvida, emitida, ativa, suspensa, entregue, encerrada, cancelada e expirada. Os nomes do protótipo não substituem a máquina de estados.
4. Elegibilidade por cargo/local/validade, separação de assinaturas, condicionais, impeditivas, trava de equipamento por versão, parada/retomada, entrega e encerramento.
5. Políticas elétricas e modelos Actemium vigente/preparação 2027 já existentes, preservados por versão e ID; esta integração não revisa interpretação normativa ou engenharia.
6. LDAP/AD com TLS, sessão/grants, isolamento por unidade, CSRF, auditoria e comportamento sem servidor. Área administrativa visível não concede permissão; o servidor continua decidindo.
7. Impressão como formulário de PT próprio, em branco/preenchido, QR e avisos existentes; não substituir por captura da tela ou prometer PDF arquivado sem implementação verificável.

## Programa de entregas

### Fase 1 — identidade visual e navegação sobre recursos existentes

Aplicar o contrato visual a login, moldura, menu, cabeçalho, Minha área, Quadro, Desabilitados agora, Nova PT e detalhe. Separar navegação operacional/administrativa sem separar o backend. Atualizar também as molduras das telas de cadastro/modelos/auditoria para uma experiência coerente; mudanças funcionais de cadastros ficam nas fases seguintes.

Manter Minha área como entrada inicial. Não substituir pendências acionáveis por um dashboard genérico. Cartões de visão geral podem resumir dados existentes com origem e definição explícitas; métricas novas exigem contrato real antes de aparecer. Nenhum gráfico, badge de notificações ou seletor de planta fictício.

O visual novo passa a ser o padrão do produto após validação; o tema configurado da instalação continua respeitado. Não é uma terceira aplicação ou um tema de demonstração isolado.

### Fase 2 — jornada e cadastros integrados

Assistente para criar/editar rascunho com etapas adaptadas à versão do modelo, usando atos existentes e validação no servidor. Unificar a navegação de locais/ativos e ampliar as fichas de equipamento/proteções. Conectar tipos, classes de risco e checklists ao mesmo modelo versionado, sem dois bancos de perguntas concorrentes.

Antes de implementar campos novos, cada task registra esquema final, OpenAPI, regras, dados antigos, congelamento histórico e aplicação local/hospedada segura. Campos empresariais e classificações não viram obrigatórios retroativamente em PTs existentes.

### Fase 3 — governança e operação entre plantas

Grupos funcionais, alçadas reutilizáveis, delegações e múltiplas unidades precisam de contrato específico de autorização e testes de banco. Não equivaler grupos LDAP/grants administrativos a cargos habilitantes para assinar. Não habilitar troca de planta apenas mudando o estado do frontend ou enviando um unitId livre.

O banco tem chaves por unidade, mas a API atual resolve uma unidade da instalação. Isso não significa que seleção multi-planta esteja pronta. A primeira entrega continua mono-unidade até esse contrato ser validado e implementado.

### Fase 4 — serviços complementares reais

Notificações, personalização pelo Backoffice, idioma e informações de licença devem ser implementados com persistência, permissões e evidência de funcionamento. E-mail e federação Entra/SAML/OIDC dependem de integração/configuração externas; não exibir selo Conectado ou Enviado sem confirmação real.

IA de foto, ditado, PIN e biometria permanecem rastreados como decisões adicionais. O protótipo só os simula; não fazem parte do primeiro lote. IA dentro do produto altera decisão anterior de funcionar sem ela e exige aditivo próprio. Nenhum custo/serviço novo é autorizado por esta proposta.

## Regras de integração

- Usar uma fonte de verdade persistente para catálogo/modelos. Uma alteração autorizada deve refletir na Operação sem copiar arrays entre HTMLs.
- Tipo de PT é catálogo para descoberta/classificação; versão do modelo define formulário, fluxo e limites efetivos. Flags de tipo não podem enfraquecer ou modificar uma versão ativa congelada.
- Intertravamento/dispositivo e equipamento protegido são conceitos relacionados, não sinônimos. Relação Protege não é Parte de e não herda automaticamente sua trava de equipamento.
- Habilitar o bypass deve ser denominado de forma inequívoca, como Ativar bypass; restabelecer proteção, como Reabilitar proteção. Esses fatos não autorizam trabalho por si só. Rótulos finais de atos dependem da configuração/revisão do modelo.
- Cadastros/inativos preservam referências históricas; alterações de modelo produzem nova versão. Delegação nunca reescreve a identidade de quem assinou.
- Preservar a política atual de auditoria/retenção; não copiar a opção visual de purgar em três meses do protótipo. Revisão de retenção requer requisito próprio validado, sem limpeza nesta entrega.
- Importações novas devem ter prévia, erros por linha e confirmação; nenhum sucesso fictício. Não executar textos de procedimento de bypass contidos nos exemplos.
- Nada desta integração muda o repositório para OutSystems: o alvo segue sendo o PTW-SGI atual. Migração de plataforma seria outro projeto/escopo.

## Compatibilidade com trabalho em andamento

A árvore local contém PERF-01 e documentos ainda não commitados. Preservar essas alterações e a instrumentação. Não fazer reset, stash automático, sobrescrita ou merge Git destrutivo. O programa PERF continua independente; a integração visual usa suas medições para detectar regressão.

Em 18/11 houve falha local API→banco (`CONNECT_TIMEOUT`) durante a coleta; o estado atual precisa ser reconferido antes dos E2E. Isso não impede preparar o design/spec, mas impede declarar a nova experiência integrada/testada antes de recuperar o ambiente.

## Aceite comum a todos os lotes

1. Cada task tem seu escopo refinado e validado antes do código. UI, regra ou serviço novo não é dado como existente porque aparece no desenho.
2. Local primeiro: checks/builds e testes aplicáveis; API/SQL reais quando houver domínio novo. Git e Vercel só após autorização de publicação que cubra o lote. Production preservada.
3. Visual revisado em 390/768/1024/1440 px: navegação móvel acessível, sem rolagem horizontal do documento, foco/teclado, contraste, ícones com texto, alvos de toque ≥ 44 px. Tabelas podem ter rolagem local identificada quando necessária.
4. Comparar carregamento antes/depois no mesmo ambiente/dataset, uma e quatro sessões, primeira carga separada. Não criar nova rodada de polling, buscar uma PT por cartão ou carregar o Backoffice inteiro para a Operação.
5. Os dois ciclos de PT existentes passam com três identidades, anexos íntegros, recusas, parada/retomada, revalidação quando aplicável e auditoria íntegra; conferir reload e outro navegador/usuário.
6. Dados anteriores e versões encerradas preservados; plano de reversão por lote. Se DDL for necessário, ensaiar compatibilidade e restauração separadas antes de tocar no banco hospedado.

## Decisões e validações por lote

- Arquitetura uma aplicação/duas áreas já validada; não solicitar essa decisão novamente.
- Fase 1 e direção visual autorizadas pelo responsável: “pode seguir com a operação de merge” (23/11/2026), após a decisão de uma aplicação/duas áreas e apresentação das specs/prévia. Fases seguintes serão refinadas por domínio antes de implementação.
- Multiplantas deve entrar no primeiro lote funcional ou pode seguir a sequência proposta? Sem resposta, não implementar troca de unidade nem ampliar autorização.
- Recursos opcionais e integrações externas permanecem decisões registradas, não desaparecem do backlog nem são apresentados como prontos.


## Execução do primeiro lote

SGI-01/02 implementadas no código local: tokens, login, moldura, duas áreas, resumo real de Minha área e painéis de listas/detalhe. Nova PT recebe somente moldura; assistente funcional fica na SGI-03. Sem DDL, alteração de regras, commit ou deploy. [Evidências e limites do aceite](validacao-lote-1.md).


## Refino do backlog após o primeiro merge

Em 23/11/2026, o responsável solicitou listar tudo que faltou e planejar sua adição, destacando delegações e ajustes de identidade visual. Inventário de 33 itens e plano de lotes preparados, com SGI-11A e SGI-08 detalhadas como specs iniciais. A sequência posterior foi proposta para priorizar identidade visual, governança mínima e delegações, sem depender de implementar primeiro todo o catálogo de risco/tipos. Nenhuma capacidade nova foi implementada por esse levantamento; validar cada lote antes do código.
