# ptw-server — guia para agentes

Leia antes: `../AGENTS.md` (regras de produto), `../CONVENCOES.md` (código), `README.md` (contêineres, modelo de dados, auditoria, segurança, medições) e `db/MODELO.md` (referência das entidades para o app).

## Comandos

```sh
sh setup.sh                    # segredos em ./secrets (fora do git)
docker compose up -d --build   # sobe web + api + db + storage + stats (rodapé); banco novo vem de db/schema
sh db/reset.sh                 # desenvolvimento: apaga o banco e cria de novo de db/schema (religa o dbproxy se estava ligado)
sh test.sh                     # tudo; ou seções: sh test.sh banco auditoria arquivos app recursos api
docker compose -f compose.yaml -f api/compose.seed.yaml run --rm --build seed  # carga explícita de demonstração no banco
docker compose -f compose.yaml -f compose.demo.yaml up -d --build            # entrada sem senha, com sessão auditada
docker compose -f compose.yaml -f compose.dbeaver.yaml up -d dbproxy   # só desenvolvimento: banco em 127.0.0.1:55432 (DBeaver)
docker compose stop            # pare ao terminar: a máquina tem pouca memória
```

## Regras

- Homologação com Supabase: `PTW_DB_LISTEN_PORT` separa o canal de sessão dos avisos do pool de consultas; nessa configuração, os avisos começam no primeiro assinante e fecham ao sair o último. Pool transacional exige `PTW_DB_PREPARE=0`; TLS, RLS, trilha e expiração continuam ativos. Sem essas opções, o Docker local mantém seus padrões.

