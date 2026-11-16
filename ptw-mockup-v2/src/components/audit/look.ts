import {
  CalendarClockIcon, CheckIcon, CircleAlertIcon, CircleDotIcon, CircleXIcon, DownloadIcon, EyeIcon, FileInputIcon, FlaskConicalIcon, LinkIcon, LogInIcon, LogOutIcon, OctagonXIcon, PencilIcon, PlayIcon, PlusIcon,
  RotateCcwIcon, SendIcon, ServerIcon, TimerIcon, TimerOffIcon, Trash2Icon, TriangleAlertIcon, Undo2Icon, UnlinkIcon, type LucideIcon,
} from "lucide-react"
import type { StatusTone } from "@/components/shell/Status"
import type { AuditEvent, JsonObject } from "@/core/audit"

const paraState = (e: Pick<AuditEvent, "data">) => {
  const p = e.data.para
  return p && typeof p === "object" && !Array.isArray(p) ? (p as JsonObject).state : undefined
}

/**
 * Icon and tone of an audit event, from its action (DESIGN.md · Cor de estado): denied or a stop = stop;
 * a signature = ok; returned, expired, annulled or server down = attention; a Retomada = pending;
 * everything else (edits, reads, sessions) = neutral. Always shown with its words.
 */
export function auditLook(e: Pick<AuditEvent, "action" | "ok" | "data">): { tone: StatusTone; icon: LucideIcon } {
  const a = e.action
  const verb = a.split(".").pop() ?? ""
  if (!e.ok) return { tone: "stop", icon: CircleAlertIcon }
  if (verb === "desfeito") return { tone: "neutral", icon: RotateCcwIcon }
  if (a === "pt.parada") return { tone: "stop", icon: OctagonXIcon }
  if (a === "pt.assinatura") return { tone: "ok", icon: CheckIcon }
  if (a === "pt.assinatura.anulada" || a === "pt.alterada") return { tone: "attention", icon: TriangleAlertIcon }
  if (a === "pt.retomada" || a === "pt.parada.removida") return { tone: "pending", icon: PlayIcon }
  if (a === "pt.prorrogada") return { tone: "neutral", icon: CalendarClockIcon }
  if (a === "pt.estado") {
    const s = paraState(e)
    if (s === "em_analise") return { tone: "neutral", icon: SendIcon }
    if (s === "devolvida") return { tone: "attention", icon: Undo2Icon }
    if (s === "expirada") return { tone: "attention", icon: TimerOffIcon }
    if (s === "suspensa") return { tone: "stop", icon: OctagonXIcon }
    if (s === "cancelada") return { tone: "neutral", icon: CircleXIcon }
    return { tone: "neutral", icon: CircleDotIcon }
  }
  if (a === "sistema.servidor.parado") return { tone: "attention", icon: ServerIcon }
  if (a.startsWith("sistema.servidor.")) return { tone: "neutral", icon: ServerIcon }
  if (a.startsWith("sistema.relogio.")) return { tone: "neutral", icon: TimerIcon }
  if (a === "sessao.entrada") return { tone: "neutral", icon: LogInIcon }
  if (a.startsWith("sessao.")) return { tone: "neutral", icon: LogOutIcon }
  if (a === "modelo.importado") return { tone: "neutral", icon: FileInputIcon }
  if (a.startsWith("acesso.modelo.teste")) return { tone: "neutral", icon: FlaskConicalIcon }
  if (a.startsWith("acesso.exportacao") || a === "acesso.anexo.baixado") return { tone: "neutral", icon: DownloadIcon }
  if (a.startsWith("acesso.")) return { tone: "neutral", icon: EyeIcon }
  if (a === "cadastro.ativo.local.incluido") return { tone: "neutral", icon: LinkIcon }
  if (a === "cadastro.ativo.local.removido") return { tone: "neutral", icon: UnlinkIcon }
  if (/^(criad|incluid|concedid)/.test(verb) || a === "pt.revisao") return { tone: "neutral", icon: PlusIcon }
  if (/^(removid|revogad)/.test(verb)) return { tone: "neutral", icon: Trash2Icon }
  if (/^(alterad|ativad|arquivad)/.test(verb) || a === "pt.resposta") return { tone: "neutral", icon: PencilIcon }
  return { tone: "neutral", icon: CircleDotIcon }
}

/** Area names for the filter and the detail (first segment of the action). */
export const AREA_LABEL: Record<string, string> = {
  pt: "PT", cadastro: "Cadastro", modelo: "Modelos", acesso: "Acessos", sessao: "Sessão", conta: "Conta", sistema: "Sistema",
}

/** Names of the database tables an event is about (entity), for the detail. */
export const ENTITY_LABEL: Record<string, string> = {
  unit: "Unidade", type_def: "Tipo", location: "Local", asset: "Ativo", asset_location: "Local do ativo", asset_relation: "Relação entre ativos",
  person: "Pessoa", person_role: "Cargo da pessoa", option_list: "Lista", option_item: "Item de lista", template: "Modelo", template_version: "Versão de modelo",
  version_location_type: "Tipo de local aceito", version_asset_type: "Tipo de ativo aceito", stage: "Etapa", sign_slot: "Assinatura do modelo",
  separation: "Separação", permit: "PT", permit_asset: "Ativo da PT", permit_team: "Equipe", permit_answer: "Resposta", attachment: "Anexo",
  permit_revision: "Revisão", signature: "Assinatura",
}

type Named = { id: string }
/** Inputs for `idNames` (registry and permits as the stores keep them). */
export interface NameSources {
  people: (Named & { name: string })[]
  locations: (Named & { name: string })[]
  assets: (Named & { code: string })[]
  types: (Named & { label: string })[]
  optionLists: (Named & { name: string; items: (Named & { label: string })[] })[]
  templates: (Named & { name: string; versions: (Named & { number: number; stages: (Named & { name: string; slots: (Named & { meaning: string | null })[] })[] })[] })[]
  permits: (Named & { number: string | null; authorId?: string })[]
}

/**
 * Names by id for reading raw audit data (v_audit joins them in the database): person, place, asset
 * tag, type, list and item, model and version, stage, signature, PT number (a draft: "Rascunho de <autor>"). Unknown = undefined.
 */
export function idNames(s: NameSources): (id: string) => string | undefined {
  const m = new Map<string, string>()
  for (const p of s.people) m.set(p.id, p.name)
  for (const l of s.locations) m.set(l.id, l.name)
  for (const a of s.assets) m.set(a.id, a.code)
  for (const t of s.types) m.set(t.id, t.label)
  for (const l of s.optionLists) { m.set(l.id, l.name); for (const i of l.items) m.set(i.id, i.label) }
  for (const t of s.templates) {
    m.set(t.id, t.name)
    for (const v of t.versions) {
      m.set(v.id, `${t.name} v${v.number}`)
      for (const st of v.stages) { m.set(st.id, st.name); for (const sl of st.slots) m.set(sl.id, sl.meaning ?? st.name) }
    }
  }
  // A draft has no number yet: it is named by its author, as the person knows it.
  for (const p of s.permits) m.set(p.id, p.number ?? (p.authorId && m.has(p.authorId) ? `Rascunho de ${m.get(p.authorId)}` : "Rascunho"))
  return (id) => m.get(id)
}
