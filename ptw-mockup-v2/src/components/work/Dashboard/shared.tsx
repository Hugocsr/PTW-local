import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Accent of each dashboard counter (SPEC 001 · protótipo): status tokens of the SGI design system, and
 * the brand's soft indigo for "Aguardando aprovação". Always with an icon and a word, never colour alone.
 */
export type Accent = "stop" | "attention" | "approval" | "pending" | "neutral" | "ok"
export const ACCENT: Record<Accent, { tile: string; text: string; pill: string }> = {
  stop: { tile: "bg-st-stop-surface text-st-stop-fg", text: "text-st-stop-fg", pill: "bg-st-stop-surface text-st-stop-fg" },
  attention: { tile: "bg-st-attention-surface text-st-attention-fg", text: "text-st-attention-fg", pill: "bg-st-attention-surface text-st-attention-fg" },
  approval: { tile: "bg-primary-soft text-primary", text: "text-primary", pill: "bg-primary-soft text-primary" },
  pending: { tile: "bg-st-pending-surface text-st-pending-fg", text: "text-st-pending-fg", pill: "bg-st-pending-surface text-st-pending-fg" },
  neutral: { tile: "bg-st-neutral-surface text-st-neutral-fg", text: "text-st-neutral-fg", pill: "bg-st-neutral-surface text-st-neutral-fg" },
  ok: { tile: "bg-st-ok-surface text-st-ok-fg", text: "text-st-ok-fg", pill: "bg-st-ok-surface text-st-ok-fg" },
}

export function Tile({ icon: Icon, accent, size = "md", className }: { icon: LucideIcon; accent: Accent | "brand"; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-lg",
      size === "lg" ? "size-12 [&_svg]:size-6" : size === "md" ? "size-10 [&_svg]:size-5" : "size-8 [&_svg]:size-4",
      accent === "brand" ? "bg-primary-soft text-primary" : ACCENT[accent].tile, className)}>
      <Icon />
    </span>
  )
}

/** Panel = bordered card with its own heading (icon tile, h2, one muted line). */
export function Panel({ id, icon, title, sub, children, className }: { id: string; icon: LucideIcon; title: string; sub: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("flex min-w-0 scroll-mt-20 flex-col gap-4 rounded-lg border bg-card p-4 shadow-(--shadow-elev-2) md:p-5", className)}>
      <header className="flex min-w-0 items-center gap-3">
        <Tile icon={icon} accent="brand" />
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="type-heading">{title}</h2>
          <p className="type-meta">{sub}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

/** Grey box with an icon and one line: the empty state of a group or block. */
export function EmptyBox({ icon: Icon, text, inline = false }: { icon: LucideIcon; text: string; inline?: boolean }) {
  return (
    <p className={cn("flex items-center justify-center rounded-md bg-muted/60 px-4 text-center type-meta", inline ? "min-h-11 gap-2 py-2.5" : "min-h-20 flex-col gap-2 py-4")}>
      <Icon className={cn("shrink-0 text-muted-foreground", inline ? "size-4" : "size-6")} aria-hidden />{text}
    </p>
  )
}
