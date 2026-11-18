# Spec — publicação NR-10 na homologação

Estado: validada pelo responsável pelo produto em 18/11/2026, na conversa: “Validar publicação completa com os três perfis”. Implementação e verificação em andamento.

## Objetivo

Disponibilizar no Preview Vercel `ptw`, branch `ptw-sgi`, os modelos fictícios de PT elétrica vigente e preparação 2027 já validados localmente. Preservar cadastros, arquivos e trilha de auditoria hospedados. Não promover para Production.

## Situação confirmada

- Código preparado no commit `f14954b`; checks, builds e testes locais aprovados.
- Supabase com PostgreSQL 17.11, esquema `ptw`, uma unidade, uma pessoa, um local e um ativo; nenhuma PT, modelo ou anexo.
- Controles de revalidação ainda ausentes no banco hospedado.
- LDAP do Preview contém apenas Marina; o fluxo completo exige técnico, líder e supervisor distintos.
- Credenciais Git do Windows não estão disponíveis à conta do agente; conexão GitHub solicitada como alternativa.

## Contrato da entrega

1. Preservar os registros hospedados e verificar a cadeia de auditoria antes/depois. Backup completo dos dados e definições afetadas; ensaio isolado obrigatório.
2. Aplicar somente o esquema elétrico canônico e as funções/permissões que dele dependem, de forma atômica e aditiva, caso a compatibilidade do banco existente seja comprovada. Nenhum DROP/reset de dados. Registrar a alteração na auditoria. Se isso não puder ser validado, preparar banco candidato separado e não publicar contra esquema incompatível.
3. Acrescentar ao LDAP de Preview os usuários fictícios `rafael.nunes` e `paulo.lima`, preservando `marina.costa`. Senhas distintas por pessoa em segredos do Preview; nenhuma senha no código/Git. Cada usuário mantém seu grupo administrativo e os cargos de assinatura são concedidos no cadastro, não pelo LDAP.
4. A mudança do provisionamento LDAP é exclusiva de Preview. Não habilitar entrada sem senha nem alterar o LDAP da planta/local.
5. Acrescentar locais, ativos e modelos fictícios sem substituir o ativo/local já hospedados. Usar cadastros próprios identificados como fictícios e versões separadas; não importar PTs históricas locais.
6. Testar ambos os ciclos no ambiente hospedado com identidades distintas, anexos S3, assinaturas, paradas, revalidação do modelo 2027, entrega, encerramento e auditoria.
7. Publicar o código na branch `ptw-sgi` do GitHub antes do deploy Vercel. Não fazer force push. Se houver divergência remota, reconciliar preservando ambos os históricos.

## Aceite

- Login correto e recusa de senha incorreta nos três perfis; privilégios administrativos e de assinatura preservados.
- Preflight do banco aprovado; RLS e auditoria da revalidação ativos.
- Dois modelos visíveis, com diferenças de sequência, conferência de painel e turno; dados recarregam sem perda.
- Modelo 2027 recusa atividade fora do turno e revalidação por pessoa não autorizada; novo aceite obrigatório após revalidar.
- Os dois ciclos encerram com arquivo recuperável e cadeia de auditoria íntegra.
- URL entregue com identificação do commit e das verificações efetivamente executadas.

## Reversão

Manter o deploy anterior, backup e definições anteriores das funções. A atualização aditiva deve ser compatível com o código anterior para registros sem política elétrica. Um deploy com falha não deve autorizar trabalho nem apagar novas evidências. Reversão de funções deve ser ensaiada, sem apagar a tabela/eventos de revalidação que já tiverem sido criados.

## Limites

Os dados são fictícios. A publicação não certifica atendimento integral à NR-10. Novos módulos de treinamentos, PIE, engenharia de arco e SIMOPS permanecem fora desta entrega. Nenhuma criação de projeto ou branch paga no Supabase está autorizada por esta spec.
