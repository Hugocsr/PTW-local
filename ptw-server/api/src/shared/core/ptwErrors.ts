// @ts-nocheck — cópia de ptw-mockup-v2/src/core/ptwErrors.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Rule errors with the database's codes (ptw-server README "Garantia no banco" and db/MODELO.md
 * "Códigos de erro"). A guard in the app returns `RuleError { code, message }`; the screen shows the
 * title of the code and the message; a denied attempt is recorded with the 5-character code.
 * Pure; imported by the Node validator too (relative imports only).
 */

export type PtwCode =
  | "PTW01" | "PTW02" | "PTW03" | "PTW04" | "PTW05" | "PTW06" | "PTW07" | "PTW08" | "PTW09" | "PTW10"
  | "PTW11" | "PTW12" | "PTW13" | "PTW14" | "PTW15" | "PTW16" | "PTW17" | "PTW18" | "PTW19" | "PTW20"
  | "PTW21" | "PTW22" | "PTW23" | "PTW24" | "PTW25" | "PTW26" | "PTW27" | "PTW28" | "PTW29" | "PTW30"
  | "PTW31" | "PTW32" | "PTW33"
  | "42501" | "23503" | "23505" | "23514"

/**
 * Symbolic names the app used before the database had these rules (G7). Each maps to its PTW code
 * (`API_DENY_CODE`); only `sem_servidor` stays the app's own (the API is down, nothing reaches the database).
 */
export type ApiDenyKey = "sem_servidor" | "so_autor_envia" | "autor_nao_devolve" | "estado_nao_assina" | "nao_e_a_vez" | "fora_da_janela" | "parada_aguarda_retomada" | "retomador_nao_aceita" | "sem_parada" | "nao_esta_em_campo" | "sem_login_ativo" | "nao_pode_devolver" | "ja_assinou"
/** The API's own codes (`PTA01`…, ptw-server/api/openapi.yaml): the server answered, but not with a database rule. */
export type ApiCode = `PTA${number}${number}`
export type DenyCode = PtwCode | ApiDenyKey | ApiCode
export interface RuleError { code: DenyCode; message: string; detail?: string }

/** Title the screen shows for each code (the message says the specifics). */
export const PTW_MESSAGE: Record<PtwCode, string> = {
  PTW01: "Registro que não muda",
  PTW02: "Local dentro de si mesmo",
  PTW03: "Versão em uso ou arquivada não muda",
  PTW04: "A PT não aceita essa mudança",
  PTW05: "Mudança de estado não permitida",
  PTW06: "A PT não aceita resposta agora",
  PTW07: "Assinatura fora da revisão ou da versão da PT",
  PTW08: "Pessoa não elegível",
  PTW09: "A mesma pessoa não assina as duas pontas",
  PTW10: "Equipamento com PT aberta",
  PTW11: "Ciclo em “parte de”",
  PTW12: "Hora do evento fora de ordem",
  PTW13: "Trilha de auditoria protegida",
  PTW14: "Registro de auditoria inválido",
  PTW15: "Formulário ou resposta fora da estrutura",
  PTW16: "Assinatura bloqueada pelo formulário",
  PTW17: "Só o solicitante",
  PTW18: "O solicitante não devolve",
  PTW19: "A PT não aceita assinatura agora",
  PTW20: "Não é a vez desta etapa",
  PTW21: "Parada registrada",
  PTW22: "Quem retomou não faz o novo aceite",
  PTW23: "Fora da janela de trabalho",
  PTW24: "Sem login ativo",
  PTW25: "A PT não está em campo",
  PTW26: "Retomada não permitida",
  PTW27: "Falta o novo Aceite no campo",
  PTW28: "Assinatura sem cargo ou sem significado",
  PTW29: "Só quem pode assinar a etapa pendente devolve",
  PTW30: "Você já assinou esta etapa",
  PTW31: "A janela passa do prazo máximo deste modelo",
  PTW32: "Só quem pode emitir esta PT prorroga",
  PTW33: "Prorrogação não permitida",
  "42501": "Sem permissão",
  "23503": "Registro em uso ou inexistente",
  "23505": "Já existe um registro igual",
  "23514": "Valor fora do permitido",
}

/** ApiDenyKey → the database's code (contracts of frente E, G7 and the addendum). */
export const API_DENY_CODE: Record<Exclude<ApiDenyKey, "sem_servidor">, PtwCode> = {
  so_autor_envia: "PTW17",
  autor_nao_devolve: "PTW18",
  estado_nao_assina: "PTW19",
  nao_e_a_vez: "PTW20",
  parada_aguarda_retomada: "PTW21",
  retomador_nao_aceita: "PTW22",
  fora_da_janela: "PTW23",
  sem_login_ativo: "PTW24",
  nao_esta_em_campo: "PTW25",
  sem_parada: "PTW26",
  nao_pode_devolver: "PTW29",
  ja_assinou: "PTW30",
}
/** Code of the API's own refusal when the server is down (5 characters, like the README's "PTA01"). */
export const NO_SERVER_CODE = "PTA01"

export const isPtwCode = (c: string): c is PtwCode => c in PTW_MESSAGE

/** The 5-character code recorded with a denial: PTWnn (and SQLSTATE) as is; a symbolic key by its PTW code. */
export function denyCode5(code: DenyCode): string {
  if (isPtwCode(code)) return code
  if (code === "sem_servidor") return NO_SERVER_CODE
  if (code.startsWith("PTA")) return code
  return API_DENY_CODE[code as Exclude<ApiDenyKey, "sem_servidor">]
}

/** The database's code of a RuleError (normalizes the symbolic keys); null for "sem servidor". */
export function ptwCodeOf(err: Pick<RuleError, "code">): PtwCode | null {
  const c = denyCode5(err.code)
  return isPtwCode(c) ? c : null
}

/** A RuleError with the database's code. */
export const ruleError = (code: DenyCode, message: string, detail?: string): RuleError => {
  const c = ptwCodeOf({ code })
  return detail === undefined ? { code: c ?? code, message } : { code: c ?? code, message, detail }
}

/** Toast for a refusal: the code's title, then the specific message (and detail, unless it is only a record's id). */
export function toastFor(err: RuleError): { title: string; description: string } {
  const c = ptwCodeOf(err)
  const title = c ? PTW_MESSAGE[c] : err.code === "sem_servidor" || err.code === NO_SERVER_CODE ? "Servidor fora do ar" : "Não foi possível concluir"
  const detail = err.detail && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(err.detail) ? err.detail : undefined
  const description = [err.message, detail].filter((x) => x && x !== title).join(" · ")
  return { title, description }
}
