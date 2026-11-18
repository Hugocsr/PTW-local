// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templateVersions.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Versions of a permit template, as the database keeps them (ptw-server/db/schema/20_modelos.sql):
 * only a draft changes or leaves; an active version only becomes archived; a new version is a copy
 * with new stage and signature ids (both unique in the unit). Pure: the clock comes in.
 *
 * Imports use the ".ts" extension so `node scripts/validar-modelo.ts` runs the package code directly.
 */
import type { FormItem, OptionList, PermitTemplate, Separation, SignSlot, Stage, TemplateVersion } from "@/registry/types"
import type { RuleError } from "./ptwErrors.ts"
import { uuidv7 } from "../lib/id.ts"
import { formProblem } from "./formRules.ts"
import { electricalActivationProblem } from "./electrical.ts"

/** A separation as the database stores it: `slotA < slotB` (text order of the uuids). */
export function normalizeSeparation(a: string, b: string, locked = false): Separation {
  return a < b ? { slotA: a, slotB: b, locked } : { slotA: b, slotB: a, locked }
}
/** Key of a separation on screen and in lists. */
export const separationKey = (s: Pick<Separation, "slotA" | "slotB">) => `${s.slotA}|${s.slotB}`

/**
 * A new draft from any version: new version, stage and slot ids (sections, separation and conditions
 * remapped); item ids stay, so an answer keeps meaning across versions. Origin and import trail stay
 * with the version they came from.
 */
export function copyVersion(from: TemplateVersion, number: number, now: string): TemplateVersion {
  const stageIds = new Map<string, string>()
  const slotIds = new Map<string, string>()
  const stages: Stage[] = from.stages.map((st) => {
    const id = uuidv7()
    stageIds.set(st.id, id)
    return {
      ...structuredClone(st), id,
      slots: st.slots.map((sl): SignSlot => { const nid = uuidv7(); slotIds.set(sl.id, nid); return { ...structuredClone(sl), id: nid } }),
    }
  })
  const form = from.form
    ? { ...structuredClone(from.form), sections: from.form.sections.map((s) => ({ ...structuredClone(s), ...(s.stageId !== undefined ? { stageId: stageIds.get(s.stageId) ?? s.stageId } : {}) })) }
    : undefined
  return {
    id: uuidv7(), number, status: "rascunho", createdAt: now, activatedAt: null,
    note: `Copiada da versão ${from.number}`,
    locationTypeIds: [...from.locationTypeIds], assetTypeIds: [...from.assetTypeIds],
    stages,
    separation: from.separation.map((r) => normalizeSeparation(slotIds.get(r.slotA) ?? r.slotA, slotIds.get(r.slotB) ?? r.slotB, r.locked)),
    ...(form ? { form } : {}),
    maxWindowHours: from.maxWindowHours ?? null,
    holdsEquipment: from.holdsEquipment ?? true,
    origin: "manual", sourceSha256: null,
  }
}

const deny = (code: RuleError["code"], message: string): RuleError => ({ code, message })
const STATUS_WORD: Record<TemplateVersion["status"], string> = { rascunho: "rascunho", ativa: "ativa", arquivada: "arquivada" }
/** The version without its status (ativa → arquivada changes nothing else). */
const sansStatus = (v: TemplateVersion) => JSON.stringify({ ...v, status: undefined })

/** Rows the database checks on each slot (23514), in a draft too. */
function slotProblem(sl: SignSlot): string | null {
  const nm = sl.meaning ?? "sem significado"
  if (!Number.isInteger(sl.min) || sl.min < 1 || sl.min > 20) return `Assinatura “${nm}”: mínimo de 1 a 20`
  if (sl.meaning !== null && (sl.meaning.length < 1 || sl.meaning.length > 120)) return `Assinatura “${nm.slice(0, 40)}”: significado de 1 a 120 caracteres`
  if ((sl.kind === "pessoa") !== (sl.personId !== null && sl.personId !== "")) return `Assinatura “${nm}”: pessoa indicada sem a pessoa`
  if (sl.roleIds.length > 20) return `Assinatura “${nm}”: no máximo 20 cargos`
  if (new Set(sl.roleIds).size !== sl.roleIds.length) return `Assinatura “${nm}”: cargo repetido`
  if (sl.requiredWhen && !sl.required) return `Assinatura “${nm}”: condição numa assinatura opcional`
  if (sl.requiredWhen && (sl.requiredWhen.anyOf.length < 1 || sl.requiredWhen.anyOf.length > 50)) return `Assinatura “${nm}”: condição sem valores`
  if (sl.requiredWhen?.lineId !== undefined && (sl.requiredWhen.lineId.length < 1 || sl.requiredWhen.lineId.length > 64)) return `Assinatura “${nm}”: linha da condição inválida`
  return null
}

/**
 * Activation: every signature has a meaning and at least one cargo (PTW28, G6), every "obrigatória só
 * quando" points at an item of the form and, with a line, at a line of that checklist (PTW15, G5), and
 * (with the lists) a list's blocking options and answers are items of that list (PTW15). The
 * database's messages.
 */
