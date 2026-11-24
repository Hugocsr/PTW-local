# Inventário de paridade funcional — SGI Forces / PTW-SGI

Estado: **proposta para refinamento/validação**, 23/11/2026. Pedido: listar todos os recursos dos dois protótipos que ainda faltam e planejar sua inclusão. Este documento não autoriza implementar os lotes seguintes nem altera funcionalidades.

O primeiro lote entregou identidade visual padrão, moldura, Operação/Administração, resumo da Minha área e apresentação das telas existentes. Não entregou paridade funcional completa com o Backoffice. O frontend está no Docker local; autenticação LDAP, leituras, grants e logout foram verificados com os três perfis. Os ciclos completos de PT/anexos no Docker continuam no gate SGI-14.

**Critério:** Ausente = não foi encontrado recurso dedicado equivalente no código/contrato atual. Parcial = existe base real, mas falta a experiência/capacidade adicional do protótipo. Condicionada = depende também de decisão de produto/integração. Uma tela ou botão no HTML não prova implementação real no protótipo.

## Recursos pendentes

| Lacuna | Recurso apresentado pelo protótipo | Estado atual e o que falta | Task / referência |
|---|---|---|---|
| G01 | Editor administrativo de identidade visual | **Parcial.** Nome, logo, símbolo, cores e fonte existem por arquivo de tema. Falta alterar pela Administração, salvar, auditar, restaurar e refletir em outro navegador | SGI-11A / F20 |
| G02 | Templates de cores e prévia de marca | **Parcial.** Novo padrão já aplicado. Faltam presets selecionáveis, prévia antes de salvar e aplicação uniforme em login/cabeçalho/menu. Não copiar marcas Axians nem cores que confundam estados | SGI-11A / F20 |
| G03 | Idioma português/inglês/espanhol | **Ausente.** Interface atual em pt-BR; falta catálogo completo de traduções, preferência persistente e formatação por idioma sem alterar o fuso da unidade | SGI-11B / F21 |
| G04 | Dashboard administrativo | **Parcial.** Dados existem nas respectivas telas. Falta visão com totais de locais/ativos/pessoas/modelos, atividade recente e atalhos; visão por planta depende de SGI-09 | SGI-02B / F03 |
| G05 | Indicadores operacionais e estratégicos | **Parcial.** Minha área já tem contagens reais. Faltam distribuição por tipo/risco, vencimentos/conformidade de prazo e filtros que abram os registros de origem | SGI-02B / F03 |
| G06 | Nova solicitação em etapas | **Parcial.** Rascunho, equipe, formulário e anexos existem. Falta assistente com progresso, voltar/avançar, contexto do ativo e revisão antes do envio, adaptado à versão | SGI-03A / F04 |
| G07 | Checklist guiado de campo | **Parcial.** Perguntas, validações, câmera/anexos e impeditivas reais existem. Falta apresentação por pergunta/grupo, progresso, revisão e retomada no mesmo rascunho | SGI-03B / F06 |
| G08 | Gestão de ativos em árvore única | **Parcial.** Locais e Ativos existem em telas próprias. Falta navegar por unidade → local/galpão/área → ativo → subconjunto com detalhe integrado | SGI-04A / F07 |
| G09 | Ficha empresarial e identificação SAP | **Parcial.** Código/tag, nome, aliases, tipo e locais existem. Faltam identificadores externos e ficha técnica/organizacional do HTML; cadastrar um número SAP não significa integrar ao SAP | SGI-04B / F08 |
| G10 | Dispositivos de proteção e intertravamentos | **Parcial.** Relações e Desabilitados agora existem. Falta cadastro especializado, relação N:M com protegidos, dados de bypass e ligação explícita aos checklists de retirada/restabelecimento | SGI-05 / F09 |
| G11 | Importação em lote Excel/CSV | **Ausente como jornada administrativa dedicada.** `origin=csv` e importação de modelos não equivalem a importar planilhas de plantas/locais/ativos/pessoas. Faltam templates, parser, prévia, erros e confirmação | SGI-04C / F27 |
| G12 | Catálogo de tipos de permissão | **Parcial.** Modelos/versionamento existem. Falta catálogo para descoberta, descrição/referência, ativação, vínculo com modelo e exigências de checklist, alçada, classe, LOTO, medição e proteção | SGI-06A / F10 |
| G13 | Classes de risco | **Parcial.** Listas/condições podem representar escolhas. Falta cadastro próprio de classes, descrição, situação, vínculo à PT/modelo e política de prazo congelada | SGI-06B / F11 |
| G14 | SLA de aprovação | **Parcial.** Validade da PT, prazo máximo e turno existem; são outros controles. Falta prazo de resposta da aprovação/nível, alertas, atraso e acompanhamento. Não misturar SLA com janela operacional | SGI-06B + SGI-07C / F11/F15 |
| G15 | Banco reutilizável de perguntas | **Parcial.** Editor de modelos e versões existem. Falta biblioteca de perguntas com autoria/revisão, organização e incorporação rastreada em novas versões | SGI-06C / F12 |
| G16 | Checklists associados a ação/ativo | **Parcial.** Formulário versionado existe. Falta gestão da associação habilitar/desabilitar/ambas, tipo/local/ativo e seleção governada, sem substituir uma versão histórica | SGI-06C + SGI-05 / F12 |
| G17 | Gestão de usuários nos moldes do SGI | **Parcial.** Pessoas, contas, situação e cargos/validade existem. Falta visão de perfis funcionais, pré-provisionamento e vínculos por unidade; vínculo multi-planta depende de SGI-09 | SGI-07A / F13 |
| G18 | Grupos SGI | **Ausente.** Grupos LDAP dão grants; cargos habilitam atos. Falta grupo funcional reutilizável, com membros, finalidade e escopo, sem conceder habilitação técnica | SGI-07B / F14 |
| G19 | Alçadas reutilizáveis | **Parcial.** Etapas ordenadas e assinaturas paralelas existem no modelo. Falta cadastrar uma alçada nomeada, versioná-la e reutilizá-la na configuração; composição manual só dentro de limites aprovados | SGI-07C / F15 |
| G20 | Delegações temporárias | **Ausente.** Falta delegante/delegado, início/fim, motivo, escopo, revogação e uso na aprovação elegível, identificando quem realmente assinou | SGI-08 / F16 |
| G21 | Seleção de planta e visão entre plantas | **Parcial na fundação.** Há `unit_id`, mas a API resolve uma unidade da instalação. Faltam vínculo/autorização por unidade, troca de contexto e consolidação restrita às unidades permitidas | SGI-09 / F17 |
| G22 | SSO corporativo federado | **Ausente.** LDAP atual é real. Faltam integração configurada com provedor, validação da identidade, estados de conexão e testes de indisponibilidade, mantendo o modo local | SGI-12A / F18 |
| G23 | Provisionamento JIT do SSO | **Ausente.** Falta vínculo seguro por identidade imutável do provedor, regras de aprovação/associação e suspensão. Domínio ou e-mail isolados não bastam | SGI-12B / F13/F18 |
| G24 | Notificações e central de avisos | **Ausente.** SSE atualiza dados, mas não é inbox. Falta evento persistente, destinatário autorizado, contador, leitura, link e deduplicação | SGI-10A / F19 |
| G25 | Configurar canais/destinatários e testar envio | **Ausente.** Falta catálogo administrativo de eventos, preferências, canais In-App/e-mail e resultado real de teste; e-mail precisa de provedor configurado | SGI-10B/C / F19 |
| G26 | Dados da organização/instalação | **Ausente como tela específica.** Falta apresentar organização, identificador, ambiente e onboarding com origem real e permissões definidas | SGI-13A / F22 |
| G27 | Licença, consumo e limites | **Ausente; condicionada.** Falta domínio comercial real, validade, capacidades contratadas, uso medido e alertas. Não criar plano/quantidades fictícios ou interromper segurança por expiração comercial | SGI-13A / F22 |
| G28 | Comprovante PDF arquivado | **Parcial.** Impressão da PT/QR e trilha íntegra existem. Falta geração canônica no servidor, snapshot, arquivo preservado, hash e download verificável | SGI-13B / F26 |
| G29 | Ditado integrado | **Ausente; condicionada.** O teclado do dispositivo pode ditar em campos existentes; falta serviço/integração própria indicada pelo botão do HTML, com revisão humana e alternativa manual | SGI-13C / F24 |
| G30 | IA para leitura/análise de fotos | **Ausente; condicionada.** Fotos/vídeos/anexos reais já existem. Falta motor de sugestão, evidência da origem, confirmação humana e fallback; exige rever a decisão atual de IA fora do produto | SGI-13D / F24 |
| G31 | Confirmação por PIN | **Ausente; condicionada.** A assinatura autenticada real já existe, sem novo login por ato. PIN adicional exige justificar a finalidade e revisar essa regra; não é requisito técnico para a assinatura atual | SGI-13E / F25 |
| G32 | Confirmação por biometria | **Ausente; condicionada.** Falta integração real com autenticador, recuperação e alternativa; não armazenar impressão digital nem chamar clique simples de biometria | SGI-13F / F25 |
| G33 | Editor de retenção/purgação do log | **Não transpor como no HTML.** Auditoria, retenção e exportação reais já existem. A opção do protótipo admite retenção muito menor que a política do produto. Uma eventual tela deve preservar o mínimo aprovado e não apagar a cadeia | Aditivo próprio / F23 |

