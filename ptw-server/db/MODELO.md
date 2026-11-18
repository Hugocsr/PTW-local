# Modelo de dados — referência para o app

Resumo de `db/schema/` (a fonte; em caso de dúvida, vale o SQL). O app alinha os tipos TypeScript a isto. Tudo vive no schema `ptw`.

**Convenções**
- Chave: `uuid` v7 (`uuidv7()`; o cliente pode gerar offline). Toda tabela de unidade tem `unit_id` e chave `(unit_id, id)`; as referências são compostas, então nada aponta para outra unidade. A API só vê a unidade da sessão (RLS).
- Tempo: `timestamptz` (ISO 8601 com fuso no JSON). Dia de validade: `date` (`AAAA-MM-DD`), avaliado no fuso da unidade (`unit.timezone`).
- Datas dentro de JSON (formulário e respostas): `"AAAA-MM-DD"`, sempre completas.
- Hash: `bytea` de 32 bytes (SHA-256); no JSON da API, hexa minúsculo.
- `revision` + `updated_at` nos cadastros, no modelo e na versão do modelo: concorrência otimista (`UPDATE … WHERE revision = $esperada`; o gatilho soma 1 em todo `UPDATE`, mesmo sem mudança; fora do diff da trilha). Na PT, `row_version` faz esse papel e `revision` é a revisão assinada.
- **Quem age é a pessoa da sessão** (`ptw.current_person()`): `permit.author_id`, `permit_answer.answered_by` e `attachment.captured_by` são preenchidos pelo banco com ela (o valor enviado é ignorado; sem pessoa na sessão, como numa carga pelo dono, vale o enviado). O solicitante não muda depois (`PTW05`).
- Colunas geradas (não se grava): `search`, `path`, `holds`, `num`, `object_key`.

## Tipos (enums)

| Tipo | Valores |
|---|---|
| `record_origin` | `manual`, `csv`, `sugerida`, `ad` |
| `record_status` | `ativo`, `em_revisao`, `inativo` |
| `type_family` | `local`, `ativo`, `cargo`, `relacao` |
| `version_status` | `rascunho`, `ativa`, `arquivada` |
| `version_origin` | `manual`, `sugerida` |
| `stage_kind` | `solicitacao`, `emissao`, `aceite_campo`, `entrega`, `aceite_area` |
| `slot_kind` | `cargo`, `pessoa` |
| `permit_state` | `rascunho`, `em_analise`, `devolvida`, `emitida`, `ativa`, `suspensa`, `entregue`, `encerrada`, `cancelada`, `expirada` |
| `attach_kind` | `foto`, `video`, `arquivo` |
| `auth_method` | `senha`, `ldap`, `pin`, `sessao`, `emergencia`, `servico`, `sistema` |

## Cadastro

| Tabela | Para quê | Colunas |
|---|---|---|
| `unit` | Unidade (planta) | `id`, `code` (`^[A-Z0-9-]{2,16}$`, único), `name`, `timezone` (padrão `America/Sao_Paulo`) |
| `type_def` | Tipos configuráveis | `id`, `family`, `label` (único por família, sem caixa), `icon?` (`^[a-z0-9_]{1,40}$`, só local e ativo), `system_key?` (`parte_de` na relação que trava equipamento; tipo com chave não sai e a chave não muda nem é dada depois, `23514`), `active` |
| `location` | Árvore de locais | `id`, `parent_id?`, `type_id` (família local), `code` (único, sem caixa), `name`, `aliases[]`, `origin`, `status`, `path` (gerado), `revision`, `updated_at`. Local não fica dentro de si (`PTW02`) |
| `asset` | Equipamento | `id`, `type_id` (família ativo), `code` (único, sem caixa), `name`, `aliases[]`, `origin`, `status`, `revision`, `updated_at` |
| `asset_location` | Ativo em local (n:n) | `asset_id`, `location_id` |
| `asset_relation` | Relação entre ativos | `id`, `from_id`, `to_id`, `kind_id` (família relacao). Em "parte de", `from_id` é parte de `to_id`. Não se altera: remove e cria. Ciclo → `PTW11`; juntar duas PTs abertas → `PTW10` |
| `asset_part` | Fecho de "parte de" (só leitura) | `ancestor_id`, `descendant_id`, `paths`; inclui `(x, x)` |
| `person` | Pessoa | `id`, `name`, `company`, `employee_id`, `login?` (sem login = contato: não assina), `enabled`, `account_expires?`, `ad_object_guid?`, `origin`, `status`, `revision`, `updated_at` |
| `person_role` | Cargo da pessoa | `id`, `person_id`, `role_id` (família cargo), `scope_location_id?` (o local e abaixo; nulo = unidade inteira), `valid_until` (último dia válido). Um por pessoa + cargo + escopo |
| `option_list` | Lista de opções | `id`, `name` (único, sem caixa), `revision`, `updated_at` |
| `option_item` | Opção | `id`, `list_id`, `label`, `active` (inativo: não é oferecido, continua legível), `position` |

**Elegível** (`person_ineligible`): cadastro `ativo`; se tem login, conta `enabled` e não vencida; com cargo exigido, um `person_role` desse cargo com `valid_until >= hoje` e escopo que cubra o local da PT. Com vários cargos (`person_ineligible_any`, assinatura com `role_ids`): elegível com **qualquer um** deles. Para **assinar**, além disso, login é obrigatório.

## Modelos

