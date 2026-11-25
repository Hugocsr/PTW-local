/**
 * Cadastro de exemplo no formato do SGI Forces (Gestão de Ativos): plantas, áreas, equipamentos e
 * equipamentos aninhados, com a ficha SAP e os dispositivos de proteção. É o pacote de carga do servidor
 * (`ptw-server/api/seed/dados/exemplo.json`, gerado por `node scripts/export-seed.mjs`), usado depois de
 * zerar o banco. Pessoas, cargos, listas e modelos são os do exemplo do app (registry/seed), com o escopo
 * dos cargos e os tipos aceitos pelos modelos trazidos para as áreas e os tipos de equipamento daqui.
 */
import { seed } from "@/registry/seed"
import { ID, seedUuid } from "@/registry/seedIds"
import { PART_OF_KEY, type Asset, type AssetRelation, type Location, type RecordAttrs, type RegistryState, type RoleAssignment, type TypeDef } from "@/registry/types"
import type { PermitTemplate } from "@/registry/modelTypes"

const T = "2026-11-06T09:00:00-03:00"
const U = ID.unit
const rec = (id: string, status: "ativo" | "inativo" = "ativo") => ({ id, unitId: U, revision: 1, updatedAt: T, origin: "manual" as const, status })

/** Tipos de local: os dois níveis do SGI, protegidos pela chave do sistema. */
export const SGI_TYPE = {
  planta: seedUuid(0x0002, 0x101),
  area: seedUuid(0x0002, 0x102),
  // SPEC 004: area types the person can pick (Nova área › Tipo).
  sala: seedUuid(0x0002, 0x103),
  linha: seedUuid(0x0002, 0x104),
  ponto: seedUuid(0x0002, 0x105),
} as const

/** Tipos de equipamento (SGI `tipo`). Os ids antigos que os modelos usam continuam válidos. */
const EQ = {
  painel: ID.assetType.painel, motor: ID.assetType.motor, tubulacao: ID.assetType.tubo, valvula: ID.assetType.valv, caldeira: ID.assetType.cald,
  bomba: seedUuid(0x0003, 0x101), compressor: seedUuid(0x0003, 0x102), agitador: seedUuid(0x0003, 0x103), filtro: seedUuid(0x0003, 0x104),
  trocador: seedUuid(0x0003, 0x105), sensor: seedUuid(0x0003, 0x106), moinho: seedUuid(0x0003, 0x107),
} as const

const locationTypes: TypeDef[] = [
  { id: SGI_TYPE.planta, label: "Planta", icon: "fabrica", systemKey: "planta", active: true },
  { id: SGI_TYPE.area, label: "Área", icon: "area", systemKey: "area", active: true },
  { id: SGI_TYPE.sala, label: "Sala", icon: "sala", active: true },
  { id: SGI_TYPE.linha, label: "Linha", icon: "linha", active: true },
  { id: SGI_TYPE.ponto, label: "Ponto de trabalho", icon: "ponto", active: true },
]

const assetTypes: TypeDef[] = [
  { id: EQ.bomba, label: "Bomba", icon: "bomba", active: true },
  { id: EQ.motor, label: "Motor", icon: "motor", active: true },
  { id: EQ.valvula, label: "Válvula", icon: "valvula", active: true },
  { id: EQ.compressor, label: "Compressor", icon: "compressor", active: true },
  { id: EQ.agitador, label: "Agitador", icon: "ventilador", active: true },
  { id: EQ.trocador, label: "Trocador de calor", icon: "aquecedor", active: true },
  { id: EQ.filtro, label: "Filtro", icon: "filtro", active: true },
  { id: EQ.moinho, label: "Moinho", icon: "ferramenta", active: true },
  { id: EQ.caldeira, label: "Caldeira", icon: "caldeira", active: true },
  { id: EQ.tubulacao, label: "Tubulação", icon: "tubulacao", active: true },
  { id: EQ.painel, label: "Painel / CCM", icon: "painel", active: true },
  { id: EQ.sensor, label: "Sensor / instrumento", icon: "sensor", active: true },
]

const L = (n: number) => seedUuid(0x0010, 0x100 + n)
const A = (n: number) => seedUuid(0x0011, 0x100 + n)
const R = (n: number) => seedUuid(0x0012, 0x100 + n)

export const SGI_LOC = {
  norte: L(1), caldeiraria: L(2), digestores: L(3), lavagem: L(4), recuperacao: L(5),
  sul: L(6), moagem: L(7), filtracao: L(8), leste: L(9), utilidades: L(10),
} as const

