/**
 * Catálogos (SPEC 005): one screen for every pre-registered value the system offers. Types stay in
 * `type_def` (five families) and option lists in `option_list`/`option_item`: only the screen is shared.
 * Pure: which catalogs exist, their routes, usage in words, what each item allows and the search.
 */
import type { OptionList, RegistryState, TypeDef, TypeList } from "@/registry/types"

export type TypeCatalogId = "tipos-local" | "tipos-ativo" | "tipos-trabalho" | "cargos" | "relacoes"
/** A route tab: a type family, or `lista/<id>`. */
export type CatalogId = TypeCatalogId | `lista/${string}`

export interface TypeCatalog { id: TypeCatalogId; key: TypeList; title: string; hint: string; newLabel: string }

export const TYPE_CATALOGS: readonly TypeCatalog[] = [
  { id: "tipos-local", key: "locationTypes", title: "Tipos de local", hint: "Locais e escopo dos modelos", newLabel: "Novo tipo de local" },
  { id: "tipos-ativo", key: "assetTypes", title: "Tipos de ativo", hint: "Equipamentos e escopo", newLabel: "Novo tipo de ativo" },
  { id: "tipos-trabalho", key: "workTypes", title: "Tipos de trabalho", hint: "Classificam os modelos", newLabel: "Novo tipo de trabalho" },
  { id: "cargos", key: "roleTypes", title: "Cargos", hint: "Pessoas e assinaturas", newLabel: "Novo cargo" },
  { id: "relacoes", key: "relationKinds", title: "Relações", hint: "Entre equipamentos", newLabel: "Nova relação (ex.: alimenta)" },
]

/** What each type catalog is for, under its title. */
export const TYPE_CATALOG_ABOUT: Record<TypeCatalogId, string> = {
  "tipos-local": "Usados nos locais da Gestão de Ativos e no Escopo dos modelos de PT",
  "tipos-ativo": "Usados nos equipamentos e no Escopo dos modelos de PT",
  "tipos-trabalho": "Classificam o serviço de cada modelo de PT (elétrico, altura, espaço confinado…), escolhidos no Escopo",
  cargos: "Atribuídos às pessoas (com validade e escopo) e exigidos nas assinaturas dos modelos",
  relacoes: "Ligam equipamentos; “é parte de” define o aninhamento e a trava de equipamento",
}

export const listCatalogId = (listId: string): CatalogId => `lista/${listId}`
export const isListCatalog = (id: CatalogId): id is `lista/${string}` => id.startsWith("lista/")
export const listIdOf = (id: CatalogId): string | null => (isListCatalog(id) ? id.slice("lista/".length) : null)
export const typeCatalog = (id: CatalogId) => TYPE_CATALOGS.find((c) => c.id === id) ?? null

/** The tab of `#catalogos/<tab>`: unknown or removed lists fall back to the first catalog. */
export function catalogOf(tab: string | undefined, lists: readonly Pick<OptionList, "id">[]): CatalogId {
  if (!tab) return "tipos-local"
  if (TYPE_CATALOGS.some((c) => c.id === tab)) return tab as TypeCatalogId
  const id = tab.startsWith("lista/") ? tab.slice(6) : null
  return id && lists.some((l) => l.id === id) ? listCatalogId(id) : "tipos-local"
}

const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "")
const both = (...parts: string[]) => parts.filter(Boolean).join(" · ")

/**
 * Where a type is used, in words ("9 locais · 3 modelos"); "" when unused. `assetCount` is the number of
 * assets of an asset type when the registry does not hold every asset (server mode).
 */
