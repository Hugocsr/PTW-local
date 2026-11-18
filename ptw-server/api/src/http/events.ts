/**
 * Avisos em tempo real (A20): um só `LISTEN ptw` no banco, repassado a quem está em `GET /events`.
 * O aviso vem do gatilho da trilha (`audit_notify`): `{"unit", "permit", "seq"}`.
 */
import type { Db } from "../db.js"

export interface PtwNotice {
  unit: string
  permit: string | null
  seq: number
}

type Listener = (n: PtwNotice) => void

export class EventHub {
  private readonly listeners = new Set<Listener>()
  private stop: (() => Promise<void>) | null = null
  private starting: Promise<void> | null = null
  private stopping: Promise<void> | null = null

  constructor(private readonly db: Db, private readonly onError: (err: unknown) => void = () => {}, private readonly releaseWhenUnused = false) {}

  /** Liga o LISTEN (uma vez). Falha não derruba a API: o app relê a cada 30 s sem os avisos. */
  start(): Promise<void> {
    if (this.stop) return Promise.resolve()
    this.starting ??= Promise.resolve(this.stopping)
      .then(() => this.db.listen("ptw", (payload) => this.dispatch(payload)))
      .then((stop) => {
        this.stop = stop
      })
      .catch((err) => {
        this.onError(err)
      })
      .finally(() => {
        this.starting = null
      })
    return this.starting
  }

  dispatch(payload: string): void {
    let n: PtwNotice
    try {
      const j = JSON.parse(payload) as { unit?: unknown; permit?: unknown; seq?: unknown }
      if (typeof j.unit !== "string" || j.seq === undefined) return
      n = { unit: j.unit, permit: typeof j.permit === "string" ? j.permit : null, seq: Number(j.seq) }
    } catch {
      return
    }
    for (const l of this.listeners) {
      try {
        l(n)
      } catch (err) {
        this.onError(err)
      }
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    void this.start()
    return () => {
      this.listeners.delete(l)
      if (this.releaseWhenUnused) void this.releaseIfUnused()
    }
  }

  get size(): number {
    return this.listeners.size
  }

  async close(): Promise<void> {
    this.listeners.clear()
    await this.releaseIfUnused()
    if (this.stopping) await this.stopping
  }

  private async releaseIfUnused(): Promise<void> {
    if (this.starting) await this.starting
    if (this.listeners.size > 0) return
    const stop = this.stop
    this.stop = null
    if (stop) {
      this.stopping = stop().catch(this.onError).finally(() => { this.stopping = null })
      await this.stopping
    }
  }
}
