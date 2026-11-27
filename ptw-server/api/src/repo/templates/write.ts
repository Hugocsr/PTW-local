/**
 * Escrita dos modelos: modelo, versão (rascunho) e os filhos da versão. Os filhos são trocados pelo
 * que foi enviado por DIFERENÇA (só o que mudou vira escrita, e portanto evento na trilha), na mesma
 * transação da versão. A revisão da versão (`If-Match`) é conferida por um `UPDATE` da própria versão.
 */
import { staleOrMissing } from "../../http/ifMatch.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { copyVersion, normalizeSeparation } from "../../shared/core/templateVersions.ts"
import type { Content, Template, Version } from "./read.js"
import { getTemplate, getVersion } from "./read.js"
import { Q, dbLike, run } from "./sql.js"

type Row = Record<string, unknown>

export interface VersionInput extends Partial<Content> {
  id?: string
  note?: string
  maxWindowHours?: number | null
  holdsEquipment?: boolean
}

/** As cinco etapas do produto, com uma assinatura cada (sem cargo: a ativação exige). Igual a `defaultStages` do app. */
export function defaultStages(id: () => string): Content["stages"] {
  const slot = (meaning: string) => ({ id: id(), meaning, kind: "cargo" as const, roleIds: [], personId: null, min: 1, required: true })
  return [
    { id: id(), name: "Solicitação", kind: "solicitacao", slots: [slot("Solicita a PT")] },
    { id: id(), name: "Emissão", kind: "emissao", locked: true, slots: [slot("Emite a PT")] },
    { id: id(), name: "Aceite no campo", kind: "aceite_campo", locked: true, slots: [slot("Aceita no campo")] },
    { id: id(), name: "Entrega", kind: "entrega", locked: true, slots: [slot("Entrega a área")] },
    { id: id(), name: "Aceite da área", kind: "aceite_area", locked: true, slots: [slot("Encerra a PT")] },
  ]
}

export async function newId(tx: Tx): Promise<string> {
  const r = await run<{ id: string }>(tx, "select uuidv7()::text as id")
  return r[0]!.id
}

const hoursSql = (q: Q, h: number | null | undefined): string =>
  h === null || h === undefined ? "null" : `make_interval(secs => ${q.p(h, "float8")} * 3600)`

export interface InsertOpts {
  origin?: "manual" | "sugerida"
  sha256?: string | null
  importSource?: unknown
  number?: number
}

