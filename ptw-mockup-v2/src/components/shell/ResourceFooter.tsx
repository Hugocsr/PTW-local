import { useEffect, useId, useState, type ReactNode } from "react"
import { ChevronDown, OctagonAlert, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONE_TEXT, type StatusTone } from "@/components/shell/Status"
import {
  cpuText, formatBytes, isStale, memoryText, parseStatus, resourceRows, resourceTotal, TONE_WORD,
  type ResourceRow, type ResourceStatus,
} from "@/lib/resources"

/** Arquivo gravado pelo serviço `stats` (ptw-server) e servido pelo Caddy; no `vite` de desenvolvimento, lido do Docker (vite.config.ts). */
const URL = "/status.json"
const POLL_MS = 5000

type Reading =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ok"; st: ResourceStatus; stale: boolean }

function useResources(): Reading {
  const [r, setR] = useState<Reading>({ kind: "loading" })
  useEffect(() => {
    let alive = true
    let ctl: AbortController | null = null
    const read = async () => {
      if (document.hidden) return
      ctl?.abort()
      ctl = new AbortController()
      try {
        const res = await fetch(URL, { cache: "no-store", signal: ctl.signal, headers: { Accept: "application/json" } })
        if (!res.ok) throw new Error(String(res.status))
        const st = parseStatus(await res.json())
        const server = Date.parse(res.headers.get("date") ?? "")
        if (!alive) return
        if (st === null || st === "absent") setR({ kind: "unavailable" })
        else setR({ kind: "ok", st, stale: isStale(st, Number.isFinite(server) ? server : Date.now()) })
      } catch (e) {
        if (alive && !(e instanceof DOMException && e.name === "AbortError")) setR({ kind: "unavailable" })
      }
    }
    void read()
    const t = window.setInterval(read, POLL_MS)
    const vis = () => { if (!document.hidden) void read() }
    document.addEventListener("visibilitychange", vis)
    return () => { alive = false; ctl?.abort(); window.clearInterval(t); document.removeEventListener("visibilitychange", vis) }
  }, [])
  return r
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

/** Valor com o tom de uso (âmbar ≥ 80 %, vermelho ≥ 95 %), sempre com ícone e palavra. */
function Value({ text, tone, word }: { text: string; tone: StatusTone | null; word?: string | null }) {
  if (!tone) return <span>{text}</span>
  const Icon = tone === "stop" ? OctagonAlert : TriangleAlert
  return (
    <span className={cn("inline-flex items-center gap-1", TONE_TEXT[tone])}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}{word === null ? "" : ` · ${word ?? TONE_WORD[tone]}`}
    </span>
  )
}

const disk = (r: ResourceRow) => (r.disk === 0 ? "—" : formatBytes(r.disk))

/**
 * Rodapé da moldura: RAM, CPU e disco dos contêineres, usado e máximo, por serviço e no total.
 * Computador: resumo + tabela. Tablet: resumo + lista em duas colunas. Celular: uma linha de resumo que abre a lista.
 */
