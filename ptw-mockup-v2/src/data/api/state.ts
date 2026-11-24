/**
 * What the `api` modules share: the cells, the helpers that fold an answer of the server into them, and
 * the few answer shapes that have no type of their own in the app. The answers are the app's types as
 * they come (no conversion), except `TypeDef.family` → the four lists (`registry.ts`).
 */
import type { AuditCtx, AuditEvent } from "@/core/audit"
import type { RuleError } from "@/core/ptwErrors"
import type { Permit, PermitAttachment, PermitData, PermitExtension, PermitRevision, SignatureRec, BlobRec } from "@/permit/types"
import type { Asset, FormSpec, PermitTemplate, RegistryState } from "@/registry/types"
import type { Box } from "../cell"
import { isUndoing, type SessionState } from "../port"
import type { Http } from "./http"

/** `PermitDetail` of the contract, in the app's types. */
export interface PermitDetail {
  permit: Permit
  form: FormSpec
  signatures: SignatureRec[]
  revisions: PermitRevision[]
  extensions: PermitExtension[]
  attachments: PermitAttachment[]
  blobs: Record<string, Omit<BlobRec, "url">>
  assets: Asset[]
  currentStageId: string | null
  blocker?: string | null
  released: boolean
  now: string
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export const emptyRegistry = (): RegistryState => ({
  units: [], locationTypes: [], assetTypes: [], roleTypes: [], relationKinds: [],
  locations: [], assets: [], relations: [], people: [], templates: [], optionLists: [],
})
export const emptyPermits = (): PermitData => ({ permits: [], signatures: [], revisions: [], attachments: [], blobs: {}, formSnapshots: {}, extensions: [] })

/** Everything the modules of `api/` share. */
export interface Shared {
  http: Http
  session: Box<SessionState>
  registry: Box<RegistryState>
  permits: Box<PermitData>
  audit: Box<AuditEvent[]>
  /** Grows when the server says something changed (`queries.changed`). */
  changed: Box<number>
  changes: Record<"assets" | "permits" | "audit" | "appearance" | "groups" | "delegations", Box<number>>
  /** Assets known so far, by id (the registry's `assets` is this, in insertion order). */
  assets: Map<string, Asset>
  /** The unit's time zone. */
  tz(): string
  /** Server's now, as an instant with the unit's offset. */
  now(): string
  /** Who acts and how (`ptw.set_context`). */
  ctx(): AuditCtx
}

export const refusal = (code: string, message: string): RuleError => ({ code: code as RuleError["code"], message })

/** Puts assets into the cache; the registry's array changes only when something was new or different. */
export function addAssets(s: Shared, items: readonly Asset[]) {
  let changed = false
  for (const a of items) {
    const old = s.assets.get(a.id)
    if (old && old.revision >= a.revision && old.updatedAt === a.updatedAt) continue
    s.assets.set(a.id, a); changed = true
  }
  if (changed) s.registry.set({ ...s.registry.get(), assets: [...s.assets.values()] })
}

/** A PT with all that belongs to it replaces what the cache had of it. */
export function mergeDetail(s: Shared, d: PermitDetail) {
  const id = d.permit.id
  const data = s.permits.get()
  const has = data.permits.some((p) => p.id === id)
  const own = <T extends { permitId: string }>(old: T[], now: T[]) => [...old.filter((x) => x.permitId !== id), ...now]
  const blobs = { ...data.blobs }
  for (const [sha, b] of Object.entries(d.blobs)) blobs[sha] = { ...b, url: "" }
  s.permits.set({
    permits: has ? data.permits.map((p) => (p.id === id ? d.permit : p)) : [...data.permits, d.permit],
    signatures: own(data.signatures, d.signatures),
    revisions: own(data.revisions, d.revisions),
    extensions: own(data.extensions, d.extensions),
    attachments: own(data.attachments, d.attachments),
    blobs,
    formSnapshots: d.permit.snapshotSha256 ? { ...data.formSnapshots, [d.permit.snapshotSha256]: d.form } : data.formSnapshots,
  })
  addAssets(s, d.assets)
}

/** Replaces one template in the registry cache (by id; appended when new). */
export function putTemplate(s: Shared, t: PermitTemplate) {
  const r = s.registry.get()
  const has = r.templates.some((x) => x.id === t.id)
  s.registry.set({ ...r, templates: has ? r.templates.map((x) => (x.id === t.id ? t : x)) : [...r.templates, t] })
}

/** The "Desfazer" flag of a write, read when the write starts. */
export const undoNow = () => isUndoing()
