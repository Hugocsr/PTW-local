import { useMemo } from "react"
import { auditValueText, eventChanges, fieldLabel, fullDateTime, type AuditEvent, type Json, type JsonObject } from "@/core/audit"
import type { ItemAnswer } from "@/core/form"
import { byId } from "@/core/indexes"
import { describeAnswer } from "@/permit/describeAnswer"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import type { FormItem } from "@/registry/types"
import { idNames } from "./look"

/**
 * Reading the audit trail for people. The events keep the database's raw rows and sentences (they
 * are hashed as the database writes them); this only changes how they are shown: an item key read as
 * its label, a draft named by its author, and only the change that matters, in words.
 */
export interface EventReader {
  names: (id: string) => string | undefined
  who: (id: string | null) => string
  /** The PT's number, or "Rascunho de <autor>" before Enviar. */
  ptName: (id: string) => string
  isDraft: (id: string) => boolean
  /** The event's sentence for the screen. */
  title: (e: AuditEvent) => string
  /** What changed that the title does not already say (Histórico, Auditoria · Alterações). */
  lines: (e: AuditEvent) => string[]
  /** Every value the event keeps, with human labels (Auditoria · Dados). */
  data: (e: AuditEvent) => { field: string; label: string; before?: string; after: string }[]
  /** A value from the event's data, written for people. */
  fmt: (field: string, v: Json, e?: AuditEvent) => string
}

const ATTACH_LABEL: Record<string, string> = { foto: "Foto", video: "Vídeo", arquivo: "Arquivo" }
/** Labels of keys the trail keeps outside the row columns (screen only). */
const EXTRA_LABEL: Record<string, string> = {
  busca: "busca", seq: "evento", primeiro_seq: "primeiro evento", ultimo_seq: "último evento", arquivo_sha256: "SHA-256 do arquivo",
  manifesto_sha256: "SHA-256 do manifesto", kind_id: "relação", erro: "código do erro", scope: "serviço", at: "hora",
}
const label = (f: string) => EXTRA_LABEL[f] ?? fieldLabel(f)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Columns that only identify, link or measure the row: shown in Dados, never as "what changed". */
const TECHNICAL = new Set([
  "id", "unit_id", "permit_id", "version_id", "template_id", "item_id", "answered_by", "snapshot_sha256", "sha256", "preview_sha256",
  "width", "height", "duration_ms", "captured_by", "position", "form", "source_sha256", "num", "holds", "hold_at", "resumed_at",
  "author_id", "ad_object_guid", "retention_class", "state", "state_note", "stage_id", "required_when_line", "import_source", "kind",
  "icon", "family", "revision", "rev", "hold_by", "resumed_by",
])
/** Columns that carry the record's name, which the title already says. */
const NAME_FIELDS = new Set(["name", "code", "label", "meaning", "file_name"])

const obj = (x: Json | undefined): JsonObject | null => (x && typeof x === "object" && !Array.isArray(x) ? x : null)
const str = (x: Json | undefined) => (typeof x === "string" ? x : undefined)