const planta = (id: string, code: string, name: string, attrs: RecordAttrs, status: "ativo" | "inativo" = "ativo"): Location =>
  ({ ...rec(id, status), parentId: null, typeId: SGI_TYPE.planta, code, name, aliases: [], attrs })
const area = (id: string, parentId: string, code: string, name: string, attrs: RecordAttrs): Location =>
  ({ ...rec(id), parentId, typeId: SGI_TYPE.area, code, name, aliases: [], attrs })

const locations: Location[] = [
  planta(SGI_LOC.norte, "PNO", "Planta Norte", { fuso: "America/Sao_Paulo", localizacao: "Barcarena/PA", werks: "BR01", iwerk: "BR01", bukrs: "BR00", regio: "PA" }),
  area(SGI_LOC.caldeiraria, SGI_LOC.norte, "PNO-CAL", "Caldeiraria", { tplnr: "BR-PNO-CAL", beber: "01", kostl: "CC-1001" }),
  area(SGI_LOC.digestores, SGI_LOC.norte, "PNO-DIG", "Digestores", { tplnr: "BR-PNO-DIG", beber: "02", kostl: "CC-1002" }),
  area(SGI_LOC.lavagem, SGI_LOC.norte, "PNO-LAV", "Lavagem", { tplnr: "BR-PNO-LAV", beber: "03", kostl: "CC-1003" }),
  area(SGI_LOC.recuperacao, SGI_LOC.norte, "PNO-REC", "Recuperação", { tplnr: "BR-PNO-REC", beber: "04", kostl: "CC-1004" }),
  planta(SGI_LOC.sul, "PSU", "Planta Sul", { fuso: "America/Sao_Paulo", localizacao: "Mogi Guaçu/SP", werks: "BR02", iwerk: "BR02", bukrs: "BR00", regio: "SP" }),
  area(SGI_LOC.moagem, SGI_LOC.sul, "PSU-MOA", "Moagem", { tplnr: "BR-PSU-MOA", beber: "01", kostl: "CC-2001" }),
  area(SGI_LOC.filtracao, SGI_LOC.sul, "PSU-FIL", "Filtração", { tplnr: "BR-PSU-FIL", beber: "02", kostl: "CC-2002" }),
  planta(SGI_LOC.leste, "PLE", "Planta Leste", { fuso: "America/Fortaleza", localizacao: "Pecém/CE", werks: "BR03", bukrs: "BR00", regio: "CE" }, "inativo"),
  area(SGI_LOC.utilidades, SGI_LOC.leste, "PLE-UTL", "Utilidades", { tplnr: "BR-PLE-UTL", beber: "01", kostl: "CC-3001" }),
]

export const SGI_ASSET = {
  bp201: A(1), m201: A(2), lsl201: A(3), md101: A(4), bl301: A(5), ca401: A(6), xv401: A(7),
  mo01: A(8), ag02: A(9), fp01: A(10), psh101: A(11), cald01: A(12),
} as const

const equip = (id: string, typeId: string, code: string, name: string, locationId: string, attrs: RecordAttrs, status: "ativo" | "inativo" = "ativo"): Asset =>
  ({ ...rec(id, status), typeId, code, name, aliases: [], locationIds: [locationId], attrs })

