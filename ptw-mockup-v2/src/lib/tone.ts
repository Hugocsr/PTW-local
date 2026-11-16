/**
 * Status colour roles (DESIGN.md · Cor de estado). One hue per meaning, always with an icon or word:
 * ok (concluído, liberado) · pending (sua vez, em andamento) · attention (revisar, vence) ·
 * stop (falhou, bloqueado, parado) · neutral (aguardando outros, sem destaque).
 * The classes for each tone live in `components/shell/Status.tsx`.
 */
export type StatusTone = "ok" | "pending" | "attention" | "stop" | "neutral"
