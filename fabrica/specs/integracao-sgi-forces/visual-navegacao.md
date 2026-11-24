# Contrato visual e de navegação

Estado: **primeiro lote validado em 23/11/2026** por “pode seguir com a operação de merge”. A implementação atualiza DESIGN.md e o código local; capacidades dos lotes seguintes continuam propostas.

## Direção visual

Referência: SGI Forces do usuário — superfícies claras, navegação lateral branca, seleção lavanda, primária azul-violeta, bordas discretas, cantos arredondados, espaço entre blocos, filtros agrupados e hierarquia de texto legível.

| Elemento | Proposta |
|---|---|
| Marca/ação primária padrão | Azul-violeta `#635BFF`; texto sobre cor sujeito a teste de contraste. Candidato escuro `#5146D8` para texto/hover quando necessário |
| Fundo | `#F6F8FC`; cards/branco `#FFFFFF`; bordas `#E2E8F0` |
| Texto | Principal `#16213B`; secundário `#52627A`; evitar cinza claro em conteúdo essencial |
| Seleção do menu | Fundo lavanda `#EEEDFF`, texto escuro da marca, ícone e rótulo; nunca só cor |
| Tipografia | Manter Geist já empacotada, sem baixar fonte externa; corpo 14–16 px conforme densidade e uso móvel |
| Cards/controles | Cards 12–16 px de raio; campos/botões 8–10 px; bordas e sombra suaves, sem carimbo/sombra de papel na tela |
| Layout | Sidebar 240–256 px em desktop, cabeçalho 60–64 px, conteúdo alinhado à esquerda até 1200 px, gaps 16/24 px |
| Status | Manter semântica atual verde/azul/âmbar/vermelho/cinza, com ícone/texto. Cor da marca não muda o significado do estado |
| Ação principal | Cor da marca no lugar de preto; uma ação principal por região. Parar/remover continuam vermelhos; ações secundárias contornadas/discretas |

Essas mudanças exigem atualizar DESIGN.md e o resumo de UI em AGENTS.md na implementação validada. A decisão anterior de botões pretos e paleta quase monocromática é substituída por esse contrato apenas após o aceite visual. Impressão da PT mantém seu desenho documental independente.

## Estrutura de navegação proposta

**Aditivo solicitado após o primeiro lote:** [SGI-16 — menu lateral por perfil](menu-lateral-por-perfil.md) foi validada e implementada no frontend local: toggle removido e destinos autorizados juntos. O agrupamento abaixo descreve a divisão funcional; [evidências](validacao-sgi16.md). A aplicação desse build ao contêiner web permanece pendente.

- **Operação:** Minha área, Visão geral (quando métricas reais estiverem disponíveis), Quadro de PTs, Desabilitados agora, Nova PT.
- **Administração:** Locais e ativos, Pessoas e cargos, Modelos e checklists, Tipos/listas, Auditoria; Grupos/Alçadas/Delegações/Notificações/Identidade quando os respectivos módulos reais forem entregues.
- A conta só vê atalhos aos quais tem acesso; esconder o menu não substitui o bloqueio da API/rota. Sem grants administrativos, as consultas de cadastros já permitidas continuam em Operação → Consulta; não retirar esse acesso por uma mudança estética. Auditoria mantém seu grant específico.
- Minha área continua a entrada padrão para quem trabalha em campo. Abrir Administração não muda o ator ou lhe concede cargo técnico.
- Hashes atuais, links de QR, deep links de PT/ativo/modelo e ação Voltar continuam válidos; não renomear URLs para imitar nomes do HTML.
- Em instalação mono-unidade, mostrar a unidade atual como contexto sem falso seletor. Multi-planta só aparece depois da autorização por unidade implementada.

## Telas prioritárias e contrato de interação

### Login

Painel limpo com marca configurada e formulário LDAP real, estado do servidor e erro legível. Não colocar botão Entrar com SSO que apenas pula autenticação, nome fixo de usuário ou domínio fictício. Não alterar os campos/fluxo de identidade sem spec própria.

### Minha área / visão geral

Pendências e sua próxima ação antes de gráficos. Cards resumem contagens reais e levam ao filtro correspondente. Uma contagem zero não é exibida enquanto carregando/erro. Emissão/aceite não são inferidos pela cor de um card.

### Quadro

Cabeçalho com total, Nova PT, busca e filtros agrupados em card; tabela em desktop, resumo prioritário legível em celular. Exibir número/modelo, ativo/local, estado, próxima ação e janela, preservando as consultas paginadas. Filtros têm Limpar e estado vazio distinto de falha/ausência de permissão.

### Nova PT

Assistente com indicação clara da etapa, rascunho salvo e resumo contextual. A quantidade/ordem é adaptada à versão: Modelo e contexto → Ativos/local → Serviço/janela/equipe → Formulário/evidências → Revisão/envio, conforme o que a versão exigir. Escrever rascunho não equivale a Enviar ou Emitir.

Obrigatório antes do envio não precisa impedir salvar rascunho parcial onde hoje isso é permitido. Avançar não ignora impeditivas, restrição de cargo, documento, turno ou etapa. Não mostrar aprovação manual editável que enfraqueça o modelo.

### Detalhe de PT

Resumo de ativo/local, versão e janela; trilho de etapas e histórico; documentos/evidências reais. Trabalho liberado aparece exclusivamente no componente/condição atual do núcleo. Parar permanece fácil de alcançar, inclusive no celular, sem competir com a ação normal da etapa.

### Administração de ativos

Árvore e detalhe lado a lado no desktop; no móvel, árvore/lista → ficha, com Voltar. Reutilizar código/tag, locais e relações. Campos empresariais novos/proteções entram somente no lote funcional; não preencher com SAP ou procedimentos de exemplo.

## Responsividade e acessibilidade

- Abaixo de 1024 px, menu em drawer com abertura/fechamento por botão, foco contido, Escape e retorno de foco. Não reservar uma faixa lateral fixa que esprema o formulário.
- Em 390/768 px, formulários e cards em uma coluna quando necessário; etapas compactas com texto da etapa atual. Não reproduzir o overflow de 536/570 px encontrado no HTML.
- Tabelas podem usar rolagem dentro de contêiner identificado; o documento não deve rolar horizontalmente. Ações e informações críticas não ficam inacessíveis fora da tela.
- Ícones com rótulo/nome acessível, foco visível, navegação por teclado, mensagens de erro associadas ao campo; alvos ≥ 44 px no móvel. Não usar apenas verde/vermelho para decisões.
- Verificar contraste ≥ 4,5:1 para texto comum e ≥ 3:1 nos casos aplicáveis de texto grande/controles, medindo as combinações reais, inclusive tema personalizado.
- Estados de carregamento, erro, vazio, inativo e sem permissão preservados, sem anunciar conclusão antecipadamente.

## Aceite visual do primeiro lote

1. Comparar capturas Antes/Depois com o mesmo cenário de PTW-SGI e as referências SGI Forces.
2. Responsável valida a direção visual em desktop e móvel antes da implementação ampla; prévia com dados fictícios é estudo, não release.
3. Conferir login, Minha área, Quadro, Nova PT, detalhe e moldura administrativa nas quatro larguras; teclado/reader básico e sem erro JS.
4. Identidade atual por arquivo continua carregando; configurações e fontes externas não são impostas; não copiar logotipo Axians ou nomes fictícios de usuários como marca do produto.
5. Uma apresentação nova não altera estados/atos, dados, impressão, API ou banco por efeito colateral.
