/**
 * Fixed uuids of the pulp-mill scenario ("Fábrica de celulose · demonstração"), in families of their
 * own (0x0a.. registry and models, 0x0b.. permits), so they never meet the original sample's ids.
 */
import { seedUuid } from "@/registry/seedIds"

const keyed = <K extends string>(family: number, keys: readonly K[]): Record<K, string> =>
  Object.fromEntries(keys.map((k, i) => [k, seedUuid(family, i + 1)])) as Record<K, string>

export const PEOPLE = [
  "ricardo", "aline", "fernanda", "lucas", "juliana", "andre", "patricia", "gustavo", "marcos", "camila",
  "roberto", "helena", "thiago", "renata", "eduardo", "jose", "sandro", "diego", "luciana",
] as const
export type PersonKey = (typeof PEOPLE)[number]

export const MODELS = ["geral", "quente", "confinado", "altura", "eletrica"] as const
export type ModelKey = (typeof MODELS)[number]
export const STAGES = ["sol", "lib", "prep", "emi", "campo", "ent", "area"] as const
export const SLOTS = ["sol", "lib", "prep", "prep2", "emi", "campo", "ent", "area"] as const

const person = keyed(0x0a20, PEOPLE)

export const C = {
  unit: seedUuid(0x0a01, 1),
  locationType: keyed(0x0a02, ["area", "sala", "ponto", "patio"] as const),
  assetType: keyed(0x0a03, ["vaso", "tanque", "bomba", "motor", "cald", "vent", "soprador", "comp", "painel", "gaveta", "trafo", "tubo", "inst", "forno", "maq", "transp", "evap", "precip"] as const),
  role: keyed(0x0a04, ["operador", "tecMec", "tecEle", "tecIns", "supTurno", "coordMan", "coordArea", "gerArea", "gerMan", "gerInd", "espOp", "espMan", "tecSeg", "vigia", "lider", "exec"] as const),
  relationKind: keyed(0x0a05, ["alimenta", "abastece", "protege", "parte"] as const),
  loc: (n: number) => seedUuid(0x0a10, n),
  asset: (n: number) => seedUuid(0x0a11, n),
  rel: (n: number) => seedUuid(0x0a12, n),
  person,
  personRole: (p: PersonKey, n: number) => seedUuid(0x0a21, (PEOPLE.indexOf(p) + 1) * 0x100 + n),
  list: keyed(0x0a30, ["epi", "perigos", "trabalho", "simna"] as const),
  listItem: (list: number, n: number) => seedUuid(0x0a31 + list, n),
  template: keyed(0x0a40, MODELS),
  version: keyed(0x0a41, MODELS),
  stage: (m: ModelKey, k: (typeof STAGES)[number]) => seedUuid(0x0a50 + MODELS.indexOf(m), STAGES.indexOf(k) + 1),
  slot: (m: ModelKey, k: (typeof SLOTS)[number]) => seedUuid(0x0a58 + MODELS.indexOf(m), SLOTS.indexOf(k) + 1),
  /** Ids the import of the interlock model makes (in place of uuidv7, so the chain is stable). */
  imported: (n: number) => seedUuid(0x0a70, n),
  /** Items of the "Intertravamentos" list, filled in after the import. */
  interlock: (n: number) => seedUuid(0x0a71, n),
  permit: (n: number) => seedUuid(0x0b01, n),
  signature: (n: number) => seedUuid(0x0b02, n),
  attachment: (n: number) => seedUuid(0x0b03, n),
}