export function activationDenied(v: TemplateVersion, lists?: OptionList[]): RuleError | null {
  const electrical = v.form ? electricalActivationProblem(v.form, v.stages) : null
  if (electrical) return deny("PTW34", electrical)
  for (const st of v.stages) {
    for (let k = 0; k < st.slots.length; k++) {
      const sl = st.slots[k]
      if (sl.meaning === null) return deny("PTW28", `A assinatura ${k + 1} da etapa "${st.name}" está sem significado`)
      if (sl.roleIds.length === 0) return deny("PTW28", `A assinatura "${sl.meaning}" da etapa "${st.name}" está sem cargo`)
    }
  }
  if (lists) {
    const all: FormItem[] = (v.form?.sections ?? []).flatMap((s) => s.items.flatMap((i): FormItem[] => (i.kind === "grupo" ? [i, ...i.columns] : [i])))
    for (const it of all) {
      if (it.kind === "marcacao" && (it.blockOptionIds ?? []).length) {
        const list = lists.find((l) => l.id === it.listId)
        const bad = (it.blockOptionIds ?? []).find((id) => !list?.items.some((x) => x.id === id))
        if (bad !== undefined) return deny("PTW15", `${it.label}: opção que impede não é item da lista (${bad})`)
      }
      if (it.kind === "verificacao" && it.answers === "lista") {
        const list = lists.find((l) => l.id === it.answerListId)
        if (!list) return deny("PTW15", `${it.label}: a lista de respostas não existe`)
        const bad = it.lines.flatMap((l) => [...l.blockOn, ...l.noteOn]).find((a) => !list.items.some((x) => x.id === a))
        if (bad !== undefined) return deny("PTW15", `${it.label}: resposta que não é item da lista (${bad})`)
      }
    }
  }
  const items = (v.form?.sections ?? []).flatMap((s) => s.items)
  for (const st of v.stages) for (const sl of st.slots) {
    const w = sl.requiredWhen
    if (!w) continue
    const it = items.find((i) => i.id === w.itemId)
    if (!it) return deny("PTW15", `A assinatura "${sl.meaning}" depende de um item que não existe no formulário`)
    if (w.lineId !== undefined && !(it.kind === "verificacao" && it.lines.some((l) => l.id === w.lineId))) {
      return deny("PTW15", `A assinatura "${sl.meaning}" depende da linha ${w.lineId} que não existe no item ${w.itemId}`)
    }
  }
  return null
}

const TRECHO_KEYS = new Set(["pagina", "trecho", "arquivo", "original", "confianca", "observacao"])
const SOURCE_KEYS = new Set(["pacote", "documentos", "ferramenta", "modelo", "idioma", "importadoEm", "trechos"])
const HEX64 = /^[0-9a-f]{64}$/
/** template_version.import_source (G1): what the database checks (PTW15 "Origem da importação inválida: …"). */
export function importSourceProblem(src: TemplateVersion["importSource"]): string | null {
  if (!src) return "ausente"
  const extra = Object.keys(src).find((k) => !SOURCE_KEYS.has(k))
  if (extra) return `campo desconhecido (${extra})`
  if (typeof src.pacote?.arquivo !== "string" || !HEX64.test(src.pacote.sha256 ?? "")) return "pacote sem nome ou SHA-256"
  if (!src.documentos.every((d) => d.arquivo && HEX64.test(d.sha256) && Number.isInteger(d.paginas) && d.paginas >= 1)) return "documento de origem inválido"
  if (src.ferramenta.length < 1 || src.ferramenta.length > 200) return "ferramenta de 1 a 200 caracteres"
  if (src.modelo !== undefined && (src.modelo.length < 1 || src.modelo.length > 200)) return "modelo de IA de 1 a 200 caracteres"
  if (src.idioma && [src.idioma.documento, src.idioma.rotulos].some((x) => x.length < 1 || x.length > 35)) return "idioma inválido"
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(src.importadoEm)) return "data da importação sem fuso"
  const files = new Set(src.documentos.map((d) => d.arquivo))
  for (const [id, t] of Object.entries(src.trechos)) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) return `trecho com id inválido (${id})`
    const k = Object.keys(t).find((x) => !TRECHO_KEYS.has(x))
    if (k) return `campo desconhecido no trecho (${k})`
    if (!Number.isInteger(t.pagina) || t.pagina < 1 || !t.trecho) return `trecho inválido (${id})`
    if (t.arquivo !== undefined && !files.has(t.arquivo)) return `trecho cita arquivo que não é documento de origem (${t.arquivo})`
    if (t.confianca !== undefined && !["alta", "media", "baixa"].includes(t.confianca)) return `confiança inválida (${id})`
  }
  return null
}

