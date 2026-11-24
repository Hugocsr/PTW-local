# Matriz funcional — protótipo e aplicação atual

Estado: **matriz de referência, complementada pelo inventário de paridade**, 23/11/2026. Base: leitura dos HTMLs e do código/modelo canônico do PTW-SGI. Não representa teste E2E de todos os recursos atuais neste dia.

| ID | Recurso do SGI Forces | Base atual confirmada no código | Decisão proposta e critério de integração |
|---|---|---|---|
| F01 | Moldura, sidebar, cabeçalho, breadcrumbs, cards e filtros | Shell, navegação, Page, DataTable, tema e paleta de estados | Adotar linguagem visual no stack atual; regras de liberação e impressão permanecem |
| F02 | Front-Office / Backoffice | Trabalho/Cadastro/Configuração; grants na sessão e API | Uma aplicação com duas áreas por permissão, decisão validada em 23/11/2026; troca de área não muda a identidade; aditivo SGI-16 propõe substituir o seletor por menu lateral único conforme permissões |
| F03 | Dashboard e indicadores | Minha área, Quadro e Desabilitados agora, consultas paginadas/contagens | Resumos persistentes e acionáveis com definição/filtro/permissão; não copiar números de exemplo |
| F04 | Solicitação em cinco passos | NewPermitView cria rascunho; edição, formulário, equipe e anexos por atos separados | Assistente adaptado ao modelo; não impor cinco passos fixos a toda PT; salvar/retomar rascunho no servidor |
| F05 | Detalhe, trilho e histórico | PermitDetailView, etapas, atos e trilha reais | Reapresentar no visual novo, mantendo estados/validação e campos elétricos |
| F06 | Checklist de campo guiado | FormFill, FormSpec e validação/impeditivas | Modo guiado opcional sobre a mesma versão; campos obrigatórios e validações iguais à visão completa |
| F07 | Árvore Planta→Área→Equipamento | Unit, Location hierárquico, Asset, AssetRelation e visões de cadastro | Vista unificada sem duplicar entidades; planta da instalação é Unit, galpão/área são locais tipados; pai de ativo é relação Parte de |
| F08 | Ficha SAP e identificação empresarial | Asset tem código, nome, aliases, tipo e locais; não todos os campos SAP | Propor identificadores externos/campos explícitos, unicidade e importação; EQUNR não substitui UUID nem tag sem mapeamento |
| F09 | Dispositivo, intertravamento e N:M de equipamentos protegidos | Relações configuráveis e painel de bypass; não um cadastro especializado completo | Modelar proteção/ligação/campos técnicos sem misturar Protege com Parte de; impedir referência entre unidades |
| F10 | Tipos de PT com flags | Modelos/versionamento/formulários, etapas e limites | Catálogo de tipos ligado a modelos; obrigatoriedade efetiva deriva da versão congelada; nunca flags desconectadas do formulário |
| F11 | Classes de risco e SLA | Listas, condições e impeditivas configuráveis; sem catálogo dedicado completo de classe/SLA | Definir classe, referência por versão/PT e relógio de SLA; SLA de aprovação não estende janela/turno ou libera trabalho |
| F12 | Banco de perguntas e questionários versionados | Editor de modelos, listas de opções, versões imutáveis e importação ptw.modelo/1 | Reusar os modelos como fonte de verdade; eventual biblioteca de perguntas terá revisão/cópia versionada, sem atualizar PT antiga |
| F13 | Usuários/pré-provisionamento | Person, login, AD objectGUID, situação de conta e cargos com escopo/validade | Reorganizar telas e reusar API; provisionamento automático por e-mail só com contrato de identidade seguro, não presumir JIT atual |
| F14 | Grupos SGI | Grupos LDAP dão grants administrativos; cargos determinam atos | Grupo funcional é novo conceito distinto; mapear adesão/escopo sem conceder habilitação técnica automaticamente |
| F15 | Alçadas nomeadas sequenciais/paralelas | Stage ordenada e SignSlot por cargo/pessoa; assinaturas paralelas dentro de etapa | Pacote reutilizável pode instanciar etapas/slots na versão/rascunho; seleção não permite solicitante remover assinaturas obrigatórias |
| F16 | Delegações temporárias | Sem motor próprio de delegação encontrado | Autoria real + origem da delegação + escopo/prazo + recusas auditadas; nunca delegar habilitação técnica ou furar separação de pessoas |
| F17 | Seleção da planta e visão cross-plant | Esquema isolado por unit_id; API resolve unidade única por configuração | Requer vínculo pessoa↔unidade, sessão/grants por unidade, autorização no servidor e testes de isolamento; UI não implementa isso sozinha |
| F18 | SSO Entra/SAML e tela Conectado | Login LDAP/AD TLS com sessão/grants reais | Preservar LDAP; adaptador federado futuro requer validação, configuração real e decisão de uso local/nuvem, sem selo fictício |
| F19 | Catálogo de notificações, destinatários e canais | SSE para atualizar dados; notificações de negócio adiadas | SSE não é caixa de notificações. Implementar persistência/outbox/retries/dedupe, canal In-App; e-mail depende de provedor validado |
| F20 | Identidade visual pelo Backoffice | Tema da planta por arquivo, cores/fonte/logo e verificação de contraste | Adotar visual padrão e manter tema atual; editor administrativo futuro deve persistir com permissão/auditoria e upload seguro |
| F21 | Idiomas | Interface pt-BR; sem camada i18n completa confirmada | pt-BR no primeiro lote; EN/ES só após catálogo de traduções de toda a jornada e decisão de preferência por pessoa/instalação |
| F22 | Licença/tenant | Instalação por planta; sem serviço de licenciamento encontrado | Não exibir plano/uso fictícios. Definir domínio comercial e indicadores reais antes da tela; sem bloqueio automático novo nesta proposta |
| F23 | Auditoria e retenção | Cadeia SHA-256, eventos, exportação/verificador e retenção própria | Usar a trilha existente; não copiar arrays mutáveis ou reduzir retenção/purgar dados |
| F24 | Foto/anexo/voz/IA | Upload real, hash e evidência; IA fica fora do produto pela decisão atual | Foto/anexos reais reutilizados; voz/IA exigem aditivo, privacidade e fallback. Sem foto falsa, confiança fixa ou auto-resposta de item crítico |
| F25 | PIN/biometria | A assinatura usa identidade autenticada/cargo, sem pedir novo login por ato | Preservar regra atual; não adicionar PIN/biometria só por aparência. Qualquer autenticação adicional tem spec própria |
| F26 | Comprovante PDF/hash | Impressão real de formulário, QR; anexos/exportação auditáveis | Preservar impressão e integridade existentes. PDF canônico arquivado, se desejado, exige gerador, armazenamento e verificação próprios |
| F27 | Importação Excel/CSV e modelos de arquivo | Importação de modelos e origem csv no cadastro; cobertura específica deve ser inventariada | Usar fluxo real de prévia/confirmação, transação e erros por linha; não anunciar Excel sem parser/testes |

