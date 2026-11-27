import { PERMIT_STATE_LABEL, type PermitState } from "./permitState"
import { PERMIT_STATE_TONE } from "./permitView"
import type { StatusTone } from "@/lib/tone"

/** SPEC 008: what the block of the PT's state says as independent labels, each with its meaning for the tooltip. */
export interface PermitTag { id: "estado" | "ciclo" | "nao_liberado"; label: string; tone: StatusTone; tip: string }

export const STATE_TIP: Record<PermitState, string> = {
  rascunho: "A solicitação ainda não foi enviada. Quem a criou pode editar ou excluir.",
  em_analise: "Enviada. Aguarda as assinaturas das etapas antes da emissão.",
  devolvida: "Devolvida ao solicitante com um motivo. Ele corrige e envia de novo.",
  emitida: "Assinada pelas etapas de aprovação. Falta o aceite no campo para liberar o trabalho.",
  ativa: "O aceite no campo foi feito. O trabalho só está liberado dentro da janela e sem parada registrada.",
  suspensa: "O trabalho foi parado. Só volta com a retomada e um novo aceite no campo.",
  entregue: "O trabalho acabou e a área foi entregue. Aguarda o aceite da área.",
  encerrada: "A PT foi entregue e aceita pela área. Não há mais nada a fazer.",
  cancelada: "A PT foi cancelada antes de ser executada, com o motivo registrado.",
  expirada: "A janela terminou sem a entrega. Entregue a área para liberar o equipamento.",
}
export const CYCLE_TIP = "A PT percorreu o fluxo inteiro: o trabalho foi entregue e a área aceitou."
export const NOT_RELEASED_TIP = "Ninguém deve trabalhar com esta PT agora. O trabalho só é liberado com a PT Ativa (aceite no campo feito), sem parada registrada e dentro da janela."

/**
 * The labels under the state block's title, in order: the state's own word (only when the title says something
 * else, or the PT is Encerrada), "Ciclo concluído" (Encerrada only) and "Trabalho não liberado" (every state
 * where the work is not released now, except Encerrada: the cycle is over and nobody would think of working).
 */
export function permitTags(state: PermitState, o: { released: boolean; serverDown: boolean; compact: boolean; titleIsState: boolean }): PermitTag[] {
  const tags: PermitTag[] = []
  if (!o.compact && !o.serverDown && (!o.titleIsState || state === "encerrada"))
    tags.push({ id: "estado", label: PERMIT_STATE_LABEL[state], tone: state === "ativa" && !o.released ? "neutral" : PERMIT_STATE_TONE[state], tip: STATE_TIP[state] })
  if (state === "encerrada" && !o.serverDown) tags.push({ id: "ciclo", label: "Ciclo concluído", tone: "ok", tip: CYCLE_TIP })
  if (!o.released && state !== "encerrada" && !(o.serverDown && o.compact)) tags.push({ id: "nao_liberado", label: "Trabalho não liberado", tone: "neutral", tip: NOT_RELEASED_TIP })
  return tags
}
