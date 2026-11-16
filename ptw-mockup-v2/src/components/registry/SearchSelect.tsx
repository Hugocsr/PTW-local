import { useState } from "react"
import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface SearchOption { id: string; label: string; detail?: string }

/**
 * Single choice from a long list (more than six options): a field-sized button that shows the
 * choice, opening a searchable list. Choosing the current option again clears it, like a toggle.
 * It reads as "a list you search" at a glance: a magnifier on the left, the chevron on the right
 * (a plain select has only the chevron; a text field has neither). Opening puts the cursor in the search.
 */
export function SearchSelect({ id, options, value, onChange, placeholder = "Buscar e escolher…", ariaLabel, invalid, className }: {
  id?: string
  options: SearchOption[]
  value: string | undefined
  onChange: (id: string | undefined) => void
  placeholder?: string
  ariaLabel: string
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={chosen ? `${ariaLabel}: ${chosen.label}` : ariaLabel} aria-invalid={invalid}
          className={cn("h-auto min-h-11 w-full min-w-0 justify-start gap-2 bg-surface-row py-2 text-left font-normal whitespace-normal md:min-h-9 md:py-1.5", className)}>
          <SearchIcon className="shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("min-w-0 flex-1 break-words", !chosen && "text-muted-foreground")}>{chosen ? chosen.label : placeholder}</span>
          <ChevronDownIcon className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-2rem)] p-1">
        <Command>
          <CommandInput autoFocus placeholder="Buscar…" aria-label={`Buscar em ${ariaLabel}`} className="h-full" />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.label} ${o.detail ?? ""} ${o.id}`} data-checked={o.id === value}
                  onSelect={() => { onChange(o.id === value ? undefined : o.id); setOpen(false) }} className="min-h-11 md:min-h-9">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words">{o.label}</span>
                    {o.detail && <span className="type-meta break-words">{o.detail}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
