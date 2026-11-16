/**
 * The registry over the API: reference data kept whole (unit, types, places, people, lists, models,
 * relations; kept in step by `updatedSince`), assets on demand, and each `RegistryAction` as the
 * contract's call(s). The server decides every rule; nothing changes here before its answer (A17).
 */
import type { RuleError } from "@/core/ptwErrors"
import { uuidv7 } from "@/lib/id"
import type { Asset, AssetRelation, Location, OptionList, PermitTemplate, Person, RecordList, RegistryState, TypeDef, TypeList, Unit } from "@/registry/types"
import { settled, type Act, type ImportPreview } from "../port"
import type { RegistryAction } from "../memory/registry"
import { noServer, type Res } from "./http"
import { addAssets, putTemplate, refusal, undoNow, type Page, type Shared } from "./state"

/** `TypeDef.family` of the contract → the app's four lists (the only shape conversion of the layer). */
const FAMILY: Record<TypeList, string> = { locationTypes: "local", assetTypes: "ativo", roleTypes: "cargo", relationKinds: "relacao" }
const LIST_OF: Record<string, TypeList> = { local: "locationTypes", ativo: "assetTypes", cargo: "roleTypes", relacao: "relationKinds" }
type WireType = TypeDef & { family: string }
const toType = ({ family, ...t }: WireType): { list: TypeList; type: TypeDef } => { void family; return { list: LIST_OF[family], type: t } }

const PATH: Record<Exclude<RecordList, "templates">, string> = { locations: "/locations", assets: "/assets", people: "/people", optionLists: "/option-lists", relations: "/asset-relations" }
type Rec = { id: string; revision?: number } & Record<string, unknown>

/** Every page of a collection (pageSize 1000), or the refusal. */
export async function getAll<T>(s: Shared, path: string, query: Record<string, string | number | undefined> = {}, maxPages = 200): Promise<T[] | RuleError> {
  const out: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await s.http.request<Page<T>>({ method: "GET", path, query: { ...query, page, pageSize: 1000 } })
    if (!r.ok) return r.error
    out.push(...r.data.items)
    if (out.length >= r.data.total || r.data.items.length === 0) break
  }
  return out
}
const failed = (x: unknown): x is RuleError => !Array.isArray(x)

/** Reads the whole reference data into the registry cell. */
export async function loadReference(s: Shared): Promise<RuleError | null> {
  const [unit, types, locations, people, lists, templates, relations] = await Promise.all([
    s.http.request<Unit>({ method: "GET", path: "/unit" }),
    getAll<WireType>(s, "/types"),
    getAll<Location>(s, "/locations"),
    getAll<Person>(s, "/people"),
    getAll<OptionList>(s, "/option-lists"),
    getAll<PermitTemplate>(s, "/templates", { content: "all" }),
    getAll<AssetRelation>(s, "/asset-relations"),
  ])
  if (!unit.ok) return unit.error
  for (const x of [types, locations, people, lists, templates, relations]) if (failed(x)) return x
  const r: RegistryState = { ...s.registry.get(), units: [unit.data], locationTypes: [], assetTypes: [], roleTypes: [], relationKinds: [], locations: locations as Location[], people: people as Person[], optionLists: lists as OptionList[], templates: templates as PermitTemplate[], relations: relations as AssetRelation[] }
  for (const w of types as WireType[]) { const { list, type } = toType(w); if (list) r[list] = [...r[list], type] }
  s.registry.set(r)
  return null
}

/**
 * Keeps the cache in step: what changed since `since` is merged by id; a list whose size no longer
 * matches the server's total (something was removed) is read again whole. Types and relations are small:
 * read again.
 */
