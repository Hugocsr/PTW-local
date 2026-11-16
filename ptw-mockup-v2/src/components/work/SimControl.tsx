import { useState } from "react"
import { ChevronDownIcon, LogOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { initials, useRegistry } from "@/registry/store"
import { fmtDateTime } from "@/sim/SimProvider"
import { useCell, useData } from "@/data/context"
import { TONE_TEXT } from "../shell/Status"

/** The current database session; passwordless switching is enabled only by the server. */
export function SimControl() {
  const { state } = useRegistry()
  const { session } = useData()
  const current = useCell(session)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const me = state.people.find((p) => p.id === current.personId)
  const users = state.people.filter((p) => p.login && p.enabled && p.status === "ativo")
  const switchTo = async (login: string) => {
    if (busy || !session.devLogin) return
    setBusy(true); setError("")
    const e = await session.devLogin(login)
    if (e) setError(e.message)
    setBusy(false)
  }
  const logout = async () => {
    setBusy(true); setError("")
    const e = await session.logout?.()
    if (e) setError(e.message)
    setBusy(false)
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="ml-auto min-h-11 max-w-[45%] shrink-0 gap-2 rounded-full pl-1.5 md:min-h-9" aria-label={`Pessoa atual: ${me?.name ?? "—"}`}>
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-semibold text-primary-foreground">{initials(me?.name ?? "?")}</span>
          <span className="hidden truncate lg:inline">{me?.name ?? "—"}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4">
        <p className="type-section break-words">{me?.name}</p>
        {current.devLogin && <Field>
          <FieldLabel htmlFor="session-person">Trocar de pessoa</FieldLabel>
          <Select value={me?.login ?? ""} onValueChange={(v) => void switchTo(v)} disabled={busy || current.serverDown}>
            <SelectTrigger id="session-person" className="min-h-11 w-full md:min-h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{users.map((p) => <SelectItem key={p.id} value={p.login!}>{p.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>}
        {error && <p role="alert" className={TONE_TEXT.stop}>{error}</p>}
        <p className="type-meta tabular-nums">{fmtDateTime(current.now)}</p>
        <Button variant="outline" disabled={busy || current.serverDown} onClick={() => void logout()} className="min-h-11 self-start md:min-h-9"><LogOutIcon data-icon="inline-start" />{busy ? "Aguarde…" : "Sair"}</Button>
      </PopoverContent>
    </Popover>
  )
}
