/** What a filled-in form says, read-only. */
import { type ReactNode } from "react"
import { OctagonXIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeAnswer } from "@/permit/describeAnswer"
import { useRegistry } from "@/registry/store"
import { lineAnswerLabel, dateBr, itemProblems, formatMeasure, optionsOf, rangeProblem, validIso, visibleItems, type FormAnswers, type ItemAnswer } from "@/core/form"
import type { FormItem, FormSpec, Stage } from "@/registry/types"
import { TONE_TEXT } from "@/components/shell/Status"
import { Notice } from "./FillItem"
import { FormSectionHeader, sameText } from "./FormFill"
import { AttachmentList } from "./attachments"
import { useFormContext } from "./context"

/**
 * What a filled-in form says, read-only, section by section in stage order. Unanswered shows "—".
 * Read-only is plain text, never a box: the label (`type-label`, grey) over the value (`type-body`,
 * ink), so nothing here looks like a field to fill (DESIGN.md · Itens de formulário).
 */
export function FormAnswersView({ form, stages, answers, showStage = true }: { form: FormSpec; stages: Stage[]; answers: FormAnswers; showStage?: boolean }) {
  const { state } = useRegistry()
  const ctx = useFormContext()
  const text = (item: FormItem): string => {
    const a = answers[item.id]
    if (item.kind === "texto") return a?.t === "texto" && a.v.trim() ? a.v : "—"
    if (item.kind === "marcacao") {
      if (a?.t !== "marcacao") return "—"
      const names = optionsOf(item, state.optionLists, true).filter((o) => a.ids.includes(o.id)).map((o) => o.label)
      if (a.other?.trim()) names.push(`Outro: ${a.other.trim()}`)
      return names.length ? names.join(", ") : "—"
    }
    return ""
  }
  const files = (id: string) => (answers[id]?.t === "anexo" ? (answers[id] as Extract<ItemAnswer, { t: "anexo" }>).files : [])
  const ordered = stages.flatMap((st, k) => form.sections.filter((s) => s.stageId === st.id || (s.stageId === undefined && k === 0)).map((s) => ({ s, stage: st.name })))
  // Long answers (lists of lines, rows, files, long text) take the whole width; short ones pair up.
  const wide = (item: FormItem) => item.kind === "verificacao" || item.kind === "isolamento" || item.kind === "grupo" || item.kind === "anexo" || (item.kind === "texto" && !!item.long)
  const value = (item: FormItem): ReactNode => {
    const a = answers[item.id]
    if (item.kind === "anexo") return files(item.id).length ? <AttachmentList ids={files(item.id)} /> : "—"
    if (item.kind === "documento") {
      if (a?.t !== "documento") return "—"
      const iso = validIso(a.validUntil)
      const expired = !!iso && iso < ctx.today!
      return (
        <>
          <span>{a.code || "—"}{iso && <span className={cn(expired ? cn("font-medium", TONE_TEXT.stop) : "text-muted-foreground")}> · {expired ? "vencido em" : "válido até"} {dateBr(iso)}</span>}</span>
          {a.files.length > 0 && <div className="mt-2"><AttachmentList ids={a.files} /></div>}
        </>
      )
    }
    if (item.kind === "isolamento" || item.kind === "grupo") {
      const rows = a?.t === "isolamento" || a?.t === "grupo" ? a.rows : []
      if (!rows.length) return "—"
      const blocked = itemProblems(item, a, ctx).blocked
      return (
        <span className="flex flex-col gap-1">
          {rows.map((_, k) => {
            const one = a?.t === "isolamento" ? { t: "isolamento" as const, rows: [a.rows[k]] } : a?.t === "grupo" ? { t: "grupo" as const, rows: [a.rows[k]] } : undefined
            return <span key={k}>{describeAnswer(item, one, state.optionLists, state.people).replace(/^1\. /, `${k + 1}. `)}</span>
          })}
          {blocked.map((b) => <span key={b} className={cn("flex items-start gap-1.5 font-medium", TONE_TEXT.stop)}><OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{b}</span>)}
        </span>
      )
    }
    if (item.kind === "data" || item.kind === "pessoa") {
      const blocked = itemProblems(item, a, ctx).blocked
      return <span className={cn("tabular-nums", blocked.length > 0 && cn("font-medium", TONE_TEXT.stop))}>{describeAnswer(item, a, state.optionLists, state.people)}{blocked.length ? ` · ${blocked.map((b) => b.replace(`${item.label}: `, "")).join("; ")}` : ""}</span>
    }
    if (item.kind === "horario") return <span className="tabular-nums">{a?.t === "horario" ? a.v : "—"}</span>
    if (item.kind === "numero") {
      if (a?.t !== "numero") return "—"
      const out = rangeProblem(item, a.v)
      return <span className={cn("tabular-nums", out && cn("font-medium", TONE_TEXT.stop))}>{formatMeasure(a.v, item.decimals, item.unit)}{out ? ` · ${out}` : ""}</span>
    }
    if (item.kind === "verificacao") {
      return (
        <ul className="flex flex-col divide-y">
          {item.lines.map((l) => {
            const ans = a?.t === "verificacao" ? a.lines[l.id] : undefined
            const stop = !!ans && l.blockOn.includes(ans.a)
            return (
              <li key={l.id} className="flex flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="flex-1">{l.label}</span>
                <span className={cn("sm:text-right", stop && cn("font-medium", TONE_TEXT.stop))}>{ans ? lineAnswerLabel(item, ans.a, state.optionLists) : "—"}{ans?.note ? ` · ${ans.note}` : ""}</span>
              </li>
            )
          })}
        </ul>
      )
    }
    return <span className="whitespace-pre-line">{text(item)}</span>
  }
  return (
    <div className="@container flex flex-col gap-8">
      {ordered.map(({ s, stage }) => {
        const items = visibleItems(s, answers)
        return (
          <section key={s.id} aria-labelledby={`fa-${s.id}`} className="flex flex-col gap-4">
            {ordered.length === 1 && !showStage && sameText(s.title, stage)
              ? <h4 id={`fa-${s.id}`} className="sr-only">{s.title}</h4>
              : <FormSectionHeader id={`fa-${s.id}`} title={s.title} aside={showStage && <span className="type-meta">{stage}</span>} />}
            {/* A section of notices only (a declaration the signer makes) reads as quiet text, not an empty box. */}
            {items.every((i) => i.kind === "aviso") && items.map((n) => n.kind === "aviso" && (
              <Notice key={n.id}>{n.text}</Notice>
            ))}
            {items.some((i) => i.kind !== "aviso") && (
              <dl className="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
                {items.filter((i) => i.kind !== "aviso").map((item) => (
                  <div key={item.id} className={cn("flex min-w-0 flex-col gap-1", wide(item) && "@xl:col-span-2")}>
                    <dt className="type-label">{item.label}</dt>
                    <dd className="min-w-0 type-body">{value(item)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )
      })}
    </div>
  )
}