/** One version written (insert or update): structure the database checks on its rows. */
function versionRowDenied(v: TemplateVersion): RuleError | null {
  if (!Number.isInteger(v.number) || v.number < 1) return deny("23514", "Número de versão inválido")
  if (v.note.length > 2000) return deny("23514", "Nota com mais de 2000 caracteres")
  if (v.maxWindowHours !== null && v.maxWindowHours !== undefined && !(v.maxWindowHours > 0)) return deny("23514", "Prazo máximo da janela precisa ser maior que zero")
  if ((v.status === "rascunho") !== (v.activatedAt === null)) return deny("23514", "Rascunho sem data de ativação; ativa ou arquivada com ela")
  if (v.origin === "sugerida" && !v.sourceSha256) return deny("23514", "Versão sugerida pela importação sem o SHA-256 do pacote")
  if (v.sourceSha256 !== null && !HEX64.test(v.sourceSha256)) return deny("23514", "SHA-256 do pacote inválido")
  if ((v.origin === "sugerida") !== (v.importSource !== undefined)) return deny("23514", "Versão sugerida exige a origem da importação; manual não tem")
  if (v.importSource) {
    const p = importSourceProblem(v.importSource)
    if (p) return deny("PTW15", `Origem da importação inválida: ${p}`)
    if (v.importSource.pacote.sha256 !== v.sourceSha256) return deny("PTW15", "Origem da importação inválida: SHA-256 do pacote diferente da versão")
  }
  const kinds = v.stages.map((s) => s.kind).filter(Boolean)
  if (new Set(kinds).size !== kinds.length) return deny("23505", "Duas etapas do mesmo tipo na versão")
  for (const st of v.stages) {
    if (st.name.length < 1 || st.name.length > 80) return deny("23514", "Nome de etapa de 1 a 80 caracteres")
    for (const sl of st.slots) { const p = slotProblem(sl); if (p) return deny("23514", p) }
  }
  const slotIds = new Set(v.stages.flatMap((s) => s.slots.map((x) => x.id)))
  const seen = new Set<string>()
  for (const r of v.separation) {
    if (!(r.slotA < r.slotB)) return deny("23514", "Separação fora de ordem (slotA < slotB)")
    if (!slotIds.has(r.slotA) || !slotIds.has(r.slotB)) return deny("23503", "Separação aponta para assinatura de outra versão")
    const k = separationKey(r)
    if (seen.has(k)) return deny("23505", "Separação repetida")
    seen.add(k)
  }
  const fp = v.form ? formProblem(v.form) : null
  if (fp) return deny("PTW15", `Formulário inválido: ${fp}`)
  return null
}

/**
 * What the database refuses when a template goes from `before` to `after` (either may be undefined:
 * create or remove). `usedBy(versionId)` = some permit points at the version (removing it: 23503).
 * Only a draft changes or leaves; ativa → arquivada changes nothing else; a draft becomes active
 * only through activation (PTW15 checks) and is never archived directly.
 */
export function versionChangeDenied(before: PermitTemplate | undefined, after: PermitTemplate | undefined, usedBy: (versionId: string) => boolean, lists?: OptionList[]): RuleError | null {
  if (after) {
    if (after.name.trim().length < 1 || after.name.length > 120) return deny("23514", "Nome do modelo de 1 a 120 caracteres")
    if (!["pet", "pt", "cadastro"].includes(after.retentionClass)) return deny("23503", "Classe de retenção inexistente")
    if (after.versions.filter((v) => v.status === "ativa").length > 1) return deny("23505", "O modelo já tem uma versão ativa")
    const numbers = after.versions.map((v) => v.number)
    if (new Set(numbers).size !== numbers.length) return deny("23505", "Número de versão repetido no modelo")
  }
  const prev = new Map((before?.versions ?? []).map((v) => [v.id, v]))
  const next = new Map((after?.versions ?? []).map((v) => [v.id, v]))
  for (const [id, b] of prev) {
    const a = next.get(id)
    if (!a) {
      if (b.status !== "rascunho") return deny("PTW03", "Só um rascunho de versão pode ser removido")
      if (usedBy(id)) return deny("23503", `A versão ${b.number} é usada por uma PT`)
      continue
    }
    if (b.status === "rascunho") {
      if (a.status === "arquivada") return deny("PTW03", "Um rascunho é ativado antes de ser arquivado")
      const r = versionRowDenied(a)
      if (r) return r
      if (a.status === "ativa") { const act = activationDenied(a, lists); if (act) return act }
      continue
    }
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    if (b.status === "ativa" && a.status === "arquivada" && sansStatus(a) === sansStatus(b)) continue
    return deny("PTW03", `A versão está ${STATUS_WORD[b.status]}; crie uma nova versão para alterar`)
  }
  for (const [id, a] of next) {
    if (prev.has(id)) continue
    if (a.status !== "rascunho") return deny("PTW03", "Uma versão nasce rascunho")
    const r = versionRowDenied(a)
    if (r) return r
  }
  return null
}

/** Template name unique in the unit, ignoring case (23505). */
export function templateNameDenied(templates: PermitTemplate[], t: Pick<PermitTemplate, "id" | "name">): RuleError | null {
  const n = t.name.trim().toLowerCase()
  return templates.some((x) => x.id !== t.id && x.name.trim().toLowerCase() === n) ? deny("23505", `Já existe um modelo chamado “${t.name.trim()}”`) : null
}
