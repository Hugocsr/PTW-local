/**
 * Recursos dos contêineres (rodapé): leitura do `/status.json` que o serviço `stats` do servidor grava
 * a cada 5 s (formato em `ptw-server/stats/coletor.py`). Bytes e núcleos de CPU; null = desconhecido.
 */
import type { StatusTone } from "./tone"

export type Usage = { used: number | null; limit: number | null }
export type ServiceResources = {
  name: string
  state: string
  health: "healthy" | "unhealthy" | "starting" | null
  memory: Usage
  cpu: Usage
  image: { name: string | null; size: number | null }
  volumes: { name: string; size: number | null }[]
}
export type ResourceStatus = {
  v: 1
  at: string
  interval: number
  services: ServiceResources[]
  imagesSize: number | null
  volumesSize: number | null
  disk: { free: number; total: number } | null
  sizesAt: string | null
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null)
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {})
const usage = (x: unknown): Usage => ({ used: num(obj(x).used), limit: num(obj(x).limit) })

/** "absent": o servidor responde, mas o coletor nunca gravou; null: resposta que não é deste formato. */
export function parseStatus(x: unknown): ResourceStatus | "absent" | null {
  const o = obj(x)
  if (o.v !== 1) return null
  if (o.absent === true) return "absent"
  if (typeof o.at !== "string" || !Array.isArray(o.services)) return null
  const services = o.services.map((s): ServiceResources => {
    const r = obj(s)
    const h = r.health
    return {
      name: String(r.name ?? "?"),
      state: String(r.state ?? "unknown"),
      health: h === "healthy" || h === "unhealthy" || h === "starting" ? h : null,
      memory: usage(r.memory),
      cpu: usage(r.cpu),
      image: { name: typeof obj(r.image).name === "string" ? (obj(r.image).name as string) : null, size: num(obj(r.image).size) },
      volumes: Array.isArray(r.volumes) ? r.volumes.map((v) => ({ name: String(obj(v).name ?? ""), size: num(obj(v).size) })) : [],
    }
  })
  const d = obj(o.disk)
  const free = num(d.free), total = num(d.total)
  return {
    v: 1, at: o.at, interval: num(o.interval) ?? 5, services,
    imagesSize: num(o.imagesSize), volumesSize: num(o.volumesSize),
    disk: free !== null && total ? { free, total } : null,
    sizesAt: typeof o.sizesAt === "string" ? o.sizesAt : null,
  }
}

/** Nome do serviço para pessoas; o nome técnico vai entre parênteses. */
const LABEL: Record<string, string> = {
  web: "App", db: "Banco", storage: "Arquivos", stats: "Recursos", "stats-docker": "Recursos · Docker", dbproxy: "DBeaver",
}
/** Ordem fixa: os três do sistema primeiro. */
const ORDER = ["web", "db", "storage", "stats", "stats-docker", "dbproxy"]

/** Cor de estado pelo uso do limite: âmbar a partir de 80 %, vermelho a partir de 95 %. */
export function usageTone(ratio: number | null): StatusTone | null {
  if (ratio === null) return null
  return ratio >= 0.95 ? "stop" : ratio >= 0.8 ? "attention" : null
}
const ratio = (u: Usage) => (u.used !== null && u.limit ? u.used / u.limit : null)

export type ResourceRow = {
  key: string
  label: string
  name: string
  running: boolean
  stateText: string
  stateTone: StatusTone | null
  memory: Usage & { ratio: number | null; tone: StatusTone | null }
  cpu: Usage & { ratio: number | null; tone: StatusTone | null }
  disk: number | null
}

const STATE: Record<string, string> = {
  running: "No ar", exited: "Parado", created: "Parado", paused: "Pausado", restarting: "Reiniciando", dead: "Com falha", removing: "Saindo",
}

function row(s: ServiceResources): ResourceRow {
  const running = s.state === "running"
  const stateText = running && s.health === "unhealthy" ? "Com falha" : running && s.health === "starting" ? "Iniciando" : STATE[s.state] ?? s.state
  const vols = s.volumes.map((v) => v.size)
  return {
    key: s.name,
    label: LABEL[s.name] ?? s.name,
    name: s.name,
    running,
    stateText,
    // The DBeaver bridge is an optional development tool: stopped is its normal state, not a fault.
    stateTone: stateText === "Com falha" || (stateText === "Parado" && s.name !== "dbproxy") ? "stop" : null,
    memory: { ...s.memory, ratio: ratio(s.memory), tone: usageTone(ratio(s.memory)) },
    cpu: { ...s.cpu, ratio: ratio(s.cpu), tone: usageTone(ratio(s.cpu)) },
    disk: vols.length === 0 ? 0 : vols.some((v) => v === null) ? null : vols.reduce<number>((a, b) => a + (b ?? 0), 0),
  }
}

