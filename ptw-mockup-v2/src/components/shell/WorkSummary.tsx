import { ArrowDownIcon, HourglassIcon, PenLineIcon, PlayIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONE_BLOCK, TONE_TEXT } from "./Status"

/** Counts are supplied by the same work cache as the board; no separate metric or request. */
export function WorkSummary({ act, waiting, field, unavailable }: { act: number; waiting: number; field: number; unavailable: boolean }) {
  return (
    <nav aria-label="Resumo das suas PTs" className="grid grid-cols-3 gap-2 sm:gap-3">
      {([
        { id: "ma-vez", title: "Sua vez", hint: "Ações que dependem de você", count: act, icon: PenLineIcon, tone: "pending" },
        { id: "ma-aguardando", title: "Aguardando", hint: "Próximas ações de outras pessoas", count: waiting, icon: HourglassIcon, tone: "neutral" },
        { id: "ma-campo", title: "Em campo", hint: "Suas PTs em acompanhamento", count: field, icon: PlayIcon, tone: "ok" },
      ] as const).map((item) => (
        <button key={item.id} type="button" onClick={() => document.getElementById(item.id)?.scrollIntoView({ block: "start" })}
          className="focus-ring group flex min-h-24 min-w-0 flex-col gap-2 rounded-2xl border bg-card p-3 text-left shadow-elev-2 transition-colors hover:border-ring/50 sm:min-h-28 sm:gap-3 sm:p-4">
          <span className="flex flex-wrap items-center gap-2 type-field"><span className={cn("hidden size-8 items-center justify-center rounded-lg border sm:flex", TONE_BLOCK[item.tone])}><item.icon className="size-4" aria-hidden /></span>{item.title}<ArrowDownIcon className="ml-auto hidden size-4 text-muted-foreground sm:block" aria-hidden /></span>
          <span className={cn("type-page tabular-nums", TONE_TEXT[item.tone])}>{unavailable ? "—" : item.count}<span className="sr-only"> {unavailable ? "Contagem não verificável" : item.title}</span></span>
          <span className="hidden type-meta sm:block">{item.hint}</span>
        </button>
      ))}
    </nav>
  )
}
