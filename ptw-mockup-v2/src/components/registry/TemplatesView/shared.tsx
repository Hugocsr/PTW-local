/** Models: names, version badge and the problems of a version, shared by the list and the model page. */
import { ArchiveIcon, CircleCheckIcon, PencilLineIcon, type LucideIcon } from "lucide-react"
import { fmtDate } from "@/registry/store"
import { type FormSection, type PermitTemplate, type RegistryState, type Stage, type TemplateContent, type VersionStatus } from "@/registry/types"
import { StatusBadge, type StatusTone } from "@/components/shell/Status"
import type { Tab } from "./ModelDetail"
import { signatureProblems } from "../FlowEditor"
import { validateForm } from "@/core/form"

/* =============================================================== */
/*  Models: list (model A) -> model (model C) -> version (model C)  */
/* =============================================================== */

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const shortDate = (iso: string) => fmtDate(iso.slice(0, 10))
export const activeOf = (t: PermitTemplate) => t.versions.find((v) => v.status === "ativa")
export const latestOf = (t: PermitTemplate) => [...t.versions].sort((a, b) => b.number - a.number)[0]
/** The sections of a stage; a section without a stage goes with the first one. */
export const sectionsOf = (t: TemplateContent, st: Stage): FormSection[] => (t.form?.sections ?? []).filter((s) => s.stageId === st.id || (s.stageId === undefined && st.id === t.stages[0]?.id))

/** Em uso = ok, Rascunho = attention (still to review and activate), Arquivada = neutral. */
export const VERSION_STATUS: Record<VersionStatus, { text: string; tone: StatusTone; icon: LucideIcon }> = {
  ativa: { text: "Em uso", tone: "ok", icon: CircleCheckIcon },
  rascunho: { text: "Rascunho", tone: "attention", icon: PencilLineIcon },
  arquivada: { text: "Arquivada", tone: "neutral", icon: ArchiveIcon },
}

export function VersionBadge({ status }: { status: VersionStatus }) {
  const st = VERSION_STATUS[status]
  return <StatusBadge tone={st.tone} icon={st.icon}>{st.text}</StatusBadge>
}

/** What blocks activation, each with the tab where it is fixed. */
export function problems(t: TemplateContent, state: RegistryState, today: string): { text: string; tab: Tab }[] {
  const out: { text: string; tab: Tab }[] = []
  if (t.locationTypeIds.length === 0) out.push({ text: "Escolha ao menos um tipo de local", tab: "escopo" })
  if (t.assetTypeIds.length === 0) out.push({ text: "Escolha ao menos um tipo de ativo", tab: "escopo" })
  out.push(...signatureProblems(t, state, today).map((text) => ({ text, tab: "fluxo" as const })))
  out.push(...validateForm(t.form, t.stages, state.optionLists).map((p) => ({ text: `Formulário · ${p}`, tab: "fluxo" as const })))
  return out
}
