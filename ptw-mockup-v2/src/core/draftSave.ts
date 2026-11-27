/**
 * SPEC 014: automatic saving of a PT draft. Pure rules: when a draft may start to be saved, what
 * counts as a change, and what the save indicator says. The timer and the calls are in
 * `components/work/useDraftAutosave.ts`.
 */

/** What the New PT / Edit draft form holds (the PT's own fields; the answers save on their own). */
export interface DraftFields {
  templateId: string
  locationId: string
  scope: string
  windowStart: string
  windowEnd: string
  assetIds: string[]
  team: Record<string, string[]>
}

/**
 * The database needs the model (and its version), the location, the window and the scope (1 to 500
 * characters) to hold a draft at all; before that there is nothing to save.
 */
export function draftReady(f: Pick<DraftFields, "templateId" | "locationId" | "scope">): boolean {
  return f.templateId !== "" && f.locationId !== "" && f.scope.trim() !== ""
}

/** What is still missing before the first save, in the order of the form ("" when ready). */
export function draftMissing(f: Pick<DraftFields, "templateId" | "locationId" | "scope">): string {
  if (!f.templateId) return "o modelo"
  if (!f.locationId) return "o local"
  if (!f.scope.trim()) return "o serviço"
  return ""
}

/** The same fields give the same text, whatever the order of the team or of the assets. */
export function draftSnapshot(f: DraftFields): string {
  const team = Object.keys(f.team).sort().filter((k) => f.team[k]!.length > 0).map((k) => [k, [...f.team[k]!].sort()])
  return JSON.stringify([f.templateId, f.locationId, f.scope.trim(), f.windowStart, f.windowEnd, [...f.assetIds].sort(), team])
}

export type SaveKind = "idle" | "waiting" | "saving" | "saved" | "error" | "offline" | "incomplete" | "blocked"
export interface SaveState {
  kind: SaveKind
  /** Wall time "HH:MM" of the last successful save. */
  at?: string
  message?: string
}

/** The indicator beside the title. Short: it is read in passing. */
export function saveLabel(s: SaveState, missing = ""): string {
  switch (s.kind) {
    case "waiting": return "Alterações pendentes…"
    case "saving": return "Salvando…"
    case "saved": return s.at ? `Salvo às ${s.at}` : "Salvo"
    case "offline": return "Sem conexão com o servidor: alterações não salvas"
    case "error": return s.message ? `Não foi possível salvar: ${s.message}` : "Não foi possível salvar"
    case "blocked": return s.message ?? "Corrija os campos para salvar"
    case "incomplete": return missing ? `Escolha ${missing} para o rascunho começar a ser salvo` : "Rascunho ainda não salvo"
    default: return ""
  }
}

/** Leaving would lose something: edits not yet saved, or a form that never reached the first save. */
export function hasUnsaved(kind: SaveKind, touched: boolean): boolean {
  if (kind === "waiting" || kind === "saving" || kind === "error" || kind === "offline" || kind === "blocked") return true
  return kind === "incomplete" && touched
}
