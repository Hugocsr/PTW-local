/**
 * Escritas da PT. Cada ato é UMA função do banco (`permit_submit`, `permit_sign`, `permit_return`,
 * `permit_discard`, `permit_stop`, `permit_resume`, `permit_extend`, `permit_answer_put`): a API não
 * escolhe estado nem pessoa — a pessoa é a da sessão (`set_context`), e o banco decide.
 *
 * Só os campos do rascunho (criar e alterar: local, ativos, equipe, janela, escopo) são instruções
 * diretas, e mesmo nelas o banco força o solicitante, a versão em uso e a trava de equipamento.
 */
import type { OpBody } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { staleOrMissing } from "../../http/ifMatch.js"
import { Q, run } from "./sql.js"

/**
 * Confere a revisão lida (`If-Match` → `row_version`) e trava a linha até o fim da transação: o ato
 * que vem em seguida não perde a corrida para outra escrita. 404 se a PT não existe; 409 PTA06 se mudou.
 */
export async function lockRevision(tx: Tx, id: string, rev: number): Promise<void> {
  const q = new Q()
  const rows = await run<{ row_version: number }>(
    tx,
    `select row_version from ptw.permit where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} for no key update`,
    q.params,
  )
  const cur = rows[0]?.row_version
  if (cur === undefined) return staleOrMissing(null)
  if (Number(cur) !== rev) return staleOrMissing(Number(cur))
}

/** 404 antes de chamar a função do banco (que responderia `23503` "PT inexistente"). */
export async function mustExist(tx: Tx, id: string): Promise<void> {
  const q = new Q()
  const rows = await run(tx, `select 1 from ptw.permit where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")}`, q.params)
  if (rows.length === 0) throw pta.notFound()
}

/** A revisão atual (para o `409 PTA06` depois de um `UPDATE … WHERE row_version`). */
async function currentRowVersion(tx: Tx, id: string): Promise<number | null> {
  const q = new Q()
  const r = await run<{ row_version: number }>(tx, `select row_version from ptw.permit where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")}`, q.params)
  return r[0] ? Number(r[0].row_version) : null
}

// ---------------------------------------------------------------- rascunho

/** Cria o rascunho na versão em uso; o solicitante é a pessoa da sessão (gatilho do banco). */
export async function createDraft(tx: Tx, person: string, body: OpBody<"createPermit">): Promise<string> {
  const q = new Q()
  const tpl = q.p(body.templateId, "uuid")
  const tpl2 = q.p(body.templateId, "uuid")
  // Sem versionId: a versão em uso. Se o modelo não tem, a mais nova — e o banco recusa (PTW04).
  const ver = `coalesce(${q.p(body.versionId, "uuid")},
      (select v.id from ptw.template_version v where v.unit_id = ptw.current_unit() and v.template_id = ${tpl2}
        order by (v.status = 'ativa') desc, v.number desc limit 1))`
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.permit (unit_id, id, template_id, version_id, author_id, location_id, work_window, scope)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${tpl}, ${ver}, ${q.p(person, "uuid")},
             ${q.p(body.locationId, "uuid")}, tstzrange(${q.p(body.windowStart, "timestamptz")}, ${q.p(body.windowEnd, "timestamptz")}, '[)'),
             ${q.p(body.scope, "text")})
     returning id`,
    q.params,
  )
  const id = rows[0]!.id
  if (body.assetIds !== undefined) await syncAssets(tx, id, body.assetIds)
  if (body.team !== undefined) await syncTeam(tx, id, body.team)
  return id
}

/** Campos da PT (`If-Match`). O UPDATE vem sempre: soma a revisão mesmo quando só mudam ativos ou equipe. */
export async function updateDraft(tx: Tx, id: string, rev: number, body: OpBody<"updatePermit">): Promise<void> {
  const q = new Q()
  const windowChanges = body.windowStart !== undefined || body.windowEnd !== undefined
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.permit
        set location_id = coalesce(${q.p(body.locationId, "uuid")}, location_id),
            scope = coalesce(${q.p(body.scope, "text")}, scope),
            work_window = case when ${q.p(windowChanges, "boolean")}
                               then tstzrange(coalesce(${q.p(body.windowStart, "timestamptz")}, lower(work_window)),
                                              coalesce(${q.p(body.windowEnd, "timestamptz")}, upper(work_window)), '[)')
                               else work_window end
      where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and row_version = ${q.p(rev, "integer")}
      returning id`,
    q.params,
  )
  if (!rows[0]) return staleOrMissing(await currentRowVersion(tx, id))
  if (body.assetIds !== undefined) await syncAssets(tx, id, body.assetIds)
  if (body.team !== undefined) await syncTeam(tx, id, body.team)
}

