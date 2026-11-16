// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit/reading.ts; não edite (node scripts/sync-shared.mjs)
/** Reading: what an event says to a person, groups, undo. */
import { DEFAULT_TZ } from "../time.ts"
import { canonicalJson } from "./canonical.ts"
import { ROW_SPEC, STATE_LABEL, fieldLabel } from "./drafts.ts"
import { epochMicros } from "./micros.ts"
import type { AuditDraft, AuditEvent, AuditTable, Json, JsonObject } from "./types.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/
const RANGE = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/

const wallFmt = new Map<string, Intl.DateTimeFormat>()
/** "06/11/2026 14:03:27" in the unit's zone. */
export function fullDateTime(iso: string, tz: string = DEFAULT_TZ): string {
  let f = wallFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    wallFmt.set(tz, f)
  }
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(Math.floor(epochMicros(iso) / 1000)))) p[x.type] = x.value
  return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`
}
const dayText = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
/** Postgres prints "2026-11-06 17:00:00+00" inside a range; make it ISO. */
const pgInstant = (s: string) => s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")

/**
 * A raw value of `data.de/para` written for people: ids by name (when `name` knows them), instants
 * and days in dd/mm/aaaa, ranges as "início – fim", booleans Sim/Não, the form as its SHA-256.
 */
export function auditValueText(field: string, v: Json | undefined, name?: (id: string) => string | undefined, tz: string = DEFAULT_TZ): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Sim" : "Não"
  if (typeof v === "number") return String(v).replace(".", ",")
  if (Array.isArray(v)) return v.length ? v.map((x) => auditValueText(field, x, name, tz)).join(", ") : "—"
  if (typeof v === "object") {
    if (typeof v.sha256 === "string" && Object.keys(v).length === 1) return `SHA-256 ${v.sha256.slice(0, 12)}…`
    return canonicalJson(v)
  }
  if (field === "state" && STATE_LABEL[v]) return STATE_LABEL[v]
  if (UUID.test(v)) return name?.(v) ?? `${v.slice(0, 8)}…`
  if (DAY.test(v)) return dayText(v)
  if (INSTANT.test(v)) return fullDateTime(v, tz)
  const range = RANGE.exec(v)
  if (range) {
    const a = pgInstant(range[1]), b = pgInstant(range[2])
    if (INSTANT.test(a) && INSTANT.test(b)) return `${fullDateTime(a, tz)} – ${fullDateTime(b, tz)}`
  }
  if (/^\\x[0-9a-f]+$/.test(v)) return `SHA-256 ${v.slice(2, 14)}…`
  return v
}

/**
 * What changed in a row event, from `data.de/para` (inclusion: only "para"; removal: only "de"),
 * one line per column with the screen's label. Events of other kinds have none.
 */
export function eventChanges(e: Pick<AuditEvent, "data">, fmt: (field: string, v: Json) => string): { field: string; label: string; before: string; after: string }[] {
  const de = e.data.de, para = e.data.para
  const obj = (x: Json | undefined): JsonObject | null => (x && typeof x === "object" && !Array.isArray(x) ? x : null)
  const a = obj(de), b = obj(para)
  if (!a && !b) return []
  const fields = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort()
  return fields.map((f) => ({
    field: f, label: fieldLabel(f),
    before: a && f in a ? fmt(f, a[f]) : "—",
    after: b && f in b ? fmt(f, b[f]) : "—",
  }))
}

/** How the Auditoria screen groups events. Denied attempts are their own group whatever they were. */
export type AuditGroup = "alteracao" | "acesso" | "sessao" | "negada"
export function auditGroup(e: Pick<AuditEvent, "action" | "ok">): AuditGroup {
  if (!e.ok) return "negada"
  if (e.action.startsWith("acesso.")) return "acesso"
  if (e.action.startsWith("sessao.") || e.action.startsWith("conta.") || e.action.startsWith("sistema.")) return "sessao"
  return "alteracao"
}

/** Area of an action, for the filter: "cadastro", "modelo", "pt", "acesso", "sessao", "conta", "sistema" (first segment). */
export const auditArea = (action: string) => action.split(".")[0]

/** Tables whose writes come from the row trigger (the only events an undo marks). */
export const ROW_TABLES = Object.keys(ROW_SPEC) as AuditTable[]
/**
 * A write made by "Desfazer" (set_context(..., p_undo => true)): row events get ".desfeito" after the
 * action, "Desfazer: " before the text and reason "Desfazer" when none was given. Reads, sessions,
 * system events, denials and signatures stay as they are.
 */
export function asUndoDraft(d: AuditDraft): AuditDraft {
  const rowWrite = /^(cadastro|modelo|pt)\./.test(d.action) && d.action !== "modelo.importado" && !!d.entity && (ROW_TABLES as string[]).includes(d.entity)
  if (!d.ok || !rowWrite || d.action.endsWith(".desfeito")) return d
  return { ...d, action: `${d.action}.desfeito`, text: `Desfazer: ${d.text}`, reason: d.reason ?? "Desfazer" }
}
/** An undo's own event. */
export const isUndo = (e: Pick<AuditEvent, "action">) => e.action.endsWith(".desfeito")