G33 é uma diferença deliberada de política, não uma funcionalidade inexistente de auditoria. G29–G32 são apresentações simuladas ou incompletas no protótipo e precisam de decisões adicionais para virar produto.

## O que não entra como funcionalidade faltante

- Login LDAP/sessão/grants, pessoas/cargos com validade, fluxo/assinaturas, bloqueio por equipamento, parada/retomada, prorrogação/revalidação, documentos e impeditivas já existem.
- Captura real de foto/vídeo, upload, hash, impressão/QR, histórico, auditoria e exportação da trilha já existem; precisam de preservação/regressão e, em alguns casos, de nova apresentação.
- O estado visual “Reabilitado” do protótipo não vira automaticamente um novo estado de PT. A evidência de restabelecimento deve usar o fluxo canônico.
- “Conectado”, “Foto capturada”, “Enviado” e “PDF gerado” nos HTMLs não são prova desses efeitos. Não transportar dados de exemplo, autoria fixa ou sucesso simulado.

## Detalhes para não perder no refinamento

**Identidade:** logotipo do cliente, remoção/restauração, presets azul/verde/vermelho/preto como referências, prévia e aplicação nas duas áreas. A decisão de usar uma paleta não pode recolorir estados de segurança nem perder contraste.

**Ficha empresarial:** unidade com WERKS/IWERK/BUKRS/REGIO; local com TPLNR/BEBER/KOSTL; equipamento com EQUNR/TAG, fabricante, modelo, número de série, local técnico, centro de planejamento/custo, categoria SAP, patrimônio/inventário, grupo planejador, aquisição, material e situação operacional. Preservar UUID/código existentes, opcionais onde não aplicáveis e sem inventar sincronização ERP.