/** `permit_asset` passa a ser exatamente a lista (o que saiu sai; o que entrou entra; a trava confere). */
async function syncAssets(tx: Tx, id: string, wanted: readonly string[]): Promise<void> {
  const list = [...new Set(wanted)]
  const d = new Q()
  await run(tx, `delete from ptw.permit_asset where unit_id = ptw.current_unit() and permit_id = ${d.p(id, "uuid")} and asset_id <> all (${d.uuids(list)})`, d.params)
  if (list.length === 0) return
  const i = new Q()
  // Só os que faltam (o gatilho de inclusão roda antes do ON CONFLICT e recusaria fora do rascunho);
  // ordem fixa (id): duas PTs gravando ativos sobrepostos se enfileiram em vez de se cruzarem.
  const pid = i.p(id, "uuid")
  await run(
    tx,
    `insert into ptw.permit_asset (unit_id, permit_id, asset_id)
     select ptw.current_unit(), ${pid}, x from unnest(${i.uuids(list)}) as x
      where not exists (select 1 from ptw.permit_asset pa where pa.unit_id = ptw.current_unit() and pa.permit_id = ${i.p(id, "uuid")} and pa.asset_id = x)
      order by x`,
    i.params,
  )
}

/** `permit_team` passa a ser exatamente cargo → pessoas. */
async function syncTeam(tx: Tx, id: string, team: Record<string, string[]>): Promise<void> {
  const pairs = Object.entries(team).flatMap(([role, people]) => [...new Set(people)].map((person) => ({ role, person })))
  const d = new Q()
  await run(
    tx,
    `delete from ptw.permit_team t where t.unit_id = ptw.current_unit() and t.permit_id = ${d.p(id, "uuid")}
        and not exists (select 1 from jsonb_to_recordset(${d.json(pairs)}) as w(role uuid, person uuid)
                         where w.role = t.role_id and w.person = t.person_id)`,
    d.params,
  )
  if (pairs.length === 0) return
  const i = new Q()
  await run(
    tx,
    `insert into ptw.permit_team (unit_id, permit_id, role_id, person_id)
     select ptw.current_unit(), ${i.p(id, "uuid")}, w.role, w.person from jsonb_to_recordset(${i.json(pairs)}) as w(role uuid, person uuid)
      where not exists (select 1 from ptw.permit_team t where t.unit_id = ptw.current_unit() and t.permit_id = ${i.p(id, "uuid")}
                           and t.role_id = w.role and t.person_id = w.person)`,
    i.params,
  )
}

// ---------------------------------------------------------------- respostas

export interface AnswerRow {
  value: unknown
  answered_by: string
  answered_at: Date | string
}

/** `ptw.permit_answer_put`: grava (em verificação, junta as linhas) e devolve o que ficou. */
export async function putAnswer(tx: Tx, id: string, itemId: string, value: unknown): Promise<AnswerRow> {
  const q = new Q()
  await run(tx, `select ptw.permit_answer_put(ptw.current_unit(), ${q.p(id, "uuid")}, ${q.p(itemId, "text")}, ${q.json(value)}) as value`, q.params)
  const r = new Q()
  const rows = await run<AnswerRow>(
    tx,
    `select value, answered_by, answered_at from ptw.permit_answer
      where unit_id = ptw.current_unit() and permit_id = ${r.p(id, "uuid")} and item_id = ${r.p(itemId, "text")}`,
    r.params,
  )
  if (!rows[0]) throw pta.unexpected(undefined, "resposta gravada e não encontrada")
  return rows[0]
}

