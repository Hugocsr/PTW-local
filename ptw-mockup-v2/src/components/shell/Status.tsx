import type { ReactNode } from "react"
import type { StatusTone } from "@/lib/tone"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Status colour roles (DESIGN.md · Cor de estado). One hue per meaning, always with an icon or word:
 * - ok:        concluído, assinado, liberado, em uso
 * - pending:   a ação está com você / em andamento (sua vez, em análise, emitida, entregue)
 * - attention: precisa de revisão ou vence em breve (devolvida, expirada, revisar, rascunho de versão)
 * - stop:      falhou, bloqueado, parado (suspensa, fora da faixa, equipamento com outra PT aberta, erro)
 * - neutral:   aguardando outra pessoa, rascunho de PT, finalizado sem destaque
 */
export type { StatusTone }

/** Soft badge (SGI · Status): pílula com superfície suave + texto da cor (≥ 4.5:1). */
export const TONE_BADGE: Record<StatusTone, string> = {
  ok: "bg-st-ok-surface text-st-ok-fg",
  pending: "bg-st-pending-surface text-st-pending-fg",
  attention: "bg-st-attention-surface text-st-attention-fg",
  stop: "bg-st-stop-surface text-st-stop-fg",
  neutral: "bg-st-neutral-surface text-st-neutral-fg",
}
/** Block / banner: surface + border + text. */
export const TONE_BLOCK: Record<StatusTone, string> = {
  ok: "bg-st-ok-surface border-st-ok-border text-st-ok-fg",
  pending: "bg-st-pending-surface border-st-pending-border text-st-pending-fg",
  attention: "bg-st-attention-surface border-st-attention-border text-st-attention-fg",
  stop: "bg-st-stop-surface border-st-stop-border text-st-stop-fg",
  neutral: "bg-st-neutral-surface border-st-neutral-border text-st-neutral-fg",
}
/** Text only (inline reason lines, icons). */
export const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-st-ok-fg", pending: "text-st-pending-fg", attention: "text-st-attention-fg", stop: "text-st-stop-fg", neutral: "text-st-neutral-fg",
}
/** Solid marker (dots, left accent bars, step markers). */
export const TONE_SOLID: Record<StatusTone, string> = {
  ok: "bg-st-ok-solid", pending: "bg-st-pending-solid", attention: "bg-st-attention-solid", stop: "bg-st-stop-solid", neutral: "bg-st-neutral-solid",
}

/** Icon + word, coloured by tone. Never colour alone. */
export function StatusBadge({ tone, icon: Icon, children, className }: { tone: StatusTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-meta font-semibold whitespace-nowrap", TONE_BADGE[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  )
}
