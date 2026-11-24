import { memo, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ListToolbar } from "@/components/shell/Page"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TOGGLE_ON } from "./common"
import { cn } from "@/lib/utils"
import type { RuleError } from "@/core/ptwErrors"
import type { ListView } from "@/data/port"

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Makes the header a sort button (rows in memory: how to compare). */
  sort?: (a: T, b: T) => number
  /**
   * Makes the header a sort button in a table the data layer pages (`PagedTable`): the column `id` is the
   * sort key of the query (the contract's) and the data layer does the ordering.
   */
  sortable?: boolean
  className?: string
  align?: "right"
}

/**
 * A one-of filter with a "Todos" option. Up to 4 choices (counting "Todos") it shows as segmented
 * buttons; with more it becomes a select (DESIGN.md).
 */
export interface SegmentFilter<T> {
  label: string
  options: { value: string; label: string }[]
  test: (row: T, value: string) => boolean
}

/** A dropdown filter for longer option lists (company, type); sits in the same toolbar. */
export interface SelectFilter<T> {
  label: string
  /** Text of the "no filter" option, e.g. "Todas as empresas". */
  allLabel: string
  options: { value: string; label: string }[]
  test: (row: T, value: string) => boolean
}

/** The same filters in a table the data layer pages: no test, the query's filter name instead (`ListView.filters`). */
export type PagedSegmentFilter = Omit<SegmentFilter<never>, "test">
export type PagedSelectFilter = Omit<SelectFilter<never>, "test">

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Text the search box looks at. */
  searchText: (row: T) => string
  searchLabel: string
  filter?: SegmentFilter<T>
  selectFilter?: SelectFilter<T>
  defaultSort?: { id: string; dir: "asc" | "desc" }
  /** Segment selected on first render (a value of `filter.options`); default "Todos". */
  defaultSegment?: string
  onRowClick?: (row: T) => void
  /** Key of the row whose detail is open beside the table (master–detail): the row is shaded. */
  selectedKey?: string | null
  /** Noun for the count, e.g. ["modelo", "modelos"]. */
  noun: [string, string]
  pageSizes?: number[]
  empty?: ReactNode
  /**
   * Keeps search, filters, sort and page for this session under this key, so opening a row and coming
   * back restores the view the person built (Quadro, Minhas PTs). Without it, the table starts fresh.
   */
  stateKey?: string
}

const ALL = "all"
type Sort = { id: string; dir: "asc" | "desc" } | null
interface View { q: string; seg: string; pick: string; sort: Sort; size: number; page: number }
/** Session memory of tables with a `stateKey` (in memory, like the rest of the simulation). */
const remembered = new Map<string, View>()

/**
 * The lowercased search text of each row, kept per `searchText` function and row object: typing in a
 * table of 100 000 rows then only compares strings. Pass a stable `searchText` (useCallback) and stable
 * row objects to benefit; anything else just computes again.
 */
const haystacks = new WeakMap<object, WeakMap<object, string>>()
function haystack<T>(fn: (row: T) => string, row: T): string {
  if (typeof row !== "object" || row === null) return fn(row).toLocaleLowerCase("pt-BR")
  let m = haystacks.get(fn)
  if (!m) { m = new WeakMap(); haystacks.set(fn, m) }
  let v = m.get(row)
  if (v === undefined) { v = fn(row).toLocaleLowerCase("pt-BR"); m.set(row, v) }
  return v
}

/* ---------- the view the person builds (search, filters, sort, page) ---------- */

interface ListOptions {
  stateKey?: string
  defaultSort?: { id: string; dir: "asc" | "desc" }
  defaultSegment?: string
  /** Sizes of the page selector (the first is the starting one). */
  pageSizes?: number[]
  /** Names the view's filters go by in `ListView.filters`: the segment filter's and the select filter's. */
  filterNames?: { segment?: string; select?: string }
  /** Wait this long after the last keystroke before the search goes into `view` (the server asks; 0 = at once). */
  debounceMs?: number
}

