/**
 * What the screens ask the data layer beyond the four stores:
 *
 * - `usePermitActs()`: the PT acts as promises of the final answer (decision D4: a dialog waits for the
 *   server before it closes). In memory they are already settled.
 * - the query hooks (A18): lists that the server filters, sorts and pages. While the cache is whole
 *   (memory) they answer in the render from the stores, with the very matching the screen does today, so
 *   the rows and their order do not change and nothing shows "carregando"; otherwise they ask
 *   `DataPort.queries` and keep the last page while the next one loads.
 */
import { useEffect, useMemo, useState } from "react"
import type { AuditEvent } from "@/core/audit"
import { boardRows, createBoardCache, type BoardRow } from "@/core/board"
import { accountEpoch } from "@/core/indexes"
import type { RuleError } from "@/core/ptwErrors"
import { useAudit } from "@/audit/store"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import type { Asset } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { useCell, useData } from "./context"
import { assetLocal, assetsUnder, auditFacetsOf, auditPageOf, auditRows, boardLocal, pageOf } from "./memory/query"
import type { AuditFacets, AuditQuery, EquipmentHold, ListLocal, ListView, Page, PermitAct } from "./port"

export { useData, useDataMode } from "./context"
export { useAppearance } from "./useAppearance"
export { useGroups } from "./useGroups"
export { useDelegations } from "./useDelegations"

/* ---------- acts that can be awaited ---------- */

type Args<K extends PermitAct["kind"]> = Omit<Extract<PermitAct, { kind: K }>, "kind">
export interface PermitActs {
  /** Assinar; on a rascunho or devolvida, Enviar / Reenviar. */
  sign(a: Args<"sign">): Promise<RuleError | null>
  /** Devolver. */
  refuse(a: Args<"refuse">): Promise<RuleError | null>
  /** Parar. */
  stop(a: Args<"stop">): Promise<RuleError | null>
  /** Retomar. */
  resume(a: Args<"resume">): Promise<RuleError | null>
  /** Prorrogar. */
  extend(a: Args<"extend">): Promise<RuleError | null>
  revalidate(a: Args<"revalidate">): Promise<RuleError | null>
  /** One answer of the form (null removes it). */
  answer(a: Args<"answer">): Promise<RuleError | null>
}

/**
 * The PT acts, each resolving with null when written or with the refusal (the core's, known at once, or
 * the server's). The caller shows the refusal (`toastFor`) and keeps its dialog open until then.
 */
export function usePermitActs(): PermitActs {
  const { permits } = useData()
  return useMemo<PermitActs>(() => ({
    sign: (a) => permits.act({ kind: "sign", ...a }).done,
    refuse: (a) => permits.act({ kind: "refuse", ...a }).done,
    stop: (a) => permits.act({ kind: "stop", ...a }).done,
    resume: (a) => permits.act({ kind: "resume", ...a }).done,
    extend: (a) => permits.act({ kind: "extend", ...a }).done,
    revalidate: (a) => permits.act({ kind: "revalidate", ...a }).done,
    answer: (a) => permits.act({ kind: "answer", ...a }).done,
  }), [permits])
}

/* ---------- reads that may come from the server ---------- */

export interface Loading {
  /** The answer shown is not yet the one asked for (never true while the cache is whole). */
  loading: boolean
  /** Why the last read failed; the previous answer stays. */
  error: RuleError | null
}

const failure = (e: unknown): RuleError =>
  e && typeof e === "object" && "code" in e && "message" in e ? (e as RuleError) : { code: "sem_servidor", message: "O servidor não respondeu" }

/**
 * One read of the data layer, asked again when `key` changes or the server says something changed. Off
 * (`enabled` false) it asks nothing. The last answer stays while the next one is on its way.
 */
function useRemote<T>(enabled: boolean, key: string, run: () => Promise<T>): { data: T | null } & Loading {
  const { queries } = useData()
  const changed = useCell(queries.changed)
  const want = `${changed}|${key}`
  const [got, setGot] = useState<{ want: string; data: T | null; error: RuleError | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    run().then(
      (data) => { if (live) setGot({ want, data, error: null }) },
      (e: unknown) => { if (live) setGot((old) => ({ want, data: old?.data ?? null, error: failure(e) })) },
    )
    return () => { live = false }
  }, [enabled, want]) // eslint-disable-line react-hooks/exhaustive-deps -- `run` is described by `key`
  return { data: got?.data ?? null, loading: enabled && got?.want !== want, error: enabled ? got?.error ?? null : null }
}

