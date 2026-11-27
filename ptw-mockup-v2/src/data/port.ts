/**
 * The data layer of the app: one interface (`DataPort`), two implementations.
 *
 * - `memoria` (`src/data/memory/`): the scenario in browser memory, written by the app's own pure rules
 *   (`permitReducer`, `registryStep`, `appendEvents`). Demo and tests.
 * - `api` (`src/data/api/`, package F1-09): the same shapes read from and written to the server
 *   (`ptw-server/api/openapi.yaml`). The caches hold reference data whole and the rest on demand.
 *
 * The screens never see this file: they keep using `useRegistry()`, `usePermits()`, `useAudit()` and
 * `useSim()` (same names, same shapes), whose providers read the port's cells; lists that the server
 * pages use the query hooks of `src/data/hooks.ts`.
 *
 * Shapes are the app's own types, which are the contract's `components.schemas` (database columns in
 * camelCase). Who acts is the session's person: `personId` in an act is what the memory mode uses and
 * what the `api` mode ignores.
 */
import type { AuditCtx, AuditDraft, AuditEvent, AuditGroup, ChainCheck } from "@/core/audit"
import type { BoardRow } from "@/core/board"
import type { RuleError } from "@/core/ptwErrors"
import type { PermitAction } from "@/permit/reducer"
import type { Permit, PermitAttachment, PermitData } from "@/permit/types"
import type { Asset, AttachKind, RegistryState } from "@/registry/types"
import type { RegistryAction } from "./memory/registry"
import type { ResultadoImportacao } from "@/core/templatePackage"

export type { RegistryAction } from "./memory/registry"

/** Where the data lives: `?dados=api` in the address, else `VITE_DADOS`, else `memoria`. */
export type DataMode = "memoria" | "api"

/** A value that changes, read by `useSyncExternalStore` (`useCell` in `context.tsx`). `get()` is stable until it changes. */
export interface Cell<T> {
  get(): T
  subscribe(onChange: () => void): () => void
}

/**
 * One write, asked. `refused` is what is known at once: the refusal of the core's own check (in memory,
 * the whole answer: the write is already applied or refused). `done` settles when the data layer has the
 * final answer: null = written, else the refusal (in `api`, the server's; decision D4: dialogs wait for
 * it). In memory `done` is already settled with the very same value as `refused`.
 *
 * Nothing changes on the screen before `done` in `api` mode (A17), except form answers, which show at
 * once and go back if refused.
 */
export interface Act {
  refused: RuleError | null
  done: Promise<RuleError | null>
}

/** An act that is already decided (memory mode, or a refusal known before any call). */
export const settled = (refused: RuleError | null): Act => ({ refused, done: Promise.resolve(refused) })

/* ---------- "Desfazer" ---------- */

let undoing = false
/**
 * Run a "Desfazer" so its writes are recorded as an undo of their own (`set_context(..., p_undo => true)`;
 * in `api` mode, the header `X-Ptw-Undo: true`). Module-level so plain helpers (a toast built outside a
 * component) can use it. Only the writes started synchronously inside `fn` are marked.
 */
export function runAsUndo(fn: () => void) {
  const was = undoing
  undoing = true
  try { fn() } finally { undoing = was }
}
/** True while a "Desfazer" runs (read by the implementations when a write starts). */
export const isUndoing = () => undoing

/* ---------- session, clock and server (useSim) ---------- */

export interface SessionState {
  /**
   * `aberta`: there is a person. `ausente`: nobody is in (only in `api`; the app shows the entry screen).
   * `carregando`: not known yet.
   */
  status: "aberta" | "ausente" | "carregando"
  /** The person who acts ("" while there is none). */
  personId: string
  /** Now, as an instant with the unit's offset: the simulated clock, or the server's (`GET /health`). */
  now: string
  /** "AAAA-MM-DD" of `now` in the unit's time zone. */
  today: string
  tz: string
  /** The server does not answer (`GET /status` failed): everything that saves is locked; Parar stays. */
  serverDown: boolean
  /** The person only consults (no cargo). */
  isAuditor: boolean
  /** The development entry is on (`Session.devLogin`): changing person is allowed. Always true in memory. */
  devLogin: boolean
  /** Entry modes and administrative permissions are supplied by the server, never inferred from cargos. */
  passwordLogin: boolean
  /** Wait, in ms, between the last change to a draft and its automatic save (`PTW_DRAFT_AUTOSAVE_SECONDS`, from `GET /health`; 5 s by default). */
  draftAutosaveMs: number
  grants: SessionGrant[]
  /** A failure while opening the session's reference data; never show an empty cache as a loaded app. */
  error?: RuleError | null
}

