/**
 * Registry rules, mirroring the database (ptw-server/db/schema/10_cadastro.sql): sizes and formats
 * (23514), unique keys ignoring case (23505), a location never inside itself (PTW02), no cycle in
 * "parte de" (PTW11). Plus the row mappers: each registry record as the row of its table, with the
 * database column names and values as to_jsonb prints them, for the audit (core/audit rowEvent).
 * Pure; the registry store calls these on every write.
 */
import type { Row } from "@/core/audit"
import { rowTs } from "@/core/audit"
import type { RuleError } from "@/core/ptwErrors"
import { DEFAULT_TZ, dayOf, isoAt, msOf, nextDayStart } from "@/core/time"
import { isUuid } from "@/lib/id"
import type { Asset, AssetRelation, Location, OptionList, Person, RecordList, RegistryState, RoleAssignment, TypeDef, TypeList } from "@/registry/types"

const deny = (code: RuleError["code"], message: string, detail?: string): RuleError => (detail ? { code, message, detail } : { code, message })
const len = (s: unknown) => (typeof s === "string" ? [...s].length : -1)
const between = (s: unknown, min: number, max: number) => len(s) >= min && len(s) <= max
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** person.login (null = contact). */
export const LOGIN_RE = /^[A-Za-z0-9._@-]{1,104}$/
/** type_def.icon */
export const ICON_RE = /^[a-z0-9_]{1,40}$/

/** PTW02: `parentId` is the location itself or one of its descendants. */
export function locationParentDenied(locs: Location[], id: string, parentId: string | null): RuleError | null {
  let cur = parentId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === id) return deny("PTW02", "Um local não pode ficar dentro de si mesmo")
    seen.add(cur)
    cur = locs.find((l) => l.id === cur)?.parentId ?? null
  }
  return null
}

/**
 * PTW11: adding `add` ("from é parte de to") would close a cycle: `to` is already part of `from`,
 * at any depth (or they are the same asset). Relations of other kinds never cycle.
 */
export function partOfCycle(relations: AssetRelation[], partOf: string[], add: AssetRelation): boolean {
  if (!partOf.includes(add.kindId)) return false
  if (add.fromId === add.toId) return true
  const up = new Set<string>()
  const stack = [add.toId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const r of relations) {
      if (r.id === add.id || !partOf.includes(r.kindId) || r.fromId !== cur || up.has(r.toId)) continue
      if (r.toId === add.fromId) return true
      up.add(r.toId)
      stack.push(r.toId)
    }
  }
  return false
}

const TYPE_FAMILY: Record<TypeList, "local" | "ativo" | "cargo" | "relacao"> = {
  locationTypes: "local", assetTypes: "ativo", roleTypes: "cargo", relationKinds: "relacao",
}
const TYPE_NOUN: Record<TypeList, string> = { locationTypes: "tipo de local", assetTypes: "tipo de ativo", roleTypes: "cargo", relationKinds: "tipo de relação" }

const isTypeList = (l: RecordList | TypeList): l is TypeList => l in TYPE_FAMILY

/**
 * Sizes, formats and unique keys of one record about to be written into `list` (the record itself,
 * by id, is ignored when looking for duplicates). 23514 = check, 23505 = unique. Templates are
 * checked by core/templateVersions.
 */