export async function syncReference(s: Shared, since: string): Promise<RuleError | null> {
  const merge = async <T extends { id: string }>(path: string, key: "locations" | "people" | "optionLists" | "templates", query: Record<string, string> = {}): Promise<RuleError | null> => {
    const news = await getAll<T>(s, path, { ...query, updatedSince: since })
    if (failed(news)) return news
    const total = await s.http.request<Page<T>>({ method: "GET", path, query: { ...query, page: 0, pageSize: 1 } })
    if (!total.ok) return total.error
    const cur = s.registry.get()[key] as unknown as T[]
    const byId = new Map(cur.map((x) => [x.id, x]))
    for (const n of news) byId.set(n.id, n)
    let next = [...byId.values()]
    if (next.length !== total.data.total) {
      const all = await getAll<T>(s, path, query)
      if (failed(all)) return all
      next = all
    }
    if (news.length || next.length !== cur.length) s.registry.set({ ...s.registry.get(), [key]: next })
    return null
  }
  for (const [path, key, q] of [["/locations", "locations"], ["/people", "people"], ["/option-lists", "optionLists"], ["/templates", "templates", { content: "all" }]] as const) {
    const e = await merge(path, key, q as Record<string, string> | undefined)
    if (e) return e
  }
  const [types, relations] = await Promise.all([getAll<WireType>(s, "/types"), getAll<AssetRelation>(s, "/asset-relations")])
  if (failed(types)) return types
  if (failed(relations)) return relations
  const r: RegistryState = { ...s.registry.get(), locationTypes: [], assetTypes: [], roleTypes: [], relationKinds: [], relations }
  for (const w of types) { const { list, type } = toType(w); if (list) r[list] = [...r[list], type] }
  s.registry.set(r)
  return null
}

/** Body of a record: what the client may send (the server owns `unitId`, `revision`, `updatedAt`). */
const bodyOf = (item: Rec) => {
  const { unitId, revision, updatedAt, ineligible, ...rest } = item
  void unitId; void revision; void updatedAt; void ineligible
  return rest
}

/** Changes one list of the registry cell (by id). */
function putIn(s: Shared, list: Exclude<RecordList, "templates">, item: Rec) {
  const r = s.registry.get()
  const cur = r[list] as unknown as Rec[]
  const next = cur.some((x) => x.id === item.id) ? cur.map((x) => (x.id === item.id ? item : x)) : [...cur, item]
  if (list === "assets") { s.assets.set(item.id, item as unknown as Asset) }
  s.registry.set({ ...r, [list]: next })
}
function dropFrom(s: Shared, list: Exclude<RecordList, "templates"> | "templates", id: string) {
  const r = s.registry.get()
  if (list === "assets") s.assets.delete(id)
  s.registry.set({ ...r, [list]: (r[list] as unknown as Rec[]).filter((x) => x.id !== id) })
}

type Done = RuleError | null
const errOf = (r: Res<unknown>): Done => (r.ok ? null : r.error)

