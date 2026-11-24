# Backlog — integração SGI Forces / PTW-SGI

Estado: **programa completo autorizado; menu único, identidade, grupos e delegação administrativa ativos no Docker**, 23/11/2026. [Spec geral](../specs/integracao-sgi-forces/README.md). [Validação atual](../specs/integracao-sgi-forces/validacao-governanca-identidade.md). Sem Git/Vercel.

SGI-01/02/16 e SGI-11A estão implementadas; SGI-07 mínimo acrescenta grupos aos cadastros/cargos/alçadas existentes e SGI-08 entrega mandato administrativo nominal. As duas PTs Actemium já encerradas foram revalidadas na instalação atualizada, com anexos e auditoria preservados; a ativação não executou ciclos novos. As demais entregas do programa continuam autorizadas e pendentes. SGI-07 completo inclui reuso de alçadas ainda pendente; SGI-11B/idiomas não está implementada. No PostgreSQL nativo passaram 643 verificações e a corrida de mandatos sobrepostos; a corrida assinatura/revogação permanece pendente.

| Ordem do programa | Situação comprovada |
|---|---|
| 1. Dois ciclos, anexos e auditoria | PTs já encerradas revalidadas na ativação; anexos e cadeia preservados. Novos ciclos completos não executados nesta ativação |
| 2. Identidade visual | Implementada e ativa |
| 3. Governança e delegações | Grupos e delegações administrativas nominais ativos; reuso ampliado de alçadas pendente |
| 4. Ativos/ficha/importações/proteções | Pendente |
| 5. Tipos/risco/SLA/biblioteca/jornada | Pendente |
| 6. Notificações/painéis/idiomas | Pendente |
| 7. Multi-planta/SSO/JIT | Pendente; SSO simulado nesta fase |
| 8. Organização/licença/PDF arquivado | Pendente; licença informativa |
| 9. Voz/IA/PIN/biometria | Pendente; IA local recomendada para avaliação, sem modelo instalado |

| Task | Escopo / referências | Dependências | Aceite central |
|---|---|---|---|
| SGI-01 | Tokens, shell, login, navegação e identidade visual; F01/F02/F20 | Validação visual; uma aplicação/duas áreas já decidido | Visual aprovado; tema existente, permissões, rotas e mobile preservados |
| SGI-02 | Minha área, resumos, Quadro e detalhe; F03/F05 | SGI-01 e baseline funcional local utilizável | Mesmas PTs/pendências e atos; contagens reais; sem novos polls/N+1 |
| SGI-03 | Assistente de rascunho e checklist guiado; F04/F06 | SGI-01, SGI-02 | Salvar/retomar/envio reais; versão e impeditivas corretas; nenhuma pergunta obrigatória contornada |
| SGI-04 | Navegação integrada de locais/ativos e campos empresariais; F07/F08/F27 | SGI-01; esquema/OpenAPI/campos refinados | Árvore, fichas e importação persistem; históricos mantidos; sem duplicação de unidade/local/ativo |
| SGI-05 | Dispositivos/intertravamentos, equipamentos protegidos e bypass; F09 | SGI-04; modelagem/regras de proteção refinadas | N:M consistente e auditado; Protege separado de Parte de; evidência de restabelecimento sem falsa autorização |
| SGI-06 | Tipos de PT, classe de risco e biblioteca/checklists; F10/F11/F12 | SGI-03; contrato de classificação/versionamento validado | Uma fonte de verdade; flags efetivas na versão; PT antiga intacta; SLA não estende turno |
| SGI-07 | Usuários/grupos funcionais e alçadas reutilizáveis; F13/F14/F15 | Modelos/cargos atuais e autorização/eligibilidade refinadas; integrar SLA de SGI-06 depois | Reuso de etapas/slots; solicitante não remove exigências; grupo não concede habilitação técnica |
| SGI-08 | Delegações; F16 | SGI-07; spec de autoria, período e escopo validada | Delegado identifica sua autoria; prazo/escopo/recusas auditados; sem conflito com separação de funções |
| SGI-09 | Contexto multi-planta e autorização por unidade; F17 | Decisão de escopo; contrato de sessão/vínculo/isolamento | Unidade conferida no servidor em cada operação; nenhum dado/contagem/anexo vazado entre plantas |
| SGI-10 | Notificações reais; F19 | Eventos e permissões definidos | In-App persistente e deduplicado, entregas/erros reais; e-mail só com provedor validado |
| SGI-11 | Editor persistente de identidade e idioma; F20/F21 | SGI-01; contrato de configurações/upload validado | Preferências persistem e refletem nas duas áreas; contraste/tema e impressão mantidos; pt-BR integral |
| SGI-12 | Federação SSO/JIT; F18 | Decisão de integração externa e modo local/nuvem | Autenticação/verificação de identidade reais; LDAP existente preservado; sem vínculo inseguro por e-mail livre |
| SGI-13 | Tenant/licença, PDF arquivado, voz/IA/PIN/biometria; F22/F24/F25/F26 | Aditivos individuais com decisão de negócio/custo | Cada capacidade tem contrato/serviço/evidência próprios; não exibir controles fictícios para preencher tela |
| SGI-14 | Regressão, dados existentes e publicação por lote; F23 e aceite comum | O lote a publicar testado localmente | Dois ciclos de PT, anexos/auditoria, quatro larguras, performance e reversão aprovados; deploy/commit conferidos |
| SGI-16 | Menu lateral único por perfil, sem toggle Operação/Administração | Matriz de leitura/gestão validada; rotas e grants atuais | Links autorizados juntos, consultas preservadas, busca/rotas coerentes e quatro larguras verificadas |

