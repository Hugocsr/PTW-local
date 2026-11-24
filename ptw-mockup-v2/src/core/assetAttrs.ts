/**
 * The sheet of plants, areas and equipment (SGI Forces · Gestão de Ativos, UC-BACK-01): which keys live in
 * `attrs`, their labels, help and choices. Pure; the screen (registry/AssetManagementView) draws its forms
 * and detail grids from these lists, so a key is spelled in one place only.
 */
import type { AttrLeaf, AttrValue, RecordAttrs } from "@/registry/types"

export interface AttrField {
  key: string
  label: string
  /** One line under the field, e.g. "[SAP] Chave de integração R1". */
  help?: string
  placeholder?: string
  kind?: "text" | "select" | "textarea" | "date"
  options?: readonly { value: string; label: string }[]
  /** Spans both columns of the form and of the detail grid. */
  full?: boolean
  /** Shown in monospace (codes, numbers, dates). */
  mono?: boolean
  maxLength?: number
}

export const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { value: "America/Fortaleza", label: "America/Fortaleza" },
  { value: "America/Manaus", label: "America/Manaus" },
  { value: "America/Cuiaba", label: "America/Cuiaba" },
  { value: "America/Belem", label: "America/Belem" },
  { value: "America/Recife", label: "America/Recife" },
  { value: "America/Porto_Velho", label: "America/Porto_Velho" },
  { value: "America/Rio_Branco", label: "America/Rio_Branco" },
] as const

/** Status operacional (SGI `sop`). */
export const OPERATING_STATUS = [
  { value: "operando", label: "Operando" },
  { value: "em_manutencao", label: "Em manutenção" },
  { value: "parado", label: "Parado" },
  { value: "desativado", label: "Desativado" },
] as const

export const PROTECTION_TYPES = [
  { value: "sensor_de_processo", label: "Sensor de processo" },
  { value: "valvula_de_bloqueio", label: "Válvula de bloqueio" },
  { value: "rele_de_protecao", label: "Relé de proteção" },
  { value: "chave_de_seguranca", label: "Chave de segurança" },
  { value: "logica_de_clp_dcs", label: "Lógica de CLP/DCS" },
  { value: "misto", label: "Misto" },
  { value: "outro", label: "Outro" },
] as const

export const PROTECTION_PRINCIPLES = [
  { value: "desliga_equipamento", label: "Desliga equipamento" },
  { value: "fecha_valvula", label: "Fecha válvula" },
  { value: "bloqueia_partida", label: "Bloqueia partida" },
  { value: "emite_alarme_mais_trip", label: "Emite alarme + trip" },
  { value: "emite_alarme_apenas", label: "Emite alarme apenas" },
  { value: "outro", label: "Outro" },
] as const

/** Classes de risco do SGI (catálogo de tenant). Texto livre no cadastro: a PT não depende dela. */
export const RISK_CLASSES = [
  { value: "Crítico", label: "Crítico" },
  { value: "Alto Risco", label: "Alto Risco" },
  { value: "Classe 1", label: "Classe 1" },
  { value: "Classe 2", label: "Classe 2" },
] as const

export const PLANT_FIELDS: readonly AttrField[] = [
  { key: "fuso", label: "Fuso horário", kind: "select", options: TIMEZONES },
  { key: "localizacao", label: "Localização", placeholder: "Barcarena/PA", maxLength: 120 },
  { key: "werks", label: "WERKS — Cód. SAP Planta", help: "[SAP] Chave de integração R1 · 4 caracteres", placeholder: "BR01", mono: true, maxLength: 4 },
  { key: "iwerk", label: "IWERK — Planta Planejadora", help: "[SAP] Se vazio, assume o WERKS", placeholder: "BR01", mono: true, maxLength: 4 },
  { key: "bukrs", label: "BUKRS — Empresa SAP", help: "[SAP] Código da empresa FI/CO", placeholder: "BR00", mono: true, maxLength: 4 },
  { key: "regio", label: "REGIO — UF / Região", help: "[SAP] Estado / região", placeholder: "SP", mono: true, maxLength: 3 },
]

export const AREA_FIELDS: readonly AttrField[] = [
  { key: "tplnr", label: "TPLNR — Local Funcional SAP", help: "[SAP] Chave de integração R1 · única por planta", placeholder: "BR-PNO-CAL", mono: true, full: true, maxLength: 40 },
  { key: "beber", label: "BEBER — Seção da Planta", help: "[SAP] Subdivisão / seção produtiva", placeholder: "01", mono: true, maxLength: 3 },
  { key: "kostl", label: "KOSTL — Centro de Custo", help: "[SAP] Rateio de custos de manutenção", placeholder: "CC-1001", mono: true, maxLength: 10 },
]

