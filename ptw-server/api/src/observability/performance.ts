import { AsyncLocalStorage } from "node:async_hooks"
import type { Tx, Driver } from "../db.js"

export interface RequestTiming {
  active: boolean
  started: number
  authMs: number
  transactions: number
  transactionFailures: number
  transactionMs: number
  beginToCallbackMs: number
  queries: number
  queryRoundtripMs: number
  queryFailures: number
}

export const timingContext = new AsyncLocalStorage<RequestTiming>()
export const newTiming = (): RequestTiming => ({ active: true, started: performance.now(), authMs: 0, transactions: 0, transactionFailures: 0, transactionMs: 0, beginToCallbackMs: 0, queries: 0, queryRoundtripMs: 0, queryFailures: 0 })

/** Durations include driver/network time; they do not isolate PostgreSQL CPU or pool wait. */
export async function timeAuthentication<T>(fn: () => Promise<T>): Promise<T> {
  const timing = timingContext.getStore()
  if (!timing?.active) return fn()
  const start = performance.now()
  try { return await fn() } finally { timing.authMs += performance.now() - start }
}

function observeQuery(value: unknown, timing: RequestTiming): unknown {
  if (!value || (typeof value !== "object" && typeof value !== "function") || typeof Reflect.get(value, "then") !== "function") return value
  let pending: Promise<unknown> | undefined
  const execute = () => pending ??= (async () => {
    const start = performance.now()
    timing.queries++
    try { return await (value as PromiseLike<unknown>) }
    catch (error) { timing.queryFailures++; throw error }
    finally { timing.queryRoundtripMs += performance.now() - start }
  })()
  return new Proxy(value, {
    get(target, name) {
      if (name === "then") return execute().then.bind(pending)
      if (name === "catch") return execute().catch.bind(pending)
      if (name === "finally") return execute().finally.bind(pending)
      const member: unknown = Reflect.get(target, name, target)
      return typeof member === "function" ? (...args: unknown[]) => observeQuery(Reflect.apply(member, target, args), timing) : member
    },
  })
}

/** Preserve lazy postgres queries and helpers; never inspect SQL text or bound values. */
function observedTx(tx: Tx, timing: RequestTiming): Tx {
  return new Proxy(tx, {
    apply(target, receiver, args) { return observeQuery(Reflect.apply(target, receiver, args), timing) },
    get(target, name) {
      const member: unknown = Reflect.get(target, name, target)
      return typeof member === "function" ? (...args: unknown[]) => observeQuery(Reflect.apply(member, target, args), timing) : member
    },
  })
}

export async function timedTransaction<T>(driver: Driver, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const timing = timingContext.getStore()
  if (!timing?.active) return driver.begin(fn)
  const start = performance.now()
  timing.transactions++
  let entered = false
  try {
    return await driver.begin((tx) => {
      entered = true
      timing.beginToCallbackMs += performance.now() - start
      return fn(observedTx(tx, timing))
    })
  } catch (error) { timing.transactionFailures++; throw error }
  finally {
    if (!entered) timing.beginToCallbackMs += performance.now() - start
    timing.transactionMs += performance.now() - start
  }
}

const ms = (n: number) => Math.round(n * 1000) / 1000
export function timingSummary(t: RequestTiming) {
  return { totalMs: ms(performance.now() - t.started), authMs: ms(t.authMs), transactions: t.transactions,
    transactionMs: ms(t.transactionMs), transactionFailures: t.transactionFailures, beginToCallbackMs: ms(t.beginToCallbackMs), queries: t.queries,
    queryRoundtripMs: ms(t.queryRoundtripMs), queryFailures: t.queryFailures }
}
