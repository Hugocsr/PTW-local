import { useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import type { Status } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { TONE_TEXT } from "@/components/shell/Status"

/** A field's problem, in words, tied to the field (aria-invalid + aria-describedby). */
function FieldProblem({ id, text }: { id: string; text: string }) {
  return <p id={id} className={cn("type-meta", TONE_TEXT.stop)}>{text}</p>
}

export function TextField({
  label,
  value,
  onChange,
  description,
  placeholder,
  type,
  error,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  description?: string
  placeholder?: string
  type?: string
  error?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className="min-h-11 md:min-h-9"
        aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <FieldProblem id={`${id}-err`} text={error} />}
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  description,
  placeholder = "Selecione",
  error,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  description?: string
  placeholder?: string
  error?: string
  /** Read-only (e.g. inherited from the parent): shown, not changeable. */
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="min-h-11 w-full md:min-h-9" aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <FieldProblem id={`${id}-err`} text={error} />}
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

export const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "em_revisao", label: "Em revisão" },
  { value: "inativo", label: "Inativo (mantido para histórico)" },
]

export function splitAliases(s: string) {
  return s.split(",").map((a) => a.trim()).filter(Boolean)
}

/**
 * Standard surface for add/edit forms (2 fields or more): a bottom sheet on a phone, a centered
 * dialog elsewhere (same pattern as AssinarDialog).
 * Without the server nothing can be saved: the submit button is off and says why. While the form
 * is not valid, `missing` names what is still needed, next to the disabled button.
 * `meta` is one visible line under the title (e.g. where a place sits). `tabs` adds read-only tabs
 * beside the form (the form is always the first tab, "Cadastro").
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  valid,
  submitLabel = "Salvar",
  savingLabel = "Salvando…",
  missing = [],
  meta,
  tabs,
  wide,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  onSubmit: () => void | Promise<void>
  valid: boolean
  submitLabel?: string
  savingLabel?: string
  /** What the form still needs, e.g. ["Tipo", "um local"]. Shown only while the form is not valid. */
  missing?: string[]
  meta?: ReactNode
  tabs?: { value: string; label: ReactNode; content: ReactNode }[]
  /** Two-column forms (SGI · modal de cadastro): a wider dialog; the caller lays the fields out. */
  wide?: boolean
  children: ReactNode
}) {
  const [saving, setSaving] = useState(false)
  const close = (open: boolean) => { if (!saving) onOpenChange(open) }
  const mobile = useIsMobile()
  const { serverDown } = useSim()
  const hintId = useId()
  const hint = serverDown ? "Sem servidor: não dá para salvar." : !valid && missing.length ? `Falta: ${missing.join(", ")}.` : null
  const formBody = (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || serverDown || saving) return
        setSaving(true)
        try { await onSubmit() } finally { setSaving(false) }
      }}
    >
      <fieldset disabled={saving} className="min-w-0"><FieldGroup>{children}</FieldGroup></fieldset>
      {hint && <p id={hintId} className="type-meta sm:text-right">{hint}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={saving} onClick={() => close(false)}>
          Cancelar
        </Button>
        <Button type="submit" className="min-h-11 md:min-h-9" disabled={saving || !valid || serverDown} aria-describedby={hint ? hintId : undefined}>
          {saving ? savingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
  const form = (head: ReactNode) => (
    <div className="flex flex-col gap-4">
      {head}
      {meta && <div className="-mt-2 type-meta">{meta}</div>}
      {tabs?.length ? (
        <Tabs defaultValue="cadastro">
          <TabsList>
            <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="cadastro" className="mt-3">{formBody}</TabsContent>
          {tabs.map((t) => <TabsContent key={t.value} value={t.value} className="mt-3">{t.content}</TabsContent>)}
        </Tabs>
      ) : formBody}
    </div>
  )
  // With tabs the modal keeps one size: switching tabs must not make it jump.
  const fixed = !!tabs?.length
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={close}>
        <SheetContent side="bottom" className={cn("max-h-dvh overflow-y-auto", fixed && "data-[side=bottom]:h-[90dvh]")}>
          <div className={cn("mx-auto w-full p-4", wide ? "max-w-2xl" : "max-w-md")}>
            {form(
              <SheetHeader className="p-0 pr-10">
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription className="sr-only">{description}</SheetDescription>
              </SheetHeader>,
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("max-h-[90svh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg", fixed && "h-[min(42rem,90svh)] content-start")}>
        {form(
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>,
        )}
      </DialogContent>
    </Dialog>
  )
}
