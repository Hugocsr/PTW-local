# SGI-16 — Menu lateral único conforme perfil e permissões

Estado: **validada pelo responsável em 23/11/2026**, por “pode continuar”; implementada e validada localmente; aplicação da imagem Docker pendente. Requisito solicitado pelo responsável: retirar o toggle Operação/Administração e apresentar as telas/links no menu lateral conforme a role. Escopo autorizado: implementação da navegação desta spec, sem publicar no Git/Vercel.

Este aditivo substitui a interação de troca de área do primeiro lote no código local. Preserva a decisão de uma única aplicação, uma sessão e uma API; Operação/Administração passam a ser agrupamentos funcionais, sem um modo de navegação separado.

## Resultado esperado

- Um único menu lateral contém, ao mesmo tempo, todos os destinos que a conta pode acessar.
- Remover o seletor Operação/Administração do cabeçalho e do drawer; não transferir esse seletor para outro local.
- A pessoa não precisa trocar de área para encontrar uma tela. Administração não equivale a outra identidade nem a um novo login.
- Links de gestão só aparecem com a respectiva capacidade. Consultas já autorizadas permanecem disponíveis como consultas, sem dar direito de editar.
- Não mostrar grupos vazios, telas sem implementação ou atalhos duplicados.

## Organização proposta

1. **Operação:** Minha área, Quadro de PTs e Desabilitados agora. Nova PT continua como ação visível nas telas operacionais; se virar atalho lateral, reutiliza a mesma rota e o mesmo bloqueio atual de indisponibilidade.
2. **Cadastros:** Locais, Ativos e Pessoas para quem pode gerir cadastro.
3. **Configuração:** Modelos de PT, Tipos e Listas conforme a capacidade de gestão de cada domínio.
4. **Governança e sistema:** Auditoria e, após implementação das respectivas tasks, Grupos, Alçadas, Delegações, Identidade visual e Notificações, cada um com permissão própria.
5. **Consultas:** referências de cadastro/modelo que a conta já pode ler, quando não tem capacidade de gestão. A mesma rota aparece uma única vez, em gestão ou consulta; editar continua condicionado à autorização.

Essa organização foi adotada no aceite de continuação e implementada no código local. Títulos de grupo não concedem acesso; ocultar um atalho de gestão não deve retirar a leitura de uma referência usada pela PT.

## O que significa role nesta spec

- A interface deriva capacidades das permissões efetivas devolvidas pela sessão, atualmente os grants `cadastro`, `modelos`, `auditoria` e `exportacao`, e das regras de consulta existentes.
- Cargos técnicos, escopos e validade continuam determinando quem pode solicitar/assinar/emitir/aceitar atos de PT. Não inferir menus administrativos de um cargo técnico.
- Marina/Rafael/Paulo são casos de teste, não regras por nome, login ou ID. Uma outra pessoa com as mesmas permissões recebe a mesma navegação.
- Perfis/grupos futuros de SGI-07 devem alimentar capacidades explícitas; não criar uma segunda fonte de autorização apenas no frontend.
- Permissão para exportar não implica poder gerir modelos, cadastros ou consultar toda a Auditoria. Aplicar cada requisito de forma independente.

## Matriz inicial de visibilidade e ações

| Destino/capacidade | Conta com permissão administrativa aplicável | Conta operacional sem o grant de gestão |
|---|---|---|
| Minha área / Quadro / Desabilitados | Visível, respeitando os dados e atos autorizados | Visível, respeitando os dados e atos autorizados |
| Gestão de Locais/Ativos/Pessoas | Atalho em Cadastros com `cadastro`; ações autorizadas pelo servidor | Consulta já permitida fica em Consultas, sem ações de escrita |
| Gestão de Modelos | Atalho em Configuração com `modelos` | Consulta já permitida fica em Consultas, sem edição/publicação |
| Tipos/Listas | Atalho em Configuração com `cadastro`, conforme as ações atuais de Tipos/Listas | Consulta já permitida preservada, sem criação/alteração |
| Auditoria | Visível somente com `auditoria` | Sem atalho; rota/API recusam a consulta não autorizada |
| Exportação | Ação disponível apenas com `exportacao` e os demais requisitos do recurso | Não exibir ação nem aceitar chamada não autorizada |
| Identidade/Grupos/Alçadas/Delegações/Notificações | Visível após o módulo existir e a sessão conceder a capacidade definida na sua spec | Sem link de gestão; acesso pessoal, como inbox ou minhas delegações, segue a spec do módulo |

Não mudar o modelo de leitura atual apenas para esconder um menu. Caso o responsável deseje também revogar consultas existentes, isso exige decisão explícita, contrato e validação no servidor — não será consequência implícita desta alteração visual.

## Comportamento de navegação

