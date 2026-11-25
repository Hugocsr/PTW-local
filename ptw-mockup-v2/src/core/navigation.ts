/** Canonical destinations; navigation never grants permission to write or sign. */
/** "dashboard" joins Minha área and Desabilitados agora (SPEC 001); old routes are aliases in App. */
/** "grupos" and "perfis" (SPEC 002) form the SGI "Acesso" section: groups grant access profiles to their members. */
/** "ativos" is Gestão de Ativos (SGI): plants, areas and equipment on one screen; the old "locais" route opens it. */
export const NAVIGATION_VIEWS = ["dashboard", "quadro", "ativos", "pessoas", "grupos", "perfis", "modelos", "tipos", "listas", "identidade", "delegacoes", "auditoria"] as const
export type NavigationView = typeof NAVIGATION_VIEWS[number]
export interface NavigationAccess { canEditRegistry: boolean; canEditModels: boolean; canAudit: boolean; canExport: boolean }
export const NAVIGATION_GROUPS = ["operation", "registry", "access", "configuration", "governance", "reference"] as const
export type NavigationGroup = typeof NAVIGATION_GROUPS[number]
export interface NavigationSection { group: NavigationGroup; views: NavigationView[] }

/** Reference reads remain available to signed-in people; restricted views keep their own grant. */
export function canReadView(view: NavigationView, access: NavigationAccess): boolean {
  switch (view) {
    case "dashboard": case "quadro":
    case "ativos": case "pessoas": case "perfis": case "modelos": case "tipos": case "listas": return true
    case "auditoria": return access.canAudit
    case "identidade": return access.canEditModels
    case "grupos": return access.canEditRegistry
    case "delegacoes": return true
    default: return false
  }
}

/** A destination appears once, as management or consultation, according to its existing domain grant. */
export function navigationGroup(view: NavigationView, access: NavigationAccess): NavigationGroup | null {
  if (!canReadView(view, access)) return null
  switch (view) {
    case "dashboard": case "quadro": return "operation"
    case "ativos": case "pessoas": return access.canEditRegistry ? "registry" : "reference"
    case "perfis": return access.canEditRegistry ? "access" : "reference"
    case "modelos": return access.canEditModels ? "configuration" : "reference"
    case "tipos": case "listas": return access.canEditRegistry ? "configuration" : "reference"
    case "auditoria": return "governance"
    case "identidade": return "configuration"
    case "grupos": return "access"
    case "delegacoes": return "governance"
    default: return null
  }
}

/** Sidebar, search and direct routes share the same read policy. */
export function visibleViews(access: NavigationAccess): NavigationView[] {
  return NAVIGATION_VIEWS.filter((view) => canReadView(view, access))
}

/** Ordered, nonempty sections for the current session, independent of the active destination. */
export function navigationSections(access: NavigationAccess): NavigationSection[] {
  const views = visibleViews(access)
  return NAVIGATION_GROUPS.map((group) => ({ group, views: views.filter((view) => navigationGroup(view, access) === group) })).filter((section) => section.views.length > 0)
}