export const EQUIPMENT_FIELDS: readonly AttrField[] = [
  { key: "equnr", label: "EQUNR — Nº SAP", help: "[SAP] Identificador de referência (EQUI.EQUNR) · único no tenant", placeholder: "10001234", mono: true, maxLength: 18 },
  { key: "fabricante", label: "Fabricante", placeholder: "KSB", maxLength: 120 },
  { key: "modelo", label: "Modelo", placeholder: "Referência do catálogo", maxLength: 120 },
  { key: "nserie", label: "Número de série", placeholder: "Único quando preenchido", mono: true, maxLength: 60 },
  { key: "statusOp", label: "Status operacional", kind: "select", options: OPERATING_STATUS },
  { key: "tplnr", label: "TPLNR / FLOC — Local Funcional SAP", help: "[SAP] Posição hierárquica na planta (IFLOT.TPLNR)", placeholder: "BR-PNO-CAL-BP205", mono: true, full: true, maxLength: 40 },
  { key: "catSap", label: "Categoria SAP (EQTYP)", help: "[SAP] M = Máquina, V = Veículo, E = Elétrico", placeholder: "M", mono: true, maxLength: 1 },
  { key: "ninv", label: "Nº inventário (INVNR)", help: "[SAP] Nº de patrimônio físico", mono: true, maxLength: 25 },
  { key: "kostl", label: "Centro de custo (KOSTL)", help: "[SAP] Manutenção", placeholder: "CC-1001", mono: true, maxLength: 10 },
  { key: "iwerk", label: "Planta planejadora SAP (IWERK)", help: "[SAP] Pode diferir da planta", placeholder: "BR01", mono: true, maxLength: 4 },
  { key: "ingrp", label: "Grupo planejador SAP (INGRP)", help: "[SAP] Grupo responsável pela manutenção", mono: true, maxLength: 3 },
  { key: "dataAquis", label: "Data de aquisição (ANSDT)", help: "[SAP] Entrada em operação", kind: "date", mono: true },
  { key: "matnr", label: "Nº material SAP (MATNR)", help: "[SAP] Material vinculado no SAP MM", mono: true, maxLength: 40 },
]

/** The "É dispositivo de proteção" block (`attrs.protecao`); `protegidos` is a list of asset ids. */
export const PROTECTION_FIELDS: readonly AttrField[] = [
  { key: "tipo", label: "Tipo de proteção", kind: "select", options: PROTECTION_TYPES },
  { key: "principio", label: "Princípio de ação", kind: "select", options: PROTECTION_PRINCIPLES },
  { key: "bypass", label: "Procedimento de bypass", kind: "textarea", placeholder: "Ex.: jumper nos bornes X14:1 e X14:2 do painel CA-P01", full: true, maxLength: 2000 },
  { key: "sistema", label: "Sistema de controle", placeholder: "Ex.: CLP Allen-Bradley ControlLogix L85E", full: true, maxLength: 200 },
  { key: "classeRisco", label: "Classe de risco padrão", kind: "select", options: RISK_CLASSES },
]

export interface Protection {
  tipo: string
  principio: string
  bypass: string
  sistema: string
  classeRisco: string
  protegidos: string[]
}

const leafText = (v: AttrLeaf | undefined): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "")

/** A text value of the sheet ("" when absent or not a text). */
export function attrText(attrs: RecordAttrs | undefined, key: string): string {
  const v = attrs?.[key]
  return v !== null && typeof v === "object" && !Array.isArray(v) ? "" : leafText(v as AttrLeaf | undefined)
}

/** The protection block, or null when the equipment is not a protective device. */
export function protectionOf(attrs: RecordAttrs | undefined): Protection | null {
  const p = attrs?.protecao
  if (!p || typeof p !== "object" || Array.isArray(p)) return null
  const list = p.protegidos
  return {
    tipo: leafText(p.tipo), principio: leafText(p.principio), bypass: leafText(p.bypass), sistema: leafText(p.sistema), classeRisco: leafText(p.classeRisco),
    protegidos: Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [],
  }
}

/** The label of a choice (or the stored value itself, when it is not one of them). */
export function optionLabel(options: readonly { value: string; label: string }[] | undefined, value: string): string {
  return options?.find((o) => o.value === value)?.label ?? value
}

/**
 * The sheet to store from a form: empty texts are dropped (absent = not filled), texts are trimmed, the
 * protection block goes in only when the switch is on. Keys outside `fields` that the record already had
 * are kept, so a sheet written by another tool (an import) is not lost by editing here.
 */
export function sheetFrom(before: RecordAttrs | undefined, fields: readonly AttrField[], values: Record<string, string>, protection?: Protection | null): RecordAttrs {
  const known = new Set([...fields.map((f) => f.key), "protecao"])
  const out: RecordAttrs = {}
  for (const [k, v] of Object.entries(before ?? {})) if (!known.has(k)) out[k] = v as AttrValue
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim()
    if (v) out[f.key] = v
  }
  if (protection) {
    const p: Record<string, AttrLeaf> = {}
    for (const f of PROTECTION_FIELDS) {
      const v = protection[f.key as keyof Omit<Protection, "protegidos">].trim()
      if (v) p[f.key] = v
    }
    p.protegidos = [...new Set(protection.protegidos)]
    out.protecao = p
  }
  return out
}

/** The form's starting values from a stored sheet. */
export function formValues(attrs: RecordAttrs | undefined, fields: readonly AttrField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, attrText(attrs, f.key)]))
}

/** "AAAA-MM-DD" that exists in the calendar (or empty). */
export function isIsoDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Problems of a filled form, in words, keyed by field (length and date format). */
export function sheetProblems(fields: readonly AttrField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim()
    if (!v) continue
    if (f.maxLength && [...v].length > f.maxLength) out[f.key] = `No máximo ${f.maxLength} ${f.maxLength === 1 ? "caractere" : "caracteres"}.`
    else if (f.kind === "date" && !isIsoDay(v)) out[f.key] = "Use uma data válida (AAAA-MM-DD)."
  }
  return out
}
