import { auditSeed } from "@/audit/seed"
import { permitSeed, SIM_AUDITORS, SIM_START } from "@/permit/seed"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import type { Scenario } from "./types"
import { buildDemoTemplates } from "./celulose/modelosDemo"

const R = ID.role
/** The three showcase models (simples · média · complexa) with this sample's four cargos. */
const demoModels = buildDemoTemplates({
  roles: { tecMec: R.tec, tecEle: R.tec, tecIns: R.tec, coordMan: R.sup, supTurno: R.sup, coordArea: R.sup, lider: R.lider, operador: R.sup, gerMan: R.sup, tecSeg: R.sup, gerArea: R.sup, gerInd: R.sup, vigia: R.exec },
  perigosListId: ID.list.perigos,
  locationTypeIds: seed.locationTypes.map((t) => t.id),
  assetTypeIds: seed.assetTypes.map((t) => t.id),
})

/** The original sample (the tests use it). */
export const exemplo: Scenario = {
  key: "exemplo",
  registry: { ...seed, templates: [...seed.templates, ...demoModels] },
  permits: permitSeed,
  audit: auditSeed,
  start: SIM_START,
  defaultPerson: ID.person.marina,
  auditors: SIM_AUDITORS,
  focus: { assetId: ID.asset(1), personId: ID.person.paulo, openLocationIds: [1, 2, 3, 7, 8, 10].map(ID.loc) },
}