- **Não há migrações:** estamos em desenvolvimento; o esquema em `db/schema/` é a fonte única; mudou, recrie o banco do zero (`sh db/reset.sh`). Não escreva migrações.
- API: `npm run check` em `api/` (cópia do núcleo, tipos, lint, testes sem Docker), ou `sh ../check.sh api`.
- **Tema da planta:** `tema/` é montada só leitura no `web` e servida em `/tema/` (`web/Caddyfile`); vazia, vale o tema que veio com o app. `sh tema.sh <pasta>` troca, `sh tema.sh padrao` desfaz. O conteúdo ativo não entra no git.
- **Demonstração no ar:** para aplicar uma função alterada sem apagar os dados, pode-se trocar só essa função no banco em uso (`create or replace`, registrando `sistema.esquema.alterado`); o esquema em `db/schema/` continua sendo a fonte e `sh test.sh banco` a prova.
- No esquema, cada objeto aparece uma vez, na forma final, no arquivo do seu domínio (`00_base` … `60_acesso`); nada de `ALTER` que remenda definição anterior. Comentários explicam a regra, não a história.
- **O modelo de dados é a referência.** O esquema em `db/schema/` define nomes, formatos, estados e regras; o app (tipos em `ptw-mockup-v2/src`) segue o banco. Mudou o modelo, atualize `db/MODELO.md` na mesma tarefa.
- Toda regra de segurança nova entra no esquema **e** ganha teste em `db/tests/invariants.sql`; corrida/concorrência em `db/tests/concurrency.sh`; desempenho em `db/tests/bench.sql`.
- Erros de regra usam a classe `PTWnn` (tabela no README e em `db/MODELO.md`, hoje `PTW01`–`PTW33`); código novo entra nas duas tabelas, no conjunto esperado de `db/tests/invariants.sql` (`db/tests/ptw_codes.sh` confere README × MODELO × esquema) e o app espelha em `ptw-mockup-v2/src/core/ptwErrors.ts`. Não crie mensagens soltas.
- O rascunho é do solicitante: outra pessoa não altera a PT em rascunho nem os filhos (`PTW17`). Filho novo da PT ganha o gatilho `touch_permit` (`permit.changed_at`); colunas de controle ficam fora do diff (`audit_strip`).
- Atos sobre a PT valem para a pessoa da sessão (`ptw.current_person()`, de `set_context`) e têm cada um a sua função: `permit_submit` (com a assinatura da Solicitação), `permit_sign` (avança o estado), `permit_return`, `permit_discard`, `permit_stop`, `permit_resume`, `permit_extend`, `permit_answer_put`. A assinatura é sempre da pessoa da sessão (`42501` fora disso). Nos testes, troque a pessoa com `t.as('d1')`; `t.psign(pt, assinatura, pessoa)` assina por `permit_sign` e `t.sig(pt, rev, assinatura, pessoa)` inclui a linha como essa pessoa.
- `permit_state_after_sign` é o espelho de `stateAfterSign` (`ptw-mockup-v2/src/core/signing.ts`): mudou um, mude o outro e a tabela de casos "L1 tabela" em `db/tests/invariants.sql`.
- Num teste, o que um ato grava é conferido na instrução seguinte (a mesma instrução não enxerga a própria escrita).
- Uma transação escreve em **uma PT** (trava a PT, depois a ponta da trilha); duas PTs na mesma transação podem cruzar travas com outra (`40P01`).
- Leitura para muitas PTs (Quadro, Minha área) é SQL de conjunto (`permit_next_rows`, `my_permits`), não função por linha na visão; meça em `db/tests/bench.sql` (página do Quadro com quem move a seguir < 50 ms na conexão quente).
- O banco começa vazio: `db/init.sh` não carrega dados (só o esquema e as classes de retenção).
- A API (`ptw_api`) não é superusuário, não apaga PT, assinatura, arquivo nem auditoria, e só vê a própria unidade (RLS). Não afrouxe isso.
- `api/openapi.yaml` é o contrato das 81 operações. `sh test.sh api` executa a bateria contra PostgreSQL e S3 reais em bancos descartáveis, incluindo o verificador Python sobre a exportação. Testes LDAP reais: acrescente `compose.ldap-test.yaml` ao Compose de testes (ver `OPERACAO.md`). `api/scripts/resolve-dist.mjs` resolve os imports do núcleo compartilhado para Node ESM; execute `npm run build`, não só `tsc`, para gerar a versão executável.
- LDAP/AD: TLS verificado obrigatório, senha só em trânsito, grupo de acesso e grupos administrativos explícitos. Não conceder cargos de segurança pelo LDAP. Sessão guarda grants imutáveis; consultas automáticas não marcam atividade. A API confere grants antes da operação. Conta desativada no cadastro derruba a sessão; grupos do diretório são reavaliados na próxima entrada.
- Operação no host (`tools/ptw_operacao.py`): chave de âncora fora dos contêineres, backup interrompe API/arquivos/web durante a cópia, restauração só em banco e volumes novos. Não reinicie serviços nem rode testes de escrita durante um backup. Preserve dados existentes com backup verificado antes de recriar o banco.
- Demonstração: `PTW_DEV_LOGIN=1` habilita a escolha de pessoa sem senha, com entrada/saída na trilha. O Compose normal deixa desligado. Não crie senhas universais nem contorne as regras de elegibilidade. O pacote de carga não importa PTs antigas e nunca roda implicitamente.
- A forma canônica do hash da auditoria está no README e em `tools/ptw_verifica.py`; se mudar uma, mude a outra e rode `sh test.sh auditoria`.
- Contêineres: sem root, só leitura, com limite de recursos; só `web` publica porta; rede interna sem saída. Não abra portas do banco nem do S3. `compose.dbeaver.yaml` (repassador em 127.0.0.1) é só para desenvolvimento, nunca em implantação.
- Recursos (rodapé do app): `stats/coletor.py` grava `/status.json` (formato no topo do arquivo; o app lê em `ptw-mockup-v2/src/lib/resources.ts`: mudou um, mude o outro). O socket do Docker só entra no `stats-docker` (repassador com `stats/haproxy.cfg`: só GET em lista, inspeção e stats de contêiner e `/system/df`), na rede `docker` interna, sem porta. Não monte o socket em outro serviço nem abra outros caminhos no `haproxy.cfg` (`/archive`, `/logs`, `/export` leem segredos de qualquer contêiner); `sh test.sh recursos` confere.