| Tabela | Para quê | Colunas |
|---|---|---|
| `retention_class` | Prazo de guarda da trilha | `code`, `label`, `years` (5–100), `basis`. Classes: `pet`, `pt`, `cadastro` (5 anos) |
| `template` | Modelo de PT | `id`, `name` (único), `retention_class` (padrão `pt`), `revision`, `updated_at` |
| `template_version` | Versão do modelo | `id`, `template_id`, `number` (> 0, único no modelo), `revision`, `updated_at` (concorrência otimista do rascunho; quem edita só etapas, assinaturas ou escopo confere a revisão com um `UPDATE` da própria versão na mesma transação), `status`, `note`, `form` (JSON, abaixo), `origin`, `source_sha256?` + `import_source?` (os dois obrigatórios se `sugerida`, e só nela: SHA-256 do pacote `ptw.modelo/1` e a origem, abaixo), `max_window?` (`interval` > 0: prazo máximo da janela das PTs desta versão; nulo = sem limite; app: `maxWindowHours`), `holds_equipment` (padrão `true`: as PTs desta versão entram na trava de equipamento; `false` = a PT nem prende nem é barrada, ex.: desabilitação de intertravamento; app: `holdsEquipment`; congelado na versão ativa), `created_at`, `activated_at?` |
| `version_location_type` / `version_asset_type` | Escopo: tipos aceitos | `version_id`, `type_id` |
| `stage` | Etapa | `id`, `version_id`, `position` (única na versão), `name`, `kind?` (no máximo uma de cada por versão), `locked` |
| `sign_slot` | Assinatura da etapa | `id`, `version_id`, `stage_id` (da mesma versão), `position`, `meaning?` (1–120), `kind`, `role_ids[]` (cargos da unidade, sem repetir, até 20; vale **qualquer um**; cargo usado não sai, `23503`; app: `roleIds`), `person_id?` (só e sempre com `kind = pessoa`), `min` (1–20), `required`, `required_when_item?` + `required_when_values[]?` (juntos; exigem `required`), `required_when_line?` (só com o item). `meaning` nulo e `role_ids` vazio só no rascunho: ativar exige (`PTW28`) |
| `separation` | Duas assinaturas por pessoas diferentes | `version_id`, `slot_a`, `slot_b` (`slot_a < slot_b`, mesma versão), `locked` |
| `form_snapshot` | Formulário congelado | `sha256`, `form`; somente inclusão, deduplicado |

Versão: `rascunho` é editável (ela e os filhos); `ativa` (no máximo uma por modelo) só vira `arquivada`; `arquivada` é histórico (`PTW03`). `version_activate(unit, versão)` arquiva a anterior e confere que toda assinatura tem ao menos um cargo e significado (`PTW28`), que cada `required_when_item` existe no formulário e, com `required_when_line`, é uma verificação com essa linha, e que as listas citadas pelo formulário conferem: `answerListId` existe e `blockOn`/`noteOn` são itens dela; `blockOptionIds` são itens de `listId` (`form_list_problem`, `PTW15`).

**Condição da assinatura** (`slot_required(assinatura, respostas)`, igual a `evalCondition` do app): obrigatória e, com condição, sem linha → a resposta do item é `marcacao` com uma das opções em `required_when_values`; com linha → `respostas[item].lines[linha].a` está em `required_when_values`. Sem resposta → não conta. No app: `requiredWhen = { itemId, lineId?, anyOf }`.

**Origem da importação** (`template_version.import_source`; mesmas chaves do `ImportSource` do app; conferida ao gravar, `PTW15`):

```jsonc
{ "pacote": { "arquivo": "x.ptw-modelo.json", "sha256": "<igual a encode(source_sha256, 'hex')>" },
  "documentos": [ { "arquivo": "PT.pdf", "sha256": "<64 hexa>", "paginas": 3 } ],   // pode ser [] (pacote de outra planta)
  "ferramenta": "ptw-modelo-de-formulario 1.0", "modelo"?: "<modelo de IA>", "idioma"?: { "documento": "en", "rotulos": "pt-BR" },
  "importadoEm": "2026-11-09T10:00:00-03:00",
  "trechos": { "<id do elemento>": { "pagina": 1, "trecho": "<texto literal, não vazio>", "arquivo"?: "<um dos documentos>",
                                     "original"?: "<rótulo no idioma do documento>", "confianca"?: "alta|media|baixa", "observacao"?: "…" } } }
```

Importar = uma transação: versão `sugerida` com `source_sha256` e `import_source`, etapas, assinaturas, listas/tipos/cargos novos e, por fim, `audit_import(versão, {"listas": [id], "tipos": [id], "cargos": [id]})`, que grava `modelo.importado` com o pacote, os documentos, a ferramenta, o modelo de IA, o idioma e os totais (`{"versao", "etapas", "assinaturas", "secoes", "itens", "listasNovas", "tiposNovos", "cargosNovos", "separacoes"}`). Sem esse evento, o commit é recusado (`PTW14`).

## PT

