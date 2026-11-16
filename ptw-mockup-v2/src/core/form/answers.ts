/** Answers as the database stores them, and the options of a marcação. */
import type { ColumnItem, EnergyKind, FormItem, FormItemKind, FormOption, LineAnswer, OptionList, Person } from "@/registry/types"

/**
 * One answer per item, exactly as the database stores it (permit_answer.value). Checklists answer per
 * line. Dates are ISO "AAAA-MM-DD", always complete (the screen shows and types dd/mm/aaaa); files
 * are ids of the permit's attachments (metadata in PermitData.attachments). An incomplete entry is
 * never an answer: it stays in the field until it is complete.
 */
export type ItemAnswer =
  | { t: "texto"; v: string }
  | { t: "marcacao"; ids: string[]; other?: string }
  /** `a`: sim/nao/na/confirmo, or the id of an item of the answer list (`answers: "lista"`). */
  | { t: "verificacao"; lines: Record<string, { a: LineAnswer; note?: string }> }
  | { t: "anexo"; files: string[] }
  | { t: "numero"; v: number }
  | { t: "horario"; v: string }
  /** `code` as typed; `validUntil` "AAAA-MM-DD". */
  | { t: "documento"; code: string; files: string[]; validUntil?: string }
  /** "AAAA-MM-DD". */
  | { t: "data"; v: string }
  | { t: "pessoa"; ids: string[] }
  | { t: "isolamento"; rows: IsolationRow[] }
  | { t: "grupo"; rows: GroupRow[] }

/** One isolation point (bloqueio / LOTO). `assetId` = one of the PT's assets, when the point is one. */
export interface IsolationRow {
  id: string
  point: string
  assetId?: string
  energy?: EnergyKind
  method: string
  lock: string
  zero?: "sim" | "nao"
  /** Person id of who applied it. */
  by?: string
}
/** One row of a repeatable group: an answer per column. */
export interface GroupRow { id: string; answers: Record<string, ItemAnswer> }

/**
 * What some checks need beyond the answers: the register's people, today's date ("AAAA-MM-DD" in the
 * unit's zone), the instant (account expiry) and the permit's location path (cargo scope; absent =
 * scope not checked, as when testing a template).
 */
export interface FormContext { people?: Person[]; today?: string; now?: string; pathIds?: string[]; /** Option lists: names of list answers and list options in messages. */ lists?: OptionList[] }

export const ENERGY_LABEL: Record<EnergyKind, string> = {
  eletrica: "Elétrica", mecanica: "Mecânica", hidraulica: "Hidráulica", pneumatica: "Pneumática", termica: "Térmica", quimica: "Química", gravitacional: "Gravitacional", outra: "Outra",
}
/** Kinds a column of a repeatable group may have. */
export const COLUMN_KINDS: ColumnItem["kind"][] = ["texto", "numero", "horario", "marcacao", "verificacao"]
export const isColumnKind = (k: FormItemKind): k is ColumnItem["kind"] => (COLUMN_KINDS as string[]).includes(k)

export type FormAnswers = Record<string, ItemAnswer>

/**
 * The options of a tick item: its own, or the active items of its configured list. `all` also returns
 * inactive list items, so an answer given before an item was deactivated still reads correctly.
 */
export function optionsOf(item: Extract<FormItem, { kind: "marcacao" }>, lists: OptionList[], all = false): FormOption[] {
  if (!item.listId) return item.options
  const list = lists.find((l) => l.id === item.listId)
  return (list?.items ?? []).filter((x) => all || x.active).map((x) => ({ id: x.id, label: x.label }))
}

/** Does choosing this option stop the stage? Own options say it with `blocks`; list options by `blockOptionIds`. */
export function optionBlocks(item: Extract<FormItem, { kind: "marcacao" }>, optionId: string): boolean {
  if (item.listId && (item.blockOptionIds ?? []).includes(optionId)) return true
  return item.options.some((o) => o.id === optionId && o.blocks === true)
}

/** The first chosen option that stops the stage, with its label (null = none). */
export function blockingChoice(item: Extract<FormItem, { kind: "marcacao" }>, ids: string[], lists: OptionList[] = []): { id: string; label: string } | null {
  const id = ids.find((x) => optionBlocks(item, x))
  if (id === undefined) return null
  return { id, label: optionsOf(item, lists, true).find((o) => o.id === id)?.label ?? item.options.find((o) => o.id === id)?.label ?? "opção" }
}