export function useEventReader(): EventReader {
  const { state } = useRegistry()
  const store = usePermits()
  return useMemo(() => {
    const { permits, attachments, formOf } = store
    const names = idNames({
      people: state.people, locations: state.locations, assets: state.assets, optionLists: state.optionLists, templates: state.templates, permits,
      types: [...state.locationTypes, ...state.assetTypes, ...state.roleTypes, ...state.relationKinds, ...state.workTypes],
    })
    const who = (id: string | null) => (id ? names(id) ?? "Pessoa removida" : "Sistema")
    const ptName = (id: string) => names(id) ?? "PT removida"
    // A PT the cache does not hold (the server has it, the page has not asked yet) is not called a draft.
    const isDraft = (id: string) => { const p = byId(permits, id); return p ? p.number == null : false }

    // Items of each PT's form (its frozen snapshot after Enviar), read on demand.
    const forms = new Map<string, Map<string, FormItem>>()
    const itemOf = (permitId: string | null, itemId: string | undefined): FormItem | undefined => {
      if (!permitId || !itemId) return undefined
      let m = forms.get(permitId)
      if (!m) {
        m = new Map()
        const p = permits.find((x) => x.id === permitId)
        const ver = p && state.templates.find((t) => t.id === p.templateId)?.versions.find((v) => v.id === p.versionId)
        if (p && ver) for (const s of formOf(p, ver).sections) for (const i of s.items) m.set(i.id, i)
        forms.set(permitId, m)
      }
      return m.get(itemId)
    }
    // An answer's change keeps only the changed column: the item key is then only in the sentence ("Respondeu: <key> (valor)").
    const itemIdOf = (e: AuditEvent) => str(obj(e.data.para)?.item_id) ?? str(obj(e.data.de)?.item_id)
      ?? (e.entity === "permit_answer" || e.entity === "attachment" ? /: ([A-Za-z0-9_.:-]{1,64})( \(.*\))?$/.exec(e.text)?.[1] : undefined)
    const answer = (e: AuditEvent, v: Json | undefined) =>
      describeAnswer(itemOf(e.permit, itemIdOf(e)), v as unknown as ItemAnswer, state.optionLists, state.people, attachments.filter((a) => a.permitId === e.permit))

    const fmt = (f: string, v: Json, e?: AuditEvent): string => {
      if (f === "value" && e?.entity === "permit_answer") return answer(e, v)
      if (f === "kind" && typeof v === "string" && e?.entity === "attachment") return ATTACH_LABEL[v] ?? v
      if ((f === "width" || f === "height") && typeof v === "number") return `${v} px`
      if (f === "duration_ms" && typeof v === "number") return `${String(Math.round(v / 100) / 10).replace(".", ",")} s`
      if (f === "item_id" && typeof v === "string") return itemOf(e?.permit ?? null, v)?.label ?? v
      if ((f === "sha256" || f.endsWith("_sha256")) && typeof v === "string" && /^[0-9a-f]{64}$/.test(v)) return `SHA-256 ${v.slice(0, 12)}…`
      if (f === "at" && typeof v === "string") return fullDateTime(v)
      return auditValueText(f, v, names)
    }

    const title = (e: AuditEvent): string => {
      let t = e.text
      // A refusal: the reason is the sentence ("Negado" is its badge; the code stays in Dados).
      if (!e.ok) t = t.replace(/^Negado \(PTW\d+\):\s*/, "")
      // An answer or attachment names its item by key: read it as the form's label.
      const key = e.entity === "permit_answer" || e.entity === "attachment" ? itemIdOf(e) : undefined
      // A changed answer also lists the column ("(valor)"): the answer line below already says it.
      const at = key ? t.lastIndexOf(`: ${key}`) : -1
      if (key && at >= 0 && /^( \(.*\))?$/.test(t.slice(at + key.length + 2))) t = `${t.slice(0, at)}: ${itemOf(e.permit, key)?.label ?? "item do formulário"}`
      return t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => names(id) ?? "registro removido")
    }

    const lines = (e: AuditEvent): string[] => {
      const de = obj(e.data.de), para = obj(e.data.para)
      const row = para ?? de
      switch (e.entity) {
        case "permit_answer": {
          if (para && de && "value" in para && "value" in de) return [`${answer(e, de.value)} → ${answer(e, para.value)}`]
          if (para && "value" in para) return [answer(e, para.value)]
          if (de && "value" in de) return [`Era: ${answer(e, de.value)}`]
          return []
        }
        case "attachment": {
          const file = str(row?.file_name)
          return file ? [`${ATTACH_LABEL[str(row?.kind) ?? ""] ?? "Arquivo"}: ${file}`] : []
        }
        case "permit_team": {
          const role = str(row?.role_id)
          return role ? [`Cargo: ${names(role) ?? "cargo removido"}`] : []
        }
        case "signature": case "permit_asset": case "permit_revision": return []
      }
      if (e.entity === "permit" && para) {
        if (e.action === "pt.criada") {
          return [
            str(para.scope) && `Serviço: ${str(para.scope)}`,
            str(para.location_id) && `Local: ${fmt("location_id", para.location_id)}`,
            str(para.version_id) && `Modelo: ${fmt("version_id", para.version_id)}`,
            str(para.work_window) && `Janela: ${fmt("work_window", para.work_window)}`,
          ].filter(Boolean) as string[]
        }
        if (e.action === "pt.estado") {
          const out: string[] = []
          if (str(para.number)) out.push(`Recebeu o número ${str(para.number)}`)
          if (typeof para.revision === "number" && typeof de?.revision === "number") out.push(`Revisão ${de.revision} → ${para.revision}`)
          if (str(para.hold_reason)) out.push(`Motivo da parada: ${str(para.hold_reason)}`)
          return out
        }
        // Prorrogar: the sentence already says from, to and why.
        if (e.action.startsWith("pt.parada") || e.action === "pt.retomada" || e.action === "pt.prorrogada") return []
      }
      // Any other row: the columns that matter, skipping the name the title already gives (a removal: the title says it all).
      if (!para) return []
      return eventChanges(e, (f, v) => fmt(f, v, e))
        .filter((c) => !TECHNICAL.has(c.field) && c.before !== c.after && !(de === null && NAME_FIELDS.has(c.field)))
        .map((c) => (de ? `${cap(label(c.field))}: ${c.before} → ${c.after}` : `${cap(label(c.field))}: ${c.after}`))
    }

    const data = (e: AuditEvent) => {
      const both = !!obj(e.data.de) && !!obj(e.data.para)
      const rows = eventChanges(e, (f, v) => fmt(f, v, e)).map((c) => ({
        field: c.field, label: cap(label(c.field)),
        ...(both ? { before: c.before, after: c.after } : { after: obj(e.data.para) ? c.after : c.before }),
      }))
      const extra = Object.entries(e.data).filter(([k]) => k !== "de" && k !== "para")
        .map(([k, v]) => ({ field: k, label: cap(label(k)), after: fmt(k, v, e) }))
      return [...rows, ...extra]
    }

    return { names, who, ptName, isDraft, title, lines, data, fmt }
  }, [state, store])
}
