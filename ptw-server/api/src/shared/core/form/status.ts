// @ts-nocheck — cópia de ptw-mockup-v2/src/core/form/status.ts; não edite (node scripts/sync-shared.mjs)
/** How a filled-in form stands: what is missing or blocks, per item and per section. */
import type { FormItem, FormSection } from "@/registry/types"
import { personIneligible } from "../eligibility.ts"
import { instant } from "../time.ts"
import type { FormAnswers, FormContext, ItemAnswer } from "./answers.ts"
import { blockingChoice } from "./answers.ts"
import { lineAnswerLabel, visibleItems } from "./conditions.ts"
import { codeMatches, dateBr, dateRuleProblem, formatMeasure, rangeProblem, timeProblem, validIso } from "./masks.ts"

export interface SectionStatus { done: boolean; missing: string[]; blocked: string[] }

/** What still stops a section: missing answers, answers that block the stage, justifications owed. */
export function itemProblems(item: FormItem, a: ItemAnswer | undefined, ctx: FormContext = {}): { missing: string[]; blocked: string[] } {
  const missing: string[] = []
  const blocked: string[] = []
  if (item.kind === "aviso") return { missing, blocked }
  if (item.kind === "documento") {
    const code = a?.t === "documento" ? a.code.trim() : ""
    if (!code) { if (item.required) missing.push(item.label) }
    else if (!codeMatches(code, item.pattern)) missing.push(`${item.label}: formato ${item.pattern}`)
    if (item.attach && (code || item.required) && !(a?.t === "documento" && a.files.length)) missing.push(`${item.label}: anexar o documento`)
    if (item.validity && (code || item.required)) {
      const iso = validIso(a?.t === "documento" ? a.validUntil : undefined)
      if (!iso) missing.push(`${item.label}: validade`)
      else if (ctx.today && iso < ctx.today) blocked.push(`${item.label}: vencido em ${dateBr(iso)}`)
    }
    return { missing, blocked }
  }
  if (item.kind === "data") {
    const iso = validIso(a?.t === "data" ? a.v : undefined)
    if (!iso) { if (item.required) missing.push(item.label) }
    else { const r = dateRuleProblem(item, iso, ctx.today); if (r) blocked.push(`${item.label}: ${dateBr(iso)} está ${r}`) }
    return { missing, blocked }
  }
  if (item.kind === "pessoa") {
    const ids = a?.t === "pessoa" ? a.ids : []
    if (item.required && ids.length === 0) missing.push(item.label)
    // Same rule as ptw.item_blocker: the cargo held at all, then the person eligible at the place now.
    if (item.mustBeEligible && ctx.people && ctx.today) {
      const now = ctx.now ?? instant(`${ctx.today}T00:00:00`)
      for (const id of ids) {
        const p = ctx.people.find((x) => x.id === id)
        const why = !p ? "pessoa inexistente"
          : item.roleId && !p.roles.some((r) => r.roleId === item.roleId) ? "não tem o cargo"
          : personIneligible(p, item.roleId ?? null, ctx.pathIds ?? null, ctx.today, now)
        if (why) blocked.push(`${item.label}: ${p?.name ?? id} não elegível (${why})`)
      }
    }
    return { missing, blocked }
  }
  if (item.kind === "isolamento") {
    const rows = a?.t === "isolamento" ? a.rows : []
    const need = Math.max(item.required ? 1 : 0, item.minRows)
    if (rows.length < need) missing.push(need > 1 ? `${item.label}: ${rows.length} de ${need} pontos` : item.label)
    rows.forEach((r, k) => {
      const name = `${item.label} · ponto ${k + 1}${r.point.trim() ? ` (${r.point.trim()})` : ""}`
      const lack = [!r.point.trim() && "ponto", !r.energy && "energia", !r.method.trim() && "método", !r.lock.trim() && "cadeado/etiqueta", !r.zero && "energia zero", !r.by && "aplicado por"].filter(Boolean)
      if (lack.length) missing.push(`${name}: ${lack.join(", ")}`)
      if (r.zero === "nao") blocked.push(`${name}: energia zero não verificada`)
    })
    return { missing, blocked }
  }
  if (item.kind === "grupo") {
    const rows = a?.t === "grupo" ? a.rows : []
    const need = Math.max(item.required ? 1 : 0, item.minRows)
    if (rows.length < need) missing.push(need > 1 ? `${item.label}: ${rows.length} de ${need} linhas` : item.label)
    rows.forEach((r, k) => {
      for (const col of item.columns) {
        const p = itemProblems(col, r.answers[col.id], ctx)
        missing.push(...p.missing.map((x) => `${item.label} · linha ${k + 1} · ${x}`))
        blocked.push(...p.blocked.map((x) => `${item.label} · linha ${k + 1} · ${x}`))
      }
    })
    return { missing, blocked }
  }
  if (item.kind === "texto") {
    if (item.required && !(a?.t === "texto" && a.v.trim())) missing.push(item.label)
  } else if (item.kind === "marcacao") {
    const ids = a?.t === "marcacao" ? a.ids : []
    const other = a?.t === "marcacao" ? a.other?.trim() : ""
    if (item.required && ids.length === 0 && !other) missing.push(item.label)
    const stop = blockingChoice(item, ids, ctx.lists)
    if (stop) blocked.push(`${item.label}: “${stop.label}” impede a etapa`)
  } else if (item.kind === "numero") {
    if (a?.t !== "numero") { if (item.required) missing.push(item.label) }
    else { const r = rangeProblem(item, a.v); if (r) blocked.push(`${item.label}: ${formatMeasure(a.v, item.decimals, item.unit)} está ${r}`) }
  } else if (item.kind === "horario") {
    if (item.required && !(a?.t === "horario" && a.v && timeProblem(a.v, item.seconds) === null)) missing.push(item.label)
  } else if (item.kind === "anexo") {
    const n = a?.t === "anexo" ? a.files.length : 0
    if (item.required && n < Math.max(1, item.min)) missing.push(item.min > 1 ? `${item.label}: ${n} de ${item.min}` : item.label)
  } else {
    const lines = a?.t === "verificacao" ? a.lines : {}
    for (const line of item.lines) {
      const ans = lines[line.id]
      if (!ans) { if (item.required) missing.push(`${item.label}: ${line.label}`); continue }
      const word = lineAnswerLabel(item, ans.a, ctx.lists)
      if (line.blockOn.includes(ans.a)) blocked.push(`${line.label}: “${word}” impede a etapa`)
      else if (line.noteOn.includes(ans.a) && !ans.note?.trim()) missing.push(`${line.label}: justificar “${word}”`)
    }
  }
  return { missing, blocked }
}

export function sectionStatus(s: FormSection, answers: FormAnswers, ctx: FormContext = {}): SectionStatus {
  const missing: string[] = []
  const blocked: string[] = []
  for (const item of visibleItems(s, answers)) {
    const p = itemProblems(item, answers[item.id], ctx)
    missing.push(...p.missing)
    blocked.push(...p.blocked)
  }
  return { done: missing.length === 0 && blocked.length === 0, missing, blocked }
}
