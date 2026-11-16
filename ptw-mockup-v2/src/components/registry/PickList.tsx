import { useState } from "react"
import { ChevronDownIcon, SearchIcon, XIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { TONE_BLOCK, TONE_TEXT, type StatusTone } from "@/components/shell/Status"

export interface PickOption {
  id: string
  label: string
  /** Where it sits (a location's parents): a second, quieter line, so the name itself never gets cut. */
  detail?: string
  /** A short state to flag, e.g. "Em revisão". */
  note?: string
  /** Tone of `note` (default attention). */
  noteTone?: StatusTone
  icon?: LucideIcon
}

function OptionText({ o }: { o: PickOption }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="break-words">{o.label}{o.note && <span className={cn("type-meta", TONE_TEXT[o.noteTone ?? "attention"])}> · {o.note}</span>}</span>
      {o.detail && <span className="type-meta break-words">{o.detail}</span>}
    </span>
  )
}

/**
 * Multi-select that scales: the chosen items are shown as rows (reviewable, removable),
 * and a searchable picker adds more. Use instead of toggle chips whenever the option list can grow.
 */
export function PickList({
  options, value, onChange, addLabel = "Adicionar", empty, invalid, ariaLabel, disabled,
}: {
  options: PickOption[]
  value: string[]
  onChange: (ids: string[]) => void
  addLabel?: string
  empty: string
  invalid?: boolean
  ariaLabel: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const chosen = value.map((id) => options.find((o) => o.id === id)).filter((o): o is PickOption => !!o)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const many = options.length >= 7

  return (
    <div className="@container flex flex-col gap-2" role="group" aria-label={ariaLabel}>
      {chosen.length === 0 ? (
        <div className={cn("rounded-md border border-dashed px-3 py-2 type-meta", invalid && TONE_BLOCK.stop)}>{empty}</div>
      ) : (
        // What is chosen reads as a list in a grey well, not as fields: only the search button below adds.
        <ul className="flex flex-col divide-y divide-border rounded-md bg-surface-well">
          {chosen.map((o) => (
            <li key={o.id} className="flex min-w-0 items-center gap-2 py-0.5 pr-0.5 pl-3 type-body">
              {o.icon && <o.icon className="size-4 shrink-0 text-muted-foreground" />}
              <OptionText o={o} />
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Remover ${o.label}`} disabled={disabled} onClick={() => toggle(o.id)}><XIcon /></Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={disabled || options.length === 0}>
              {/* A list you search (magnifier) that drops down (chevron), like SearchSelect. */}
              <SearchIcon data-icon="inline-start" className="text-muted-foreground" />{addLabel}
              <span className="type-meta tabular-nums">· {value.length} de {options.length}</span>
              <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] p-1">
            <Command>
              <CommandInput autoFocus placeholder="Buscar…" aria-label={`Buscar em ${ariaLabel}`} className="h-full" />
              <CommandList>
                <CommandEmpty>Nada encontrado.</CommandEmpty>
                <CommandGroup>
                  {options.map((o) => {
                    const on = value.includes(o.id)
                    return (
                      <CommandItem key={o.id} value={`${o.label} ${o.detail ?? ""} ${o.id}`} data-checked={on} onSelect={() => toggle(o.id)} className="min-h-11 md:min-h-9">
                        {o.icon && <o.icon />}
                        <OptionText o={o} />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {many && (
              <div className="flex items-center justify-between border-t px-1 pt-1">
                <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" onClick={() => onChange(options.map((o) => o.id))}>Marcar todos</Button>
                <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={value.length === 0} onClick={() => onChange([])}>Limpar</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
