/**
 * Leitura dos modelos: o modelo com as versões como o app as tem (`PermitTemplate`). Tudo é SQL com
 * a unidade da sessão; as versões vêm em uma consulta e os filhos (etapas, assinaturas, separações,
 * escopo) em mais quatro para todas as versões da página (nunca uma consulta por versão).
 */
import type { Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import type { Cadastro } from "../../shared/core/templatePackage.ts"
import { Q, iso, isoOrNull, likeEscape, run } from "./sql.js"

export type Template = Schemas["PermitTemplate"]
export type Version = Schemas["TemplateVersion"]
export type Content = Schemas["TemplateContent"]
export type Stage = Schemas["Stage"]
export type SignSlot = Schemas["SignSlot"]

export type ContentMode = "none" | "ativa" | "all"

interface VersionRow {
  id: string
  template_id: string
  number: number
  status: Version["status"]
  note: string
  form: Schemas["FormSpec"]
  max_hours: number | null
  holds_equipment: boolean
  origin: Version["origin"]
  sha: string | null
  import_source: Schemas["ImportSource"] | null
  created_at: Date
  activated_at: Date | null
  revision: number
}

const VERSION_COLUMNS = `v.id, v.template_id, v.number, v.status, v.note, v.form, (extract(epoch from v.max_window) / 3600)::float8 as max_hours,
  v.holds_equipment, v.origin, encode(v.source_sha256, 'hex') as sha, v.import_source, v.created_at, v.activated_at, v.revision`

interface Children {
  stages: Map<string, Stage[]>
  separation: Map<string, Schemas["Separation"][]>
  locationTypes: Map<string, string[]>
  assetTypes: Map<string, string[]>
}

async function loadChildren(tx: Tx, versionIds: string[]): Promise<Children> {
  const out: Children = { stages: new Map(), separation: new Map(), locationTypes: new Map(), assetTypes: new Map() }
  if (versionIds.length === 0) return out
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v])

  const q1 = new Q()
  const stages = await run<{ id: string; version_id: string; name: string; kind: Stage["kind"] | null; locked: boolean }>(
    tx,
    `select id, version_id, name, kind, locked from ptw.stage where unit_id = ptw.current_unit() and version_id = any (${q1.uuids(versionIds)}) order by version_id, position`,
    q1.params,
  )
  const byStage = new Map<string, SignSlot[]>()
  const q2 = new Q()
  const slots = await run<{
    id: string; stage_id: string; meaning: string | null; kind: SignSlot["kind"]; roles: string[]; person_id: string | null
    min: number; required: boolean; rw_item: string | null; rw_line: string | null; rw_values: string[] | null
  }>(
    tx,
    `select id, stage_id, meaning, kind, to_jsonb(role_ids) as roles, person_id, min, required, required_when_item as rw_item,
            required_when_line as rw_line, to_jsonb(required_when_values) as rw_values
       from ptw.sign_slot where unit_id = ptw.current_unit() and version_id = any (${q2.uuids(versionIds)}) order by stage_id, position`,
    q2.params,
  )
  for (const s of slots) {
    const slot: SignSlot = {
      id: s.id, meaning: s.meaning, kind: s.kind, roleIds: s.roles, personId: s.person_id, min: Number(s.min), required: s.required,
      ...(s.rw_item !== null && s.rw_values !== null ? { requiredWhen: { itemId: s.rw_item, ...(s.rw_line !== null ? { lineId: s.rw_line } : {}), anyOf: s.rw_values } } : {}),
    }
    push(byStage, s.stage_id, slot)
  }
  for (const s of stages) push(out.stages, s.version_id, { id: s.id, name: s.name, ...(s.kind ? { kind: s.kind } : {}), locked: s.locked, slots: byStage.get(s.id) ?? [] })

  const q3 = new Q()
  const seps = await run<{ version_id: string; slot_a: string; slot_b: string; locked: boolean }>(
    tx,
    `select version_id, slot_a, slot_b, locked from ptw.separation where unit_id = ptw.current_unit() and version_id = any (${q3.uuids(versionIds)}) order by slot_a, slot_b`,
    q3.params,
  )
  for (const s of seps) push(out.separation, s.version_id, { slotA: s.slot_a, slotB: s.slot_b, locked: s.locked })

  for (const [table, into] of [["version_location_type", out.locationTypes], ["version_asset_type", out.assetTypes]] as const) {
    const q = new Q()
    const rows = await run<{ version_id: string; type_id: string }>(
      tx,
      `select version_id, type_id from ptw.${table} where unit_id = ptw.current_unit() and version_id = any (${q.uuids(versionIds)}) order by type_id`,
      q.params,
    )
    for (const r of rows) push(into, r.version_id, r.type_id)
  }
  return out
}