- Minha área continua a entrada padrão. Menu ativo depende da rota; não existe estado persistido de “área selecionada”.
- Preservar hashes atuais, QR, deep links de PT/ativo/local/pessoa/modelo, aliases, abas e Voltar dentro da aplicação.
- Links contextuais em PTs seguem a mesma regra de leitura; eles não abrem formulários de gestão para quem só consulta.
- Busca global/Ctrl+K, atalhos, breadcrumbs e sidebar devem usar a mesma política de visibilidade/acesso. Uma tela oculta por falta de leitura não pode reaparecer como atalho de gestão na busca.
- Ao restaurar/atualizar uma sessão, recalcular o menu a partir das capacidades atuais. Não confiar em role/grant salvo no navegador.
- Se uma permissão de leitura for revogada enquanto a pessoa estiver na tela, impedir novas ações e voltar para Minha área com mensagem compreensível. A perda de gestão não exige sair de uma consulta que continua autorizada.
- Menu mobile continua em drawer abaixo de 1024 px, fecha ao navegar, contém o foco e retorna ao botão ao fechar/Escape. Desktop mantém colapso e identificação do item ativo.
- Tela de parede e impressão permanecem com suas molduras próprias.

## Segurança, dados e desempenho

- Menu não substitui autorização. Requisições de escrita, consulta restrita e exportação continuam validadas na API/banco.
- Não alterar grants, autenticação LDAP, cargos, elegibilidade, estados da PT, isolamento da unidade ou auditoria por efeito colateral.
- A implementação proposta reutiliza os contratos/permissões existentes; se o inventário de consultas revelar ausência de capacidade de leitura necessária, refinar esse contrato antes de modificar comportamento.
- Não criar consulta, polling ou carregamento antecipado de todo o Backoffice para montar o menu. Metadados de links são locais; permissões vêm da sessão.
- Preservar o contador real de Sua vez, marca da planta, contexto da unidade, indicadores de indisponibilidade e acesso fácil a Parar.
- Sem schema novo/reset para remover o seletor. Manter o trabalho anterior de desempenho e de integração intacto.

## Pontos de implementação após validação

- `components/shell/nav.ts`: metadados de grupo/capacidade e ordem dos destinos.
- Política pura de navegação: substituir o filtro por área ativa por uma lista de destinos autorizados/consulta, com testes significativos da matriz.
- `AppSidebar`, `App.tsx`, `WorkspaceSwitcher` e política de workspace: remover a interação e o código de troca que deixar de ter consumidor, preservando rotas e o drawer acessível.
- `CommandPalette`, atalhos e breadcrumbs: compartilhar a política, sem regras paralelas por nome de pessoa.
- Atualizar DESIGN.md, AGENTS.md e documentação de produto junto da implementação; até lá continuam descrevendo a interface em execução com seletor.

## Critérios de aceite

| Caso | Resultado esperado |
|---|---|
| Marina com os grants atuais | Vê Operação, gestão de cadastros/configurações e Auditoria simultaneamente no menu, sem toggle |
| Rafael/Paulo sem grants de gestão | Vê operação e consultas autorizadas; não vê links de gestão/Auditoria nem ações administrativas |
| Perfil só com `cadastro` | Gestão de cadastros disponível; não ganha modelos, auditoria ou exportação por associação |
| Perfil só com `modelos` | Gestão de modelos disponível; não ganha gestão de pessoas nem Auditoria |
| Perfil de auditoria/exportação | Destinos e ações seguem cada grant independente, sem promoção automática a administrador completo |
| Acesso direto por URL sem permissão | Consulta restrita/escrita recusada; interface mostra acesso indisponível sem vazar dados |
| Consulta de ativo/modelo a partir da PT | Continua funcionando quando já autorizada, sem edição indevida |
| Trocar conta, recarregar, expirar/restaurar sessão | Menu acompanha a sessão real; não conserva links privilegiados de outra pessoa |
| Busca global, atalhos e QR | Mesma política de leitura/gestão e rotas atuais; nenhum atalho privilegiado indevido |
| 390/768/1024/1440 e teclado | Sem toggle, grupo vazio, link duplicado ou overflow; foco/drawer corretos e alvos acessíveis |
| Fluxos de PT e dados anteriores | Assinaturas, impedimentos, documentos, turno/revalidação, auditoria e impressão sem alteração funcional |
| Contagem de consultas antes/depois | Menu unificado não adiciona leituras ao backend nem antecipa módulos pesados |

## Sequência e gate

Adicionar SGI-16 como próxima mudança de navegação, antes do editor de identidade SGI-11A, para que os novos módulos já entrem no menu definitivo. Refinar/validar organização e matriz → implementar localmente → testes automatizados e Docker com os três perfis → revisão visual → publicação somente após autorização. A continuação autorizada inicia esta implementação local; publicação permanece separada.


## Refino registrado no início da implementação

Tipos e Listas usam `cadastro` para gestão; Modelos usa `modelos`; Auditoria usa `auditoria`. Os demais destinos de referência continuam legíveis por contas autenticadas, como já ocorre na API, e aparecem em Consultas quando não há o grant de gestão. `exportacao` não promove a conta a gestor. Os grupos só aparecem se tiverem destinos; novas telas não implementadas não entram no menu. Remoção do seletor não altera cargos, consultas autorizadas nem contratos do backend.


## Estado de execução

Código e testes locais concluídos; [evidências SGI-16](validacao-sgi16.md). Nova imagem web ainda precisa ser aplicada pela conta com acesso ao Docker e conferida no endereço ativo. Sem Git/Vercel.