/** Insere a versão (rascunho) e os filhos. Sem número, é o seguinte do modelo. Devolve o id. */
export async function insertVersion(tx: Tx, templateId: string, input: VersionInput, opts: InsertOpts = {}): Promise<string> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.template_version (unit_id, id, template_id, number, status, note, form, max_window, holds_equipment, origin, source_sha256, import_source)
     values (ptw.current_unit(), coalesce(${q.p(input.id, "uuid")}, uuidv7()), ${q.p(templateId, "uuid")},
             coalesce(${q.p(opts.number, "integer")}, (select coalesce(max(number), 0) + 1 from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${q.p(templateId, "uuid")})),
             'rascunho', ${q.p(input.note ?? "", "text")}, ${q.json((input as { form?: unknown }).form ?? { sections: [] })},
             ${hoursSql(q, input.maxWindowHours)}, ${q.p(input.holdsEquipment ?? true, "boolean")}, ${q.p(opts.origin ?? "manual", "ptw.version_origin")},
             ${opts.sha256 ? `decode(${q.p(opts.sha256, "text")}, 'hex')` : "null"}, ${opts.importSource ? q.json(opts.importSource) : "null"})
     returning id`,
    q.params,
  )
  const id = rows[0]!.id
  await syncChildren(tx, id, input)
  return id
}

/** Troca o conteúdo do rascunho pelo enviado; revisão antiga → 409; versão que não é rascunho → PTW03 (do banco). */
export async function updateVersion(tx: Tx, templateId: string, versionId: string, rev: number, input: VersionInput): Promise<Version> {
  const q = new Q()
  const sets = [
    `note = ${q.p(input.note ?? "", "text")}`,
    `form = ${q.json((input as { form?: unknown }).form ?? { sections: [] })}`,
    `max_window = ${hoursSql(q, input.maxWindowHours)}`,
    `holds_equipment = ${q.p(input.holdsEquipment ?? true, "boolean")}`,
  ]
  const rows = await run(
    tx,
    `update ptw.template_version set ${sets.join(", ")} where unit_id = ptw.current_unit() and template_id = ${q.p(templateId, "uuid")} and id = ${q.p(versionId, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (rows.length === 0) return staleOrMissing(await versionRevision(tx, templateId, versionId))
  await syncChildren(tx, versionId, input)
  return getVersion(tx, templateId, versionId)
}

export async function versionRevision(tx: Tx, templateId: string, versionId: string): Promise<number | null> {
  const q = new Q()
  const r = await run<{ revision: number }>(
    tx,
    `select revision from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${q.p(templateId, "uuid")} and id = ${q.p(versionId, "uuid")}`,
    q.params,
  )
  return r[0] ? Number(r[0].revision) : null
}

export async function removeVersion(tx: Tx, templateId: string, versionId: string, rev: number): Promise<void> {
  const q = new Q()
  const rows = await run(
    tx,
    `delete from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${q.p(templateId, "uuid")} and id = ${q.p(versionId, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (rows.length === 0) staleOrMissing(await versionRevision(tx, templateId, versionId))
}

/** Ativa o rascunho (e arquiva a versão em uso) pela função do banco. */
export async function activateVersion(tx: Tx, templateId: string, versionId: string, rev: number): Promise<Template> {
  const q = new Q()
  const cur = await run<{ status: string; revision: number }>(
    tx,
    `select status, revision from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${q.p(templateId, "uuid")} and id = ${q.p(versionId, "uuid")} for update`,
    q.params,
  )
  if (!cur[0]) throw pta.notFound()
  if (Number(cur[0].revision) !== rev) throw pta.staleRevision(Number(cur[0].revision))
  if (cur[0].status !== "rascunho") throw dbLike("PTW03", `Versão ${cur[0].status} não pode ser ativada`)
  const a = new Q()
  await run(tx, `select ptw.version_activate(ptw.current_unit(), ${a.p(versionId, "uuid")})`, a.params)
  return getTemplate(tx, templateId)
}

// ---------------------------------------------------------------- modelo

export async function createTemplate(
  tx: Tx,
  body: { id?: string; name: string; retentionClass?: string; version?: VersionInput },
): Promise<Template> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.template (unit_id, id, name, retention_class)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.name, "text")}, ${q.p(body.retentionClass ?? "pt", "text")}) returning id`,
    q.params,
  )
  const id = rows[0]!.id
  let input = body.version
  if (!input) {
    const ids = await run<{ id: string }>(tx, "select uuidv7()::text as id from generate_series(1, 10)")
    let n = 0
    input = { locationTypeIds: [], assetTypeIds: [], workTypeIds: [], stages: defaultStages(() => ids[n++]!.id), separation: [], ...{ form: { sections: [] } } } as VersionInput
  }
  await insertVersion(tx, id, input, { number: 1 })
  return getTemplate(tx, id)
}

export async function updateTemplate(tx: Tx, id: string, rev: number, body: { name?: string; retentionClass?: string }): Promise<Template> {
  const q = new Q()
  const sets: string[] = []
  if (body.name !== undefined) sets.push(`name = ${q.p(body.name, "text")}`)
  if (body.retentionClass !== undefined) sets.push(`retention_class = ${q.p(body.retentionClass, "text")}`)
  if (sets.length === 0) sets.push("name = name")
  const rows = await run(
    tx,
    `update ptw.template set ${sets.join(", ")} where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (rows.length === 0) return staleOrMissing(await templateRevision(tx, id))
  return getTemplate(tx, id)
}

export async function templateRevision(tx: Tx, id: string): Promise<number | null> {
  const q = new Q()
  const r = await run<{ revision: number }>(tx, `select revision from ptw.template where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")}`, q.params)
  return r[0] ? Number(r[0].revision) : null
}

/** Remove o modelo que só tem rascunhos (PTW03 se há versão ativa ou arquivada; PT que usa → 23503 do banco). */
export async function removeTemplate(tx: Tx, id: string, rev: number): Promise<void> {
  const q = new Q()
  const cur = await run<{ revision: number }>(
    tx,
    `select revision from ptw.template where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} for update`,
    q.params,
  )
  if (!cur[0]) throw pta.notFound()
  if (Number(cur[0].revision) !== rev) throw pta.staleRevision(Number(cur[0].revision))
  const d = new Q()
  const frozen = await run(tx, `select 1 from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${d.p(id, "uuid")} and status <> 'rascunho' limit 1`, d.params)
  if (frozen.length > 0) throw dbLike("PTW03", "Modelo com versão ativa ou arquivada não pode ser removido")
  const v = new Q()
  await run(tx, `delete from ptw.template_version where unit_id = ptw.current_unit() and template_id = ${v.p(id, "uuid")}`, v.params)
  const t = new Q()
  await run(tx, `delete from ptw.template where unit_id = ptw.current_unit() and id = ${t.p(id, "uuid")}`, t.params)
}

/** Cria um rascunho copiado de outra versão do mesmo modelo (`copyVersion` do núcleo: ids novos, itens mantidos). */
export async function copyFromVersion(tx: Tx, templateId: string, sourceId: string, newVersionId?: string): Promise<Version> {
  const src = await getVersion(tx, templateId, sourceId)
  const next = await run<{ n: number }>(
    tx,
    `select coalesce(max(number), 0) + 1 as n from ptw.template_version where unit_id = ptw.current_unit() and template_id = '${templateId}'::uuid`,
  )
  const copy = copyVersion(src as never, Number(next[0]!.n), new Date().toISOString()) as unknown as VersionInput & { id: string }
  if (newVersionId) copy.id = newVersionId
  const id = await insertVersion(tx, templateId, copy, { number: Number(next[0]!.n) })
  return getVersion(tx, templateId, id)
}

// ---------------------------------------------------------------- filhos da versão

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Etapas, assinaturas, separações e escopo = exatamente os enviados; só a diferença vira escrita. */
export async function syncChildren(tx: Tx, versionId: string, c: VersionInput): Promise<void> {
  const stages = c.stages ?? []
  const wantedSlots = stages.flatMap((st) => st.slots.map((sl, i) => ({ st, sl, i })))
  const slotIds = new Set(wantedSlots.map((x) => x.sl.id))
  const seps = new Map<string, { a: string; b: string; locked: boolean }>()
  for (const r of c.separation ?? []) {
    const n = normalizeSeparation(r.slotA, r.slotB, r.locked)
    seps.set(`${n.slotA}|${n.slotB}`, { a: n.slotA, b: n.slotB, locked: n.locked })
  }
  for (const s of seps.values()) {
    if (s.a === s.b || !slotIds.has(s.a) || !slotIds.has(s.b)) throw dbLike("23503", "Separação entre assinaturas que não são da versão")
  }
  const vq = new Q()
  const V = vq.p(versionId, "uuid")
  const base = vq.params

  const curStages = await run<Row>(tx, `select id, position, name, kind, locked from ptw.stage where unit_id = ptw.current_unit() and version_id = ${V}`, base)
  const curSlots = await run<Row>(
    tx,
    `select id, stage_id, position, meaning, kind, to_jsonb(role_ids) as roles, person_id, min, required, delegable, required_when_item as rw_item,
            required_when_line as rw_line, to_jsonb(required_when_values) as rw_values
       from ptw.sign_slot where unit_id = ptw.current_unit() and version_id = ${V}`,
    base,
  )
  const curSeps = await run<{ slot_a: string; slot_b: string; locked: boolean }>(
    tx,
    `select slot_a, slot_b, locked from ptw.separation where unit_id = ptw.current_unit() and version_id = ${V}`,
    base,
  )

  // 1. Saem: separações, assinaturas e etapas que não foram enviadas.
  for (const r of curSeps) {
    if (!seps.has(`${r.slot_a}|${r.slot_b}`)) {
      const q = new Q()
      await run(tx, `delete from ptw.separation where unit_id = ptw.current_unit() and version_id = ${q.p(versionId, "uuid")} and slot_a = ${q.p(r.slot_a, "uuid")} and slot_b = ${q.p(r.slot_b, "uuid")}`, q.params)
    }
  }
  for (const r of curSlots) {
    if (!slotIds.has(String(r.id))) {
      const q = new Q()
      await run(tx, `delete from ptw.sign_slot where unit_id = ptw.current_unit() and id = ${q.p(String(r.id), "uuid")}`, q.params)
    }
  }
  const stageIds = new Set(stages.map((s) => s.id))
  for (const r of curStages) {
    if (!stageIds.has(String(r.id))) {
      const q = new Q()
      await run(tx, `delete from ptw.stage where unit_id = ptw.current_unit() and id = ${q.p(String(r.id), "uuid")}`, q.params)
    }
  }

  // 2. Etapas: a âncora (kind) é única por versão e não adia a conferência; solta antes de reatribuir.
  const curStage = new Map(curStages.map((r) => [String(r.id), r]))
  for (const [position, st] of stages.entries()) {
    const old = curStage.get(st.id)
    if (old && old.kind !== null && (old.kind ?? null) !== (st.kind ?? null)) {
      const q = new Q()
      await run(tx, `update ptw.stage set kind = null where unit_id = ptw.current_unit() and id = ${q.p(st.id, "uuid")}`, q.params)
    }
    const q = new Q()
    if (!old) {
      await run(
        tx,
        `insert into ptw.stage (unit_id, id, version_id, position, name, kind, locked)
         values (ptw.current_unit(), ${q.p(st.id, "uuid")}, ${q.p(versionId, "uuid")}, ${q.p(position, "integer")}, ${q.p(st.name, "text")}, ${q.p(st.kind ?? null, "ptw.stage_kind")}, ${q.p(st.locked ?? false, "boolean")})`,
        q.params,
      )
    } else if (Number(old.position) !== position || old.name !== st.name || (old.kind ?? null) !== (st.kind ?? null) || old.locked !== (st.locked ?? false)) {
      await run(
        tx,
        `update ptw.stage set position = ${q.p(position, "integer")}, name = ${q.p(st.name, "text")}, kind = ${q.p(st.kind ?? null, "ptw.stage_kind")}, locked = ${q.p(st.locked ?? false, "boolean")}
          where unit_id = ptw.current_unit() and id = ${q.p(st.id, "uuid")}`,
        q.params,
      )
    }
  }

  // 3. Assinaturas.
  const curSlot = new Map(curSlots.map((r) => [String(r.id), r]))
  for (const { st, sl, i } of wantedSlots) {
    const rw = sl.requiredWhen
    const old = curSlot.get(sl.id)
    const q = new Q()
    const vals = [
      q.p(sl.meaning, "text"), q.p(sl.kind, "ptw.slot_kind"), q.p(`{${sl.roleIds.join(",")}}`, "uuid[]"), q.p(sl.personId, "uuid"), q.p(sl.min, "smallint"),
      q.p(sl.required, "boolean"), q.p(rw?.itemId ?? null, "text"), q.p(rw?.lineId ?? null, "text"),
      rw ? q.p(`{${rw.anyOf.map((x) => `"${x.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`, "text[]") : "null::text[]",
      q.p(sl.delegable === true, "boolean"),
    ]
    if (!old) {
      await run(
        tx,
        `insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, kind, role_ids, person_id, min, required, required_when_item, required_when_line, required_when_values, delegable)
         values (ptw.current_unit(), ${q.p(sl.id, "uuid")}, ${q.p(versionId, "uuid")}, ${q.p(st.id, "uuid")}, ${q.p(i, "integer")}, ${vals.join(", ")})`,
        q.params,
      )
    } else {
      const unchanged =
        old.stage_id === st.id && Number(old.position) === i && (old.meaning ?? null) === sl.meaning && old.kind === sl.kind && same(old.roles, sl.roleIds) &&
        (old.person_id ?? null) === sl.personId && Number(old.min) === sl.min && old.required === sl.required && (old.delegable === true) === (sl.delegable === true) &&
        (old.rw_item ?? null) === (rw?.itemId ?? null) && (old.rw_line ?? null) === (rw?.lineId ?? null) && same(old.rw_values ?? null, rw ? rw.anyOf : null)
      if (!unchanged) {
        await run(
          tx,
          `update ptw.sign_slot set stage_id = ${q.p(st.id, "uuid")}, position = ${q.p(i, "integer")}, meaning = ${vals[0]}, kind = ${vals[1]}, role_ids = ${vals[2]},
                  person_id = ${vals[3]}, min = ${vals[4]}, required = ${vals[5]}, required_when_item = ${vals[6]}, required_when_line = ${vals[7]}, required_when_values = ${vals[8]}, delegable = ${vals[9]}
            where unit_id = ptw.current_unit() and id = ${q.p(sl.id, "uuid")}`,
          q.params,
        )
      }
    }
  }

  // 4. Separações.
  const curSep = new Map(curSeps.map((r) => [`${r.slot_a}|${r.slot_b}`, r]))
  for (const [key, s] of seps) {
    const old = curSep.get(key)
    const q = new Q()
    if (!old) {
      await run(
        tx,
        `insert into ptw.separation (unit_id, version_id, slot_a, slot_b, locked) values (ptw.current_unit(), ${q.p(versionId, "uuid")}, ${q.p(s.a, "uuid")}, ${q.p(s.b, "uuid")}, ${q.p(s.locked, "boolean")})`,
        q.params,
      )
    } else if (old.locked !== s.locked) {
      await run(
        tx,
        `update ptw.separation set locked = ${q.p(s.locked, "boolean")} where unit_id = ptw.current_unit() and version_id = ${q.p(versionId, "uuid")} and slot_a = ${q.p(s.a, "uuid")} and slot_b = ${q.p(s.b, "uuid")}`,
        q.params,
      )
    }
  }

  // 5. Escopo: tipos de local e de ativo aceitos e tipos de trabalho do modelo.
  for (const [table, want] of [["version_location_type", c.locationTypeIds ?? []], ["version_asset_type", c.assetTypeIds ?? []], ["version_work_type", c.workTypeIds ?? []]] as const) {
    const wanted = new Set(want)
    const cq = new Q()
    const cur = await run<{ type_id: string }>(tx, `select type_id from ptw.${table} where unit_id = ptw.current_unit() and version_id = ${cq.p(versionId, "uuid")}`, cq.params)
    const have = new Set(cur.map((r) => r.type_id))
    for (const id of have) {
      if (!wanted.has(id)) {
        const q = new Q()
        await run(tx, `delete from ptw.${table} where unit_id = ptw.current_unit() and version_id = ${q.p(versionId, "uuid")} and type_id = ${q.p(id, "uuid")}`, q.params)
      }
    }
    for (const id of wanted) {
      if (!have.has(id)) {
        const q = new Q()
        await run(tx, `insert into ptw.${table} (unit_id, version_id, type_id) values (ptw.current_unit(), ${q.p(versionId, "uuid")}, ${q.p(id, "uuid")})`, q.params)
      }
    }
  }
}