function mapVersion(r: VersionRow, c: Children | null): Version {
  const base = {
    id: r.id,
    number: Number(r.number),
    status: r.status,
    createdAt: iso(r.created_at),
    activatedAt: isoOrNull(r.activated_at),
    note: r.note,
    origin: r.origin,
    maxWindowHours: r.max_hours === null ? null : Number(r.max_hours),
    holdsEquipment: r.holds_equipment,
    sourceSha256: r.sha,
    ...(r.import_source !== null ? { importSource: r.import_source } : {}),
    revision: Number(r.revision),
  }
  if (c === null) {
    // O contrato pede os quatro campos de conteúdo; versão sem conteúdo vai com eles vazios e marcada.
    return { ...base, locationTypeIds: [], assetTypeIds: [], stages: [], separation: [], contentOmitted: true }
  }
  return {
    ...base,
    locationTypeIds: c.locationTypes.get(r.id) ?? [],
    assetTypeIds: c.assetTypes.get(r.id) ?? [],
    stages: c.stages.get(r.id) ?? [],
    separation: c.separation.get(r.id) ?? [],
    form: r.form,
  }
}

interface TemplateRow {
  id: string
  name: string
  retention_class: Template["retentionClass"]
  revision: number
  updated_at: Date
}

/** Monta os modelos com as versões; `content` decide quais versões trazem etapas e formulário. */
async function assemble(tx: Tx, rows: TemplateRow[], content: ContentMode): Promise<Template[]> {
  if (rows.length === 0) return []
  const q = new Q()
  const vrows = await run<VersionRow>(
    tx,
    `select ${VERSION_COLUMNS} from ptw.template_version v where v.unit_id = ptw.current_unit() and v.template_id = any (${q.uuids(rows.map((r) => r.id))}) order by v.template_id, v.number`,
    q.params,
  )
  const withContent = (v: VersionRow) => content === "all" || (content === "ativa" && v.status !== "arquivada")
  const children = await loadChildren(tx, vrows.filter(withContent).map((v) => v.id))
  const byTemplate = new Map<string, Version[]>()
  for (const v of vrows) byTemplate.set(v.template_id, [...(byTemplate.get(v.template_id) ?? []), mapVersion(v, withContent(v) ? children : null)])
  return rows.map((r) => ({
    id: r.id, name: r.name, retentionClass: r.retention_class, revision: Number(r.revision), updatedAt: iso(r.updated_at), versions: byTemplate.get(r.id) ?? [],
  }))
}

const TEMPLATE_COLUMNS = "t.id, t.name, t.retention_class, t.revision, t.updated_at"

export async function listTemplates(
  tx: Tx,
  query: { q?: string; content?: ContentMode; updatedSince?: string; page?: number; pageSize?: number },
): Promise<{ page: number; pageSize: number; total: number; items: Template[] }> {
  const q = new Q()
  const where = ["t.unit_id = ptw.current_unit()"]
  const term = query.q?.trim()
  if (term) where.push(`ptw.search_text(t.name) like '%' || ptw.search_text(${q.p(likeEscape(term), "text")}) || '%'`)
  if (query.updatedSince) where.push(`t.updated_at > ${q.p(query.updatedSince, "timestamptz")}`)
  const page = query.page ?? 0
  const size = Math.max(1, Math.trunc(query.pageSize ?? 50))
  const rows = await run<TemplateRow & { _total: number | string }>(
    tx,
    `select ${TEMPLATE_COLUMNS}, count(*) over() as _total from ptw.template t where ${where.join(" and ")} order by lower(t.name), t.id limit ${size} offset ${Math.max(0, Math.trunc(page)) * size}`,
    q.params,
  )
  let total = rows.length > 0 ? Number(rows[0]!._total) : 0
  if (rows.length === 0 && page > 0) {
    const c = await run<{ n: number | string }>(tx, `select count(*) as n from ptw.template t where ${where.join(" and ")}`, q.params)
    total = Number(c[0]?.n ?? 0)
  }
  return { page, pageSize: size, total, items: await assemble(tx, rows, query.content ?? "ativa") }
}

/** O modelo com todas as versões completas. 404 se não existe na unidade. */
export async function getTemplate(tx: Tx, id: string): Promise<Template> {
  const q = new Q()
  const rows = await run<TemplateRow>(tx, `select ${TEMPLATE_COLUMNS} from ptw.template t where t.unit_id = ptw.current_unit() and t.id = ${q.p(id, "uuid")}`, q.params)
  const [t] = await assemble(tx, rows, "all")
  if (!t) throw pta.notFound()
  return t
}