export function typeUsage(s: RegistryState, key: TypeList, id: string, assetCount?: number): string {
  const versions = (pred: (v: RegistryState["templates"][number]["versions"][number]) => boolean) =>
    s.templates.filter((t) => t.versions.some((v) => v.status !== "rascunho" && pred(v))).length
  switch (key) {
    case "locationTypes":
      return both(count(s.locations.filter((l) => l.typeId === id).length, "local", "locais"), count(versions((v) => v.locationTypeIds.includes(id)), "modelo", "modelos"))
    case "assetTypes":
      return both(count(assetCount ?? s.assets.filter((a) => a.typeId === id).length, "ativo", "ativos"), count(versions((v) => v.assetTypeIds.includes(id)), "modelo", "modelos"))
    case "roleTypes":
      return both(count(s.people.filter((p) => p.roles.some((r) => r.roleId === id)).length, "pessoa", "pessoas"),
        count(s.templates.filter((t) => t.versions.some((v) => v.stages.some((st) => st.slots.some((sl) => (sl.kind ?? "cargo") === "cargo" && sl.roleIds.includes(id))))).length, "modelo", "modelos"))
    case "workTypes":
      return count(versions((v) => v.workTypeIds.includes(id)), "modelo", "modelos")
    case "relationKinds":
      return count(s.relations.filter((r) => r.kindId === id).length, "relação", "relações")
  }
}

/** A type counts as used when anything points at it (then it can only be deactivated, never removed). */
export function typeInUse(s: RegistryState, key: TypeList, id: string, assetCount?: number): boolean {
  if (key === "locationTypes") return s.locations.some((l) => l.typeId === id) || s.templates.some((t) => t.versions.some((v) => v.locationTypeIds.includes(id)))
  if (key === "workTypes") return s.templates.some((t) => t.versions.some((v) => v.workTypeIds.includes(id)))
  if (key === "assetTypes") return (assetCount ?? s.assets.filter((a) => a.typeId === id).length) > 0 || s.templates.some((t) => t.versions.some((v) => v.assetTypeIds.includes(id)))
  return typeUsage(s, key, id) !== ""
}

/** Does a form item (or a group column) take options from this list? Marcação by `listId`, Verificação by `answerListId`. */
function itemUsesList(i: { kind: string; listId?: string; answerListId?: string; columns?: unknown[] }, listId: string): boolean {
  if (i.kind === "marcacao" && i.listId === listId) return true
  if (i.kind === "verificacao" && i.answerListId === listId) return true
  return i.kind === "grupo" && Array.isArray(i.columns) && i.columns.some((c) => itemUsesList(c as { kind: string }, listId))
}

/** Model versions whose questions (or group columns) take options from this list. */
export function listUses(s: RegistryState, listId: string): string[] {
  return s.templates.flatMap((t) => t.versions
    .filter((v) => v.form?.sections.some((sec) => sec.items.some((i) => itemUsesList(i as unknown as { kind: string }, listId))))
    .map((v) => `${t.name} v${v.number}`))
}

/**
 * What a type row offers: system types (Planta, Área, "é parte de") only rename; the others switch
 * active/inactive and are removed only when nothing uses them.
 */
export function typeActions(t: Pick<TypeDef, "systemKey">, used: boolean): { toggle: boolean; remove: boolean; locked: boolean } {
  if (t.systemKey) return { toggle: false, remove: false, locked: true }
  return { toggle: true, remove: !used, locked: false }
}

/** List items: never removed (answers point at them), only deactivated; moved up or down. */
export function moveItem<T>(items: readonly T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items]
  const out = [...items]
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

export type ActiveFilter = "todos" | "ativos" | "inativos"
export const byActive = <T extends { active: boolean }>(items: readonly T[], f: ActiveFilter) =>
  items.filter((i) => f === "todos" || (f === "ativos") === i.active)

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim()
/** Does the text contain the query, ignoring accents and case? An empty query matches everything. */
export const matchesText = (text: string, q: string) => fold(text).includes(fold(q))

/** SPEC 006: the left search finds catalogs by name only (never items). */
export function filterCatalogs<T extends { title: string }>(catalogs: readonly T[], q: string): T[] {
  return catalogs.filter((c) => matchesText(c.title, q))
}

/** SPEC 006: the search inside a catalog, combined with the Ativos/Inativos filter. */
export function filterItems<T extends { active: boolean }>(items: readonly T[], f: ActiveFilter, q: string, name: (i: T) => string): T[] {
  return byActive(items, f).filter((i) => matchesText(name(i), q))
}