export function uniqueDenied(list: RecordList | TypeList, state: RegistryState, item: { id: string } & Record<string, unknown>): RuleError | null {
  const others = <T extends { id: string }>(xs: T[]) => xs.filter((x) => x.id !== item.id)
  if (isTypeList(list)) {
    const t = item as unknown as TypeDef
    if (!between(t.label, 1, 80)) return deny("23514", "O nome do tipo precisa ter de 1 a 80 caracteres")
    if (t.icon != null && (!ICON_RE.test(t.icon) || (list !== "locationTypes" && list !== "assetTypes"))) return deny("23514", "Ícone inválido para este tipo")
    if (others(state[list]).some((x) => same(x.label, t.label))) return deny("23505", `Já existe ${TYPE_NOUN[list]} “${t.label}”`)
    if (t.systemKey != null && others(state[list]).some((x) => x.systemKey === t.systemKey)) return deny("23505", "Já existe um tipo com esta chave do sistema")
    return null
  }
  switch (list) {
    case "locations":
    case "assets": {
      const r = item as unknown as Location | Asset
      const noun = list === "locations" ? "local" : "ativo"
      if (!between(r.code, 1, 64)) return deny("23514", list === "locations" ? "O código precisa ter de 1 a 64 caracteres" : "A tag precisa ter de 1 a 64 caracteres")
      if (!between(r.name, 1, 200)) return deny("23514", "O nome precisa ter de 1 a 200 caracteres")
      const dup = others<Location | Asset>(state[list]).find((x) => same(x.code, r.code))
      if (dup) return deny("23505", `Já existe um ${noun} com o código ${dup.code}`, dup.id)
      return null
    }
    case "people": {
      const p = item as unknown as Person
      if (!between(p.name, 1, 200)) return deny("23514", "O nome precisa ter de 1 a 200 caracteres")
      if (len(p.company) > 200) return deny("23514", "A empresa pode ter até 200 caracteres")
      if (len(p.employeeId) > 64) return deny("23514", "A matrícula pode ter até 64 caracteres")
      if (p.login !== null && !LOGIN_RE.test(p.login)) return deny("23514", "Login inválido: use letras sem acento, números e . _ @ -, até 104 caracteres")
      if (p.adObjectGuid !== null && !isUuid(p.adObjectGuid)) return deny("23514", "Vínculo AD inválido")
      const login = p.login
      if (login !== null) {
        const dup = others(state.people).find((x) => x.login !== null && same(x.login, login))
        if (dup) return deny("23505", `O login ${login} já é de ${dup.name}`, dup.id)
      }
      if (p.adObjectGuid !== null && others(state.people).some((x) => x.adObjectGuid === p.adObjectGuid)) return deny("23505", "Esta conta do AD já está ligada a outra pessoa")
      const seen = new Set<string>()
      for (const r of p.roles) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.validUntil)) return deny("23514", "Validade do cargo inválida")
        const key = `${r.roleId}|${r.scopeLocationId ?? ""}`
        if (seen.has(key)) return deny("23505", "A pessoa já tem este cargo neste escopo")
        seen.add(key)
      }
      if (new Set(p.roles.map((r) => r.id)).size !== p.roles.length) return deny("23505", "Cargo repetido")
      return null
    }
    case "relations": {
      const r = item as unknown as AssetRelation
      if (r.fromId === r.toId) return deny("23514", "Um ativo não se relaciona com ele mesmo")
      if (others(state.relations).some((x) => x.fromId === r.fromId && x.toId === r.toId && x.kindId === r.kindId)) return deny("23505", "Esta relação já existe")
      return null
    }
    case "optionLists": {
      const l = item as unknown as OptionList
      if (!between(l.name, 1, 120)) return deny("23514", "O nome da lista precisa ter de 1 a 120 caracteres")
      if (others(state.optionLists).some((x) => same(x.name, l.name))) return deny("23505", `Já existe a lista “${l.name}”`)
      for (const i of l.items) if (!between(i.label, 1, 200)) return deny("23514", "Cada item da lista precisa ter de 1 a 200 caracteres")
      if (new Set(l.items.map((i) => i.id)).size !== l.items.length) return deny("23505", "Item de lista repetido")
      return null
    }
    case "templates":
      return null
  }
}

/* ---------- rows, as the audit trigger sees them (columns it strips are left out) ---------- */

/** `attrs` goes in when the record has a sheet (the database row always has one; older fixtures do not). */
const withAttrs = (row: Row, attrs: unknown): Row => (attrs === undefined ? row : { ...row, attrs: structuredClone(attrs) as Row[string] })

export function locationRow(l: Location): Row {
  return withAttrs({ id: l.id, parent_id: l.parentId, type_id: l.typeId, code: l.code, name: l.name, aliases: [...l.aliases], origin: l.origin, status: l.status }, l.attrs)
}

/** The asset itself; where it is goes in asset_location (assetLocationRow), one row per place. */
export function assetRow(a: Asset): Row {
  return withAttrs({ id: a.id, type_id: a.typeId, code: a.code, name: a.name, aliases: [...a.aliases], origin: a.origin, status: a.status }, a.attrs)
}

export function assetLocationRow(assetId: string, locationId: string): Row {
  return { asset_id: assetId, location_id: locationId }
}

export function personRow(p: Person): Row {
  return {
    id: p.id, name: p.name, company: p.company, employee_id: p.employeeId, login: p.login, enabled: p.enabled,
    account_expires: p.accountExpires === null ? null : rowTs(p.accountExpires), ad_object_guid: p.adObjectGuid,
    origin: p.origin, status: p.status,
  }
}

export function personRoleRow(p: Person, r: RoleAssignment): Row {
  return { id: r.id, person_id: p.id, role_id: r.roleId, scope_location_id: r.scopeLocationId, valid_until: r.validUntil }
}

export function typeRow(t: TypeDef, family: "local" | "ativo" | "cargo" | "relacao"): Row {
  return { id: t.id, family, label: t.label, icon: t.icon ?? null, system_key: t.systemKey ?? null, active: t.active }
}

export const typeFamily = (list: TypeList) => TYPE_FAMILY[list]

export function relationRow(r: AssetRelation): Row {
  return { id: r.id, from_id: r.fromId, to_id: r.toId, kind_id: r.kindId }
}

export function optionListRow(l: OptionList): Row {
  return { id: l.id, name: l.name }
}

export function optionItemRow(l: OptionList, i: OptionList["items"][number], position: number): Row {
  return { id: i.id, list_id: l.id, label: i.label, active: i.active, position }
}

/* ---------- account validity: the screen picks the last day, the database keeps an instant ---------- */

/** "Conta até <dia>" → the instant it stops working: the start of the next day in the plant's zone. */
export const accountExpiresFromLastDay = (day: string, tz: string = DEFAULT_TZ): string => nextDayStart(day, tz)

/** The last day an account works (the day before the instant it expires, in the plant's zone). */
export const accountLastDay = (expires: string, tz: string = DEFAULT_TZ): string => dayOf(isoAt(msOf(expires, tz) - 1000, tz), tz)
