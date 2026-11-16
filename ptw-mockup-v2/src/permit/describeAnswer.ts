import { ENERGY_LABEL, lineAnswerLabel, optionsOf, type ItemAnswer } from "@/core/form"
import type { FormItem, OptionList, Person } from "@/registry/types"
import type { PermitAttachment } from "./types"

const CHECK: Record<string, string> = { sim: "Sim", nao: "Não", na: "N/A", confirmo: "Confirmado" }

/** One answer written for the history ("—" = empty). Files by name only, never their content. */
/** Files are attachment ids: `attachments` names them. Dates "AAAA-MM-DD" read dd/mm/aaaa. */
export function describeAnswer(item: FormItem | undefined, v: ItemAnswer | undefined, lists: OptionList[], people: Pick<Person, "id" | "name">[] = [], attachments: Pick<PermitAttachment, "id" | "fileName">[] = []): string {
  const who = (id: string | undefined) => (id ? people.find((p) => p.id === id)?.name ?? id : "—")
  const fname = (id: string) => attachments.find((a) => a.id === id)?.fileName ?? "arquivo"
  const br = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d)
  if (!v) return "—"
  switch (v.t) {
    case "texto": return v.v.trim() || "—"
    case "numero": return `${String(v.v).replace(".", ",")}${item?.kind === "numero" && item.unit ? ` ${item.unit}` : ""}`
    case "horario": return v.v || "—"
    case "data": return v.v ? br(v.v) : "—"
    case "documento": return [v.code.trim() || "—", v.validUntil ? `válido até ${br(v.validUntil)}` : "", v.files.length ? v.files.map(fname).join(", ") : ""].filter(Boolean).join(" · ")
    case "pessoa": return v.ids.map(who).join(", ") || "—"
    case "isolamento": return v.rows.map((r, k) => `${k + 1}. ${r.point || "—"}${r.energy ? ` (${ENERGY_LABEL[r.energy]})` : ""} · ${r.method || "—"} · cadeado ${r.lock || "—"} · energia zero ${r.zero === "sim" ? "verificada" : r.zero === "nao" ? "NÃO verificada" : "—"} · ${who(r.by)}`).join("; ") || "—"
    case "grupo": {
      const cols = item?.kind === "grupo" ? item.columns : []
      return v.rows.map((r, k) => `${k + 1}. ${cols.map((c) => `${c.label}: ${describeAnswer(c, r.answers[c.id], lists, people, attachments)}`).join(", ")}`).join("; ") || "—"
    }
    case "anexo": return v.files.length ? v.files.map(fname).join(", ") : "—"
    case "marcacao": {
      const opts = item?.kind === "marcacao" ? optionsOf(item, lists, true) : []
      const names = v.ids.map((id) => opts.find((o) => o.id === id)?.label ?? id)
      if (v.other?.trim()) names.push(`Outro: ${v.other.trim()}`)
      return names.join(", ") || "—"
    }
    case "verificacao": {
      const lines = item?.kind === "verificacao" ? item.lines : []
      const out = Object.entries(v.lines).map(([id, l]) => `${lines.find((x) => x.id === id)?.label ?? id}: ${item?.kind === "verificacao" && item.answers === "lista" ? lineAnswerLabel(item, l.a, lists) : CHECK[l.a] ?? l.a}${l.note ? ` (${l.note})` : ""}`)
      return out.join("; ") || "—"
    }
  }
}
