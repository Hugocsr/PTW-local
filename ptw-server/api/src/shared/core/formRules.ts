// @ts-nocheck — cópia de ptw-mockup-v2/src/core/formRules.ts; não edite (node scripts/sync-shared.mjs)
/**
 * The database's form rules, mirrored in the app (ptw-server/db/schema/40_formulario.sql):
 * - `formProblem`: structure of a form (PTW15 when a version or a frozen form is written);
 * - `answerProblem`: one answer written to a permit (PTW15, or PTW08 for an ineligible person);
 * - `permitBlocker`: what stops a signature (PTW16), in the sections of the stage and before it.
 * Messages are the database's, word for word. Completeness (what is still missing) stays in form.ts.
 *
 * Pure. Imports use the ".ts" extension so `node scripts/validar-modelo.ts` runs this file directly.
 */
import type { AttachKind, CheckAnswer, CheckAnswers, ColumnItem, Condition, FormItem, FormSection, FormSpec, LineAnswer, OptionList, Person } from "@/registry/types"
import type { PermitAttachment } from "@/permit/types"
import type { RuleError } from "./ptwErrors.ts"
import { isUuid } from "../lib/id.ts"
import { canonicalJson, sha256Hex, type Json } from "./audit.ts"
import { personIneligible } from "./eligibility.ts"
import type { FormAnswers, ItemAnswer } from "./form.ts"

type J = Record<string, unknown>
const isObj = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v)
const jtype = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v)
/** ptw.jopt: optional field with the right type ("number?" also accepts null). */
const jopt = (o: J, k: string, t: string) => !(k in o) || jtype(o[k]) === t || (t === "number?" && (jtype(o[k]) === "number" || o[k] === null))
/** ptw.iso_date: complete, existing "AAAA-MM-DD", or null. */
export function isoDate(t: unknown): string | null {
  if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [y, m, d] = t.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCFullYear(y)
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null
}
const br = (iso: string) => iso.split("-").reverse().join("/")
const FORM_ID = /^[A-Za-z0-9_.:-]{1,64}$/
const COLUMN_KINDS = ["texto", "numero", "horario", "marcacao", "verificacao"]
const ANSWER_WORD: Record<CheckAnswer, string> = { sim: "Sim", nao: "Não", na: "N/A", confirmo: "Confirmo" }

/* ====================================================================== */
/*  Structure                                                              */
/* ====================================================================== */