/** Uma versão completa do modelo. 404 se o modelo ou a versão não existem. */
export async function getVersion(tx: Tx, templateId: string, versionId: string): Promise<Version> {
  const q = new Q()
  const rows = await run<VersionRow>(
    tx,
    `select ${VERSION_COLUMNS} from ptw.template_version v where v.unit_id = ptw.current_unit() and v.template_id = ${q.p(templateId, "uuid")} and v.id = ${q.p(versionId, "uuid")}`,
    q.params,
  )
  const r = rows[0]
  if (!r) throw pta.notFound()
  return mapVersion(r, await loadChildren(tx, [r.id]))
}

/** O que o importador e a exportação precisam do cadastro da unidade. */
export async function loadCadastro(tx: Tx, opts: { people: boolean; templates: "stubs" | "none" }): Promise<Cadastro> {
  const types = await run<{ id: string; family: string; label: string; icon: string | null; system_key: string | null; active: boolean }>(
    tx,
    `select id, family, label, icon, system_key, active from ptw.type_def where unit_id = ptw.current_unit() order by lower(label), id`,
  )
  const of = (fam: string) => types.filter((t) => t.family === fam).map((t) => ({ id: t.id, label: t.label, icon: t.icon, systemKey: t.system_key, active: t.active }))
  const lists = await run<{ id: string; name: string; revision: number; updated_at: Date; items: { id: string; label: string; active: boolean }[] }>(
    tx,
    `select l.id, l.name, l.revision, l.updated_at,
            coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'active', i.active) order by i.position, i.id)
                        from ptw.option_item i where i.unit_id = l.unit_id and i.list_id = l.id), '[]'::jsonb) as items
       from ptw.option_list l where l.unit_id = ptw.current_unit() order by lower(l.name), l.id`,
  )
  const cadastro: Cadastro = {
    roleTypes: of("cargo"),
    locationTypes: of("local"),
    assetTypes: of("ativo"),
    optionLists: lists.map((l) => ({ id: l.id, name: l.name, revision: Number(l.revision), updatedAt: iso(l.updated_at), items: l.items })),
    templates: [],
  }
  if (opts.templates === "stubs") {
    // Só o nome e os números das versões: o importador acha o modelo pelo nome e numera a versão.
    const t = await run<{ id: string; name: string; retention_class: string; revision: number; updated_at: Date; numbers: number[] }>(
      tx,
      `select t.id, t.name, t.retention_class, t.revision, t.updated_at,
              coalesce((select jsonb_agg(v.number order by v.number) from ptw.template_version v where v.unit_id = t.unit_id and v.template_id = t.id), '[]'::jsonb) as numbers
         from ptw.template t where t.unit_id = ptw.current_unit()`,
    )
    cadastro.templates = t.map((x) => ({
      id: x.id, name: x.name, retentionClass: x.retention_class, revision: Number(x.revision), updatedAt: iso(x.updated_at),
      versions: x.numbers.map((number) => ({ number })),
    })) as unknown as Cadastro["templates"]
  }
  if (opts.people) {
    const locations = await run<{ id: string; parent_id: string | null; type_id: string; code: string; name: string; status: string }>(
      tx,
      `select id, parent_id, type_id, code, name, status from ptw.location where unit_id = ptw.current_unit()`,
    )
    cadastro.locations = locations.map((l) => ({
      id: l.id, unitId: "", revision: 1, updatedAt: "", origin: "manual", status: l.status, parentId: l.parent_id, typeId: l.type_id, code: l.code, name: l.name, aliases: [],
    })) as unknown as NonNullable<Cadastro["locations"]>
    const people = await run<{
      id: string; name: string; login: string | null; enabled: boolean; account_expires: Date | null; status: string
      roles: { id: string; roleId: string; scopeLocationId: string | null; validUntil: string }[]
    }>(
      tx,
      `select p.id, p.name, p.login, p.enabled, p.account_expires, p.status,
              coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'roleId', r.role_id, 'scopeLocationId', r.scope_location_id, 'validUntil', r.valid_until::text)
                          order by r.valid_until, r.id) from ptw.person_role r where r.unit_id = p.unit_id and r.person_id = p.id), '[]'::jsonb) as roles
         from ptw.person p where p.unit_id = ptw.current_unit()`,
    )
    cadastro.people = people.map((p) => ({
      id: p.id, unitId: "", revision: 1, updatedAt: "", origin: "manual", status: p.status, name: p.name, company: "", employeeId: "", login: p.login,
      enabled: p.enabled, accountExpires: isoOrNull(p.account_expires), adObjectGuid: null, roles: p.roles,
    })) as unknown as NonNullable<Cadastro["people"]>
  }
  return cadastro
}