export type SessionGrant = "cadastro" | "modelos" | "auditoria" | "exportacao"

export interface EntryPerson { id: string; name: string; login: string }

export interface SessionPort extends Cell<SessionState> {
  /** Act as this person: the simulated person in memory; `POST /session/dev-login` (by the person's login) in `api`. */
  setPerson(personId: string): void
  devLogin?(login: string): Promise<RuleError | null>
  login?(login: string, password: string): Promise<RuleError | null>
  /** Human interaction only; automatic reads and polling never call this. */
  activity?(): Promise<RuleError | null>
  entryPeople?(): Promise<EntryPerson[] | RuleError>
  retry?(): Promise<RuleError | null>
  /** Re-reads the effective permissions (`GET /session`; SPEC 002: groups grant them, and they change between calls). Absent in memory. */
  refreshGrants?(): Promise<void>
  /** `POST /session/logout`. Absent in memory. */
  logout?(): Promise<RuleError | null>
  /** Simulation only ("Avançar o relógio", "Servidor fora do ar", "Restaurar exemplo"): absent in `api` (A19). */
  advance?(minutes: number): void
  setServerDown?(down: boolean): void
  reset?(): void
}

/* ---------- cadastro e modelos (useRegistry) ---------- */

/**
 * The registry cache: unit, types, places, people, lists and models whole (reference data, kept in step
 * by `updatedSince`); assets and relations whole in memory, on demand in `api` (A16).
 *
 * `write` covers the contract's `cadastro` and `modelos` writes, one action each:
 * upsert/update → `POST`/`PUT /locations|assets|people|option-lists|templates(/versions)` (with `If-Match`
 * from the cached `revision`) and `POST /asset-relations`; addType/renameType/setTypeIcon/setTypeActive →
 * `POST`/`PUT /types`; removeType/removeRelation/removeOptionList/removeTemplate → the `DELETE`s;
 * restore/restoreType (the "Desfazer" of a removal) → the create again, inside `runAsUndo`;
 * importTemplate → `POST /templates/import/confirm`.
 */
export interface RegistryPort extends Cell<RegistryState> {
  write(action: RegistryAction): Act
  loadAsset?(id: string): Promise<Asset | RuleError>
  previewImport?(input: { arquivo: string; pacote: string }): Promise<ImportPreview | RuleError>
  confirmImport?(input: { arquivo: string; pacote: string; token: string; key: string }): Promise<{ templateId: string; versionId: string } | RuleError>
  exportTemplate?(templateId: string, versionId: string, reason: string): Promise<{ text: string } | RuleError>
}

export type ImportPreview = ResultadoImportacao & { token?: string; sha256: string }

/* ---------- PT (usePermits) ---------- */

/** The acts a person does on a PT. `sign` on a rascunho or devolvida is Enviar / Reenviar (`POST /permits/{id}/submit`). */
export type PermitAct = Exclude<PermitAction, { kind: "expire" } | { kind: "attach" }>

/**
 * The permit cache (permits, signatures, revisions, extensions, attachments, blobs, frozen forms): whole
 * in memory; in `api`, Minha área's set (`GET /permits/mine`) plus every PT opened (`GET /permits/{id}`).
 *
 * `act`: sign → `POST /permits/{id}/signatures` (or `/submit`), refuse → `/return`, stop → `/stop`,
 * resume → `/resume`, extend → `/extensions`, answer → `PUT`/`DELETE /permits/{id}/answers/{itemId}`.
 */
export interface PermitPort extends Cell<PermitData> {
  act(a: PermitAct): Act
  create?(input: PermitDraft): Promise<Permit | RuleError>
  updateDraft?(id: string, input: Omit<PermitDraft, "id" | "templateId" | "versionId">): Promise<Permit | RuleError>
  discard?(id: string, reason: string): Promise<RuleError | null>
  /** A captured file: `PUT /blobs/{sha256}` then `POST /permits/{id}/attachments`. The row, or null when refused. */
  capture(permitId: string, personId: string, itemId: string, kind: AttachKind, file: File): Promise<PermitAttachment | null>
  /** Where the browser reads a stored file from: an object URL in memory, `/attachments/{id}/content` in `api`. */
  urlOf(sha256: string): string | undefined
  /**
   * Brings one PT (by id or number) into the cache if it is not there (`GET /permits/{id}`); in memory it is
   * always there. Resolves with the PT, or null when it does not exist.
   */
  load(idOrNumber: string): Promise<Permit | null>
}

export interface PermitDraft {
  id?: string
  templateId: string
  versionId?: string
  locationId: string
  assetIds: string[]
  team: Record<string, string[]>
  windowStart: string
  windowEnd: string
  scope: string
}

