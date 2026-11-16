# Instalação e operação local

Requisitos no host: Docker Compose atual e Python 3.10 ou superior. A construção inicial baixa imagens e pacotes; a execução funciona na rede local, sem serviços em nuvem. Execute os comandos nesta pasta. No Windows, `python`; em Linux, `python3`.

## Laboratório pronto para testar

```sh
python tools/ptw_instalar.py --local
```

Abra **https://localhost**. O laboratório só publica em `127.0.0.1` e contém pessoas fictícias:

| Login | Permissões administrativas | Senha exclusivamente de teste |
|---|---|---|
| `marina.costa` | Cadastro, Modelos, Auditoria e exportação | `Teste-local-2026!` |
| `paulo.lima` | Nenhuma; acessa as PTs conforme seus cargos | `Teste-local-2026!` |
| `rafael.nunes` | Nenhuma; solicita PTs e registra a preparação conforme seus cargos | `Teste-local-2026!` |
| `beatriz.souza`, `joana.reis`, `luis.ferraz`, `sergio.dias` | Nenhuma; cada uma age conforme os cargos e a situação da conta no cadastro | `Teste-local-2026!` |

Todas as contas do laboratório têm a mesma senha, só para demonstração. Pessoas sem login no cadastro não entram. Para trocar de pessoa sem digitar senha, use `compose.demo.yaml` no lugar do laboratório LDAP.

O instalador não apaga banco, não troca segredos existentes e não duplica a carga. Banco de outro esquema é recusado com orientação para backup; não existem migrações nesta etapa. O laboratório usa OpenLDAP com certificado local verificado e um repassador TCP, exercitando o mesmo cliente que atende o AD.

Para voltar a subir sem reconstruir: `docker compose -f compose.yaml -f compose.ldap-test.yaml up -d`. Para parar: `docker compose -f compose.yaml -f compose.ldap-test.yaml stop`. Volumes permanecem.

O certificado HTTPS vem da CA local do Caddy. Instale a CA nos aparelhos autorizados conforme o README. A alternativa `compose.demo.yaml` mantém a entrada sem senha para demonstrações; o laboratório LDAP e a implantação normal deixam essa entrada desligada.

## Login da planta

1. Copie `ldap/config.example.json` para `secrets/ldap.json`; ajuste nome do servidor no certificado (`serverName`), conta de busca somente de leitura, base de busca, grupo de acesso e grupos administrativos. Guarde a senha de busca em `secrets/ldap_bind` e a CA PEM em `secrets/ldap-ca.pem`.
2. Defina `PTW_LDAP_HOST` e `PTW_LDAP_PORT` no `.env` da instalação, além de `PTW_HOSTS` (nome DNS pelo qual a planta acessa), `PTW_UNIT` e, se necessário, `PTW_SESSION_HOURS`/`PTW_SESSION_IDLE_MINUTES` (padrões 12 h/30 min). Segredos e `.env` ficam fora do Git.
3. Provisione a primeira pessoa e suba: `python tools/ptw_instalar.py --unidade UN-01 --nome "Minha planta" --admin-login joao --admin-nome "João Silva"`. Esse login precisa pertencer aos grupos de administração configurados no diretório. A criação inicial não concede cargos de segurança.

O cadastro da pessoa deve estar ativo, habilitado, dentro da validade e ter o mesmo login do diretório. No primeiro login confirmado, o PTW vincula `objectGUID` (AD) ou `entryUUID` (OpenLDAP); outra identidade com o mesmo login é recusada. A busca exige resultado único. Associação aos grupos é **direta**: grupos aninhados e sincronização automática de pessoas/cargos não estão implementados.

`cadastro` permite editar registros, `modelos` permite editar/importar/ativar modelos, `auditoria` permite consultar a trilha e `exportacao` permite exportar modelos/auditoria. Leitura de cadastros e anexos necessária ao trabalho não exige esses grants. Assinatura, emissão e demais atos continuam sendo decididos pelo banco por cargos, validade, local e separação de funções.

Grupos são conferidos a cada login e congelados na sessão. Desativar a pessoa no cadastro revoga o acesso na requisição seguinte. Para aplicar uma mudança de grupos, a pessoa sai e entra novamente. A senha nunca é armazenada pelo PTW. **O limite de tentativas de entrada vem desligado** (decisão de 11/11/2026: na planta todos chegam pelo mesmo endereço, e o AD já tem o seu bloqueio de conta); `PTW_LOGIN_LIMIT=1` na API religa. Com ele ligado: cinco tentativas por login ou trinta por origem em quinze minutos bloqueiam novas tentativas pelo restante da janela; sucesso zera só o contador do login. O banco conserva os contadores após reiniciar a API.

LDAPS é o padrão. Para StartTLS, use `ldap://ldap-gateway:1636`, `startTls: true` e configure o repassador para a porta LDAP do servidor (normalmente 389). A CA e o nome do certificado continuam obrigatoriamente verificados. A API permanece sem rede de saída; o serviço `ldap-gateway` só encaminha TCP ao destino fixo configurado, sem terminar o TLS e sem portas publicadas.

## Manutenção, âncora e backup

```sh
python tools/ptw_operacao.py ciclo --destino /mnt/ptw-backups --ancoras /mnt/ptw-ancoras
```

