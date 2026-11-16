import type { FormAnswers } from "./form.ts"
import type { PermitState } from "./permitState.ts"
import type { FormSpec, OptionList } from "../registry/types.ts"

/**
 * "Desabilitados agora": permits whose model version does not hold the equipment (`holdsEquipment`
 * false, e.g. disabling an interlock) and that are still open. Where each one stands:
 * - `vigor`: the protection is disabled now (ativa, no stop waiting);
 * - `reabilitar`: the work is over or stopped and the protection still has to be put back and
 *   accepted (suspensa, entregue, expirada, or ativa with a stop);
 * - `aprovacao`: asked for, not yet in force (em análise, devolvida, emitida).
 * Drafts and finished permits are not on the panel.
 */
export type BypassGroup = "vigor" | "reabilitar" | "aprovacao"

export function bypassGroup(p: { state: PermitState; holdReason: string | null }, holdsEquipment: boolean): BypassGroup | null {
  if (holdsEquipment) return null
  switch (p.state) {
    case "ativa": return p.holdReason === null ? "vigor" : "reabilitar"
    case "suspensa": case "entregue": case "expirada": return "reabilitar"
    case "em_analise": case "devolvida": case "emitida": return "aprovacao"
    default: return null
  }
}

/**
 * What was asked, read from the answers in the order of the form: single-choice and short-text items
 * that have an answer (the tag, the class, the kind). Long texts, checklists and attachments are left out.
 */
export function bypassFacts(form: FormSpec | undefined, answers: FormAnswers, lists: OptionList[], max = 3): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const section of form?.sections ?? []) {
    for (const item of section.items) {
      if (out.length >= max) return out
      const a = answers[item.id]
      if (!a) continue
      if (item.kind === "marcacao" && a.t === "marcacao") {
        const options = item.listId ? lists.find((l) => l.id === item.listId)?.items ?? [] : item.options
        const labels = a.ids.map((id) => options.find((o) => o.id === id)?.label).filter((x): x is string => !!x)
        if (a.other) labels.push(a.other)
        if (labels.length) out.push({ label: item.label, value: labels.join(", ") })
      } else if (item.kind === "texto" && !item.long && a.t === "texto" && a.v.trim()) {
        out.push({ label: item.label, value: a.v.trim() })
      }
    }
  }
  return out
}
