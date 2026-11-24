# Publicação SGI — identidade e governança

Estado: execução autorizada em 23/11/2026 pelo responsável: “suba essa versão pro git e vercel”. Este contrato aplica a publicação já solicitada ao lote local validado; não autoriza implementar os módulos restantes.

## Escopo e destino

- Publicar o merge visual, menu lateral por permissões, editor de identidade, grupos e delegações administrativas nominais. Incluir a instrumentação PERF-01 já presente no código, desligada por padrão; preservar o ajuste de conexões transacionais existente.
- Repositório privado `Hugocsr/PTW-local`, branch de homologação `ptw-sgi`; Vercel `hc-4634/ptw`, runtime Container e `Dockerfile.vercel`. Preservar `main`/Production e o Docker local.
- Preservar credenciais e três perfis de Preview, proteção da Vercel, TLS, RLS, anexos e auditoria. Não transportar senhas, arquivos de clientes nem banco local para o Git ou para a homologação.

## Banco e compatibilidade

Capturar dados e definições do esquema privado hospedado `ptw`; conferir cadeia e ensaiar restauração isolada. A publicação acrescenta cinco tabelas, a opção de delegação do slot e metadados de representação da assinatura; substitui somente funções canônicas afetadas e acrescenta seus gatilhos, políticas e permissões mínimas. Nenhum reset, exclusão de registros nem nova branch/projeto pago.

O esquema canônico continua sendo a fonte única. A adaptação de publicação fica no scratchpad, com guardas para definições prévias, limites de espera, aplicação atômica e auditoria explícita. Não criar uma cadeia paralela de migrações no repositório. Novas colunas conservam o comportamento dos registros anteriores: delegável falso, representação nula. Nenhuma assinatura ou modelo histórico é reescrito.

Antes de publicar o código, exigir compatibilidade do banco novo com o código anterior, dados antigos preservados e ensaio da aplicação aditiva sobre backup restaurado. Anexos permanecem nas chaves S3 atuais.

## Código e deploy

Revisar arquivos candidatos e excluir segredos/builds/backups. Conferir referência remota e publicar sem force push. O commit de homologação deve ter árvore igual ao código testado. Aguardar o deploy desse commit e conferir URL, SHA, runtime e health; não redeployar uma revisão antiga.

## Aceite

- Checks locais aprovados, builds frontend/API e 643 verificações SQL nativas já registrados; restaurar/atualizar backup hospedado em ensaio separado.
- Health, três logins LDAP, segregação administrativa, consultas, persistência dos novos recursos, conflito de revisão e logout verificados no deploy exato.
- Interface em quatro larguras, sem erro JavaScript/overflow. Preservação de PTs/modelos/assinaturas anteriores, anexos recuperáveis e cadeia íntegra.
- Registrar testes efetivamente executados e limitações: a corrida simultânea assinatura/revogação ainda não foi exercitada; as demais entregas do programa não estão incluídas.
- Entregar URL e SHA do commit publicado. Os testes de gravação usam cadastros fictícios identificados; não alterar PTs antigas.

## Reversão

Guardar deploy anterior e definições anteriores. A atualização é aditiva e permite retornar ao código anterior sem apagar as novas tabelas/evidências. Reversão de funções só após avaliar registros novos de representação; não reescrever assinaturas ou apagar auditoria para restaurar o código antigo.
