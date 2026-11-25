/** The plant's option lists (Configuração › Catálogos); item ids follow the position. */
import type { OptionList } from "@/registry/types"
import { C } from "./ids"

export const LIST_LABELS = {
  epi: ["Capacete", "Óculos de segurança", "Protetor auricular", "Luvas", "Calçado de segurança", "Protetor facial", "Máscara com filtro para gases ácidos", "Avental de raspa", "Cinto paraquedista", "Vestimenta antichama"],
  perigos: ["Queda de altura", "Queimadura térmica", "Contato com produto químico (licor, soda, ClO₂)", "Gases tóxicos (H₂S, ClO₂, CO)", "Deficiência de oxigênio", "Choque elétrico", "Arco elétrico", "Incêndio ou explosão", "Partes móveis", "Ruído", "Vapor e superfícies quentes"],
  trabalho: ["Trabalho a quente", "Espaço confinado", "Em altura", "Elétrico", "Içamento de carga", "Escavação"],
  simna: ["SIM", "N.A."],
} as const satisfies Record<string, readonly string[]>
type ListKey = keyof typeof LIST_LABELS
const KEYS = Object.keys(LIST_LABELS) as ListKey[]

export const LIST = C.list
export function listItemId(list: ListKey, label: string): string {
  const i = (LIST_LABELS[list] as readonly string[]).indexOf(label)
  if (i < 0) throw new Error(`item desconhecido na lista ${list}: ${label}`)
  return C.listItem(KEYS.indexOf(list), i + 1)
}

const NAMES: Record<ListKey, string> = { epi: "EPI", perigos: "Perigos", trabalho: "Tipos de trabalho", simna: "SIM / N.A." }

export const celuloseLists = (updatedAt: string): OptionList[] => KEYS.map((k) => ({
  id: C.list[k], name: NAMES[k], revision: 1, updatedAt,
  items: LIST_LABELS[k].map((label) => ({ id: listItemId(k, label), label, active: true })),
}))
