/**
 * In-app navigation for the work screens. Entries the app pushes carry `{ app: true, from }`, so "Voltar"
 * knows the previous entry is ours and can step back, and the back link can name it (`from` is the
 * hash it was opened from); otherwise (PT opened from a link, reload) it goes to the fallback view
 * instead of leaving the app. Tab changes replace the entry and keep its state, so leaving a PT is one
 * step whatever tabs were visited, and the back link keeps its origin.
 */
const emit = () => window.dispatchEvent(new HashChangeEvent("hashchange"))

type NavState = { app?: boolean; from?: string } | null

export function navigate(hash: string, { replace = false }: { replace?: boolean } = {}) {
  const url = `${window.location.pathname}${window.location.search}#${hash}`
  if (replace) window.history.replaceState(window.history.state, "", url)
  else window.history.pushState({ app: true, from: window.location.hash.slice(1) }, "", url)
  emit()
}

export const openPermit = (id: string, tab = "etapas") => navigate(`pt/${id}/${tab}`)

export function goBack(fallback = "quadro") {
  if ((window.history.state as NavState)?.app) window.history.back()
  else navigate(fallback, { replace: true })
}

/**
 * The hash "Voltar" returns to: where this entry was opened from inside the app, or `fallback` when
 * it was opened from outside (link, reload). The back link names it.
 */
export function backTarget(fallback: string): string {
  const s = window.history.state as NavState
  return s?.app && s.from ? s.from : fallback
}
