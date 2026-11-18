# Spec — publicação NR-10 na homologação

Estado: validada pelo responsável pelo produto em 18/11/2026, na conversa: “Validar publicação completa com os três perfis”. Implementada e verificada no Preview em 18/11/2026.

Validação complementar: responsável autorizou gerar nova senha de homologação para Marina, pois a anterior é Sensitive e não pode ser recuperada. Manter a senha anterior no ambiente geral e usar a nova somente no override da branch de Preview. Corrigir o 502 de partida observado nos testes aguardando o health da API antes de expor o proxy; ocultar cabeçalhos de autenticação da plataforma nos logs do proxy.

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

## Evidência de aceite

### Aditivo proposto — conexões no ambiente Vercel

A verificação do deploy de registro final detectou `EMAXCONNSESSION`: a abertura paralela da página pode iniciar instâncias suficientes para esgotar as 15 conexões do Session pooler. Os ciclos funcionais anteriores continuam válidos, mas o aceite operacional exige corrigir essa condição.

Proposta: usar o pool de transações do Supabase para consultas e escritas da API, com prepared statements desligados nesse modo; manter um canal de sessão separado somente para avisos em tempo real. Iniciar LISTEN apenas quando houver assinantes e liberar o recurso quando o último sair. Manter TLS verificado, RLS, auditoria e tarefas de expiração; não aumentar plano, não ampliar privilégios e não alterar a configuração padrão do Docker local. Validar localmente a seleção dos canais e o ciclo dos assinantes e testar aberturas/reloads paralelos no Preview antes do aceite final.

Estado do aditivo: validado pelo responsável na conversa, “Validar o ajuste de conexões”. Implementação e validação em andamento.

- Código funcional publicado em `Hugocsr/PTW-local`, branch `ptw-sgi`, commit `6a3d9caa299719781f8b30b0c95607cf1cd2a223`; árvore idêntica à conferida localmente.
- Preview `https://ptw-git-ptw-sgi-hc-4634.vercel.app`, Container Ready. A autenticação adicional da Vercel permanece habilitada; testes usam o mecanismo autorizado de automação da plataforma.
- Preflight aprovado no PostgreSQL 17.11 hospedado. Backup de 40 tabelas restaurado em ensaio isolado; cadastros anteriores preservados e auditoria íntegra antes/depois da aplicação aditiva.
- Login LDAP dos três perfis aprovado; escrita administrativa recusada para Rafael e Paulo. Senhas individuais fora do Git.
- PT vigente `PT-UN01-2026-00001` e PT 2027 `PT-UN01-2026-00002` encerradas após ciclos completos, incluindo anexos S3 e conferência dos hashes, recusas, assinaturas, parada/retomada e novo aceite. Modelo 2027 inclui recusas de turno/autorizador/equipe, revalidação idempotente e novo aceite.
- UI hospedada conferida em 390, 768, 1024 e 1440 px, sem rolagem horizontal e sem erros de JavaScript. Consulta de requisições do deploy corrigido não encontrou HTTP 5xx na janela observada.
- Relatórios, capturas e roteiro hospedado estão no scratchpad `outputs/release-nr10-2026-11-18`; dados de acesso e backup não são distribuídos pelo repositório.
