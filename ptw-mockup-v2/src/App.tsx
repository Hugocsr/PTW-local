import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/shell/AppSidebar"
import { ResourceFooter } from "@/components/shell/ResourceFooter"
import { NAV, NAV_GROUP_LABELS, type ViewKey } from "@/components/shell/nav"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { RegistryProvider, useRegistry } from "@/registry/store"
import { PermitProvider, usePermits } from "@/permit/store"
import { SimProvider, useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { DataProvider, useData, useDataMode } from "@/data/context"
import { AuditProvider } from "@/audit/store"
import { QuadroView } from "@/components/work/QuadroView"
import { DashboardView } from "@/components/work/Dashboard/DashboardView"
import { dashboardTab, legacyDashboardHash } from "@/core/dashboard"
import { useMyWork } from "@/components/work/useMyWork"
import { mustActCount } from "@/core/myWork"
import { PermitDetailView } from "@/components/work/PermitDetailView"
import { SimControl } from "@/components/work/SimControl"
import { CommandPalette } from "@/components/shell/CommandPalette"
import { permitName } from "@/core/permitFormat"
import { useIsMobile } from "@/hooks/use-mobile"
import { LoginView } from "@/components/shell/LoginView"
import { WallView } from "@/components/work/WallView"
import { NewPermitView } from "@/components/work/NewPermitView"
import { canReadView, navigationGroup } from "@/core/navigation"
import { toast } from "sonner"

/* Cadastro and Configuração load on first visit; the work screens ship in the main bundle. */
const LocationDetailView = lazy(() => import("@/components/registry/HierarchyView").then((m) => ({ default: m.LocationDetailView })))
const AssetDetailView = lazy(() => import("@/components/registry/AssetsView").then((m) => ({ default: m.AssetDetailView })))
const AssetManagementView = lazy(() => import("@/components/registry/AssetManagement").then((m) => ({ default: m.AssetManagementView })))
const PersonDetailView = lazy(() => import("@/components/registry/PeopleView").then((m) => ({ default: m.PersonDetailView })))
const PeopleView = lazy(() => import("@/components/registry/PeopleView").then((m) => ({ default: m.PeopleView })))
const TemplatesView = lazy(() => import("@/components/registry/TemplatesView").then((m) => ({ default: m.TemplatesView })))
const TypesView = lazy(() => import("@/components/registry/TypesView").then((m) => ({ default: m.TypesView })))
const AuditView = lazy(() => import("@/components/audit/AuditView").then((m) => ({ default: m.AuditView })))
const ListsView = lazy(() => import("@/components/registry/ListsView").then((m) => ({ default: m.ListsView })))
const AppearanceView = lazy(() => import("@/components/registry/AppearanceView").then((m) => ({ default: m.AppearanceView })))
const GroupsView = lazy(() => import("@/components/registry/GroupsView").then((m) => ({ default: m.GroupsView })))
const DelegationsView = lazy(() => import("@/components/registry/DelegationsView").then((m) => ({ default: m.DelegationsView })))

/** Screen per route; titles, groups and icons live in the menu table (`shell/nav.ts`). */
const VIEWS = {
  dashboard: DashboardView, quadro: QuadroView, ativos: AssetManagementView,
  pessoas: PeopleView, modelos: TemplatesView, tipos: TypesView, listas: ListsView, auditoria: AuditView, identidade: AppearanceView, grupos: GroupsView, delegacoes: DelegationsView,
} satisfies Record<ViewKey, unknown>

/**
 * `#quadro`, … `#pt/<permitId>/<tab>`, `#ativos/<id>` (Gestão de Ativos with a plant, area or equipment
 * open), `#pessoas/<id>`; `#ativo/<id>` and `#local/<id>` are the full page of one asset or place
 * (relations, people, history), opened from Gestão de Ativos.
 */
type Route = { view: ViewKey; permitId?: string; tab?: string; recordId?: string; newPermit?: boolean; page?: "ativo" | "local" }
/** Old names: Locais is part of Gestão de Ativos (SGI). Minha área, Pendências, Campo and Desabilitados are the Dashboard (SPEC 001, legacyDashboardHash). */
const ALIAS: Record<string, string> = { locais: "ativos" }
const fromHash = (): Route => {
  const [head, id, tab] = window.location.hash.slice(1).split("/")
  if (head === "nova-pt") return { view: "quadro", newPermit: true }
  if (head === "pt" && id) return { view: "quadro", permitId: id, tab: tab ?? "etapas" }
  const legacy = legacyDashboardHash(head, id)
  if (legacy) { const [, t] = legacy.split("/"); return { view: "dashboard", tab: t } }
  if (head === "dashboard") return { view: "dashboard", tab: dashboardTab(id) }
  // "#auditoria/pt/<id>": Auditoria filtered by one PT (from its Histórico).
  if (head === "auditoria") return id === "pt" && tab ? { view: "auditoria", tab: `pt/${tab}` } : { view: "auditoria" }
  // One asset or one place on its own page; an id that matches nothing shows "não encontrado" there.
  if ((head === "ativo" || head === "local") && id) return { view: "ativos", recordId: id, page: head }
  if ((head === "ativos" || head === "locais") && id) return { view: "ativos", recordId: id }
  if (head === "pessoas" && id) return { view: head, recordId: id }
  const key = ALIAS[head] ?? head
  return { view: key in VIEWS ? (key as ViewKey) : "dashboard" }
}
/** The one spelling of a route; unknown, aliased or over-long hashes are rewritten to it. */
const canonical = (r: Route) => r.newPermit ? "nova-pt" : r.page && r.recordId ? `${r.page}/${r.recordId}` : r.recordId ? `${r.view}/${r.recordId}` : r.permitId ? `pt/${r.permitId}/${r.tab ?? "etapas"}` : r.view === "dashboard" && r.tab ? `dashboard/${r.tab}` : r.view === "auditoria" && r.tab ? `auditoria/${r.tab}` : r.view
const normalize = (): Route => {
  const r = fromHash()
  const want = `#${canonical(r)}`
  if (window.location.hash !== want) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${want}`)
  return r
}

const go = (k: ViewKey) => { window.location.hash = k }

function Shell() {
  const [route, setRoute] = useState<Route>(normalize)
  const demo = useDataMode() === "memoria"
  const { state } = useRegistry()
  const { permits } = usePermits()
  const work = useMyWork()
  const mobile = useIsMobile()
  const access = useSim()
  const routeAllowed = canReadView(route.view, access)
  const group = navigationGroup(route.view, access)
  const previousRead = useRef<{ view: ViewKey; allowed: boolean } | null>(null)
  useEffect(() => {
    const previous = previousRead.current
    previousRead.current = { view: route.view, allowed: routeAllowed }
    if (previous?.view === route.view && previous.allowed && !routeAllowed) {
      go("dashboard")
      toast.error("Seu acesso a esta tela foi alterado. Você voltou para o Dashboard.")
    }
  }, [route.view, routeAllowed])
  useEffect(() => {
    const on = () => setRoute(normalize())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  const current = NAV[route.view]
  const View = VIEWS[route.view]
  const permit = route.permitId ? permits.find((p) => p.id === route.permitId) : undefined
  // The open record on Ativos/Locais detail, like the PT number (code · name).
  const record = route.recordId && route.view === "ativos" ? state.assets.find((r) => r.id === route.recordId) ?? state.locations.find((r) => r.id === route.recordId) : undefined
  const person = route.recordId && route.view === "pessoas" ? state.people.find((p) => p.id === route.recordId) : undefined
  const recordLabel = person ? person.name : record ? `${record.code} · ${record.name}` : undefined

  return (
    <SidebarProvider className="app-shell">
      <AppSidebar active={route.view} unit={state.units[0]?.name ?? "Unidade"} agir={mustActCount(work)} onGo={go} />
      <SidebarInset className="min-w-0 bg-surface-canvas print:bg-white">
        <a href="#workspace-content" onClick={(e) => { e.preventDefault(); document.getElementById("workspace-content")?.focus() }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-3 focus:shadow-elev-3">Ir para o conteúdo</a>
        <header className="sticky top-0 z-20 flex min-h-16 shrink-0 print:hidden items-center gap-2 border-b bg-background px-4 lg:gap-4 lg:px-6">
          <SidebarTrigger aria-label="Alternar menu" className="size-11" />
          <Separator orientation="vertical" className="hidden h-5 xl:block" />
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">
              {group && <><BreadcrumbItem className="hidden 2xl:inline-flex">{NAV_GROUP_LABELS[group]}</BreadcrumbItem><BreadcrumbSeparator className="hidden 2xl:block" /></>}
              <BreadcrumbItem className="min-w-0">
                {route.permitId || route.recordId
                  ? <BreadcrumbLink asChild><button type="button" className="min-h-11 whitespace-nowrap md:min-h-9" onClick={() => go(route.view)}>{current.title}</button></BreadcrumbLink>
                  : <BreadcrumbPage className="truncate">{current.title}</BreadcrumbPage>}
              </BreadcrumbItem>
              {route.permitId && (<><BreadcrumbSeparator /><BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{permit ? permitName(permit) : "PT"}</BreadcrumbPage></BreadcrumbItem></>)}
              {route.recordId && (<><BreadcrumbSeparator /><BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{recordLabel ?? "Não encontrado"}</BreadcrumbPage></BreadcrumbItem></>)}
            </BreadcrumbList>
          </Breadcrumb>
          {demo && <span className="ml-auto rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">Demonstração</span>}
          <CommandPalette />
          <SimControl />
        </header>
        {/* Padding only: each screen owns its frame through <Page> (72rem, shell/Page.tsx). */}
        <main id="workspace-content" tabIndex={-1} className="flex w-full min-w-0 flex-col gap-4 px-4 pt-5 pb-8 outline-none md:px-6 md:pt-6 lg:px-8">
          <Suspense fallback={<p className="type-meta" role="status">Carregando…</p>}>
            {!routeAllowed ? <Page><PageHeader title="Acesso não disponível" /><p className="type-body">Sua conta não tem acesso a esta tela.</p><a href="#dashboard" className="type-body underline underline-offset-2">Voltar para o Dashboard</a></Page> : route.newPermit ? <NewPermitView /> : route.permitId ? <PermitDetailView id={route.permitId} tab={route.tab ?? "etapas"} /> : route.recordId ? (route.page === "ativo" ? <AssetDetailView id={route.recordId} /> : route.page === "local" ? <LocationDetailView id={route.recordId} /> : route.view === "pessoas" ? <PersonDetailView id={route.recordId} /> : <AssetManagementView recordId={route.recordId} />) : route.view === "dashboard" ? <DashboardView tab={route.tab} /> : route.view === "auditoria" ? <AuditView key={route.tab ?? ""} permitFilter={route.tab?.slice(3)} /> : <View />}
          </Suspense>
        </main>
        {!demo && <ResourceFooter />}
      </SidebarInset>
      {/* On a phone the bottom edge holds the sheet actions and the bottom bar. */}
      <Toaster position={mobile ? "top-center" : "bottom-right"} />
    </SidebarProvider>
  )
}

/** A session is opened only after its reference data and work have arrived. */
function Gate() {
  const { session } = useData()
  const status = useSyncExternalStore(session.subscribe, () => session.get().status)
  const wall = useSyncExternalStore((f) => { window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f) }, () => window.location.hash === "#parede")
  return status !== "aberta" ? <LoginView /> : wall ? <WallView /> : <Shell />
}

export function App() {
  return (
    <TooltipProvider>
      <DataProvider>
        <SimProvider>
          <AuditProvider>
            <RegistryProvider>
              <PermitProvider><Gate /></PermitProvider>
            </RegistryProvider>
          </AuditProvider>
        </SimProvider>
      </DataProvider>
    </TooltipProvider>
  )
}

export default App