| Tabela | Para quê | Colunas |
|---|---|---|
| `permit` | Permissão de trabalho | `id`, `number?` (`PT-<UNIDADE>-<AAAA>-<00001>`, sem lacunas, no envio), `template_id`, `version_id`, `state`, `holds` (gerado: prende equipamento), `author_id`, `location_id`, `work_window` (`tstzrange` fechado nas duas pontas), `scope` (1–500), `search` (gerado: número + escopo, minúsculo e sem acento, com índice trigram), `snapshot_sha256?` + `snapshot_at?` (formulário congelado no 1º envio), `revision`, `state_note?`, `hold_reason?`/`hold_by?`/`hold_at?` (parada, os três juntos), `resumed_reason?`/`resumed_by?`/`resumed_at?` (retomada), `created_at`, `updated_at`, `changed_at` (última mudança da PT ou de um filho: assinatura, resposta, anexo, ativo, equipe, revisão, prorrogação; índice `(unit_id, changed_at)`; só ela mudar não soma `row_version` nem entra na trilha), `row_version` |
| `permit_asset` | Ativos da PT | `permit_id`, `asset_id`, `holds` (mantido pelo banco). Só muda no rascunho ou na devolvida (`PTW04`) |
| `permit_team` | Equipe | `permit_id`, `role_id`, `person_id` |
| `permit_answer` | Resposta de um item | `permit_id`, `item_id`, `value` (JSON, abaixo), `num` (gerado: valor de `numero`), `answered_by`, `answered_at` (do servidor) |
| `blob` | Arquivo no S3 | `sha256`, `size` (1 B a 2 GiB), `mime`, `object_key` (gerado: `<unidade>/<aa>/<sha256>`), `stored_at`; somente inclusão |
| `attachment` | Anexo da PT | `id`, `permit_id`, `item_id`, `kind`, `sha256`, `file_name`, `preview_sha256?` (miniatura/capa), `width?`, `height?`, `duration_ms?`, `captured_by`, `captured_at`; somente inclusão |
| `permit_revision` | Revisão aberta | `permit_id`, `rev`, `at`, `reason`, `sha256` (conteúdo); somente inclusão |
| `signature` | Assinatura | `id`, `permit_id`, `rev`, `slot_id`, `person_id`, `signed_at` (do servidor), `voided_at?` + `voided_reason?` (anulada: só uma vez; não muda nem some, `PTW01`) |
| `permit_extension` | Prorrogação da janela | `id`, `permit_id`, `revision`, `old_end`, `new_end` (> `old_end`), `reason` (1–500), `person_id` (a da sessão), `at`; preenchidos e conferidos pelo banco; somente inclusão |

**Estado** (`can_move`; outra mudança → `PTW05`):

| De | Para |
|---|---|
| `rascunho` | `em_analise` (só por `permit_submit`), `cancelada` |
| `em_analise` | `emitida`, `devolvida`, `cancelada` |
| `devolvida` | `em_analise` (reenvio), `cancelada` |
| `emitida` | `ativa`, `em_analise`, `cancelada`, `expirada` |
| `ativa` | `suspensa`, `entregue`, `expirada` (não existe ativa → cancelada) |
| `suspensa` | `ativa`, `entregue`, `expirada` |
| `expirada` | `entregue` |
| `entregue` | `encerrada` |