/** Apaga a resposta do item (o banco confere o estado: `PTW06`). Sem resposta, nada a fazer. */
export async function removeAnswer(tx: Tx, id: string, itemId: string): Promise<void> {
  const q = new Q()
  await run(tx, `delete from ptw.permit_answer where unit_id = ptw.current_unit() and permit_id = ${q.p(id, "uuid")} and item_id = ${q.p(itemId, "text")}`, q.params)
}

// ---------------------------------------------------------------- atos

/** Enviar / Reenviar, com a assinatura da Solicitação na mesma chamada. */
export async function submit(tx: Tx, id: string): Promise<void> {
  const q = new Q()
  await run(tx, `select ptw.permit_submit(ptw.current_unit(), ${q.p(id, "uuid")}, true) as number`, q.params)
}

/**
 * O cargo com que a pessoa assina (A4): o primeiro cargo da assinatura que ela tem — válido hoje,
 * se houver; senão o primeiro que ela tem. Nulo na assinatura de pessoa indicada sem cargo seu.
 */
export async function signingRole(tx: Tx, person: string, slotId: string): Promise<string | null> {
  const q = new Q()
  const rows = await run<{ role_id: string }>(
    tx,
    `select r.role_id
       from ptw.sign_slot s
       cross join lateral unnest(s.role_ids) with ordinality as r(role_id, n)
       join ptw.unit u on u.id = s.unit_id
      where s.unit_id = ptw.current_unit() and s.id = ${q.p(slotId, "uuid")}
        and exists (select 1 from ptw.person_role pr where pr.unit_id = s.unit_id and pr.person_id = ${q.p(person, "uuid")} and pr.role_id = r.role_id)
      order by (select max(pr.valid_until) from ptw.person_role pr
                 where pr.unit_id = s.unit_id and pr.person_id = ${q.p(person, "uuid")} and pr.role_id = r.role_id)
               >= (now() at time zone u.timezone)::date desc,
               r.n
      limit 1`,
    q.params,
  )
  return rows[0]?.role_id ?? null
}

/** `ptw.permit_sign`: a assinatura da pessoa da sessão; o banco avança o estado se a etapa fechou. */
export async function sign(tx: Tx, id: string, body: OpBody<"signPermit">): Promise<void> {
  const q = new Q()
  await run(
    tx,
    `select ptw.permit_sign(ptw.current_unit(), ${q.p(id, "uuid")}, ${q.p(body.slotId, "uuid")}, ${q.p(body.rev, "integer")}, ${q.p(body.id, "uuid")}) as state`,
    q.params,
  )
}

export type ReasonAct = "return" | "discard" | "stop" | "resume"

/** Devolver, Descartar, Parar, Retomar: uma função do banco cada, com o motivo. */
export async function reasonAct(tx: Tx, act: ReasonAct, id: string, reason: string): Promise<void> {
  const fn = { return: "permit_return", discard: "permit_discard", stop: "permit_stop", resume: "permit_resume" }[act]
  const q = new Q()
  await run(tx, `select ptw.${fn}(ptw.current_unit(), ${q.p(id, "uuid")}, ${q.p(reason, "text")}) as state`, q.params)
}

/** Prorrogar: `ptw.permit_extend` (o gatilho confere quem, quando, o fim novo e o prazo máximo). */
export async function extend(tx: Tx, id: string, body: OpBody<"extendPermit">): Promise<void> {
  const q = new Q()
  await run(
    tx,
    `select ptw.permit_extend(ptw.current_unit(), ${q.p(id, "uuid")}, ${q.p(body.newEnd, "timestamptz")}, ${q.p(body.reason, "text")}) as id`,
    q.params,
  )
}
