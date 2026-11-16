/**
 * Importação e exportação de modelos: a ponte para `core/templatePackage.ts` (cópia idêntica à do app
 * em `src/shared/`; `scripts/sync-shared.mjs`). A leitura do pacote é a mesma do app e do validador;
 * aqui entram só o cadastro da unidade, o token da confirmação e a gravação.
 *
 * Prévia: não grava nada. O `token` (15 min) é um HMAC da pessoa, do SHA-256 do pacote, do sal dos ids,
 * do instante da prévia e do resultado (o que seria criado). A confirmação refaz a leitura com os mesmos
 * ids (derivados do sal) e o mesmo instante; resultado diferente, token vencido ou de outro pacote →
 * `PTA10`, nada é criado. O instante vai no token para que nenhuma hora gravada no resultado (versão,
 * listas novas, origem) faça a confirmação divergir da prévia.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { exportarModelo, importarModelo, lerPacote, totaisDaImportacao, type Cadastro, type Rascunho, type ResultadoImportacao } from "../../shared/core/templatePackage.ts"
import { getTemplate, loadCadastro, type Template } from "./read.js"
import { Q, dbLike, run } from "./sql.js"
import { insertVersion, type VersionInput } from "./write.js"

export const TOKEN_TTL_MS = 15 * 60_000
/** Segredo do processo: a API reiniciar invalida as prévias abertas (vale 15 min no máximo). */
const SECRET = randomBytes(32)

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")
const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64url")

/** Ids determinísticos por (sal, pacote, ordem): a prévia e a confirmação geram os mesmos. */
function idMaker(salt: string, pkg: string): (prefix: string) => string {
  let n = 0
  return (prefix) => {
    const h = createHash("sha256").update(`${salt}|${pkg}|${prefix}|${++n}`).digest()
    h[6] = 0x70 | (h[6]! & 0x0f)
    h[8] = 0x80 | (h[8]! & 0x3f)
    const x = h.subarray(0, 16).toString("hex")
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
  }
}

/** O que seria criado. A prévia e a confirmação leem o pacote com o mesmo instante (o do token). */
const fingerprint = (r: Rascunho): string => sha256(JSON.stringify(r))

export interface ImportInput {
  arquivo?: string
  pacote: string
}

function readPackage(input: ImportInput, cadastro: Cadastro, salt: string, now: Date): { result: ResultadoImportacao; sha: string } {
  const sha = sha256(input.pacote)
  const lido = lerPacote(input.pacote)
  if (lido.erro) {
    return {
      sha,
      result: {
        rascunho: null, previa: null, problemas: [{ nivel: "erro", onde: "Arquivo", mensagem: lido.erro }], pendencias: [],
        resolucao: { modelo: null, cargos: [], tiposDeLocal: [], tiposDeAtivo: [], listas: [] }, resumo: null,
      },
    }
  }
  const result = importarModelo(lido.pacote, cadastro, {
    agora: now.toISOString(), novoId: idMaker(salt, sha), conferirCargos: true, pacote: { arquivo: input.arquivo ?? "", sha256: sha },
  })
  return { result, sha }
}

interface TokenBody {
  v: 2
  /** Instante da prévia (ms): a confirmação relê o pacote com ele. */
  at: number
  exp: number
  unit: string
  person: string | null
  pkg: string
  salt: string
  res: string
}
const sign = (body: string): string => createHmac("sha256", SECRET).update(body).digest("base64url")

export async function previewImport(tx: Tx, input: ImportInput, who: { unit: string; person: string | null }, now = new Date()) {
  const cadastro = await loadCadastro(tx, { people: true, templates: "stubs" })
  const salt = randomBytes(12).toString("hex")
  const { result, sha } = readPackage(input, cadastro, salt, now)
  const body = {
    ...result,
    ...(result.rascunho || result.previa ? { totais: totaisDaImportacao((result.rascunho ?? result.previa)!) } : {}),
    sha256: sha,
  }
  if (!result.rascunho) return body
  const t: TokenBody = { v: 2, at: now.getTime(), exp: now.getTime() + TOKEN_TTL_MS, unit: who.unit, person: who.person, pkg: sha, salt, res: fingerprint(result.rascunho) }
  const enc = b64(JSON.stringify(t))
  return { ...body, token: `${enc}.${sign(enc)}` }
}

function readToken(token: string, who: { unit: string; person: string | null }, now: Date): TokenBody {
  const [enc, mac] = token.split(".")
  const bad = (why: string) => pta.importStale(why)
  if (!enc || !mac) throw bad("token malformado")
  const want = Buffer.from(sign(enc))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw bad("token não confere")
  let t: TokenBody
  try {
    t = JSON.parse(Buffer.from(enc, "base64url").toString("utf8")) as TokenBody
  } catch {
    throw bad("token malformado")
  }
  if (t.v !== 2 || typeof t.at !== "number") throw bad("token malformado")
  if (t.exp < now.getTime()) throw bad("a prévia venceu (15 minutos)")
  if (t.unit !== who.unit || t.person !== who.person) throw bad("a prévia é de outra sessão")
  return t
}

