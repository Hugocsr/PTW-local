import { BoxIcon, ScrollTextIcon, ClipboardListIcon, FileTextIcon, InboxIcon, ListIcon, MapPinIcon, SettingsIcon, ShieldOffIcon, UsersIcon } from "lucide-react"

/**
 * The side menu, in the order people reach for it: field work first (Minha área, Quadro),
 * then what supervisors keep up to date (Cadastro), then what admins set once (Configuração:
 * the permit models and the types and lists they draw on, and the Auditoria that records them all). Keys are the route hashes; do not rename.
 */
export const NAV = {
  "minha-area": { title: "Minha área", group: "Trabalho", icon: InboxIcon },
  quadro: { title: "Quadro de PTs", group: "Trabalho", icon: ClipboardListIcon },
  desabilitados: { title: "Desabilitados agora", group: "Trabalho", icon: ShieldOffIcon },
  locais: { title: "Locais", group: "Cadastro", icon: MapPinIcon },
  ativos: { title: "Ativos", group: "Cadastro", icon: BoxIcon },
  pessoas: { title: "Pessoas", group: "Cadastro", icon: UsersIcon },
  modelos: { title: "Modelos de PT", group: "Configuração", icon: FileTextIcon },
  tipos: { title: "Tipos", group: "Configuração", icon: SettingsIcon },
  listas: { title: "Listas", group: "Configuração", icon: ListIcon },
  auditoria: { title: "Auditoria", group: "Configuração", icon: ScrollTextIcon },
} as const

export type ViewKey = keyof typeof NAV
export const NAV_GROUPS = ["Trabalho", "Cadastro", "Configuração"] as const
export const NAV_KEYS = Object.keys(NAV) as ViewKey[]
