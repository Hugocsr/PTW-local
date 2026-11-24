# SGI-16 — Evidências de implementação e validação

23/11/2026. Spec autorizada pelo responsável por “pode continuar”. Código implementado e validado no frontend local com API/LDAP/banco Docker reais. Aplicação do novo build no contêiner web ainda pendente; não publicado no Git/Vercel.

## Mudança entregue no código

- Removido o seletor de área do cabeçalho e do drawer, com seu componente e a política antiga sem consumidores.
- Menu único organizado por Operação, Cadastros, Configuração, Governança e sistema e Consultas, sem grupos vazios/links repetidos.
- `core/navigation.ts` concentra leitura, classificação e destinos para sidebar, busca e rota. Tipos/Listas seguem `cadastro`; Modelos segue `modelos`; Auditoria segue `auditoria`. Exportação não concede gestão.
- Consultas anteriormente autorizadas permanecem disponíveis sem botões administrativos. Breadcrumb e busca mostram a mesma classificação.
- Perda de leitura em rota ativa volta à Minha área com aviso. Nenhum grant/cargo/contrato de backend alterado.
- Corrigido o recorte da marca/ícones quando o menu desktop está recolhido, mantendo a navegação por teclado e o drawer.

## Testes executados

| Verificação | Resultado |
|---|---|
| Tipos, lint e testes do frontend | 404 testes aprovados; 16 combinações de grants verificadas pela política de navegação |
| Check completo da raiz | API 151 testes aprovados, 38 integrações existentes não executadas por dependerem de ambiente próprio; deploy 7 aprovados; núcleo compartilhado consistente |
| Build Vite | Aprovado após os ajustes finais |
| Três contas LDAP reais | Marina, Rafael e Paulo entram e saem pelo formulário; auth=ldap, sem simular grants ou identidade |
| Quatro larguras | 390/768/1024/1440 × três contas: 12 capturas, sem overflow do documento nem erro JS |
| Menu e permissões | Marina com dez destinos simultâneos; operadores com nove destinos de operação/consulta, sem Auditoria; sem toggle ou duplicação |
| Busca/Ctrl+K e acesso direto | Mesma política de destinos/classificação; consulta de Ativos e reload funcionam; Auditoria HTTP 200 para Marina e 403/PTA03 para operadores |
| Ações de gestão | Novo ativo/Novo tipo/Nova lista presentes para Marina e ausentes para operadores; grupos vazios não aparecem |
| Mobile e teclado | Foco contido em 14 passos de Tab, Escape e retorno ao botão; navegar fecha drawer |
| Desktop recolhido | Marca de 32 px totalmente dentro do cabeçalho de 47 px; sem recorte/overflow, ícones alinhados |
| Consultas antes/depois | Uma sessão: 17/17 leituras; quatro sessões: 68/68 na mesma jornada e nos mesmos serviços Docker |

O ensaio de consultas conserva os quatro usuários da coorte conectados até terminar todas as navegações; logout só depois. Assim, notificações de logout não induzem refresh de outras sessões durante a medição. No primeiro ensaio sem essa barreira, houve refresh de referências por SSE; isso foi separado da comparação de navegação. Os tempos Vite não são baseline de capacidade de produção.

## Ambiente e evidências

Arquivos fora do Git em `../outputs/sgi16/`, relativos à raiz do projeto: `verificacao-navegacao.json`, `baseline-ui.json`, `comparacao-consultas.json`, `check.log`, `check-final-app.log`, `build.log`, capturas antes/depois e `colapso-inicial.json`. A baseline de fonte anterior à alteração foi preservada em `antes-src/`; a comparação usa uma cópia isolada de frontend, sem reverter o checkout nem o banco.

Frontend local de desenvolvimento em 127.0.0.1:5178; proxy para https://localhost usa explicitamente a CA local e valida TLS. Os dados e o LDAP são os mesmos do Docker; não se usou adaptador em memória, bypass de certificado, carga/reset ou mudança de permissão. O tema ativo de arquivo continua aplicado.

## Aplicação no localhost Docker

A conta do agente continua sem acesso ao pipe/API Docker. Atualizador preparado em `../outputs/sgi16/atualizar-menu.ps1`, com sintaxe PowerShell validada: identifica a composição existente, guarda imagem anterior e constrói/recria somente web sem dependências. Não recria API, banco ou volumes. `-Reverter` reaplica a imagem anterior registrada em `reversao-menu.json`.

Depois da execução pela conta Windows do responsável, `verify-active.mjs` confere HTTPS/health/sessão anônima e hashes do JavaScript/CSS contra o build testado. Só então registrar a nova versão como ativa em https://localhost. Testes dos dois ciclos completos de PT/anexos continuam no gate SGI-14; não foram declarados concluídos por esta mudança de menu.
