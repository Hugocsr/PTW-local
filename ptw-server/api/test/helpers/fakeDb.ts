/**
 * Driver falso para os testes sem banco: guarda cada transação e cada instrução (texto com `$n` e
 * parâmetros) e responde pelo primeiro tratador que casar. Serve para conferir o que a API manda ao
 * banco — a ordem (`set_context` primeiro), as transações separadas (negação) e os argumentos.
 * O que o banco decide (regras, RLS, trilha) só os testes com banco provam.
 */
import type { Driver, Tx } from "../../src/db.js"

export interface Statement {
  text: string
  params: unknown[]
}

export interface FakeTransaction {
  statements: Statement[]
  outcome: "open" | "commit" | "rollback"
  /** O que um tratador quer que valha só se a transação for confirmada. */
  onCommit: (() => void)[]
}

type Reply = (params: unknown[], statement: Statement, tx: FakeTransaction) => unknown[] | Promise<unknown[]>

export class FakeDriver implements Driver {
  readonly transactions: FakeTransaction[] = []
  private readonly handlers: { match: RegExp; reply: Reply }[] = []
  private readonly listeners = new Map<string, Set<(payload: string) => void>>()
  /** Banco fora do ar: toda transação falha na conexão. */
  down = false
  ended = false

  /** O tratador mais novo ganha. */
  on(match: RegExp, reply: Reply | unknown[]): this {
    this.handlers.unshift({ match, reply: typeof reply === "function" ? reply : () => reply })
    return this
  }

  /** Faz a próxima instrução que casar falhar com um erro do banco. */
  fail(match: RegExp, error: { code: string; message: string; detail?: string; hint?: string }, times = Infinity): this {
    let left = times
    const prior = [...this.handlers]
    return this.on(match, (params, st, tx) => {
      if (left-- > 0) throw Object.assign(new Error(error.message), error)
      const next = prior.find((h) => h.match.test(st.text))
      return next ? next.reply(params, st, tx) : []
    })
  }

  async begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (this.down) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
    const t: FakeTransaction = { statements: [], outcome: "open", onCommit: [] }
    this.transactions.push(t)
    const tx = ((strings: TemplateStringsArray, ...params: unknown[]) => {
      if (!Array.isArray(strings) || !("raw" in strings)) throw new Error("driver falso: só consultas marcadas (tx`…`)")
      if (t.outcome !== "open") return Promise.reject(new Error("consulta fora da transação (depois de withCtx terminar)"))
      const text = strings.reduce((acc, s, i) => acc + (i > 0 ? `$${i}` : "") + s, "").replace(/\s+/g, " ").trim()
      const st: Statement = { text, params }
      t.statements.push(st)
      const h = this.handlers.find((x) => x.match.test(text))
      return Promise.resolve().then(() => (h ? h.reply(params, st, t) : []))
    }) as unknown as Tx
    try {
      const out = await fn(tx)
      t.outcome = "commit"
      for (const f of t.onCommit) f()
      return out
    } catch (e) {
      t.outcome = "rollback"
      throw e
    }
  }

  async listen(channel: string, onNotify: (payload: string) => void): Promise<() => Promise<void>> {
    const set = this.listeners.get(channel) ?? new Set()
    this.listeners.set(channel, set)
    set.add(onNotify)
    return async () => {
      set.delete(onNotify)
    }
  }

  /** Simula um `NOTIFY`. */
  notify(channel: string, payload: unknown): void {
    for (const l of this.listeners.get(channel) ?? []) l(typeof payload === "string" ? payload : JSON.stringify(payload))
  }

  listening(channel: string): number {
    return this.listeners.get(channel)?.size ?? 0
  }

  async end(): Promise<void> {
    this.ended = true
  }

  // ---------- leitura do que foi mandado ----------
  /** Todas as instruções que casam, na ordem, com a transação de cada uma. */
  find(match: RegExp): { tx: number; statement: Statement }[] {
    const out: { tx: number; statement: Statement }[] = []
    this.transactions.forEach((t, i) => t.statements.forEach((s) => match.test(s.text) && out.push({ tx: i, statement: s })))
    return out
  }

  /** Os argumentos de `set_context` de uma transação, pelo nome. */
  contextOf(tx: number): { unit: unknown; person: unknown; role: unknown; auth: unknown; client: unknown; request: unknown; reason: unknown; undo: unknown } {
    const s = this.transactions[tx]?.statements[0]
    if (!s || !/select ptw\.set_context\(/.test(s.text)) throw new Error(`transação ${tx} não começa por set_context`)
    const [unit, person, role, auth, client, request, reason, undo] = s.params
    return { unit, person, role, auth, client, request, reason, undo }
  }

  reset(): void {
    this.transactions.length = 0
  }
}