- PT nasce `rascunho`, sem número, na versão `ativa` do modelo (`PTW04`). Número não muda; `revision` não volta.
- **O rascunho é do solicitante:** só a pessoa da sessão que é o `author_id` altera a PT em `rascunho` e os filhos dela (campos, ativos, equipe, respostas, anexos); outra pessoa, ou nenhuma (fora o dono em manutenção), → `PTW17`, e nada muda.
- **Prende o equipamento** todo estado exceto `rascunho`, `encerrada`, `cancelada`, se a versão do modelo prende (`template_version.holds_equipment`, padrão `true`; a versão da PT só muda no rascunho, `PTW05`). PT de versão que não prende (ex.: desabilitação de intertravamento) não prende e não é barrada: convive com outra PT aberta no mesmo ativo. Um equipamento tem no máximo uma PT que prende, contando "parte de" em qualquer nível e direção (`PTW10`, `hint = equipamento_ocupado`, `detail` = id da PT que prende).
- **Trabalho liberado** (`work_released`, coluna `released` no Quadro): `ativa`, sem parada, agora dentro da janela.
- `permit_submit(unit, pt, p_sign = true)` → número. Exige ao menos um ativo. Congela o formulário montado no banco (`frozen_form(unit, versão)`: o da versão com as opções em uso das listas copiadas para as marcações, as de `blockOptionIds` com `blocks`, sem `listId` nem `blockOptionIds`; igual a `freezeForm` do app). Reenvio de `devolvida`: `revision + 1`, linha em `permit_revision`, assinaturas das revisões anteriores anuladas, formulário congelado mantido. Com `p_sign` (padrão), o solicitante assina na mesma chamada a primeira assinatura da etapa `solicitacao`, se a versão tem e ela é a etapa em curso; a assinatura passa por todas as regras (`PTW08`, `PTW16`, `PTW23`…) e, recusada, nada é enviado.
- `permit_form(unit, pt)`: o formulário congelado ou, no rascunho, `frozen_form` da versão (o rascunho já responde pelas opções que o envio vai congelar).
- `expire_due(unit)`: `emitida`/`ativa`/`suspensa` com a janela vencida → `expirada`.
- **Prazo máximo da janela** (`template_version.max_window`): `fim − início ≤ prazo` ao enviar, ao emitir e sempre que a janela muda fora de rascunho/devolvida (inclui prorrogar, contado do início original) → `PTW31` "A janela passa do prazo máximo deste modelo (até 3 dias)" (`window_label`: dias se múltiplo de 24 h, senão horas).
- **Janela**: editável em `rascunho`, `devolvida` e `em_analise`; da `emitida` em diante só muda por Prorrogar (`PTW05`).
- **Prorrogar** (`permit_extend(unit, pt, novo_fim, justificativa)` → id da prorrogação): PT `emitida` ou `ativa` antes do fim da janela, novo fim depois do atual e justificativa (1–500) (`PTW33`); pela pessoa da sessão, elegível para a primeira assinatura da Emissão, como Retomar (`issuer_ineligible`; `PTW32`); prazo máximo (`PTW31`). Grava `permit_extension`, avança o fim e registra `pt.prorrogada` (`data = {"de": {"fim"}, "para": {"fim"}, "motivo"}`, texto `Janela prorrogada: até DD/MM HH:MM → até DD/MM HH:MM · <justificativa>`).
- **Respostas por estado** (`PTW06`): `encerrada`/`cancelada` não aceitam; `expirada` só nas seções da etapa `entrega`; `entregue` só nas etapas depois da `entrega`.
- **Assinatura**, nesta ordem: PT não encerrada/cancelada, `rev` = revisão atual, assinatura da versão da PT (`PTW07`); estado que aceita assinatura: `em_analise`, `emitida`, `ativa`, `entregue`; `suspensa` só com Retomada; `expirada` e `suspensa` sem Retomada só a Entrega; `rascunho`/`devolvida` não (`PTW19`); só na etapa em curso (`PTW20`); a Solicitação só pelo solicitante (`PTW17`); com parada registrada, Aceite no campo e da área não (`PTW21`); quem retomou não faz o Aceite no campo (`PTW22`); Aceite no campo só dentro da janela e, depois do fim, só a Entrega (e o Aceite da área na entregue) (`PTW23`); pessoa elegível com login, com o cargo da assinatura no local, ou a pessoa indicada (`PTW08`); separação (`PTW09`); uma assinatura por pessoa em cada etapa e revisão (`PTW30`); sem bloqueio no formulário até a etapa dela (`PTW16`).
- **Etapa em curso** (`permit_current_stage(unit, pt)` → id da etapa ou nulo; igual ao trilho do app): a primeira etapa, em ordem, com assinatura que conta (`slot_required`) e menos de `min` assinaturas válidas na revisão atual. `expirada` e `suspensa` sem Retomada pulam para a Entrega; `entregue`, para o Aceite da área.
- **Atos de quem está na sessão** (`ptw.current_person()`, de `set_context`): enviar/reenviar só o solicitante (`PTW17`); devolver, uma pessoa que não é o solicitante (`PTW18`) e é elegível (com login) para uma assinatura pendente da etapa em curso (`PTW29`); **Parar** (`hold_reason/by/at` preenchidos; em `ativa`, junto com `state = 'suspensa'`) só em `emitida`/`ativa`/`suspensa`/`entregue` (`PTW25`), com login ativo e `hold_by` = a pessoa da sessão (`PTW24`); **Retomar** (`hold_*` limpos e `resumed_reason/by/at` preenchidos, numa escrita) só se há parada, com `resumed_by` = a pessoa da sessão, elegível (com login) para a primeira assinatura da Emissão (`PTW26`); `suspensa → ativa` só depois da Retomada e com o Aceite no campo completo (`PTW27`).
- **A Retomada anula o aceite:** retomar uma PT `suspensa` anula as assinaturas do Aceite no campo da revisão atual (`voided_reason = 'Retomada: novo Aceite no campo exigido'`).

### Atos pela função (o que a API chama)

Todos valem para a pessoa da sessão, travam a linha da PT e devolvem o estado em que a PT ficou. PT que não existe na unidade → `23503`. Motivo: 1–500 caracteres depois de aparar, senão `23514` (conferido depois de quem pode, como no app). A API confere `If-Match` lendo `row_version` com `FOR NO KEY UPDATE` na mesma transação, antes de chamar.

| Função | O que faz | Recusas |
|---|---|---|
| `permit_submit(unit, pt, p_sign = true)` → número | Enviar / Reenviar, com a assinatura da Solicitação | `PTW04`, `PTW05`, `PTW10`, `PTW17`, `PTW31`; da assinatura: `PTW08`, `PTW16`, `PTW23` |
| `permit_sign(unit, pt, assinatura, rev, id?)` → estado | Inclui a assinatura da pessoa da sessão e, se a etapa fechou, avança o estado (tabela abaixo) na mesma transação. `id` = id da assinatura gerado no cliente: repetir a chamada com o mesmo id não assina de novo (o mesmo id em outra assinatura → `23505`) | as da assinatura (`PTW07`–`PTW09`, `PTW16`, `PTW17`, `PTW19`–`PTW23`, `PTW30`), `PTW31` em toda assinatura da Emissão, `PTW27`; sem pessoa na sessão `PTW08` |
| `permit_return(unit, pt, motivo)` | em análise → devolvida, motivo em `state_note` | `PTW05` (fora de em análise), `PTW18`, `PTW29`, `23514` |
| `permit_stop(unit, pt, motivo)` | Parada (`hold_*`, hora do servidor); ativa → suspensa na mesma escrita; limpa `resumed_*` | `PTW25`, `PTW21` (já parada: aguarda Retomada), `PTW24`, `23514` |
| `permit_resume(unit, pt, motivo)` | Limpa a parada e grava `resumed_*`; na suspensa, anula o Aceite no campo | `PTW26` (sem parada, ou quem não pode emitir), `23514` |
| `permit_discard(unit, pt, motivo)` | Descartar o rascunho: rascunho → cancelada, motivo em `state_note` | `PTW05` (só o rascunho), `PTW17` (só o solicitante), `23514`. O `UPDATE` direto rascunho → cancelada segue a mesma regra |
| `permit_extend(unit, pt, novo_fim, justificativa)` → id | Prorrogar (acima) | `PTW31`–`PTW33`, `PTW05` |
| `permit_answer_put(unit, pt, item, valor)` → valor gravado | Grava a resposta; em `verificacao`, junta as linhas enviadas às já gravadas numa instrução (dois toques em linhas diferentes não se apagam) | `PTW06`, `PTW08`, `PTW15`; sem pessoa na sessão `23502` |