/** The screen's matching over the defaults of the data layer (the screen's wins, name by name). */
function withLocal<T>(base: ListLocal<T>, local: Partial<ListLocal<T>> | undefined): ListLocal<T> {
  if (!local) return base
  return { searchText: local.searchText ?? base.searchText, tests: { ...base.tests, ...local.tests }, sorts: { ...base.sorts, ...local.sorts } }
}
const NO_ROWS: never[] = []
/** The same object while its content is the same: a view written inline in the render does not recompute the page on every tick. */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value)
  return useMemo(() => value, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}
const emptyPage = <T>(view: ListView): Page<T> => ({ items: NO_ROWS, total: 0, all: 0, page: 0, pageSize: view.pageSize })

/**
 * The Quadro: one page of PTs with who moves next, under the view (search, `segment`, sort, page).
 * `local`: the screen's own search text, tests and comparators, used while everything is in memory.
 * Pass stable objects (module constants, `useMemo`): they key the caches.
 */
export function usePermitBoard(asked: ListView, local?: Partial<ListLocal<BoardRow>>): Page<BoardRow> & Loading {
  const port = useData()
  const view = useStable(asked)
  const { state } = useRegistry()
  const { permits, signatures } = usePermits()
  const sim = useSim()
  const [cache] = useState(createBoardCache)
  const { people, locations, templates, assets } = state
  // The rows follow the clock only through account expiry (and the day): not rebuilt on every tick.
  const epoch = accountEpoch(people, sim.now)
  const rows = useMemo<BoardRow[]>(
    () => (port.whole ? boardRows({ permits, signatures, people, locations, templates, personId: sim.personId, today: sim.today, now: sim.now }, cache) : NO_ROWS),
    [port.whole, permits, signatures, people, locations, templates, sim.personId, sim.today, epoch, cache], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const match = useMemo(() => withLocal(boardLocal(assets, locations), local), [assets, locations, local])
  const here = useMemo(() => (port.whole ? pageOf(rows, view, match) : null), [port.whole, rows, view, match])
  const remote = useRemote(!port.whole, JSON.stringify(view), () => port.queries.permitBoard(view))
  return here ? { ...here, loading: false, error: null } : { ...(remote.data ?? emptyPage<BoardRow>(view)), loading: remote.loading, error: remote.error }
}

/** Ativos: one page of assets under the view (search, `typeId`, `locationId` = that place or below, sort, page). */
export function useAssetPage(asked: ListView, local?: Partial<ListLocal<Asset>>): Page<Asset> & Loading {
  const port = useData()
  const view = useStable(asked)
  const { assets, locations } = useRegistry().state
  const match = useMemo(() => withLocal(assetLocal(locations), local), [locations, local])
  const here = useMemo(() => (port.whole ? pageOf(assets, view, match) : null), [port.whole, assets, view, match])
  const remote = useRemote(!port.whole, JSON.stringify(view), () => port.queries.assets(view))
  return here ? { ...here, loading: false, error: null } : { ...(remote.data ?? emptyPage<Asset>(view)), loading: remote.loading, error: remote.error }
}

/** The most assets of one place the server gives at once (the contract's largest page). */
const LOCATION_ASSETS_MAX = 1000

/** The assets linked to a place or to anything under it (the place's page), in the registry's order. */
export function useLocationAssets(locationId: string): { items: Asset[]; total: number } & Loading {
  const port = useData()
  const { assets, locations } = useRegistry().state
  const here = useMemo(() => (port.whole ? assetsUnder(assets, locations, locationId) : null), [port.whole, assets, locations, locationId])
  const remote = useRemote(!port.whole, locationId, () => port.queries.assets({ q: "", filters: { locationId }, sort: null, page: 0, pageSize: LOCATION_ASSETS_MAX }))
  return here ? { items: here, total: here.length, loading: false, error: null } : { items: remote.data?.items ?? NO_ROWS, total: remote.data?.total ?? 0, loading: remote.loading, error: remote.error }
}

/** One batch for the assets currently visible; a partial PT cache cannot answer this question. */
export function useEquipmentHolds(assetIds: string[]): { items: EquipmentHold[] } & Loading {
  const port = useData()
  const ids = useStable(assetIds)
  const remote = useRemote(!port.whole, JSON.stringify(ids), () => port.queries.equipmentHolds?.(ids) ?? Promise.resolve([]))
  return { items: remote.data ?? NO_ROWS, loading: remote.loading, error: remote.error }
}

/** The most candidates the server is asked for when a picker looks for assets (the rest is cut after `skip`). */
const ASSET_SEARCH_ASK = 100

/**
 * Assets a picker offers for what the person typed (tag or name): up to `max`, in the registry's order,
 * without those `skip` refuses (already linked, inactive). In memory it scans the registry as the picker
 * always did; with the server it asks `GET /assets` (after a pause in the typing) and never reads the list.
 * `skip` must be stable (`useCallback`).
 */
export function useAssetSearch(q: string, max: number, skip: (a: Asset) => boolean): { items: Asset[] } & Loading {
  const port = useData()
  const { assets } = useRegistry().state
  const here = useMemo(() => {
    if (!port.whole) return null
    const needle = q.trim().toLocaleLowerCase("pt-BR")
    const out: Asset[] = []
    for (const a of assets) {
      if (skip(a)) continue
      if (needle && !`${a.code} ${a.name}`.toLocaleLowerCase("pt-BR").includes(needle)) continue
      out.push(a)
      if (out.length >= max) break
    }
    return out
  }, [port.whole, assets, q, max, skip])
  const [waited, setWaited] = useState(q)
  useEffect(() => {
    if (port.whole) return
    const t = setTimeout(() => setWaited(q), 300)
    return () => clearTimeout(t)
  }, [port.whole, q])
  const remote = useRemote(!port.whole, waited.trim(), () => port.queries.assets({ q: waited, filters: {}, sort: { id: "code", dir: "asc" }, page: 0, pageSize: ASSET_SEARCH_ASK }))
  const there = useMemo(() => (remote.data?.items ?? NO_ROWS).filter((a) => !skip(a)).slice(0, max), [remote.data, max, skip])
  return here ? { items: here, loading: false, error: null } : { items: there, loading: remote.loading, error: remote.error }
}

export interface AuditRows extends Loading {
  /** Newest first: the events below `before` (when given), up to `limit`. */
  items: AuditEvent[]
  /** How many events pass the filters; null when the server does not say. */
  matched: number | null
  /** Pass as `before` for the next page; null = no more. */
  nextBefore: number | null
}

/** The PT reads the same trail through its dedicated endpoint, without creating an Auditoria search. */
export function usePermitHistory(permitId: string): AuditRows & { accesses: number | null } {
  const port = useData()
  const { log } = useAudit()
  const mine = useMemo(() => port.whole ? log.filter((e) => e.permit === permitId) : null, [port.whole, log, permitId])
  const remote = useRemote(!port.whole, permitId, () => port.queries.permitHistory!(permitId))
  if (mine) {
    const items = mine.filter((e) => !e.action.startsWith("acesso."))
    return { items, matched: items.length, nextBefore: null, accesses: mine.length - items.length, loading: false, error: null }
  }
  return { items: remote.data?.items ?? NO_ROWS, matched: remote.data?.matched ?? null, nextBefore: remote.data?.nextBefore ?? null, accesses: remote.data?.accesses ?? null, loading: remote.loading, error: remote.error }
}

/**
 * The trail under the screen's filters. `text`: what the search reads for one event (the screen's reading:
 * title, target, person, changes), used while the whole chain is in memory; the server searches on its own.
 */
export function useAuditPage(query: AuditQuery, text?: (e: AuditEvent) => string): AuditRows {
  const port = useData()
  const { log } = useAudit()
  const { before, limit, ...filters } = query
  const key = JSON.stringify(filters)
  // The filtered rows are kept while only the cursor or the page size change ("Mostrar mais").
  const rows = useMemo(() => (port.whole ? auditRows(log, filters, text) : null), [port.whole, log, key, text]) // eslint-disable-line react-hooks/exhaustive-deps -- `filters` is described by `key`
  const here = useMemo(() => (rows ? auditPageOf(rows, before, limit) : null), [rows, before, limit])
  const remote = useRemote(!port.whole, JSON.stringify(query), () => port.queries.auditEvents(query))
  return here ? { ...here, loading: false, error: null } : { items: remote.data?.items ?? NO_ROWS, matched: remote.data?.matched ?? null, nextBefore: remote.data?.nextBefore ?? null, loading: remote.loading, error: remote.error }
}

/** What the trail's filters offer (who acted, which areas) and how many events there are. */
export function useAuditFacets(): AuditFacets & Loading {
  const port = useData()
  const { log } = useAudit()
  const { people } = useRegistry().state
  const here = useMemo(() => (port.whole ? auditFacetsOf(log, people) : null), [port.whole, log, people])
  const remote = useRemote(!port.whole, "facets", () => port.queries.auditFacets())
  const none = useMemo<AuditFacets>(() => ({ actorIds: [], areas: [], total: 0 }), [])
  return here ? { ...here, loading: false, error: null } : { ...(remote.data ?? none), loading: remote.loading, error: remote.error }
}
