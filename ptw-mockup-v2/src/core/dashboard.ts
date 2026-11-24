/**
 * Dashboard (SPEC 001): one page with the panels "Desabilitados agora" and "Minha Área". Pure rules for
 * its routes and limits; the screens live in components/work/Dashboard.
 */

/** Blocks of Minha Área, in the desktop order. On a phone Em campo comes first (safety before paperwork). */
export const DASHBOARD_BLOCKS = ["sua-vez", "aguardando", "em-campo"] as const
export type DashboardBlock = (typeof DASHBOARD_BLOCKS)[number]
export const BLOCK_TITLE: Record<DashboardBlock, string> = { "sua-vez": "Sua vez", aguardando: "Aguardando", "em-campo": "Em campo" }

/** Groups of "Detalhamento das proteções" (core/bypass groups). */
export const PROTECTION_GROUPS = ["vigor", "reabilitar", "aprovacao"] as const
export type ProtectionGroup = (typeof PROTECTION_GROUPS)[number]

/**
 * What `#dashboard/<tab>` shows:
 * - none: the page;
 * - "eu": Seus cargos e conta;
 * - a block: that block expanded (all its cards);
 * - "pts" / "protecoes": the page scrolled to Aguardando / to the protections panel.
 */
export type DashboardTab = undefined | "eu" | DashboardBlock | "pts" | "protecoes"
const TABS = new Set<string>(["eu", "pts", "protecoes", ...DASHBOARD_BLOCKS])
export const dashboardTab = (tab: string | undefined): DashboardTab => (tab && TABS.has(tab) ? (tab as DashboardTab) : undefined)
export const isBlock = (tab: DashboardTab): tab is DashboardBlock => (DASHBOARD_BLOCKS as readonly string[]).includes(tab ?? "")

/**
 * Old routes keep working (favourites, links in e-mails): the hash they lead to now, or null when the
 * route is not an old one. `#minha-area/pts` lands on Aguardando, `#desabilitados` on the protections.
 */
export function legacyDashboardHash(head: string, id?: string): string | null {
  switch (head) {
    case "minha-area": return id === "eu" ? "dashboard/eu" : id === "pts" ? "dashboard/pts" : "dashboard"
    case "pendencias": case "campo": return "dashboard"
    case "desabilitados": return "dashboard/protecoes"
    default: return null
  }
}

/** Cards each block shows before "Ver todas": 3 on desktop and phone, 2 on tablet (three blocks side by side). */
export function cardsPerBlock(layout: "desktop" | "tablet" | "phone"): number {
  return layout === "tablet" ? 2 : 3
}

/** Step of "Mostrar mais" in the expanded block. */
export const EXPANDED_STEP = 30

/** Every group starts open: with items, to show them; empty, to show its empty state (prototype). */
export function initialOpenGroups(): Record<ProtectionGroup, boolean> {
  return { vigor: true, reabilitar: true, aprovacao: true }
}
