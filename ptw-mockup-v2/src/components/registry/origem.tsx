import { createContext, useContext } from "react"
import { ChevronRightIcon, FileInputIcon, QuoteIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/shell/Status"
import type { ImportSource, SourceExcerpt } from "@/registry/types"

/*
 * Provenance of a version suggested by "Importar modelo": every element remembers the page and the
 * literal text of the plant's form it was read from, so the reviewer can check it against the paper.
 */

/** Set around the Fluxo of a suggested draft (and the import preview); empty elsewhere. */
export const SourceContext = createContext<Pick<ImportSource, "trechos"> | null>(null)
/** true = every excerpt shown open (the preview's "Mostrar todas as origens"). */
export const ShowAllSources = createContext(false)

const CONF: Record<NonNullable<SourceExcerpt["confianca"]>, string> = { alta: "confiança alta", media: "confiança média", baixa: "confiança baixa" }

/** "p. 1 · “trecho”", the source wording when translated, and the reader's note. */
export function Excerpt({ x, className }: { x: SourceExcerpt; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5 type-meta", className)}>
      <span className="break-words"><span className="tabular-nums">{x.arquivo ? `${x.arquivo} · ` : ""}p. {x.pagina}</span> · <q className="text-foreground">{x.trecho}</q></span>
      {x.original && <span className="break-words">Original: <q>{x.original}</q></span>}
      {(x.confianca || x.observacao) && <span className="break-words">{[x.confianca && CONF[x.confianca], x.observacao].filter(Boolean).join(" · ")}</span>}
    </span>
  )
}

/** A small "Origem" disclosure for one element; nothing when the element has no excerpt. */
export function SourceDisclosure({ id, className }: { id: string; className?: string }) {
  const src = useContext(SourceContext)
  const all = useContext(ShowAllSources)
  const x = src?.trechos[id]
  if (!x) return null
  if (all) return <Excerpt x={x} className={cn("border-l-2 pl-3", className)} />
  return (
    <details className={cn("group min-w-0", className)}>
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md type-meta hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:min-h-9 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        <QuoteIcon className="size-3.5 shrink-0" aria-hidden />Origem · p. {x.pagina}
      </summary>
      <Excerpt x={x} className="border-l-2 pl-3" />
    </details>
  )
}

/** Shown on a suggested version until it is activated. */
export function SuggestedBadge() {
  return <StatusBadge tone="attention" icon={FileInputIcon}>Sugerida pela importação</StatusBadge>
}