**Proteção:** tipo, princípio de ação, sistema de controle, descrição/observações, método de bypass, classe padrão e múltiplos equipamentos protegidos. “Protege” e “Parte de” têm significados distintos. Checklists de ativação do bypass/restabelecimento precisam ser configurados e aprovados pela engenharia/SST.

**Notificações:** o catálogo do HTML tem 32 referências: solicitação F01–F06; aprovação A01–A07; execução/reabilitação E01–E09; prazos P01–P03; administração ADM01–ADM07. Mapear cada uma a evento real ou registrar não aplicável; a existência de um rótulo não cria um ato novo de PT. Alertas de licença esperam SGI-13A; alertas de delegação esperam SGI-08.

## Evidências da comparação

- Originais: `C:/Users/Pichau/Desktop/outsystems/PTW/SGI/SGI Forces Backoffice (standalone).html` e `SGI Forces Front-Office (standalone) (1).html`, apenas leitura.
- HTMLs extraídos: `outputs/sgi-analysis-2026-11-23/{backoffice,frontoffice}/template.html`; lógica em `inline-3.js` na mesma pasta. As extrações ficam fora do repositório.
- Backoffice: catálogos e delegações nas linhas 29–138; formulários/campos 337–363; grupos/alçadas/delegações 979–1031; questionário/checklists/notificações 1050–1134; identidade/idioma 1135–1151; proteção 1333 em diante.
- Front-Office: criação/seleção e etapas 296–419; detalhe e histórico 420–514; checklist/IA/resumo 515–560; indicadores/planta 561–603. PIN/biometria/ditado constam também no template HTML.
- Base atual: `src/core/brand.ts`, `src/data/brand.ts`, `src/core/workspace.ts`, `src/registry/{types,modelTypes}.ts`, `src/components/work/{NewPermitView,MinhaAreaView}.tsx`, `src/components/registry/FormFill/attachments.tsx`, em `ptw-mockup-v2/`; contrato e esquema em `ptw-server/api/openapi.yaml` e `ptw-server/db/schema/`.

Essas evidências sustentam o inventário, não representam E2E novo dos 33 itens. [Plano de execução](plano-paridade.md).