/** ptw.form_item_problem: first structure problem of one item (child = a group column). */
function itemProblem(i: unknown, child: boolean): string | null {
  if (!isObj(i)) return "item que não é objeto"
  const k = typeof i.kind === "string" ? i.kind : null
  const nm = typeof i.label === "string" ? i.label : typeof i.id === "string" ? i.id : "item"
  if (typeof i.id !== "string" || !FORM_ID.test(i.id)) return `${nm}: id inválido`
  if (typeof i.label !== "string") return `${nm}: rótulo ausente`
  if (!jopt(i, "required", "boolean")) return `${nm}: "required" não é sim/não`
  if ("showWhen" in i && (!isObj(i.showWhen) || typeof i.showWhen.itemId !== "string" || !Array.isArray(i.showWhen.anyOf))) return `${nm}: condição de exibição inválida`
  if (child && !COLUMN_KINDS.includes(k ?? "")) return `${nm}: tipo ${k ?? "?"} não entra em grupo`
  switch (k) {
    case "texto": if (!jopt(i, "long", "boolean")) return `${nm}: "long" inválido`; break
    case "aviso": if (typeof i.text !== "string") return `${nm}: aviso sem texto`; break
    case "numero":
      if (!(jopt(i, "unit", "string") && jopt(i, "negative", "boolean") && jopt(i, "min", "number?") && jopt(i, "max", "number?") && jopt(i, "decimals", "number"))) return `${nm}: campos do número inválidos`
      if ("decimals" in i && ![0, 1, 2, 3, 4].includes(i.decimals as number)) return `${nm}: casas decimais de 0 a 4`
      if (typeof i.min === "number" && typeof i.max === "number" && i.min > i.max) return `${nm}: mínimo maior que o máximo`
      break
    case "horario": if (!jopt(i, "seconds", "boolean")) return `${nm}: "seconds" inválido`; break
    case "marcacao":
      if (!(jopt(i, "options", "array") && jopt(i, "listId", "string") && jopt(i, "multiple", "boolean") && jopt(i, "other", "boolean"))) return `${nm}: campos da marcação inválidos`
      if ("listId" in i && !isUuid(i.listId)) return `${nm}: lista inválida`
      if (((i.options as unknown[] | undefined) ?? []).some((o) => !isObj(o) || typeof o.id !== "string")) return `${nm}: opção sem id`
      if (((i.options as J[] | undefined) ?? []).some((o) => !jopt(o, "blocks", "boolean"))) return `${nm}: "blocks" da opção não é sim/não`
      if (!jopt(i, "blockOptionIds", "array") || ((i.blockOptionIds as unknown[] | undefined) ?? []).some((x) => !isUuid(x))) return `${nm}: opções que impedem inválidas`
      if (((i.blockOptionIds as unknown[] | undefined) ?? []).length > 0 && !("listId" in i)) return `${nm}: opções da lista que impedem sem lista`
      break
    case "verificacao": {
      if (!["sim_nao_na", "sim_nao", "confirmo", "lista"].includes(i.answers as string)) return `${nm}: respostas inválidas`
      const lista = i.answers === "lista"
      if (lista !== ("answerListId" in i) || ("answerListId" in i && !isUuid(i.answerListId))) return `${nm}: lista de respostas inválida`
      const okAnswer = (a: unknown) => (lista ? isUuid(a) : ["sim", "nao", "na", "confirmo"].includes(a as string))
      const okLine = (l: unknown) => isObj(l) && typeof l.id === "string" && jopt(l, "blockOn", "array") && jopt(l, "noteOn", "array")
        && [...((l.blockOn as unknown[]) ?? []), ...((l.noteOn as unknown[]) ?? [])].every(okAnswer)
      if (!Array.isArray(i.lines) || !i.lines.every(okLine)) return `${nm}: linhas inválidas`
      break
    }
    case "anexo":
      if (!Array.isArray(i.accept) || i.accept.some((a) => !["foto", "video", "arquivo"].includes(a as string))) return `${nm}: tipos aceitos inválidos`
      if (!(jopt(i, "min", "number") && jopt(i, "hint", "string"))) return `${nm}: campos do anexo inválidos`
      break
    case "documento":
      if (!(jopt(i, "pattern", "string") && jopt(i, "attach", "boolean") && jopt(i, "validity", "boolean"))) return `${nm}: campos do documento inválidos`
      if ("pattern" in i && (i.pattern as string).trim() === "") return `${nm}: formato vazio`
      break
    case "data": {
      if (!(jopt(i, "notBeforeToday", "boolean") && (!("min" in i) || isoDate(i.min)) && (!("max" in i) || isoDate(i.max)))) return `${nm}: campos da data inválidos`
      const a = isoDate(i.min), b = isoDate(i.max)
      if (a && b && a > b) return `${nm}: data inicial depois da final`
      break
    }
    case "pessoa":
      if (!(jopt(i, "roleId", "string") && jopt(i, "mustBeEligible", "boolean") && jopt(i, "multiple", "boolean"))) return `${nm}: campos de pessoa inválidos`
      if ("roleId" in i && !isUuid(i.roleId)) return `${nm}: cargo inválido`
      break
    case "isolamento": if (!jopt(i, "minRows", "number")) return `${nm}: mínimo de linhas inválido`; break
    case "grupo": {
      if (!jopt(i, "minRows", "number")) return `${nm}: mínimo de linhas inválido`
      if (!Array.isArray(i.columns)) return `${nm}: grupo sem colunas`
      for (const c of i.columns) {
        if (isObj(c) && "showWhen" in c) return `${nm}: coluna com condição`
        const p = itemProblem(c, true)
        if (p) return `${nm} › ${p}`
      }
      const ids = i.columns.map((c) => (isObj(c) ? c.id : undefined))
      if (new Set(ids).size !== ids.length) return `${nm}: id repetido dentro do grupo`
      break
    }
    default: return `${nm}: tipo de item desconhecido (${k ?? "?"})`
  }
  return null
}

