/**
 * The load: ~100 000 permits built directly in their final state from the prototypes (see
 * `prototypes.ts`). Each copy gets its own ids, number, equipment, place, people and window; every
 * instant of the prototype moves by the same amount, so the order of acts, the window checks and the
 * separation of duties stay as the rules left them. Open permits each hold equipment of their own
 * (no two collide through "é parte de"), so the one-open-PT-per-equipment rule holds.
 */
import type { ItemAnswer } from "@/core/form"
import type { Permit, SignatureRec } from "@/permit/types"
import type { Asset, Person } from "@/registry/types"
import { C, type ModelKey } from "../celulose/ids"
import { G, isoSP, type Rng } from "./ids"
import { PROTO_CAST, PROTO_START, windowHours, type CastKey, type Prototypes, type Track } from "./prototypes"
import { areaOf, type GenAssets, type Pools } from "./registry"

const R = C.role
const H = 3600_000
const MIN = 60_000

/** How many of each open track (sums to `open`), scaled from this mix. */
export const OPEN_MIX: [Track, number][] = [
  ["rascunho", 900], ["analise", 1100], ["analise_emi", 900], ["devolvida", 400], ["emitida", 1500],
  ["ativa", 3200], ["suspensa", 250], ["retomada", 150], ["entregue", 700], ["expirada", 900],
]
/** Closed: encerradas over the last 12 months, a few canceladas. */
export const CLOSED_MIX: [Track, number][] = [["encerrada", 89_400], ["cancelada", 600]]

const MODEL_TYPES: Record<ModelKey, string[] | null> = {
  geral: null,
  quente: [C.assetType.vaso, C.assetType.tanque, C.assetType.bomba, C.assetType.motor, C.assetType.cald, C.assetType.vent, C.assetType.soprador, C.assetType.comp, C.assetType.tubo, C.assetType.forno, C.assetType.maq, C.assetType.transp, C.assetType.evap, C.assetType.precip],
  confinado: [C.assetType.vaso, C.assetType.tanque, C.assetType.cald, C.assetType.forno, C.assetType.evap, C.assetType.precip],
  altura: [C.assetType.vaso, C.assetType.tanque, C.assetType.bomba, C.assetType.motor, C.assetType.cald, C.assetType.vent, C.assetType.soprador, C.assetType.comp, C.assetType.tubo, C.assetType.forno, C.assetType.maq, C.assetType.transp, C.assetType.evap, C.assetType.precip],
  eletrica: [C.assetType.painel, C.assetType.gaveta, C.assetType.trafo, C.assetType.motor],
}
const MODEL_W: Record<ModelKey, number> = { geral: 40, quente: 15, confinado: 15, altura: 15, eletrica: 15 }
const VERB: Record<ModelKey, string[]> = {
  geral: ["Manutenção corretiva", "Troca de rolamentos", "Inspeção preventiva", "Troca de selo mecânico", "Alinhamento"],
  quente: ["Solda de reparo", "Corte e solda de suporte", "Recuperação por solda"],
  confinado: ["Inspeção interna", "Limpeza interna", "Troca de revestimento"],
  altura: ["Inspeção em altura", "Pintura em altura", "Troca de componente em altura"],
  eletrica: ["Troca de contator", "Manutenção preventiva", "Reaperto e termografia"],
}

/** When the clone's window starts, relative to "now", per track (ms; [min, max]). */
function startRange(track: Track, m: ModelKey): [number, number] {
  const len = windowHours(m) * H
  switch (track) {
    case "rascunho": case "analise": case "devolvida": return [1 * H, 15 * H]
    case "analise_emi": return [0.5 * H, 14 * H]
    case "emitida": return [-(len - 1 * H), 14 * H]
    case "ativa": return [-(len - 10 * MIN), -30 * MIN]
    case "suspensa": return [-(len - 10 * MIN), -2 * H]
    case "retomada": return [-(len - 10 * MIN), -2.5 * H]
    case "entregue": return [-48 * H, -7.5 * H - (len - 8 * H)]
    case "expirada": return [-len - 72 * H, -len - MIN]
    case "encerrada": case "cancelada": return [-365 * 24 * H, -len - 8 * H]
  }
}

interface Cast { A: string; L: string; S: string; E: string; X: string; F: string; V: string; xRole: string }

export interface Generated { permits: Permit[]; signatures: SignatureRec[]; byTrack: Record<string, number>; openCount: number }