**Estado depois da assinatura** (`permit_state_after_sign(unit, pt)`; um passo por vez; caso a caso igual a `stateAfterSign` de `core/signing.ts`, com a mesma tabela em `db/tests/invariants.sql`). "Concluída" (`stage_done(unit, pt, tipo)`) = a etapa existe na versão e toda assinatura que conta (`slot_required`) tem `min` assinaturas válidas na revisão atual; etapa sem assinatura exigida conta como concluída; etapa que a versão não tem, não.

| Estado | Condição | Vai para |
|---|---|---|
| `rascunho`, `devolvida` | (o envio) | `em_analise` |
| `em_analise` | Emissão concluída | `emitida` |
| `emitida` | Aceite no campo concluído | `ativa` |
| `suspensa` com Retomada | Aceite no campo concluído | `ativa` (e `resumed_*` são limpos) |
| `ativa` | Entrega concluída | `entregue` |
| `expirada`, `suspensa` sem Retomada | Entrega concluída | `entregue` |
| `entregue` | Aceite da área concluído | `encerrada` |
| qualquer outro caso | | não muda |

A assinatura é sempre da pessoa da sessão: linha com outra `person_id` é recusada (`42501`), salvo o superusuário em manutenção. Duas assinaturas ao mesmo tempo na mesma PT entram uma depois da outra (a linha da PT fica travada): a segunda já vê o estado e a etapa em curso que a primeira deixou. Cada transação mexe em **uma PT** e trava primeiro a PT, depois a ponta da trilha; uma transação que escrevesse em duas PTs poderia se cruzar com outra (`40P01`, que a API repete).

## Formulário (`template_version.form`)

```jsonc
{ "sections": [ { "id": "s1", "title": "Liberação", "stageId": "<id da etapa>"?, "items": [ Item ] } ] }
```

Seção sem `stageId` vale para todas as etapas. Ids de item únicos no formulário (`^[A-Za-z0-9_.:-]{1,64}$`).

**Item** — comuns: `id`, `kind`, `label`, `required?` (bool), `showWhen?` `{ "itemId", "lineId"?, "anyOf": [string] }` (visível se a marcação tem uma das opções, ou a linha da verificação tem uma das respostas).

| `kind` | Campos |
|---|---|
| `texto` | `long?` |
| `numero` | `unit?`, `decimals?` (0–4), `negative?`, `min?`, `max?` (número ou null; `min <= max`) |
| `horario` | `seconds?` |
| `marcacao` | `options?` `[{id, label, blocks?}]` (`blocks`: a opção impede a etapa), `listId?` (uuid de `option_list`), `blockOptionIds?` (uuids de itens da lista que impedem; não vazio exige `listId`), `multiple?`, `other?` |
| `verificacao` | `answers` (`sim_nao_na` \| `sim_nao` \| `confirmo` \| `lista`), `answerListId?` (só e sempre com `lista`: uuid de `option_list`), `lines` `[{id, label, blockOn?: [r], noteOn?: [r]}]`, r ∈ `sim` `nao` `na` `confirmo` ou, com `lista`, uuid de item da lista |
| `aviso` | `text` (sem resposta) |
| `anexo` | `accept` `[foto \| video \| arquivo]`, `min?`, `hint?` |
| `documento` | `pattern?` (`#` dígito, `A` letra, resto literal; não vazio), `attach?`, `validity?` |
| `data` | `notBeforeToday?`, `min?`, `max?` (`AAAA-MM-DD`) |
| `pessoa` | `multiple?`, `roleId?` (uuid de cargo), `mustBeEligible?` |
| `isolamento` | `minRows?` |
| `grupo` | `minRows?`, `columns` `[Item]` (só texto, numero, horario, marcacao, verificacao; sem `showWhen`; ids únicos) |

## Respostas (`permit_answer.value`)

`"t"` é o `kind` do item. Conferida ao gravar contra o item do formulário da PT (`PTW15`).