## Histórico do primeiro lote

**Fase 1: SGI-01 + SGI-02, com o mínimo de SGI-14 para validá-las.** Mudar o look and feel de toda a moldura e priorizar as telas operacionais reais. A sequência posterior foi refinada no plano de paridade; SGI-16 já foi implementada/testada localmente, com ativação Docker pendente; SGI-11A vem em seguida. Cada linha permanece rastreada, inclusive quando sua implementação depende de decisões adicionais.

Não vincular entrega visual a uma migração imediata multi-tenant/multiplanta ou a provedores de IA/e-mail. Se o responsável exigir multiplantas no primeiro lote, replanejar explicitamente antes da implementação.

## Gate por task

- [ ] Escopo/contrato refinado e validado, com referência da decisão.
- [ ] Implementação e testes locais; dados anteriores preservados.
- [ ] OpenAPI, modelo/núcleo/SQL e documentação atualizados quando aplicável.
- [ ] UI revisada e performance comparada com baseline equivalente.
- [ ] Testes negativos de permissão/validação e auditoria aprovados.
- [ ] Reversão revisável e publicação autorizada para o lote.
- [ ] Git/Preview publicados e conferidos no deploy exato, quando aplicável.


## Histórico de execução antes do lote de identidade e governança

- SGI-01/02: código local implementado; revisão em quatro larguras e interações de navegação/rascunho verificadas em laboratório SQL isolado. Frontend ativado no Docker e assets conferidos; LDAP/leituras/grants/logout verificados. Aceite dos ciclos completos e anexos ainda pendente.
- SGI-03 a SGI-13: não implementadas neste lote; exigem refinamento e validação específicos.
- SGI-14: parcial. Checks/build e regressão visual isolada feitos; LDAP/TLS e segregação foram verificados pela API HTTPS real; arquivos/S3, dois ciclos completos, navegador e desempenho representativo no Docker continuam pendentes. Git/Vercel não publicados.
- SGI-15 (nova, proposta): corrigir autores sem nome em `/audit/facets`; falha reproduzida no baseline e depois do merge. [Spec](../specs/integracao-sgi-forces/auditoria-autores-sem-nome.md). Não implementada sem validação do aditivo.

23/11/2026 — Frontend ativado pelo responsável no Docker e assets conferidos contra o build. Dependências paradas iniciadas nos próprios contêineres. Login LDAP/leituras/grants/logout verificados pela API HTTPS com três identidades. SGI-14 continua parcial: dois ciclos completos/anexos/E2E de navegador e publicação pendentes.


## Recursos restantes — proposta de execução em lotes

[Inventário completo com 33 itens](../specs/integracao-sgi-forces/paridade-funcional.md) · [Plano/aceite detalhado por lote](../specs/integracao-sgi-forces/plano-paridade.md). Ordem proposta: fechar SGI-14 → SGI-16 → SGI-11A → SGI-07 mínimo → SGI-08 → SGI-04 → SGI-05 → SGI-06 → SGI-03 → SGI-10 → SGI-02B → SGI-11B → SGI-09 → SGI-12 → SGI-13.

A ordem é proposta para validação, não autorização automática de todos os lotes. Os sufixos decompõem as tasks existentes sem alterar seus identificadores.

