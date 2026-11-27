/**
 * Fixed uuids of the sample data, so seeds, tests and the audit chain name the same rows.
 * Shape: "019a" + family (4 hex) + "-0000-7000-8000-" + n (12 hex): a valid uuid v7 (version 7,
 * variant 10) whose time part sorts before any id made at run time.
 *
 * Families 0x0001–0x00ff are the registry and the models (this file). Other seeds take their own
 * family from 0x0100 up (permits 0x01xx, audit 0x02xx), always through seedUuid().
 */

export function seedUuid(family: number, n: number): string {
  if (!Number.isInteger(family) || family < 0 || family > 0xffff) throw new Error(`família inválida: ${family}`)
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffffffff) throw new Error(`número inválido: ${n}`)
  return `019a${family.toString(16).padStart(4, "0")}-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
}

const keyed = <K extends string>(family: number, keys: readonly K[]): Record<K, string> =>
  Object.fromEntries(keys.map((k, i) => [k, seedUuid(family, i + 1)])) as Record<K, string>

const PEOPLE = ["marina", "rafael", "paulo", "ana", "carlos", "beatriz", "joana", "diego", "luis", "sergio"] as const
const VERSIONS = ["painel1", "painel2", "painel3", "vapor1", "geral1"] as const
const STAGES = ["sol", "prep", "emi", "campo", "ent", "area"] as const
const SLOTS = ["sol", "iso", "ver", "inc", "prep", "emi", "campo", "ent", "area"] as const

/** The labels of each sample list, in order: the item id follows the position. */
export const LIST_LABELS = {
  epi: ["Capacete", "Protetor facial", "Proteção respiratória", "Calçado de segurança", "Óculos de segurança", "Protetor auricular", "Luvas", "Cinto de segurança"],
  perigos: ["Queda de altura", "Queda de objetos", "Ruído", "Calor", "Vibração", "Partículas", "Tropeço ou escorregão", "Iluminação deficiente", "Veículos em movimento"],
  docs: ["Análise de risco", "PT de trabalho a quente", "Plano de içamento", "Alta tensão", "PT de espaço confinado", "Procedimento de trabalho"],
  trabalho: ["Elétrico", "Em altura", "Espaço confinado", "Trabalho a quente", "Material perigoso"],
  simna: ["SIM", "N.A."],
} as const satisfies Record<string, readonly string[]>
type ListKey = keyof typeof LIST_LABELS
const LISTS = Object.keys(LIST_LABELS) as ListKey[]

type VersionKey = (typeof VERSIONS)[number]

const person = keyed(0x0020, PEOPLE)

export const ID = {
  unit: seedUuid(0x0001, 1),
  locationType: keyed(0x0002, ["predio", "area", "linha", "sala", "zona", "ponto"] as const),
  assetType: keyed(0x0003, ["painel", "modulo", "alim", "motor", "tubo", "valv", "cald"] as const),
  role: keyed(0x0004, ["lider", "exec", "tec", "sup"] as const),
  relationKind: keyed(0x0005, ["alimenta", "isola", "abastece", "parte"] as const),
  /** Tipos de trabalho do catálogo: o id segue a posição na lista de mesmo nome (SPEC 012). */
  workType: (label: (typeof LIST_LABELS.trabalho)[number]) => seedUuid(0x0006, LIST_LABELS.trabalho.indexOf(label) + 1),
  /** n = the old number (loc_0003 → 3). */
  loc: (n: number) => seedUuid(0x0010, n),
  asset: (n: number) => seedUuid(0x0011, n),
  rel: (n: number) => seedUuid(0x0012, n),
  person,
  /** The n-th cargo (1, 2…) of a person, given by key ("sergio") or by id. */
  personRole(p: string, n: number): string {
    const i = PEOPLE.findIndex((k) => k === p || person[k] === p)
    if (i < 0) throw new Error(`pessoa desconhecida: ${p}`)
    return seedUuid(0x0021, (i + 1) * 0x100 + n)
  },
  list: keyed(0x0030, LISTS),
  listItem(list: ListKey, label: string): string {
    const i = (LIST_LABELS[list] as readonly string[]).indexOf(label)
    if (i < 0) throw new Error(`item desconhecido na lista ${list}: ${label}`)
    return seedUuid(0x0031 + LISTS.indexOf(list), i + 1)
  },
  template: keyed(0x0040, ["painel", "vapor", "geral"] as const),
  version: keyed(0x0041, VERSIONS),
  /** Stage and slot ids are unique in the unit (one per version), as the database requires. */
  stage: (v: VersionKey, k: (typeof STAGES)[number]) => seedUuid(0x0050 + VERSIONS.indexOf(v), STAGES.indexOf(k) + 1),
  slot: (v: VersionKey, k: (typeof SLOTS)[number]) => seedUuid(0x0060 + VERSIONS.indexOf(v), SLOTS.indexOf(k) + 1),
}
