/**
 * Validação pelo próprio contrato (A2): o documento inteiro entra no Ajv e cada operação compila o
 * corpo, a consulta, os parâmetros, os cabeçalhos e as respostas apontando para ele. Sem zod nem typebox.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import type { Contract, Operation, ParamDef } from "./openapi.js"

const DOC_ID = "ptw-openapi"

// ajv-formats é CommonJS: sob NodeNext o padrão chega embrulhado.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (ajv: Ajv2020) => void

/** Copia o esquema trocando `#/…` por `ptw-openapi#/…`, para valer fora do documento. */
function rebase(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rebase)
  if (typeof node !== "object" || node === null) return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "$ref" && typeof v === "string" && v.startsWith("#") ? DOC_ID + v : rebase(v)
  }
  return out
}

export interface Problem {
  /** Onde: `body`, `query`, `params`, `headers`, `response`. */
  part: string
  /** Campo e motivo, para o `detail` do `PTA05`. */
  detail: string
}

function describe(part: string, errors: ErrorObject[] | null | undefined): Problem {
  const e = errors?.[0]
  if (!e) return { part, detail: part }
  const where = e.instancePath !== "" ? e.instancePath : ""
  const extra =
    e.keyword === "required" ? ` (${String((e.params as { missingProperty?: string }).missingProperty)})`
    : e.keyword === "additionalProperties" ? ` (${String((e.params as { additionalProperty?: string }).additionalProperty)})`
    : ""
  return { part, detail: `${part}${where}: ${e.message ?? e.keyword}${extra}` }
}

export interface OperationValidators {
  params: ValidateFunction | null
  query: ValidateFunction | null
  headers: ValidateFunction | null
  body: ValidateFunction | null
  bodyRequired: boolean
  /** Esquema da resposta JSON por status exato, classe (`4XX`) ou `default`. */
  response(status: number): ValidateFunction | null
  /** O status está declarado na operação? */
  declares(status: number): boolean
}

export class ContractValidator {
  /** Corpo: sem conversão de tipo (o JSON já tem tipos). */
  private readonly strict: Ajv2020
  /** Consulta, caminho e cabeçalhos chegam como texto: converte para o tipo do contrato. */
  private readonly coerce: Ajv2020
  private readonly cache = new Map<string, OperationValidators>()

  constructor(private readonly contract: Contract) {
    const base = { strict: false, allErrors: false, validateSchema: false, useDefaults: true } as const
    this.strict = new Ajv2020({ ...base })
    this.coerce = new Ajv2020({ ...base, coerceTypes: "array" })
    for (const ajv of [this.strict, this.coerce]) {
      addFormats(ajv)
      ajv.addSchema({ ...contract.doc, $id: DOC_ID })
    }
  }

  private object(defs: ParamDef[], lower: boolean): ValidateFunction | null {
    if (defs.length === 0) return null
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const d of defs) {
      const name = lower ? d.name.toLowerCase() : d.name
      properties[name] = rebase(d.schema)
      if (d.required) required.push(name)
    }
    return this.coerce.compile({ type: "object", properties, required })
  }

  for(op: Operation): OperationValidators {
    const hit = this.cache.get(op.operationId)
    if (hit) return hit
    const responses = new Map<string, ValidateFunction | null>()
    for (const [status, def] of Object.entries(op.responses)) {
      responses.set(status.toUpperCase(), def.schema === undefined ? null : this.strict.compile(rebase(def.schema) as object))
    }
    const keyOf = (status: number): string | null => {
      const exact = String(status)
      if (responses.has(exact)) return exact
      const cls = `${exact[0]}XX`
      if (responses.has(cls)) return cls
      return responses.has("DEFAULT") ? "DEFAULT" : null
    }
    const v: OperationValidators = {
      params: this.object(op.params.filter((p) => p.in === "path"), false),
      query: this.object(op.params.filter((p) => p.in === "query"), false),
      headers: this.object(op.params.filter((p) => p.in === "header"), true),
      body: op.body?.schema === undefined ? null : this.strict.compile(rebase(op.body.schema) as object),
      bodyRequired: op.body?.required === true,
      response: (status) => {
        const k = keyOf(status)
        return k === null ? null : (responses.get(k) ?? null)
      },
      declares: (status) => keyOf(status) !== null,
    }
    this.cache.set(op.operationId, v)
    return v
  }

  /** Confere a requisição; devolve o primeiro problema ou nulo. Converte consulta e parâmetros no lugar. */
  checkRequest(op: Operation, req: { params: unknown; query: unknown; headers: unknown; body: unknown }): Problem | null {
    const v = this.for(op)
    if (v.params && !v.params(req.params)) return describe("params", v.params.errors)
    if (v.query && !v.query(req.query)) return describe("query", v.query.errors)
    if (v.headers && !v.headers(req.headers)) return describe("headers", v.headers.errors)
    if (op.body && op.body.schema !== undefined) {
      const empty = req.body === undefined || req.body === null
      if (empty) return v.bodyRequired ? { part: "body", detail: "body: corpo obrigatório" } : null
      if (v.body && !v.body(req.body)) return describe("body", v.body.errors)
    }
    return null
  }

  /** Confere uma resposta 2xx contra o contrato. */
  checkResponse(op: Operation, status: number, payload: unknown): Problem | null {
    const v = this.for(op)
    if (!v.declares(status)) return { part: "response", detail: `response: status ${status} não está no contrato de ${op.operationId}` }
    const fn = v.response(status)
    if (fn === null) return null
    // O que sai é JSON: confere o que o cliente vai ler (Date → texto, undefined some).
    const wire: unknown = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))
    return fn(wire) ? null : describe("response", fn.errors)
  }
}