| `t` | Forma | Regras ao gravar |
|---|---|---|
| `texto` | `{"t", "v": string}` | |
| `numero` | `{"t", "v": number}` | sem negativo se `!negative`; casas ≤ `decimals`. Fora de `min`/`max` é aceito (bloqueia a assinatura) |
| `horario` | `{"t", "v": "HH:MM"}` ou `"HH:MM:SS"` com `seconds` | 00:00–23:59 |
| `marcacao` | `{"t", "ids": [string], "other"?: string}` | ids das opções ou itens da lista; uma só sem `multiple`; `other` só com `other` |
| `verificacao` | `{"t", "lines": {<lineId>: {"a": r, "note"?: string}}}` | r dentro de `answers`; com `lista`, id de um item de `answerListId` |
| `anexo` | `{"t", "files": [<attachment.id>]}` | anexos desta PT, sem repetir, de tipo em `accept` |
| `documento` | `{"t", "code": string, "files": [<attachment.id>], "validUntil"?: "AAAA-MM-DD"}` | código fora do formato é aceito (bloqueia) |
| `data` | `{"t", "v": "AAAA-MM-DD"}` | completa e existente |
| `pessoa` | `{"t", "ids": [<person.id>]}` | pessoas da unidade; uma só sem `multiple`; com `roleId`, têm o cargo; com `mustBeEligible`, não elegível → `PTW08` |
| `isolamento` | `{"t", "rows": [{"id", "point", "method", "lock", "assetId"?, "energy"?, "zero"?: "sim" \| "nao", "by"?}]}` | `assetId` ativo da PT; `by` pessoa da unidade; `energy` ∈ `eletrica mecanica hidraulica pneumatica termica quimica gravitacional outra`; ids de linha únicos |
| `grupo` | `{"t", "rows": [{"id", "answers": {<columnId>: resposta}}]}` | cada resposta conferida contra a coluna; ids de linha únicos |

**Completude da assinatura** (`permit_missing(unit, pt, etapa)` → texto ou nulo; na assinatura, `PTW16`, `Falta responder: <rótulo>`): nas seções da própria etapa (seção sem etapa vale para a primeira), itens visíveis (`showWhen`) obrigatórios sem resposta: texto, número, data, horário, marcação, pessoa; anexo abaixo de `min`; documento sem código, arquivo (`attach`) ou validade (`validity`); verificação com linha sem resposta ou sem justificativa em `noteOn`; isolamento/grupo abaixo de `minRows` ou com campos faltando. Só a primeira assinatura da etapa na revisão confere (espelho de `itemProblems`, `missing`, no app).

**Bloqueio da assinatura** (`permit_blocker(unit, pt, posição da etapa)` → texto ou nulo; na assinatura, `PTW16`): nos itens visíveis das seções até a etapa — número fora da faixa; marcação com opção que impede (`blocks` ou `blockOptionIds`: `<rótulo>: “<opção>” impede a etapa`); verificação respondida em `blockOn` (com `lista`, o rótulo do item); documento com código fora do formato, sem arquivo (`attach`), sem validade (`validity`) ou vencido; data antes de hoje (`notBeforeToday`) ou fora de `min`/`max`; pessoa não elegível (`mustBeEligible`, na hora); isolamento com `zero = "nao"`; o mesmo nas colunas de grupo. Datas na mensagem: `dd/mm/aaaa`.

## Sessão e idempotência da API

| Tabela | Para quê | Colunas |
|---|---|---|
| `api_session` | Sessão persistente | `id`, `token_sha256` (SHA-256 do cookie, único; nunca o cookie), `person_id`, `auth`, `grants` (subconjunto de cadastro/modelos/auditoria/exportacao), `client?`, `created_at`, `seen_at`, `expires_at`, `ended_at?`. Identidade, grants e prazo absoluto são imutáveis (`PTW01`); API só marca atividade e encerra, nunca apaga (`42501`). Prazo absoluto e inatividade conferidos em cada requisição; `session_expire(segundos)` encerra as vencidas e registra `sessao.expirada` uma vez. |
| `login_attempt` | Bloqueio persistente de tentativas | Chave por unidade e SHA-256 do login/origem, início da janela e tentativas. API sem escrita direta; `login_reserve` reserva atomicamente antes do bind (5 por login, 30 por origem em 15 min), retorna espera em segundos. `login_succeeded` zera só o login. Bloqueio/liberação entram na trilha. |
| `api_idempotency` | `Idempotency-Key` por pessoa | `person_id`, `key` (uuid), `operation`, `body_sha256`, `status?`, `response?` (JSON; o que a API quiser repetir: corpo, tipo, ETag), `created_at`. Só recebe a resposta, uma vez (`PTW01`); a API não apaga |

- `unit_by_code(código)` → id da unidade (nulo se não existe): a API resolve `PTW_UNIT` antes de abrir o contexto (o RLS não mostra unidades sem contexto).
- `idempotency_begin(chave, operação, sha256_hex_do_pedido)` → `(situacao, status, response, created_at)`, na **mesma transação da escrita**: `nova` (execute e chame `idempotency_finish(chave, status, resposta)` antes do commit; chave reservada sem resposta é recusada no commit, `PTW14`), `repetida` (devolva `status` e `response`) ou `diferente` (outra operação ou outro pedido: a API responde `PTA08`). Escrita recusada → o rollback solta a chave. Duas requisições iguais ao mesmo tempo: a segunda espera a primeira e recebe `repetida`.
- Limpeza pelo operador: sessões encerradas há 30 dias, idempotências com 30 dias e contadores de tentativa com 1 dia; nunca remove auditoria. `tools/ptw_operacao.py` faz manutenção e registra o evento.

## Auditoria (leitura)

