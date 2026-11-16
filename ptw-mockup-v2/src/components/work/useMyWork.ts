import { useMemo } from "react"
import { createMyWorkCache, myWork, type MyWork } from "@/core/myWork"
import { nonHoldingVersionIds, partOfKindIds } from "@/core/equipmentLock"
import type { Equipment } from "@/core/signing"
import type { RegistryState } from "@/registry/types"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"

/** Registry facts for the equipment lock: relations, asset codes, the "é parte de" kinds and the versions that do not hold equipment. */
export const equipmentOf = (state: Pick<RegistryState, "relations" | "assets" | "relationKinds" | "templates">): Equipment =>
  ({ relations: state.relations, assets: state.assets, partOf: partOfKindIds(state.relationKinds), free: nonHoldingVersionIds(state.templates) })

/**
 * One cache for the app: the sidebar badge and Minha área ask for the same work in the same render, so
 * the second ask with the very same inputs gets the first answer, and every permit's place is kept
 * between ticks.
 */
const shared = createMyWorkCache()
let last: { deps: unknown[]; work: MyWork } | null = null
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])
/** One label function and one equipment object per registry lists, the same for every caller. */
const labels = new WeakMap<RegistryState["roleTypes"], (id: string) => string>()
let equip: { key: unknown[]; value: Equipment } | null = null
function sharedEquipment(state: Pick<RegistryState, "relations" | "assets" | "relationKinds" | "templates">): Equipment {
  const key = [state.relations, state.assets, state.relationKinds, state.templates]
  if (!equip || !same(equip.key, key)) equip = { key, value: equipmentOf(state) }
  return equip.value
}
/** The work for these inputs: the last answer when they are the very same, else computed with the shared cache. */
function sharedWork(input: Parameters<typeof myWork>[0], deps: unknown[]): MyWork {
  if (last && same(last.deps, deps)) return last.work
  const work = myWork(input, shared)
  last = { deps, work }
  return work
}
function sharedLabel(roleTypes: RegistryState["roleTypes"]) {
  let f = labels.get(roleTypes)
  if (!f) { f = (id: string) => label(roleTypes, id); labels.set(roleTypes, f) }
  return f
}

/**
 * The signed-in (simulated) person's work, recomputed when the registry, permits or clock change.
 * On a clock tick only the permits whose answer can change with the time are looked at again (see
 * `core/myWork.ts`).
 */
export function useMyWork() {
  const { state } = useRegistry()
  const { permits, signatures, formSnapshots } = usePermits()
  const sim = useSim()
  // Stable while the registry's lists are: the cache keeps its entries across ticks.
  const roleLabel = sharedLabel(state.roleTypes)
  const equipment = sharedEquipment(state)
  return useMemo(() => {
    const deps = [sim.personId, sim.now, sim.today, permits, signatures, formSnapshots, state.people, state.locations, state.templates, state.optionLists, roleLabel, equipment]
    return sharedWork({
      personId: sim.personId, permits, signatures, people: state.people, locations: state.locations, templates: state.templates,
      roleLabel, now: sim.now, today: sim.today, equipment, formSnapshots, optionLists: state.optionLists,
    }, deps)
  }, [sim.personId, sim.now, sim.today, permits, signatures, formSnapshots, state.people, state.locations, state.templates, state.optionLists, roleLabel, equipment])
}
