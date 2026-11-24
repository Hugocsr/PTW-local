/**
 * Permit templates (modelos), their versions, flow and form, shaped like the database
 * (ptw-server/db/schema/20_modelos.sql and 40_formulario.sql). Table keys are uuids; ids inside the
 * form (section, item, line, own option) are text matching FORM_ID_RE (lib/id.ts).
 * Re-exported by registry/types.ts.
 */

/** Retention class of the audit trail of a model's permits (ptw.retention_class). */
export type RetentionClass = "pet" | "pt" | "cadastro"
export const RETENTION_LABEL: Record<RetentionClass, string> = {
  pet: "PET: entrada em espaço confinado",
  pt: "PT de trabalho (elétrica, altura, geral)",
  cadastro: "Cadastro, modelos, acessos e eventos do sistema",
}

/** manual = built in the app; sugerida = created by "Importar modelo" (needs sourceSha256). */
export type VersionOrigin = "manual" | "sugerida"

/**
 * One signature the stage needs (ptw.sign_slot). kind "cargo": anyone eligible holding ANY of
 * `roleIds` (role_ids; "Gerente industrial, Gerente de manutenção ou Gerente da área"); kind "pessoa":
 * only `personId` (checked on record and account). In a draft, `roleIds` may be empty and `meaning`
 * null (an import that could not tell who signs, a slot just added); activation requires both
 * (PTW28). At most 20 cargos, none repeated.
 */
export interface SignSlot {
  /** Explicit administrative mandate in a free stage; technical anchors are never delegable. */
  delegable?: boolean
  id: string
  /** 1–120 when set. */
  meaning: string | null
  kind: "cargo" | "pessoa"
  roleIds: string[]
  personId: string | null
  /** 1–20 */
  min: number
  required: boolean
  /**
   * Required only when this holds (same rule as "Mostrar quando"); needs `required`. Database:
   * required_when_item, required_when_line, required_when_values.
   */
  requiredWhen?: Condition
}

/**
 * The skeleton every permit follows. A stage with a kind is an anchor of the lifecycle: it can be
 * renamed, never removed, and the state machine finds it by kind, not by name. Free stages have none.
 */
export type StageKind = "solicitacao" | "emissao" | "aceite_campo" | "entrega" | "aceite_area"

/** Ordered stage; slots inside it can be signed in parallel. `locked` = fixed by the product. */
export interface Stage {
  id: string
  name: string
  kind?: StageKind
  locked?: boolean
  slots: SignSlot[]
}

/* ---------- Form: what the paper permit asks, configured per template version ---------- */

/** "Sim / Não / N/A" style answers; "confirmo" is a single tick that something was done. */
export type CheckAnswer = "sim" | "nao" | "na" | "confirmo"

/** The only rule a form has: the source item (or one line of a checklist) holds one of these values. */
export interface Condition { itemId: string; lineId?: string; anyOf: string[] }

/** `blocks`: choosing this option stops the stage, like a "Não" on a checklist line (e.g. "Classe 5", não forçável). */
export interface FormOption { id: string; label: string; blocks?: boolean }

/**
 * Answers of a checklist line: sim/nao/na/confirmo, or, with `answers: "lista"`, the id (uuid) of an
 * item of the list `answerListId` (e.g. a list "SIM / N.A." with items "SIM" and "N.A.").
 */
export type LineAnswer = CheckAnswer | string

export interface CheckLine {
  id: string
  label: string
  /** An answer that stops the stage until it changes (e.g. "não" in "Circuito testado e desenergizado"). */
  blockOn: LineAnswer[]
  /** An answer that needs a written justification (e.g. "N/A"). */
  noteOn: LineAnswer[]
}

interface ItemBase { id: string; label: string; required: boolean; showWhen?: Condition }

export type TextoItem = ItemBase & { kind: "texto"; long: boolean }
/**
 * With `listId` (uuid of a list), the options come from Configuração › Listas and `options` is unused;
 * then `blockOptionIds` (ids of items of that list) are the options that stop the stage. Own options
 * say it with `blocks`.
 */
export type MarcacaoItem = ItemBase & { kind: "marcacao"; options: FormOption[]; listId?: string; blockOptionIds?: string[]; multiple: boolean; other: boolean }
export type CheckAnswers = "sim_nao_na" | "sim_nao" | "confirmo" | "lista"
/** With `answers: "lista"`, the answers are the items of the list `answerListId`. */
export type VerificacaoItem = ItemBase & { kind: "verificacao"; answers: CheckAnswers; answerListId?: string; lines: CheckLine[] }
/**
 * A measured value with its unit and a fixed number of decimals (0–4), entered with the Brazilian
 * mask (vírgula decimal, ponto de milhar). With `min`/`max`, a value outside the range blocks the
 * stage, like a "Não" on a checklist line (e.g. O₂ 19,5–23,5 %).
 */
export type NumeroItem = ItemBase & { kind: "numero"; unit: string; decimals: number; negative: boolean; min?: number; max?: number }
/** A time of day ("HH:mm", or "HH:mm:ss" with `seconds`), typed with a mask; the "Agora" button fills the clock. */
export type HorarioItem = ItemBase & { kind: "horario"; seconds: boolean }
/** What a column of a repeatable group may be. */
export type ColumnItem = TextoItem | NumeroItem | HorarioItem | MarcacaoItem | VerificacaoItem

/** Forms of energy an isolation point holds (NR-10, NR-12; LOTO). */
export type EnergyKind = "eletrica" | "mecanica" | "hidraulica" | "pneumatica" | "termica" | "quimica" | "gravitacional" | "outra"

