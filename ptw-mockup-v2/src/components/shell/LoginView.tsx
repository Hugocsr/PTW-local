import { useEffect, useMemo, useState, type FormEvent } from "react"
import { ChevronRightIcon, CircleAlertIcon, LoaderCircleIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useCell, useData } from "@/data/context"
import type { EntryPerson } from "@/data/port"
import { TONE_BLOCK } from "./Status"
import { useBrand } from "@/data/brand"
import { cn } from "@/lib/utils"
import { BrandLogo, BrandMark } from "./BrandMark"

type Mode = "senha" | "como"

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase()
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Both entry modes open an audited server session. The server advertises which are available. */
export function LoginView() {
  const { session } = useData()
  const brand = useBrand()
  const state = useCell(session)
  const [people, setPeople] = useState<EntryPerson[] | null>(null)
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [picked, setPicked] = useState<Mode | null>(null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const both = state.devLogin && state.passwordLogin
  const mode: Mode = state.devLogin && (picked === "como" || !state.passwordLogin) ? "como" : "senha"
  const as = mode === "como"
  useEffect(() => {
    if (!as || state.status !== "ausente" || state.serverDown || !session.entryPeople) return
    let live = true
    void session.entryPeople().then((r) => {
      if (!live) return
      if (Array.isArray(r)) { setPeople(r); setError("") }
      else setError(r.message)
    })
    return () => { live = false }
  }, [as, state.status, state.serverDown, session, retry])
  const shown = useMemo(() => {
    const q = fold(query.trim())
    return (people ?? []).filter((p) => !q || fold(p.name).includes(q) || fold(p.login).includes(q))
  }, [people, query])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!login.trim() || !password || busy || state.serverDown) return
    setBusy("senha"); setError("")
    const e = await session.login?.(login.trim(), password)
    setPassword("")
    if (e) setError(e.message)
    setBusy(null)
  }
  const enterAs = async (p: EntryPerson) => {
    if (busy || state.serverDown) return
    setBusy(p.id); setError("")
    const e = await session.devLogin?.(p.login)
    if (e) setError(e.message)
    setBusy(null)
  }
  const recover = async () => {
    setBusy("retry"); setError("")
    const e = await session.retry?.()
    if (e) setError(e.message)
    setRetry((v) => v + 1); setBusy(null)
  }
  const problem = state.serverDown ? "O servidor não respondeu. Confira a conexão com a rede da planta." : error || state.error?.message
  const loading = state.status === "carregando" && !problem
  const ready = (state.passwordLogin || state.devLogin) && state.status === "ausente"
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-surface-canvas px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_-10%,var(--brand-glow),transparent_70%)]" />
      <div className="relative flex w-full max-w-[26rem] flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        <div className={cn("flex items-center justify-center", brand.logoUrl ? "flex-col gap-4" : "gap-3")}>
          <BrandLogo className="h-10 max-w-64 object-center" />
          {!brand.logoUrl && <BrandMark className="size-11 rounded-xl text-base font-semibold" />}
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{brand.name}</h1>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_oklch(0.2_0.02_262/0.06),0_16px_40px_-16px_oklch(0.2_0.04_262/0.22)] sm:p-7">
          {both && (
            <div role="tablist" aria-label="Forma de entrar" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-well p-1">
              {(["senha", "como"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} disabled={!!busy}
                  onClick={() => { setPicked(m); setError(""); setPassword("") }}
                  className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors md:min-h-9 ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {m === "senha" ? "Login e senha" : "Logar como"}
                </button>
              ))}
            </div>
          )}

          {problem && <Alert className={TONE_BLOCK.attention}><CircleAlertIcon /><AlertTitle>Não foi possível entrar</AlertTitle><AlertDescription>{problem}</AlertDescription></Alert>}

          {loading ? <p className="flex items-center gap-2 py-6 type-body" role="status"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden />Carregando…</p>
            : !ready ? (!problem && <p className="type-body">A entrada ainda não está disponível nesta instalação.</p>)
            : as ? (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Buscar pessoa" placeholder="Buscar pessoa" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-9 text-base md:text-sm" />
                </div>
                {people === null ? (!problem && <p className="flex items-center gap-2 py-4 type-body" role="status"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden />Carregando pessoas…</p>)
                  : shown.length === 0 ? <p className="py-4 type-body text-muted-foreground" role="status">{people.length ? "Nenhuma pessoa com esse nome." : "Nenhuma pessoa cadastrada."}</p>
                  : (
                    <ul className="-mx-2 flex max-h-[22rem] flex-col overflow-y-auto">
                      {shown.map((p) => (
                        <li key={p.id}>
                          <button type="button" disabled={!!busy || state.serverDown} onClick={() => void enterAs(p)}
                            className="group flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-well focus-visible:bg-surface-well focus-visible:outline-none disabled:opacity-60">
                            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-st-pending-surface text-xs font-semibold text-st-pending-fg">{initials(p.name)}</span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">{p.name}</span>
                              <span className="truncate type-data text-muted-foreground">{p.login}</span>
                            </span>
                            {busy === p.id ? <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="Entrando" />
                              : <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ) : (
              <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="entry-login">Login</FieldLabel>
                    <Input id="entry-login" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} disabled={!!busy || state.serverDown} required className="h-11 text-base md:text-sm" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="entry-password">Senha</FieldLabel>
                    <Input id="entry-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!!busy || state.serverDown} required className="h-11 text-base md:text-sm" />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={!login.trim() || !password || !!busy || state.serverDown} className="h-11 w-full text-sm">{busy === "senha" && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}{busy === "senha" ? "Entrando…" : "Entrar"}</Button>
              </form>
            )}

          {(state.serverDown || state.error || (as && !people && error)) && <Button variant="outline" disabled={!!busy} onClick={() => void recover()} className="min-h-11 md:min-h-9"><RefreshCwIcon data-icon="inline-start" />{busy === "retry" ? "Tentando…" : "Tentar novamente"}</Button>}
        </div>

        <p className="flex items-center justify-center gap-2 type-meta" role="status">
          <span aria-hidden className={`size-2 rounded-full ${state.serverDown ? "bg-st-stop-solid" : loading ? "bg-st-neutral-solid" : "bg-st-ok-solid"}`} />
          {state.serverDown ? "Servidor sem resposta" : "Servidor no ar"}
        </p>
      </div>
    </main>
  )
}
