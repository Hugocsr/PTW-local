/** Trilha única do banco. A paginação e os filtros são feitos no PostgreSQL. */
import { createHash, randomUUID } from "node:crypto"
import type { OpQuery, Schemas } from "../contract/types.js"
import type { Tx } from "../db.js"
import { pta } from "../errors/apiError.js"
import { Q, run, likeEscape } from "./permits/sql.js"

const EVENT = `jsonb_build_object('v', 2, 'unit', e.unit_id, 'seq', e.seq,
  'at', (extract(epoch from e.at) * 1000000)::bigint, 'prev', e.prev_hash, 'hash', e.hash,
  'actor', e.actor_id, 'role', e.role_id, 'auth', e.auth, 'client', e.client, 'request', e.request_id,
  'reason', e.reason, 'action', e.action, 'ok', e.ok, 'permit', e.permit_id, 'rev', e.rev,
  'asset', e.asset_id, 'entity', e.entity, 'entityId', e.entity_id, 'text', e.text, 'data', e.data,
  'actorName', e.actor_name, 'roleLabel', e.role_label, 'permitNumber', e.permit_number, 'assetCode', e.asset_code)`
const GROUP = `case when not e.ok then 'negada' when e.action like 'acesso.%' then 'acesso'
  when split_part(e.action, '.', 1) in ('sessao', 'conta', 'sistema') then 'sessao' else 'alteracao' end`

export async function listEvents(tx: Tx, filters: OpQuery<"listAuditEvents">): Promise<Schemas["AuditPage"]> {
  const q = new Q()
  const where = ["e.unit_id = ptw.current_unit()"]
  if (filters.q && !filters.from) throw pta.badRequest("Informe o início do período para buscar na auditoria")
  if (filters.from && filters.to && new Date(filters.from) >= new Date(filters.to)) throw pta.badRequest("O fim deve ser depois do início")
  if (filters.group?.length) where.push(`${GROUP} = any(${q.p(`{${filters.group.join(",")}}`, "text[]")})`)
  if (filters.area) where.push(`split_part(e.action, '.', 1) = ${q.p(filters.area, "text")}`)
  if (filters.action) where.push(`e.action like ${q.p(likeEscape(filters.action) + "%", "text")}`)
  if (filters.actorId) where.push(filters.actorId === "sistema" ? "e.actor_id is null" : `e.actor_id = ${q.p(filters.actorId, "uuid")}`)
  if (filters.permitId) where.push(`e.permit_id = ${q.p(filters.permitId, "uuid")}`)
  if (filters.assetId) where.push(`e.asset_id = ${q.p(filters.assetId, "uuid")}`)
  if (filters.from) where.push(`e.at >= ${q.p(filters.from, "timestamptz")}`)
  if (filters.to) where.push(`e.at < ${q.p(filters.to, "timestamptz")}`)
  if (filters.q) where.push(`ptw.search_text(concat_ws(' ', e.text, e.permit_number, e.asset_code)) like '%' || ptw.search_text(${q.p(likeEscape(filters.q), "text")}) || '%'`)
  const count = await run<{ n: string }>(tx, `select count(*) as n from ptw.v_audit e where ${where.join(" and ")}`, q.params)
  if (filters.before !== undefined) where.push(`e.seq < ${q.p(filters.before, "bigint")}`)
  const limit = filters.limit ?? 100
  const rows = await run<{ event: Schemas["AuditEvent"] }>(tx,
    `select ${EVENT} as event from ptw.v_audit e where ${where.join(" and ")} order by e.seq desc limit ${limit + 1}`, q.params)
  const items = rows.slice(0, limit).map(r => r.event)
  const search = Object.fromEntries(Object.entries(filters).filter(([key]) => key !== "before" && key !== "limit"))
  if (filters.before === undefined && Object.keys(search).length) {
    await tx`select ptw.audit_access('acesso.auditoria.busca', p_data => ${JSON.stringify(search)}::jsonb)`
  }
  return { items, total: Number(count[0]?.n ?? 0), nextBefore: rows.length > limit ? items.at(-1)!.seq : null }
}

