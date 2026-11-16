import type { Cell } from "./port"

/** A cache value with listeners; shared by the API and the unit-test adapter. */
export interface Box<T> extends Cell<T> { set(next: T): void }
export function box<T>(initial: T): Box<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) { if (next === value) return; value = next; for (const fn of [...listeners]) fn() },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
}
