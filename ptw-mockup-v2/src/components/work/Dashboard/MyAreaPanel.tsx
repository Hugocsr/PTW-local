import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { ArrowUpRightIcon, HourglassIcon, InboxIcon, PenLineIcon, PlayIcon, UserRoundIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cardsPerBlock, DASHBOARD_BLOCKS, EXPANDED_STEP, type DashboardBlock } from "@/core/dashboard"
import { mustActCount, waitingList, type WaitingItem, type WorkItem } from "@/core/myWork"
import { cn } from "@/lib/utils"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "../../shell/Page"
import { AssinarDialog } from "../AssinarDialog"
import { ResumeDialog } from "../ResumeDialog"
import { StopSheet } from "../StopSheet"
import { navigate, openPermit } from "../nav"
import { DownBanner } from "../state"
import { useMyWork } from "../useMyWork"
import { ActCard, DOWN_ID, FieldCard, WaitCard } from "./PermitCards"
import { ACCENT, EmptyBox, Panel, Tile, type Accent } from "./shared"

const BLOCK: Record<DashboardBlock, { title: string; hint: string; icon: LucideIcon; accent: Accent; empty: string }> = {
  "sua-vez": { title: "Sua vez", hint: "Ações que dependem de você", icon: PenLineIcon, accent: "pending", empty: "Nada esperando por você." },
  aguardando: { title: "Aguardando", hint: "Próximas ações de outras pessoas", icon: HourglassIcon, accent: "neutral", empty: "Nenhuma PT esperando outra pessoa." },
  "em-campo": { title: "Em campo", hint: "Suas PTs em acompanhamento", icon: PlayIcon, accent: "ok", empty: "Nenhuma PT sua em campo agora." },
}

const TABLET = "(min-width: 768px) and (max-width: 1023.98px)"
function useTablet() {
  return useSyncExternalStore((f) => { const m = window.matchMedia(TABLET); m.addEventListener("change", f); return () => m.removeEventListener("change", f) },
    () => window.matchMedia(TABLET).matches, () => false)
}

/** The work of the person, split in the three blocks, and the dialogs its buttons open. */
function useBlocks() {
  const work = useMyWork()
  const waiting = useMemo(() => waitingList(work), [work])
  const [signId, setSignId] = useState<string | null>(null)
  const [stopId, setStopId] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const act = (it: WorkItem) => (it.act === "retomar" ? setResumeId(it.permitId) : it.fill ? openPermit(it.permitId, "etapas") : setSignId(it.permitId))
  const counts: Record<DashboardBlock, number> = { "sua-vez": mustActCount(work), aguardando: waiting.length, "em-campo": work.emCampo.length }
  const cards = (b: DashboardBlock, n: number): ReactNode[] =>
    b === "sua-vez" ? work.agir.slice(0, n).map((it) => <li key={it.permitId}><ActCard item={it} onAct={act} /></li>)
    : b === "aguardando" ? waiting.slice(0, n).map((it: WaitingItem) => <li key={it.permitId}><WaitCard item={it} /></li>)
    : work.emCampo.slice(0, n).map((it) => <li key={it.permitId}><FieldCard item={it} onStop={setStopId} onAct={act} /></li>)
  const total: Record<DashboardBlock, number> = { "sua-vez": work.agir.length, aguardando: waiting.length, "em-campo": work.emCampo.length }
  const dialogs = <>
    <AssinarDialog permitId={signId} onClose={() => setSignId(null)} />
    <StopSheet permitId={stopId} onClose={() => setStopId(null)} />
    <ResumeDialog permitId={resumeId} onClose={() => setResumeId(null)} />
  </>
  return { counts, total, cards, dialogs }
}

/**
 * Painel "Minha Área" (SPEC 001): Sua vez, Aguardando, Em campo, each with its count and up to 3 cards (2
 * on a tablet); ↗ and "Ver todas" open the block expanded. Below lg the blocks sit side by side on a
 * tablet; on a phone Em campo comes first (safety before paperwork), as in the old Minha área.
 */
export function MyAreaPanel() {
  const sim = useSim()
  const tablet = useTablet()
  const { counts, total, cards, dialogs } = useBlocks()
  const n = cardsPerBlock(tablet ? "tablet" : "desktop")
  return (
    <Panel id="dash-minha-area" icon={UserRoundIcon} title="Minha Área" sub="Acompanhamento das suas atividades">
      <div className="grid min-w-0 gap-3 md:grid-cols-3 lg:grid-cols-1">
        {DASHBOARD_BLOCKS.map((b) => {
          const list = cards(b, n)
          const open = () => navigate(`dashboard/${b}`)
          return (
            <section key={b} id={`dash-${b}`} aria-labelledby={`dash-${b}-h`} className={cn("flex min-w-0 scroll-mt-20 flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4", b === "em-campo" && "max-md:order-first")}>
              <div className="flex items-start gap-3">
                <Tile icon={BLOCK[b].icon} accent={BLOCK[b].accent} size="lg" className="max-sm:size-10" />
                <h3 id={`dash-${b}-h`} className="min-w-0 flex-1 pt-1 type-section">{BLOCK[b].title}</h3>
                <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground hover:text-primary md:size-8" aria-label={`Ver todas: ${BLOCK[b].title}`} onClick={open}><ArrowUpRightIcon /></Button>
              </div>
              <div className="flex flex-col gap-0.5 border-b pb-3">
                <span className={cn("text-3xl leading-none font-bold tabular-nums", sim.serverDown ? "text-muted-foreground" : counts[b] > 0 ? ACCENT[BLOCK[b].accent].text : "text-foreground")}>
                  {sim.serverDown ? "—" : counts[b]}<span className="sr-only"> {sim.serverDown ? "contagem não verificável" : BLOCK[b].title}</span>
                </span>
                <span className="type-meta">{BLOCK[b].hint}</span>
              </div>
              {list.length ? <ul className="flex flex-col gap-2">{list}</ul> : <EmptyBox inline icon={InboxIcon} text={BLOCK[b].empty} />}
              {total[b] > n && <Button variant="outline" className="min-h-11 w-full md:min-h-9" onClick={open}>Ver todas <span className="type-meta tabular-nums">({total[b]})</span></Button>}
            </section>
          )
        })}
      </div>
      {dialogs}
    </Panel>
  )
}

/** `#dashboard/<bloco>`: one block with all its cards, "Mostrar mais" in steps of 30, back to the Dashboard. */
export function ExpandedBlock({ block }: { block: DashboardBlock }) {
  const sim = useSim()
  const { counts, total, cards, dialogs } = useBlocks()
  const [limit, setLimit] = useState(EXPANDED_STEP)
  const list = cards(block, limit)
  return (
    <Page>
      <PageHeader back={{ label: "Dashboard", onClick: () => navigate("dashboard") }} title={BLOCK[block].title} count={sim.serverDown ? undefined : counts[block]} meta={BLOCK[block].hint} />
      {sim.serverDown && <DownBanner id={DOWN_ID} now={sim.now} note="Assinar, entregar e retomar voltam com o servidor. Parar continua disponível." />}
      {list.length
        ? <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list}</ul>
        : <EmptyBox icon={InboxIcon} text={BLOCK[block].empty} />}
      {total[block] > limit && (
        <Button variant="outline" className="min-h-11 w-full sm:w-fit md:min-h-9" onClick={() => setLimit((l) => l + EXPANDED_STEP)}>
          Mostrar mais {Math.min(EXPANDED_STEP, total[block] - limit)}<span className="type-meta tabular-nums">· {limit} de {total[block]}</span>
        </Button>
      )}
      {dialogs}
    </Page>
  )
}
