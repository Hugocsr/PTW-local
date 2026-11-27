import type { ReactNode } from "react"

/** One block of the new-PT form: a numbered title, a line saying what it is for, then its fields. */
export function FormSection({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${n}`} className="flex min-w-0 shrink-0 flex-col gap-4 [&>*]:shrink-0 rounded-lg border bg-card p-4 md:p-6">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[0.75rem] font-semibold tabular-nums text-primary-hover">{n}</span>
        <div className="min-w-0"><h2 id={`sec-${n}`} className="type-heading">{title}</h2>{hint && <p className="type-meta">{hint}</p>}</div>
      </header>
      {children}
    </section>
  )
}
