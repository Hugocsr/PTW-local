/**
 * Replays a sample history through the store's own reducer (`permitReducer`), in time order: every
 * answer, file, signature, return, stop, extension and expiry passes the same rules a user would meet,
 * and the audit events are the ones the database would write. A step the rules refuse makes the replay
 * throw, unless the sample marks that refusal as intended (it then stays in the audit trail).
 * Used by every sample scenario (`permit/seed.ts`, `demo/celulose`).
 */
import { rowEvent, type AuditCtx, type AuditDraft } from "@/core/audit"
import type { RegistryState } from "@/registry/types"
import { permitReducer, type PermitAction } from "./reducer"
import { permitAssetRow, permitRow, permitTeamRow } from "./rows"
import type { Permit, PermitData } from "./types"

export type ReplayBase = Pick<Permit, "id" | "templateId" | "versionId" | "authorId" | "locationId" | "assetIds" | "team" | "scope"> & { start: string; end: string }

export type ReplayStep =
  | { t: string; who: string | null; create: ReplayBase }
  | { t: string; who: string | null; act: PermitAction }
  | { t: string; who: string | null; cancel: { permitId: string; note: string } }

/** A new permit in rascunho, as the app creates it. */
export const draftPermit = (b: ReplayBase, createdAt: string): Permit => ({
  id: b.id, number: null, templateId: b.templateId, versionId: b.versionId, state: "rascunho", authorId: b.authorId, locationId: b.locationId,
  assetIds: b.assetIds, team: b.team, windowStart: b.start, windowEnd: b.end, scope: b.scope, answers: {}, answerMeta: {},
  snapshotSha256: null, snapshotAt: null, revision: 1, note: null,
  holdReason: null, holdBy: null, holdAt: null, resumedReason: null, resumedBy: null, resumedAt: null,
  createdAt, updatedAt: createdAt, rowVersion: 1,
})

export interface ReplayOptions {
  registry: RegistryState
  /** Ids of new rows (signatures, extensions), fixed so the chain is the same on every load. */
  newId: () => string
  /** The unit's counter before the first number this sample gives. */
  counterStart: number
  /** `${permitId}@${instant}` of refusals the sample shows on purpose. */
  deniedOnPurpose?: Set<string>
  /** Name of the sample in the error message. */
  label?: string
}

export function replayPermits(steps: ReplayStep[], o: ReplayOptions): { data: PermitData; events: AuditDraft[] } {
  const registry = o.registry
  const unit = registry.units[0]
  let data: PermitData = { permits: [], signatures: [], revisions: [], attachments: [], blobs: {}, formSnapshots: {}, extensions: [] }
  const events: AuditDraft[] = []
  const look = {
    permitRevision: (id: string) => data.permits.find((x) => x.id === id)?.revision,
    assetCode: (id: string) => registry.assets.find((x) => x.id === id)?.code,
    personName: (id: string) => registry.people.find((x) => x.id === id)?.name,
  }
  const ordered = steps.map((s, i) => ({ s, i })).sort((a, b) => Date.parse(a.s.t) - Date.parse(b.s.t) || a.i - b.i).map((x) => x.s)
  for (const s of ordered) {
    const ctx: AuditCtx = s.who ? { at: s.t, actorId: s.who } : { at: s.t, actorId: null, auth: "sistema" }
    if ("create" in s) {
      // A new PT: the permit row, then its assets and team (each a row of its own).
      const p = draftPermit(s.create, s.t)
      data = { ...data, permits: [...data.permits, p] }
      const rows = [
        rowEvent("permit", undefined, permitRow(p, unit.id), ctx, look),
        ...p.assetIds.map((a) => rowEvent("permit_asset", undefined, permitAssetRow(p, a, unit.id), ctx, look)),
        ...Object.entries(p.team).flatMap(([role, ids]) => ids.map((pid) => rowEvent("permit_team", undefined, permitTeamRow(p, role, pid, unit.id), ctx, look))),
      ]
      for (const e of rows) if (e) events.push(e)
      continue
    }
    if ("cancel" in s) {
      const p = data.permits.find((x) => x.id === s.cancel.permitId)!
      const np: Permit = { ...p, state: "cancelada", note: s.cancel.note, rowVersion: p.rowVersion + 1, updatedAt: s.t }
      const e = rowEvent("permit", permitRow(p, unit.id), permitRow(np, unit.id), ctx, look)
      if (e) events.push(e)
      data = { ...data, permits: data.permits.map((x) => (x.id === p.id ? np : x)) }
      continue
    }
    const step = permitReducer(data, s.act, { audit: ctx, registry, newId: o.newId, counterStart: o.counterStart })
    if (step.denied && !o.deniedOnPurpose?.has(`${s.act.permitId}@${s.t}`)) {
      throw new Error(`${o.label ?? "Exemplo"}: PT inválida (${s.act.kind} em ${s.t}): ${step.denied.code} ${step.denied.message}`)
    }
    if (!step.denied && o.deniedOnPurpose?.has(`${s.act.permitId}@${s.t}`)) {
      throw new Error(`${o.label ?? "Exemplo"}: a recusa esperada não aconteceu (${s.act.kind} em ${s.t})`)
    }
    data = step.data
    events.push(...step.events)
  }
  return { data, events }
}
