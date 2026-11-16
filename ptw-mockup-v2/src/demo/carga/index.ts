/**
 * "Carga · 100 mil PTs" (`?cenario=carga`): the pulp mill (its registry, models, people and its week
 * of permits with their full audit history) plus a generated plant-year of work for testing the
 * screens under load:
 *  - ~300 more people (cargos scoped by area) and ~20 000 assets in "é parte de" families;
 *  - 100 000 permits: 90 000 closed over the last 12 months (encerradas, a few canceladas) and
 *    10 000 open across rascunho, em análise, devolvida, emitida, ativa, suspensa, entregue, expirada,
 *    each open one on equipment of its own.
 *
 * Built directly in the final state (see `permits.ts`), not by replaying 100 000 histories. The audit
 * chain is bounded on purpose: the mill's own events, one "sistema.carga" event that states what was
 * generated, and one summary event per generated open permit ("sistema.carga.pt"). The 90 000 closed
 * permits have no events of their own (their Histórico is empty). The chain stays intact.
 */
import { appendEvents, systemEvent, type AuditDraft } from "@/core/audit"
import { PERMIT_STATE_LABEL } from "@/core/permitState"
import { instant } from "@/core/time"
import type { Scenario } from "../types"
import { buildCelulose } from "../celulose"
import { C } from "../celulose/ids"
import { rng } from "./ids"
import { generatePermits } from "./permits"
import { buildPrototypes } from "./prototypes"
import { cargaRegistry } from "./registry"

export interface CargaSize { permits: number; open: number; assets: number; seed: number }
export const CARGA_SIZE: CargaSize = { permits: 100_000, open: 10_000, assets: 20_000, seed: 20261110 }

/** What the last build took and made (shown in the docs and the load test). */
export let cargaStats: { ms: number; permits: number; open: number; signatures: number; assets: number; people: number; events: number } | null = null

export function buildCarga(size: CargaSize = CARGA_SIZE): Scenario {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now()
  const base = buildCelulose()
  const r = rng(size.seed)
  const { registry, pools, gen } = cargaRegistry(base.registry, r, size.assets)
  const { protos, formSnapshots } = buildPrototypes(base.registry)
  const g = generatePermits({
    r, protos, now: base.start, gen, assets: registry.assets, pools, people: registry.people,
    total: size.permits, openTotal: size.open, counter2026Skip: [400, 499],
  })

  const permits = { ...base.permits, permits: [...base.permits.permits, ...g.permits], signatures: [...base.permits.signatures, ...g.signatures], formSnapshots: { ...base.permits.formSnapshots, ...formSnapshots } }

  /* Audit: what the load did, in one system event, and one summary per open permit (no per-act history). */
  const at = instant("2026-11-10T09:55:00")
  const closed = g.permits.length - g.openCount - (g.byTrack.rascunho ?? 0)
  const drafts: AuditDraft[] = [systemEvent("sistema.carga", `Carga de teste: ${g.permits.length.toLocaleString("pt-BR")} PTs geradas (${closed.toLocaleString("pt-BR")} finalizadas, sem eventos próprios)`, at, {
    pts: g.permits.length, finalizadas: closed, ativos: gen.assets.length, assinaturas: g.signatures.length, semente: size.seed,
  })]
  for (const p of g.permits) {
    if (p.state === "encerrada" || p.state === "cancelada") continue
    drafts.push({
      at, actor: null, role: null, auth: "sistema", client: null, request: null, reason: null,
      action: "sistema.carga.pt", ok: true, permit: p.id, rev: p.revision, asset: p.assetIds[0], entity: "permit", entityId: p.id,
      text: `PT gerada pela carga de teste já ${PERMIT_STATE_LABEL[p.state].toLowerCase()} (histórico não reproduzido)`, data: { estado: p.state, numero: p.number },
    })
  }
  const audit = appendEvents(base.audit, drafts, registry.units[0].id)

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now()
  // Visible in the browser's performance timeline (the load test reads it).
  if (typeof performance !== "undefined" && performance.measure) performance.measure("carga:build", { start: t0, end: t1 })
  cargaStats = { ms: Math.round(t1 - t0), permits: permits.permits.length, open: g.openCount, signatures: permits.signatures.length, assets: registry.assets.length, people: registry.people.length, events: audit.length }
  return {
    key: "carga",
    registry,
    permits,
    audit,
    start: base.start,
    defaultPerson: C.person.ricardo,
    auditors: base.auditors,
    focus: base.focus,
  }
}
