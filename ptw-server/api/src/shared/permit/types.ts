// @ts-nocheck — cópia de ptw-mockup-v2/src/permit/types.ts; não edite (node scripts/sync-shared.mjs)
import type { PermitState } from "@/core/permitState"
import type { FormAnswers } from "@/core/form"
import type { AttachKind, FormSpec } from "@/registry/types"

/**
 * A permit, shaped like `ptw.permit` (ptw-server/db/schema/30_pt.sql): column names in camelCase,
 * instants ISO 8601 with offset. Assets, team and answers stay nested (1:n), as the plan allows.
 */
export interface Permit {
  id: string
  /** Given by the server at submission; drafts have none. */
  number: string | null
  templateId: string
  versionId: string
  state: PermitState
  authorId: string
  locationId: string
  assetIds: string[]
  /** cargo id -> people on the crew (crew without login is fine). `permit_team`. */
  team: Record<string, string[]>
  /** `work_window`, closed at both ends: instants with offset. */
  windowStart: string
  windowEnd: string
  /** Fixed, mandatory field on every permit (1–500). */
  scope: string
  /** Form answers keyed by the template item id (`permit_answer.value`). */
  answers: FormAnswers
  /** `permit_answer.answered_by/answered_at`, per item. */
  answerMeta: Record<string, { answeredBy: string; answeredAt: string }>
  /** SHA-256 (hex) of the form frozen at the first Enviar (`form_snapshot`); null on a draft. */
  snapshotSha256: string | null
  snapshotAt: string | null
  /** Signed revision: moves on at each resend after a return. */
  revision: number
  /** `state_note`: written only by the transitions (Devolver's reason, "Janela encerrada"); cleared at Enviar. */
  note: string | null
  /** Parar: the three together (`hold_*`). While set, the next acceptance waits for a Retomada. */
  holdReason: string | null
  holdBy: string | null
  holdAt: string | null
  /** Retomar: the three together (`resumed_*`); a suspensa permit then waits for a new Aceite no campo. */
  resumedReason: string | null
  resumedBy: string | null
  resumedAt: string | null
  createdAt: string
  updatedAt: string
  /** Optimistic concurrency (`row_version`): +1 at every write. Not the signed revision. */
  rowVersion: number
  /** Most recent immutable shift revalidation; previous records remain in the audit trail. */
  revalidation?: PermitRevalidation | null
}

export interface PermitRevalidation {
  id: string
  originalStart?: string
  shiftStart: string
  shiftEnd: string
  newEnd: string
  reason: string
  personId: string
  at: string
}

/** `ptw.signature`: never changes nor disappears; it can only be voided, once, with a reason. */
export interface SignatureRec {
  delegationId?: string | null
  representedPersonId?: string | null
  id: string
  permitId: string
  rev: number
  slotId: string
  personId: string
  signedAt: string
  voidedAt: string | null
  voidedReason: string | null
}

/** `ptw.permit_revision`: one row per resend (no row for the first revision). */
export interface PermitRevision {
  permitId: string
  rev: number
  at: string
  reason: string
  /** SHA-256 (hex) of the permit content when the revision opened. */
  sha256: string
}

/** `ptw.attachment`: insert only. The bytes live in the blob store, addressed by `sha256`. */
export interface PermitAttachment {
  id: string
  permitId: string
  itemId: string
  kind: AttachKind
  sha256: string
  fileName: string
  previewSha256: string | null
  width: number | null
  height: number | null
  durationMs: number | null
  capturedBy: string
  capturedAt: string
}

/**
 * `ptw.permit_extension`: one row per Prorrogar (insert only). The window's end moved from `oldEnd`
 * to `newEnd` (instants with offset) at `at`, by `personId`, with `reason` (1–500).
 */
export interface PermitExtension {
  id: string
  permitId: string
  /** The permit's signed revision when it was extended. */
  revision: number
  oldEnd: string
  newEnd: string
  reason: string
  personId: string
  at: string
}

/** `ptw.blob`: content addressed by SHA-256. `url` exists only in the simulation (object URL). */
export interface BlobRec { sha256: string; size: number; mime: string; storedAt: string; url: string }

export interface PermitData {
  permits: Permit[]
  signatures: SignatureRec[]
  revisions: PermitRevision[]
  attachments: PermitAttachment[]
  blobs: Record<string, BlobRec>
  /** `form_snapshot`: frozen forms by SHA-256 (hex). */
  formSnapshots: Record<string, FormSpec>
  /** `permit_extension`: every Prorrogar, in order. */
  extensions: PermitExtension[]
}
