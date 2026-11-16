// @ts-nocheck — cópia de ptw-mockup-v2/src/core/form/validate.ts; não edite (node scripts/sync-shared.mjs)
/** Problems in what the administrator built (a version with any of them cannot be activated). */
import type { FormItem, FormSection, FormSpec, OptionList, Stage } from "@/registry/types"
import { FORM_ID_RE } from "../../lib/id.ts"
import { isColumnKind, optionBlocks, optionsOf } from "./answers.ts"
import { MAX_DECIMALS } from "./masks.ts"

/**
 * Problems in what the administrator built. A version with any of them cannot be activated.
 * A condition may only point at an item that appears before it (the value must exist when shown).
 */
export function validateForm(form: FormSpec | undefined, stages: Stage[], lists: OptionList[] = []): string[] {
  if (!form) return []
  const out: string[] = []
  const seenIds = new Set<string>()
  const order = new Map<string, number>()
  const stageIdx = new Map(stages.map((s, i) => [s.id, i]))
  let n = 0
  const posOf = (s: FormSection) => (s.stageId === undefined ? 0 : stageIdx.get(s.stageId) ?? 99)
  const sorted = [...form.sections].sort((a, b) => posOf(a) - posOf(b))
  for (const s of sorted) for (const i of s.items) order.set(i.id, n++)
  for (const s of form.sections) {
    const name = s.title.trim() || "Seção sem título"
    if (s.stageId !== undefined && !stageIdx.has(s.stageId)) out.push(`${name}: etapa removida`)
    if (!s.title.trim()) out.push("Há seção sem título")
    if (s.items.length === 0) out.push(`${name}: sem itens`)
    for (const i of s.items) {
      if (!FORM_ID_RE.test(i.id)) out.push(`${i.label || name}: id inválido (letras, algarismos e _ . : -, até 64)`)
      if (seenIds.has(i.id)) out.push(`${i.label || name}: id repetido no formulário`)
      seenIds.add(i.id)
      out.push(...itemSetupProblems(i, name, lists))
      if (i.kind === "grupo") {
        if (i.columns.length === 0) out.push(`${i.label || name}: grupo sem colunas`)
        if (new Set(i.columns.map((c) => c.id)).size !== i.columns.length) out.push(`${i.label || name}: id repetido dentro do grupo`)
        if (i.columns.some((c) => !FORM_ID_RE.test(c.id))) out.push(`${i.label || name}: coluna com id inválido`)
        if (i.minRows < 0 || !Number.isInteger(i.minRows)) out.push(`${i.label || name}: mínimo de linhas inválido`)
        for (const c of i.columns) {
          if (!isColumnKind(c.kind)) out.push(`${i.label || name}: coluna de tipo não permitido`)
          if (c.showWhen) out.push(`${i.label || name}: coluna com condição`)
          out.push(...itemSetupProblems(c, `${i.label || name} › coluna`, lists))
        }
      }
      if (i.showWhen) {
        const src = order.get(i.showWhen.itemId)
        if (src === undefined) out.push(`${i.label || name}: condição aponta para item removido`)
        else if (src >= (order.get(i.id) ?? 0)) out.push(`${i.label || name}: condição aponta para item posterior`)
        if (i.showWhen.anyOf.length === 0) out.push(`${i.label || name}: condição sem resposta escolhida`)
      }
    }
  }
  // A conditional signature points at a question of its own stage or an earlier one (answered before anyone signs).
  const stageOfItem = new Map(form.sections.flatMap((s) => s.items.map((i) => [i.id, posOf(s)] as const)))
  stages.forEach((st, k) => st.slots.forEach((sl) => {
    if (!sl.requiredWhen) return
    const at = stageOfItem.get(sl.requiredWhen.itemId)
    if (at === undefined) out.push(`Assinatura “${sl.meaning}”: condição aponta para item removido`)
    else if (at > k) out.push(`Assinatura “${sl.meaning}”: condição aponta para item de etapa posterior`)
    if (sl.requiredWhen.anyOf.length === 0) out.push(`Assinatura “${sl.meaning}”: condição sem resposta escolhida`)
  }))
  return [...new Set(out)]
}

/** Setup problems of one item (also used for each column of a group). */
function itemSetupProblems(i: FormItem, name: string, lists: OptionList[]): string[] {
  const out: string[] = []
  {
    {
      if (!i.label.trim() && i.kind !== "aviso") out.push(`${name}: item sem rótulo`)
      if (i.kind === "aviso" && !i.text.trim()) out.push(`${name}: aviso sem texto`)
      if (i.kind === "marcacao" && i.listId && !lists.some((l) => l.id === i.listId)) out.push(`${i.label || name}: lista removida`)
      else if (i.kind === "marcacao" && optionsOf(i, lists).length === 0 && !i.other) out.push(`${i.label || name}: marcação sem opções`)
      if (i.kind === "marcacao" && !i.listId && i.options.some((o) => !o.label.trim())) out.push(`${i.label || name}: opção sem nome`)
      if (i.kind === "marcacao" && (i.blockOptionIds ?? []).length > 0) {
        const list = lists.find((l) => l.id === i.listId)
        if (!i.listId) out.push(`${i.label || name}: opções que impedem sem lista`)
        else if (list && (i.blockOptionIds ?? []).some((id) => !list.items.some((x) => x.id === id))) out.push(`${i.label || name}: opção que impede não está na lista`)
      }
      if (i.kind === "marcacao") {
        const opts = optionsOf(i, lists)
        if (opts.length > 0 && !i.other && opts.every((o) => optionBlocks(i, o.id))) out.push(`${i.label || name}: todas as opções impedem a etapa`)
      }
      if (i.kind === "verificacao" && i.answers === "lista") {
        const list = lists.find((l) => l.id === i.answerListId)
        if (!i.answerListId) out.push(`${i.label || name}: escolha a lista de respostas`)
        else if (!list) out.push(`${i.label || name}: lista de respostas removida`)
        else {
          if (list.items.filter((x) => x.active).length === 0) out.push(`${i.label || name}: lista de respostas sem itens`)
          if (i.lines.some((l) => [...l.blockOn, ...l.noteOn].some((a) => !list.items.some((x) => x.id === a)))) out.push(`${i.label || name}: resposta que impede ou pede justificativa não está na lista`)
        }
      }
      if (i.kind === "numero") {
        if (!Number.isInteger(i.decimals) || i.decimals < 0 || i.decimals > MAX_DECIMALS) out.push(`${i.label || name}: casas decimais entre 0 e ${MAX_DECIMALS}`)
        if (i.min !== undefined && i.max !== undefined && i.min > i.max) out.push(`${i.label || name}: mínimo maior que o máximo`)
      }
      if (i.kind === "anexo" && i.accept.length === 0) out.push(`${i.label || name}: anexo sem tipo aceito`)
      if (i.kind === "verificacao" && i.lines.length === 0) out.push(`${i.label || name}: verificação sem linhas`)
      if (i.kind === "verificacao" && i.lines.some((l) => !l.label.trim())) out.push(`${i.label || name}: linha sem texto`)
      if (i.kind === "data" && i.min && i.max && i.min > i.max) out.push(`${i.label || name}: data inicial depois da final`)
      if (i.kind === "documento" && i.pattern !== undefined && !i.pattern.trim()) out.push(`${i.label || name}: formato vazio`)
      if (i.kind === "isolamento" && (i.minRows < 0 || !Number.isInteger(i.minRows))) out.push(`${i.label || name}: mínimo de pontos inválido`)
    }
  }
  return out
}
