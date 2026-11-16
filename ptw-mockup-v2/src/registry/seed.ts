import { ID, LIST_LABELS } from "./seedIds.ts"
import { seedTemplates } from "./seedModelos"
import { PART_OF_KEY, type OptionList, type Origin, type Person, type RegistryState, type RoleAssignment, type Status } from "./types"

/** Kept for older imports; the form item ids live with the models (seedModelos). */
export { itemId } from "./seedModelos"

/** Fixed "today" (plant time zone) so the sample validity states are stable. */
export const TODAY = "2026-11-06"
const U = ID.unit
/** When the sample registry was last written (instant with offset, as the database returns it). */
const T = "2026-11-06T09:00:00-03:00"
const P = ID.person

const base = (id: string, origin: Origin = "manual", status: Status = "ativo") => ({
  id,
  unitId: U,
  revision: 1,
  updatedAt: T,
  origin,
  status,
})

/** Identity and account of a person; `login` null = contact (does not sign). */
const account = (name: string, company: string, employeeId: string, login: string | null, accountExpires: string | null = null): Pick<Person, "name" | "company" | "employeeId" | "login" | "enabled" | "accountExpires" | "adObjectGuid"> =>
  ({ name, company, employeeId, login, enabled: true, accountExpires, adObjectGuid: null })

const role = (who: keyof typeof ID.person, n: number, roleId: string, scopeLocationId: string | null, validUntil: string): RoleAssignment =>
  ({ id: ID.personRole(who, n), roleId, scopeLocationId, validUntil })

/** A sample list: item ids fixed by position (seedIds). */
const list = (key: keyof typeof LIST_LABELS, name: string): OptionList => ({
  id: ID.list[key], name, revision: 1, updatedAt: T,
  items: LIST_LABELS[key].map((label) => ({ id: ID.listItem(key, label), label, active: true })),
})

