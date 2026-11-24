import { useCallback, useMemo } from "react"
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react"
import { attrText, protectionOf } from "@/core/assetAttrs"
import { childLocations, equipmentForest, locationKind, matches, plantsOf, visibleLocations, type EquipNode, type NodeKind } from "@/core/assetTree"
import { useAssetSearch, useData, useLocationAssetCounts, useLocationAssets } from "@/data/hooks"
import { useRegistry } from "@/registry/store"
import type { Asset, Location } from "@/registry/types"
import { cn } from "@/lib/utils"
import { KIND, ProtectedIcon } from "./shared"

export interface TreeSelection { kind: NodeKind; id: string }

interface TreeProps {
  query: string
  selected: string | null
  expanded: ReadonlySet<string>
  onSelect: (s: TreeSelection) => void
  onToggle: (id: string, open?: boolean) => void
  /** `child id → parent id` by "é parte de" (whole: relations are reference data). */
  parents: ReadonlyMap<string, string>
}

const INDENT = 1.9 // rem per level (SGI · Árvore de ativos)
const NO_ASSETS: Asset[] = []
const locText = (l: Location) => [attrText(l.attrs, "tplnr"), attrText(l.attrs, "werks")]
const assetText = (a: Asset) => [a.code, a.name, ...a.aliases, attrText(a.attrs, "equnr"), attrText(a.attrs, "tplnr")]

/**
 * The tree of Gestão de Ativos: plants, their areas, the equipment of each area and the equipment nested in
 * it. Locations are whole in every mode; the equipment of a place is read when the place opens (the server
 * gives one page per place), so a plant with thousands of assets costs only what is open.
 */
export function AssetTree({ query, selected, expanded, onSelect, onToggle, parents }: TreeProps) {
  const { state } = useRegistry()
  const searching = query.trim().length > 0
  const skip = useCallback(() => false, [])
  const port = useData()
  // The server searches its own index (tag, name, EQUNR, TPLNR); in memory the same texts are matched here.
  const remote = useAssetSearch(searching && !port.whole ? query : "", 100, skip)
  const hits = useMemo(() => (!searching ? [] : port.whole ? state.assets.filter((a) => matches(query, ...assetText(a))) : remote.items), [searching, port.whole, state.assets, query, remote.items])
  const visible = useMemo(() => visibleLocations(state.locations, query, hits, locText), [state.locations, query, hits])
  const plants = plantsOf(state.locations).filter((p) => !visible || visible.has(p.id))
  const areaIds = useMemo(() => state.locations.filter((l) => l.parentId !== null).map((l) => l.id), [state.locations])
  const counts = useLocationAssetCounts(areaIds)

  if (state.locations.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {searching && !port.whole && remote.loading && <p role="status" className="flex items-center gap-2 px-3 py-1 type-meta"><LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />Buscando equipamentos…</p>}
      {plants.length === 0
        ? <p role="status" className="px-3 py-6 text-center type-meta">Nada encontrado para “{query.trim()}”.</p>
        : (
          <ul role="tree" aria-label="Plantas, áreas e equipamentos" className="flex flex-col gap-0.5">
            {plants.map((p) => <LocationItem key={p.id} loc={p} depth={0} {...{ query, selected, expanded, onSelect, onToggle, parents, visible, counts: counts.counts }} />)}
          </ul>
        )}
    </div>
  )
}

interface ItemProps extends Omit<TreeProps, "parents"> {
  parents: ReadonlyMap<string, string>
  depth: number
  visible: Set<string> | null
}

function LocationItem({ loc, depth, counts, ...p }: ItemProps & { loc: Location; counts: Map<string, number> }) {
  const { state } = useRegistry()
  const port = useData()
  const kind = locationKind(loc, state.locationTypes)
  const children = childLocations(state.locations, loc.id).filter((c) => !p.visible || p.visible.has(c.id))
  const open = p.expanded.has(loc.id) || (!!p.visible && p.query.trim().length > 0)
  // Plants count their areas; areas count their equipment (top level in memory, everything under it from the server).
  const whole = port.whole
  const here = whole ? equipmentForest(state.assets, loc.id, p.parents).length : counts.get(loc.id)
  const count = kind === "planta" ? children.length : here
  const canOpen = kind === "planta" ? children.length > 0 : children.length > 0 || (count ?? 1) > 0
  return (
    <li role="treeitem" aria-expanded={canOpen ? open : undefined} aria-selected={p.selected === loc.id}>
      <Row kind={kind} depth={depth} name={loc.name} inactive={loc.status === "inativo"} selected={p.selected === loc.id} open={open} canOpen={canOpen}
        count={count} onSelect={() => { p.onSelect({ kind, id: loc.id }); if (!open) p.onToggle(loc.id, true) }} onToggle={() => p.onToggle(loc.id)} />
      {open && (
        <ul role="group" className="flex flex-col gap-0.5">
          {children.map((c) => <LocationItem key={c.id} loc={c} depth={depth + 1} counts={counts} {...p} />)}
          {kind === "area" || children.length === 0 ? <Equipment locationId={loc.id} showAll={matches(p.query, loc.name, loc.code, ...loc.aliases, ...locText(loc))} depth={depth + 1} {...p} /> : null}
        </ul>
      )}
    </li>
  )
}

