# Lote SGI — identidade, grupos e delegação administrativa

23/11/2026, horário do cliente. Escopo completo autorizado; este documento registra **somente o lote efetivamente implementado/ativado**, sem declarar as nove entregas concluídas.

## Resultado

- SGI-16, SGI-11A, governança mínima SGI-07 (pessoas/cargos/alçadas existentes + grupos reais) e SGI-08 com o escopo administrativo nominal refinado.
- Frontend 409 testes, API 160 testes; 38 integrações externas já condicionais na bateria original. `check.sh` aprovado; builds frontend/API aprovados. As 643 verificações do esquema canônico passaram tanto no PostgreSQL 18/PGlite quanto no PostgreSQL nativo do Docker, incluindo dois modelos elétricos e negativos de identidade/grupos/delegação.
- Navegador no laboratório separado: prévia/publicação/restauração de marca, PNG, revisão obsoleta, recarga e login de outra sessão; grupo/membros persistentes; mandato criado, pendência na Minha área, assinatura com ator/representado e revogação preservando assinatura anterior. Sem erro JavaScript, quatro larguras. Esse laboratório usa sessão de desenvolvimento explícita e banco descartável; não é apresentado como teste LDAP ou de concorrência nativa.

## Ativação observada no Docker

Backup e prova de restauração executados pela conta Windows com acesso ao Docker. Banco de origem identificado no contêiner: `ptw_nr10_20261118_154400_670133`. A cópia ativada é `ptw_sgi_20261124_014030_303988`; origem, volumes e imagens anteriores preservados para reversão. Dados originais comparados por projeção das colunas originais, contagem/hash por tabela; auditoria comparada ao backup e verificada. Não houve reset do banco de origem.

O ativador revalidou os dois cenários Actemium já encerrados (base vigente e preparação 2027), preservando PTs, modelos, anexos e cadeia de auditoria. Não executou dois ciclos novos nesta ativação. Relatório de ativação: `outputs/sgi-enterprise/ativacao-local-resultado.json` no workspace. A atualização ficou somente local, sem commit/push/Vercel.

Conferência independente após ativação:

- `https://localhost`: HTTP 200; sessão anônima 401; login sem senha desligado e senha habilitada. TLS verificado com CA local.
- JS `/assets/index-CxXuvEcx.js` e CSS `/assets/index-C1nU0kY0.css` coincidem byte/hash com o build local conferido.
- Marina/Rafael/Paulo autenticaram por LDAP; sessão 200, logout 204 e sessão encerrada 401. Marina lê marca/grupos/mandatos/auditoria; Rafael/Paulo recebem 403 em marca/grupos/auditoria e 200 na consulta de mandatos próprios.

## PostgreSQL nativo — resultado confirmado

O relatório `outputs/sgi-enterprise/banco-nativo-resultado.json` confirma `ok: true`, 643 verificações e cadeia de auditoria íntegra no banco descartável `ptw_test_sgi_20261124_020309_574139`. Os dados da aplicação não foram alterados. A corrida de criação de mandatos sobrepostos usou duas sessões: uma concluiu e a outra foi recusada com SQLSTATE `23505`, como esperado.

O validador usa papel exclusivo sem login por execução, registra os hashes do esquema e limpa a marca de manutenção antes das verificações de DDL/GRANT. A preparação do esquema mantém sua configuração de manutenção em conexão separada.

## Pendências e limites

Não confundir esta entrega com biblioteca de alçadas reutilizáveis, árvore empresarial/importações, catálogo de risco/SLA/checklists, assistente integral, notificações/idiomas, multi-planta, SSO/e-mail, organização/licença, PDF arquivado ou voz/IA/PIN/biometria. Esses itens permanecem no programa autorizado. SSO/e-mail serão simulados; licença informativa; IA local é recomendação a avaliar, sem modelo instalado.

A concorrência de criação de mandatos foi conferida no PostgreSQL nativo. A corrida simultânea entre assinatura e revogação ainda requer bateria própria e não é inferida desse resultado. Os casos sequenciais de revogação/validade/separação passaram; novos usos nunca são aceitos apenas pela indicação visual do frontend. O validador `outputs/sgi-enterprise/validar-banco-local.py` sempre usa banco novo.

Evidências locais: `identidade-resultados.json`, `governanca-resultados.json`, `layouts-governanca.json`, `verificacao-perfis-docker.json`, `banco-nativo-resultado.json`, `check-final.log` e capturas de 390/768/1024/1440 em `outputs/sgi-enterprise`. Detalhes antigos dos dois ciclos permanecem em `outputs/actemium/resultado-fluxo-nr10-*.json`.
