/**
 * Tipos das operações, tirados de `schema.d.ts` (gerado do `openapi.yaml` por `npm run gen:api`).
 * As rotas tipam corpo, consulta, parâmetros e resposta por `operationId`.
 */
import type { components, operations } from "./schema.js"

export type { components, operations }
export type OperationId = keyof operations
export type Schemas = components["schemas"]

type Params<K extends OperationId, P extends "path" | "query" | "header"> =
  operations[K] extends { parameters: infer A } ? (P extends keyof A ? NonNullable<A[P]> : Record<string, never>) : Record<string, never>

export type OpParams<K extends OperationId> = Params<K, "path">
export type OpQuery<K extends OperationId> = Params<K, "query">
export type OpHeaders<K extends OperationId> = Params<K, "header">

export type OpBody<K extends OperationId> =
  operations[K] extends { requestBody?: infer B } ? (NonNullable<B> extends { content: { "application/json": infer J } } ? J : unknown) : unknown

/** O corpo JSON da resposta `S` da operação `K`. */
export type OpResult<K extends OperationId, S extends number = 200> =
  operations[K] extends { responses: infer R } ? (S extends keyof R ? (R[S] extends { content: { "application/json": infer J } } ? J : undefined) : never) : never