/** The equipment of one place (read now: the place is open). */
function Equipment({ locationId, showAll, depth, ...p }: Omit<ItemProps, "depth"> & { locationId: string; showAll: boolean; depth: number }) {
  const port = useData()
  const { state } = useRegistry()
  const remote = useLocationAssets(port.whole ? "" : locationId)
  const assets = port.whole ? state.assets : remote.items ?? NO_ASSETS
  const forest = useMemo(() => equipmentForest(assets, locationId, p.parents), [assets, locationId, p.parents])
  const shown = useMemo(() => (showAll ? forest : filterForest(forest, p.query)), [forest, p.query, showAll])
  if (!port.whole && remote.loading && forest.length === 0) return <li role="none" className="py-1 type-meta" style={{ paddingLeft: `${depth * INDENT + 2.25}rem` }}>Carregando equipamentos…</li>
  if (!port.whole && remote.error) return <li role="none" className="py-1 type-meta" style={{ paddingLeft: `${depth * INDENT + 2.25}rem` }}>Não foi possível ler os equipamentos: {remote.error.message}</li>
  return <>{shown.map((n) => <EquipItem key={n.asset.id} node={n} depth={depth} {...p} />)}</>
}

/** With a search, keep the equipment that matches and the ones above a match. */
function filterForest(forest: EquipNode[], q: string): EquipNode[] {
  if (!q.trim()) return forest
  const out: EquipNode[] = []
  for (const n of forest) {
    const kids = filterForest(n.children, q)
    if (kids.length || matches(q, ...assetText(n.asset))) out.push({ asset: n.asset, children: matches(q, ...assetText(n.asset)) ? n.children : kids })
  }
  return out
}

function EquipItem({ node, depth, ...p }: Omit<ItemProps, "depth"> & { node: EquipNode; depth: number }) {
  const a = node.asset
  const has = node.children.length > 0
  const open = p.expanded.has(a.id) || (has && p.query.trim().length > 0)
  return (
    <li role="treeitem" aria-expanded={has ? open : undefined} aria-selected={p.selected === a.id}>
      <Row kind="equip" depth={depth} name={a.name} inactive={a.status === "inativo"} selected={p.selected === a.id} open={open} canOpen={has}
        count={has ? node.children.length : undefined} guarded={!!protectionOf(a.attrs)}
        onSelect={() => { p.onSelect({ kind: "equip", id: a.id }); if (has && !open) p.onToggle(a.id, true) }} onToggle={() => p.onToggle(a.id)} />
      {open && has && <ul role="group" className="flex flex-col gap-0.5">{node.children.map((c) => <EquipItem key={c.asset.id} node={c} depth={depth + 1} {...p} />)}</ul>}
    </li>
  )
}

function Row({ kind, depth, name, inactive, selected, open, canOpen, count, guarded, onSelect, onToggle }: {
  kind: NodeKind; depth: number; name: string; inactive: boolean; selected: boolean; open: boolean; canOpen: boolean
  count?: number; guarded?: boolean; onSelect: () => void; onToggle: () => void
}) {
  const Icon = KIND[kind].icon
  return (
    <div className={cn("group flex min-h-11 items-center gap-1 rounded-md pr-2 transition-colors motion-fast md:min-h-9",
      selected ? "bg-primary-soft" : "hover:bg-surface-canvas")} style={{ paddingLeft: `${depth * INDENT + 0.25}rem` }}>
      {canOpen
        ? <button type="button" aria-label={open ? `Recolher ${name}` : `Expandir ${name}`} onClick={onToggle}
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-ring">
            <ChevronRightIcon className={cn("size-4 transition-transform motion-fast", open && "rotate-90")} aria-hidden />
          </button>
        : <span aria-hidden className="flex size-7 shrink-0 items-center justify-center"><span className="size-1 rounded-full bg-border-strong" /></span>}
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={cn("flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left text-sm focus-ring", selected ? "font-semibold text-primary-hover" : "font-medium text-foreground", inactive && !selected && "text-muted-foreground")}>
        <Icon aria-hidden className={cn("size-4 shrink-0", inactive ? "text-muted-foreground" : KIND[kind].text)} />
        <span className="min-w-0 truncate" title={name}>{name}</span>
        {inactive && <span className="sr-only"> (inativo)</span>}
      </button>
      {guarded && <ProtectedIcon aria-label="Dispositivo de proteção" className="size-3.5 shrink-0 text-kind-equip" />}
      {count !== undefined && <span className="min-w-5 shrink-0 rounded-full bg-muted px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-muted-foreground tabular-nums" aria-label={`${count} itens`}>{count}</span>}
    </div>
  )
}
