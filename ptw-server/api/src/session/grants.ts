import type { FastifyRequest } from "fastify"
import { pta } from "../errors/apiError.js"
import type { Grant } from "./ldap.js"

export function checkGrants(req: FastifyRequest): void {
  const op = req.ptw.op
  if (!op?.secured) return
  const needed: Grant[] = []
  if (op.tags.includes("governanca")) needed.push("cadastro")
  if (op.tags.includes("identidade")) needed.push("modelos")
  if (op.tags.includes("auditoria")) needed.push("auditoria")
  if (/[Ee]xport/.test(op.operationId)) needed.push("exportacao")
  if (!["GET","HEAD"].includes(op.method)) {
    if (op.tags.includes("cadastro")) needed.push("cadastro")
    if (op.tags.includes("modelos")) needed.push("modelos")
  }
  if (needed.some((p) => !req.ptw.session?.grants.includes(p))) throw pta.forbidden()
}
