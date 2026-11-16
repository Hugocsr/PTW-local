/**
 * The load scenario's registry: the pulp mill's (places, models, lists, its 19 people) plus a
 * generated workforce scoped by area and ~20 000 assets in realistic "é parte de" families under the
 * mill's existing places. Deterministic (seeded).
 */
import type { Asset, AssetRelation, Person, RegistryState, RoleAssignment } from "@/registry/types"
import { C } from "../celulose/ids"
import { G, type Rng } from "./ids"

const T = "2026-11-02T08:00:00-03:00"
const R = C.role
const AT = C.assetType

/** The 12 process areas (top-level places 1–12) and their child places. */
export const TOP_AREAS = Array.from({ length: 12 }, (_, i) => i + 1)
const CHILDREN: Record<number, number[]> = { 1: [13], 2: [14, 15, 29], 3: [16], 4: [17], 5: [18], 6: [19, 20], 7: [21], 8: [22], 9: [23], 10: [24], 11: [25, 26], 12: [27, 28] }
/** Top area of a place (n). */
export const areaOf = (n: number) => (n <= 12 ? n : Number(Object.entries(CHILDREN).find(([, k]) => k.includes(n))![0]))

/* ---------------- people ---------------- */

const FIRST = ["Ana", "Bruno", "Carla", "Daniel", "Elisa", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Karina", "Leonardo", "Mariana", "Nelson", "Olívia", "Paulo", "Rafaela", "Sérgio", "Tatiane", "Vinícius", "Wagner", "Yasmin", "Adriano", "Beatriz", "César", "Débora", "Everton", "Fabiana", "Gilberto", "Heloísa", "Igor", "Jéssica", "Kléber", "Larissa", "Márcio", "Natália", "Otávio", "Priscila", "Rodrigo", "Simone"]
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Rocha", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa", "Cardoso", "Correia", "Dias", "Teixeira", "Moreira", "Mendes", "Freitas", "Vieira", "Monteiro", "Pinto"]
const CONTRACTORS = ["Montagens Serra (contratada)", "Serviços Tibagi (contratada)", "Elétrica Paranapanema (contratada)", "Caldeiraria Iguaçu (contratada)"]
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Per area: cargo, how many, contractor (company), login. */
const CREW: [role: string, n: number, contractor: boolean, login: boolean][] = [
  [R.operador, 6, false, true], [R.tecMec, 4, false, true], [R.tecEle, 3, false, true], [R.tecIns, 2, false, true],
  [R.supTurno, 2, false, true], [R.tecSeg, 2, false, true], [R.lider, 3, true, true], [R.vigia, 2, true, false],
]

/** Generated people by area and cargo (ids), for the permit generator. */
export type Pools = Record<number, Record<string, string[]>>

function workforce(r: Rng): { people: Person[]; pools: Pools } {
  const people: Person[] = []
  const pools: Pools = {}
  const logins = new Set<string>()
  let n = 0, roleN = 0
  for (const area of TOP_AREAS) {
    pools[area] = {}
    for (const [role, count, contractor, login] of CREW) {
      for (let i = 0; i < count; i++) {
        n++
        const name = `${r.pick(FIRST)} ${r.pick(LAST)}`
        let lg = ascii(name).replace(" ", ".")
        while (logins.has(lg)) lg = `${ascii(name).replace(" ", ".")}${r.int(2, 99)}`
        logins.add(lg)
        const roles: RoleAssignment[] = [{ id: G.personRole(++roleN), roleId: role, scopeLocationId: C.loc(area), validUntil: "2027-12-31" }]
        const id = G.person(n)
        people.push({
          id, unitId: C.unit, revision: 1, updatedAt: T, origin: contractor ? "csv" : "ad", status: "ativo",
          name, company: contractor ? CONTRACTORS[(area + i) % CONTRACTORS.length] : "Celulose Demo", employeeId: `${contractor ? "C" : "E"}-${String(4000 + n)}`,
          login: login ? lg : null, enabled: true, accountExpires: null, adObjectGuid: null, roles,
        })
        ;(pools[area][role] ??= []).push(id)
      }
    }
  }
  return { people, pools }
}

/* ---------------- assets ---------------- */

