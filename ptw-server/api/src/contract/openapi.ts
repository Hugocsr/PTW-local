/**
 * Leitura do contrato (`openapi.yaml`): a API registra cada rota a partir daqui (A2). Não há cópia do
 * contrato em código: método, caminho, parâmetros, corpo e respostas vêm do arquivo.
 */
import { readFileSync } from "node:fs"
import { parse } from "yaml"

type Json = Record<string, unknown>

export interface ParamDef {
  name: string
  in: "path" | "query" | "header" | "cookie"
  required: boolean
  schema: unknown
}

export interface ResponseDef {
  /** Esquema do corpo `application/json`, se houver. */
  schema?: unknown
  /** Tipos de conteúdo declarados. */
  contentTypes: string[]
}

export interface Operation {
  operationId: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"
  /** Caminho do contrato, com `{param}`. */
  path: string
  tags: string[]
  /** Exige sessão (o contrato tem `security: [sessao]` por padrão; `security: []` desliga). */
  secured: boolean
  params: ParamDef[]
  /** `If-Match` obrigatório (concorrência otimista). */
  ifMatch: boolean
  /** Aceita `Idempotency-Key`. */
  idempotent: boolean
  /** Aceita `X-Ptw-Undo`. */
  undo: boolean
  /** Corpo JSON: esquema e se é obrigatório. Corpo que não é JSON (arquivo) fica sem esquema. */
  body: { required: boolean; schema?: unknown; contentTypes: string[] } | null
  /** Por status (`"200"`, `"4XX"`, `"default"`). */
  responses: Record<string, ResponseDef>
  /** `x-ptw-codes`: recusas de regra esperadas. */
  ptwCodes: string[]
}

export interface Contract {
  doc: Json
  /** `servers[0].url`. */
  basePath: string
  operations: Map<string, Operation>
}

const METHODS = ["get", "post", "put", "patch", "delete", "head"] as const

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)

/** Resolve um `$ref` local (`#/a/b`) por ponteiro JSON. */
export function deref<T = unknown>(doc: Json, node: unknown): T {
  let cur = node
  for (let i = 0; isObj(cur) && typeof cur.$ref === "string"; i++) {
    if (i > 20) throw new Error(`Contrato: $ref em ciclo (${String(cur.$ref)})`)
    const ref = cur.$ref
    if (!ref.startsWith("#/")) throw new Error(`Contrato: só $ref local é aceito (${ref})`)
    let target: unknown = doc
    for (const raw of ref.slice(2).split("/")) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~")
      if (!isObj(target) || !(key in target)) throw new Error(`Contrato: $ref sem destino (${ref})`)
      target = target[key]
    }
    cur = target
  }
  return cur as T
}

function responseDef(doc: Json, node: unknown): ResponseDef {
  const r = deref<Json>(doc, node)
  const content = isObj(r.content) ? r.content : {}
  const json = content["application/json"]
  return { schema: isObj(json) ? json.schema : undefined, contentTypes: Object.keys(content) }
}

export function parseContract(text: string): Contract {
  const doc = parse(text) as Json
  if (!isObj(doc) || !isObj(doc.paths)) throw new Error("Contrato: sem `paths`")
  const servers = Array.isArray(doc.servers) ? (doc.servers as Json[]) : []
  const basePath = typeof servers[0]?.url === "string" ? servers[0].url.replace(/\/$/, "") : ""
  const defaultSecured = Array.isArray(doc.security) && doc.security.length > 0
  const operations = new Map<string, Operation>()

  for (const [path, itemRaw] of Object.entries(doc.paths)) {
    const item = deref<Json>(doc, itemRaw)
    const shared = Array.isArray(item.parameters) ? item.parameters : []
    for (const m of METHODS) {
      const op = item[m]
      if (!isObj(op)) continue
      const operationId = op.operationId
      if (typeof operationId !== "string") throw new Error(`Contrato: ${m.toUpperCase()} ${path} sem operationId`)
      if (operations.has(operationId)) throw new Error(`Contrato: operationId repetido (${operationId})`)
      const params: ParamDef[] = []
      for (const p of [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        const d = deref<Json>(doc, p)
        const def: ParamDef = { name: String(d.name), in: d.in as ParamDef["in"], required: d.required === true || d.in === "path", schema: d.schema ?? {} }
        const i = params.findIndex((x) => x.name === def.name && x.in === def.in)
        if (i >= 0) params[i] = def
        else params.push(def)
      }
      let body: Operation["body"] = null
      if (op.requestBody !== undefined) {
        const rb = deref<Json>(doc, op.requestBody)
        const content = isObj(rb.content) ? rb.content : {}
        const json = content["application/json"]
        body = { required: rb.required === true, schema: isObj(json) ? json.schema : undefined, contentTypes: Object.keys(content) }
      }
      const responses: Record<string, ResponseDef> = {}
      for (const [status, r] of Object.entries(isObj(op.responses) ? op.responses : {})) responses[status] = responseDef(doc, r)
      const header = (name: string) => params.find((p) => p.in === "header" && p.name.toLowerCase() === name)
      operations.set(operationId, {
        operationId,
        method: m.toUpperCase() as Operation["method"],
        path,
        tags: Array.isArray(op.tags) ? (op.tags as string[]) : [],
        secured: Array.isArray(op.security) ? op.security.length > 0 : defaultSecured,
        params,
        ifMatch: header("if-match")?.required === true,
        idempotent: header("idempotency-key") !== undefined,
        undo: header("x-ptw-undo") !== undefined,
        body,
        responses,
        ptwCodes: Array.isArray(op["x-ptw-codes"]) ? (op["x-ptw-codes"] as unknown[]).map(String) : [],
      })
    }
  }
  return { doc, basePath, operations }
}

export function loadContract(path: string): Contract {
  return parseContract(readFileSync(path, "utf8"))
}

/** `/permits/{id}/answers/{itemId}` → `/permits/:id/answers/:itemId` (rota do Fastify). */
export function fastifyPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ":$1")
}

/** O `x-ptw-error-map` do contrato: status → códigos citados (`PTA06`, `23505`, `PTW10`, faixas `PTW01–PTW09`). */
export function errorMapCodes(contract: Contract): Map<number, string[]> {
  const out = new Map<number, string[]>()
  const map = contract.doc["x-ptw-error-map"]
  if (!isObj(map)) return out
  for (const [status, lines] of Object.entries(map)) {
    if (!/^\d{3}$/.test(status) || !Array.isArray(lines)) continue
    const codes: string[] = []
    for (const line of lines as unknown[]) {
      // Só o que vem antes do parêntese é código; o resto é explicação.
      const head = String(line).split("(")[0] ?? ""
      for (const m of head.matchAll(/PTW(\d\d)[–-]PTW(\d\d)|\b(PT[AW]\d\d|[0-9][0-9A-Z]{4})\b/g)) {
        if (m[1] !== undefined && m[2] !== undefined) {
          for (let n = Number(m[1]); n <= Number(m[2]); n++) codes.push(`PTW${String(n).padStart(2, "0")}`)
        } else if (m[3] !== undefined) codes.push(m[3])
      }
    }
    out.set(Number(status), codes)
  }
  return out
}
