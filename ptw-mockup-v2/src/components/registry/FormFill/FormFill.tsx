/** The form for filling in: sections in stage order, with their notices. */
import { useContext, useState, type ReactNode } from "react"
import { ChevronDownIcon, InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formBlocks, noticeParts, repeatsTitle, type NoticeItem } from "@/core/formLayout"
import { sectionStatus, visibleItems, type FormAnswers, type ItemAnswer } from "@/core/form"
import type { FormSection, FormSpec, Stage } from "@/registry/types"
import { FillItem } from "./FillItem"
import type { Actor } from "./attachments"
import { SIM_ACTOR } from "./attachments"
import type { FormFiles } from "./context"
import { FormFilesContext, useFormContext } from "./context"

/**
 * Renders a form for filling in, one section after another in stage order, each with its status.
 * The same renderer serves the editor's preview and, later, Nova PT and the Assinar pre-step.
 */
export function FormFill({ form, stages, answers, onChange, stageId, actor = SIM_ACTOR, sectionIds, files }: {
  form: FormSpec
  stages: Stage[]
  answers: FormAnswers
  onChange: (itemId: string, a: ItemAnswer | null) => void
  /** Only the sections of this stage (the signing pre-step); all when absent. */
  stageId?: string
  /** Who is filling and the (simulated) time, stamped on captured files. */
  actor?: Actor
  /** Only these sections (one section per page on a phone). */
  sectionIds?: string[]
  /** The PT's files (or Testar's, in memory); without it, an outer FormFilesContext is used. */
  files?: FormFiles
}) {
  const order = stages.filter((s) => !stageId || s.id === stageId)
  const outer = useContext(FormFilesContext)
  // A section without a stage is filled with the first stage (FO1).
  const ofStage = (s: FormSection, st: Stage) => s.stageId === st.id || (s.stageId === undefined && st.id === stages[0]?.id)
  return (
    <FormFilesContext.Provider value={files ?? outer}>
    <div className="flex flex-col gap-10">
      {order.map((st) => {
        const sections = form.sections.filter((s) => ofStage(s, st) && (!sectionIds || sectionIds.includes(s.id)))
        if (sections.length === 0) return null
        return (
          <div key={st.id} className="flex flex-col gap-10">
            {!stageId && <h3 className="type-title">{st.name}</h3>}
            {sections.map((s) => <FillSection key={s.id} section={s} answers={answers} onChange={onChange} actor={actor}
              untitled={sections.length === 1 && sameText(s.title, st.name)} />)}
          </div>
        )
      })}
    </div>
    </FormFilesContext.Provider>
  )
}

/**
 * Level 2 of the form grammar (DESIGN.md · Itens de formulário): a section's title, 16/600 over a rule
 * that spans the column, with a quiet note on the right ("Falta 1 resposta"). The same header opens
 * the read-only answers and the stage's signatures, so a section looks the same everywhere.
 */
export const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR")

export function FormSectionHeader({ id, title, aside }: { id?: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground/20 pb-2">
      <h4 id={id} className="type-subtitle">{title}</h4>
      {aside}
    </div>
  )
}

/**
 * One section: its title, a quiet count of what is still missing, then the questions in one reading
 * column. No box and no "Completa" badge: sections are parted by a line (DESIGN.md · Itens de formulário).
 * A reference table copied from the paper (3+ named notices) folds into one "Consultar" block.
 */
function FillSection({ section, answers, onChange, actor, untitled = false }: { section: FormSection; answers: FormAnswers; onChange: (itemId: string, a: ItemAnswer | null) => void; actor: Actor; /** The stage card already carries this title. */ untitled?: boolean }) {
  const status = sectionStatus(section, answers, useFormContext())
  const items = visibleItems(section, answers)
  const missing = status.missing.length
  return (
    <section aria-labelledby={`fs-${section.id}`} className="flex flex-col gap-6">
      {untitled
        ? <h4 id={`fs-${section.id}`} className={missing > 0 ? "type-meta tabular-nums" : "sr-only"}>{missing > 0 ? (missing === 1 ? "Falta 1 resposta" : `Faltam ${missing} respostas`) : section.title}</h4>
        : <FormSectionHeader id={`fs-${section.id}`} title={section.title || "Seção sem título"}
            aside={missing > 0 && <span className="type-meta tabular-nums">{missing === 1 ? "Falta 1 resposta" : `Faltam ${missing} respostas`}</span>} />}
      {formBlocks(items).map((b) => b.kind === "notices"
        ? <NoticeTable key={b.items[0].id} notices={b.items} />
        : <FillItem key={b.item.id} item={b.item} answer={answers[b.item.id]} onChange={(a) => onChange(b.item.id, a)} actor={actor}
            notices={section.items} hideLabel={repeatsTitle(section, b.item)} />)}
    </section>
  )
}

/** A reference table from the paper (e.g. the five classes): closed, one line; opened, one row per notice. */
function NoticeTable({ notices }: { notices: NoticeItem[] }) {
  const [open, setOpen] = useState(false)
  const id = `nt-${notices[0].id}`
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" className="-ml-2 h-auto min-h-11 w-fit max-w-full justify-start py-1.5 text-left whitespace-normal md:min-h-9" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <InfoIcon data-icon="inline-start" className="text-muted-foreground" />
        <span><span className="font-medium">{open ? "Ocultar" : "Consultar"}</span><span className="font-normal text-muted-foreground"> · {notices.map((n) => n.label).join(", ")}</span></span>
        <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <dl id={id} className="flex flex-col divide-y divide-border/70 rounded-md bg-surface-well">
          {notices.map((n) => {
            const [first, ...rest] = noticeParts(n)
            return (
              <div key={n.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                <dt className="type-field sm:w-20 sm:shrink-0">{n.label}</dt>
                <dd className="flex min-w-0 flex-col gap-0.5"><span className="type-body">{first}</span>{rest.map((r) => <span key={r} className="type-meta">{r}</span>)}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