/** What a table's toolbar and header show and change; `view` is what the data layer is asked. */
export interface ListState {
  q: string
  setQ: (q: string) => void
  seg: string
  setSeg: (v: string) => void
  pick: string
  setPick: (v: string) => void
  sort: Sort
  toggleSort: (id: string) => void
  size: number
  setSize: (n: number) => void
  page: number
  setPage: (n: number) => void
  /** Something other than the starting view is chosen ("Limpar filtros" shows). */
  filtering: boolean
  reset: () => void
  /** The query: the search (after the wait), the filters by name, the sort key (a column `id`), the page. */
  view: ListView
}

/**
 * The state of a table (also the one the screens give to `PagedTable` and to the query hooks of
 * `src/data/hooks.ts`). A change of search, filter, sort or page size goes back to the first page.
 */
export function useListState({ stateKey, defaultSort, defaultSegment, pageSizes = [10, 25, 50], filterNames, debounceMs = 0 }: ListOptions = {}): ListState {
  const saved = stateKey ? remembered.get(stateKey) : undefined
  const [q, setQState] = useState(saved?.q ?? "")
  const [seg, setSegState] = useState(saved?.seg ?? defaultSegment ?? ALL)
  const [pick, setPickState] = useState(saved?.pick ?? ALL)
  const [sort, setSort] = useState<Sort>(saved ? saved.sort : defaultSort ?? null)
  const [size, setSizeState] = useState(saved?.size ?? pageSizes[0])
  const [page, setPage] = useState(saved?.page ?? 0)
  useEffect(() => { if (stateKey) remembered.set(stateKey, { q, seg, pick, sort, size, page }) }, [stateKey, q, seg, pick, sort, size, page])

  // The search goes into the view after a pause when the server answers it.
  const [waited, setWaited] = useState(q)
  useEffect(() => {
    if (debounceMs <= 0) return
    const t = setTimeout(() => setWaited(q), debounceMs)
    return () => clearTimeout(t)
  }, [q, debounceMs])
  const asked = debounceMs > 0 ? waited : q

  const start = defaultSegment ?? ALL
  const segName = filterNames?.segment, selName = filterNames?.select
  const view = useMemo<ListView>(() => {
    const filters: Record<string, string> = {}
    if (segName && seg !== ALL) filters[segName] = seg
    if (selName && pick !== ALL) filters[selName] = pick
    return { q: asked, filters, sort, page, pageSize: size }
  }, [asked, seg, pick, sort, page, size, segName, selName])

  return {
    q, seg, pick, sort, size, page, view,
    setQ: (v) => { setQState(v); setPage(0) },
    setSeg: (v) => { setSegState(v); setPage(0) },
    setPick: (v) => { setPickState(v); setPage(0) },
    setSize: (n) => { setSizeState(n); setPage(0) },
    setPage,
    toggleSort: (id) => {
      setPage(0)
      setSort((s) => (!s || s.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null))
    },
    // The starting view itself (Quadro opens on "Em andamento") is not a filter the person set.
    filtering: q.trim() !== "" || seg !== start || pick !== ALL,
    // Back to the table's starting view; if that view is what hides everything, to "Todos".
    reset: () => { setQState(""); setWaited(""); setSegState(q.trim() === "" && pick === ALL ? ALL : start); setPickState(ALL); setPage(0) },
  }
}

/* ---------- the table itself ---------- */

interface FrameProps<T> {
  list: ListState
  columns: Column<T>[]
  rowKey: (row: T) => string
  searchLabel: string
  filter?: PagedSegmentFilter
  selectFilter?: PagedSelectFilter
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  noun: [string, string]
  pageSizes: number[]
  /** The rows of the current page, and the numbers around them. */
  items: T[]
  total: number
  all: number
  page: number
  /** The answer shown is not yet the one asked for (a server read is on its way). */
  loading?: boolean
}

