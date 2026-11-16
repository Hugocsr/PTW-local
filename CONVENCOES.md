# Convenções do código

Regras para quem mexe no código, pessoa ou agente. São poucas e quase todas são conferidas por máquina: se `sh check.sh` passa, você não quebrou nenhuma das conferidas. Regras de produto estão em `AGENTS.md`; de interface, em `DESIGN.md`.

## 1 Antes de dizer "pronto"

```sh
sh check.sh              # app + API: tipos, lint (camadas e tamanho), testes, cópia do núcleo. Sem Docker.
sh ptw-server/test.sh    # só se mexeu em ptw-server/db, compose ou contêineres (precisa de Docker)
```

- **Zero erros.** Não existe erro "aceito". Não desligue regra de lint, não use `// eslint-disable`, `@ts-ignore`, `as any` nem `.skip` para passar; conserte a causa.
- Mexeu em tela: abra em 390, 768, 1024 e 1440 px e olhe a imagem (`DESIGN.md`).
- Diga o que não conferiu.

## 2 Onde cada coisa mora

| Você vai escrever… | Vai em… | Nunca em… |
|---|---|---|
| Uma regra ("pode assinar?", "em que grupo cai?", um cálculo, um texto montado a partir de dados) | `ptw-mockup-v2/src/core/<assunto>.ts` + `<assunto>.test.ts` | componente, loja, API |
| Uma regra de **segurança** (quem pode, o que trava) | o item acima **e** `ptw-server/db/schema/` + `db/tests/invariants.sql` | só no app |
| Formatação de PT, data, duração | `core/permitFormat.ts`, `core/time.ts` | componente |
| Uma tela | `src/components/work` (trabalho), `registry` (cadastro e configuração), `audit` | `shell`, `signal` |
| Uma peça usada por mais de uma tela | `src/components/shell` (moldura, estado, ícones) ou `signal` (indicadores da PT) | copiada em cada tela |
| Um componente shadcn | `src/components/ui`, pelo CLI | editado à mão |
| Leitura ou escrita no servidor | `src/data/api/*` atrás de `src/data/port.ts`; a tela usa `@/data/hooks` | `fetch` em componente |
| Uma operação da API | `ptw-server/api/openapi.yaml` primeiro, depois `src/routes` + `src/repo`, teste em `test/` | rota sem contrato |
| Arquivo temporário, captura, roteiro de teste manual | o scratchpad da sessão | o repositório |

## 3 Camadas (o lint recusa o contrário)

Cada pasta só importa das que estão abaixo dela:

```
components/work · registry · audit     telas
components/shell · signal              peças comuns (não importam telas)
components/ui                          shadcn (não importa nada do app)
data · sim · audit · permit · registry lojas e acesso à API (não importam componentes)
core                                   regras puras (sem React, sem lojas, sem API)
lib                                    utilitários (não importam mais nada)
```

- Componente não importa `@/data/api` nem `@/data/memory`: só `@/data/port`, `@/data/hooks`, `@/data/context`.
- Se o lint disser "import is restricted", a mensagem diz para onde mover. Mova; não crie exceção.
- A configuração está em `ptw-mockup-v2/eslint.config.js`. Só mude as camadas mudando este documento junto.

## 4 Tamanho

- Arquivo novo: no máximo **500 linhas** de código (o lint conta). Passou, divida por assunto.
- Não há exceção: nenhum arquivo passa de 500. Não crie teto próprio para um arquivo.
- **Tela grande vira pasta com entrada, do mesmo jeito:** `components/registry/TemplatesView.tsx` só reexporta `TemplatesView/*.tsx` (hoje também `FormEditor`, `FormFill`, `ImportView`). De fora, importe da entrada (`./FormFill`), nunca de `./FormFill/FillItem`.
- **Assunto grande de `core` vira pasta com entrada.** `core/form.ts` só reexporta `core/form/*.ts` (um arquivo por parte do assunto). Todo mundo importa da entrada (`@/core/form`, ou `./form.ts` dentro de core); o lint recusa `@/core/form/x` fora de core. Hoje: `audit`, `form`, `templatePackage`. Para dividir outro: mova os trechos para a pasta, deixe `export * from "./<pasta>/<parte>.ts"` na entrada, rode `sh check.sh` e `node ptw-server/api/scripts/sync-shared.mjs`.
- Componente com mais de ~150 linhas de JSX ou mais de 6 `useState`: separe um componente filho ou um gancho.

## 5 Como escrever