export interface Confirmed {
  template: Template
  versionId: string
  created: { listas: string[]; tipos: string[]; cargos: string[] }
}

/** Cria, na transação do chamador, tudo o que a prévia listou. Nunca ativa. */
export async function confirmImport(tx: Tx, input: ImportInput & { token: string }, who: { unit: string; person: string | null }, now = new Date()): Promise<Confirmed> {
  const t = readToken(input.token, who, now)
  const cadastro = await loadCadastro(tx, { people: false, templates: "stubs" })
  const { result, sha } = readPackage(input, cadastro, t.salt, new Date(t.at))
  if (sha !== t.pkg) throw pta.importStale("o pacote é outro")
  const r = result.rascunho
  if (!r) throw pta.importStale(result.problemas.find((p) => p.nivel === "erro")?.mensagem ?? "o cadastro mudou e o pacote agora tem erros")
  if (fingerprint(r) !== t.res) throw pta.importStale("o cadastro mudou desde a prévia")

  // Tipos e cargos novos, depois as listas (a versão aponta para eles).
  const createdTipos: string[] = []
  const createdCargos: string[] = []
  const createdListas: string[] = []
  const typeRows: [string, typeof r.cargosNovos, string[]][] = [
    ["cargo", r.cargosNovos, createdCargos], ["local", r.tiposDeLocalNovos, createdTipos], ["ativo", r.tiposDeAtivoNovos, createdTipos],
  ]
  for (const [family, list, into] of typeRows) {
    for (const d of list) {
      const q = new Q()
      await run(
        tx,
        `insert into ptw.type_def (unit_id, id, family, label, icon, system_key, active)
         values (ptw.current_unit(), ${q.p(d.id, "uuid")}, ${q.p(family, "ptw.type_family")}, ${q.p(d.label, "text")}, ${q.p(family === "cargo" ? null : (d.icon ?? null), "text")}, ${q.p(d.systemKey ?? null, "text")}, ${q.p(d.active, "boolean")})`,
        q.params,
      )
      into.push(d.id)
    }
  }
  for (const l of r.listasNovas) {
    const q = new Q()
    await run(tx, `insert into ptw.option_list (unit_id, id, name) values (ptw.current_unit(), ${q.p(l.id, "uuid")}, ${q.p(l.name, "text")})`, q.params)
    for (const [position, it] of l.items.entries()) {
      const i = new Q()
      await run(
        tx,
        `insert into ptw.option_item (unit_id, id, list_id, label, active, position)
         values (ptw.current_unit(), ${i.p(it.id, "uuid")}, ${i.p(l.id, "uuid")}, ${i.p(it.label, "text")}, ${i.p(it.active, "boolean")}, ${i.p(position, "integer")})`,
        i.params,
      )
    }
    createdListas.push(l.id)
  }
  if (!r.modeloExistente) {
    const q = new Q()
    await run(tx, `insert into ptw.template (unit_id, id, name, retention_class) values (ptw.current_unit(), ${q.p(r.modeloId, "uuid")}, ${q.p(r.modeloNome, "text")}, 'pt')`, q.params)
  }
  const v = r.versao
  const versionId = await insertVersion(
    tx,
    r.modeloId,
    { ...(v as unknown as VersionInput), id: v.id },
    { origin: "sugerida", sha256: v.sourceSha256, importSource: { ...v.importSource, importadoEm: now.toISOString() }, number: v.number },
  )
  const created = { listas: createdListas, tipos: createdTipos, cargos: createdCargos }
  const a = new Q()
  await run(tx, `select ptw.audit_import(${a.p(versionId, "uuid")}, ${a.json(created)})`, a.params)
  return { template: await getTemplate(tx, r.modeloId), versionId, created }
}

/** O pacote `ptw.modelo/1` de uma versão (padrão, a ativa). 404 se a versão não é do modelo. */
export async function exportPackage(tx: Tx, templateId: string, versionId: string | undefined, now = new Date()) {
  const tpl = await getTemplate(tx, templateId)
  if (versionId !== undefined && !tpl.versions.some((v) => v.id === versionId)) throw pta.notFound()
  const cadastro = await loadCadastro(tx, { people: false, templates: "none" })
  let pkg
  try {
    pkg = exportarModelo(tpl as never, cadastro, { agora: now.toISOString(), ...(versionId ? { versaoId: versionId } : {}) })
  } catch (e) {
    throw dbLike("23514", e instanceof Error ? e.message : "Não foi possível exportar")
  }
  const version = tpl.versions.find((v) => v.id === (versionId ?? tpl.versions.find((x) => x.status === "ativa")?.id)) ?? [...tpl.versions].sort((a, b) => b.number - a.number)[0]
  return { pkg, name: tpl.name, version }
}

/** `ptw.audit_access('acesso.exportacao.modelo', …)` com o motivo. */
export async function recordExport(tx: Tx, reason: string, data: Record<string, unknown>): Promise<void> {
  const q = new Q()
  await run(tx, `select ptw.audit_access('acesso.exportacao.modelo', null, null, ${q.p(reason, "text")}, ${q.json(data)})`, q.params)
}
