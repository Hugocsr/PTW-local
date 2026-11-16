import { useEffect, useMemo, useState } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { OctagonXIcon, XIcon } from "lucide-react"
import type { BoardRow } from "@/core/board"
import { PERMIT_STATE_LABEL } from "@/core/permitState"
import { windowLeft } from "@/core/permitView"
import { bypassGroup } from "@/core/bypass"
import { dmy, hms } from "@/core/time"
import { usePermitBoard } from "@/data/hooks"
import type { ListView } from "@/data/port"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { cn } from "@/lib/utils"

const VIEW: ListView = { q: "", filters: { segment: "andamento" }, sort: { id: "windowStart", dir: "asc" }, page: 0, pageSize: 100 }
const REFRESH_MS = 20000

/** Reads the open PTs once; the parent remounts it to refresh and keeps the last rows meanwhile. */
function Feed({ onRows }: { onRows: (rows: BoardRow[]) => void }) {
  const board = usePermitBoard(VIEW)
  useEffect(() => { if (!board.loading && !board.error) onRows(board.items) }, [board.loading, board.error, board.items, onRows])
  return null
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/**
 * Tela de parede (`#parede`): for the control-room TV. Work in the field with the time left in large
 * figures, stopped work in red, what waits for a signature. Read-only; refreshes by itself.
 */
export function WallView() {
  const sim = useSim()
  const { state } = useRegistry()
  const [rows, setRows] = useState<BoardRow[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => setTick((v) => v + 1), REFRESH_MS); return () => window.clearInterval(t) }, [])
  const asset = (id: string) => state.assets.find((a) => a.id === id)
  const groups = useMemo(() => {
    const stopped = rows.filter((r) => r.p.state === "suspensa" || r.p.holdReason !== null)
    const field = rows.filter((r) => r.p.state === "ativa" && !stopped.includes(r))
    const waiting = rows.filter((r) => !stopped.includes(r) && !field.includes(r))
    const bypass = rows.filter((r) => bypassGroup(r.p, r.ver.holdsEquipment) === "vigor")
    return { stopped, field, waiting, bypass }
  }, [rows])
  const where = (r: BoardRow) => r.p.assetIds.map((id) => asset(id)?.code).filter(Boolean).join(" · ") || "—"
  return (
    <div className="dark flex min-h-svh flex-col bg-background text-foreground">
      <Feed key={tick} onRows={setRows} />
      <header className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b-[3px] border-double border-foreground py-4 pr-16 pl-6 lg:pr-20 lg:pl-10">
        <div className="flex flex-col">
          <span className="type-label">{state.units[0]?.name ?? "Unidade"} · Permissões de trabalho</span>
          <span className="text-4xl leading-none font-bold tracking-[-0.03em] tabular-nums lg:text-6xl">{hms(sim.now)}</span>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 lg:gap-x-12">
          {([["Em campo", groups.field.length, "text-st-ok-solid"], ["Paradas", groups.stopped.length, groups.stopped.length ? "text-st-stop-solid" : ""], ["Desabilitados", groups.bypass.length, groups.bypass.length ? "text-st-attention-solid" : ""], ["Aguardando", groups.waiting.length, ""]] as const).map(([l, n, c]) => (
            <div key={l} className="flex flex-col items-end">
              <dt className="type-label">{l}</dt>
              <dd className={cn("text-4xl leading-none font-bold tabular-nums lg:text-6xl", c)}>{n}</dd>
            </div>
          ))}
        </dl>
        <a href="#quadro" aria-label="Sair da tela de parede" className="absolute top-3 right-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground"><XIcon className="size-5" aria-hidden /></a>
      </header>

      {sim.serverDown && <p role="alert" className="bg-st-attention-solid px-6 py-3 text-lg font-bold tracking-[0.04em] text-black uppercase lg:px-10">Sem servidor · dados de {hms(sim.now)} · não verificável</p>}

      <main className="grid flex-1 content-start gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:px-10">
        <div className="flex min-w-0 flex-col gap-8">
          {groups.stopped.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[0.06em] text-st-stop-solid uppercase"><OctagonXIcon className="size-6" aria-hidden />Trabalho parado</h2>
              <ul className="flex flex-col gap-3">
                {groups.stopped.map((r) => (
                  <li key={r.p.id} className="flex flex-col gap-1 border-2 border-st-stop-solid bg-st-stop-solid/15 p-4">
                    <span className="text-2xl leading-8 font-semibold">{r.p.scope}</span>
                    <span className="flex items-center gap-2 type-data-title text-st-stop-solid"><AssetIcon id={r.p.assetIds[0]} className="size-5 text-st-stop-solid" />{where(r)}</span>
                    <span className="text-base">{r.p.holdReason ?? "Aguarda novo Aceite no campo"}{r.p.holdAt ? ` · ${hms(r.p.holdAt)}` : ""}</span>
                    <span className="type-data text-muted-foreground">{r.p.number}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="type-label text-foreground">Em campo</h2>
            {groups.field.length === 0 ? <p className="text-xl text-muted-foreground">Nenhum trabalho em campo.</p> : (
              <ul className="flex flex-col">
                {groups.field.map((r) => {
                  const w = windowLeft(r.p, sim.now)
                  const over = w?.tone === "stop"
                  return (
                    <li key={r.p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-t border-border py-4 first:border-t-2 first:border-foreground">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-2xl leading-8 font-semibold">{r.p.scope}</span>
                        <span className="flex flex-wrap items-center gap-x-3 type-data-title text-muted-foreground"><span className="flex items-center gap-2 text-foreground"><AssetIcon id={r.p.assetIds[0]} className="size-5 text-foreground" />{where(r)}</span><span className="type-data self-center">{r.p.number}</span></span>
                        {w && <div className="mt-1 h-1.5 overflow-hidden bg-border" aria-hidden><div className={cn("h-full", over ? "bg-st-stop-solid" : w.tone === "attention" ? "bg-st-attention-solid" : "bg-st-ok-solid")} style={{ width: `${(over ? 1 : w.fraction) * 100}%` }} /></div>}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={cn("font-mono text-4xl leading-none font-bold tabular-nums lg:text-5xl", over ? "text-st-stop-solid" : w?.tone === "attention" ? "text-st-attention-solid" : "text-st-ok-solid")}>{w ? (over ? "ENCERRADA" : clock(w.leftMs)) : "—"}</span>
                        <span className="mt-1 type-label">{over ? "janela" : `restam · até ${hms(r.p.windowEnd)}`}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="type-label text-foreground">Aguardando</h2>
          {groups.waiting.length === 0 ? <p className="text-xl text-muted-foreground">Nada aguardando.</p> : (
            <ul className="flex flex-col">
              {groups.waiting.map((r) => (
                <li key={r.p.id} className="flex flex-col gap-0.5 border-t border-border py-3 first:border-t-2 first:border-foreground">
                  <span className="text-lg leading-6 font-medium">{r.p.scope}</span>
                  <span className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted-foreground"><span className="font-semibold tracking-[0.06em] text-foreground uppercase">{PERMIT_STATE_LABEL[r.p.state]}</span><span>{r.next}</span></span>
                  <span className="flex items-center gap-1.5 type-data text-muted-foreground"><AssetIcon id={r.p.assetIds[0]} className="size-3.5" />{where(r)} · {r.p.number}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className="border-t border-border px-6 py-2 type-data text-muted-foreground lg:px-10">{dmy(sim.now)} · atualiza sozinha</footer>
    </div>
  )
}