/** ptw.form_items: first-level items with their section's stage. */
function formItems(form: unknown): { item: J; stageId: string | undefined }[] {
  if (!isObj(form) || !Array.isArray(form.sections)) return []
  return form.sections.flatMap((s) => (isObj(s) && Array.isArray(s.items) ? s.items.map((item) => ({ item: item as J, stageId: typeof s.stageId === "string" ? s.stageId : undefined })) : []))
}

/** ptw.form_problem: first structure problem of a whole form (null = ok), the database's words. */
export function formProblem(form: unknown): string | null {
  if (!isObj(form) || !Array.isArray(form.sections)) return "formulário sem seções"
  if (form.sections.some((s) => !isObj(s) || ("items" in s && !Array.isArray(s.items)))) return "seção inválida"
  const items = formItems(form)
  for (const { item } of items) { const p = itemProblem(item, false); if (p) return p }
  const seen = new Set<unknown>()
  for (const { item } of items) { if (seen.has(item.id)) return `id repetido no formulário: ${item.id}`; seen.add(item.id) }
  for (const { item } of items) {
    if (isObj(item.showWhen) && !items.some((x) => x.item.id === (item.showWhen as J).itemId)) return `${item.id}: a condição aponta para um item que não existe`
  }
  return null
}

/** Where an item sits: its section's stage id; undefined = section without a stage; null = not in the form. */
export function itemStageId(form: FormSpec, itemId: string): string | undefined | null {
  for (const s of form.sections) if (s.items.some((i) => i.id === itemId)) return s.stageId
  return null
}

/* ---------- reading a form from the database or a file ---------- */

function normItem(raw: J): FormItem {
  const b = { id: String(raw.id), label: typeof raw.label === "string" ? raw.label : "", required: raw.required === true, ...(isObj(raw.showWhen) ? { showWhen: raw.showWhen as unknown as Condition } : {}) }
  const num = (x: unknown) => (typeof x === "number" ? { v: x } : null)
  switch (raw.kind) {
    case "texto": return { ...b, kind: "texto", long: raw.long === true }
    case "aviso": return { ...b, kind: "aviso", text: String(raw.text ?? "") }
    case "numero": {
      const mn = num(raw.min), mx = num(raw.max)
      return { ...b, kind: "numero", unit: typeof raw.unit === "string" ? raw.unit : "", decimals: typeof raw.decimals === "number" ? raw.decimals : 4, negative: raw.negative === true, ...(mn ? { min: mn.v } : {}), ...(mx ? { max: mx.v } : {}) }
    }
    case "horario": return { ...b, kind: "horario", seconds: raw.seconds === true }
    case "marcacao": return {
      ...b, kind: "marcacao",
      options: Array.isArray(raw.options) ? (raw.options as J[]).map((o) => ({ id: String(o.id), label: String(o.label ?? ""), ...(o.blocks === true ? { blocks: true } : {}) })) : [],
      ...(typeof raw.listId === "string" ? { listId: raw.listId } : {}),
      ...(Array.isArray(raw.blockOptionIds) && raw.blockOptionIds.length ? { blockOptionIds: (raw.blockOptionIds as unknown[]).map(String) } : {}),
      multiple: raw.multiple === true, other: raw.other === true,
    }
    case "verificacao": return {
      ...b, kind: "verificacao", answers: raw.answers as CheckAnswers, ...(typeof raw.answerListId === "string" ? { answerListId: raw.answerListId } : {}),
      lines: ((raw.lines as J[]) ?? []).map((l) => ({ id: String(l.id), label: String(l.label ?? ""), blockOn: (l.blockOn as LineAnswer[]) ?? [], noteOn: (l.noteOn as LineAnswer[]) ?? [] })),
    }
    case "anexo": return { ...b, kind: "anexo", accept: (raw.accept as AttachKind[]) ?? [], min: typeof raw.min === "number" ? raw.min : 1, hint: typeof raw.hint === "string" ? raw.hint : "" }
    case "documento": return { ...b, kind: "documento", ...(typeof raw.pattern === "string" ? { pattern: raw.pattern } : {}), attach: raw.attach === true, validity: raw.validity === true }
    case "data": return { ...b, kind: "data", notBeforeToday: raw.notBeforeToday === true, ...(typeof raw.min === "string" ? { min: raw.min } : {}), ...(typeof raw.max === "string" ? { max: raw.max } : {}) }
    case "pessoa": return { ...b, kind: "pessoa", multiple: raw.multiple === true, ...(typeof raw.roleId === "string" ? { roleId: raw.roleId } : {}), mustBeEligible: raw.mustBeEligible === true }
    case "isolamento": return { ...b, kind: "isolamento", minRows: typeof raw.minRows === "number" ? raw.minRows : 0 }
    case "grupo": return { ...b, kind: "grupo", minRows: typeof raw.minRows === "number" ? raw.minRows : 0, columns: ((raw.columns as J[]) ?? []).map((c) => normItem(c) as ColumnItem) }
    default: throw new Error(`tipo de item desconhecido (${String(raw.kind)})`)
  }
}

