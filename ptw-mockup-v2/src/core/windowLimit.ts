/**
 * The longest work window a template version allows (`template_version.max_window`; R3): checked at
 * Enviar, at the Emissão and at Prorrogar (PTW31). Pure, with the database's words.
 */
import type { TemplateVersion } from "@/registry/types"
import type { RuleError } from "./ptwErrors"
import { cmpInstant } from "./time"

/** "até 3 dias" when the limit is whole days, else "até 12 horas" (the database's words). */
export function maxWindowText(hours: number): string {
  if (hours % 24 === 0) { const d = hours / 24; return `até ${d} ${d === 1 ? "dia" : "dias"}` }
  return `até ${String(hours).replace(".", ",")} ${hours === 1 ? "hora" : "horas"}`
}

/** PTW31: `end − start` beyond the version's limit (null limit = none). */
export function windowLimitDenied(ver: Pick<TemplateVersion, "maxWindowHours">, start: string, end: string): RuleError | null {
  const h = ver.maxWindowHours
  if (h === null || h === undefined) return null
  if (cmpInstant(end, start) <= h * 3_600_000) return null
  return { code: "PTW31", message: `A janela passa do prazo máximo deste modelo (${maxWindowText(h)})` }
}