Execute a cada minuto. O ciclo confere partições futuras, expira PTs e sessões, limpa sessões encerradas e idempotências após 30 dias e contadores de tentativas após 1 dia. **Auditoria nunca é apagada.** Faz âncora assinada uma vez por dia e backup de hora em hora. `--inatividade-minutos` deve acompanhar a configuração da API; `--intervalo-backup-minutos` muda a frequência de cópia. `--continuo` mantém o processo em execução. A API também expira PTs/sessões enquanto estiver ligada.

Destinos de backup e âncora devem ficar fora do computador do servidor (disco externo ou pasta de rede). O laboratório usa pastas locais apenas para ensaio. A chave `secrets/audit_anchor_key` fica exclusivamente no host; mantenha uma cópia protegida com quem verifica a auditoria. Ela também autentica o manifesto do backup, com domínio de assinatura separado. Restrinja o acesso aos destinos: as cópias contêm dados da planta e a CA privada do HTTPS.

O backup drena e para API, SeaweedFS e web enquanto executa `pg_dump` e copia os volumes de arquivos/certificados. Durante essa janela o app fica indisponível. Os serviços que estavam ligados voltam mesmo quando a cópia falha; serviços previamente parados continuam parados. **Não execute outros comandos que iniciem serviços durante a cópia.** Um diretório sem `manifesto.json` não é backup concluído. Não há remoção automática de backups; defina a retenção no destino.

Os arquivos de configuração da instalação e os segredos em `secrets/` devem ter cópia protegida separada. A chave de âncora não entra no backup nem em qualquer contêiner. Para recuperar outro host, prepare Docker/roles com o instalador, recoloque esses arquivos e a chave original antes de restaurar.

Agendamento:

- Windows/Docker Desktop: `operacao/agendar.ps1 -Backups 'E:\PTW\backups' -Ancoras '\\auditoria\PTW\ancoras'`. Cria a tarefa para o usuário atual; ele precisa estar conectado e o Docker Desktop ligado. A tarefa não é instalada automaticamente pelo laboratório. O Agendador mostra o código de saída; os eventos do banco mostram manutenção/backup.
- Linux: ajuste usuário, caminhos e destinos em `operacao/ptw-operacao.service`; instale os arquivos `.service`/`.timer` no systemd e habilite o timer. O usuário precisa acessar Docker e os destinos; verifique falhas no journal.

Uma falha interrompe o ciclo com código diferente de zero; a próxima execução tenta novamente. Execuções concorrentes são recusadas por `.operacao.lock`. Após queda abrupta, confira que não há operação em andamento antes de remover essa pasta vazia.

## Restauração de prova

```sh
python tools/ptw_operacao.py backup --destino /mnt/ptw-backups
python tools/ptw_operacao.py restaurar --origem /mnt/ptw-backups/ptw-AAAAMMDDTHHMMSSffffffZ --novo-banco ptw_restore_ensaio
```

A restauração recusa banco ou volumes existentes. Confere HMAC do manifesto, tamanho/SHA-256 de cada arquivo e entradas do tar; restaura o banco por seções, recompõe os OIDs técnicos das partições, confere as pontas e toda a cadeia da auditoria, restaura arquivos/CA em volumes novos e encerra as sessões recuperadas. As PTs e eventos são preservados. O evento `sistema.restauracao.feita` registra o ensaio. Um destino parcialmente restaurado fica isolado para diagnóstico; não é ativado.

Confira também o conteúdo S3 restaurado (ajuste os nomes retornados pelo comando):

```sh
PTW_RESTORE_DB=ptw_restore_ensaio PTW_RESTORE_FILES_VOLUME=ptw_restore_ensaio_files \
  docker compose -f compose.yaml -f compose.restore-test.yaml run --rm verify-files
```

No PowerShell, use `$env:PTW_RESTORE_DB='ptw_restore_ensaio'` e `$env:PTW_RESTORE_FILES_VOLUME='ptw_restore_ensaio_files'` antes do comando. O verificador lê todos os arquivos referenciados no banco, em fluxo, e compara tamanho e hash. Ao terminar, pare e remova apenas o contêiner `ptw-storage-restore-1`; os volumes de recuperação ficam preservados.

A ativação de uma recuperação é uma operação separada: com os serviços parados, configure a API para o banco recuperado e associe `storage`/`web` aos volumes retornados, em um override do Compose. Confira o esquema/imagens correspondentes ao backup antes de abrir o acesso. Não substitua os volumes originais durante o ensaio.

## Testes locais

```sh
sh test.sh banco auditoria arquivos app recursos
docker compose -f compose.yaml -f api/compose.test.yaml -f compose.ldap-test.yaml run --rm --build api-test
```

Os testes recriam somente bancos descartáveis. O teste de carga de anexos usa 200 MiB e confere a memória da API. A bateria LDAP cobre LDAPS, StartTLS, grupos, senha vazia/incorreta, CA não confiável, indisponibilidade, identidade reciclada, bloqueio concorrente e persistência após reinício. A interface é conferida em 390, 768, 1024 e 1440 px. Evidências específicas e limites restantes ficam em `../fabrica/diario.md`.

## Aparência da planta (tema)

O nome, o logotipo, as cores e a fonte do app vêm da pasta `tema/` deste diretório e podem ser trocados com o sistema no ar:

```sh
sh tema.sh <pasta-do-tema>   # copia tema.json, logotipo e fonte para ./tema
sh tema.sh padrao            # volta à aparência padrão
```

Depois, recarregue a página. As regras do `tema.json` estão em `tema/README.md`. As cores de estado (verde, azul, âmbar, vermelho) não mudam com o tema.