/**
 * A form as the database (or a file) holds it → the app's shape, with the database's defaults for
 * the optional fields (`decimals` absent = 4; `min`/`max` null = no limit; booleans absent = false).
 * Throws on a form that `formProblem` rejects.
 */
export function normalizeForm(json: unknown): FormSpec {
  const p = formProblem(json)
  if (p) throw new Error(`Formulário inválido: ${p}`)
  const f = json as { sections: J[] }
  return {
    sections: f.sections.map((s): FormSection => ({
      id: String(s.id ?? ""), title: typeof s.title === "string" ? s.title : "",
      ...(typeof s.stageId === "string" ? { stageId: s.stageId } : {}),
      items: ((s.items as J[]) ?? []).map(normItem),
    })),
  }
}

/** The form's address in ptw.form_snapshot: SHA-256 of its jsonb text (= canonical form v2), hex. */
export function formSha256(form: FormSpec): string {
  return sha256Hex(canonicalJson(JSON.parse(JSON.stringify(form)) as Json))
}

/* ====================================================================== */
/*  Answers                                                                */
/* ====================================================================== */

/** What validating one answer needs besides the form: this permit, its files and assets, the register, the day. */
export interface AnswerCtx {
  permitId: string
  permitAssetIds: string[]
  attachments: Pick<PermitAttachment, "id" | "permitId" | "kind">[]
  people: Person[]
  optionLists: OptionList[]
  /** The permit's location and its ancestors (scope of the cargo). */
  pathIds: string[]
  /** "AAAA-MM-DD" in the unit's zone. */
  today: string
  now: string
}

/** Decimal places of a number as PostgreSQL's scale() would count them. */
function scaleOf(n: number): number {
  const s = String(n)
  const e = /e([+-]\d+)$/.exec(s)
  const mant = e ? s.slice(0, e.index) : s
  const frac = mant.includes(".") ? mant.split(".")[1].length : 0
  return Math.max(0, frac - (e ? Number(e[1]) : 0))
}

/** ptw.files_problem */
function filesProblem(files: unknown, accept: string[] | null, ctx: AnswerCtx): string | null {
  if (!Array.isArray(files)) return "anexos inválidos"
  for (const f of files) {
    if (!isUuid(f)) return "anexo fora do formato (id do anexo)"
    const a = ctx.attachments.find((x) => x.id === f && x.permitId === ctx.permitId)
    if (!a) return `anexo não é desta PT (${f})`
    if (accept && !accept.includes(a.kind)) return `tipo de anexo não aceito (${a.kind})`
  }
  if (new Set(files).size !== files.length) return "anexo repetido"
  return null
}

