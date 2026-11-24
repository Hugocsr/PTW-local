import type { ReactNode } from "react"
import { CogIcon, FactoryIcon, MapPinIcon, ShieldIcon, type LucideIcon } from "lucide-react"
import { attrText, isIsoDay, optionLabel, type AttrField } from "@/core/assetAttrs"
import type { NodeKind } from "@/core/assetTree"
import type { RecordAttrs, Status } from "@/registry/types"
import { cn } from "@/lib/utils"

/**
 * Look of each level (SGI Forces · Árvore de ativos): every level has its own icon and colour, always with
 * the name beside it. Plant indigo, area teal, equipment amber; a protective device carries the shield.
 */
export const KIND: Record<NodeKind, { icon: LucideIcon; noun: string; tile: string; text: string }> = {
  planta: { icon: FactoryIcon, noun: "Planta", tile: "bg-primary-soft text-primary", text: "text-primary" },
  area: { icon: MapPinIcon, noun: "Área", tile: "bg-kind-area-surface text-kind-area", text: "text-kind-area" },
  equip: { icon: CogIcon, noun: "Equipamento", tile: "bg-kind-equip-surface text-kind-equip", text: "text-kind-equip" },
}
export const ProtectedIcon = ShieldIcon

/** "● ativa" / "● inativa" (gender of the noun: planta/área are feminine, equipamento masculine). */
export function StatusDot({ status, feminine }: { status: Status; feminine: boolean }) {
  const on = status === "ativo"
  const word = status === "em_revisao" ? "em revisão" : on ? (feminine ? "ativa" : "ativo") : feminine ? "inativa" : "inativo"
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-semibold",
      on ? "bg-st-ok-surface text-st-ok-fg" : status === "em_revisao" ? "bg-st-attention-surface text-st-attention-fg" : "bg-st-neutral-surface text-st-neutral-fg")}>
      <span aria-hidden className={cn("size-1.5 rounded-full", on ? "bg-st-ok-solid" : status === "em_revisao" ? "bg-st-attention-solid" : "bg-st-neutral-solid")} />
      {word}
    </span>
  )
}

/** One cell of the detail grid: label in caps (11/600 grey), value in 600. */
export function Datum({ label, children, mono, full }: { label: string; children: ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", full && "sm:col-span-2")}>
      <dt className="type-label">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm text-foreground", mono && "font-mono text-[0.8125rem]")}>{children || "—"}</dd>
    </div>
  )
}

/** The sheet fields of a record as detail cells (short label: the part before " — " / " (").) */
export function SheetData({ fields, attrs }: { fields: readonly AttrField[]; attrs: RecordAttrs | undefined }) {
  return (
    <>
      {fields.map((f) => {
        const v = attrText(attrs, f.key)
        const shown = f.options ? (v ? optionLabel(f.options, v) : "") : f.kind === "date" && isIsoDay(v) ? v.split("-").reverse().join("/") : v
        return <Datum key={f.key} label={shortLabel(f.label)} mono={f.mono && !!v} full={f.full}>{shown}</Datum>
      })}
    </>
  )
}

/** "WERKS — Cód. SAP Planta" → "WERKS (cód. SAP planta)"; labels without a dash stay. */
export function shortLabel(label: string): string {
  const [a, b] = label.split(" — ")
  return b ? `${b} (${a})` : label
}

export function DataGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>
}