| Subtask | Entrega pendente | Lacunas | Estado / spec |
|---|---|---|---|
| SGI-16 | Menu lateral único por perfil; remover seletor | Pedido adicional de navegação | [Implementada/testada localmente](../specs/integracao-sgi-forces/validacao-sgi16.md); ativação Docker pendente |
| SGI-11A | Editor de identidade, presets, prévia e persistência | G01/G02 | [Spec inicial](../specs/integracao-sgi-forces/identidade-visual.md), para refino/validação |
| SGI-07A | Visão de pessoas/perfis e pré-provisionamento | G17 | Refino no plano; contratos a validar |
| SGI-07B | Grupos funcionais/membros/escopo | G18 | Refino no plano; contratos a validar |
| SGI-07C | Alçadas reutilizáveis, níveis e slots | G19 e parte de G14 | Refino no plano; contratos a validar |
| SGI-08 | Delegações temporárias e uso auditado | G20 | [Spec inicial](../specs/integracao-sgi-forces/delegacoes.md), para refino/validação |
| SGI-04A | Árvore única de locais/ativos/subconjuntos | G08 | Refino no plano; contratos a validar |
| SGI-04B | Ficha empresarial/SAP | G09 | Refino no plano; dicionário a validar |
| SGI-04C | Importador e templates Excel/CSV | G11 | Refino no plano; mapeamento/duplicatas a validar |
| SGI-05 | Proteções e intertravamentos N:M/bypass | G10 e parte de G16 | Refino no plano; processo técnico a validar |
| SGI-06A | Catálogo de tipos/exigências | G12 | Refino no plano; ligação à versão a validar |
| SGI-06B | Classes, duração operacional e SLA separados | G13/G14 | Refino no plano; relógio/políticas a validar |
| SGI-06C | Biblioteca de perguntas e checklists associados | G15/G16 | Refino no plano; versionamento a validar |
| SGI-03A/B | Solicitação em etapas e checklist guiado | G06/G07 | Refino no plano; wireframes/aceite a validar |
| SGI-10A/B/C | Inbox, regras/destinatários e e-mail real | G24/G25 | Refino no plano; catálogo/provedor a validar |
| SGI-02B | Dashboard administrativo e indicadores | G04/G05 | Refino no plano; métricas/consultas a validar |
| SGI-11B | Internacionalização e preferência persistente | G03 | Refino no plano; catálogo a validar |
| SGI-09 | Contexto multi-planta e consolidação autorizada | G21 | Refino no plano; autorização/isolamento a validar |
| SGI-12A/B | SSO real e JIT seguro | G22/G23 | Refino no plano; provedor/identidade a validar |
| SGI-13A | Dados institucionais, licença e consumo | G26/G27 | Refino no plano; domínio comercial a validar |
| SGI-13B | Comprovante PDF arquivado/hash | G28 | Refino no plano; snapshot/arquivo a validar |
| SGI-13C/D | Ditado integrado e IA de fotos | G29/G30 | Aditivos próprios; decisão de produto/serviço |
| SGI-13E/F | PIN e autenticação biométrica | G31/G32 | Aditivos próprios; não modificar assinatura atual sem decisão |
| Aditivo de retenção | Eventual editor preservando política aprovada | G33 | Não copiar purgação curta do HTML |

A sequência acima foi proposta antes da ativação de SGI-16, SGI-11A e do mínimo de SGI-07/08. O estado atual consta no início deste documento; reuso ampliado de alçadas e a integração de locais/ativos são as próximas entregas funcionais.

23/11/2026 — Responsável solicitou spec para remover o toggle e exibir telas/links no menu lateral conforme role. Criada SGI-16 e inserida antes de identidade visual no plano. Requisito de navegação registrado; matriz/UX para refinamento e validação. Nenhuma implementação nesta etapa.

23/11/2026 — SGI-16 autorizada por “pode continuar” e implementada: menu único, política compartilhada de destinos/consulta, busca/rota coerentes e correção do colapso desktop. Frontend 404/API 151/deploy 7 testes aprovados; três logins LDAP e navegação nos quatro tamanhos com backend Docker real, sem erro JS. Leituras equivalentes 17/17 e 68/68. Imagem Docker ainda aguarda atualização pela conta com acesso; sem Git/Vercel.


23/11/2026 — Programa completo autorizado e primeiros módulos adicionais ativados no Docker: SGI-11A, SGI-07 mínimo (grupos reais) e SGI-08 administrativo nominal, além do menu SGI-16. Reuso ampliado de alçadas e etapas 4–9 continuam pendentes. A autorização elimina a espera por novo aceite genérico de execução; refinamentos materiais de domínio/integração continuam registrados antes do código. Relatório e limites em validacao-governanca-identidade.md.

23/11/2026 — Relatório nativo confirmado: 643 verificações aprovadas, auditoria íntegra e corrida de delegações sobrepostas com uma criação aceita e outra recusada por `23505`. Banco de teste separado, sem alterar dados da aplicação. Corrida assinatura/revogação ainda pendente; sem Git/Vercel.