/** ptw.answer_problem: first problem of the answer (null = ok). Starts with "PTW08 " for an ineligible person. */
function answerProblemText(it: FormItem, v: unknown, ctx: AnswerCtx): string | null {
  const k = it.kind
  const nm = it.label ?? it.id
  if (k === "aviso") return `${nm}: aviso não tem resposta`
  const t = isObj(v) ? v.t : undefined
  if (t !== k) return `${nm}: resposta de ${typeof t === "string" ? t : "?"} para item de ${k}`
  const o = v as J
  const nameOf = (id: string) => ctx.people.find((p) => p.id === id)?.name
  switch (it.kind) {
    case "texto": if (typeof o.v !== "string") return `${nm}: texto inválido`; break
    case "numero":
      if (typeof o.v !== "number" || !Number.isFinite(o.v)) return `${nm}: número inválido`
      if (!it.negative && o.v < 0) return `${nm}: número negativo`
      if (scaleOf(o.v) > (it.decimals ?? 4)) return `${nm}: casas decimais demais`
      break
    case "horario": {
      const re = it.seconds ? /^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/ : /^([01][0-9]|2[0-3]):[0-5][0-9]$/
      if (typeof o.v !== "string" || !re.test(o.v)) return `${nm}: horário inválido`
      break
    }
    case "marcacao": {
      if (!Array.isArray(o.ids) || !jopt(o, "other", "string")) return `${nm}: marcação inválida`
      if (!it.multiple && o.ids.length > 1) return `${nm}: só uma opção`
      if ("other" in o && !it.other) return `${nm}: "outro" não é aceito`
      const list = it.listId ? ctx.optionLists.find((l) => l.id === it.listId) : undefined
      const bad = (o.ids as unknown[]).find((x) => !it.options.some((e) => e.id === x) && !(list && isUuid(x) && list.items.some((li) => li.id === x)))
      if (bad !== undefined) return `${nm}: opção inexistente (${String(bad)})`
      break
    }
    case "verificacao": {
      if (!isObj(o.lines)) return `${nm}: verificação inválida`
      const allowed = it.answers === "sim_nao_na" ? ["sim", "nao", "na"] : it.answers === "sim_nao" ? ["sim", "nao"] : it.answers === "confirmo" ? ["confirmo"]
        : (ctx.optionLists.find((l) => l.id === it.answerListId)?.items ?? []).map((x) => x.id)
      for (const [key, l] of Object.entries(o.lines)) {
        if (!it.lines.some((e) => e.id === key) || !isObj(l) || !allowed.includes(l.a as string) || !jopt(l, "note", "string")) return `${nm}: linha ou resposta inválida (${key})`
      }
      break
    }
    case "anexo": { const p = filesProblem(o.files, it.accept, ctx); if (p) return `${nm}: ${p}`; break }
    case "documento": {
      if (typeof o.code !== "string") return `${nm}: código do documento inválido`
      const p = filesProblem(o.files, null, ctx)
      if (p) return `${nm}: ${p}`
      if ("validUntil" in o && !isoDate(o.validUntil)) return `${nm}: validade inválida (AAAA-MM-DD)`
      break
    }
    case "data": if (!isoDate(o.v)) return `${nm}: data inválida (AAAA-MM-DD)`; break
    case "pessoa": {
      if (!Array.isArray(o.ids)) return `${nm}: pessoas inválidas`
      if (!it.multiple && o.ids.length > 1) return `${nm}: só uma pessoa`
      for (const s of o.ids as unknown[]) {
        const p = isUuid(s) ? ctx.people.find((x) => x.id === s) : undefined
        if (!p) return `${nm}: pessoa inexistente na unidade`
        if (it.roleId && !p.roles.some((r) => r.roleId === it.roleId)) return `${nm}: ${p.name} não tem o cargo pedido`
        if (it.mustBeEligible) {
          const why = personIneligible(p, it.roleId ?? null, ctx.pathIds, ctx.today, ctx.now)
          if (why) return `PTW08 ${nm}: ${p.name} não elegível (${why})`
        }
      }
      break
    }
    case "isolamento": {
      if (!Array.isArray(o.rows)) return `${nm}: linhas inválidas`
      for (const x of o.rows as unknown[]) {
        if (!isObj(x) || typeof x.id !== "string" || typeof x.point !== "string" || typeof x.method !== "string" || typeof x.lock !== "string") return `${nm}: ponto fora do formato (id, point, method, lock)`
        if ("energy" in x && !["eletrica", "mecanica", "hidraulica", "pneumatica", "termica", "quimica", "gravitacional", "outra"].includes(x.energy as string)) return `${nm}: tipo de energia inválido (${typeof x.energy === "string" ? x.energy : "?"})`
        if ("zero" in x && !["sim", "nao"].includes(x.zero as string)) return `${nm}: energia zero é "sim" ou "nao"`
        if ("assetId" in x && !(isUuid(x.assetId) && ctx.permitAssetIds.includes(x.assetId))) return `${nm}: o ativo do ponto ${x.point} não é desta PT`
        if ("by" in x && !(isUuid(x.by) && nameOf(x.by) !== undefined)) return `${nm}: quem aplicou não existe no ponto ${x.point}`
      }
      const ids = (o.rows as J[]).map((r) => r.id)
      if (new Set(ids).size !== ids.length) return `${nm}: linha repetida`
      break
    }
    case "grupo": {
      if (!Array.isArray(o.rows)) return `${nm}: linhas inválidas`
      for (const x of o.rows as unknown[]) {
        if (!isObj(x) || typeof x.id !== "string" || !isObj(x.answers)) return `${nm}: linha do grupo inválida`
        for (const [s, c] of Object.entries(x.answers)) {
          const col = it.columns.find((ch) => ch.id === s)
          if (!col) return `${nm}: coluna inexistente (${s})`
          const p = answerProblemText(col, c, ctx)
          if (p) return `${nm} › ${p}`
        }
      }
      const ids = (o.rows as J[]).map((r) => r.id)
      if (new Set(ids).size !== ids.length) return `${nm}: linha repetida`
      break
    }
  }
  return null
}