export const seed: RegistryState = {
  units: [{ id: U, code: "UN-01", name: "Unidade piloto (exemplo)", timezone: "America/Sao_Paulo" }],
  locationTypes: [
    { id: ID.locationType.predio, label: "Prédio", icon: "predio", active: true },
    { id: ID.locationType.area, label: "Área", icon: "area", active: true },
    { id: ID.locationType.linha, label: "Linha", icon: "linha", active: true },
    { id: ID.locationType.sala, label: "Sala", icon: "sala", active: true },
    { id: ID.locationType.zona, label: "Zona", icon: "zona", active: true },
    { id: ID.locationType.ponto, label: "Ponto de trabalho", icon: "ponto", active: true },
  ],
  roleTypes: [
    { id: ID.role.lider, label: "Líder de equipe", active: true },
    { id: ID.role.exec, label: "Executante", active: true },
    { id: ID.role.tec, label: "Técnico de manutenção", active: true },
    { id: ID.role.sup, label: "Supervisora de área", active: true },
  ],
  assetTypes: [
    { id: ID.assetType.painel, label: "Painel / CCM", icon: "eletrico", active: true },
    { id: ID.assetType.modulo, label: "Módulo / gaveta", icon: "eletrico", active: true },
    { id: ID.assetType.alim, label: "Alimentador", icon: "cabo", active: true },
    { id: ID.assetType.motor, label: "Motor", icon: "motor", active: true },
    { id: ID.assetType.tubo, label: "Tubulação", icon: "tubulacao", active: true },
    { id: ID.assetType.valv, label: "Válvula", icon: "tubulacao", active: true },
    { id: ID.assetType.cald, label: "Caldeira", icon: "caldeira", active: true },
  ],
  relationKinds: [
    { id: ID.relationKind.alimenta, label: "alimenta", active: true },
    { id: ID.relationKind.isola, label: "isola", active: true },
    { id: ID.relationKind.abastece, label: "abastece", active: true },
    { id: ID.relationKind.parte, label: "é parte de", systemKey: PART_OF_KEY, active: true },
  ],
  locations: [
    { ...base(ID.loc(1)), parentId: null, typeId: ID.locationType.predio, code: "PRD-01", name: "Prédio de Produção", aliases: ["Galpão 1"] },
    { ...base(ID.loc(2)), parentId: ID.loc(1), typeId: ID.locationType.linha, code: "L02", name: "Linha 02", aliases: ["Linha dois"] },
    { ...base(ID.loc(3)), parentId: ID.loc(2), typeId: ID.locationType.sala, code: "L02-SE", name: "Sala CCM Linha 02", aliases: ["Sala elétrica L2"] },
    { ...base(ID.loc(4)), parentId: ID.loc(3), typeId: ID.locationType.ponto, code: "L02-SE-C03", name: "Coluna C03 do CCM", aliases: [] },
    { ...base(ID.loc(5)), parentId: ID.loc(2), typeId: ID.locationType.zona, code: "L02-ENV", name: "Zona de envase", aliases: ["Envase"] },
    { ...base(ID.loc(6), "csv", "em_revisao"), parentId: ID.loc(2), typeId: ID.locationType.zona, code: "L02-COB", name: "Cobertura da Linha 02", aliases: [] },
    { ...base(ID.loc(7)), parentId: null, typeId: ID.locationType.area, code: "UTL", name: "Utilidades", aliases: [] },
    { ...base(ID.loc(8)), parentId: ID.loc(7), typeId: ID.locationType.sala, code: "UTL-CAL", name: "Casa de caldeira", aliases: ["Caldeiraria"] },
    { ...base(ID.loc(9)), parentId: ID.loc(8), typeId: ID.locationType.ponto, code: "UTL-CAL-VB", name: "Trecho B da linha de vapor", aliases: [] },
    { ...base(ID.loc(10)), parentId: null, typeId: ID.locationType.predio, code: "ELC", name: "Eletrocentro", aliases: [] },
    { ...base(ID.loc(11), "manual", "inativo"), parentId: ID.loc(10), typeId: ID.locationType.sala, code: "ELC-MT", name: "Sala de painéis MT (desativada)", aliases: [] },
    { ...base(ID.loc(12)), parentId: ID.loc(10), typeId: ID.locationType.sala, code: "ELC-BT", name: "Sala de painéis BT", aliases: [] },
    { ...base(ID.loc(13)), parentId: ID.loc(3), typeId: ID.locationType.ponto, code: "L02-SE-K01", name: "Coluna K01 do CCM-L2-02", aliases: [] },
    { ...base(ID.loc(14)), parentId: ID.loc(3), typeId: ID.locationType.ponto, code: "L02-SE-K02", name: "Coluna K02 do CCM-L2-02", aliases: [] },
    { ...base(ID.loc(15)), parentId: ID.loc(5), typeId: ID.locationType.sala, code: "L02-ENV-QF", name: "Sala do quadro de força do envase", aliases: ["Salinha do envase"] },
    { ...base(ID.loc(16)), parentId: ID.loc(8), typeId: ID.locationType.ponto, code: "UTL-CAL-VA", name: "Trecho A da linha de vapor", aliases: ["Linha de vapor da lavadora"] },
  ],
  assets: [
    { ...base(ID.asset(1)), typeId: ID.assetType.painel, code: "CCM-L2-01", name: "CCM da Linha 02", aliases: ["CCM2", "Painel 14"], locationIds: [ID.loc(3)] },
    { ...base(ID.asset(2)), typeId: ID.assetType.modulo, code: "CCM-L2-01.C03", name: "Gaveta C03 – partida do M-201", aliases: [], locationIds: [ID.loc(4)] },
    { ...base(ID.asset(3)), typeId: ID.assetType.alim, code: "DJ-QGBT-14", name: "Disjuntor de alimentação do CCM2", aliases: ["Disjuntor geral CCM2"], locationIds: [ID.loc(12)] },
    { ...base(ID.asset(4), "csv"), typeId: ID.assetType.motor, code: "M-201", name: "Motor da transportadora de envase", aliases: [], locationIds: [ID.loc(5)] },
    { ...base(ID.asset(5)), typeId: ID.assetType.tubo, code: "VAP-3B", name: "Tubulação de vapor 3\" – trecho B", aliases: ["Linha vapor B"], locationIds: [ID.loc(9), ID.loc(5)] },
    { ...base(ID.asset(6), "sugerida", "em_revisao"), typeId: ID.assetType.valv, code: "XV-312", name: "Válvula de bloqueio do vapor", aliases: [], locationIds: [ID.loc(9)] },
    { ...base(ID.asset(7)), typeId: ID.assetType.cald, code: "CALD-01", name: "Caldeira 1", aliases: [], locationIds: [ID.loc(8)] },
    { ...base(ID.asset(8)), typeId: ID.assetType.painel, code: "CCM-L2-02", name: "CCM 2 da Linha 02 (utilidades)", aliases: ["CCM utilidades L2", "Painel 15"], locationIds: [ID.loc(3)] },
    { ...base(ID.asset(9)), typeId: ID.assetType.modulo, code: "CCM-L2-02.K01", name: "Gaveta K01 – partida da bomba P-202", aliases: [], locationIds: [ID.loc(13)] },
    { ...base(ID.asset(10)), typeId: ID.assetType.modulo, code: "CCM-L2-02.K02", name: "Gaveta K02 – partida do exaustor EX-205", aliases: [], locationIds: [ID.loc(14)] },
    { ...base(ID.asset(11), "csv"), typeId: ID.assetType.motor, code: "P-202", name: "Bomba de água gelada do envase", aliases: ["Bomba 202"], locationIds: [ID.loc(5)] },
    { ...base(ID.asset(12)), typeId: ID.assetType.painel, code: "QF-ENV-01", name: "Quadro de força do envase", aliases: ["QF envase"], locationIds: [ID.loc(15)] },
    { ...base(ID.asset(13)), typeId: ID.assetType.painel, code: "QD-L2-ILU", name: "Quadro de iluminação da Linha 02", aliases: ["QDL L2"], locationIds: [ID.loc(3)] },
    { ...base(ID.asset(14)), typeId: ID.assetType.tubo, code: "VAP-4A", name: "Tubulação de vapor 4\" – trecho A", aliases: ["Linha vapor A"], locationIds: [ID.loc(16)] },
    { ...base(ID.asset(15)), typeId: ID.assetType.valv, code: "XV-410", name: "Válvula de bloqueio do trecho A", aliases: ["Válvula da lavadora"], locationIds: [ID.loc(16)] },
  ],
  relations: [
    { id: ID.rel(1), fromId: ID.asset(3), toId: ID.asset(1), kindId: ID.relationKind.alimenta },
    { id: ID.rel(2), fromId: ID.asset(2), toId: ID.asset(1), kindId: ID.relationKind.parte },
    { id: ID.rel(3), fromId: ID.asset(2), toId: ID.asset(4), kindId: ID.relationKind.alimenta },
    { id: ID.rel(4), fromId: ID.asset(6), toId: ID.asset(5), kindId: ID.relationKind.isola },
    { id: ID.rel(5), fromId: ID.asset(7), toId: ID.asset(5), kindId: ID.relationKind.abastece },
    { id: ID.rel(6), fromId: ID.asset(9), toId: ID.asset(8), kindId: ID.relationKind.parte },
    { id: ID.rel(7), fromId: ID.asset(10), toId: ID.asset(8), kindId: ID.relationKind.parte },
    { id: ID.rel(8), fromId: ID.asset(9), toId: ID.asset(11), kindId: ID.relationKind.alimenta },
    { id: ID.rel(9), fromId: ID.asset(15), toId: ID.asset(14), kindId: ID.relationKind.isola },
    { id: ID.rel(10), fromId: ID.asset(7), toId: ID.asset(14), kindId: ID.relationKind.abastece },
  ],
  people: [
    { ...base(P.marina, "ad"), ...account("Marina Costa", "Fábrica Piloto", "E-1001", "marina.costa"), roles: [role("marina", 1, ID.role.sup, ID.loc(2), "2027-06-30")] },
    { ...base(P.rafael, "ad"), ...account("Rafael Nunes", "Fábrica Piloto", "E-1002", "rafael.nunes"), roles: [role("rafael", 1, ID.role.tec, null, "2027-06-30")] },
    // A contractor: the account ends with the contract (last day 31/12/2026, so it stops at the start of 01/01/2027).
    { ...base(P.paulo, "ad"), ...account("Paulo Lima", "Elétrica Exemplo", "C-2001", "paulo.lima", "2027-01-01T00:00:00-03:00"), roles: [role("paulo", 1, ID.role.lider, ID.loc(2), "2026-12-31")] },
    { ...base(P.ana, "csv", "em_revisao"), ...account("Ana Prado", "Elétrica Exemplo", "C-2002", null), roles: [role("ana", 1, ID.role.exec, ID.loc(2), "2026-12-31")] },
    { ...base(P.carlos), ...account("Carlos Mota", "Soldagem Exemplo", "C-3001", null), roles: [role("carlos", 1, ID.role.exec, ID.loc(7), "2026-12-31")] },
    { ...base(P.beatriz, "ad"), ...account("Beatriz Souza", "Fábrica Piloto", "E-1006", "beatriz.souza"), roles: [role("beatriz", 1, ID.role.lider, ID.loc(7), "2027-06-30")] },
    { ...base(P.joana, "ad"), ...account("Joana Reis", "Fábrica Piloto", "E-1007", "joana.reis"), roles: [role("joana", 1, ID.role.sup, ID.loc(7), "2027-06-30")] },
    { ...base(P.diego, "csv"), ...account("Diego Alves", "Elétrica Exemplo", "C-2003", null), roles: [role("diego", 1, ID.role.exec, ID.loc(2), "2026-12-31")] },
    { ...base(P.luis), ...account("Luís Ferraz", "Fábrica Piloto", "E-1009", "luis.ferraz"), roles: [] },
    // Holds both sides of "Registra ≠ Verifica o isolamento" at Linha 02, so the separation rule
    // can be seen working: once he signs one side, the other side refuses him.
    { ...base(P.sergio, "ad"), ...account("Sérgio Dias", "Fábrica Piloto", "E-1010", "sergio.dias"), roles: [role("sergio", 1, ID.role.tec, ID.loc(2), "2027-06-30"), role("sergio", 2, ID.role.lider, ID.loc(2), "2027-06-30")] },
  ],
  optionLists: [
    list("epi", "EPI"),
    list("perigos", "Perigos"),
    list("docs", "Documentos com a PT"),
    list("trabalho", "Tipos de trabalho"),
    list("simna", "SIM / N.A."),
  ],
  templates: seedTemplates,
}
