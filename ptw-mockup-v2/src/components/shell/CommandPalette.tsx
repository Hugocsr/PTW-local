import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react"
import { byId } from "@/core/indexes"
import { assetIcon, locationIcon } from "./TypeIcon"
import { ClipboardListIcon, FileTextIcon, HistoryIcon, PlusIcon, SearchIcon, UserIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { NAV, NAV_KEYS } from "@/components/shell/nav"
import { StatusBadge } from "@/components/shell/Status"
import { highlight, matches } from "@/components/shell/commandSearch"
import { PERMIT_STATE_LABEL } from "@/core/permitState"
import { PERMIT_STATE_TONE } from "@/core/permitView"
import { permitName } from "@/core/permitFormat"
import { useAssetPage, useData, usePermitBoard } from "@/data/hooks"
import type { ListView } from "@/data/port"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import type { Permit } from "@/permit/types"

/**
 * Ctrl/⌘+K anywhere, or the search button in the header: go to a screen, start a PT, or find a PT, asset,
 * place, person or model. PTs and assets are asked of the server through the query hooks (after a pause in the
 * typing); the rest is already in memory. Recents live in memory only, for this browser session.
 */
const MAX = 5
const PAUSE_MS = 250
const GROUP = "**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:type-label"
const ROW = "min-h-11 gap-3 px-3 py-2 md:min-h-10"

const recents: { id: string; label: string; service: string }[] = []
const go = (hash: string) => { window.location.hash = hash }
const isMac = () => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform)

function Mark({ text, q }: { text: string; q: string }) {
  const parts = highlight(text, q)
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-xs bg-transparent font-semibold text-foreground underline decoration-foreground/30 underline-offset-2">{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>
}

function Row({ icon: Icon, value, onPick, children, end }: { icon: LucideIcon; value: string; onPick: () => void; children: ReactNode; end?: ReactNode }) {
  return (
    <CommandItem value={value} onSelect={onPick} className={ROW}>
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">{children}</span>
      {end}
    </CommandItem>
  )
}

function PermitRow({ p, q, assetCode, onPick }: { p: Permit; q: string; assetCode?: string; onPick: () => void }) {
  return (
    <Row icon={ClipboardListIcon} value={`pt-${p.id}`} onPick={onPick}
      end={<StatusBadge tone={PERMIT_STATE_TONE[p.state]} className="shrink-0">{PERMIT_STATE_LABEL[p.state]}</StatusBadge>}>
      <span className="truncate type-body"><Mark text={p.scope} q={q} /></span>
      <span className="truncate type-data text-muted-foreground"><Mark text={permitName(p)} q={q} />{assetCode ? <> · <Mark text={assetCode} q={q} /></> : null}</span>
    </Row>
  )
}

