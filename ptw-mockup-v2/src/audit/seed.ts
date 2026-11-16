import { accessEvent, appendEvents, asUndoDraft, epochMicros, sessionEvent, systemEvent, type AuditCtx, type AuditDraft } from "@/core/audit"
import { instant } from "@/core/time"
import { PERMIT_ID, permitSeed, permitSeedEvents } from "@/permit/seed"
import { registryEvents, registryLookups } from "@/registry/audit"
import { templateEvents } from "@/registry/auditModelos"
import { seed as registry } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import type { PermitTemplate, RegistryState } from "@/registry/types"

/** The unit whose chain this is. */
export const AUDIT_UNIT = registry.units[0].id

const R = registry
const TZ = R.units[0].timezone
const { marina: MARINA, rafael: RAFAEL, paulo: PAULO, beatriz: BEA, joana: JOANA, sergio: SERGIO } = ID.person
const ctx = (wall: string, actorId: string): AuditCtx => ({ at: instant(wall, TZ), actorId, auth: "sessao" })
const undo = (ds: AuditDraft[]) => ds.map((d) => asUndoDraft(d))
const people = (s: RegistryState, id: string, f: (p: RegistryState["people"][number]) => RegistryState["people"][number]): RegistryState =>
  ({ ...s, people: s.people.map((p) => (p.id === id ? f(p) : p)) })
const assets = (s: RegistryState, id: string, f: (a: RegistryState["assets"][number]) => RegistryState["assets"][number]): RegistryState =>
  ({ ...s, assets: s.assets.map((a) => (a.id === id ? f(a) : a)) })

/*
 * Registry and configuration history of the days before the simulation, written as the database's
 * row trigger would (registryEvents / templateEvents), with two "Desfazer" (inverse write, marked).
 */
const k01 = ID.asset(9)
const pauloOldRoles = people(R, PAULO, (p) => ({ ...p, roles: p.roles.map((r) => ({ ...r, validUntil: "2026-06-30" })) }))
const pauloOldAccount = people(R, PAULO, (p) => ({ ...p, accountExpires: instant("2026-12-01T00:00:00", TZ) }))
const k01Alias = assets(R, k01, (a) => ({ ...a, aliases: ["Partida P-202"] }))
const valve = R.assetTypes.find((t) => t.id === ID.assetType.valv)!
const noValve: RegistryState = { ...R, assetTypes: R.assetTypes.filter((t) => t.id !== valve.id), assets: R.assets.filter((a) => a.typeId !== valve.id) }
const noRel8: RegistryState = { ...R, relations: R.relations.filter((r) => r.id !== ID.rel(8)) }
const painel = R.templates.find((t) => t.id === ID.template.painel)!
const v3 = painel.versions.find((v) => v.id === ID.version.painel3)!
const painelBefore3: PermitTemplate = { ...painel, versions: painel.versions.filter((v) => v.id !== v3.id) }
const painelOld3: PermitTemplate = { ...painel, versions: painel.versions.map((v) => (v.id === v3.id ? { ...v3, note: "", assetTypeIds: v3.assetTypeIds.slice(0, 1) } : v)) }
const look = registryLookups(R, R, permitSeed.permits)

const registryHistory: AuditDraft[] = [
  ...registryEvents(pauloOldRoles, R, ctx("2026-11-02T09:14:07", MARINA), look),
  ...registryEvents(R, k01Alias, ctx("2026-11-03T10:21:45", SERGIO), look),
  ...undo(registryEvents(k01Alias, R, ctx("2026-11-03T10:22:31", SERGIO), look)),
  // The valve type existed before any valve: only the type row.
  ...registryEvents(noValve, { ...noValve, assetTypes: [...noValve.assetTypes, valve] }, ctx("2026-11-04T08:40:12", MARINA), look),
  ...registryEvents(R, noRel8, ctx("2026-11-04T11:02:55", SERGIO), look),
  ...undo(registryEvents(noRel8, R, ctx("2026-11-04T11:03:01", SERGIO), look)),
  ...templateEvents(painelBefore3, painelOld3, ctx("2026-11-05T09:30:18", MARINA)),
  ...templateEvents(painelOld3, painel, ctx("2026-11-05T09:41:50", MARINA)),
  ...registryEvents(pauloOldAccount, R, ctx("2026-11-05T17:12:40", JOANA), look),
]

/* Sessions, reads and the server's own events of the morning of 06/11 (the simulated day). */
const permitRef = (id: string) => {
  const p = permitSeed.permits.find((x) => x.id === id)
  if (!p) throw new Error(`PT do exemplo ausente: ${id}`)
  return { id: p.id, revision: p.revision }
}
const login = (wall: string, who: string) => sessionEvent("sessao.entrada", true, `Entrou: ${R.people.find((p) => p.id === who)?.name ?? who}`, who, ctx(wall, who))
const photo = permitSeed.attachments.find((a) => a.permitId === PERMIT_ID.p0010)
const reads: AuditDraft[] = [
  login("2026-11-06T07:12:03", PAULO),
  login("2026-11-06T07:40:26", MARINA),
  login("2026-11-06T07:44:51", BEA),
  login("2026-11-06T08:02:10", RAFAEL),
  accessEvent("acesso.pt.aberta", { permit: permitRef(PERMIT_ID.p0010) }, ctx("2026-11-06T08:05:44", PAULO)),
  ...(photo ? [accessEvent("acesso.anexo.visto", { permit: permitRef(PERMIT_ID.p0010), attachment: photo }, ctx("2026-11-06T11:46:02", PAULO))] : []),
  accessEvent("acesso.pt.aberta", { permit: permitRef(PERMIT_ID.p0010) }, ctx("2026-11-06T12:58:30", MARINA)),
  accessEvent("acesso.pt.aberta", { permit: permitRef(PERMIT_ID.p0009) }, ctx("2026-11-06T13:16:10", BEA)),
  systemEvent("sistema.servidor.parado", "Servidor fora do ar", instant("2026-11-06T13:20:00", TZ)),
  systemEvent("sistema.servidor.iniciado", "Servidor de volta", instant("2026-11-06T13:27:41", TZ)),
  accessEvent("acesso.pt.aberta", { permit: permitRef(PERMIT_ID.draft) }, ctx("2026-11-06T13:39:58", RAFAEL)),
  accessEvent("acesso.auditoria.busca", { data: { busca: "“PT-UN01-2026-00010”" } }, ctx("2026-11-06T13:52:19", JOANA)),
]

/** The sample chain: registry, models, permits, sessions and reads in time order, hashed from seq 1. */
const all = [...registryHistory, ...permitSeedEvents, ...reads]
  .map((d, i) => ({ d, i, t: epochMicros(d.at) }))
  .sort((a, b) => a.t - b.t || a.i - b.i)
  .map((x) => x.d)
export const auditSeed = appendEvents([], all, AUDIT_UNIT)
