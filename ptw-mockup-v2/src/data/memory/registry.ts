/**
 * The registry's writes in memory, with the database's rules enforced (AGENTS.md: "na loja de dados").
 * Pure: `registryStep` takes the state, one action, the live permits and who acts, and gives the new
 * state with its audit drafts, or the refusal. Re-exported by `@/registry/store` (the core tests and the
 * scenarios import it from there).
 */
import { deniedEvent, type AuditCtx, type AuditDraft } from "@/core/audit"
import { newCollision, nonHoldingVersionIds, partOfKindIds } from "@/core/equipmentLock"
import type { RuleError } from "@/core/ptwErrors"
import { locationParentDenied, partOfCycle, uniqueDenied } from "@/core/registryRules"
import { aplicarImportacao, type Rascunho } from "@/core/templatePackage"
import { templateNameDenied, versionChangeDenied } from "@/core/templateVersions"
import { uuidv7 } from "@/lib/id"
import type { Permit } from "@/permit/types"
import { registryEvents, registryLookups } from "@/registry/audit"
import { importEvents, templateEvents } from "@/registry/auditModelos"
import { guessTypeIcon } from "@/registry/typeIcons"
import type { RecordList, RegistryState, TypeDef, TypeList } from "@/registry/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithId = { id: string } & Record<string, any>

/** One write of the registry (the name the data layer uses for `Action`). */
export type RegistryAction = Action

export type Action =
  | { kind: "upsert"; list: RecordList; item: WithId }
  | { kind: "addType"; list: TypeList; label: string }
  | { kind: "removeRelation"; id: string }
  | { kind: "renameType"; list: TypeList; id: string; label: string }
  | { kind: "setTypeIcon"; list: TypeList; id: string; icon: string }
  | { kind: "setTypeActive"; list: TypeList; id: string; active: boolean }
  | { kind: "removeType"; list: TypeList; id: string }
  | { kind: "removeTemplate"; id: string }
  | { kind: "removeOptionList"; id: string }
  | { kind: "restore"; list: RecordList; item: WithId; index: number }
  | { kind: "restoreType"; list: TypeList; item: TypeDef; index: number }
  | { kind: "update"; list: RecordList; id: string; fn: (item: WithId) => WithId }
  /** "Importar modelo" confirmed: new types and lists, then the model/version, in one step. */
  | { kind: "importTemplate"; draft: Rascunho }

/** System-generated id: a uuid v7, as the database makes it. The prefix is ignored (kept for old calls). */
export function newId(prefix?: string): string {
  void prefix
  return uuidv7()
}

/** Lists whose records carry `revision`/`updatedAt` (relations do not: the table has neither). */
const REVISED: RecordList[] = ["locations", "assets", "people", "templates", "optionLists"]