/** The two reads that go to the server; mounted only while there is something to ask. */
function Remote({ q, onStatus, close }: { q: string; onStatus: (s: { loading: boolean; down: boolean; count: number }) => void; close: (hash: string) => void }) {
  const view = useMemo<ListView>(() => ({ q, filters: {}, sort: null, page: 0, pageSize: MAX }), [q])
  const assetView = useMemo<ListView>(() => ({ q, filters: {}, sort: { id: "code", dir: "asc" }, page: 0, pageSize: MAX }), [q])
  const board = usePermitBoard(view)
  const assets = useAssetPage(assetView)
  const { assets: known, assetTypes } = useRegistry().state
  const loading = board.loading || assets.loading
  const down = board.error?.code === "sem_servidor" || assets.error?.code === "sem_servidor"
  const count = board.items.length + assets.items.length
  useEffect(() => { onStatus({ loading, down, count }) }, [loading, down, count, onStatus])
  const code = (id?: string) => (id ? known.find((a) => a.id === id)?.code : undefined)
  return (
    <>
      {board.items.length > 0 && (
        <CommandGroup heading="PTs" className={GROUP}>
          {board.items.slice(0, MAX).map((r) => <PermitRow key={r.p.id} p={r.p} q={q} assetCode={code(r.p.assetIds[0])} onPick={() => close(`pt/${r.p.id}/etapas`)} />)}
        </CommandGroup>
      )}
      {assets.items.length > 0 && (
        <CommandGroup heading="Ativos" className={GROUP}>
          {assets.items.slice(0, MAX).map((a) => (
            <Row key={a.id} icon={assetIcon(byId(assetTypes, a.typeId))} value={`ativo-${a.id}`} onPick={() => close(`ativos/${a.id}`)}>
              <span className="truncate type-body"><span className="type-data"><Mark text={a.code} q={q} /></span> · <Mark text={a.name} q={q} /></span>
            </Row>
          ))}
        </CommandGroup>
      )}
    </>
  )
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [asked, setAsked] = useState("")
  const [remote, setRemote] = useState({ loading: false, down: false, count: 0 })
  const { state } = useRegistry()
  const { permits } = usePermits()
  const { canAudit, serverDown } = useSim()
  const port = useData()
  const q = text.trim()

  const change = (next: boolean | null) => {
    setOpen((o) => (next ?? !o))
    if (next !== true) { setText(""); setAsked("") }
  }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); change(null) }
    }
    document.addEventListener("keydown", on)
    return () => document.removeEventListener("keydown", on)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => setAsked(q), q ? PAUSE_MS : 0)
    return () => clearTimeout(t)
  }, [q])

  // Recents: the PTs opened in this session, newest first.
  useEffect(() => {
    const note = () => {
      const [head, id] = window.location.hash.slice(1).split("/")
      const p = head === "pt" && id ? permits.find((x) => x.id === id) : undefined
      if (!p) return
      const at = recents.findIndex((r) => r.id === p.id)
      if (at >= 0) recents.splice(at, 1)
      recents.unshift({ id: p.id, label: permitName(p), service: p.scope })
      recents.length = Math.min(recents.length, MAX)
    }
    note()
    window.addEventListener("hashchange", note)
    return () => window.removeEventListener("hashchange", note)
  }, [permits])

  const close = (hash: string) => { change(false); go(hash) }
  const screens = useMemo(() => NAV_KEYS.filter((k) => k !== "auditoria" || canAudit), [canAudit])
  const searching = q.length > 0
  const hits = useMemo(() => {
    if (!searching) return null
    const cut = <T,>(xs: T[]) => xs.slice(0, MAX)
    return {
      places: cut(state.locations.filter((l) => matches(`${l.code} ${l.name} ${l.aliases.join(" ")}`, q))),
      people: cut(state.people.filter((p) => matches(`${p.name} ${p.company} ${p.employeeId} ${p.login ?? ""}`, q))),
      models: cut(state.templates.filter((t) => matches(t.name, q))),
      screens: cut(screens.filter((k) => matches(NAV[k].title, q))),
    }
  }, [searching, q, state.locations, state.people, state.templates, screens])
  const local = hits ? hits.places.length + hits.people.length + hits.models.length + hits.screens.length : 0
  const waiting = searching && (asked !== q || remote.loading)
  const down = !port.whole && searching && (serverDown || remote.down)
  const empty = searching && !waiting && !down && local === 0 && remote.count === 0

  const key = isMac() ? "⌘ K" : "Ctrl K"
  return (
    <>
      <div className="flex flex-1 justify-end">
        <Button type="button" variant="ghost" onClick={() => change(true)} aria-label="Buscar (atalho Ctrl K)"
          className="size-11 shrink-0 gap-2 rounded-full text-muted-foreground lg:h-9 lg:w-auto lg:rounded-lg lg:border lg:border-border lg:bg-background lg:pr-1.5 lg:pl-3 lg:font-normal">
          <SearchIcon aria-hidden />
          <span className="hidden w-28 text-left lg:inline">Buscar…</span>
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 type-data text-muted-foreground lg:inline">{key}</kbd>
        </Button>
      </div>
      <CommandDialog open={open} onOpenChange={change} title="Buscar" description="Vá para uma tela ou encontre uma PT, ativo, local, pessoa ou modelo."
        className="top-0 left-0 max-w-none translate-x-0 rounded-t-none rounded-b-2xl! sm:top-[12vh] sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl!">
        <Command shouldFilter={false} loop className="rounded-2xl! bg-popover p-0">
          <div className="border-b p-1.5 [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent [&_[data-slot=input-group]]:ring-0">
            <CommandInput value={text} onValueChange={setText} placeholder="Buscar PT, ativo, local, pessoa…" aria-label="Buscar" className="text-base md:text-sm" />
          </div>
          <CommandList className="max-h-[min(70dvh,26rem)] p-1">
            {!searching && (
              <>
                {recents.length > 0 && (
                  <CommandGroup heading="Recentes" className={GROUP}>
                    {recents.map((r) => (
                      <Row key={r.id} icon={HistoryIcon} value={`recente-${r.id}`} onPick={() => close(`pt/${r.id}/etapas`)}>
                        <span className="truncate type-body">{r.service}</span>
                        <span className="truncate type-data text-muted-foreground">{r.label}</span>
                      </Row>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup heading="Ir para" className={GROUP}>
                  {screens.map((k) => <Row key={k} icon={NAV[k].icon} value={`ir-${k}`} onPick={() => close(k)}><span className="type-body">{NAV[k].title}</span></Row>)}
                </CommandGroup>
                <CommandGroup heading="Ações" className={GROUP}>
                  <CommandItem value="acao-nova-pt" disabled={serverDown} onSelect={() => close("nova-pt")} className={ROW}>
                    <PlusIcon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="type-body">Nova PT</span>
                    {serverDown && <span className="ml-auto type-meta">Sem servidor</span>}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            {searching && hits && (
              <>
                {hits.screens.length > 0 && (
                  <CommandGroup heading="Ir para" className={GROUP}>
                    {hits.screens.map((k) => <Row key={k} icon={NAV[k].icon} value={`ir-${k}`} onPick={() => close(k)}><span className="type-body"><Mark text={NAV[k].title} q={q} /></span></Row>)}
                  </CommandGroup>
                )}
                {asked === q && <Remote q={q} onStatus={setRemote} close={close} />}
                {hits.places.length > 0 && (
                  <CommandGroup heading="Locais" className={GROUP}>
                    {hits.places.map((l) => (
                      <Row key={l.id} icon={locationIcon(byId(state.locationTypes, l.typeId))} value={`local-${l.id}`} onPick={() => close(`locais/${l.id}`)}>
                        <span className="truncate type-body"><span className="type-data"><Mark text={l.code} q={q} /></span> · <Mark text={l.name} q={q} /></span>
                      </Row>
                    ))}
                  </CommandGroup>
                )}
                {hits.people.length > 0 && (
                  <CommandGroup heading="Pessoas" className={GROUP}>
                    {hits.people.map((p) => (
                      <Row key={p.id} icon={UserIcon} value={`pessoa-${p.id}`} onPick={() => close(`pessoas/${p.id}`)}>
                        <span className="truncate type-body"><Mark text={p.name} q={q} /></span>
                        {p.company && <span className="truncate type-meta"><Mark text={p.company} q={q} /></span>}
                      </Row>
                    ))}
                  </CommandGroup>
                )}
                {hits.models.length > 0 && (
                  <CommandGroup heading="Modelos" className={GROUP}>
                    {hits.models.map((t) => <Row key={t.id} icon={FileTextIcon} value={`modelo-${t.id}`} onPick={() => close("modelos")}><span className="truncate type-body"><Mark text={t.name} q={q} /></span></Row>)}
                  </CommandGroup>
                )}
              </>
            )}
            {searching && (
              <p role="status" className="px-4 py-6 text-center type-body text-muted-foreground empty:hidden">
                {down ? "Sem servidor: PTs e ativos não puderam ser buscados." : waiting ? "Buscando…" : empty ? "Nada encontrado" : ""}
              </p>
            )}
          </CommandList>
          <div className="hidden items-center gap-4 border-t px-4 py-2 type-meta md:flex" aria-hidden>
            <span><kbd className="type-data">↑↓</kbd> navegar</span><span><kbd className="type-data">Enter</kbd> abrir</span><span><kbd className="type-data">Esc</kbd> fechar</span>
          </div>
        </Command>
      </CommandDialog>
    </>
  )
}
