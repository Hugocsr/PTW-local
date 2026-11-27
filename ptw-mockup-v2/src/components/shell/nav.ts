import { BoxIcon, LayoutGridIcon, ListTreeIcon, ScrollTextIcon, ClipboardListIcon, FileTextIcon, LibraryBigIcon, PaletteIcon, ShieldCheckIcon, UserRoundIcon, UsersIcon, UsersRoundIcon } from "lucide-react"
import type { NavigationGroup, NavigationView } from "@/core/navigation"

/**
 * Route labels and icons. The pure navigation policy assigns each destination to management or
 * consultation using the session's existing grants. Keys are canonical hashes; do not rename.
 */
export const NAV = {
  dashboard: { title: "Dashboard", icon: LayoutGridIcon },
  solicitacoes: { title: "Solicitações de PT", icon: ClipboardListIcon },
  ativos: { title: "Gestão de Ativos", icon: ListTreeIcon },
  pessoas: { title: "Usuários", icon: UserRoundIcon, keywords: "pessoas usuários cargos perfis grupos acesso" },
  modelos: { title: "Modelos de PT", icon: FileTextIcon },
  catalogos: { title: "Catálogos", icon: LibraryBigIcon, keywords: "tipos listas cargos relações opções" },
  auditoria: { title: "Auditoria", icon: ScrollTextIcon },
  identidade: { title: "Identidade visual", icon: PaletteIcon },
  grupos: { title: "Grupos SGI", icon: UsersRoundIcon },
  perfis: { title: "Perfis de acesso", icon: ShieldCheckIcon },
  delegacoes: { title: "Delegações", icon: UsersIcon },
} as const satisfies Record<NavigationView, { title: string; icon: typeof BoxIcon; keywords?: string }>

export type ViewKey = NavigationView
export const NAV_GROUP_LABELS = {
  operation: "Operação", registry: "Cadastros", access: "Acesso", configuration: "Configuração",
  governance: "Governança e sistema", reference: "Consultas",
} as const satisfies Record<NavigationGroup, string>
