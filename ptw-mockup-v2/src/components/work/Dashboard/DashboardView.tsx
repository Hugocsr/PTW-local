import { useEffect } from "react"
import { LayoutGridIcon, PlusIcon, ShieldCheckIcon } from "lucide-react"
import { dashboardTab, isBlock } from "@/core/dashboard"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "../../shell/Page"
import { CargosView } from "../CargosView"
import { navigate } from "../nav"
import { DownBanner } from "../state"
import { ExpandedBlock, MyAreaPanel } from "./MyAreaPanel"
import { Bloqueios, CargoAvisos, RascunhosAviso, useMyRoles } from "./Notices"
import { DOWN_ID } from "./PermitCards"
import { ProtectionsPanel } from "./ProtectionsPanel"
import { Tile } from "./shared"

/**
 * Dashboard (`#dashboard`, SPEC 001): "Minha área" and "Desabilitados agora" on one page. Header with
 * Nova PT and "Seus cargos e conta" (⋯), then the notices (server, cargo blocks, cargos expiring), then
 * the two panels: Desabilitados agora (≈ 2/3) and Minha Área (≈ 1/3) side by side from lg; below lg one
 * column with Minha Área first. `#dashboard/eu` is Seus cargos e conta, `#dashboard/<bloco>` one block
 * expanded, `#dashboard/pts` and `#dashboard/protecoes` scroll to Aguardando / to the protections.
 */
export function DashboardView({ tab: raw }: { tab?: string }) {
  const tab = dashboardTab(raw)
  if (tab === "eu") return <CargosView />
  if (isBlock(tab)) return <ExpandedBlock block={tab} />
  return <Dashboard scrollTo={tab === "pts" ? "dash-aguardando" : tab === "protecoes" ? "dash-protecoes" : undefined} />
}

function Dashboard({ scrollTo }: { scrollTo?: string }) {
  const sim = useSim()
  const { me } = useMyRoles()
  useEffect(() => { if (scrollTo) requestAnimationFrame(() => document.getElementById(scrollTo)?.scrollIntoView({ block: "start" })) }, [scrollTo])
  return (
    <Page className="max-w-[90rem]">
      <PageHeader
        title={<span className="flex items-center gap-3"><Tile icon={LayoutGridIcon} accent="brand" className="max-sm:hidden" />Dashboard</span>}
        meta="Visão geral das operações e Permissões de Trabalho"
        actions={{
          primary: { label: "Nova PT", icon: PlusIcon, onClick: () => navigate("nova-pt"), disabled: sim.serverDown },
          menu: me ? [{ label: "Seus cargos e conta", icon: ShieldCheckIcon, onClick: () => navigate("dashboard/eu") }] : [],
        }} />
      {sim.serverDown && <DownBanner id={DOWN_ID} now={sim.now} note="Assinar, entregar e retomar voltam com o servidor. Parar continua disponível." />}
      <Bloqueios />
      <CargoAvisos />
      <RascunhosAviso />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] lg:gap-5">
        <MyAreaPanel />
        <div className="min-w-0 lg:order-first"><ProtectionsPanel /></div>
      </div>
    </Page>
  )
}