export type FormItem =
  | TextoItem
  | MarcacaoItem
  | VerificacaoItem
  | (ItemBase & { kind: "aviso"; text: string })
  /** Evidence captured on the spot: photo, video and/or any file, at least `min` of them. */
  | (ItemBase & { kind: "anexo"; accept: AttachKind[]; min: number; hint: string })
  | NumeroItem
  | HorarioItem
  /**
   * A reference to an outside document (Nº da APR, ART, OS, procedimento): its number or code,
   * optionally in a fixed `pattern` (# = digit, A = letter, anything else literal, e.g. "APR-####"),
   * optionally with the document attached and its validity date (an expired one blocks the stage).
   */
  | (ItemBase & { kind: "documento"; pattern?: string; attach: boolean; validity: boolean })
  /** A date, stored "AAAA-MM-DD", shown and typed "dd/mm/aaaa". `notBeforeToday` and `min`/`max` (ISO) block the stage when broken. */
  | (ItemBase & { kind: "data"; notBeforeToday: boolean; min?: string; max?: string })
  /**
   * People of the register (vigia, observador de incêndio, executantes). `roleId` limits the choice to
   * holders of a cargo; with `mustBeEligible`, someone not eligible at the permit's location is refused.
   */
  | (ItemBase & { kind: "pessoa"; multiple: boolean; roleId?: string; mustBeEligible: boolean })
  /**
   * Isolation points (bloqueio / LOTO), one row each: point or tag (optionally one of the PT's assets),
   * energy, method, lock/tag number, zero energy verified, who applied it. At least `minRows`;
   * "zero energy: não" blocks the stage.
   */
  | (ItemBase & { kind: "isolamento"; minRows: number })
  /** A repeatable group (a table of readings): rows of the same `columns`, at least `minRows`. A number out of range blocks, as anywhere. */
  | (ItemBase & { kind: "grupo"; minRows: number; columns: ColumnItem[] })

export type AttachKind = "foto" | "video" | "arquivo"
export type FormItemKind = FormItem["kind"]

/**
 * A section belongs to one stage: it must be complete before anyone signs that stage. Without a
 * stage (allowed by the database; the editor always sets one) it counts as the first stage's for
 * completeness and blocks every stage.
 */
export interface FormSection {
  id: string
  title: string
  stageId?: string
  items: FormItem[]
}

export interface FormSpec {
  sections: FormSection[]
  electrical?: import("@/core/electrical").ElectricalPolicy
}

/** Two slots that must be signed by different people (ptw.separation): `slotA < slotB` (text order). */
export interface Separation {
  slotA: string
  slotB: string
  locked: boolean
}

/** What a permit of this type must link to, and who signs. Lives inside a version. */
export interface TemplateContent {
  locationTypeIds: string[]
  assetTypeIds: string[]
  stages: Stage[]
  separation: Separation[]
  /** The paper form, as sections tied to stages. Absent on versions made before forms existed. */
  form?: FormSpec
}

/** rascunho = editable; ativa = the one in use (read-only); arquivada = history (read-only). */
export type VersionStatus = "rascunho" | "ativa" | "arquivada"

export interface TemplateVersion extends TemplateContent {
  id: string
  number: number
  status: VersionStatus
  /** Instants (ISO 8601 with offset). Draft ⇔ activatedAt null. */
  createdAt: string
  activatedAt: string | null
  /** ≤ 2000 characters. */
  note: string
  origin: VersionOrigin
  /**
   * Longest work window a permit of this version may have (template_version.max_window), in hours;
   * null = no limit. Checked at Enviar, at the Emissão and at Prorrogar (PTW31).
   */
  maxWindowHours: number | null
  /**
   * "Prende o equipamento" (template_version.holds_equipment, default true): PTs of this version take
   * part in the equipment lock. False (e.g. the disabling of an interlock): the PT neither holds its
   * assets nor is blocked by another open PT on them. Frozen with the rest of a non-draft version.
   */
  holdsEquipment: boolean
  /** SHA-256 (hex) of the imported package; required when origin is "sugerida". */
  sourceSha256: string | null
  /**
   * Optimistic concurrency of a draft (template_version.revision; `If-Match` in the API). The server
   * sets it; absent in the scenarios in memory, where nobody else edits.
   */
  revision?: number
  /**
   * Where an imported version came from, and each element's excerpt in the source document
   * (template_version.import_source): present exactly when origin is "sugerida", with
   * `pacote.sha256 === sourceSha256`.
   */
  importSource?: ImportSource
}

/** Page and literal text of the source document an imported element was read from. */
export interface SourceExcerpt {
  pagina: number
  trecho: string
  arquivo?: string
  /** The source wording when the label was translated (rotulo_original). */
  original?: string
  confianca?: "alta" | "media" | "baixa"
  observacao?: string
}

export interface ImportSource {
  /** The package file itself (name and SHA-256 of its bytes as read). */
  pacote: { arquivo: string; sha256: string }
  /** The plant's documents the package was read from (empty for an export from another plant). */
  documentos: { arquivo: string; sha256: string; paginas: number }[]
  ferramenta: string
  modelo?: string
  /** BCP 47 languages of the source document and of the labels, when the package says. */
  idioma?: { documento: string; rotulos: string }
  importadoEm: string
  /** Element id (stage, slot, section, item, line, option, list) → excerpt. */
  trechos: Record<string, SourceExcerpt>
}

/** A model keeps every version it ever had; at most one is active. `name` 1–120, unique (any case). */
export interface PermitTemplate {
  id: string
  name: string
  retentionClass: RetentionClass
  revision: number
  updatedAt: string
  versions: TemplateVersion[]
}
