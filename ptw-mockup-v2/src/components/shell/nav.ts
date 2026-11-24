import { BoxIcon, ScrollTextIcon, ClipboardListIcon, FileTextIcon, InboxIcon, ListIcon, MapPinIcon, PaletteIcon, SettingsIcon, ShieldOffIcon, UsersIcon } from "lucide-react"
import type { NavigationGroup, NavigationView } from "@/core/navigation"

/**
 * Route labels and icons. The pure navigation policy assigns each destination to management or
 * consultation using the session's existing grants. Keys are canonical hashes; do not rename.
 */
export const NAV = {
  "minha-area": { title: "Minha área", icon: InboxIcon },
  quadro: { title: "Quadro de PTs", icon: ClipboardListIcon },
  desabilitados: { title: "Desabilitados agora", icon: ShieldOffIcon },
  locais: { title: "Locais", icon: MapPinIcon },
  ativos: { title: "Ativos", icon: BoxIcon },
  pessoas: { title: "Pessoas", icon: UsersIcon },
  modelos: { title: "Modelos de PT", icon: FileTextIcon },
  tipos: { title: "Tipos", icon: SettingsIcon },
  listas: { title: "Listas", icon: ListIcon },
  auditoria: { title: "Auditoria", icon: ScrollTextIcon },
  identidade: { title: "Identidade visual", icon: PaletteIcon },
  grupos: { title: "Grupos de pessoas", icon: UsersIcon },
  delegacoes: { title: "Delegações", icon: UsersIcon },
} as const satisfies Record<NavigationView, { title: string; icon: typeof BoxIcon }>

export type ViewKey = NavigationView
export const NAV_GROUP_LABELS = {
  operation: "Operação", registry: "Cadastros", configuration: "Configuração",
  governance: "Governança e sistema", reference: "Consultas",
} as const satisfies Record<NavigationGroup, string>
