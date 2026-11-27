/**
 * Lists answered from memory: the same filter, search, sort and page the `DataTable` and the Auditoria
 * screen do today over the whole array. Pure; used by the query hooks while the cache is whole and by the
 * memory port's `queries`.
 */
import { auditArea, auditGroup, epochMicros, eventIso, type AuditEvent } from "@/core/audit"
import { dayOf as eventDay } from "@/core/time"
import type { BoardRow } from "@/core/board"
import { byId } from "@/core/indexes"
import { isFinalState, pathIds, stateRank } from "@/core/permitView"
import type { Asset, Location, RegistryState } from "@/registry/types"
import type { AuditFacets, AuditPage, AuditQuery, ListLocal, ListView, Page } from "../port"

/** The "no filter" value of a one-of filter (the `DataTable`'s "Todos"). */
export const ALL = "all"

/**
 * The lowercased search text of each row, kept per `searchText` function and row object: typing in a
 * list of 100 000 rows then only compares strings (same idea, and same result, as the `DataTable`).
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

/** The rows that pass the view's filters and search, in the view's order (all pages). */
export function matchRows<T>(rows: readonly T[], view: Pick<ListView, "q" | "filters" | "sort">, local: ListLocal<T>): readonly T[] {
  const needle = view.q.trim().toLocaleLowerCase("pt-BR")
  // The cheap filters first, so the text search reads only what they let through.
  let out = rows
  for (const [name, value] of Object.entries(view.filters ?? {})) {
    const test = local.tests?.[name]
    if (test && value !== ALL && value !== "") out = out.filter((r) => test(r, value))
  }
  if (needle) out = out.filter((r) => haystack(local.searchText, r).includes(needle))
  const cmp = view.sort && local.sorts?.[view.sort.id]
  if (cmp && view.sort) { const k = view.sort.dir === "asc" ? 1 : -1; out = [...out].sort((a, b) => k * cmp(a, b)) }
  return out
}

/** One page of `rows` under `view`. A page past the end gives the last one, as the table does. */
export function pageOf<T>(rows: readonly T[], view: ListView, local: ListLocal<T>): Page<T> {
  const matched = matchRows(rows, view, local)
  const pages = Math.max(1, Math.ceil(matched.length / view.pageSize))
  const page = Math.max(0, Math.min(view.page, pages - 1))
  return { items: matched.slice(page * view.pageSize, page * view.pageSize + view.pageSize), total: matched.length, all: rows.length, page, pageSize: view.pageSize }
}

/** Keeps the last answer of `make` while `deps` are the very same (stable functions for the text cache). */
function last<D extends unknown[], R>(make: (...deps: D) => R): (...deps: D) => R {
  let hit: { deps: D; value: R } | null = null
  return (...deps) => {
    if (!hit || hit.deps.length !== deps.length || hit.deps.some((d, i) => d !== deps[i])) hit = { deps, value: make(...deps) }
    return hit.value
  }
}

/* ---------- Quadro ---------- */

/** The Quadro's segments (`GET /permits?segment=`). */
export const BOARD_SEGMENTS: Record<string, (r: BoardRow) => boolean> = {
  minhas: (r) => r.mine,
  andamento: (r) => !isFinalState(r.p.state) && r.p.state !== "rascunho",
  preparacao: (r) => ["rascunho", "em_analise", "devolvida", "emitida"].includes(r.p.state),
  campo: (r) => ["ativa", "suspensa", "entregue"].includes(r.p.state),
  finalizadas: (r) => isFinalState(r.p.state),
  // SPEC 014: the person's own drafts (`core/board` already leaves other people's out).
  rascunhos: (r) => r.p.state === "rascunho",
}

const numberOf = (r: BoardRow) => r.p.number ?? "PT sem número"
// PT numbers are ASCII: plain comparison (a collator over 100 000 rows costs seconds).
const cmpText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const collator = new Intl.Collator("pt-BR")

/** How the Quadro matches in memory: the search text, segments and orders of `QuadroView`, by the contract's names. */
export const boardLocal = last((assets: Asset[], locations: Location[]): ListLocal<BoardRow> => {
  const locCode = (r: BoardRow) => byId(locations, r.p.locationId)?.code ?? r.p.locationId
  const assetCodes = (r: BoardRow) => {
    const codes = r.p.assetIds.map((id) => byId(assets, id)?.code ?? id)
    return codes.length > 1 ? `${codes[0]} +${codes.length - 1}` : codes[0]
  }
  return {
    searchText: (r) => [numberOf(r), assetCodes(r), locCode(r), r.p.scope, r.next, r.tpl.name].join(" "),
    tests: { segment: (r, v) => BOARD_SEGMENTS[v]?.(r) ?? true },
    sorts: {
      number: (a, b) => cmpText(numberOf(a), numberOf(b)),
      state: (a, b) => stateRank(a.p.state) - stateRank(b.p.state),
      location: (a, b) => collator.compare(locCode(a), locCode(b)),
      template: (a, b) => collator.compare(a.tpl.name, b.tpl.name),
      windowStart: (a, b) => Date.parse(a.p.windowStart) - Date.parse(b.p.windowStart),
    },
  }
})

