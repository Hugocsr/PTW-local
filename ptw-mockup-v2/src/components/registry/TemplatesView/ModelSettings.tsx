/** Escopo: where and on what a permit of this model may be issued, the window limit and the equipment rule. */
import { useState } from "react"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NumberInput } from "../NumberInput"
import { maxWindowText } from "@/core/windowLimit"
import { PageSection } from "@/components/shell/Page"
import { useRegistry } from "@/registry/store"
import { type TemplateContent } from "@/registry/types"
import { assetIcon, locationIcon, ToggleField } from "../common"
import { PickList } from "../PickList"

/* =============================================================== */
/*  Escopo: where and on what a permit of this model may be issued */
/* =============================================================== */

export function Scope({ tpl, set, disabled }: { tpl: TemplateContent; set: (patch: Partial<TemplateContent>) => void; disabled: boolean }) {
  const { state } = useRegistry()
  const { locationTypes, assetTypes } = state
  return (
    <>
      <PageSection title="Tipos de local">
        {disabled ? <ReadList items={locationTypes.filter((t) => tpl.locationTypeIds.includes(t.id)).map((t) => ({ id: t.id, label: t.label, icon: locationIcon(t) }))} /> : <PickList
          ariaLabel="Tipos de local aceitos" addLabel="Tipo de local" empty="Escolha ao menos um tipo de local" invalid
          options={locationTypes.map((t) => ({ id: t.id, label: t.label, icon: locationIcon(t) }))}
          value={tpl.locationTypeIds} onChange={(v) => set({ locationTypeIds: v })}
        />}
      </PageSection>
      <PageSection title="Tipos de ativo">
        {disabled ? <ReadList items={assetTypes.filter((t) => tpl.assetTypeIds.includes(t.id)).map((t) => ({ id: t.id, label: t.label, icon: assetIcon(t) }))} /> : <PickList
          ariaLabel="Tipos de ativo aceitos" addLabel="Tipo de ativo" empty="Escolha ao menos um tipo de ativo" invalid
          options={assetTypes.map((t) => ({ id: t.id, label: t.label, icon: assetIcon(t) }))}
          value={tpl.assetTypeIds} onChange={(v) => set({ assetTypeIds: v })}
        />}
      </PageSection>
    </>
  )
}

/** The chosen types of a version no one can change: plain rows, no picker and no ×. */
function ReadList({ items }: { items: { id: string; label: string; icon?: React.ComponentType<{ className?: string }> }[] }) {
  if (items.length === 0) return <p className="type-meta">Nenhum.</p>
  return (
    <ul className="flex flex-col divide-y border-y">
      {items.map((o) => (
        <li key={o.id} className="flex min-h-11 items-center gap-2 type-body md:min-h-9">
          {o.icon && <o.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}{o.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * The longest work window a permit of this version may have (R3, PTW31: checked at Enviar, at the
 * Emissão and at Prorrogar). Typed in hours or days; empty = no limit; shown as "até 3 dias".
 */
export function WindowLimit({ hours, disabled, onChange }: { hours: number | null; disabled: boolean; onChange: (h: number | null) => void }) {
  const [unit, setUnit] = useState<"horas" | "dias">(hours !== null && hours % 24 === 0 ? "dias" : "horas")
  const shown = hours === null ? undefined : unit === "dias" ? hours / 24 : hours
  const put = (n: number | undefined, u = unit) => onChange(n === undefined || n <= 0 ? null : u === "dias" ? n * 24 : n)
  return (
    <PageSection title="Janela de trabalho">
      {disabled ? (
        <p className="type-body">{hours === null ? "Sem prazo máximo" : `Prazo máximo da janela: ${maxWindowText(hours)}`}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ver-max-window">Prazo máximo da janela</Label>
          <div className="flex flex-wrap items-start gap-2">
            <NumberInput id="ver-max-window" value={shown} decimals={0} onChange={(n) => put(n)} describedBy="ver-max-window-help" className="w-28" />
            <ToggleGroup type="single" variant="outline" spacing={0} value={unit} aria-label="Unidade do prazo" className="w-fit"
              onValueChange={(v) => { if (!v) return; const u = v as typeof unit; setUnit(u); if (shown !== undefined) put(shown, u) }}>
              <ToggleGroupItem value="horas" className="min-h-11 px-4 data-[state=on]:bg-foreground data-[state=on]:text-background md:min-h-9">Horas</ToggleGroupItem>
              <ToggleGroupItem value="dias" className="min-h-11 px-4 data-[state=on]:bg-foreground data-[state=on]:text-background md:min-h-9">Dias</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p id="ver-max-window-help" className="type-meta">{hours === null ? "Vazio: sem prazo máximo." : `${cap(maxWindowText(hours))}, do início ao fim, contando prorrogações.`}</p>
        </div>
      )}
    </PageSection>
  )
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * "Prende o equipamento" (template_version.holds_equipment): off, a permit of this version neither
 * holds its equipment nor is blocked by another open PT on it (e.g. disabling an interlock).
 */
export function HoldsEquipment({ holds, disabled, onChange }: { holds: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const help = "Desligado: esta PT pode existir junto com outra PT aberta no mesmo equipamento, por exemplo a desabilitação de um intertravamento."
  return (
    <PageSection title="Equipamento">
      {disabled ? (
        <div className="flex flex-col gap-1">
          <p className="type-body">{holds ? "Prende o equipamento: uma PT aberta por equipamento" : "Não prende o equipamento"}</p>
          {!holds && <p className="type-meta">Pode existir junto com outra PT aberta no mesmo equipamento.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <ToggleField label="Prende o equipamento" checked={holds} onChange={onChange} />
          <p className="type-meta">{help}</p>
        </div>
      )}
    </PageSection>
  )
}