const assets: Asset[] = [
  equip(SGI_ASSET.bp201, EQ.bomba, "BP-201", "Bomba de Polpa 201", SGI_LOC.caldeiraria, {
    equnr: "10001234", fabricante: "KSB", modelo: "MegaCPK 125-250", nserie: "KSB-2019-88231", statusOp: "operando", tplnr: "BR-PNO-CAL-BP201",
    catSap: "M", kostl: "CC-1001", iwerk: "BR01", ingrp: "M01", dataAquis: "2019-03-18", matnr: "MAT-BOMBA-125",
  }),
  equip(SGI_ASSET.m201, EQ.motor, "M-201", "Motor da Bomba de Polpa 201", SGI_LOC.caldeiraria, {
    equnr: "10001235", fabricante: "WEG", modelo: "W22 IR3 75 cv", statusOp: "operando", tplnr: "BR-PNO-CAL-BP201-M", catSap: "E", kostl: "CC-1001",
  }),
  equip(SGI_ASSET.lsl201, EQ.sensor, "LSL-201", "Chave de nível baixo da BP-201", SGI_LOC.caldeiraria, {
    equnr: "10001236", fabricante: "Endress+Hauser", modelo: "Liquiphant FTL51", statusOp: "operando", tplnr: "BR-PNO-CAL-BP201-LSL", catSap: "E",
    protecao: { tipo: "sensor_de_processo", principio: "desliga_equipamento", bypass: "Comando BYPASS LSL201 na tela do DCS, menu Manutenção > Intertravamentos. Requer senha de nível 2.",
      sistema: "DCS Emerson DeltaV v14", classeRisco: "Alto Risco", protegidos: [A(5)] },
  }),
  equip(SGI_ASSET.md101, EQ.motor, "MD-101", "Motor Digestor 101", SGI_LOC.digestores, {
    equnr: "10001300", fabricante: "WEG", modelo: "W22 250 cv", statusOp: "operando", tplnr: "BR-PNO-DIG-MD101", catSap: "E", kostl: "CC-1002",
  }),
  equip(SGI_ASSET.psh101, EQ.sensor, "PSH-101", "Pressostato de alta do Digestor 101", SGI_LOC.digestores, {
    equnr: "10001301", fabricante: "Danfoss", modelo: "KPS 35", statusOp: "operando", catSap: "E",
    protecao: { tipo: "chave_de_seguranca", principio: "emite_alarme_mais_trip", bypass: "Jumper nos bornes X14:1 e X14:2 do painel CA-P01.", sistema: "CLP Allen-Bradley ControlLogix L85E", classeRisco: "Crítico", protegidos: [] },
  }),
  equip(SGI_ASSET.bl301, EQ.bomba, "BL-301", "Bomba Lavagem 301", SGI_LOC.lavagem, {
    equnr: "10001355", fabricante: "Sulzer", modelo: "AHLSTAR A", statusOp: "em_manutencao", tplnr: "BR-PNO-LAV-BL301", catSap: "M", kostl: "CC-1003",
  }),
  equip(SGI_ASSET.ca401, EQ.compressor, "CA-401", "Compressor Ar 401", SGI_LOC.recuperacao, {
    equnr: "10001500", fabricante: "Atlas Copco", modelo: "GA 90", statusOp: "operando", tplnr: "BR-PNO-REC-CA401", catSap: "M", kostl: "CC-1004",
  }),
  equip(SGI_ASSET.xv401, EQ.valvula, "XV-401", "Válvula de bloqueio do CA-401", SGI_LOC.recuperacao, {
    equnr: "10001501", fabricante: "Fisher", statusOp: "operando", catSap: "M",
    protecao: { tipo: "valvula_de_bloqueio", principio: "fecha_valvula", bypass: "Travar a XV-401 aberta com dispositivo mecânico do kit de bypass.", sistema: "CLP Siemens S7-1500", classeRisco: "Classe 1", protegidos: [] },
  }),
  equip(SGI_ASSET.cald01, EQ.caldeira, "CALD-01", "Caldeira de Recuperação 01", SGI_LOC.recuperacao, {
    equnr: "10001520", fabricante: "Valmet", statusOp: "operando", tplnr: "BR-PNO-REC-CALD01", catSap: "M", kostl: "CC-1004", dataAquis: "2012-08-01",
  }),
  equip(SGI_ASSET.mo01, EQ.moinho, "MO-01", "Moinho Principal 01", SGI_LOC.moagem, {
    equnr: "20001100", fabricante: "Metso", statusOp: "operando", tplnr: "BR-PSU-MOA-MO01", catSap: "M", kostl: "CC-2001",
  }),
  equip(SGI_ASSET.ag02, EQ.agitador, "AG-002", "Agitador Polpa 02", SGI_LOC.moagem, {
    equnr: "20001255", fabricante: "Sulzer", statusOp: "parado", tplnr: "BR-PSU-MOA-AG002", catSap: "M", kostl: "CC-2001",
  }),
  equip(SGI_ASSET.fp01, EQ.filtro, "FP-01", "Filtro Prensa 01", SGI_LOC.filtracao, {
    equnr: "20001200", fabricante: "Andritz", statusOp: "operando", tplnr: "BR-PSU-FIL-FP01", catSap: "M", kostl: "CC-2002",
  }),
]