export function generatePermits(o: {
  r: Rng; protos: Prototypes; now: string; gen: GenAssets; assets: Asset[]; pools: Pools; people: Person[]; total: number; openTotal: number; counter2026Skip: [number, number]
}): Generated {
  const { r, protos, gen, pools, people } = o
  const nowMs = Date.parse(o.now)
  const P = C.person
  const assetById = new Map(o.assets.map((a) => [a.id, a]))
  const personById = new Map(people.map((p) => [p.id, p]))

  /* -------- who may play each part, per area (generated people + the named ones whose cargo covers it) -------- */
  const inArea = (personId: string, area: number) => personById.get(personId)!.roles.some((x) => x.scopeLocationId === null || x.scopeLocationId === C.loc(area))
  const pool = (area: number, roles: string[], named: string[]) => [...roles.flatMap((role) => pools[area][role] ?? []), ...named.filter((id) => inArea(id, area))]
  const castPools = new Map<number, Record<string, { gen: string[]; named: string[] }>>()
  for (const area of Object.keys(pools).map(Number)) {
    castPools.set(area, {
      A: { gen: pool(area, [R.tecMec, R.tecIns], []), named: [P.lucas, P.andre, P.marcos] },
      Ael: { gen: pool(area, [R.tecEle], []), named: [P.juliana] },
      L: { gen: pool(area, [R.operador, R.supTurno], []), named: [P.patricia, P.gustavo, P.ricardo, P.aline].filter((id) => inArea(id, area)) },
      S: { gen: pool(area, [R.tecSeg], []), named: [P.eduardo] },
      E: { gen: pool(area, [R.supTurno], []), named: [P.ricardo, P.aline, P.camila].filter((id) => inArea(id, area)) },
      X: { gen: pool(area, [R.lider, R.tecMec, R.tecEle, R.tecIns], []), named: [P.sandro, P.lucas, P.andre] },
      F: { gen: pool(area, [R.operador, R.supTurno], []), named: [P.ricardo, P.gustavo, P.patricia].filter((id) => inArea(id, area)) },
      V: { gen: pool(area, [R.vigia], []), named: [P.jose] },
    })
  }
  const XROLES = [R.lider, R.tecMec, R.tecEle, R.tecIns]
  /** The named people show up often enough that Minha área has real content (open permits only). */
  const choose = (k: { gen: string[]; named: string[] }, namedP: number, not: string[] = []) => {
    for (let i = 0; i < 6; i++) {
      const id = k.named.length && r.next() < namedP ? r.pick(k.named) : r.pick(k.gen)
      if (!not.includes(id)) return id
    }
    return k.gen.find((id) => !not.includes(id))!
  }
  function cast(area: number, m: ModelKey, open: boolean): Cast {
    const k = castPools.get(area)!
    const np = open ? 0.06 : 0.02
    const A = choose(m === "eletrica" ? k.Ael : k.A, open ? 0.12 : 0.03)
    const L = choose(k.L, np, [A])
    const S = choose(k.S, np)
    const E = choose(k.E, np, [A, L])
    const X = choose(k.X, open ? 0.1 : 0.03, [E])
    const F = choose(k.F, np, [X])
    const V = choose(k.V, 0.05)
    const xRole = personById.get(X)!.roles.find((x) => XROLES.includes(x.roleId))!.roleId
    return { A, L, S, E, X, F, V, xRole }
  }

  /* -------- equipment: open permits on equipment no other open permit touches -------- */
  const typeOf = (id: string) => assetById.get(id)!.typeId
  const fits = (m: ModelKey, id: string) => { const t = MODEL_TYPES[m]; return !t || t.includes(typeOf(id)) }
  const pickModel = (assetId: string): ModelKey => r.weighted((Object.keys(MODEL_W) as ModelKey[]).filter((m) => fits(m, assetId)).map((m) => [m, MODEL_W[m]] as const))
  // A few whole families (the root holds all its parts), then the parts and lone assets of the others.
  const fams = r.shuffle([...gen.roots])
  const openAssets: string[] = []
  const wholeFamilies = Math.floor(fams.length * 0.08)
  fams.forEach((f, i) => { if (i < wholeFamilies) openAssets.push(f[0]); else openAssets.push(...f.slice(1)) })
  openAssets.push(...gen.loneIds)
  r.shuffle(openAssets)
  const allGen = gen.assets.map((a) => a.id)

  /* -------- the plan: which track each permit follows -------- */
  const scale = (mix: [Track, number][], total: number) => {
    const sum = mix.reduce((n, [, w]) => n + w, 0)
    const out: Track[] = []
    mix.forEach(([t, w], i) => { const n = i === mix.length - 1 ? total - out.length : Math.round((w / sum) * total); for (let k = 0; k < n; k++) out.push(t) })
    return out
  }
  const plan = [...scale(OPEN_MIX, o.openTotal), ...scale(CLOSED_MIX, o.total - o.openTotal)]

  const permits: Permit[] = []
  const signatures: SignatureRec[] = []
  const byTrack: Record<string, number> = {}
  const sendTimes: { i: number; t: number }[] = []
  const protoStart = Date.parse(PROTO_START)
  const parseCache = new Map<string, number>()
  const ms = (iso: string) => { let v = parseCache.get(iso); if (v === undefined) { v = Date.parse(iso); parseCache.set(iso, v) } return v }
  const EMPTY_META: Permit["answerMeta"] = Object.freeze({}) as Permit["answerMeta"]
  let sigN = 0, openUsed = 0
  // Prototype person → the part they play (A, L, S…), per model.
  const protoPart = Object.fromEntries((Object.keys(MODEL_W) as ModelKey[]).map((m) => [m, new Map(Object.entries(PROTO_CAST(m)).map(([k, id]) => [id, k as CastKey]))])) as Record<ModelKey, Map<string, CastKey>>

  for (let n = 1; n <= plan.length; n++) {
    const track = plan[n - 1]
    const open = track !== "encerrada" && track !== "cancelada"
    const holds = open && track !== "rascunho"
    let assetId: string
    if (holds) {
      assetId = openAssets[openUsed++]
      if (!assetId) throw new Error("Carga: equipamento livre insuficiente para as PTs abertas")
    } else assetId = r.pick(allGen)
    const model = pickModel(assetId)
    const proto = protos[model][track]
    const place = gen.locOf.get(assetId)!
    const area = areaOf(place)
    const c = cast(area, model, open)
    const part = protoPart[model]
    const who = (id: string | null) => { if (id === null) return null; const k = part.get(id); return k ? c[k] : id }
    const [lo, hi] = startRange(track, model)
    const startMs = nowMs + lo + Math.floor(r.next() * (hi - lo) / MIN) * MIN
    const delta = startMs - protoStart
    const shift = (iso: string | null) => (iso === null ? null : isoSP(ms(iso) + delta))
    const pp = proto.permit
    const id = G.permit(n)
    const asset = assetById.get(assetId)!
    const scope = `${r.pick(VERB[model])}: ${asset.name} (${asset.code})`
    // Answers: the prototype's, with this permit's order, description and people. Finished permits
    // share the prototype's answers object (memory and time for 90 000 of them): same order number,
    // description and named people (José as vigia) on every one; nobody edits a finished permit.
    const answers: Record<string, ItemAnswer> = open ? { ...pp.answers } : pp.answers
    if (open) {
      if (answers.fi_os) answers.fi_os = { t: "documento", code: `OS-${String(100000 + (n % 900000)).padStart(6, "0")}`, files: [] }
      if (answers.fi_desc) answers.fi_desc = { t: "texto", v: scope }
      if (answers.fi_q_obs) answers.fi_q_obs = { t: "pessoa", ids: [c.V] }
      if (answers.fi_ec_vigia) answers.fi_ec_vigia = { t: "pessoa", ids: [c.V] }
      const iso = answers.fi_el_iso
      if (iso?.t === "isolamento") answers.fi_el_iso = { t: "isolamento", rows: iso.rows.map((x) => ({ ...x, by: c.A })) }
    }
    let answerMeta = EMPTY_META
    if (open) {
      answerMeta = {}
      for (const [k, v] of Object.entries(pp.answerMeta)) answerMeta[k] = { answeredBy: who(v.answeredBy)!, answeredAt: shift(v.answeredAt)! }
    }
    const team: Permit["team"] = { [c.xRole]: [c.X], ...(model === "confinado" ? { [R.vigia]: [c.V] } : {}) }
    permits.push({
      ...pp, id, number: null, authorId: c.A, locationId: C.loc(place), assetIds: [assetId], team,
      windowStart: shift(pp.windowStart)!, windowEnd: shift(pp.windowEnd)!, scope, answers, answerMeta,
      snapshotAt: shift(pp.snapshotAt), holdBy: who(pp.holdBy), holdAt: shift(pp.holdAt), resumedBy: who(pp.resumedBy), resumedAt: shift(pp.resumedAt),
      createdAt: shift(pp.createdAt)!, updatedAt: shift(pp.updatedAt)!,
    })
    for (const g of proto.signatures) {
      signatures.push({ id: G.signature(++sigN), permitId: id, rev: g.rev, slotId: g.slotId, personId: who(g.personId)!, signedAt: shift(g.signedAt)!, voidedAt: shift(g.voidedAt), voidedReason: g.voidedReason })
    }
    if (pp.snapshotAt) sendTimes.push({ i: permits.length - 1, t: ms(pp.snapshotAt) + delta })
    byTrack[track] = (byTrack[track] ?? 0) + 1
  }

  /* -------- numbers: given at the first Enviar, one sequence per year, in the order they were sent -------- */
  sendTimes.sort((a, b) => a.t - b.t)
  const seq = new Map<string, number>()
  const [skipLo, skipHi] = o.counter2026Skip
  for (const { i, t } of sendTimes) {
    const year = isoSP(t).slice(0, 4)
    let k = (seq.get(year) ?? 0) + 1
    if (year === "2026" && k >= skipLo && k <= skipHi) k = skipHi + 1
    seq.set(year, k)
    permits[i].number = `PT-CEL01-${year}-${String(k).padStart(5, "0")}`
  }
  return { permits, signatures, byTrack, openCount: openUsed }
}
