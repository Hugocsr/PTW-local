/**
 * Audit events of models, versions, scope, stages, signatures and separation, as the database's row
 * trigger writes them (ptw.audit_row): one event per row inserted, changed or removed, with the
 * database's column names. An import also writes `modelo.importado` (ptw.audit_import, G2).
 */
import type { AuditCtx, AuditDraft, JsonObject, Row, RowLookups } from "@/core/audit"
import { rowBytea, rowEvent, rowTs } from "@/core/audit"
import { totaisDaImportacao, type Rascunho } from "@/core/templatePackage"
import type { PermitTemplate, RegistryState, Separation, SignSlot, Stage, TemplateVersion } from "./types"

/* ---------- rows (nomes de coluna do banco) ---------- */

/** An interval of hours as to_jsonb writes it ("12:00:00", "168:00:00", "01:30:00"); null = none. */
export function intervalText(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined) return null
  const min = Math.round(hours * 60)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(Math.floor(min / 60))}:${p(min % 60)}:00`
}

export function templateRow(t: PermitTemplate): Row {
  return { id: t.id, name: t.name, retention_class: t.retentionClass, revision: t.revision, updated_at: rowTs(t.updatedAt) }
}

export function versionRow(t: PermitTemplate, v: TemplateVersion): Row {
  return {
    id: v.id, template_id: t.id, number: v.number, status: v.status, note: v.note,
    form: JSON.parse(JSON.stringify(v.form ?? { sections: [] })),
    origin: v.origin, source_sha256: v.sourceSha256 ? rowBytea(v.sourceSha256) : null,
    import_source: v.importSource ? JSON.parse(JSON.stringify(v.importSource)) : null,
    max_window: intervalText(v.maxWindowHours), holds_equipment: v.holdsEquipment,
    created_at: rowTs(v.createdAt), activated_at: v.activatedAt ? rowTs(v.activatedAt) : null,
  }
}

export const scopeRow = (v: TemplateVersion, typeId: string): Row => ({ version_id: v.id, type_id: typeId })

export function stageRow(v: TemplateVersion, s: Stage, position: number): Row {
  return { id: s.id, version_id: v.id, position, name: s.name, kind: s.kind ?? null, locked: !!s.locked }
}

export function signSlotRow(v: TemplateVersion, s: Stage, sl: SignSlot, position: number): Row {
  return {
    id: sl.id, version_id: v.id, stage_id: s.id, position, meaning: sl.meaning, kind: sl.kind, role_ids: [...sl.roleIds],
    person_id: sl.personId, min: sl.min, required: sl.required,
    required_when_item: sl.requiredWhen?.itemId ?? null, required_when_line: sl.requiredWhen?.lineId ?? null,
    required_when_values: sl.requiredWhen ? [...sl.requiredWhen.anyOf] : null,
  }
}

export const separationRow = (v: TemplateVersion, r: Separation): Row => ({ version_id: v.id, slot_a: r.slotA, slot_b: r.slotB, locked: r.locked })

/* ---------- events ---------- */

const NO_LOOKUP: RowLookups = { permitRevision: () => undefined, assetCode: () => undefined, personName: () => undefined }

type Keyed = { key: string; row: Row }
/** Children of a version, keyed as their primary key (scope and separation have no id). */
function children(v: TemplateVersion) {
  const stages: Keyed[] = v.stages.map((s, i) => ({ key: s.id, row: stageRow(v, s, i) }))
  const slots: Keyed[] = v.stages.flatMap((s) => s.slots.map((sl, i) => ({ key: sl.id, row: signSlotRow(v, s, sl, i) })))
  return {
    version_location_type: v.locationTypeIds.map((id) => ({ key: id, row: scopeRow(v, id) })),
    version_asset_type: v.assetTypeIds.map((id) => ({ key: id, row: scopeRow(v, id) })),
    stage: stages,
    sign_slot: slots,
    separation: v.separation.map((r) => ({ key: `${r.slotA}|${r.slotB}`, row: separationRow(v, r) })),
  }
}
type ChildTable = keyof ReturnType<typeof children>
/** Insert order (parents first); removals run the other way, as the cascade does. */
const CHILD_ORDER: ChildTable[] = ["version_location_type", "version_asset_type", "stage", "sign_slot", "separation"]

function diffRows(table: ChildTable, b: Keyed[], a: Keyed[], ctx: AuditCtx, phase: "upsert" | "delete"): AuditDraft[] {
  const out: AuditDraft[] = []
  if (phase === "delete") {
    for (const x of b) if (!a.some((y) => y.key === x.key)) { const e = rowEvent(table, x.row, undefined, ctx, NO_LOOKUP); if (e) out.push(e) }
    return out
  }
  for (const y of a) {
    const x = b.find((z) => z.key === y.key)
    const e = rowEvent(table, x?.row, y.row, ctx, NO_LOOKUP)
    if (e) out.push(e)
  }
  return out
}

/**
 * Events of one write to a template (create: no `before`; remove: no `after`): the template row, then
 * each version and its children. Removals come first among children (separation → slots → stages →
 * scope) and the version row is removed last, as the cascade does.
 */
export function templateEvents(before: PermitTemplate | undefined, after: PermitTemplate | undefined, ctx: AuditCtx): AuditDraft[] {
  const out: AuditDraft[] = []
  const push = (e: AuditDraft | null) => { if (e) out.push(e) }
  if (after) push(rowEvent("template", before && templateRow(before), templateRow(after), ctx, NO_LOOKUP))
  const bv = before?.versions ?? []
  const av = after?.versions ?? []
  // Activation archives the previous active version first (ptw.version_activate).
  const ordered = [...av].sort((x, y) => (x.status === "arquivada" ? 0 : 1) - (y.status === "arquivada" ? 0 : 1))
  for (const v of ordered) {
    const old = bv.find((x) => x.id === v.id)
    if (old === v) continue
    const ob = old ? children(old) : undefined
    const nb = children(v)
    for (const t of [...CHILD_ORDER].reverse()) out.push(...diffRows(t, ob?.[t] ?? [], nb[t], ctx, "delete"))
    if (!old) push(rowEvent("template_version", undefined, versionRow(after!, v), ctx, NO_LOOKUP))
    for (const t of CHILD_ORDER) out.push(...diffRows(t, ob?.[t] ?? [], nb[t], ctx, "upsert"))
    if (old) push(rowEvent("template_version", versionRow(before!, old), versionRow(after!, v), ctx, NO_LOOKUP))
  }
  for (const old of bv) {
    if (av.some((x) => x.id === old.id)) continue
    const ob = children(old)
    for (const t of [...CHILD_ORDER].reverse()) out.push(...diffRows(t, ob[t], [], ctx, "delete"))
    push(rowEvent("template_version", versionRow(before!, old), undefined, ctx, NO_LOOKUP))
  }
  if (!after && before) push(rowEvent("template", templateRow(before), undefined, ctx, NO_LOOKUP))
  return out
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The sentence of ptw.audit_import (G2), the same the database writes. */
export function importText(modelo: string, numero: number, pacoteArquivo: string, t: ReturnType<typeof totaisDaImportacao>): string {
  return `Importou “${modelo}” v${numero} como rascunho sugerido de ${pacoteArquivo || "pacote colado"}: `
    + [plural(t.etapas, "etapa", "etapas"), plural(t.itens, "item", "itens"), plural(t.assinaturas, "assinatura", "assinaturas"),
      plural(t.listasNovas, "lista nova", "listas novas"), plural(t.tiposNovos, "tipo novo", "tipos novos"), plural(t.cargosNovos, "cargo novo", "cargos novos")].join(", ")
}

/**
 * A confirmed import: the rows of the model and its new draft version (the new types, lists and
 * cargos are registry rows, written by registry/audit), then `modelo.importado` with the totals.
 */
export function importEvents(before: RegistryState, after: RegistryState, r: Rascunho, ctx: AuditCtx): AuditDraft[] {
  const b = before.templates.find((t) => t.id === r.modeloId)
  const a = after.templates.find((t) => t.id === r.modeloId)
  const out = templateEvents(b, a, ctx)
  const ver = a?.versions.find((v) => v.id === r.versao.id)
  if (!a || !ver?.importSource) return out
  const src = ver.importSource
  const totais = { ...totaisDaImportacao(r), versao: ver.number }
  const novos = { listas: r.listasNovas.map((x) => x.id), tipos: [...r.tiposDeLocalNovos, ...r.tiposDeAtivoNovos].map((x) => x.id), cargos: r.cargosNovos.map((x) => x.id) }
  const data = {
    pacote: { ...src.pacote }, documentos: src.documentos.map((d) => ({ ...d })), ferramenta: src.ferramenta,
    ...(src.modelo ? { modelo: src.modelo } : {}), ...(src.idioma ? { idioma: { ...src.idioma } } : {}),
    totais, novos,
  } as JsonObject
  out.push({
    at: ctx.at, actor: ctx.actorId, role: ctx.roleId ?? null, auth: ctx.auth ?? (ctx.actorId ? "sessao" : "sistema"),
    client: ctx.client ?? null, request: ctx.requestId ?? null, reason: ctx.reason ?? null,
    action: "modelo.importado", ok: true, permit: null, rev: null, asset: null, entity: "template_version", entityId: ver.id,
    text: importText(a.name, ver.number, src.pacote.arquivo, totais), data,
  })
  return out
}
