// @ts-nocheck — cópia de ptw-mockup-v2/src/core/permitState.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Canonical permit states (decision 2026-11-06, see ptw-research/specs/00-roadmap-and-reconciliation.md).
 * "Não verificável" is NOT a state: it exists only on the client when the server has not confirmed.
 */
export type PermitState =
  | "rascunho" | "em_analise" | "devolvida" | "emitida" | "ativa"
  | "suspensa" | "entregue" | "encerrada" | "cancelada" | "expirada"

export const PERMIT_STATES: PermitState[] = [
  "rascunho", "em_analise", "devolvida", "emitida", "ativa", "suspensa", "entregue", "encerrada", "cancelada", "expirada",
]

export const PERMIT_STATE_LABEL: Record<PermitState, string> = {
  rascunho: "Rascunho", em_analise: "Em análise", devolvida: "Devolvida", emitida: "Emitida", ativa: "Ativa",
  suspensa: "Suspensa", entregue: "Entregue", encerrada: "Encerrada", cancelada: "Cancelada", expirada: "Expirada",
}

/**
 * Allowed moves. There is deliberately no ativa -> cancelada: once field work started, the permit
 * ends through Entrega and Aceite da área. A state change is a consequence of recorded events, never
 * of a signature alone.
 */
const NEXT: Record<PermitState, PermitState[]> = {
  rascunho: ["em_analise", "cancelada"],
  em_analise: ["emitida", "devolvida", "cancelada"],
  devolvida: ["em_analise", "cancelada"],
  emitida: ["ativa", "em_analise", "cancelada", "expirada"],
  ativa: ["suspensa", "entregue", "expirada"],
  suspensa: ["ativa", "entregue", "expirada"],
  entregue: ["encerrada"],
  encerrada: [],
  cancelada: [],
  expirada: ["entregue"],
}

export const canMove = (from: PermitState, to: PermitState) => NEXT[from].includes(to)
export const isFinal = (s: PermitState) => NEXT[s].length === 0
