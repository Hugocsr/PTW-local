/**
 * The store's guard: may this write happen on this permit now? Every act is checked against the
 * state machine (`canMove`, PTW05) and its own precondition; without the server only Parar goes
 * through. Each refusal carries the database's code (ptw-server/db/schema/30_pt.sql, 40_formulario.sql)
 * so the screen and the audit trail say the same thing. Pure.
 */
import type { Permit } from "@/permit/types"
import type { DenyCode, RuleError } from "./ptwErrors"
import { canMove, PERMIT_STATE_LABEL, type PermitState } from "./permitState"
import { needsResume, STOPPABLE, stopEffect } from "./stopResume"

/**
 * G7: the safety rules the database now enforces too, each with its own code (scratchpad contracts-E,
 * ptw-server README). The screen and the store use these names; the code is the database's.
 */
export const G7 = {
  /** Só o autor envia (Enviar / Reenviar). */
  soAutorEnvia: "PTW17",
  /** O autor não devolve a própria PT. */
  autorNaoDevolve: "PTW18",
  /** Estados que aceitam assinatura. */
  estadoNaoAssina: "PTW19",
  /** Só a etapa atual assina. */
  naoEAVez: "PTW20",
  /** Parada barra o Aceite no campo e o Aceite da área. */
  paradaAguarda: "PTW21",
  /** Quem retomou não faz o novo aceite. */
  retomadorNaoAceita: "PTW22",
  /** Aceite no campo só dentro da janela. */
  foraDaJanela: "PTW23",
  /** Parar exige login ativo. */
  semLoginAtivo: "PTW24",
  /** Retomar só quem é elegível para a Emissão. */
  retomarNaoElegivel: "PTW26",
  /** Retomar sem parada. */
  semParada: "PTW26",
  /** Parar fora de campo. */
  naoEstaEmCampo: "PTW25",
  /** Devolver só quem pode assinar a etapa pendente. */
  naoPodeDevolver: "PTW29",
  /** A mesma pessoa assina uma vez em cada etapa e revisão. */
  jaAssinou: "PTW30",
  /** Suspensa só volta a Ativa depois da Retomada e do novo Aceite no campo. */
  suspensaSemRetomada: "PTW27",
} as const satisfies Record<string, DenyCode>

export const deny = (code: DenyCode, message: string, detail?: string): RuleError => (detail === undefined ? { code, message } : { code, message, detail })

export type PermitAct =
  | { kind: "sign"; next: PermitState }
  | { kind: "refuse" }
  | { kind: "stop" }
  | { kind: "resume" }
  /** `stagePos`: position of the item's section stage (null = section without a stage, undefined = item not found); `entregaPos`: position of the Entrega. */
  | { kind: "answer"; stagePos?: number | null; entregaPos?: number | null }
  | { kind: "expire" }

const L = PERMIT_STATE_LABEL

/** null when the act may happen; otherwise the refusal with the database's code and words. */
export function actDenied(p: Permit, act: PermitAct, serverDown = false): RuleError | null {
  // Server down locks every write except Parar (AGENTS.md).
  if (serverDown && act.kind !== "stop" && act.kind !== "expire") return deny("sem_servidor", "Sem servidor: a gravação volta com o servidor")
  const move = (to: PermitState): RuleError | null =>
    to === p.state || canMove(p.state, to) ? null : deny("PTW05", `Mudança de estado não permitida: ${L[p.state]} → ${L[to]}`)
  switch (act.kind) {
    case "answer": {
      if (p.state === "encerrada" || p.state === "cancelada") return deny("PTW06", `A PT está ${L[p.state]} e não aceita respostas`)
      if (p.state === "entregue" || p.state === "expirada") {
        const pos = act.stagePos, ent = act.entregaPos
        if (pos == null || ent == null || (p.state === "expirada" && pos !== ent) || (p.state === "entregue" && pos <= ent)) {
          return deny("PTW06", `A PT está ${L[p.state]}: só a etapa em curso (${p.state === "expirada" ? "Entrega" : "Aceite da área"}) aceita respostas`)
        }
      }
      return null
    }
    case "sign":
      if (p.state === "encerrada" || p.state === "cancelada") return deny("PTW07", `A PT está ${L[p.state]} e não aceita assinatura`)
      // Enviar / Reenviar always opens the análise.
      if (p.state === "rascunho" || p.state === "devolvida") return move("em_analise")
      return move(act.next)
    case "refuse":
      return move("devolvida")
    case "stop":
      if (!STOPPABLE.includes(p.state)) return deny(G7.naoEstaEmCampo, `A PT está ${L[p.state]}: não está em campo`)
      if (needsResume(p)) return deny(G7.paradaAguarda, "A PT já está parada: aguarda Retomada")
      return move(stopEffect(p).state)
    case "resume":
      return needsResume(p) ? null : deny(G7.semParada, "Não há parada a retomar")
    case "expire":
      return move("expirada")
  }
}