export function ResourceFooter() {
  const r = useResources()
  const [open, setOpen] = useState(false)
  const detailsId = useId()

  const frame = (children: ReactNode) => (
    <footer aria-label="Recursos do sistema" className="mt-auto border-t px-4 py-3 md:px-6 lg:px-8 print:hidden">
      <div className="flex w-full max-w-[72rem] min-w-0 flex-col gap-2">{children}</div>
    </footer>
  )

  if (r.kind !== "ok") {
    const text = r.kind === "loading" ? "lendo…" : "indisponível (monitor parado)"
    return frame(<p className="type-meta" role="status"><span className="font-medium text-foreground">Recursos</span> · {text}</p>)
  }

  const { st, stale } = r
  const rows = resourceRows(st)
  const total = resourceTotal(st)
  const updated = stale
    ? <Value text={`Desatualizado desde ${time(st.at)}`} tone="attention" word={null} />
    : <span>Atualizado às {time(st.at)}</span>
  const diskText = total.disk ? `${formatBytes(total.disk.free)} livres de ${formatBytes(total.disk.total)}` : "—"

  return frame(
    <>
      {/* Resumo: no celular é o botão que abre a lista. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-left type-meta hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground">Recursos</span>
          {" · RAM "}<Value text={memoryText(total.memory)} tone={total.memory.tone} />
          {" · CPU "}<Value text={cpuText(total.cpu)} tone={total.cpu.tone} />
          {rows.filter((s) => s.stateTone).map((s) => <span key={s.key}> · <Value text={`${s.label} ${s.stateText.toLowerCase()}`} tone="stop" word={null} /></span>)}
          {stale && <> · <Value text="desatualizado" tone="attention" word={null} /></>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        <span className="sr-only">{open ? "Fechar detalhes" : "Ver por serviço"}</span>
      </button>

      <div id={detailsId} className={cn("flex-col gap-2", open ? "flex" : "hidden")}>
        <p className="type-meta flex flex-wrap gap-x-3 gap-y-1">
                    <span>Tamanho do sistema {formatBytes(total.images)}</span>
          <span>Volumes {formatBytes(total.volumes)}</span>
          <span>Disco do Docker <Value text={diskText} tone={total.disk?.tone ?? null} /></span>
          {updated}
        </p>

        {/* Computador (lg+): uma linha por serviço e o total. */}
        <table className="hidden w-full max-w-[48rem] type-meta tabular-nums whitespace-nowrap lg:table">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-1 pr-4 font-medium">Serviço</th>
              <th scope="col" className="py-1 pr-4 font-medium">Situação</th>
              <th scope="col" className="py-1 pr-4 font-medium">RAM</th>
              <th scope="col" className="py-1 pr-4 font-medium">CPU</th>
              <th scope="col" className="py-1 font-medium">Disco</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key} className="border-b border-border/60">
                <th scope="row" className="py-1 pr-4 text-left font-normal text-foreground">{s.label} <span className="text-muted-foreground">({s.name})</span></th>
                <td className="py-1 pr-4">{s.stateTone ? <Value text={s.stateText} tone={s.stateTone} word={null} /> : s.stateText}</td>
                <td className="py-1 pr-4"><Value text={memoryText(s.memory)} tone={s.memory.tone} /></td>
                <td className="py-1 pr-4"><Value text={cpuText(s.cpu)} tone={s.cpu.tone} /></td>
                <td className="py-1">{disk(s)}</td>
              </tr>
            ))}
            <tr className="font-medium text-foreground">
              <th scope="row" className="py-1 pr-4 text-left font-medium">Total</th>
              <td className="py-1 pr-4">{total.running} de {total.count} no ar</td>
              <td className="py-1 pr-4"><Value text={memoryText(total.memory)} tone={total.memory.tone} /></td>
              <td className="py-1 pr-4"><Value text={cpuText(total.cpu)} tone={total.cpu.tone} /></td>
              <td className="py-1">{formatBytes(total.volumes)}</td>
            </tr>
          </tbody>
        </table>

        {/* Celular e tablet: um bloco por serviço (duas colunas no tablet). */}
        <ul className="flex flex-col type-meta md:grid md:grid-cols-2 md:gap-x-6 lg:hidden">
          {rows.map((s) => (
            <li key={s.key} className="flex flex-col gap-0.5 border-b border-border/60 py-1.5">
              <span className="text-foreground">{s.label} <span className="text-muted-foreground">({s.name}) · {s.stateTone ? <Value text={s.stateText} tone={s.stateTone} word={null} /> : s.stateText}</span></span>
              {s.running && <span>RAM <Value text={memoryText(s.memory)} tone={s.memory.tone} /></span>}
              {s.running && <span>CPU <Value text={cpuText(s.cpu)} tone={s.cpu.tone} /></span>}
              {s.disk !== 0 && <span>Disco {disk(s)}</span>}
            </li>
          ))}
          <li className="flex flex-col gap-0.5 py-1.5 font-medium text-foreground">
            <span>Total · {total.running} de {total.count} no ar</span>
            <span>RAM <Value text={memoryText(total.memory)} tone={total.memory.tone} /></span>
            <span>CPU <Value text={cpuText(total.cpu)} tone={total.cpu.tone} /></span>
          </li>
        </ul>
      </div>
    </>,
  )
}
