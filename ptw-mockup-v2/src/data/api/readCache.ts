/** Per-generation values and promises. Invalidated reads cannot populate a newer generation. */
export function readCache<T>() {
  let epoch = ""
  let values = new Map<string, Promise<T>>()
  const read = (generation: string, key: string, load: () => Promise<T>): Promise<T> => {
    if (epoch !== generation) { epoch = generation; values = new Map() }
    const cache = values
    let pending = cache.get(key)
    if (!pending) {
      pending = load().catch((error: unknown) => { cache.delete(key); throw error })
      cache.set(key, pending)
    }
    return pending
  }
  return Object.assign(read, { clear() { epoch = ""; values = new Map() } })
}