const findItem = (form: FormSpec, itemId: string) => {
  for (const s of form.sections) for (const i of s.items) if (i.id === itemId) return i
  return undefined
}

/**
 * ptw.answer_validate: an answer written to a permit (the permit's form: the frozen one once sent).
 * PTW15 for structure; PTW08 when a person picked in a "mustBeEligible" item is not eligible.
 */
export function answerProblem(form: FormSpec, itemId: string, value: ItemAnswer, ctx: AnswerCtx): RuleError | null {
  const it = findItem(form, itemId)
  if (!it) return { code: "PTW15", message: `O item ${itemId} não existe no formulário da PT` }
  const p = answerProblemText(it, value, ctx)
  if (!p) return null
  if (p.startsWith("PTW08 ")) return { code: "PTW08", message: p.slice(6) }
  return { code: "PTW15", message: `Resposta inválida: ${p}` }
}

/* ====================================================================== */
/*  Signature gate                                                         */
/* ====================================================================== */

/** ptw.answer_visible */
function answerVisible(answers: FormAnswers, c: Condition | undefined): boolean {
  if (!c) return true
  const a = answers[c.itemId] as J | undefined
  return c.anyOf.some((want) => (c.lineId
    ? (((a?.lines as J | undefined)?.[c.lineId] as J | undefined)?.a === want)
    : Array.isArray(a?.ids) && (a.ids as unknown[]).includes(want)))
}

/** `optionLists` names list options and list answers in the message (absent: "opção" / "resposta"). */
type BlockCtx = Pick<AnswerCtx, "people" | "pathIds" | "today" | "now"> & { optionLists?: OptionList[] }

