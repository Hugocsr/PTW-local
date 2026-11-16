// @ts-nocheck — cópia de ptw-mockup-v2/src/core/form/permit.ts; não edite (node scripts/sync-shared.mjs)
/** The form of a permit: the stage gate and the frozen copy. */
import type { FormItem, FormSection, FormSpec, OptionList } from "@/registry/types"
import type { FormAnswers, FormContext } from "./answers.ts"
import { optionsOf } from "./answers.ts"
import type { SectionStatus } from "./status.ts"
import { sectionStatus } from "./status.ts"

/**
 * What still stops a stage: one entry per visible section of that stage that is not complete. A
 * section without a stage is completed with the first stage (`firstStageId`); its blockers count for
 * every stage (formRules.permitBlocker).
 */
export function stageGate(form: FormSpec | undefined, stageId: string, answers: FormAnswers, ctx: FormContext = {}, firstStageId?: string): { section: FormSection; status: SectionStatus }[] {
  return (form?.sections ?? [])
    .filter((s) => s.stageId === stageId || (s.stageId === undefined && stageId === firstStageId))
    .map((section) => ({ section, status: sectionStatus(section, answers, ctx) }))
}

/**
 * The form as a permit keeps it: list-backed questions get the list's active items copied in, so a
 * later rename or deactivation in Configuração › Listas never changes what a sent permit asked.
 */
export function freezeForm(form: FormSpec | undefined, lists: OptionList[]): FormSpec {
  return {
    sections: (form?.sections ?? []).map((s) => ({
      ...s,
      items: s.items.map((i) => (i.kind === "grupo" ? { ...i, columns: i.columns.map((c) => freezeItem(c, lists)) } : freezeItem(i, lists))),
    })),
  }
}

function freezeItem<T extends FormItem>(i: T, lists: OptionList[]): T {
  if (i.kind !== "marcacao" || !i.listId) return i
  // The list's options are copied in; the ones that stop the stage keep saying so (`blocks`).
  const block = new Set(i.blockOptionIds ?? [])
  const options = optionsOf(i, lists).map((o) => (block.has(o.id) ? { ...o, blocks: true } : o))
  return { ...i, options, listId: undefined, blockOptionIds: undefined }
}

/** The form a permit shows and is gated by: its frozen copy once sent (formSnapshots[snapshotSha256]), the live version while a draft. */
export function formOfPermit(frozen: FormSpec | null | undefined, ver: { form?: FormSpec }, lists: OptionList[]): FormSpec {
  return frozen ?? freezeForm(ver.form, lists)
}
/** @deprecated use formOfPermit (the permit keeps only snapshotSha256). */
export function permitForm(permit: { snapshot?: { form: FormSpec } }, ver: { form?: FormSpec }, lists: OptionList[]): FormSpec {
  return formOfPermit(permit.snapshot?.form, ver, lists)
}

export const countItems = (form: FormSpec | undefined) => form?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0