/* ---------- Ativos ---------- */

/** A place and everything under it. */
export function locationSubtree(locations: readonly Location[], id: string): Set<string> {
  const kids = new Map<string, string[]>()
  for (const l of locations) if (l.parentId) { const xs = kids.get(l.parentId); if (xs) xs.push(l.id); else kids.set(l.parentId, [l.id]) }
  const out = new Set<string>(), todo = [id]
  while (todo.length) { const x = todo.pop()!; if (out.has(x)) continue; out.add(x); todo.push(...(kids.get(x) ?? [])) }
  return out
}

/** Assets linked to a place or to anything under it, in the registry's order (the place's page). */
export function assetsUnder(assets: readonly Asset[], locations: readonly Location[], locationId: string): Asset[] {
  const subtree = locationSubtree(locations, locationId)
  return assets.filter((a) => a.locationIds.some((x) => subtree.has(x)))
}

/** How Ativos matches in memory: the search text, type filter and orders of `AssetsView`. */
export const assetLocal = last((locations: Location[]): ListLocal<Asset> => {
  const pathText = (id: string) => pathIds(locations, id).slice().reverse().map((x) => byId(locations, x)?.name ?? "").join(" › ")
  const subtrees = new Map<string, Set<string>>()
  const under = (id: string) => { let s = subtrees.get(id); if (!s) { s = locationSubtree(locations, id); subtrees.set(id, s) } return s }
  return {
    searchText: (a) => [a.code, a.name, ...a.aliases, ...a.locationIds.map(pathText)].join(" "),
    tests: {
      typeId: (a, v) => a.typeId === v,
      locationId: (a, v) => { const s = under(v); return a.locationIds.some((x) => s.has(x)) },
    },
    sorts: {
      code: (a, b) => a.code.localeCompare(b.code, "pt-BR"),
      name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    },
  }
})

/* ---------- Auditoria ---------- */

/** What the search reads when the screen gives no text of its own. */
const plainText = (e: AuditEvent) => `${e.seq} ${e.text} ${e.action} ${e.reason ?? ""}`
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * The events that pass the filters, newest first (the Auditoria screen's own filter). `text` is what
 * the search reads for one event; the screen passes its reading (title, target, person, changes).
 */
export function auditRows(log: readonly AuditEvent[], q: Omit<AuditQuery, "before" | "limit">, text: (e: AuditEvent) => string = plainText): AuditEvent[] {
  const needle = (q.q ?? "").trim().toLocaleLowerCase("pt-BR")
  const fromDay = q.from && isDay(q.from) ? q.from : "", fromUs = q.from && !fromDay ? epochMicros(q.from) : null
  const toDay = q.to && isDay(q.to) ? q.to : "", toUs = q.to && !toDay ? epochMicros(q.to) : null
  const out = log.filter((e) => {
    if (q.groups && !q.groups.includes(auditGroup(e))) return false
    if (q.permitId && e.permit !== q.permitId) return false
    if (q.assetId && e.asset !== q.assetId) return false
    if (fromDay && eventDay(eventIso(e)) < fromDay) return false
    if (fromUs !== null && e.at < fromUs) return false
    if (toDay && eventDay(eventIso(e)) > toDay) return false
    if (toUs !== null && e.at >= toUs) return false
    if (q.actorId !== undefined && e.actor !== q.actorId) return false
    if (q.area && auditArea(e.action) !== q.area) return false
    if (needle && !text(e).toLocaleLowerCase("pt-BR").includes(needle)) return false
    return true
  })
  return out.reverse()
}

/** One page of rows already filtered (newest first): those below the cursor, up to `limit`. */
export function auditPageOf(rows: readonly AuditEvent[], before: number | undefined, limit = 100): AuditPage {
  const start = before === undefined ? 0 : rows.findIndex((e) => e.seq < before)
  const items = start < 0 ? [] : rows.slice(start, start + limit)
  const more = start >= 0 && start + limit < rows.length
  return { items, nextBefore: more ? items[items.length - 1].seq : null, matched: rows.length }
}

/** Who acted and in which areas, over the whole log (one pass). */
export function auditFacetsOf(log: readonly AuditEvent[], people: RegistryState["people"]): AuditFacets {
  const actors = new Set(log.map((e) => e.actor))
  return { actorIds: people.filter((p) => actors.has(p.id)).map((p) => p.id), areas: [...new Set(log.map((e) => auditArea(e.action)))], total: log.length }
}
