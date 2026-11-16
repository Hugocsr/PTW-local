import { describe, expect, it, vi } from "vitest"
import type { AuditCtx } from "@/core/audit"
import { FORM_ID_RE, isUuid, uuidv7 } from "@/lib/id"
import { registryEvents } from "@/registry/audit"
import { seed } from "@/registry/seed"
import { ID, LIST_LABELS, seedUuid } from "@/registry/seedIds"
import { newId, registryStep } from "@/registry/store"
import type { Permit } from "@/permit/types"
import type { Asset, AssetRelation, Person, RegistryState } from "@/registry/types"
import {
  accountExpiresFromLastDay, accountLastDay, assetRow, locationParentDenied, optionItemRow, partOfCycle, personRoleRow, personRow, typeRow, uniqueDenied,
} from "./registryRules"

// The store module also holds the React provider; its audit hook (and the simulation behind it) is not needed here.
vi.mock("@/audit/store", () => ({ useAudit: () => null, runAsUndo: (fn: () => void) => fn() }))

const ctx: AuditCtx = { at: "2026-11-06T10:00:00-03:00", actorId: ID.person.marina, auth: "sessao" }
const partOf = [ID.relationKind.parte]
/** A record as uniqueDenied takes it (any registry row). */
const R = (x: object) => x as { id: string } & Record<string, unknown>
const rel = (id: string, fromId: string, toId: string, kindId = ID.relationKind.parte): AssetRelation => ({ id, fromId, toId, kindId })