export async function getEvent(tx: Tx, seq: number): Promise<{ event: Schemas["AuditEvent"]; previous: Schemas["AuditEvent"] | null }> {
  const rows = await run<{ event: Schemas["AuditEvent"] }>(tx,
    `select ${EVENT} as event from ptw.v_audit e where e.unit_id = ptw.current_unit() and e.seq in ($1::bigint, $1::bigint - 1) order by e.seq desc`, [seq])
  if (rows[0]?.event.seq !== seq) throw pta.notFound()
  await tx`select ptw.audit_access('acesso.auditoria.evento', p_data => ${JSON.stringify({ seq })}::jsonb)`
  return { event: rows[0].event, previous: rows[1]?.event ?? null }
}

export async function facets(tx: Tx, filter: OpQuery<"getAuditFacets">) {
  const q = new Q()
  const where = ["unit_id = ptw.current_unit()"]
  if (filter.from) where.push(`at >= ${q.p(filter.from, "timestamptz")}`)
  if (filter.to) where.push(`at < ${q.p(filter.to, "timestamptz")}`)
  const w = where.join(" and ")
  const actors = await run<{ id: string; name: string }>(tx, `select distinct actor_id as id, actor_name as name from ptw.v_audit where ${w} and actor_id is not null order by name, id`, q.params)
  const areas = await run<{ area: string }>(tx, `select distinct split_part(action, '.', 1) as area from ptw.v_audit where ${w} order by area`, q.params)
  const head = await tx<{ n: string }[]>`select coalesce(max(seq), 0) as n from ptw.v_audit where unit_id = ptw.current_unit()`
  return { actors, areas: areas.map(r => r.area), total: Number(head[0]?.n ?? 0) }
}

export async function chain(tx: Tx): Promise<Schemas["ChainStatus"]> {
  const head = await tx<{ last_seq: string; hash: string }[]>`select seq as last_seq, hash from ptw.v_audit where unit_id = ptw.current_unit() order by seq desc limit 1`
  const verified = await tx<{ at: Date; data: { ok: boolean; upToSeq: number; firstBroken: number | null } }[]>`
    select at, data from ptw.v_audit where unit_id = ptw.current_unit() and action = 'sistema.verificacao' order by seq desc limit 1`
  const anchor = await tx<{ day: string; seq: string }[]>`select day::text, seq from ptw.audit_anchor where unit_id = ptw.current_unit() order by seq desc limit 1`
  const v = verified[0]
  return { headSeq: Number(head[0]?.last_seq ?? 0), headHash: head[0]?.hash ?? "0".repeat(64),
    verified: v && typeof v.data.ok === "boolean" && typeof v.data.upToSeq === "number" ? { at: v.at.toISOString(), ...v.data } : null,
    lastAnchor: anchor[0] ? { day: anchor[0].day, seq: Number(anchor[0].seq) } : null }
}

export async function verify(tx: Tx) {
  const head = await chain(tx)
  const result = await tx<{ broken: string | null }[]>`select ptw.audit_verify(ptw.current_unit()) as broken`
  const firstBroken = result[0]?.broken == null ? null : Number(result[0].broken)
  const data = { ok: firstBroken === null, upToSeq: head.headSeq, firstBroken }
  await tx`select ptw.audit_system('sistema.verificacao', ${data.ok ? "Cadeia íntegra" : "Falha na cadeia"}::text, ${JSON.stringify(data)}::jsonb)`
  return chain(tx)
}

const EXPORT = `jsonb_build_object('id', x.id, 'firstSeq', x.first_seq, 'lastSeq', x.last_seq,
  'events', x.last_seq - x.first_seq + 1, 'fileSha256', encode(x.file_sha256, 'hex'),
  'manifestSha256', encode(x.manifest_sha256, 'hex'), 'reason', x.reason, 'actorId', x.actor_id, 'at', x.at,
  'fileName', 'ptw-auditoria-' || u.code || '-' || x.first_seq || '-' || x.last_seq)`