- **Nomes de código em inglês; texto que a pessoa lê em português do Brasil.** Comentário em inglês, curto, dizendo a regra e o porquê, nunca a história ("antes era…").
- **O banco manda nos nomes.** Campo do app = coluna do banco em camelCase. Não invente sinônimo.
- Tipos explícitos nas fronteiras (parâmetros e retorno de função exportada). Sem `any`.
- Uma função exportada de `core` tem um comentário de uma a três linhas dizendo o que decide.
- Erro de regra tem código (`PTWnn` do banco, `PTAnn` da API) e mensagem em `core/ptwErrors.ts`. Não escreva mensagem solta.
- Cor de estado só por `StatusBadge` / `TONE_*` (`shell/Status.tsx`). Tamanho de texto só pela escala `type-*`.
- Ativo ou local citado na tela leva o ícone do tipo: `<AssetIcon id>` / `<LocationIcon id>` (`shell/TypeIcon.tsx`).
- Lista grande (PTs, assinaturas, ativos): use `core/indexes` (`byId`, `signaturesOf`…); nada de `find`/`filter` por linha.
- Não deixe código morto, `console.log`, nem "TODO" sem dono. Não comente código para "guardar". Peça "pronta para usar depois" também é código morto: crie quando a tela precisar. Material antigo (capturas, vídeos, protótipos) não fica no repositório: o git guarda.

## 6 Receitas

**Regra nova de negócio**
1. Função pura em `src/core/<assunto>.ts`, com teste em `<assunto>.test.ts` cobrindo cada ramo.
2. Se é de segurança: a mesma regra em `ptw-server/db/schema/` (arquivo do domínio), teste em `db/tests/invariants.sql`, `sh ptw-server/db/reset.sh`, `sh ptw-server/test.sh banco`.
3. A tela chama a função; não repete a condição.
4. Atualize `AGENTS.md` (regra de produto) e a linha do arquivo em `ptw-mockup-v2/AGENTS.md`.

**Tela nova**
1. `src/components/<grupo>/<Nome>View.tsx`, dentro de `<Page>` + `<PageHeader>`.
2. Chave em `shell/nav.ts` (menu) e em `VIEWS` de `App.tsx`. A chave é o endereço: nunca renomeie.
3. Dados por um gancho de `@/data/hooks`; o que for decisão vai para `core`.
4. Captura nas quatro larguras; registre a tela em `DESIGN.md`.

**Operação nova na API**
1. Descreva em `ptw-server/api/openapi.yaml`; `npm run gen:api` em `ptw-server/api` **e** em `ptw-mockup-v2`.
2. Rota em `src/routes`, SQL em `src/repo`, teste em `test/`. Escrita exige permissão e fica na auditoria.
3. No app: método em `src/data/port.ts`, implementação em `src/data/api/` e em `src/data/memory/` (testes).

**Código de erro novo (`PTWnn`)**: esquema + tabelas do `README.md` e de `db/MODELO.md` do servidor + `db/tests/invariants.sql` + `core/ptwErrors.ts`. `db/tests/ptw_codes.sh` confere os quatro.

**Ícone novo de tipo**: chave e rótulo em um grupo de `src/registry/typeIcons.ts`; desenho em `components/shell/TypeIcon.tsx`. Chave gravada no banco: nunca renomeie nem remova.

**Mudança no pacote `ptw.modelo/1`**: `src/core/templatePackage.ts` + teste; `node ptw-server/api/scripts/sync-shared.mjs`; `node ptw-mockup-v2/scripts/validar-modelo.ts --esquema .claude/skills/ptw-modelo-de-formulario/ptw-modelo.schema.json`; atualize `SKILL.md` e `padroes.md` da skill.

**Mudança no esquema do banco**: edite o arquivo do domínio em `ptw-server/db/schema/` (cada objeto uma vez, na forma final, sem `ALTER`), `db/MODELO.md`, e recrie com `sh ptw-server/db/reset.sh`. **Não há migrações**: estamos em desenvolvimento e o banco é recriado do zero.

**Tema de uma planta (cores, logotipo, fonte)**
1. Crie uma pasta com `tema.json` e os arquivos (regras em `ptw-server/tema/README.md`). De cliente: `clientes/<cliente>/tema/` (fora do git).
2. `sh ptw-server/tema.sh <pasta>` e recarregue a página; `sh ptw-server/tema.sh padrao` desfaz.
3. Abra o console do navegador: `tema.json: …` diz o que foi recusado.
4. Chave nova no tema: `core/brand.ts` (`parseBrand`, `brandVars`) com teste, e a tabela do README do tema. Nunca uma cor de estado.

## 7 Git e documentos

- Commit só quando o dono pedir ou já tiver autorizado a tarefa; mensagem em português, dizendo o que mudou para quem usa.
- `ptw-server/secrets/` e `clientes/` nunca entram no git.
- Mudou comportamento, tela ou modelo de dados: atualize o documento que o descreve (`AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, `db/MODELO.md`) na mesma tarefa, e acrescente uma linha em `fabrica/diario.md`.

## 8 Quando não souber

- A regra existe? Procure em `src/core` e em `ptw-server/db/schema` antes de escrever outra.
- O documento e o código discordam? O código e o banco valem; conserte o documento e diga.
- É decisão de produto (o que a pessoa pode fazer, o que aparece, o que trava)? Pergunte ao dono. É decisão de código? Siga este arquivo; se ele não cobre, escolha o mais simples e acrescente a regra aqui.

## Dívida conhecida

- `src/sim/` é uma fachada antiga sobre a sessão e o relógio; código novo usa `@/data/context`.