/** A family: the root and the parts it is made of ("é parte de"), with the type and tag prefix. */
type Part = [type: string, prefix: string, name: string]
const FAMILIES: { w: number; root: Part; parts: [Part, number, number][] }[] = [
  { w: 30, root: [AT.bomba, "B", "Bomba"], parts: [[[AT.motor, "M", "Motor da bomba"], 1, 1], [[AT.inst, "VT", "Transmissor de vibração"], 0, 2]] },
  { w: 14, root: [AT.tanque, "TQ", "Tanque"], parts: [[[AT.motor, "M-AG", "Motor do agitador"], 0, 1], [[AT.inst, "LT", "Transmissor de nível"], 1, 2]] },
  { w: 10, root: [AT.painel, "CCM", "Centro de controle de motores"], parts: [[[AT.gaveta, "G", "Gaveta"], 3, 8]] },
  { w: 8, root: [AT.vent, "VT", "Ventilador"], parts: [[[AT.motor, "M", "Motor do ventilador"], 1, 1], [[AT.inst, "TE", "Sensor de temperatura do mancal"], 1, 2]] },
  { w: 6, root: [AT.transp, "TC", "Transportador"], parts: [[[AT.motor, "M", "Motor de acionamento"], 1, 2]] },
  { w: 4, root: [AT.comp, "CP", "Compressor"], parts: [[[AT.motor, "M", "Motor do compressor"], 1, 1], [[AT.inst, "PT", "Transmissor de pressão"], 1, 1]] },
  { w: 4, root: [AT.vaso, "VS", "Vaso de pressão"], parts: [[[AT.inst, "PSV", "Válvula de segurança"], 1, 2]] },
  { w: 2, root: [AT.trafo, "TR", "Transformador"], parts: [[[AT.inst, "TT", "Termômetro do óleo"], 0, 1]] },
  { w: 14, root: [AT.tubo, "L", "Linha"], parts: [] },
  { w: 8, root: [AT.inst, "FT", "Transmissor de vazão"], parts: [] },
]
const SERVICE = ["de licor branco", "de licor preto", "de condensado", "de água industrial", "de filtrado", "de massa", "de soda", "de água de resfriamento", "de lama de cal", "de efluente", "de óleo", "de vapor"]

/** Generated assets: every asset has one place; `leaves` are the parts and lone assets (open PTs go there first). */
export interface GenAssets { assets: Asset[]; relations: AssetRelation[]; roots: string[][]; loneIds: string[]; locOf: Map<string, number> }

function assetsFor(r: Rng, total: number): GenAssets {
  const assets: Asset[] = []
  const relations: AssetRelation[] = []
  const roots: string[][] = [] // [root, ...parts]
  const loneIds: string[] = []
  const locOf = new Map<string, number>()
  const places = [...TOP_AREAS, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
  let n = 0, rel = 0
  const counter = new Map<string, number>()
  const make = (p: Part, place: number, area: number, svc: string, parentCode?: string, i = 0): Asset => {
    const [typeId, prefix, name] = p
    let code: string
    if (parentCode) code = `${parentCode}.${prefix}${i + 1}`
    else {
      const key = `${prefix}-${area}`
      const k = (counter.get(key) ?? 0) + 1
      counter.set(key, k)
      code = `${prefix}-${String(area).padStart(2, "0")}${String(k).padStart(4, "0")}`
    }
    const id = G.asset(++n)
    locOf.set(id, place)
    const a: Asset = { id, unitId: C.unit, revision: 1, updatedAt: T, origin: "csv", status: "ativo", typeId, code, name: parentCode ? name : `${name} ${svc}`, aliases: [], locationIds: [C.loc(place)] }
    assets.push(a)
    return a
  }
  while (n < total) {
    const place = r.pick(places)
    const area = areaOf(place)
    const fam = r.weighted(FAMILIES.map((f) => [f, f.w] as const))
    const svc = r.pick(SERVICE)
    const root = make(fam.root, place, area, svc)
    if (!fam.parts.length) { loneIds.push(root.id); continue }
    const family = [root.id]
    for (const [p, lo, hi] of fam.parts) {
      const count = r.int(lo, hi)
      for (let i = 0; i < count && n < total; i++) {
        const part = make(p, place, area, svc, root.code, i)
        relations.push({ id: G.rel(++rel), fromId: part.id, toId: root.id, kindId: C.relationKind.parte })
        family.push(part.id)
      }
    }
    if (family.length === 1) loneIds.push(root.id)
    else roots.push(family)
  }
  return { assets, relations, roots, loneIds, locOf }
}

export interface CargaRegistry { registry: RegistryState; pools: Pools; gen: GenAssets }

/** The pulp mill's registry (after the interlock import) with the generated people and assets added. */
export function cargaRegistry(base: RegistryState, r: Rng, assetTotal: number): CargaRegistry {
  const { people, pools } = workforce(r)
  const gen = assetsFor(r, assetTotal)
  return {
    registry: { ...base, people: [...base.people, ...people], assets: [...base.assets, ...gen.assets], relations: [...base.relations, ...gen.relations] },
    pools,
    gen,
  }
}
