# Execução da paridade SGI

Escopo autorizado em 23/11/2026 por “implemente tudo isso”, abrangendo as nove entregas do plano-paridade. Desenvolvimento e validação locais precedem qualquer publicação. Esta autorização não publica no Git/Vercel nem apaga a instalação atual.

## Refinamentos confirmados

- Uma aplicação, menu lateral conforme permissões; preservar os controles de PT e os dois modelos elétricos.
- SSO e e-mail ficam **simulados nesta fase**, por solicitação explícita. Identificar a simulação; não afirmar entrega externa, autenticar uma pessoa arbitrária ou conceder cargos técnicos. LDAP e sessões atuais permanecem o caminho de autenticação real.
- Licença exclusivamente informativa: consumo e datas não bloqueiam Solicitar, Parar, Entregar ou qualquer outra operação.
- IA: recomendação de avaliação local com Ollama, sem contratação de API. Instalação/modelo ainda não escolhidos. Nenhuma sugestão pode preencher confirmação de segurança, assinar ou mudar o estado de uma PT. Fonte, revisão humana e possibilidade de descarte obrigatórias.
- Implementar por módulos verificáveis: contrato, persistência, autorização, interface e testes. Uma tela simulada não conclui um módulo que exige dados reais.

## Identidade visual: decisões de implementação

Refina SGI-11A: utilizar o grant administrativo existente `modelos` para gerir a identidade, sem ampliar os grants de Rafael/Paulo nem criar mapeamentos LDAP implícitos. Leitura do editor também exige esse grant. O manifesto público contém somente a marca ativa.

Persistência: uma configuração por unidade, com revisão, autoria e data; imagens PNG de até 256 KiB, até 2048 × 2048, em tabela própria no PostgreSQL, por SHA-256. Não usar o bucket de anexos nem tornar anexos públicos. SVG/fontes existentes por arquivo continuam compatíveis; o editor não envia SVG nem fontes nesta entrega. O limite pequeno permite configuração e referência atômicas, sem dependência de upload externo.

Precedência: configuração publicada → arquivo `/tema/tema.json` → padrão. Restaurar significa voltar ao arquivo da planta (ou ao padrão quando ausente), com confirmação e nova revisão. Prévia não publica. `If-Match` impede sobrescrita silenciosa. O manifesto público só expõe imagens referenciadas pela marca ativa. Erros de banco não se tornam confirmação de salvamento.

## Segurança e validação

Preservar banco/volumes/auditoria existentes. Esquema canônico validado em banco descartável; ativação na instalação atual exige backup/restauração verificados e ferramenta de aplicação compatível. Nunca executar reset da instalação em uso. Registrar separadamente código implementado, testes realizados e versão realmente ativada no Docker.

Cada módulo registra evidências e pendências no backlog. O programa só estará concluído depois de todos os critérios do plano passarem; mocks autorizados de SSO/e-mail serão relatados como tais.
