import { useCallback, useEffect, useMemo, useRef } from "react"
import { AssetIcon, LocationIcon } from "@/components/shell/TypeIcon"
import { PlusIcon, CircleAlertIcon, LockIcon, PenLineIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONE_TEXT } from "../shell/Status"
import type { BoardRow } from "@/core/board"
import { equipmentHolders, nonHoldingVersionIds, partOfKindIds } from "@/core/equipmentLock"
import { byId } from "@/core/indexes"
import type { Permit } from "@/permit/types"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { PagedTable, useListState, type Column } from "../registry/DataTable"
import { useData, usePermitBoard } from "@/data/hooks"
import { Page, PageHeader } from "../shell/Page"
import { fmtRemaining, fmtWindow, minutesToEnd, permitName } from "@/core/permitFormat"
import { navigate, openPermit } from "./nav"
import { DownBanner, PermitStateBadge } from "./state"

/**
 * Who moves next. Mine: blue, "Você" in place of my name, with the pen (pending). Nobody eligible:
 * red (stop). Anyone else: plain text (neutral, waiting for someone else).
 */
function NextWho({ next, mine }: { next: string; mine: boolean }) {
  if (next === "—") return <>—</>
  const [who, ...rest] = next.split(" · ")
  if (mine) return <span className={cn("inline-flex items-center gap-1 font-medium", TONE_TEXT.pending)}><PenLineIcon className="size-3.5 shrink-0" aria-hidden />{["Você", ...rest].join(" · ")}</span>
  if (who === "Sem elegível") return <span className={cn("inline-flex items-center gap-1 font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />{next}</span>
  return <>{next}</>
}

type Row = BoardRow

const open = (id: string) => openPermit(id)

const SEGMENTS: { value: string; label: string }[] = [
  { value: "minhas", label: "Minhas ações" },
  { value: "andamento", label: "Em andamento" },
  { value: "preparacao", label: "Em preparação" },
  { value: "campo", label: "Em campo" },
  { value: "finalizadas", label: "Finalizadas" },
  { value: "rascunhos", label: "Meus rascunhos" },
]

/** Time left of an ativa: the only part of a row that follows the clock, so only it re-renders on the tick. */
function Remaining({ p }: { p: Permit }) {
  const sim = useSim()
  return p.state === "ativa" ? <>{fmtRemaining(minutesToEnd(p, sim.now))}</> : null
}
function StateCell({ p }: { p: Permit }) {
  const sim = useSim()
  return <PermitStateBadge state={p.state} unverifiable={sim.serverDown} />
}
const rowKey = (r: Row) => r.p.id
const onRowClick = (r: Row) => open(r.p.id)
const NOUN: [string, string] = ["PT", "PTs"]
const DEFAULT_SORT = { id: "state", dir: "asc" } as const
const PAGE_SIZES = [25, 50, 100]
const FILTER = { label: "Filtrar por situação", options: SEGMENTS }
const FILTER_NAMES = { segment: "segment" }

export function QuadroView({ segment }: { segment?: string } = {}) {
  const { state } = useRegistry()
  const { permits } = usePermits()
  const sim = useSim()
  const { whole } = useData()
  // The view (search, segment, sort, page) is the table's; the page of PTs comes from the data layer: computed here in memory, asked of the server otherwise.
  const list = useListState({ stateKey: "quadro", defaultSort: DEFAULT_SORT, defaultSegment: "andamento", pageSizes: PAGE_SIZES, filterNames: FILTER_NAMES, debounceMs: whole ? 0 : 300 })
  const board = usePermitBoard(list.view)
  // `#solicitacoes/rascunhos` (SPEC 014): the list opens on that segment.
  const setSeg = useRef(list.setSeg)
  useEffect(() => { setSeg.current = list.setSeg })
  useEffect(() => { if (segment) setSeg.current(segment) }, [segment])
  const { locations, templates, assets, relations, relationKinds } = state

  // My drafts whose equipment another open PT holds: Enviar is impossible until it is free.
  const held = useMemo(() => {
    const partOf = partOfKindIds(relationKinds), free = nonHoldingVersionIds(templates)
    return new Set(permits.filter((p) => p.state === "rascunho" && p.authorId === sim.personId && equipmentHolders(p, permits, relations, partOf, free).length > 0).map((p) => p.id))
  }, [permits, relations, relationKinds, templates, sim.personId])

  const assetCodes = useCallback((p: Permit) => {
    const codes = p.assetIds.map((id) => byId(assets, id)?.code ?? id)
    return codes.length > 1 ? `${codes[0]} +${codes.length - 1}` : codes[0]
  }, [assets])
  const locCode = useCallback((p: Permit) => byId(locations, p.locationId)?.code ?? p.locationId, [locations])

  // Built once per data change, not per tick: the cells that follow the clock are their own components.
  const columns = useMemo<Column<Row>[]>(() => [
    {
      id: "number", header: "PT", sortable: true, className: "whitespace-normal lg:max-w-88",
      // Narrow screens hide columns, so what matters from them moves under the name: the window
      // (with the time left of an ativa) below 640 px, who acts next below 1024 px.
      cell: ({ p, next, mine }) => (
        <>
          <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-sm text-left font-medium md:min-h-0 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={(e) => { e.stopPropagation(); open(p.id) }}>
            {permitName(p)}{p.number && <span className="type-meta font-normal">r{p.revision}</span>}
            {held.has(p.id) && <LockIcon className={cn("size-4", TONE_TEXT.stop)} role="img" aria-label="Equipamento com outra PT aberta: não dá para enviar" />}
          </button>
          {p.scope && <span className="line-clamp-2 type-body text-muted-foreground">{p.scope}</span>}
          <span className="flex flex-col type-meta sm:hidden">
            <span className="tabular-nums">{fmtWindow(p)}{p.state === "ativa" && <> · <Remaining p={p} /></>}</span>
          </span>
          {next !== "—" && <span className="flex flex-wrap items-center gap-x-1 type-meta lg:hidden">Próximo: <NextWho next={next} mine={mine} /></span>}
        </>
      ),
    },
    { id: "state", header: "Estado", sortable: true, cell: ({ p }) => <StateCell p={p} /> },
    // One "where" column: the asset on top, its place under it. Two code columns side by side read as noise.
    {
      id: "location", header: "Ativo · Local", className: "hidden xl:table-cell", sortable: true,
      cell: ({ p }) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5 type-data text-foreground"><AssetIcon id={p.assetIds[0]} className="size-3.5" />{assetCodes(p)}</span>
          <span className="flex items-center gap-1.5 type-data text-muted-foreground"><LocationIcon id={p.locationId} className="size-3.5" />{locCode(p)}</span>
        </span>
      ),
    },
    { id: "template", header: "Modelo", className: "hidden 2xl:table-cell min-w-40 whitespace-normal", sortable: true, cell: ({ tpl, ver }) => `${tpl.name} v${ver.number}` },
    {
      id: "windowStart", header: "Janela", className: "hidden sm:table-cell", sortable: true,
      cell: ({ p }) => (
        <span className="flex flex-col tabular-nums">
          {fmtWindow(p)}
          {p.state === "ativa" && <span className="type-meta"><Remaining p={p} /></span>}
        </span>
      ),
    },
    { id: "next", header: "Próximo", className: "hidden lg:table-cell min-w-36 whitespace-normal", cell: ({ next, mine }) => <NextWho next={next} mine={mine} /> },
  ], [held, assetCodes, locCode])

  return (
    // Model A (Lista): header with the collection total, then the toolbar and the table, full frame width.
    <Page>
      <PageHeader title="Solicitações de PT" count={board.all} actions={{ primary: { label: "Nova PT", icon: PlusIcon, onClick: () => navigate("nova-pt"), disabled: sim.serverDown } }} />
      {sim.serverDown && <DownBanner now={sim.now} />}
      {/* Every prop stable (module constants, memos): the table skips the clock's tick. */}
      <PagedTable<Row>
        list={list}
        data={board}
        rowKey={rowKey}
        columns={columns}
        noun={NOUN}
        searchLabel="Buscar PT, ativo, local ou pessoa"
        onRowClick={onRowClick}
        filter={FILTER}
        pageSizes={PAGE_SIZES}
      />
    </Page>
  )
}