## Situação depois do primeiro lote

F01/F02 e apresentação de F05 integradas ao código e ativadas no Docker local. F03 recebeu apenas o resumo da Minha área. F20 mantém tema por arquivo e padrão novo, sem editor administrativo. O restante conserva o estado parcial/ausente detalhado no [inventário de 33 itens](paridade-funcional.md); [plano de execução](plano-paridade.md). As referências F01–F27 permanecem estáveis.

## Mapeamento de estados

Não mapear automaticamente a coluna Status do HTML para o estado da PT:

- Aguardando aprovação aproxima Em análise, mas a decisão real vem da etapa/assinaturas da versão.
- Aprovada não basta para Trabalho liberado: emissão, aceite, janela, turno, impeditivas e suspensão continuam relevantes.
- Desabilitado/Reabilitado são fatos sobre a proteção/bypass e sua evidência. Uma PT ativa pode ter outros propósitos; esses fatos não substituem sua máquina de estados.
- Rejeitada pode significar Devolvida ou Cancelada dependendo da regra; não converter históricos por aproximação de rótulos.
- Encerrada exige os atos de entrega/aceite/encerramento da versão e mantém o histórico original.

## Integridade do catálogo

As cópias idênticas de SGI_CATALOG nos dois HTMLs servem apenas como referência de estrutura. Não são uma base compartilhada. O merge funcional exige que leitura/escrita passem pela mesma API, persistam, respeitem a unidade, sejam auditadas e apareçam na outra área após atualização.

Nenhum procedimento técnico de exemplo ou questionário do HTML deve entrar automaticamente como versão ativa na aplicação. A revisão de engenharia/SST e a ativação humana continuam necessárias.
