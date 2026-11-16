/** `X-Request-Id` e `X-Ptw-Client`: aceitos em toda operação, vão para `set_context` e o id volta na resposta. */
import { randomUUID } from "node:crypto"
import type { IncomingHttpHeaders } from "node:http"
import { pta } from "../errors/apiError.js"

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/** O id recebido, se estiver no formato do contrato; senão um uuid novo (o inválido é recusado depois). */
export function requestIdOf(headers: IncomingHttpHeaders): string {
  const v = one(headers["x-request-id"])
  return v !== undefined && REQUEST_ID.test(v) ? v : randomUUID()
}

/** Recusa (`400 PTA05`) os dois cabeçalhos transversais fora do contrato. */
export function checkCommonHeaders(headers: IncomingHttpHeaders): void {
  const id = one(headers["x-request-id"])
  if (id !== undefined && !REQUEST_ID.test(id)) throw pta.badRequest("Requisição fora do contrato", "headers/x-request-id: até 100 caracteres de A-Z a-z 0-9 . _ : -")
  const client = one(headers["x-ptw-client"])
  if (client !== undefined && client.length > 200) throw pta.badRequest("Requisição fora do contrato", "headers/x-ptw-client: até 200 caracteres")
}

export function clientOf(headers: IncomingHttpHeaders): string | null {
  const v = one(headers["x-ptw-client"])
  return v === undefined || v === "" ? null : v
}

/** `X-Ptw-Undo: true` = a escrita é um "Desfazer" (`set_context(..., p_undo => true)`). */
export function undoOf(headers: IncomingHttpHeaders): boolean {
  return one(headers["x-ptw-undo"]) === "true"
}

/** `X-Ptw-Reason` (o texto vem em UTF-8 codificado por percentual quando tem acento). */
export function reasonOf(headers: IncomingHttpHeaders): string | null {
  const v = one(headers["x-ptw-reason"])
  if (v === undefined || v.trim() === "") return null
  try {
    return /%[0-9A-Fa-f]{2}/.test(v) ? decodeURIComponent(v) : v
  } catch {
    return v
  }
}
