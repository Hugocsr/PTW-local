/**
 * "Fábrica de celulose · demonstração": a second sample scenario for demos (`?cenario=celulose`).
 * Built the way the original sample is: the registry's own writes (import of the client's interlock
 * model, review, activation) and the permits' acts replayed through the stores' pure reducers, then
 * one audit chain hashed from seq 1. A step that breaks a rule makes the build throw.
 */
import { accessEvent, appendEvents, epochMicros, sessionEvent, systemEvent, type AuditCtx, type AuditDraft } from "@/core/audit"
import { instant } from "@/core/time"
import type { Scenario } from "../types"
import { C } from "./ids"
import { importInterlockModel } from "./intertravamento"
import { CEL, CELULOSE_START, celulosePermits } from "./permits"
import { celuloseRegistry } from "./registry"

export { CEL, CELULOSE_START } from "./permits"

const TZ = "America/Sao_Paulo"
const w = (wall: string, who: string) => ({ at: instant(wall, TZ), who })

export function buildCelulose(): Scenario {
  const { marcos } = C.person
  const imported = importInterlockModel(celuloseRegistry, {
    importa: w("2026-11-03T10:12:31", marcos),
    lista: w("2026-11-03T10:41:07", marcos),
    revisa: w("2026-11-03T11:05:44", marcos),
    ativa: w("2026-11-03T11:20:02", marcos),
  })
  const registry = imported.state
  const permits = celulosePermits(registry, imported.model)

  /* Sessions and reads of the morning of 10/11 (the simulated day). */
  const P = C.person
  const ctx = (wall: string, actorId: string): AuditCtx => ({ at: instant(wall, TZ), actorId, auth: "sessao" })
  const name = (id: string) => registry.people.find((p) => p.id === id)?.name ?? id
  const login = (wall: string, who: string) => sessionEvent("sessao.entrada", true, `Entrou: ${name(who)}`, who, ctx(wall, who))
  const ref = (id: string) => { const p = permits.data.permits.find((x) => x.id === id)!; return { id: p.id, revision: p.revision } }
  const reads: AuditDraft[] = [
    login("2026-11-10T06:31:12", P.eduardo),
    login("2026-11-10T06:38:40", P.patricia),
    login("2026-11-10T06:52:05", P.ricardo),
    login("2026-11-10T07:10:19", P.sandro),
    login("2026-11-10T07:24:51", P.lucas),
    login("2026-11-10T07:28:33", P.juliana),
    login("2026-11-10T08:02:47", P.fernanda),
    accessEvent("acesso.pt.aberta", { permit: ref(CEL.quente) }, ctx("2026-11-10T07:16:02", P.sandro)),
    accessEvent("acesso.pt.aberta", { permit: ref(CEL.i5) }, ctx("2026-11-10T08:05:10", P.fernanda)),
    accessEvent("acesso.pt.aberta", { permit: ref(CEL.altura) }, ctx("2026-11-10T08:41:15", P.sandro)),
    accessEvent("acesso.pt.aberta", { permit: ref(CEL.altura) }, ctx("2026-11-10T09:25:48", P.ricardo)),
    systemEvent("sistema.servidor.parado", "Servidor fora do ar", instant("2026-11-10T09:02:00", TZ)),
    systemEvent("sistema.servidor.iniciado", "Servidor de volta", instant("2026-11-10T09:06:37", TZ)),
    accessEvent("acesso.pt.aberta", { permit: ref(CEL.confinado) }, ctx("2026-11-10T09:21:30", P.eduardo)),
    accessEvent("acesso.auditoria.busca", { data: { busca: "“IT-CR-07”" } }, ctx("2026-11-10T09:50:12", P.fernanda)),
  ]
  const all = [...imported.events, ...permits.events, ...reads]
    .map((d, i) => ({ d, i, t: epochMicros(d.at) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.d)

  return {
    key: "celulose",
    registry,
    permits: permits.data,
    audit: appendEvents([], all, registry.units[0].id),
    start: CELULOSE_START,
    defaultPerson: P.ricardo,
    auditors: [P.luciana],
    focus: { assetId: C.asset(17), personId: P.ricardo, openLocationIds: [2, 6, 8].map(C.loc) },
  }
}