describe("ids (X1)", () => {
  it("uuidv7 is a lowercase v7 uuid carrying the time", () => {
    const id = uuidv7(Date.UTC(2026, 10, 6))
    expect(isUuid(id)).toBe(true)
    expect(id[14]).toBe("7")
    expect("89ab").toContain(id[19])
    expect(parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(Date.UTC(2026, 10, 6))
    expect(new Set(Array.from({ length: 200 }, () => uuidv7())).size).toBe(200)
    expect(isUuid(newId("loc"))).toBe(true)
    expect(FORM_ID_RE.test(uuidv7())).toBe(true)
  })

  it("seed ids are fixed, valid and unique", () => {
    expect(seedUuid(0x10, 3)).toBe("019a0010-0000-7000-8000-000000000003")
    const all = [
      ID.unit, ...Object.values(ID.locationType), ...Object.values(ID.assetType), ...Object.values(ID.role), ...Object.values(ID.relationKind),
      ...Object.values(ID.person), ...Object.values(ID.list), ...Object.values(ID.template), ...Object.values(ID.version),
      ...Array.from({ length: 16 }, (_, i) => ID.loc(i + 1)), ...Array.from({ length: 15 }, (_, i) => ID.asset(i + 1)),
      ...(Object.keys(LIST_LABELS) as (keyof typeof LIST_LABELS)[]).flatMap((k) => LIST_LABELS[k].map((l) => ID.listItem(k, l))),
      ...(["painel1", "painel2", "vapor1"] as const).flatMap((v) => [ID.stage(v, "sol"), ID.stage(v, "emi"), ID.slot(v, "sol"), ID.slot(v, "emi")]),
      ID.personRole("sergio", 1), ID.personRole(ID.person.sergio, 2),
    ]
    expect(all.every(isUuid)).toBe(true)
    expect(new Set(all).size).toBe(all.length)
    expect(() => ID.listItem("epi", "Nada")).toThrow()
  })

  it("every registry row of the seed has a uuid key", () => {
    const keys = [
      ...seed.units.map((u) => u.id), ...seed.locationTypes.map((t) => t.id), ...seed.assetTypes.map((t) => t.id), ...seed.roleTypes.map((t) => t.id),
      ...seed.relationKinds.map((t) => t.id), ...seed.locations.map((l) => l.id), ...seed.assets.map((a) => a.id), ...seed.relations.map((r) => r.id),
      ...seed.people.flatMap((p) => [p.id, ...p.roles.map((r) => r.id)]), ...seed.optionLists.flatMap((l) => [l.id, ...l.items.map((i) => i.id)]),
    ]
    expect(keys.filter((k) => !isUuid(k))).toEqual([])
    expect(seed.units[0].timezone).toBe("America/Sao_Paulo")
    expect(seed.relationKinds.filter((k) => k.systemKey === "parte_de").map((k) => k.id)).toEqual([ID.relationKind.parte])
    expect(seed.people.find((p) => p.id === ID.person.ana)!.login).toBeNull()
  })
})

describe("account validity (CA9)", () => {
  it("the last day maps to the start of the next day in the plant zone, and back", () => {
    expect(accountExpiresFromLastDay("2026-12-31")).toBe("2027-01-01T00:00:00-03:00")
    expect(accountLastDay("2027-01-01T00:00:00-03:00")).toBe("2026-12-31")
  })
})

describe("locations (CA3)", () => {
  it("PTW02: a place never goes inside itself or below itself", () => {
    expect(locationParentDenied(seed.locations, ID.loc(2), ID.loc(2))?.code).toBe("PTW02")
    expect(locationParentDenied(seed.locations, ID.loc(2), ID.loc(4))?.code).toBe("PTW02")
    expect(locationParentDenied(seed.locations, ID.loc(4), ID.loc(7))).toBeNull()
    expect(locationParentDenied(seed.locations, ID.loc(4), null)).toBeNull()
  })

  it("code unique ignoring case and sizes (23505, 23514)", () => {
    const l = { ...seed.locations[3] }
    expect(uniqueDenied("locations", seed, R({ ...l, code: "l02" }))?.code).toBe("23505")
    expect(uniqueDenied("locations", seed, R({ ...l, code: "x".repeat(65) }))?.code).toBe("23514")
    expect(uniqueDenied("locations", seed, R({ ...l, name: "" }))?.code).toBe("23514")
    expect(uniqueDenied("locations", seed, R(l))).toBeNull()
  })
})

describe("assets and relations (CA4, CA6, CA7)", () => {
  it("tag unique ignoring case (23505)", () => {
    const a = seed.assets[1]
    expect(uniqueDenied("assets", seed, R({ ...a, code: "ccm-l2-01" }))?.code).toBe("23505")
    expect(uniqueDenied("assets", seed, R(a))).toBeNull()
  })

  it("a relation is unique per (from, to, kind) and never joins an asset to itself", () => {
    const r = seed.relations[0]
    expect(uniqueDenied("relations", seed, R({ ...r, id: newId() }))?.code).toBe("23505")
    expect(uniqueDenied("relations", seed, R(rel(newId(), ID.asset(1), ID.asset(1))))?.code).toBe("23514")
    expect(uniqueDenied("relations", seed, R(rel(newId(), ID.asset(4), ID.asset(1))))).toBeNull()
  })

  it("PTW11: \"parte de\" never closes a cycle; other kinds never do", () => {
    // seed: C03 (2) é parte de CCM-L2-01 (1)
    expect(partOfCycle(seed.relations, partOf, rel("x", ID.asset(1), ID.asset(2)))).toBe(true)
    const chain = [...seed.relations, rel("y", ID.asset(1), ID.asset(3))]
    expect(partOfCycle(chain, partOf, rel("x", ID.asset(3), ID.asset(2)))).toBe(true)
    expect(partOfCycle(seed.relations, partOf, rel("x", ID.asset(1), ID.asset(2), ID.relationKind.alimenta))).toBe(false)
    expect(partOfCycle(seed.relations, partOf, rel("x", ID.asset(3), ID.asset(1)))).toBe(false)
  })
})

describe("people (CA9, CA10)", () => {
  const paulo = seed.people.find((p) => p.id === ID.person.paulo)!
  it("login: database pattern, unique ignoring case; null = contact", () => {
    expect(uniqueDenied("people", seed, R({ ...paulo, login: "Marina.Costa" }))?.code).toBe("23505")
    expect(uniqueDenied("people", seed, R({ ...paulo, login: "paulo lima" }))?.code).toBe("23514")
    expect(uniqueDenied("people", seed, R({ ...paulo, login: "p".repeat(105) }))?.code).toBe("23514")
    expect(uniqueDenied("people", seed, R({ ...paulo, login: "p".repeat(104) }))).toBeNull()
    expect(uniqueDenied("people", seed, R({ ...paulo, login: null }))).toBeNull()
  })

  it("one cargo per person + cargo + scope (23505)", () => {
    const twice: Person = { ...paulo, roles: [...paulo.roles, { ...paulo.roles[0], id: newId() }] }
    expect(uniqueDenied("people", seed, R(twice))?.code).toBe("23505")
    const other: Person = { ...paulo, roles: [...paulo.roles, { ...paulo.roles[0], id: newId(), scopeLocationId: null }] }
    expect(uniqueDenied("people", seed, R(other))).toBeNull()
  })
})

describe("types and lists (CA1, CA12)", () => {
  it("type label 1–80, unique ignoring case in its family; icon only on location/asset types", () => {
    const t = seed.roleTypes[0]
    expect(uniqueDenied("roleTypes", seed, R({ ...t, label: "executante" }))?.code).toBe("23505")
    expect(uniqueDenied("assetTypes", seed, R({ ...seed.assetTypes[0], id: newId(), label: "Executante" }))).toBeNull()
    expect(uniqueDenied("roleTypes", seed, R({ ...t, label: "x".repeat(81) }))?.code).toBe("23514")
    expect(uniqueDenied("roleTypes", seed, R({ ...t, icon: "motor" }))?.code).toBe("23514")
  })

  it("list name 1–120 unique; item 1–200", () => {
    const l = seed.optionLists[0]
    expect(uniqueDenied("optionLists", seed, R({ ...l, name: "perigos" }))?.code).toBe("23505")
    expect(uniqueDenied("optionLists", seed, R({ ...l, items: [...l.items, { id: newId(), label: "", active: true }] }))?.code).toBe("23514")
    expect(uniqueDenied("optionLists", seed, R(l))).toBeNull()
  })
})

describe("rows for the audit (AU4, AU7)", () => {
  it("database column names and values", () => {
    const a = seed.assets[0]
    expect(assetRow(a)).toEqual({ id: a.id, type_id: a.typeId, code: "CCM-L2-01", name: a.name, aliases: ["CCM2", "Painel 14"], origin: "manual", status: "ativo" })
    expect(typeRow(seed.relationKinds[3], "relacao")).toEqual({ id: ID.relationKind.parte, family: "relacao", label: "é parte de", icon: null, system_key: "parte_de", active: true })
    const paulo = seed.people.find((p) => p.id === ID.person.paulo)!
    expect(personRow(paulo)).toMatchObject({ employee_id: "C-2001", login: "paulo.lima", account_expires: "2027-01-01T03:00:00+00:00", ad_object_guid: null })
    expect(personRoleRow(paulo, paulo.roles[0])).toEqual({ id: paulo.roles[0].id, person_id: paulo.id, role_id: ID.role.lider, scope_location_id: ID.loc(2), valid_until: "2026-12-31" })
    const epi = seed.optionLists[0]
    expect(optionItemRow(epi, epi.items[2], 2)).toEqual({ id: epi.items[2].id, list_id: epi.id, label: "Proteção respiratória", active: true, position: 2 })
  })
})

describe("registryStep: rules in the store, one event per row", () => {
  const step = (s: RegistryState, a: Parameters<typeof registryStep>[1]) => registryStep(s, a, [], ctx)

  it("a new asset: the asset row and one row per place", () => {
    const a: Asset = { id: newId(), unitId: ID.unit, revision: 1, updatedAt: ctx.at, origin: "manual", status: "ativo", typeId: ID.assetType.motor, code: "M-999", name: "Motor novo", aliases: [], locationIds: [ID.loc(5), ID.loc(3)] }
    const r = step(seed, { kind: "upsert", list: "assets", item: a })
    expect(r.denied).toBeUndefined()
    expect(r.events.map((e) => e.action)).toEqual(["cadastro.ativo.criado", "cadastro.ativo.local.incluido", "cadastro.ativo.local.incluido"])
    expect(r.events[1]).toMatchObject({ entity: "asset_location", entityId: a.id, asset: a.id, text: "Local do ativo incluído: M-999" })
  })

  it("unlinking a place is its own row event", () => {
    const a = seed.assets.find((x) => x.id === ID.asset(5))!
    const r = step(seed, { kind: "update", list: "assets", id: a.id, fn: (x) => ({ ...x, locationIds: [ID.loc(9)] }) })
    expect(r.events.map((e) => e.action)).toEqual(["cadastro.ativo.local.removido"])
  })

  it("a cargo given, changed and revoked are row events of person_role", () => {
    const paulo = seed.people.find((p) => p.id === ID.person.paulo)!
    const given = step(seed, { kind: "upsert", list: "people", item: { ...paulo, roles: [...paulo.roles, { id: newId(), roleId: ID.role.exec, scopeLocationId: null, validUntil: "2026-12-31" }] } })
    expect(given.events.map((e) => e.action)).toEqual(["cadastro.cargo.concedido"])
    expect(given.events[0].text).toBe("Cargo concedido: Paulo Lima")
    const changed = step(seed, { kind: "upsert", list: "people", item: { ...paulo, roles: [{ ...paulo.roles[0], validUntil: "2027-06-30" }] } })
    expect(changed.events.map((e) => e.action)).toEqual(["cadastro.cargo.alterado"])
    expect(changed.events[0].data).toEqual({ de: { valid_until: "2026-12-31" }, para: { valid_until: "2027-06-30" } })
    const revoked = step(seed, { kind: "upsert", list: "people", item: { ...paulo, roles: [] } })
    expect(revoked.events.map((e) => e.action)).toEqual(["cadastro.cargo.revogado"])
  })

  it("account fields alone are cadastro.conta.alterada", () => {
    const paulo = seed.people.find((p) => p.id === ID.person.paulo)!
    const r = step(seed, { kind: "upsert", list: "people", item: { ...paulo, enabled: false } })
    expect(r.events.map((e) => e.action)).toEqual(["cadastro.conta.alterada"])
  })

  it("a list item added is cadastro.lista.item.criado with its position", () => {
    const l = seed.optionLists[0]
    const id = newId()
    const r = step(seed, { kind: "upsert", list: "optionLists", item: { ...l, items: [...l.items, { id, label: "Avental", active: true }] } })
    expect(r.events).toHaveLength(1)
    expect(r.events[0]).toMatchObject({ action: "cadastro.lista.item.criado", entityId: id, data: { para: { label: "Avental", position: 8, list_id: l.id, active: true } } })
    const after = r.state.optionLists[0]
    expect(after.revision).toBe(2)
  })

  it("a duplicate is refused with the database code and recorded as denied", () => {
    const l = seed.locations[3]
    const r = step(seed, { kind: "upsert", list: "locations", item: { ...l, code: "PRD-01" } })
    expect(r.state).toBe(seed)
    expect(r.denied?.code).toBe("23505")
    expect(r.events).toHaveLength(1)
    expect(r.events[0]).toMatchObject({ ok: false, action: "cadastro.local.alterado" })
  })

  it("PTW02 and PTW11 in the store", () => {
    const r = step(seed, { kind: "update", list: "locations", id: ID.loc(2), fn: (l) => ({ ...l, parentId: ID.loc(4) }) })
    expect(r.denied?.code).toBe("PTW02")
    const c = step(seed, { kind: "upsert", list: "relations", item: rel(newId(), ID.asset(1), ID.asset(2)) })
    expect(c.denied?.code).toBe("PTW11")
    expect(c.events[0]).toMatchObject({ ok: false, action: "cadastro.ativo.relacao.criada" })
  })

  it("PTW10: a \"parte de\" that would join two open PTs is refused with the database text", () => {
    const pt = (id: string, number: string, assetId: string) => ({ id, number, state: "ativa", assetIds: [assetId] }) as unknown as Permit
    const permits = [pt("p1", "PT-UN01-2026-00001", ID.asset(9)), pt("p2", "PT-UN01-2026-00002", ID.asset(10))]
    const r = registryStep(seed, { kind: "upsert", list: "relations", item: rel(newId(), ID.asset(10), ID.asset(9)) }, permits, ctx)
    expect(r.state).toBe(seed)
    expect(r.denied).toMatchObject({ code: "PTW10", message: "A relação juntaria duas PTs abertas no mesmo equipamento (PT-UN01-2026-00001 e PT-UN01-2026-00002)" })
    expect(r.events[0]).toMatchObject({ ok: false, action: "cadastro.ativo.relacao.criada" })
    expect(registryStep(seed, { kind: "upsert", list: "relations", item: rel(newId(), ID.asset(10), ID.asset(9), ID.relationKind.alimenta) }, permits, ctx).denied).toBeUndefined()
  })

  it("a type in use or of the system cannot be removed; an unused one can, and comes back", () => {
    expect(step(seed, { kind: "removeType", list: "roleTypes", id: ID.role.exec }).denied?.code).toBe("23503")
    expect(step(seed, { kind: "removeType", list: "relationKinds", id: ID.relationKind.parte }).denied?.code).toBe("23514")
    const added = step(seed, { kind: "addType", list: "roleTypes", label: "Vigia" })
    const t = added.state.roleTypes.at(-1)!
    expect(t).toMatchObject({ label: "Vigia", active: true })
    expect(added.events.map((e) => e.action)).toEqual(["cadastro.tipo.criado"])
    const gone = step(added.state, { kind: "removeType", list: "roleTypes", id: t.id })
    expect(gone.events.map((e) => e.action)).toEqual(["cadastro.tipo.removido"])
    const back = step(gone.state, { kind: "restoreType", list: "roleTypes", item: t, index: 4 })
    expect(back.events.map((e) => e.action)).toEqual(["cadastro.tipo.criado"])
    expect(step(seed, { kind: "addType", list: "roleTypes", label: "LÍDER DE EQUIPE" }).denied?.code).toBe("23505")
  })

  it("a type can be deactivated (still used, no longer offered)", () => {
    const r = step(seed, { kind: "setTypeActive", list: "assetTypes", id: ID.assetType.motor, active: false })
    expect(r.state.assetTypes.find((t) => t.id === ID.assetType.motor)!.active).toBe(false)
    expect(r.events[0]).toMatchObject({ action: "cadastro.tipo.alterado", data: { de: { active: true }, para: { active: false } } })
  })

  it("a list a model uses cannot be removed (23503)", () => {
    expect(step(seed, { kind: "removeOptionList", id: ID.list.epi }).denied?.code).toBe("23503")
    expect(step(seed, { kind: "removeOptionList", id: ID.list.perigos }).denied).toBeUndefined()
  })

  it("nothing changed, nothing recorded", () => {
    expect(registryEvents(seed, { ...seed }, ctx)).toEqual([])
    const l = seed.locations[0]
    expect(step(seed, { kind: "upsert", list: "locations", item: { ...l } }).events).toEqual([])
  })
})