export async function getExport(tx: Tx, id: string) {
  const r = await run<{ item: Schemas["AuditExport"]; manifest: string | null }>(tx,
    `select ${EXPORT} as item, x.manifest from ptw.audit_export x join ptw.unit u on u.id = x.unit_id where x.unit_id = ptw.current_unit() and x.id = $1::uuid`, [id])
  if (!r[0]) throw pta.notFound()
  return r[0]
}

export async function listExports(tx: Tx, query: OpQuery<"listAuditExports">): Promise<Schemas["AuditExportPage"]> {
  const page = query.page ?? 0, pageSize = query.pageSize ?? 50
  const r = await run<{ item: Schemas["AuditExport"] }>(tx,
    `select ${EXPORT} as item from ptw.audit_export x join ptw.unit u on u.id = x.unit_id where x.unit_id = ptw.current_unit() order by x.at desc, x.id desc limit ${pageSize} offset ${page * pageSize}`)
  const n = await tx<{ n: string }[]>`select count(*) as n from ptw.audit_export where unit_id = ptw.current_unit()`
  return { items: r.map(x => x.item), page, pageSize, total: Number(n[0]?.n ?? 0) }
}

export async function createExport(tx: Tx, input: { from: string; to: string; reason: string }): Promise<Schemas["AuditExport"]> {
  if (!input.reason.trim() || new Date(input.from) >= new Date(input.to)) throw pta.badRequest("Informe um período válido e o motivo da exportação")
  const r = await tx<{ first_seq: string; last_seq: string; events: string; prev_hash: string; last_hash: string }[]>`
    select * from ptw.audit_seq_range(ptw.current_unit(), ${input.from}::timestamptz, ${input.to}::timestamptz)`
  if (!r[0]) throw pta.badRequest("Nenhum evento no período")
  const range = r[0], first = Number(range.first_seq), last = Number(range.last_seq)
  const hash = createHash("sha256")
  let size = 0, count = 0
  for await (const batch of tx<{ line: string }[]>`select ptw.audit_export_lines(ptw.current_unit(), ${first}, ${last}) as line`.cursor(500)) {
    for (const row of batch) { const bytes = Buffer.from(row.line + "\n"); hash.update(bytes); size += bytes.length; count++ }
  }
  if (count !== Number(range.events)) throw pta.unexpected(undefined, "Exportação incompleta")
  const u = (await tx<{ id: string; code: string; timezone: string }[]>`select id, code, timezone from ptw.unit where id = ptw.current_unit()`)[0]!
  const name = `ptw-auditoria-${u.code}-${first}-${last}`
  const anchors = await tx<{ v: number; unidade: string; dia: string; seq: string; hash: string; chave: string; mac: string }[]>`select 1 as v, unit_id as unidade, day::text as dia, seq, encode(hash, 'hex') as hash, key_id as chave, encode(mac, 'hex') as mac
    from ptw.audit_anchor where unit_id = ptw.current_unit() and seq between ${first} and ${last} order by seq`
  const retention = await tx`select code as classe, years as anos, basis as base from ptw.retention_class order by code`
  const fileHash = hash.digest("hex")
  const manifest = JSON.stringify({ formato: "ptw-auditoria/2", unidade: u.id, codigo: u.code, fuso: u.timezone,
    periodo: { de: input.from, ate: input.to }, primeiro_seq: first, ultimo_seq: last, eventos: count,
    prev_hash_inicial: range.prev_hash, hash_final: range.last_hash,
    arquivo: { nome: name + ".jsonl", bytes: size, sha256: fileHash }, ancoras: anchors.map(a => ({ ...a, seq: Number(a.seq) })), retencao: retention,
    motivo: input.reason, gerado_em: new Date().toISOString() }, null, 2) + "\n"
  const id = randomUUID(), manifestHash = createHash("sha256").update(manifest).digest("hex")
  await tx`select ptw.audit_export_record(ptw.current_unit(), ${first}, ${last}, ${fileHash}, ${manifestHash}, ${input.reason}, ${manifest}, ${id}::uuid)`
  return (await getExport(tx, id)).item
}
