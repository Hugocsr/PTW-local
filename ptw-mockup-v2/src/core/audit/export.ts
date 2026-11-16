/** Export (ptw-auditoria/2, read by tools/ptw_verifica.py). */
import { canonicalJson, eventBody } from "./canonical.ts"
import { microsToUtc } from "./micros.ts"
import type { AuditEvent, JsonObject } from "./types.ts"
import { GENESIS } from "./types.ts"

/** One canonical line per event: the 19 hashed keys plus "hash", "prev" and "quando" (UTC). */
export function exportLine(e: AuditEvent): string {
  return canonicalJson({ ...eventBody(e), hash: e.hash, prev: e.prev, quando: microsToUtc(e.at) })
}
export function exportJsonl(log: AuditEvent[]): string {
  return log.map((e) => `${exportLine(e)}\n`).join("")
}
/** File name of an export: "auditoria-UN01-1-152". */
export const exportBaseName = (unitCode: string, log: AuditEvent[]) =>
  `auditoria-${unitCode}-${log.length ? `${log[0].seq}-${log[log.length - 1].seq}` : "vazio"}`

/** The manifest next to the JSONL, in the format ptw_exporta.py writes (without anchors: the app has none). */
export function exportManifest(log: AuditEvent[], o: { unitCode: string; tz: string; from: string; to: string; reason: string; generatedAt: string; jsonlBytes: number; jsonlSha256: string }): JsonObject {
  return {
    formato: "ptw-auditoria/2",
    unidade: log[0]?.unit ?? null, codigo: o.unitCode, fuso: o.tz,
    periodo: { de: o.from, ate: o.to },
    primeiro_seq: log[0]?.seq ?? null, ultimo_seq: log[log.length - 1]?.seq ?? null, eventos: log.length,
    prev_hash_inicial: log[0]?.prev ?? GENESIS, hash_final: log[log.length - 1]?.hash ?? GENESIS,
    arquivo: { nome: `${exportBaseName(o.unitCode, log)}.jsonl`, bytes: o.jsonlBytes, sha256: o.jsonlSha256 },
    ancoras: [], retencao: [],
    motivo: o.reason, gerado_em: o.generatedAt,
  }
}