const relationKinds = seed.relationKinds
const partOf = relationKinds.find((k) => k.systemKey === PART_OF_KEY)!.id
const relations: AssetRelation[] = [
  // Equipamentos aninhados: o motor e a chave de nível são parte da bomba; o pressostato, do motor do digestor.
  { id: R(1), fromId: SGI_ASSET.m201, toId: SGI_ASSET.bp201, kindId: partOf },
  { id: R(2), fromId: SGI_ASSET.lsl201, toId: SGI_ASSET.bp201, kindId: partOf },
  { id: R(3), fromId: SGI_ASSET.psh101, toId: SGI_ASSET.md101, kindId: partOf },
  { id: R(4), fromId: SGI_ASSET.xv401, toId: SGI_ASSET.ca401, kindId: partOf },
  // Outras relações (não aninham): a caldeira abastece o compressor.
  { id: R(5), fromId: SGI_ASSET.cald01, toId: SGI_ASSET.ca401, kindId: ID.relationKind.abastece },
]

/** Cargos com escopo nos locais antigos passam para as áreas equivalentes daqui. */
const SCOPE: Record<string, string> = { [ID.loc(2)]: SGI_LOC.caldeiraria, [ID.loc(7)]: SGI_LOC.moagem }
/** Tipos de ativo antigos que deixaram de existir → o tipo de equipamento mais próximo. */
const ASSET_TYPE: Record<string, string> = { [ID.assetType.modulo]: EQ.painel, [ID.assetType.alim]: EQ.painel }
const uniq = (xs: string[]) => [...new Set(xs)]

/**
 * Aprovações administrativas nominais e delegáveis (SGI · Aprovação › Delegações): uma etapa livre antes da
 * Emissão nos modelos ativos, com aprovadora nominal e cargo de supervisão. Marina e Joana supervisionam a
 * unidade toda; Rafael supervisiona só a Planta Norte — só recebe delegação com escopo nela.
 */
export const SGI_APPROVAL = {
  vapor: { versionId: ID.version.vapor1, stageId: seedUuid(0x0050, 0x101), slotId: seedUuid(0x0060, 0x101), personId: ID.person.joana, meaning: "Aprova a soldagem (gerência da área)" },
  painel: { versionId: ID.version.painel2, stageId: seedUuid(0x0050, 0x102), slotId: seedUuid(0x0060, 0x102), personId: ID.person.marina, meaning: "Autoriza a intervenção (gerência)" },
} as const
const approvalOf = (versionId: string) => Object.values(SGI_APPROVAL).find((a) => a.versionId === versionId)
const withApproval = (v: PermitTemplate["versions"][number]): PermitTemplate["versions"][number] => {
  const a = approvalOf(v.id)
  if (!a) return v
  const at = v.stages.findIndex((st) => st.kind === "emissao")
  const stage = { id: a.stageId, name: "Aprovação da gerência", slots: [{ id: a.slotId, meaning: a.meaning, kind: "pessoa" as const, roleIds: [ID.role.sup], personId: a.personId, min: 1, required: true, delegable: true }] }
  return { ...v, stages: [...v.stages.slice(0, at), stage, ...v.stages.slice(at)] }
}
/** Escopo dos cargos para o exemplo de delegação (ver SGI_APPROVAL). */
const roleScope = (personId: string, r: RoleAssignment): RoleAssignment => {
  if (r.roleId === ID.role.sup && (personId === ID.person.marina || personId === ID.person.joana)) return { ...r, scopeLocationId: null }
  return { ...r, scopeLocationId: r.scopeLocationId ? SCOPE[r.scopeLocationId] ?? SGI_LOC.norte : null }
}
const extraRoles: Record<string, RoleAssignment[]> = {
  [ID.person.rafael]: [{ id: ID.personRole("rafael", 2), roleId: ID.role.sup, scopeLocationId: SGI_LOC.norte, validUntil: "2027-06-30" }],
}

export const sgiSeed: RegistryState = {
  ...seed,
  locationTypes,
  assetTypes,
  relationKinds,
  locations,
  assets,
  relations,
  people: seed.people.map((p) => ({ ...p, roles: [...p.roles.map((r) => roleScope(p.id, r)), ...(extraRoles[p.id] ?? [])] })),
  // Os modelos passam a aceitar PTs em áreas e nos tipos de equipamento correspondentes.
  templates: seed.templates.map((t) => ({
    ...t,
    versions: t.versions.map((v) => withApproval({ ...v, locationTypeIds: [SGI_TYPE.area], assetTypeIds: uniq(v.assetTypeIds.map((id) => ASSET_TYPE[id] ?? id)) })),
  })),
}