function TableFrame<T>({ list, columns, rowKey, searchLabel, filter, selectFilter, onRowClick, selectedKey, noun, pageSizes, items, total, all, page: cur, loading }: FrameProps<T>) {
  const { q, seg, pick, sort, size } = list
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total === 0 ? 0 : cur * size + 1
  const to = Math.min(total, cur * size + items.length)
  const segmented = !!filter && filter.options.length + 1 <= 4

  return (
    <ListToolbar
      search={{ value: q, onChange: list.setQ, label: searchLabel }}
      filtering={list.filtering}
      onClear={list.reset}
      count={{ shown: total, total: all, noun }}
      filters={(selectFilter || filter) && <>
        {selectFilter && (
          <Select value={pick} onValueChange={list.setPick}>
            <SelectTrigger className="min-h-11 w-full md:min-h-9 @3xl:w-56" aria-label={selectFilter.label}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>{selectFilter.allLabel}</SelectItem>
              {selectFilter.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        )}
        {filter && segmented && (
          <ToggleGroup type="single" variant="outline" value={seg} aria-label={filter.label} className="flex-wrap justify-start"
            onValueChange={(v) => { if (v) list.setSeg(v) }}>
            <ToggleGroupItem value={ALL} className={cn("min-h-11 md:min-h-9", TOGGLE_ON)}>Todos</ToggleGroupItem>
            {filter.options.map((o) => <ToggleGroupItem key={o.value} value={o.value} className={cn("min-h-11 md:min-h-9", TOGGLE_ON)}>{o.label}</ToggleGroupItem>)}
          </ToggleGroup>
        )}
        {filter && !segmented && (
          <Select value={seg} onValueChange={list.setSeg}>
            <SelectTrigger className="min-h-11 w-full md:min-h-9 @3xl:w-56" aria-label={filter.label}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL}>Todos</SelectItem>
              {filter.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        )}
      </>}
    >
      {/* "Carregando": the last page stays, dimmed, until the next one arrives (DESIGN.md). */}
      <div aria-busy={loading || undefined} className={cn("app-table min-w-0 transition-opacity", loading && "opacity-60")}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => {
              const active = sort?.id === c.id ? sort.dir : null
              const sortable = !!(c.sort || c.sortable)
              const Icon = active === "asc" ? ArrowUpIcon : active === "desc" ? ArrowDownIcon : ArrowUpDownIcon
              return (
                <TableHead key={c.id} className={cn(c.className, c.align === "right" && "text-right")}
                  aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : sortable ? "none" : undefined}>
                  {sortable ? (
                    <button type="button" onClick={() => list.toggleSort(c.id)} className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-accent focus-visible:outline-2 max-md:min-h-11", c.align === "right" && "flex-row-reverse")}>
                      {c.header}<Icon className={cn("size-3.5", !active && "text-muted-foreground/60")} aria-hidden />
                    </button>
                  ) : c.header}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-40 whitespace-normal">
                {loading ? <span className="type-body text-muted-foreground">Carregando…</span> : <span className="flex flex-col gap-1"><strong className="type-section">Nenhum resultado</strong><span className="type-body text-muted-foreground">Nada combina com a busca e os filtros de agora.</span></span>}
              </TableCell>
            </TableRow>
          ) : items.map((r) => (
            <TableRow key={rowKey(r)} data-state={selectedKey != null && rowKey(r) === selectedKey ? "selected" : undefined} className={onRowClick ? "cursor-pointer" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <TableCell key={c.id} className={cn(c.className, c.align === "right" && "text-right tabular-nums")}>{c.cell(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {total > pageSizes[0] && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="type-meta tabular-nums">{from}–{to} de {total}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="type-meta hidden sm:inline">Por página</span>
            <Select value={String(size)} onValueChange={(v) => list.setSize(Number(v))}>
              <SelectTrigger className="min-h-11 w-20 md:min-h-9" aria-label="Itens por página"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{pageSizes.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label="Página anterior" disabled={cur === 0} onClick={() => list.setPage(cur - 1)}><ChevronLeftIcon /></Button>
            <span className="type-meta tabular-nums" aria-live="polite">{cur + 1} / {pages}</span>
            <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label="Próxima página" disabled={cur >= pages - 1} onClick={() => list.setPage(cur + 1)}><ChevronRightIcon /></Button>
          </div>
        </div>
      )}
    </ListToolbar>
  )
}

/**
 * Data table: the list toolbar (DESIGN.md: search · filters · "N de M" on the right), sortable columns and
 * pagination. Page resets on any filter or sort change, the count is announced to screen readers, and
 * "Limpar filtros" appears only while something is filtered.
 */
function DataTableImpl<T>({ rows, columns, rowKey, searchText, searchLabel, filter, selectFilter, defaultSort, defaultSegment, onRowClick, selectedKey, noun, pageSizes = [10, 25, 50], empty, stateKey }: Props<T>) {
  const list = useListState({ stateKey, defaultSort, defaultSegment, pageSizes })
  const { q, seg, pick, sort, size, page } = list

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("pt-BR")
    // The cheap filters first, so the text search reads only what they let through.
    let out = rows
    if (filter && seg !== ALL) out = out.filter((r) => filter.test(r, seg))
    if (selectFilter && pick !== ALL) out = out.filter((r) => selectFilter.test(r, pick))
    if (needle) out = out.filter((r) => haystack(searchText, r).includes(needle))
    const col = sort && columns.find((c) => c.id === sort.id)
    if (col?.sort && sort) out = [...out].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * col.sort!(a, b))
    return out
  }, [rows, q, seg, pick, sort, filter, selectFilter, columns, searchText])

  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const cur = Math.min(page, pages - 1)
  const items = filtered.slice(cur * size, cur * size + size)

  if (rows.length === 0) return <>{empty ?? <Empty><EmptyHeader><EmptyTitle>Nada por aqui ainda</EmptyTitle></EmptyHeader></Empty>}</>

  return <TableFrame list={list} columns={columns} rowKey={rowKey} searchLabel={searchLabel} filter={filter} selectFilter={selectFilter} onRowClick={onRowClick} selectedKey={selectedKey}
    noun={noun} pageSizes={pageSizes} items={items} total={filtered.length} all={rows.length} page={cur} />
}

/**
 * Memoized: with stable props (module constants, `useMemo`/`useCallback` in the screen) the table does
 * not render again when only the clock ticks.
 */
export const DataTable = memo(DataTableImpl) as typeof DataTableImpl

/* ---------- the table the data layer pages ---------- */

interface PagedProps<T> extends Omit<FrameProps<T>, "items" | "total" | "all" | "page" | "pageSizes"> {
  /** The page the query hook gave for `list.view`. */
  data: { items: T[]; total: number; all: number; page: number; loading: boolean; error: RuleError | null }
  pageSizes?: number[]
  empty?: ReactNode
}

/**
 * The same table, with the rows of one page from `src/data/hooks.ts` (`usePermitBoard`, `useAssetPage`):
 * in memory it looks exactly like `DataTable`; with the server, a change of search, filter, sort or page is
 * one call, the last page stays dimmed ("carregando") until the next arrives, and the whole list is never read.
 * The screen owns the state (`useListState`) so its header can show `data.all`.
 */
function PagedTableImpl<T>({ data, pageSizes = [10, 25, 50], empty, ...frame }: PagedProps<T>) {
  if (data.all === 0 && !data.loading && !data.error && !frame.list.filtering) return <>{empty ?? <Empty><EmptyHeader><EmptyTitle>Nada por aqui ainda</EmptyTitle></EmptyHeader></Empty>}</>
  return (
    <>
      {data.error && data.items.length === 0 && <p role="alert" className="type-body text-destructive">Não foi possível carregar a lista: {data.error.message}</p>}
      <TableFrame {...frame} pageSizes={pageSizes} items={data.items} total={data.total} all={data.all} page={data.page} loading={data.loading} />
    </>
  )
}
export const PagedTable = memo(PagedTableImpl) as typeof PagedTableImpl
