// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit/chain.ts; não edite (node scripts/sync-shared.mjs)
/** The chain: appending events and verifying it. */
import { eventHash } from "./canonical.ts"
import { epochMicros } from "./micros.ts"
import type { AuditDraft, AuditEvent } from "./types.ts"
import { ACTION, GENESIS } from "./types.ts"

/**
 * Append drafts in order; returns a new array. The time never goes back from the previous event
 * (the database takes the later of the two; PTW12 otherwise).
 */
export function appendEvents(log: AuditEvent[], drafts: AuditDraft[], unit: string): AuditEvent[] {
  const out = [...log]
  for (const d of drafts) {
    if (!ACTION.test(d.action)) throw new Error(`Ação de auditoria inválida: ${d.action}`)
    const tip = out[out.length - 1]
    const { at, ...rest } = d
    const body = { ...rest, v: 2 as const, unit, seq: (tip?.seq ?? 0) + 1, at: Math.max(epochMicros(at), tip?.at ?? 0), prev: tip?.hash ?? GENESIS }
    out.push({ ...body, hash: eventHash(body) })
  }
  return out
}

export type ChainCheck = { ok: true; count: number; head: string } | { ok: false; count: number; head: string; firstBroken: number }

/**
 * Events whose own hash was already recomputed and matched. An event object never changes (the log
 * only grows by new objects), so its hash needs checking once: checking the log again after each
 * append then costs one SHA-256 per new event, not one per event of the whole chain. The links (prev,
 * seq) are still checked every time.
 */
const hashChecked = new WeakSet<AuditEvent>()
function hashHolds(e: AuditEvent): boolean {
  if (hashChecked.has(e)) return true
  const { hash, ...body } = e
  const ok = eventHash(body) === hash
  if (ok) hashChecked.add(e)
  return ok
}

/** First event whose hash, link or sequence is wrong (like ptw_verifica.py); none = intact. */
export function verifyChain(log: AuditEvent[]): ChainCheck {
  const head = log[log.length - 1]?.hash ?? GENESIS
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    const prev = i === 0 ? e.prev : log[i - 1].hash
    const seq = i === 0 ? e.seq : log[i - 1].seq + 1
    if (i === 0 && e.seq === 1 && e.prev !== GENESIS) return { ok: false, count: log.length, head, firstBroken: e.seq }
    if (e.seq !== seq || e.prev !== prev || e.v !== 2 || !hashHolds(e)) return { ok: false, count: log.length, head, firstBroken: e.seq }
  }
  return { ok: true, count: log.length, head }
}