export function createRegistryWrites(s: Shared) {
  const { http } = s

  /** A record of a list: PUT when the cache has it (with its revision), POST (with a key) when new or restored. */
  async function saveRecord(list: Exclude<RecordList, "templates">, item: Rec, undo: boolean, restore: boolean): Promise<Done> {
    const cur = (s.registry.get()[list] as unknown as Rec[]).find((x) => x.id === item.id)
    if (cur && !restore) {
      const r = await http.request<Rec>({ method: "PUT", path: `${PATH[list]}/${item.id}`, body: bodyOf(item), ifMatch: cur.revision ?? 1, undo })
      if (r.ok) putIn(s, list, r.data)
      return errOf(r)
    }
    const r = await http.request<Rec>({ method: "POST", path: PATH[list], body: bodyOf(item), key: uuidv7(), undo })
    if (r.ok) putIn(s, list, r.data)
    return errOf(r)
  }

  async function saveType(list: TypeList, id: string, patch: Partial<TypeDef>, undo: boolean): Promise<Done> {
    const r = await http.request<WireType>({ method: "PATCH", path: `/types/${id}`, body: patch, undo })
    if (r.ok) putType(list, r.data)
    return errOf(r)
  }
  function putType(list: TypeList, w: WireType) {
    const { type } = toType(w)
    const reg = s.registry.get()
    const cur = reg[list]
    s.registry.set({ ...reg, [list]: cur.some((x) => x.id === type.id) ? cur.map((x) => (x.id === type.id ? type : x)) : [...cur, type] })
  }
  const dropType = (list: TypeList, id: string) => { const reg = s.registry.get(); s.registry.set({ ...reg, [list]: reg[list].filter((x) => x.id !== id) }) }

  /** A model: template fields, then each version that was added, removed, changed or activated; then the model read again. */
  async function saveTemplate(next: PermitTemplate, prev: PermitTemplate | undefined, undo: boolean): Promise<Done> {
    const content = (v: PermitTemplate["versions"][number]) => ({ id: v.id, locationTypeIds: v.locationTypeIds, assetTypeIds: v.assetTypeIds, stages: v.stages, separation: v.separation, form: v.form, note: v.note, maxWindowHours: v.maxWindowHours, holdsEquipment: v.holdsEquipment })
    if (!prev) {
      const first = next.versions[0]
      const r = await http.request<PermitTemplate>({ method: "POST", path: "/templates", body: { id: next.id, name: next.name, retentionClass: next.retentionClass, ...(first ? { version: content(first) } : {}) }, key: uuidv7(), undo })
      if (r.ok) putTemplate(s, r.data)
      return errOf(r)
    }
    if (next.name !== prev.name || next.retentionClass !== prev.retentionClass) {
      const r = await http.request<PermitTemplate>({ method: "PATCH", path: `/templates/${prev.id}`, body: { name: next.name, retentionClass: next.retentionClass }, ifMatch: prev.revision, undo })
      if (!r.ok) return r.error
    }
    for (const pv of prev.versions) {
      if (next.versions.some((v) => v.id === pv.id)) continue
      const r = await http.request<void>({ method: "DELETE", path: `/templates/${prev.id}/versions/${pv.id}`, ifMatch: pv.revision ?? 1, undo })
      if (!r.ok) return r.error
    }
    for (const v of next.versions) {
      const old = prev.versions.find((x) => x.id === v.id)
      let vrev = old?.revision ?? 1
      if (!old) {
        const r = await http.request<{ revision?: number }>({ method: "POST", path: `/templates/${prev.id}/versions`, body: content(v), key: uuidv7(), undo })
        if (!r.ok) return r.error
        vrev = r.data.revision ?? 1
      } else if (old !== v && v.status === "rascunho" && JSON.stringify(content(old)) !== JSON.stringify(content(v))) {
        const r = await http.request<{ revision?: number }>({ method: "PUT", path: `/templates/${prev.id}/versions/${v.id}`, body: content(v), ifMatch: vrev, undo })
        if (!r.ok) return r.error
        vrev = r.data.revision ?? vrev
      }
      if (old && old.status === "rascunho" && v.status === "ativa") {
        const r = await http.request<PermitTemplate>({ method: "POST", path: `/templates/${prev.id}/versions/${v.id}/activate`, ifMatch: vrev, undo })
        if (!r.ok) return r.error
      }
    }
    const fresh = await http.request<PermitTemplate>({ method: "GET", path: `/templates/${prev.id}` })
    if (fresh.ok) putTemplate(s, fresh.data)
    return errOf(fresh)
  }

  /** "Importar modelo": preview (for the token) then confirm. The package text rides on the action (`pacote`, `arquivo`). */
  async function importTemplate(action: Extract<RegistryAction, { kind: "importTemplate" }>): Promise<Done> {
    const { pacote, arquivo } = action as unknown as { pacote?: string; arquivo?: string }
    if (!pacote) return refusal("PTA05", "A importação precisa do texto do pacote")
    const prev = await http.request<{ token?: string; sha256: string }>({ method: "POST", path: "/templates/import/preview", body: { arquivo, pacote } })
    if (!prev.ok) return prev.error
    if (!prev.data.token) return refusal("PTA10", "A leitura do pacote tem erros; nada foi criado")
    if (prev.data.sha256 !== action.draft.versao.sourceSha256) return refusal("PTA10", "O pacote não é o da prévia")
    const r = await http.request<{ template: PermitTemplate }>({ method: "POST", path: "/templates/import/confirm", body: { arquivo, pacote, token: prev.data.token }, key: uuidv7() })
    if (!r.ok) return r.error
    // New types and lists exist now.
    const e = await loadReference(s)
    if (e) return e
    putTemplate(s, r.data.template)
    return null
  }

  async function run(action: RegistryAction, undo: boolean): Promise<Done> {
    const reg = s.registry.get()
    switch (action.kind) {
      case "upsert":
      case "restore": {
        if (action.list === "templates") return saveTemplate(action.item as unknown as PermitTemplate, action.kind === "restore" ? undefined : reg.templates.find((t) => t.id === action.item.id), undo)
        return saveRecord(action.list, action.item, undo, action.kind === "restore")
      }
      case "update": {
        if (action.list === "templates") {
          const prev = reg.templates.find((t) => t.id === action.id)
          if (!prev) return refusal("PTA04", "Não existe nesta unidade")
          return saveTemplate(action.fn(prev as never) as unknown as PermitTemplate, prev, undo)
        }
        const cur = (reg[action.list] as unknown as Rec[]).find((x) => x.id === action.id)
        if (!cur) return refusal("PTA04", "Não existe nesta unidade")
        return saveRecord(action.list, action.fn(cur) as Rec, undo, false)
      }
      case "addType": {
        const r = await http.request<WireType>({ method: "POST", path: "/types", body: { id: uuidv7(), family: FAMILY[action.list], label: action.label }, key: uuidv7(), undo })
        if (r.ok) putType(action.list, r.data)
        return errOf(r)
      }
      case "restoreType": {
        const r = await http.request<WireType>({ method: "POST", path: "/types", body: { id: action.item.id, family: FAMILY[action.list], label: action.item.label, icon: action.item.icon ?? null, active: action.item.active }, key: uuidv7(), undo })
        if (r.ok) putType(action.list, r.data)
        return errOf(r)
      }
      case "renameType": return saveType(action.list, action.id, { label: action.label }, undo)
      case "setTypeIcon": return saveType(action.list, action.id, { icon: action.icon }, undo)
      case "setTypeActive": return saveType(action.list, action.id, { active: action.active }, undo)
      case "removeType": {
        const r = await http.request<void>({ method: "DELETE", path: `/types/${action.id}`, undo })
        if (r.ok) dropType(action.list, action.id)
        return errOf(r)
      }
      case "removeRelation": {
        const r = await http.request<void>({ method: "DELETE", path: `/asset-relations/${action.id}`, undo })
        if (r.ok) dropFrom(s, "relations", action.id)
        return errOf(r)
      }
      case "removeOptionList": {
        const cur = reg.optionLists.find((l) => l.id === action.id)
        const r = await http.request<void>({ method: "DELETE", path: `/option-lists/${action.id}`, ifMatch: cur?.revision ?? 1, undo })
        if (r.ok) dropFrom(s, "optionLists", action.id)
        return errOf(r)
      }
      case "removeTemplate": {
        const cur = reg.templates.find((t) => t.id === action.id)
        const r = await http.request<void>({ method: "DELETE", path: `/templates/${action.id}`, ifMatch: cur?.revision ?? 1, undo })
        if (r.ok) dropFrom(s, "templates", action.id)
        return errOf(r)
      }
      case "importTemplate": return importTemplate(action)
    }
  }

  return {
    async exportTemplate(templateId: string, versionId: string, reason: string) {
      if (s.session.get().serverDown) return noServer()
      const r = await http.request<string>({ method: "GET", path: `/templates/${templateId}/export`, query: { versionId }, reason, as: "text" })
      return r.ok ? { text: r.data } : r.error
    },
    async loadAsset(id: string) {
      const r = await http.request<{ asset: Asset; relations: AssetRelation[]; related: Asset[] }>({ method: "GET", path: `/assets/${id}` })
      if (!r.ok) return r.error
      putIn(s, "assets", r.data.asset as unknown as Rec)
      addAssets(s, r.data.related ?? [])
      return r.data.asset
    },
    async previewImport(input: { arquivo: string; pacote: string }) {
      const r = await http.request<ImportPreview>({ method: "POST", path: "/templates/import/preview", body: input })
      return r.ok ? r.data : r.error
    },
    async confirmImport(input: { arquivo: string; pacote: string; token: string; key: string }) {
      if (s.session.get().serverDown) return noServer()
      const { key, ...body } = input
      const r = await http.request<{ template: PermitTemplate; versionId: string }>({ method: "POST", path: "/templates/import/confirm", body, key })
      if (!r.ok) return r.error
      const e = await loadReference(s)
      if (e) return e
      putTemplate(s, r.data.template)
      s.changed.set(s.changed.get() + 1)
      return { templateId: r.data.template.id, versionId: r.data.versionId }
    },
    /** The write, asked. While the server is down nothing saves (`sem servidor`). */
    write(action: RegistryAction): Act {
      if (s.session.get().serverDown) return settled(noServer())
      const undo = undoNow()
      const done = run(action, undo)
      return { refused: null, done }
    },
  }
}
