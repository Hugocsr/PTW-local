import type { AuditEvent } from "@/core/audit"
import type { PermitData } from "@/permit/types"
import type { RegistryState } from "@/registry/types"

/** The test data sets. "exemplo" is the one most tests use. */
export const SCENARIO_KEYS = ["exemplo", "celulose", "carga"] as const
export type ScenarioKey = (typeof SCENARIO_KEYS)[number]

/**
 * One complete sample: registry, permits and the audit chain that wrote them (built by replaying the
 * stores' own acts, so every rule holds), plus where the simulation starts.
 */
export interface Scenario {
  key: ScenarioKey
  registry: RegistryState
  permits: PermitData
  audit: AuditEvent[]
  /** The simulated clock starts here (instant with the unit's offset). */
  start: string
  /** The person the simulation starts as. */
  defaultPerson: string
  /** People who only consult (no cargo). */
  auditors: string[]
  /** What the registry screens open on. */
  focus: { assetId: string | null; personId: string | null; openLocationIds: string[] }
}