export function resourceRows(st: ResourceStatus): ResourceRow[] {
  const at = (n: string) => (ORDER.indexOf(n) === -1 ? ORDER.length : ORDER.indexOf(n))
  return [...st.services].sort((a, b) => at(a.name) - at(b.name) || a.name.localeCompare(b.name)).map(row)
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)

/** Total: uso dos que estão no ar; limite de todos (o máximo que o sistema pode chegar a usar). */
export function resourceTotal(st: ResourceStatus) {
  const rows = resourceRows(st)
  const up = rows.filter((r) => r.running)
  const memory: Usage = { used: sum(up.map((r) => r.memory.used)), limit: rows.every((r) => r.memory.limit) ? sum(rows.map((r) => r.memory.limit)) : null }
  const cpuKnown = up.every((r) => r.cpu.used !== null)
  const cpu: Usage = { used: cpuKnown ? sum(up.map((r) => r.cpu.used)) : null, limit: rows.every((r) => r.cpu.limit) ? sum(rows.map((r) => r.cpu.limit)) : null }
  const diskRatio = st.disk ? (st.disk.total - st.disk.free) / st.disk.total : null
  return {
    running: up.length,
    count: rows.length,
    memory: { ...memory, ratio: ratio(memory), tone: usageTone(ratio(memory)) },
    cpu: { ...cpu, ratio: ratio(cpu), tone: usageTone(ratio(cpu)) },
    volumes: st.volumesSize,
    disk: st.disk ? { ...st.disk, ratio: diskRatio, tone: usageTone(diskRatio) } : null,
    images: st.imagesSize,
  }
}

/** Dado velho: o coletor parou. Relógio do servidor (cabeçalho Date) contra o `at` do arquivo. */
export function isStale(st: ResourceStatus, serverNow: number): boolean {
  const at = Date.parse(st.at)
  return !Number.isFinite(at) || serverNow - at > Math.max(30_000, st.interval * 3_000)
}

const nf = (d: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 })

/** Bytes em unidades de 1024, como os limites do Docker ("64 MB", "1,3 GB"). */
export function formatBytes(b: number | null): string {
  if (b === null) return "—"
  const k = 1024
  if (b < k * k) return `${nf(0).format(Math.max(0, Math.ceil(b / k)))} KB`
  if (b < k ** 3) return `${nf(0).format(Math.round(b / k ** 2))} MB`
  if (b < 1000 * k ** 3) return `${nf(1).format(b / k ** 3)} GB`
  return `${nf(1).format(b / k ** 4)} TB`
}

/** Núcleos de CPU ("0,5 CPU", "3,5 CPU"). */
export function formatCores(c: number | null): string {
  return c === null ? "—" : `${nf(2).format(c)} CPU`
}

/** Percentual inteiro; abaixo de 1 % mostra "< 1 %" para não parecer parado. */
export function formatPercent(r: number | null): string {
  if (r === null) return "—"
  const p = r * 100
  return p > 0 && p < 1 ? "< 1%" : `${nf(0).format(Math.round(p))}%`
}

/** "61 MB de 512 MB"; sem limite, "61 MB · sem limite". */
export function memoryText(u: Usage): string {
  if (u.used === null) return u.limit ? `— de ${formatBytes(u.limit)}` : "—"
  return u.limit ? `${formatBytes(u.used)} de ${formatBytes(u.limit)}` : `${formatBytes(u.used)} · sem limite`
}

/** "2% de 0,5 CPU" (percentual do limite). */
export function cpuText(u: Usage): string {
  if (!u.limit) return u.used === null ? "—" : `${nf(2).format(u.used)} CPU · sem limite`
  return `${u.used === null ? "—" : formatPercent(u.used / u.limit)} de ${formatCores(u.limit)}`
}

/** Palavra que acompanha o tom (nunca só cor). */
export const TONE_WORD: Partial<Record<StatusTone, string>> = { attention: "perto do limite", stop: "no limite" }
