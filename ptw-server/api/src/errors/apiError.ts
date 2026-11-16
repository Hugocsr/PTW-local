/**
 * O erro único da API: `{ code, message, detail? }` com o status HTTP do `x-ptw-error-map` do contrato.
 * `code` tem sempre 5 caracteres: `PTWnn` ou SQLSTATE (do banco) ou `PTAnn` (da própria API).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string
  readonly headers: Record<string, string>
  /** A recusa já ficou na trilha por outro caminho (ex.: `sessao.entrada` com falha): não gravar a negação. */
  audited: boolean
  /** Erro de origem (do banco), para o log. */
  override readonly cause?: unknown

  constructor(status: number, code: string, message: string, opts: { detail?: string; headers?: Record<string, string>; audited?: boolean; cause?: unknown } = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    if (opts.detail !== undefined && opts.detail !== "") this.detail = opts.detail
    this.headers = opts.headers ?? {}
    this.audited = opts.audited ?? false
    this.cause = opts.cause
  }

  body(): { code: string; message: string; detail?: string } {
    return this.detail === undefined ? { code: this.code, message: this.message } : { code: this.code, message: this.message, detail: this.detail }
  }
}

/** Recusas da própria API (tabela `PTAnn` do contrato). */
export const pta = {
  /** Banco ou armazenamento fora do ar. */
  unavailable: (cause?: unknown, retryAfter = 5) =>
    new ApiError(503, "PTA01", "Servidor fora do ar: nada foi gravado", { headers: { "retry-after": String(retryAfter) }, cause }),
  unauthorized: (message = "Sem sessão: entre de novo") => new ApiError(401, "PTA02", message),
  forbidden: (message = "Sem permissão para esta operação") => new ApiError(403, "PTA03", message),
  notFound: (message = "Não existe nesta unidade") => new ApiError(404, "PTA04", message),
  badRequest: (message: string, detail?: string) => new ApiError(400, "PTA05", message, { detail }),
  /** Revisão desatualizada; `detail` = revisão atual. */
  staleRevision: (current: number | string | null) =>
    new ApiError(409, "PTA06", "Outra pessoa alterou este registro: recarregue e repita", { detail: current === null ? undefined : String(current) }),
  ifMatchRequired: () => new ApiError(428, "PTA07", "Falta o cabeçalho If-Match com a revisão lida"),
  idempotencyMismatch: () => new ApiError(422, "PTA08", "Idempotency-Key já usada com outro conteúdo"),
  blobMismatch: (detail?: string) => new ApiError(422, "PTA09", "O arquivo recebido não confere com o SHA-256 ou o tamanho informado", { detail }),
  importStale: (detail?: string) => new ApiError(422, "PTA10", "A prévia da importação venceu ou o pacote mudou: refaça a prévia", { detail }),
  tooLarge: () => new ApiError(413, "PTA11", "Conteúdo maior que o permitido"),
  tooMany: (retryAfter = 60) => new ApiError(429, "PTA12", "Tentativas demais: aguarde", { headers: { "retry-after": String(retryAfter) } }),
  notImplemented: (message = "Ainda não disponível nesta fase") => new ApiError(501, "PTA13", message),
  unexpected: (cause?: unknown, detail?: string) => new ApiError(500, "PTA99", "Erro não previsto", { cause, detail }),
}
