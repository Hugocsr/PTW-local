import { KeyRoundIcon } from "lucide-react"
import { GRANT_INFO, type AccessProfile, type Grant } from "@/core/governance"
import { cn } from "@/lib/utils"

/** "Gestão de cadastros" pill (SGI soft indigo), with a key icon: a permission, never colour alone. */
export function GrantPill({ grant, className }: { grant: Grant; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 type-meta font-semibold text-primary", className)}>
      <KeyRoundIcon className="size-3" aria-hidden />{GRANT_INFO[grant].label}
    </span>
  )
}

/**
 * Tipo do grupo no SGI (APROVADOR, GESTOR SMS, EXECUTANTE…): o perfil, em caixa alta, numa pílula com borda.
 * A cor só distingue um perfil do outro (fixa pelo id) e nunca vem sozinha: o nome está sempre escrito.
 */
const PROFILE_TONES = [
  "border-st-attention-border bg-st-attention-surface text-st-attention-fg",
  "border-st-pending-border bg-st-pending-surface text-st-pending-fg",
  "border-st-ok-border bg-st-ok-surface text-st-ok-fg",
  "border-primary/25 bg-primary-soft text-primary",
] as const
export function profileTone(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PROFILE_TONES[h % PROFILE_TONES.length]
}
export function ProfilePill({ profile, className }: { profile: Pick<AccessProfile, "id" | "name" | "active">; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[0.6875rem] leading-4 font-semibold tracking-wide uppercase",
      profile.active ? profileTone(profile.id) : "border-border bg-st-neutral-surface text-st-neutral-fg line-through", className)}>
      <span className="truncate">{profile.name}</span>
    </span>
  )
}

/** Planta do grupo no SGI: o código (PNO, PSU…) numa pílula índigo suave; o nome fica no title. */
export function PlantPill({ code, name }: { code: string; name: string }) {
  return <span title={name} className="inline-flex items-center rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{code}</span>
}

/** "MC" for "Marina Costa". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}
