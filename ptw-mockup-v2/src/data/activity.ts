/** Only actual pointer/key events count as human activity; programmatic events and timers do not. */
export function observeHumanActivity(target: Pick<Document, "addEventListener" | "removeEventListener">, report: () => void) {
  const onInteraction = (event: Event) => { if (event.isTrusted) report() }
  const events = ["pointerdown", "keydown"] as const
  for (const name of events) target.addEventListener(name, onInteraction, { capture: true, passive: true })
  return () => { for (const name of events) target.removeEventListener(name, onInteraction, { capture: true }) }
}
