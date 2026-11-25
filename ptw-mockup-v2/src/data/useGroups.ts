import { useCallback, useEffect, useState } from "react"
import type { AccessProfile, AccessProfileInput, GrantSource, GroupInput, PersonGroup } from "@/core/governance"
import type { RuleError } from "@/core/ptwErrors"
import type { AccessAssignment } from "./port"
import { useCell, useData } from "./context"

/** Groups are server records; reload/races never replace a draft without an explicit user action. */
export function useGroups() {
  const { groups, queries, session } = useData()
  const epoch = useCell(queries.changes?.groups ?? queries.changed)
  const [items, setItems] = useState<PersonGroup[] | null>(null)
  const [error, setError] = useState<RuleError | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void groups.read().then((r) => { if (active) { if (Array.isArray(r)) setItems(r); else setError(r) } })
    return () => { active = false }
  }, [groups, epoch])
  const reload = useCallback(async () => {
    setBusy(true)
    const r = await groups.read()
    if (Array.isArray(r)) { setItems(r); setError(null) } else setError(r)
    setBusy(false)
  }, [groups])
  const save = async (input: GroupInput, revision: number | null): Promise<PersonGroup | null> => {
    if (busy) return null
    setBusy(true)
    const r = await groups.save(input, revision)
    if ("code" in r) { setError(r); setBusy(false); return null }
    setItems((old) => [...(old ?? []).filter((x) => x.id !== r.id), r].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))
    setError(null); setBusy(false)
    // SPEC 002: my own permissions may have changed (I joined or left a group with profiles).
    void session.refreshGrants?.()
    return r
  }
  const clearError = () => setError(null)
  return { items, error, busy, reload, save, clearError }
}

/** Access profiles (SPEC 002): read by everyone in a session, written with Gestão de cadastros. */
export function useProfiles() {
  const { groups, queries, session } = useData()
  const epoch = useCell(queries.changes?.groups ?? queries.changed)
  const [items, setItems] = useState<AccessProfile[] | null>(null)
  const [error, setError] = useState<RuleError | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    void groups.profiles().then((r) => { if (active) { if (Array.isArray(r)) { setItems(r); setError(null) } else setError(r) } })
    return () => { active = false }
  }, [groups, epoch, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const save = async (input: AccessProfileInput, revision: number | null): Promise<AccessProfile | null> => {
    if (busy) return null
    setBusy(true)
    const r = await groups.saveProfile(input, revision)
    if ("code" in r) { setError(r); setBusy(false); return null }
    setItems((old) => [...(old ?? []).filter((x) => x.id !== r.id), r].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))
    setError(null); setBusy(false)
    void session.refreshGrants?.()
    return r
  }
  const clearError = () => setError(null)
  return { items, error, busy, reload, save, clearError }
}

/** Where a person's permissions come from (groups); the directory part is only known for the session's own person. */
export function usePersonAccess(personId: string | null) {
  const { groups, queries } = useData()
  const epoch = useCell(queries.changes?.groups ?? queries.changed)
  const [state, setState] = useState<{ id: string; items: GrantSource[] | null; error: RuleError | null } | null>(null)
  useEffect(() => {
    if (!personId) return
    let active = true
    void groups.personAccess(personId).then((r) => { if (active) setState(Array.isArray(r) ? { id: personId, items: r, error: null } : { id: personId, items: null, error: r }) })
    return () => { active = false }
  }, [groups, personId, epoch])
  return state?.id === personId ? state : { id: personId, items: null, error: null }
}

/** SPEC 007: saves a person's groups and cargos in one call; refreshes my own permissions afterwards. */
export function useAccessAssignments() {
  const { groups, session } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<RuleError | null>(null)
  const save = async (personId: string, personRevision: number, body: AccessAssignment) => {
    if (busy) return null
    setBusy(true); setError(null)
    const r = await groups.saveAssignments(personId, personRevision, body)
    setBusy(false)
    if ("code" in r) { setError(r); return null }
    void session.refreshGrants?.()
    return r
  }
  return { save, busy, error, clearError: () => setError(null) }
}