/** ptw.item_blocker: what, in one answered item, stops the stage (null = nothing). */
function itemBlocker(it: FormItem, v: ItemAnswer | undefined, ctx: BlockCtx): string | null {
  if (!v || v.t !== it.kind) return null
  const nm = it.label ?? it.id
  const listItem = (listId: string | undefined, id: string) => ctx.optionLists?.find((l) => l.id === listId)?.items.find((x) => x.id === id)?.label
  switch (it.kind) {
    case "marcacao": {
      for (const id of (v as { ids: string[] }).ids ?? []) {
        const own = it.options.find((o) => o.id === id)
        if (own?.blocks === true) return `${nm}: “${own.label}” impede a etapa`
        if ((it.blockOptionIds ?? []).includes(id)) return `${nm}: “${listItem(it.listId, id) ?? id}” impede a etapa`
      }
      break
    }
    case "numero": {
      const x = (v as { v: number }).v
      if ((it.min != null && x < it.min) || (it.max != null && x > it.max)) return `${nm} fora da faixa (${String(x)})`
      break
    }
    case "verificacao": {
      const lines = (v as Extract<ItemAnswer, { t: "verificacao" }>).lines ?? {}
      for (const l of it.lines) {
        const s = lines[l.id]?.a
        if (s && l.blockOn.includes(s)) return `${l.label}: "${it.answers === "lista" ? listItem(it.answerListId, s) ?? s : ANSWER_WORD[s as CheckAnswer]}" impede a etapa`
      }
      break
    }
    case "documento": {
      const a = v as Extract<ItemAnswer, { t: "documento" }>
      const code = (a.code ?? "").trim()
      if (code !== "") {
        if (!codeMatchesDb(code, it.pattern)) return `${nm}: fora do formato ${it.pattern}`
        if (it.attach && (a.files?.length ?? 0) === 0) return `${nm}: falta anexar o documento`
        if (it.validity) {
          const d = isoDate(a.validUntil)
          if (!d) return `${nm}: falta a validade`
          if (d < ctx.today) return `${nm} vencido em ${br(d)}`
        }
      }
      break
    }
    case "data": {
      const d = isoDate((v as { v: string }).v)
      if (!d) break
      if (it.notBeforeToday && d < ctx.today) return `${nm}: ${br(d)} está antes de hoje`
      const mn = isoDate(it.min), mx = isoDate(it.max)
      if (mn && d < mn) return `${nm}: ${br(d)} está antes de ${br(mn)}`
      if (mx && d > mx) return `${nm}: ${br(d)} está depois de ${br(mx)}`
      break
    }
    case "pessoa": {
      if (!it.mustBeEligible) break
      for (const s of (v as { ids: string[] }).ids ?? []) {
        const p = isUuid(s) ? ctx.people.find((x) => x.id === s) : undefined
        const b = !isUuid(s) ? "pessoa inexistente"
          : it.roleId && !p?.roles.some((r) => r.roleId === it.roleId) ? "não tem o cargo"
          : personIneligible(p, it.roleId ?? null, ctx.pathIds, ctx.today, ctx.now)
        if (b) return `${nm}: ${p?.name ?? s} não elegível (${b})`
      }
      break
    }
    case "isolamento": {
      const rows = (v as Extract<ItemAnswer, { t: "isolamento" }>).rows ?? []
      for (let n = 0; n < rows.length; n++) {
        const r = rows[n]
        if (r.zero === "nao") return `${nm} · ponto ${n + 1}${r.point?.trim() ? ` (${r.point.trim()})` : ""}: energia zero não verificada`
      }
      break
    }
    case "grupo": {
      for (const r of (v as Extract<ItemAnswer, { t: "grupo" }>).rows ?? []) {
        for (const c of it.columns) {
          const b = itemBlocker(c, r.answers?.[c.id], ctx)
          if (b) return `${nm} › ${b}`
        }
      }
      break
    }
  }
  return null
}

/** ptw.code_matches (also in form.ts as codeMatches; repeated here so this file mirrors the database alone). */
function codeMatchesDb(code: string, pattern: string | undefined): boolean {
  const p = (pattern ?? "").trim()
  if (!p) return true
  const c = code.trim().toUpperCase()
  if (c.length !== p.length) return false
  return [...p].every((ch, g) => (ch === "#" ? /^[0-9]$/.test(c[g]) : ch === "A" ? /^[A-Z]$/.test(c[g]) : c[g] === ch.toUpperCase()))
}

/**
 * ptw.permit_blocker: the first thing that stops a signature of the stage at `stagePos`, in the
 * sections of that stage and the earlier ones (a section without a stage counts as position 0, i.e.
 * for every stage); an item hidden by its condition does not count. `stagePositions` = stage id →
 * position in the version. The message is the database's (dates dd/mm/aaaa); PTW16 wraps it.
 */
export function permitBlocker(form: FormSpec, answers: FormAnswers, stagePos: number, stagePositions: Record<string, number>, ctx: BlockCtx): string | null {
  for (const s of form.sections) {
    const pos = (s.stageId !== undefined ? stagePositions[s.stageId] : undefined) ?? 0
    if (pos > stagePos) continue
    for (const it of s.items) {
      if (!(it.id in answers)) continue
      if (!answerVisible(answers, it.showWhen)) continue
      const b = itemBlocker(it, answers[it.id], ctx)
      if (b) return b
    }
  }
  return null
}