/** `at` = instant of the write (updatedAt). */
function reducer(state: RegistryState, action: Action, at: string): RegistryState {
  switch (action.kind) {
    case "upsert": {
      const list = state[action.list] as unknown as (WithId & { revision?: number })[]
      const exists = list.find((r) => r.id === action.item.id)
      const revised = REVISED.includes(action.list)
      const next = exists
        ? list.map((r) => (r.id === action.item.id ? (revised ? { ...action.item, revision: (r.revision ?? 0) + 1, updatedAt: at } : action.item) : r))
        : [...list, revised ? { ...action.item, revision: 1, updatedAt: at } : action.item]
      return { ...state, [action.list]: next }
    }
    case "addType": {
      const t: TypeDef = {
        id: uuidv7(), label: action.label, active: true,
        // A new location or asset type starts with the icon its name suggests; it can be changed after.
        ...(action.list === "locationTypes" || action.list === "assetTypes" ? { icon: guessTypeIcon(action.label, action.list) } : {}),
      }
      return { ...state, [action.list]: [...state[action.list], t] }
    }
    case "setTypeIcon":
      return { ...state, [action.list]: state[action.list].map((t) => (t.id === action.id ? { ...t, icon: action.icon } : t)) }
    case "setTypeActive":
      return { ...state, [action.list]: state[action.list].map((t) => (t.id === action.id ? { ...t, active: action.active } : t)) }
    case "renameType":
      return { ...state, [action.list]: state[action.list].map((t) => (t.id === action.id ? { ...t, label: action.label } : t)) }
    case "removeTemplate":
      return { ...state, templates: state.templates.filter((t) => t.id !== action.id) }
    case "removeOptionList":
      return { ...state, optionLists: state.optionLists.filter((l) => l.id !== action.id) }
    case "removeType":
      return { ...state, [action.list]: state[action.list].filter((t) => t.id !== action.id) }
    case "removeRelation":
      return { ...state, relations: state.relations.filter((r) => r.id !== action.id) }
    case "restore": {
      // Undo of a removal: put the record back exactly where it was (no new revision).
      const list = (state[action.list] as unknown as WithId[]).filter((r) => r.id !== action.item.id)
      const next = [...list.slice(0, action.index), action.item, ...list.slice(action.index)]
      return { ...state, [action.list]: next }
    }
    case "restoreType": {
      const list = state[action.list].filter((t) => t.id !== action.item.id)
      return { ...state, [action.list]: [...list.slice(0, action.index), action.item, ...list.slice(action.index)] }
    }
    case "importTemplate":
      return aplicarImportacao(state, action.draft)
    case "update": {
      // Change one record from its current value (safe inside a late toast action).
      const list = state[action.list] as unknown as (WithId & { revision?: number })[]
      const revised = REVISED.includes(action.list)
      return {
        ...state,
        [action.list]: list.map((r) => (r.id === action.id ? (revised ? { ...action.fn(r), revision: (r.revision ?? 0) + 1, updatedAt: at } : action.fn(r)) : r)),
      }
    }
  }
}

export interface RegistryStep { state: RegistryState; events: AuditDraft[]; /** Why the write was refused (nothing applied; one denied event recorded). */ denied?: RuleError }

const TYPE_LISTS: TypeList[] = ["locationTypes", "assetTypes", "roleTypes", "relationKinds"]
const RECORD_LISTS: Exclude<RecordList, "templates">[] = ["locations", "assets", "people", "relations", "optionLists"]

/** Items of `after` that are new or were rewritten (the reducer keeps untouched items by reference). */
const touched = <T extends { id: string }>(before: T[], after: T[]) => after.filter((x) => before.find((y) => y.id === x.id) !== x)
const gone = <T extends { id: string }>(before: T[], after: T[]) => before.filter((x) => !after.some((y) => y.id === x.id))

/** Where a type is still referenced (the database foreign keys): records, scopes, signatures, form items. */
export function typeInUse(s: RegistryState, list: TypeList, id: string): boolean {
  const versions = s.templates.flatMap((t) => t.versions)
  switch (list) {
    case "locationTypes": return s.locations.some((l) => l.typeId === id) || versions.some((v) => v.locationTypeIds.includes(id))
    case "assetTypes": return s.assets.some((a) => a.typeId === id) || versions.some((v) => v.assetTypeIds.includes(id))
    case "relationKinds": return s.relations.some((r) => r.kindId === id)
    case "roleTypes": return s.people.some((p) => p.roles.some((r) => r.roleId === id))
      || versions.some((v) => v.stages.some((st) => st.slots.some((sl) => sl.roleIds.includes(id)))
        || (v.form?.sections ?? []).some((sec) => sec.items.some((i) => i.kind === "pessoa" && i.roleId === id)))
  }
}

/** A list some model's form still offers (a removed list would break that form). */
export const listInUse = (s: RegistryState, id: string) =>
  s.templates.some((t) => t.versions.some((v) => (v.form?.sections ?? []).some((sec) => sec.items.some((i) =>
    (i.kind === "marcacao" && i.listId === id) || (i.kind === "verificacao" && i.answerListId === id)
    || (i.kind === "grupo" && i.columns.some((c) => (c.kind === "marcacao" && c.listId === id) || (c.kind === "verificacao" && c.answerListId === id)))))))

