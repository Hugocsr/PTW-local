/**
 * Leitura da PT: o detalhe (`PermitDetail`), o Quadro (`v_permit_board` + `permit_next_rows`), os
 * totais, a Minha área (`my_permits`) e o Histórico (`v_audit`, sem `acesso.*`).
 *
 * O detalhe sai de uma consulta só, montado pelo banco em JSON (nomes do contrato). Quem move a
 * seguir, a etapa em curso, o bloqueio e "trabalho liberado" são as funções do banco: a API não
 * calcula estado nem etapa.
 */
import type { OpQuery, Schemas } from "../../contract/types.js"
import { isUuid, type Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { Q, iso, likeEscape, run } from "./sql.js"

export type PermitDetail = Schemas["PermitDetail"]
type Header = Schemas["PermitHeader"]
type BoardRow = Schemas["PermitBoardRow"]
type AuditEvent = Schemas["AuditEvent"]
type PermitState = Schemas["PermitState"]

/** A linha de `ptw.permit` (alias `p`) como `PermitHeader`, em JSON montado pelo banco. */
export const HEADER_JSON = `jsonb_build_object(
  'revalidation', (select jsonb_build_object('id', r.id, 'originalStart', (select min(lower(r0.old_window)) from ptw.permit_revalidation r0 where r0.unit_id=p.unit_id and r0.permit_id=p.id), 'shiftStart', lower(r.shift_window), 'shiftEnd', upper(r.shift_window),
    'newEnd', upper(r.new_window), 'reason', r.reason, 'personId', r.person_id, 'at', r.at)
    from ptw.permit_revalidation r where r.unit_id = p.unit_id and r.permit_id = p.id order by r.at desc, r.id desc limit 1),
  'id', p.id, 'number', p.number, 'templateId', p.template_id, 'versionId', p.version_id, 'state', p.state,
  'authorId', p.author_id, 'locationId', p.location_id,
  'assetIds', coalesce((select jsonb_agg(pa.asset_id order by pa.asset_id) from ptw.permit_asset pa
                         where pa.unit_id = p.unit_id and pa.permit_id = p.id), '[]'::jsonb),
  'team', coalesce((select jsonb_object_agg(t.role_id, t.people)
                      from (select pt.role_id, jsonb_agg(pt.person_id order by pt.person_id) as people
                              from ptw.permit_team pt where pt.unit_id = p.unit_id and pt.permit_id = p.id
                             group by pt.role_id) t), '{}'::jsonb),
  'windowStart', lower(p.work_window), 'windowEnd', upper(p.work_window), 'scope', p.scope,
  'snapshotSha256', encode(p.snapshot_sha256, 'hex'), 'snapshotAt', p.snapshot_at, 'revision', p.revision,
  'note', p.state_note, 'holdReason', p.hold_reason, 'holdBy', p.hold_by, 'holdAt', p.hold_at,
  'resumedReason', p.resumed_reason, 'resumedBy', p.resumed_by, 'resumedAt', p.resumed_at,
  'createdAt', p.created_at, 'updatedAt', p.updated_at, 'rowVersion', p.row_version)`

/** As respostas da PT (`p`), por item. */
const ANSWERS_JSON = `coalesce((select jsonb_object_agg(a.item_id, a.value) from ptw.permit_answer a
                           where a.unit_id = p.unit_id and a.permit_id = p.id), '{}'::jsonb)`

/** Tudo de uma PT (`p`) que a tela e o núcleo do app precisam. */
const DETAIL_JSON = `jsonb_build_object(
  'permit', ${HEADER_JSON} || jsonb_build_object(
     'answers', ${ANSWERS_JSON},
     'answerMeta', coalesce((select jsonb_object_agg(a.item_id, jsonb_build_object('answeredBy', a.answered_by, 'answeredAt', a.answered_at))
                              from ptw.permit_answer a where a.unit_id = p.unit_id and a.permit_id = p.id), '{}'::jsonb)),
  'form', ptw.permit_form(p.unit_id, p.id),
  'signatures', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'permitId', g.permit_id, 'rev', g.rev, 'slotId', g.slot_id,
                                   'personId', g.person_id, 'signedAt', g.signed_at, 'voidedAt', g.voided_at, 'voidedReason', g.voided_reason)
                                 order by g.signed_at, g.id)
                            from ptw.signature g where g.unit_id = p.unit_id and g.permit_id = p.id), '[]'::jsonb),
  'revisions', coalesce((select jsonb_agg(jsonb_build_object('permitId', r.permit_id, 'rev', r.rev, 'at', r.at, 'reason', r.reason,
                                  'sha256', encode(r.sha256, 'hex')) order by r.rev)
                           from ptw.permit_revision r where r.unit_id = p.unit_id and r.permit_id = p.id), '[]'::jsonb),
  'extensions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'permitId', x.permit_id, 'revision', x.revision, 'oldEnd', x.old_end,
                                   'newEnd', x.new_end, 'reason', x.reason, 'personId', x.person_id, 'at', x.at) order by x.at, x.id)
                            from ptw.permit_extension x where x.unit_id = p.unit_id and x.permit_id = p.id), '[]'::jsonb),
  'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', at.id, 'permitId', at.permit_id, 'itemId', at.item_id, 'kind', at.kind,
                                    'sha256', encode(at.sha256, 'hex'), 'fileName', at.file_name, 'previewSha256', encode(at.preview_sha256, 'hex'),
                                    'width', at.width, 'height', at.height, 'durationMs', at.duration_ms,
                                    'capturedBy', at.captured_by, 'capturedAt', at.captured_at) order by at.captured_at, at.id)
                             from ptw.attachment at where at.unit_id = p.unit_id and at.permit_id = p.id), '[]'::jsonb),
  'blobs', coalesce((select jsonb_object_agg(encode(b.sha256, 'hex'), jsonb_build_object('sha256', encode(b.sha256, 'hex'), 'size', b.size,
                                'mime', b.mime, 'storedAt', b.stored_at))
                       from ptw.blob b
                      where b.unit_id = p.unit_id
                        and b.sha256 in (select at.sha256 from ptw.attachment at where at.unit_id = p.unit_id and at.permit_id = p.id
                                         union
                                         select at.preview_sha256 from ptw.attachment at
                                          where at.unit_id = p.unit_id and at.permit_id = p.id and at.preview_sha256 is not null)), '{}'::jsonb),
  'assets', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'unitId', a.unit_id, 'revision', a.revision, 'updatedAt', a.updated_at,
                               'origin', a.origin, 'status', a.status, 'typeId', a.type_id, 'code', a.code, 'name', a.name,
                               'aliases', to_jsonb(a.aliases),
                               'locationIds', coalesce((select jsonb_agg(al.location_id order by al.location_id) from ptw.asset_location al
                                                         where al.unit_id = a.unit_id and al.asset_id = a.id), '[]'::jsonb))
                             order by lower(a.code), a.id)
                        from ptw.asset a
                       where a.unit_id = p.unit_id
                         and a.id in (select pa.asset_id from ptw.permit_asset pa where pa.unit_id = p.unit_id and pa.permit_id = p.id)), '[]'::jsonb),
  'currentStageId', cs.id,
  'blocker', case when cs.position is null then null else ptw.permit_blocker(p.unit_id, p.id, cs.position) end,
  'released', ptw.work_released(p),
  'now', now())`

const DETAIL_FROM = `from ptw.permit p
  left join lateral (select st.id, st.position from ptw.stage st
                      where st.unit_id = p.unit_id and st.id = ptw.permit_current_stage(p.unit_id, p.id)) cs on true`

/**
 * Resolve o `{id}` de `GET /permits/{id}`: o uuid ou o número (`PT-UN01-2026-00012`). Nulo se não
 * existe na unidade (o RLS esconde as outras).
 */
export async function resolvePermitId(tx: Tx, idOrNumber: string): Promise<string | null> {
  const q = new Q()
  const where = isUuid(idOrNumber) ? `p.id = ${q.p(idOrNumber, "uuid")}` : `p.number = ${q.p(idOrNumber, "text")}`
  const rows = await run<{ id: string }>(tx, `select p.id from ptw.permit p where p.unit_id = ptw.current_unit() and ${where}`, q.params)
  return rows[0]?.id ?? null
}

/** A PT inteira; 404 se não existe na unidade. */
export async function loadDetail(tx: Tx, id: string): Promise<PermitDetail> {
  const q = new Q()
  const rows = await run<{ d: PermitDetail }>(tx, `select ${DETAIL_JSON} as d ${DETAIL_FROM} where p.unit_id = ptw.current_unit() and p.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return rows[0].d
}

/** Várias PTs inteiras (Minha área), na ordem da janela. */
async function loadDetails(tx: Tx, ids: readonly string[]): Promise<PermitDetail[]> {
  if (ids.length === 0) return []
  const q = new Q()
  const rows = await run<{ d: PermitDetail }>(
    tx,
    `select ${DETAIL_JSON} as d ${DETAIL_FROM} where p.unit_id = ptw.current_unit() and p.id = any (${q.uuids(ids)}) order by lower(p.work_window), p.id`,
    q.params,
  )
  return rows.map((r) => r.d)
}

/** `acesso.pt.aberta`: um evento por abertura (decisão D5). */
export async function recordOpen(tx: Tx, id: string): Promise<void> {
  const q = new Q()
  await run(tx, `select ptw.audit_access('acesso.pt.aberta', ${q.p(id, "uuid")}) as seq`, q.params)
}

// ---------------------------------------------------------------- Quadro

/** Segmentos do Quadro (`QuadroView`; `BOARD_SEGMENTS` do app). "minhas" é a vez da pessoa. */
const SEGMENT_STATES: Record<string, PermitState[] | null> = {
  andamento: ["em_analise", "devolvida", "emitida", "ativa", "suspensa", "entregue", "expirada"],
  preparacao: ["rascunho", "em_analise", "devolvida", "emitida"],
  campo: ["ativa", "suspensa", "entregue"],
  finalizadas: ["encerrada", "cancelada"],
  minhas: null,
}

/** Ordem de estado do Quadro (`stateRank` do app). */
const STATE_RANK = `case b.state when 'suspensa' then 0 when 'devolvida' then 1 when 'entregue' then 2 when 'em_analise' then 3
  when 'emitida' then 4 when 'ativa' then 5 when 'rascunho' then 6 when 'expirada' then 7 when 'cancelada' then 8 else 9 end`

const SORT: Record<string, string> = {
  state: STATE_RANK,
  number: "b.number",
  windowStart: "b.window_start",
  windowEnd: "b.window_end",
  updatedAt: "b.updated_at",
  location: "lower(b.location_name)",
  template: "lower(b.template_name)",
  assets: "(b.asset_codes)[1]",
}

function orderOf(sort: string | undefined): string {
  const raw = sort ?? "state"
  const desc = raw.startsWith("-")
  const col = SORT[desc ? raw.slice(1) : raw] ?? SORT.state!
  // Sem número (rascunho) vai para o fim nas duas direções.
  return `${col} ${desc ? "desc" : "asc"} nulls last, b.window_start desc, b.id`
}

/** As PTs que são a vez da pessoa (segmento "minhas"): o conjunto da Minha área, filtrado por `mine`. */
const MINE_IDS = (q: Q, unit: string, person: string): string => {
  const u1 = q.p(unit, "uuid")
  const u2 = q.p(unit, "uuid")
  const p1 = q.p(person, "uuid")
  const p2 = q.p(person, "uuid")
  return `(select n.permit_id from ptw.permit_next_rows(${u1}, array(select ptw.my_permits(${u2}, ${p1}, 0)), ${p2}) n where n.mine)`
}

interface Filters {
  q?: string
  locationId?: string
  templateId?: string
  assetId?: string
  authorId?: string
  windowFrom?: string
  windowTo?: string
}

/** O que vale para o Quadro e os totais: a unidade, sem rascunho de outra pessoa, e os filtros. */
function boardWhere(q: Q, person: string, f: Filters): string[] {
  const where = [`b.unit_id = ptw.current_unit()`, `(b.number is not null or b.author_id = ${q.p(person, "uuid")})`]
  const term = f.q?.trim()
  if (term) {
    const like = (col: string) => `${col} like '%' || ptw.search_text(${q.p(likeEscape(term), "text")}) || '%'`
    where.push(`(${like("b.search")}
      or exists (select 1 from ptw.permit_asset pa join ptw.asset a on a.unit_id = pa.unit_id and a.id = pa.asset_id
                  where pa.unit_id = b.unit_id and pa.permit_id = b.id and ${like("a.search")})
      or ${like("ptw.search_text(b.template_name)")}
      or ${like("ptw.search_text(b.location_name)")})`)
  }
  if (f.locationId !== undefined) {
    where.push(`b.location_path <@ (select l.path from ptw.location l where l.unit_id = b.unit_id and l.id = ${q.p(f.locationId, "uuid")})`)
  }
  if (f.templateId !== undefined) where.push(`b.template_id = ${q.p(f.templateId, "uuid")}`)
  if (f.assetId !== undefined) {
    where.push(`exists (select 1 from ptw.permit_asset pa where pa.unit_id = b.unit_id and pa.permit_id = b.id and pa.asset_id = ${q.p(f.assetId, "uuid")})`)
  }
  if (f.authorId !== undefined) where.push(`b.author_id = ${q.p(f.authorId, "uuid")}`)
  if (f.windowFrom !== undefined) where.push(`b.window_end > ${q.p(f.windowFrom, "timestamptz")}`)
  if (f.windowTo !== undefined) where.push(`b.window_start < ${q.p(f.windowTo, "timestamptz")}`)
  return where
}

interface BoardDbRow {
  id: string
  h: Header
  answers?: Record<string, unknown>
  state_label: string
  released: boolean
  author_name: string
  location_name: string
  location_path: string
  template_name: string
  version_number: number
  asset_codes: string[] | null
  _total: number | string
}

interface NextRow {
  permit_id: string
  stage_id: string | null
  label: string
  mine: boolean
}

/** Quem move a seguir para as PTs da página (uma consulta de conjunto). */
async function nextOf(tx: Tx, unit: string, person: string, ids: readonly string[]): Promise<Map<string, NextRow>> {
  if (ids.length === 0) return new Map()
  const q = new Q()
  const rows = await run<NextRow>(
    tx,
    `select n.permit_id, n.stage_id, n.label, n.mine from ptw.permit_next_rows(${q.p(unit, "uuid")}, ${q.uuids(ids)}, ${q.p(person, "uuid")}) n`,
    q.params,
  )
  return new Map(rows.map((r) => [r.permit_id, r]))
}

export async function listBoard(tx: Tx, unit: string, person: string, query: OpQuery<"listPermits">): Promise<Schemas["PermitBoardPage"]> {
  const q = new Q()
  const where = boardWhere(q, person, query)
  if (query.segment !== undefined) {
    const states = SEGMENT_STATES[query.segment]
    if (states) where.push(`b.state = any (${q.p(`{${states.join(",")}}`, "ptw.permit_state[]")})`)
    else where.push(`b.id in ${MINE_IDS(q, unit, person)}`)
  }
  if (query.state !== undefined && query.state.length > 0) where.push(`b.state = any (${q.p(`{${query.state.join(",")}}`, "ptw.permit_state[]")})`)
  const page = query.page ?? 0
  const pageSize = query.pageSize ?? 50
  const sql = `select b.id, ${HEADER_JSON} as h, b.state_label, b.released, b.author_name, b.location_name, b.location_path::text as location_path,
         b.template_name, b.version_number, b.asset_codes${query.answers ? `, ${ANSWERS_JSON} as answers` : ""}, count(*) over () as _total
    from ptw.v_permit_board b
    join ptw.permit p on p.unit_id = b.unit_id and p.id = b.id
   where ${where.join(" and ")}
   order by ${orderOf(query.sort)}
   limit ${Math.trunc(pageSize)} offset ${Math.trunc(page) * Math.trunc(pageSize)}`
  const rows = await run<BoardDbRow>(tx, sql, q.params)
  let total = rows.length > 0 ? Number(rows[0]!._total) : 0
  if (rows.length === 0 && page > 0) {
    const c = await run<{ n: number | string }>(tx, `select count(*) as n from ptw.v_permit_board b where ${where.join(" and ")}`, q.params)
    total = Number(c[0]?.n ?? 0)
  }
  const next = await nextOf(tx, unit, person, rows.map((r) => r.id))
  const items: BoardRow[] = rows.map((r) => {
    const n = next.get(r.id)
    return {
      permit: r.h,
      stateLabel: r.state_label,
      released: r.released,
      authorName: r.author_name,
      locationName: r.location_name,
      locationPath: r.location_path === "" ? [] : r.location_path.split(".").map(labelToUuid),
      templateName: r.template_name,
      versionNumber: Number(r.version_number),
      assetCodes: r.asset_codes ?? [],
      currentStageId: n?.stage_id ?? null,
      next: n?.label ?? "—",
      mine: n?.mine ?? false,
      ...(query.answers ? { answers: r.answers ?? {} } : {}),
    }
  })
  return { page, pageSize, total, items }
}

/** Rótulo do `ltree` do caminho → uuid (o rótulo é o uuid sem hífens, ou com `_` no lugar). */
function labelToUuid(label: string): string {
  const hex = label.replace(/[^0-9a-fA-F]/g, "").toLowerCase()
  if (hex.length !== 32) return label
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function countBoard(tx: Tx, unit: string, person: string, query: OpQuery<"countPermits">): Promise<{ total: number; byState: Record<string, number>; bySegment: Record<string, number> }> {
  const q = new Q()
  const where = boardWhere(q, person, query)
  const mine = MINE_IDS(q, unit, person)
  const rows = await run<{ state: PermitState; n: number | string; mine: number | string }>(
    tx,
    `select b.state, count(*) as n, count(*) filter (where b.id in ${mine}) as mine
       from ptw.v_permit_board b where ${where.join(" and ")} group by b.state`,
    q.params,
  )
  const byState: Record<string, number> = {}
  const bySegment: Record<string, number> = { minhas: 0, andamento: 0, preparacao: 0, campo: 0, finalizadas: 0 }
  let total = 0
  for (const r of rows) {
    const n = Number(r.n)
    byState[r.state] = n
    total += n
    bySegment.minhas! += Number(r.mine)
    for (const [seg, states] of Object.entries(SEGMENT_STATES)) if (states?.includes(r.state)) bySegment[seg]! += n
  }
  return { total, byState, bySegment }
}

// ---------------------------------------------------------------- Minha área

/**
 * Conjunto de trabalho da pessoa (`ptw.my_permits`). Com `updatedSince`, só as PTs mexidas desde
 * então (a PT, as assinaturas, as respostas, os anexos); `gone` = as mexidas que não estão mais no
 * conjunto. Uma folga de 30 s cobre transações que confirmaram depois do `asOf` anterior.
 */
export async function listMine(tx: Tx, unit: string, person: string, query: OpQuery<"listMyPermits">): Promise<{ items: PermitDetail[]; gone?: string[]; asOf: string }> {
  const q = new Q()
  const days = query.finishedDays ?? 2
  const mineIds = await run<{ id: string }>(tx, `select m as id from ptw.my_permits(${q.p(unit, "uuid")}, ${q.p(person, "uuid")}, ${q.p(days, "integer")}) m`, q.params)
  const now = await run<{ now: Date }>(tx, `select now() as now`)
  const asOf = iso(now[0]?.now ?? new Date())
  const set = mineIds.map((r) => r.id)
  if (query.updatedSince === undefined) return { items: await loadDetails(tx, set), asOf }

  const c = new Q()
  const since = c.p(query.updatedSince, "timestamptz")
  const changed = await run<{ id: string }>(
    tx,
    `select p.id from ptw.permit p
      where p.unit_id = ptw.current_unit()
        and p.changed_at > ${since} - interval '30 seconds'`,
    c.params,
  )
  const inSet = new Set(set)
  const changedIds = changed.map((r) => r.id)
  return {
    items: await loadDetails(tx, changedIds.filter((id) => inSet.has(id))),
    gone: changedIds.filter((id) => !inSet.has(id)),
    asOf,
  }
}

// ---------------------------------------------------------------- Histórico

interface AuditRow {
  unit_id: string
  seq: number | string
  at_us: number | string
  ok: boolean
  action: string
  text: string
  reason: string | null
  actor_id: string | null
  actor_name: string | null
  role_id: string | null
  role_label: string | null
  auth: AuditEvent["auth"]
  client: string | null
  request_id: string | null
  permit_id: string | null
  permit_number: string | null
  rev: number | null
  asset_id: string | null
  asset_code: string | null
  entity: string | null
  entity_id: string | null
  data: Record<string, unknown>
  hash: string
  prev_hash: string
  _total: number | string
}

/** O Histórico da PT: a trilha da PT sem as leituras, do mais novo para o mais antigo (cursor `before`). */
export async function permitHistory(tx: Tx, id: string, query: OpQuery<"getPermitHistory">): Promise<Schemas["PermitHistoryPage"]> {
  const limit = query.limit ?? 100
  const q = new Q()
  const where = [`e.unit_id = ptw.current_unit()`, `e.permit_id = ${q.p(id, "uuid")}`, `left(e.action, 7) <> 'acesso.'`]
  const totalWhere = [...where]
  const totalParams = [...q.params]
  if (query.before !== undefined) where.push(`e.seq < ${q.p(query.before, "bigint")}`)
  const rows = await run<AuditRow>(
    tx,
    `select e.unit_id, e.seq, (extract(epoch from e.at) * 1000000)::bigint as at_us, e.ok, e.action, e.text, e.reason,
            e.actor_id, e.actor_name, e.role_id, e.role_label, e.auth, e.client, e.request_id, e.permit_id, e.permit_number, e.rev,
            e.asset_id, e.asset_code, e.entity, e.entity_id, e.data, e.hash, e.prev_hash, 0 as _total
       from ptw.v_audit e where ${where.join(" and ")} order by e.seq desc limit ${Math.trunc(limit)}`,
    q.params,
  )
  const t = await run<{ n: number | string }>(tx, `select count(*) as n from ptw.v_audit e where ${totalWhere.join(" and ")}`, totalParams)
  const access = await tx<{ accesses: string }[]>`select count(*) as accesses from ptw.v_audit
    where unit_id = ptw.current_unit() and permit_id = ${id}::uuid and left(action, 7) = 'acesso.'`
  const items: AuditEvent[] = rows.map((r) => ({
    v: 2,
    unit: r.unit_id,
    seq: Number(r.seq),
    at: Number(r.at_us),
    prev: r.prev_hash,
    hash: r.hash,
    actor: r.actor_id,
    role: r.role_id,
    auth: r.auth,
    client: r.client,
    request: r.request_id,
    reason: r.reason,
    action: r.action,
    ok: r.ok,
    permit: r.permit_id,
    rev: r.rev === null ? null : Number(r.rev),
    asset: r.asset_id,
    entity: r.entity,
    entityId: r.entity_id,
    text: r.text,
    data: r.data,
    actorName: r.actor_name,
    roleLabel: r.role_label,
    permitNumber: r.permit_number,
    assetCode: r.asset_code,
  }))
  return { items, total: Number(t[0]?.n ?? 0), accesses: Number(access[0]?.accesses ?? 0), nextBefore: rows.length === limit && rows.length > 0 ? Number(rows.at(-1)!.seq) : null }
}
