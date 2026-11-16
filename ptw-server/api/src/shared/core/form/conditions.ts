// @ts-nocheck — cópia de ptw-mockup-v2/src/core/form/conditions.ts; não edite (node scripts/sync-shared.mjs)
/** Checklist answers, show-when conditions and conditional signatures. */
import type { CheckAnswer, CheckAnswers, Condition, FormSection, FormSpec, OptionList, SignSlot, VerificacaoItem } from "@/registry/types"
import type { FormAnswers } from "./answers.ts"
import { optionsOf } from "./answers.ts"

export const ANSWER_LABEL: Record<CheckAnswer, string> = { sim: "Sim", nao: "Não", na: "N/A", confirmo: "Confirmo" }
/** The fixed answers of a checklist kind ("lista" has none: its answers are the list's items). */
export const answersOf = (kind: CheckAnswers): CheckAnswer[] =>
  kind === "sim_nao_na" ? ["sim", "nao", "na"] : kind === "sim_nao" ? ["sim", "nao"] : kind === "confirmo" ? ["confirmo"] : []
/** "Sim / Não / N/A", "Confirmo" or the name of the answer list. */
export function answersLabel(item: Pick<VerificacaoItem, "answers" | "answerListId">, lists: OptionList[]): string {
  if (item.answers === "lista") return lists.find((l) => l.id === item.answerListId)?.name ?? "lista removida"
  return answersOf(item.answers).map((a) => ANSWER_LABEL[a]).join(" / ")
}
/**
 * What a checklist line can be answered: the fixed answers, or the (active) items of the answer list.
 * `all` also returns inactive list items, so an answer given before still reads correctly.
 */
export function lineChoices(item: Pick<VerificacaoItem, "answers" | "answerListId">, lists: OptionList[], all = false): { id: string; label: string }[] {
  if (item.answers !== "lista") return answersOf(item.answers).map((a) => ({ id: a, label: ANSWER_LABEL[a] }))
  const list = lists.find((l) => l.id === item.answerListId)
  return (list?.items ?? []).filter((x) => all || x.active).map((x) => ({ id: x.id, label: x.label }))
}
/** The words of one answer of a checklist line. */
export function lineAnswerLabel(item: Pick<VerificacaoItem, "answers" | "answerListId">, a: string, lists: OptionList[] = []): string {
  if (item.answers !== "lista") return ANSWER_LABEL[a as CheckAnswer] ?? a
  return lineChoices(item, lists, true).find((c) => c.id === a)?.label ?? "resposta"
}

/** The single rule kind: the source item holds one of the values (ticked options, or a line's answer). */
export function evalCondition(c: Condition | undefined, answers: FormAnswers): boolean {
  if (!c) return true
  const a = answers[c.itemId]
  if (!a) return false
  if (a.t === "marcacao") return a.ids.some((id) => c.anyOf.includes(id))
  if (a.t === "verificacao" && c.lineId) { const l = a.lines[c.lineId]; return !!l && c.anyOf.includes(l.a) }
  return false
}

export const visibleItems = (s: FormSection, answers: FormAnswers) => s.items.filter((i) => evalCondition(i.showWhen, answers))

/** A signature counts for closing its stage when it is required and its condition (if any) holds. */
export const slotRequired = (slot: Pick<SignSlot, "required" | "requiredWhen">, answers: FormAnswers | undefined) =>
  slot.required && evalCondition(slot.requiredWhen, answers ?? {})

/**
 * How a signature stands against the answers: always required, optional, required by an answer, or
 * not required now. A conditional signature not required now is no one's to wait for: the screen
 * shows it muted as "Não exigida" with the answer that would require it ("só para Classe 4").
 */
export type SlotNeed =
  | { need: "sempre" | "opcional" | "exigida" }
  | { need: "nao_exigida"; when: string }

/** "só para Classe 4", "só quando “Linha” for Sim", or a generic phrase when the source item is gone. */
export function conditionPhrase(c: Condition, form: Pick<FormSpec, "sections">, lists: OptionList[] = []): string {
  const src = form.sections.flatMap((s) => s.items).find((i) => i.id === c.itemId)
  if (src?.kind === "marcacao") {
    const vals = c.anyOf.map((a) => optionsOf(src, lists, true).find((o) => o.id === a)?.label).filter((x): x is string => !!x)
    if (vals.length) return `só para ${vals.join(" ou ")}`
  }
  if (src?.kind === "verificacao") {
    const line = src.lines.find((l) => l.id === c.lineId)?.label ?? src.label
    const vals = c.anyOf.map((a) => lineAnswerLabel(src, a, lists))
    if (vals.length) return `só quando “${line}” for ${vals.join(" ou ")}`
  }
  return "só quando uma resposta pedir"
}

export function slotNeed(slot: Pick<SignSlot, "required" | "requiredWhen">, answers: FormAnswers | undefined, form: Pick<FormSpec, "sections">, lists: OptionList[] = []): SlotNeed {
  if (!slot.required) return { need: "opcional" }
  if (!slot.requiredWhen) return { need: "sempre" }
  return slotRequired(slot, answers) ? { need: "exigida" } : { need: "nao_exigida", when: conditionPhrase(slot.requiredWhen, form, lists) }
}

/** The words after a signature's roles: " · opcional", " · exigida por uma resposta", or nothing (not required: its own line says why). */
export const needSuffix = (n: SlotNeed) => (n.need === "opcional" ? " · opcional" : n.need === "exigida" ? " · exigida por uma resposta" : "")
