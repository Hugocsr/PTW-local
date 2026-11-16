/**
 * The permit's rows as the database's tables hold them (column names, values as to_jsonb writes them
 * in the audit: instants in UTC "…+00:00", hashes as bytea "\\x…"). The audit trail's row events
 * (`rowEvent`) are built from these, so the app writes the same events the triggers would.
 */
import { rowBytea, rowRange, rowTs, type Json, type Row } from "@/core/audit"
import type { Permit, PermitAttachment, PermitRevision } from "./types"

const ts = (iso: string | null) => (iso === null ? null : rowTs(iso))
const hex = (h: string | null) => (h === null ? null : rowBytea(h))

/** `ptw.permit` (assets, team and answers are their own tables). */
export function permitRow(p: Permit, unitId: string): Row {
  return {
    unit_id: unitId, id: p.id, number: p.number, template_id: p.templateId, version_id: p.versionId, state: p.state,
    holds: !["rascunho", "encerrada", "cancelada"].includes(p.state),
    author_id: p.authorId, location_id: p.locationId, work_window: rowRange(p.windowStart, p.windowEnd), scope: p.scope,
    snapshot_sha256: hex(p.snapshotSha256), snapshot_at: ts(p.snapshotAt), revision: p.revision, state_note: p.note,
    hold_reason: p.holdReason, hold_by: p.holdBy, hold_at: ts(p.holdAt),
    resumed_reason: p.resumedReason, resumed_by: p.resumedBy, resumed_at: ts(p.resumedAt),
    created_at: ts(p.createdAt), updated_at: ts(p.updatedAt), row_version: p.rowVersion,
  }
}

/** `ptw.permit_answer` of one item; undefined when the item has no answer. */
export function permitAnswerRow(p: Permit, itemId: string, unitId: string): Row | undefined {
  const v = p.answers[itemId]
  if (!v) return undefined
  const meta = p.answerMeta[itemId]
  return {
    unit_id: unitId, permit_id: p.id, item_id: itemId, value: v as unknown as Json,
    num: v.t === "numero" ? v.v : null,
    answered_by: meta?.answeredBy ?? p.authorId, answered_at: ts(meta?.answeredAt ?? p.updatedAt),
  }
}

export const permitAssetRow = (p: Pick<Permit, "id" | "state">, assetId: string, unitId: string): Row =>
  ({ unit_id: unitId, permit_id: p.id, asset_id: assetId, holds: !["rascunho", "encerrada", "cancelada"].includes(p.state) })

export const permitTeamRow = (p: Pick<Permit, "id">, roleId: string, personId: string, unitId: string): Row =>
  ({ unit_id: unitId, permit_id: p.id, role_id: roleId, role_fam: "cargo", person_id: personId })

export const permitRevisionRow = (r: PermitRevision, unitId: string): Row =>
  ({ unit_id: unitId, permit_id: r.permitId, rev: r.rev, at: rowTs(r.at), reason: r.reason, sha256: rowBytea(r.sha256) })

export const attachmentRow = (a: PermitAttachment, unitId: string): Row => ({
  unit_id: unitId, id: a.id, permit_id: a.permitId, item_id: a.itemId, kind: a.kind, sha256: rowBytea(a.sha256), file_name: a.fileName,
  preview_sha256: hex(a.previewSha256), width: a.width, height: a.height, duration_ms: a.durationMs, captured_by: a.capturedBy, captured_at: rowTs(a.capturedAt),
})
