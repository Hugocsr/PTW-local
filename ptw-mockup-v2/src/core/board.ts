/**
 * The Quadro's rows: each permit with its model, who moves next and whether it is this person's turn.
 * Pure; a `BoardCache` keeps each row while its permit, its signatures, the day and the accounts that
 * expired stay the same (the rail reads the clock only through account expiry), so the clock's tick
 * does not rebuild 100 000 rows. Finished permits have no rail: nobody moves next.
 */
import type { Location, Person, PermitTemplate, TemplateVersion } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import { isFinalState, nextLabel, railOf, waitsFor } from "./permitView"
import { needsResume, resumeCandidates } from "./stopResume"
import { accountEpoch, byId, signaturesOf } from "./indexes"

export interface BoardRow { p: Permit; tpl: PermitTemplate; ver: TemplateVersion; next: string; mine: boolean }

export interface BoardCache { globals: unknown[]; rows: Map<string, { key: unknown[]; sigs: readonly SignatureRec[]; row: BoardRow }> }
export const createBoardCache = (): BoardCache => ({ globals: [], rows: new Map() })
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function boardRows(input: { permits: Permit[]; signatures: SignatureRec[]; people: Person[]; locations: Location[]; templates: PermitTemplate[]; personId: string; today: string; now: string }, cache?: BoardCache): BoardRow[] {
  const { permits, signatures, people, locations, templates, personId, today, now } = input
  const epoch = accountEpoch(people, now)
  if (cache) {
    const globals = [people, locations, templates, personId]
    if (!same(cache.globals, globals)) { cache.globals = globals; cache.rows.clear() }
  }
  const out: BoardRow[] = []
  for (const p of permits) {
    // Someone else's draft is not on the board.
    if (p.state === "rascunho" && p.authorId !== personId) continue
    const tpl = byId(templates, p.templateId)
    const ver = tpl?.versions.find((v) => v.id === p.versionId)
    if (!tpl || !ver) continue
    const sigs = signaturesOf(signatures, p.id)
    const key = [p, today, epoch]
    const hit = cache?.rows.get(p.id)
    if (hit && same(hit.key, key) && same(hit.sigs, sigs)) { out.push(hit.row); continue }
    let row: BoardRow
    if (isFinalState(p.state)) row = { p, tpl, ver, next: "—", mine: false }
    else {
      const rail = railOf(p, ver, sigs as SignatureRec[], people, locations, today, now)
      const resumers = needsResume(p) ? resumeCandidates(p, ver, people, locations, today, now) : []
      row = { p, tpl, ver, next: nextLabel(p, rail, people, resumers), mine: waitsFor(p, rail, personId, resumers) }
    }
    cache?.rows.set(p.id, { key, sigs, row })
    out.push(row)
  }
  return out
}
