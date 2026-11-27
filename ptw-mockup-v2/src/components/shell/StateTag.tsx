import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { TONE_SOLID, type StatusTone } from "./Status"

/**
 * A label in the Trello manner: a small solid rectangle with one bold word, a state of its own. The tooltip says
 * what it means (hover or keyboard focus); the word is never only colour. Neutral uses the dark text colour: the solid grey is too pale for white text.
 */
export function StateTag({ tone, tip, children }: { tone: StatusTone; tip: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex min-h-6 cursor-help items-center rounded-sm px-2 type-meta font-semibold whitespace-nowrap text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", tone === "neutral" ? "bg-st-neutral-fg" : TONE_SOLID[tone])}>{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  )
}