/* ---------- auditoria (useAudit) ---------- */

/** Filters of the trail, as `GET /audit/events` takes them. */
export interface AuditQuery {
  groups?: AuditGroup[]
  /** First segment of the action ("pt", "cadastro", …). */
  area?: string
  /** A person's id; `null` = events with no person (the system). */
  actorId?: string | null
  permitId?: string
  assetId?: string
  /** "AAAA-MM-DD" (the unit's day) or an instant: events from it on. */
  from?: string
  to?: string
  q?: string
  /** Cursor: events with `seq` below this. */
  before?: number
  limit?: number
}

/** A page of the trail, newest first. `matched`: how many events pass the filters (null when the server does not say). */
export interface AuditPage { items: AuditEvent[]; nextBefore: number | null; matched: number | null }

/** What the trail's filters offer (`GET /audit/facets`). */
export interface AuditFacets { actorIds: string[]; areas: string[]; total: number }

/** A finished export (`POST /audit/exports` + the two downloads): the texts to save, as `ptw_verifica.py` reads them. */
export interface AuditExportFiles { baseName: string; jsonl: string; manifest: string; events: number }

/**
 * The audit trail. The cell is the part of the chain the app holds: all of it in memory; in `api`, the
 * pages read so far (the server writes the trail; the app never appends to it).
 */
export interface AuditPort extends Cell<AuditEvent[]> {
  /**
   * Notes the app itself makes. In memory every draft is appended (writes of the stores, reads, session,
   * system). In `api` only the reads matter and go to their own calls: `acesso.pt.aberta` →
   * `POST /permits/{id}/access`; the others (`acesso.auditoria.*`, `acesso.anexo.*`, `acesso.exportacao`)
   * are written by the server when the data is read, and are dropped here.
   */
  record(drafts: AuditDraft[]): void
  /** Who acts now and how (`ptw.set_context`): the session's person and clock; "Desfazer" inside `runAsUndo`. */
  ctx(): AuditCtx
  /** Recomputes the chain (`POST /audit/chain/verify`; in memory, `verifyChain` over the log). */
  verify(): Promise<ChainCheck>
  /** Exports the whole trail with its reason (ptw-auditoria/2) and records `acesso.exportacao`. */
  exportAll(reason: string): Promise<AuditExportFiles | RuleError>
}

/* ---------- lists the server pages (src/data/hooks.ts) ---------- */

/** What a list shows: the `DataTable`'s own view (search, one-of filters by name, sort, page). */
export interface ListView {
  q: string
  /** Quadro only: each row comes with the PT's answers (the "Desabilitados agora" panel). Not an opened PT. */
  answers?: boolean
  /** Filter name → chosen value; absent or "all" = no filter. Quadro: `segment`. Ativos: `typeId`, `locationId`. */
  filters?: Record<string, string>
  /**
   * Sort key and direction; null = the list's own order. Keys are the contract's: Quadro `state`, `number`,
   * `windowStart`, `location`, `template`; Ativos `code`, `name`.
   */
  sort: { id: string; dir: "asc" | "desc" } | null
  /** From 0. Past the end, the last page is given. */
  page: number
  pageSize: number
}

export interface Page<T> {
  items: T[]
  /** Rows that pass the filters. */
  total: number
  /** Rows of the collection, with no filter (the header count). */
  all: number
  page: number
  pageSize: number
}

/**
 * How a screen matches rows that are all in memory: exactly what its `DataTable` does today. Used only
 * while the cache is whole (`DataPort.whole`); the server does its own matching otherwise.
 */
export interface ListLocal<T> {
  /** Text the search looks at. Pass a stable function: the lowercased text is kept per function and row. */
  searchText: (row: T) => string
  /** Filter name → test (the `SegmentFilter`/`SelectFilter` tests). */
  tests?: Record<string, (row: T, value: string) => boolean>
  /** Sort key → comparator (the columns' `sort`). */
  sorts?: Record<string, (a: T, b: T) => number>
}

/**
 * The paged reads (A18). In memory they answer from the scenario with the default matching of
 * `memory/query.ts`; the hooks do not call them while `whole` is true (they compute in the render, with
 * the screen's own matching, so nothing flashes "carregando").
 */
export interface EquipmentHold {
  assetId: string
  heldAssetId: string
  heldAssetCode: string
  permitId: string
  number: string | null
  state: Permit["state"]
}