- `v_audit`: `unit_id`, `seq`, `at`, `ok`, `action`, `text`, `reason`, `actor_id`, `actor_name`, `role_id`, `role_label`, `auth`, `client`, `request_id`, `permit_id`, `permit_number`, `rev`, `asset_id`, `asset_code`, `entity`, `entity_id`, `data`, `hash`, `prev_hash`.
- `v_permit_history` (Histórico da PT, sem `acesso.*`): `unit_id`, `permit_id`, `seq`, `at`, `ok`, `action`, `text`, `rev`, `actor_id`, `actor_name`, `data`.
- `data` de mudança: `{"de": {…}, "para": {…}}` só com as colunas que mudaram. Ações e a forma canônica do hash: README, "Auditoria".
- Escrita só por funções: `set_context(unit, person, role?, auth, client?, request?, reason?, p_undo?)` no começo de toda transação; `audit_denied`, `audit_access`, `audit_log`, `audit_system`, `audit_import`.
- Exportação: `audit_seq_range(unit, de, até)`, `audit_export_lines(unit, primeiro, último)` e `audit_export_record(unit, primeiro, último, sha256_do_jsonl, sha256_do_manifesto, motivo, manifesto?, id?)`, que grava `audit_export` (`id`, `first_seq`, `last_seq`, `file_sha256`, `manifest_sha256`, `reason`, `actor_id`, `at`, `manifest?`) e o evento `acesso.exportacao`. `manifest` guarda os bytes exatos do manifesto (texto UTF-8), conferidos contra `manifest_sha256` (`PTW14` na função, `23514` na tabela); a API lê de volta por `id`. O JSONL não é guardado: refaz-se por `audit_export_lines` e confere-se com `file_sha256`.
- Cada abertura de PT (`audit_access('acesso.pt.aberta', pt)`) é um evento; o banco não agrupa leituras.
- **Desfazer** (`set_context(…, p_undo => true)`): cada escrita da transação sai com `action` = ação normal + `.desfeito` (ex.: `cadastro.ativo.alterado.desfeito`), `text` = `Desfazer: ` + texto normal e `reason` = `Desfazer` (se nenhum motivo for dado). `data` é o de/para da escrita inversa.

## Visões

- `v_permit_board`: `unit_id`, `id`, `number`, `state`, `state_label`, `scope`, `window_start`, `window_end`, `released`, `revision`, `author_id`, `author_name`, `location_id`, `location_name`, `location_path`, `template_id`, `template_name`, `version_number`, `asset_codes[]`, `updated_at`, `row_version`, `search`, `changed_at`.
- `v_equipment_hold`: `unit_id`, `asset_id`, `asset_code`, `permit_id`, `number`, `state`.

## Quadro e Minha área (funções de leitura)

- `permit_next_rows(unit, ids[], pessoa)` → `(permit_id, stage_id, stage_name, label, mine)` para várias PTs numa consulta: a etapa com a assinatura pendente, quem move a seguir (`"Marina · Emissão"`, `"Rafael · Enviar"`, `"… · Retomada"`, `"Sem elegível · …"`, `"—"`; como `nextLabel` do app) e se é a vez da pessoa (como `waitsFor`). A API pede a página do Quadro em `v_permit_board` (filtro, ordem, `LIMIT`) e chama esta função só com os ids da página; não é coluna da visão porque custa uma conta por PT.
- `permit_next(unit, pt, pessoa)` → `{"stageId", "stageName", "label", "mine"}` (detalhe da PT); `permit_next_label(unit, pt)` e `permit_mine(unit, pt, pessoa)` são atalhos.
- `my_permits(unit, pessoa, dias = 2)` → ids: as PTs que dizem respeito à pessoa (o conjunto de `myWork` do app, que as agrupa): abertas, mais as encerradas e canceladas mexidas (`changed_at`) nos últimos `dias`, em que ela é solicitante, está na equipe, assinou, parou ou retomou; e as abertas já enviadas em que tem uma assinatura a dar na etapa em curso (cargo com escopo no local, ou pessoa indicada, e ainda não assinou) ou pode retomar a parada.
- `pending_slot(unit, pt, versão, estado, revisão, resumed_at)` → a assinatura pendente (como `pendingSlot` do app); `slot_candidates(unit, tipo, cargos[], pessoa, hoje, caminho_do_local)` → `(person_id, name, ok)`: quem a assinatura alcança e se é elegível agora (como `checkSlotAt`); `person_ok(unit, pessoa, cargos[], hoje, caminho, exige_login)` = `person_ineligible_any(...) is null` em SQL puro.
- No app a lista de pessoas segue a ordem do cadastro; no banco, elegíveis antes e depois por nome.

## Códigos de erro

