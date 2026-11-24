# SGI-11A — Editor de identidade visual

Estado: **implementação autorizada**, 23/11/2026, pelo pedido “implemente tudo isso”. Refinamento de permissão, armazenamento e restauração em [execucao-completa.md](execucao-completa.md). Cobre G01/G02 do [inventário](paridade-funcional.md). O aceite integrado SGI-14 continua sendo gate de ativação.

## Problema e resultado

A instalação aceita tema por arquivo, mas o administrador não consegue personalizar a identidade pela aplicação. Adicionar Administração → Identidade visual com prévia, logotipo/símbolo, nome/sigla, presets e publicação persistente para as duas áreas e o login.

O primeiro escopo é a instalação atual, com uma unidade. Marca distinta por planta e editor completo de CSS não entram. Internacionalização é SGI-11B. Fontes e tema por arquivo já configurados continuam compatíveis; upload de fonte ou fundo personalizado precisa de formato/limite refinado antes de ser incluído.

## Jornada

1. Conta autorizada abre a tela e lê a configuração efetiva e sua origem: padrão, arquivo ou configuração publicada na aplicação.
2. Edita nome/sigla, escolhe um preset ou cores admitidas e envia logo/símbolo pelos controles de arquivo.
3. Prévia mostra login/cabeçalho/menu/card/botões e estado de PT, sem publicar mudanças a outras pessoas.
4. O sistema apresenta erros de contraste, formato/tamanho ou falta de permissão. Publicar fica indisponível enquanto inválido.
5. Salvar espera confirmação do servidor. Exibe autoria/revisão da configuração ativa; outra sessão vê a mesma identidade ao atualizar/recarregar.
6. Descartar retorna ao ativo; Restaurar solicita confirmação quando substituir configuração existente, registra o evento e volta à fonte de fallback definida.

## Permissões propostas

- Leitura pública de um manifesto mínimo permite desenhar o login; não deve revelar usuários, IDs de grupos, contatos internos, credenciais ou configurações de autenticação.
- Recomendação: permissão administrativa específica de identidade, atribuída explicitamente ao grupo administrativo configurado. Nome/mapeamento/grants legados devem ser refinados e aprovados, com testes LDAP/local/Preview. Não inferir essa permissão de cargo técnico.
- Marina deve receber a capacidade por configuração aprovada; Rafael/Paulo não alteram identidade nem enviando requisição direta. Não conceder permissões adicionais às demais ações.

## Dados e compatibilidade

- Reusar `Brand` e as validações de `core/brand.ts`; preservar paleta semântica, fonte empacotada, nome/sigla/logo/símbolo e o contrato de tema existente.
- Proposta de persistência: configuração ativa com revisão/autoria/data e referências de arquivos por hash, usando banco e armazenamento reais. Operação de publicar é atômica: falha no arquivo não deixa configuração apontando para objeto inexistente.
- Precedência proposta: configuração publicada válida → arquivo atual `/tema/tema.json` → padrão do produto. Restaurar pode significar voltar ao arquivo da planta ou ao padrão; esse destino precisa ser apresentado e validado, não apagado por aproximação.
- O diretório `/tema/` e o contêiner atuais são somente leitura para a aplicação; não implementar edição escrevendo arbitrariamente no filesystem ou tornando o contêiner inteiro gravável.
- Refinar contrato das operações de ler ativo, prévia/validar, enviar arquivo, publicar e restaurar no OpenAPI antes do código. Revisão/If-Match evita que duas telas se sobrescrevam.
- Arquivos públicos de marca precisam de rota controlada própria. Não tornar o bucket de anexos de PT público para servir um logo.
- A marca deve estar disponível antes do login sem uma longa cadeia de consultas; prever cache/ETag e fallback para configuração indisponível, evitando aumentar a lentidão inicial.

## UI e acessibilidade

- Seguir DESIGN.md e os mesmos Page/PageHeader/campos; layout de edição + prévia em desktop e blocos empilhados no móvel.
- Presets do HTML são referências de seleção; nomes/cores finais devem preservar contraste e distinção de estado. Vermelho de marca não pode tornar Parar indistinguível da ação principal.
- A prévia não recolore verde/azul/âmbar/vermelho/cinza semânticos. Nome acessível do logo, foco visível e alvos de toque conforme o contrato visual.
- Formatos/tamanhos de imagem definidos e testados; sugestão inicial PNG/WebP. SVG só com política de sanitização aprovada; não aceitar script/HTML ativo ou caminho arbitrário.

## Aceite e testes

| Cenário | Resultado esperado |
|---|---|
| Administrador publica marca válida | Servidor confirma, auditoria registra antes/depois e outra sessão recebe o mesmo tema |
| Recarregar ou reiniciar API/web | Configuração persiste; marca não volta ao padrão indevidamente |
| Operador tenta publicar/restaurar/upload | API recusa e audita; configuração continua intacta |
| Contraste insuficiente ou arquivo inválido | Erro associado ao campo; sem publicação parcial |
| Dois administradores editam a mesma revisão | Segundo envio recebe conflito legível; não perde a configuração do primeiro |
| Armazenamento/API indisponível | Sem sucesso falso; tema ativo e formulário de entrada permanecem utilizáveis conforme fallback |
| Restaurar com tema de arquivo existente | Destino é inequívoco; histórico mantido; não remover arquivo/objeto histórico por efeito colateral |
| 390/768/1024/1440 e teclado | Sem overflow do documento, foco e controles acessíveis |
| PTs e impressão existentes | Mesmos dados/atos; formulário impresso preservado e identidade configurada coerente |

## Decisões a fechar antes da implementação

1. Nome/mapeamento da permissão e quem publica/restaura.
2. Origem de verdade, precedência e destino de Restaurar; compatibilidade local/Preview.
3. Presets finais, formatos/limites de arquivo e inclusão ou não de fonte/imagem de fundo neste lote.
4. Contratos, armazenamento, cache e revisão/concorrência.
5. Roteiro de demonstração e critérios de aceite integrados aprovados pelo responsável.