export interface QueryPort {
  /** Grows when the server says something changed (`GET /events`): the hooks ask again. Never changes in memory. */
  changed: Cell<number>
  changes?: Partial<Record<"assets" | "permits" | "audit" | "appearance" | "groups" | "delegations", Cell<number>>>
  locationAssetCounts?(ids: string[]): Promise<{ locationId: string; count: number }[]>
  /** `GET /locations/with-assets`: the places with at least one active asset (of these types; none = any), below included (SPEC 017). Memory computes it from the registry. */
  locationsWithAssets?(assetTypeIds: string[]): Promise<{ locationId: string; count: number }[]>
  /** `GET /permits` (+ `/permits/counts` for `all`). Another person's draft never appears. */
  permitBoard(view: ListView): Promise<Page<BoardRow>>
  /** `GET /assets` (filters `typeId`, `locationId` = this place or below). */
  assets(view: ListView): Promise<Page<Asset>>
  /** Current holds, including ancestors and descendants linked by "parte de". */
  equipmentHolds?(assetIds: string[]): Promise<EquipmentHold[]>
  /** PT's own history, excluding reads; it does not register an Auditoria search. */
  permitHistory?(permitId: string): Promise<AuditPage & { accesses?: number }>
  /** `GET /audit/events`. */
  auditEvents(q: AuditQuery): Promise<AuditPage>
  /** `GET /audit/facets`. */
  auditFacets(): Promise<AuditFacets>
}

/* ---------- the port ---------- */

export interface DataPort {
  appearance: AppearancePort
  groups: GroupPort
  delegations: DelegationPort
  mode: DataMode
  /**
   * True when the caches hold the whole unit (memory): lists filter, sort and page in the render. False
   * (`api`): lists ask `queries`, and a record may have to be loaded before it shows.
   */
  whole: boolean
  session: SessionPort
  registry: RegistryPort
  permits: PermitPort
  audit: AuditPort
  queries: QueryPort
  /**
   * Starts what runs by itself (the clock, expiry, synchronisation, the event stream) and returns how to
   * stop it. Called once per mounted provider (twice under StrictMode: start, stop, start).
   */
  start(): () => void
}

/** What `src/data/api/index.ts` exports as `createApiPort` (loaded only in `api` mode). */
export type CreateApiPort = () => DataPort | Promise<DataPort>

export interface AppearancePort {
  read(): Promise<import("@/core/appearance").AppearanceRecord | import("@/core/ptwErrors").RuleError>
  save(brand: import("@/core/brand").Brand | null, revision: number): Promise<import("@/core/appearance").AppearanceRecord | import("@/core/ptwErrors").RuleError>
  upload(base64: string): Promise<{ file: string } | import("@/core/ptwErrors").RuleError>
}

/** Corpo da rota da SPEC 007: só os grupos cuja participação muda; `roles` ausente = cargos não mudam. */
export interface AccessAssignment {
  groups: { id: string; revision: number; member: boolean }[]
  roles?: import("@/registry/types").Person["roles"]
}

export interface GroupPort {
  read(): Promise<import("@/core/governance").PersonGroup[] | RuleError>
  save(group: import("@/core/governance").GroupInput, revision: number | null): Promise<import("@/core/governance").PersonGroup | RuleError>
  /** Access profiles (SPEC 002): `GET/POST/PUT /access-profiles`. */
  profiles(): Promise<import("@/core/governance").AccessProfile[] | RuleError>
  saveProfile(profile: import("@/core/governance").AccessProfileInput, revision: number | null): Promise<import("@/core/governance").AccessProfile | RuleError>
  /** Permissions a person gets from groups (`GET /people/{id}/access`). */
  personAccess(personId: string): Promise<import("@/core/governance").GrantSource[] | RuleError>
  /**
   * SPEC 007: entra e sai de grupos e troca os cargos numa só transação (`PUT /people/{id}/access-assignments`).
   * `personRevision` vai no If-Match; a pessoa devolvida já está no cadastro em cache.
   */
  saveAssignments(personId: string, personRevision: number, body: AccessAssignment): Promise<{ person: import("@/registry/types").Person; groups: import("@/core/governance").PersonGroup[] } | RuleError>
}

export interface DelegationPort {
  read(): Promise<import("@/core/delegation").Delegation[] | RuleError>
  create(input: import("@/core/delegation").DelegationInput): Promise<import("@/core/delegation").Delegation | RuleError>
  revoke(input: import("@/core/delegation").Delegation, reason: string, key: string): Promise<import("@/core/delegation").Delegation | RuleError>
  /** SPEC 003: edits an agendada delegation (`PUT /delegations/{id}`, If-Match = its revision). */
  update(current: import("@/core/delegation").Delegation, changes: import("@/core/delegation").DelegationUpdate, key: string): Promise<import("@/core/delegation").Delegation | RuleError>
}