| Código | Quando |
|---|---|
| `PTW01` | Registro somente inclusão (formulário congelado, blob, anexo, revisão, trilha, âncora, exportação, esquema); assinatura só pode ser anulada; identidade da sessão e sessão encerrada não mudam; a chave de idempotência só recebe a resposta, uma vez |
| `PTW02` | Local dentro de si mesmo |
| `PTW03` | Versão em uso ou arquivada (ou filho dela) não muda |
| `PTW04` | PT nasce rascunho na versão em uso; ativos só mudam no rascunho ou na devolvida; envio sem ativo; relação ou ativo da PT alterado em vez de removido e incluído |
| `PTW05` | Mudança de estado fora da máquina; número, revisão ou solicitante mudados; envio fora de rascunho/devolvida; devolver fora de em análise; descartar o que não é rascunho |
| `PTW06` | Resposta em PT encerrada/cancelada, ou fora da etapa em curso (expirada, entregue) |
| `PTW07` | Assinatura em PT encerrada/cancelada, em outra revisão ou de outra versão |
| `PTW08` | Pessoa não elegível (assinatura ou item `pessoa` com `mustBeEligible`) |
| `PTW09` | Mesma pessoa nas duas pontas de uma separação |
| `PTW10` | Equipamento ocupado por outra PT aberta |
| `PTW11` | Ciclo em "parte de" |
| `PTW12` | Hora do evento de auditoria fora da ordem da cadeia |
| `PTW13` | Trilha protegida (partição, tabela ou gatilho; arquivamento antes do prazo ou sem exportação) |
| `PTW14` | Chamada de auditoria ou da API inválida (contexto, negação, acesso, sessão, sistema, âncora, registro do esquema, importação; versão sugerida sem `modelo.importado`; manifesto de exportação que não confere com o SHA-256; idempotência sem sessão, sem chave reservada ou reservada sem resposta) |
| `PTW15` | Formulário, resposta ou origem da importação fora da estrutura; condição de assinatura para item ou linha que não existe |
| `PTW16` | Assinatura bloqueada pelo formulário |
| `PTW17` | Só o solicitante envia a PT, assina a Solicitação, descarta e altera o rascunho |
| `PTW18` | O solicitante não devolve a própria PT |
| `PTW19` | Estado não aceita assinatura (ou só a Entrega) |
| `PTW20` | Assinatura fora da etapa em curso, ou condicional cuja condição não vale nesta PT |
| `PTW21` | Parada registrada: Aceite no campo / da área aguardam a Retomada; parar a PT já parada (`permit_stop`) |
| `PTW22` | Quem retomou não faz o novo Aceite no campo |
| `PTW23` | Fora da janela (Aceite no campo; depois do fim, só a devolução da área) |
| `PTW24` | Parar sem login ativo ou em nome de outra pessoa |
| `PTW25` | Parar com a PT fora de campo |
| `PTW26` | Retomar sem parada, em nome de outra pessoa ou sem ser elegível para a Emissão |
| `PTW27` | Suspensa → ativa sem Retomada e novo Aceite no campo |
| `PTW28` | Ativar versão com assinatura sem cargo ou sem significado |
| `PTW29` | Devolver sem poder assinar a etapa pendente |
| `PTW30` | Mesma pessoa assinando duas vezes a mesma etapa |
| `PTW31` | A janela passa do prazo máximo do modelo (enviar, emitir, prorrogar) |
| `PTW32` | Prorrogar sem poder emitir esta PT, ou em nome de outra pessoa |
| `PTW33` | Prorrogação sem justificativa, com fim que não passa do atual, ou fora de emitida/ativa dentro da janela |
| `PTW34` | Controle elétrico: política/referências, ordem do procedimento, limite do turno ou revalidação não atendidos |
| `42501` | Sem permissão (ex.: a API tentou apagar PT, assinatura, anexo ou auditoria, ou assinar em nome de outra pessoa) |
| `23503` / `23505` / `23514` | Chave estrangeira (inclui PT inexistente num ato), unicidade (inclui o mesmo id de assinatura em outra assinatura), restrição de coluna (ex.: versão sugerida sem pacote; ato sem motivo ou com motivo acima de 500; tipo do sistema removido ou com a chave mudada) |
| `23502` | Responder sem pessoa na sessão (`permit_answer_put`) |
| `40P01` | Travas cruzadas entre duas transações (só se uma transação escrever em duas PTs); a API repete |


## Política elétrica e revalidação de turno

`template_version.form.electrical` referencia itens obrigatórios: `procedure`, `riskAssessment`, `authorizations` (documentos com anexo e validade), `workKind` (classificação), `isolation` e `restoration` (listas ordenadas de verificações Sim/Não de uma linha). `standard` é `vigente2019` ou `preparacao2027`. `shift` referencia `startDate`, `startTime`, `endDate`, `endTime`; obrigatório para 2027. A política permanece no `form_snapshot`, na cópia da versão e no pacote `ptw.modelo/1` (`modelo.politica_eletrica`, refs remapeadas na importação).

O modelo ativo confere documentos/classificação na Solicitação, isolamento antes da Emissão e reenergização no Aceite da área. O banco recusa etapa fora da sequência e janela/prorrogação fora do turno (`PTW34`). Modelos sem política preservam o comportamento anterior.

`permit_revalidation`: `(unit_id,id)`; `permit_id`, `revision`, `old_window`, `new_window`, `shift_window`, `reason`, `conditions_unchanged`, `team_unchanged`, `assessment_confirmed`, `team_sha256`, `person_id`, `at`. Linha imutável, com RLS, somente inclusão pela API e evento `pt.revalidada`. O gatilho força revisão, autoria, horário, janela anterior e hash da equipe; não confia nos valores do cliente.

`permit_revalidate(unit,pt,inicio_turno,fim_turno,fim_atividade,motivo,condicoes_preservadas,equipe_preservada,avaliacao_local)` aceita emitida/ativa/suspensa/expirada, sem parada pendente; exige o emitente original elegível, documentos válidos e equipe elegível. O turno precisa incluir o instante atual; a nova janela começa no instante do servidor e termina até o fim do turno, respeitando o prazo máximo do modelo contado desde o início original, inclusive após revalidações. Atualiza a janela por prova da linha da revalidação na mesma transação, anula o aceite de campo e põe a PT em suspensa aguardando outro aceitante. Entrega/encerramento continuam disponíveis após expiração, sem revalidação obrigatória. A leitura `PermitHeader.revalidation` expõe o último registro; os anteriores permanecem na trilha e na tabela.
