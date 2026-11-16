/**
 * The paged reads (A18): `GET /permits`, `/assets`, `/audit/events`, `/audit/facets`. A change of page,
 * search, filter or order is one call; the full list is never read.
 */
import type { AuditEvent } from "@/core/audit"
import type { BoardRow } from "@/core/board"
import { byId } from "@/core/indexes"
import { instant, nextDayStart } from "@/core/time"
import type { Asset } from "@/registry/types"
import type { AuditFacets, AuditPage, AuditQuery, EquipmentHold, ListView, Page, QueryPort } from "../port"
import { addAssets, type Page as Wire, type Shared } from "./state"
import type { Permit } from "@/permit/types"
import type { RuleError } from "@/core/ptwErrors"

interface WireBoardRow { permit: Omit<Permit, "answers" | "answerMeta">; next: string; mine: boolean; answers?: Permit["answers"] }

const sortOf = (v: ListView) => (v.sort ? `${v.sort.dir === "desc" ? "-" : ""}${v.sort.id}` : undefined)
const isDay = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x)

/** Reads fail with the refusal itself (the query hooks show it). */
async function must<T>(p: Promise<{ ok: true; data: T } | { ok: false; error: RuleError }>): Promise<T> {
  const r = await p
  if (!r.ok) throw r.error
  return r.data
}

export function createQueries(s: Shared): QueryPort {
  const { http } = s
  // The header counts (rows with no filter) are asked once per change of the data.
  let counts: { at: number; permits?: number; assets?: number } = { at: -1 }
  const totals = () => { const at = s.changed.get(); if (counts.at !== at) counts = { at } ; return counts }

  return {
    changed: s.changed,

    async equipmentHolds(assetIds): Promise<EquipmentHold[]> {
      if (!assetIds.length) return []
      return must(http.request<EquipmentHold[]>({ method: "GET", path: "/equipment-holds", query: { assetId: assetIds } }))
    },

    async permitHistory(permitId) {
      const r = await must(http.request<{ items: AuditEvent[]; nextBefore: number | null; total: number; accesses?: number }>({ method: "GET", path: `/permits/${permitId}/history`, query: { limit: 500 } }))
      const seen = new Map(s.audit.get().map((e) => [e.seq, e]))
      for (const e of r.items) seen.set(e.seq, e)
      s.audit.set([...seen.values()].sort((x, y) => x.seq - y.seq))
      return { items: r.items, nextBefore: r.nextBefore, matched: r.total, accesses: r.accesses }
    },

    async permitBoard(view): Promise<Page<BoardRow>> {
      const f = view.filters ?? {}
      const q = { q: view.q.trim() || undefined, segment: f.segment && f.segment !== "all" ? f.segment : undefined, sort: sortOf(view), page: view.page, pageSize: view.pageSize, answers: view.answers || undefined }
      const c = totals()
      const [page, all] = await Promise.all([
        must(http.request<Wire<WireBoardRow>>({ method: "GET", path: "/permits", query: q })),
        c.permits !== undefined ? Promise.resolve(c.permits) : must(http.request<{ total: number }>({ method: "GET", path: "/permits/counts" })).then((x) => (c.permits = x.total)),
      ])
      const ids = [...new Set(page.items.flatMap((row) => row.permit.assetIds))].filter((id) => !s.assets.has(id))
      for (let start = 0; start < ids.length; start += 200) {
        const found = await must(http.request<Wire<Asset>>({ method: "GET", path: "/assets", query: { id: ids.slice(start, start + 200), pageSize: 200 } }))
        addAssets(s, found.items)
      }
      const { templates } = s.registry.get()
      const items: BoardRow[] = []
      for (const row of page.items) {
        const tpl = byId(templates, row.permit.templateId)
        const ver = tpl?.versions.find((v) => v.id === row.permit.versionId)
        if (tpl && ver) items.push({ p: { ...row.permit, answers: row.answers ?? {}, answerMeta: {} }, tpl, ver, next: row.next, mine: row.mine })
      }
      return { items, total: page.total, all, page: page.page, pageSize: page.pageSize }
    },

    async assets(view): Promise<Page<Asset>> {
      const f = view.filters ?? {}
      const q = { q: view.q.trim() || undefined, typeId: f.typeId && f.typeId !== "all" ? f.typeId : undefined, locationId: f.locationId && f.locationId !== "all" ? f.locationId : undefined, sort: sortOf(view), page: view.page, pageSize: view.pageSize }
      const c = totals()
      const [page, all] = await Promise.all([
        must(http.request<Wire<Asset>>({ method: "GET", path: "/assets", query: q })),
        c.assets !== undefined ? Promise.resolve(c.assets) : must(http.request<Wire<Asset>>({ method: "GET", path: "/assets", query: { page: 0, pageSize: 1 } })).then((x) => (c.assets = x.total)),
      ])
      addAssets(s, page.items)
      return { items: page.items, total: page.total, all, page: page.page, pageSize: page.pageSize }
    },

    async auditEvents(a: AuditQuery): Promise<AuditPage> {
      const tz = s.tz()
      const q = {
        group: a.groups, area: a.area, actorId: a.actorId === undefined ? undefined : a.actorId === null ? "sistema" : a.actorId,
        permitId: a.permitId, assetId: a.assetId,
        // A day is the unit's whole day: from its start, to the start of the next (exclusive).
        from: a.from ? (isDay(a.from) ? instant(a.from, tz) : a.from) : undefined,
        to: a.to ? (isDay(a.to) ? nextDayStart(a.to, tz) : a.to) : undefined,
        q: a.q?.trim() || undefined, before: a.before, limit: a.limit,
      }
      const r = await must(http.request<{ items: AuditEvent[]; nextBefore: number | null; total: number }>({ method: "GET", path: "/audit/events", query: q }))
      // The cell is the part of the chain read so far, oldest first.
      const seen = new Map(s.audit.get().map((e) => [e.seq, e]))
      for (const e of r.items) seen.set(e.seq, e)
      s.audit.set([...seen.values()].sort((x, y) => x.seq - y.seq))
      return { items: r.items, nextBefore: r.nextBefore, matched: r.total }
    },

    async auditFacets(): Promise<AuditFacets> {
      const r = await must(http.request<{ actors: { id: string }[]; areas: string[]; total: number }>({ method: "GET", path: "/audit/facets" }))
      return { actorIds: r.actors.map((x) => x.id), areas: r.areas, total: r.total }
    },
  }
}