/** The first rule the write breaks, checked as the database would on the rows it touches. */
function guard(before: RegistryState, after: RegistryState, permits: Permit[]): RuleError | null {
  for (const list of TYPE_LISTS) {
    for (const t of touched(before[list], after[list])) { const e = uniqueDenied(list, after, t as unknown as WithId); if (e) return e }
    for (const t of gone(before[list], after[list])) {
      if (t.systemKey) return { code: "23514", message: `“${t.label}” é usado pelas regras do sistema e não pode ser removido` }
      if (typeInUse(after, list, t.id)) return { code: "23503", message: `“${t.label}” está em uso e não pode ser removido` }
    }
  }
  for (const list of RECORD_LISTS) {
    for (const r of touched(before[list] as WithId[], after[list] as WithId[])) { const e = uniqueDenied(list, after, r); if (e) return e }
  }
  for (const l of touched(before.locations, after.locations)) { const e = locationParentDenied(after.locations, l.id, l.parentId); if (e) return e }
  for (const l of gone(before.optionLists, after.optionLists)) if (listInUse(after, l.id)) return { code: "23503", message: `A lista “${l.name}” é usada por um modelo` }
  const partOf = partOfKindIds(after.relationKinds)
  for (const r of touched(before.relations, after.relations)) {
    if (partOfCycle(after.relations, partOf, r)) return { code: "PTW11", message: "A relação criaria um ciclo em \"parte de\"" }
  }
  if (before.templates !== after.templates) {
    const usedBy = (versionId: string) => permits.some((p) => p.versionId === versionId)
    for (const t of touched(before.templates, after.templates)) { const e = templateNameDenied(after.templates, t); if (e) return e }
    for (const id of new Set([...before.templates, ...after.templates].map((t) => t.id))) {
      const b = before.templates.find((t) => t.id === id), a = after.templates.find((t) => t.id === id)
      if (b === a) continue
      const e = versionChangeDenied(b, a, usedBy, after.optionLists)
      if (e) return e
    }
  }
  const clash = newCollision(permits, before.relations, after.relations, partOf, nonHoldingVersionIds(after.templates))
  if (clash) {
    const n = (p: Permit) => p.number ?? "PT sem número"
    return { code: "PTW10", message: `A relação juntaria duas PTs abertas no mesmo equipamento (${n(clash[0])} e ${n(clash[1])})`, detail: clash[0].id }
  }
  return null
}

/** The audit events of one applied write: registry rows, then models (or the import). */
function stepEvents(before: RegistryState, after: RegistryState, action: Action, permits: Permit[], ctx: AuditCtx): AuditDraft[] {
  const out = registryEvents(before, after, ctx, registryLookups(before, after, permits))
  if (action.kind === "importTemplate") return [...out, ...importEvents(before, after, action.draft, ctx)]
  if (before.templates !== after.templates) {
    for (const id of new Set([...before.templates, ...after.templates].map((t) => t.id))) {
      const b = before.templates.find((t) => t.id === id), a = after.templates.find((t) => t.id === id)
      if (b !== a) out.push(...templateEvents(b, a, ctx))
    }
  }
  return out
}

/**
 * One write with the database's rules enforced in the store (AGENTS.md: "na loja de dados"):
 * sizes and unique keys, a location never inside itself, no cycle in "é parte de", no change to a
 * version in use, and the equipment lock (a write that would make two open PTs share equipment).
 * A refused write changes nothing and is recorded as denied, with the database code.
 * Pure; exported for the core tests.
 */
export function registryStep(before: RegistryState, action: Action, permits: Permit[], ctx: AuditCtx): RegistryStep {
  const after = reducer(before, action, ctx.at)
  if (after === before) return { state: before, events: [] }
  const denied = guard(before, after, permits)
  if (denied) {
    // The denied event names the action that was tried (the relation, when the relation is the problem).
    const tried = stepEvents(before, after, action, permits, ctx)
    const first = (denied.code === "PTW10" || denied.code === "PTW11" ? tried.find((d) => d.entity === "asset_relation") : undefined) ?? tried[0]
    return { state: before, events: [deniedEvent(first?.action ?? "cadastro", denied, null, ctx, first?.data)], denied }
  }
  return { state: after, events: stepEvents(before, after, action, permits, ctx) }
}
