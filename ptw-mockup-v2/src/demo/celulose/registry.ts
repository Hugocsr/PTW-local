/**
 * The pulp mill's registry as it stood before the interlock model was imported: places, assets with
 * their "parte de" hierarchy, people and cargos, lists and the plant's own models. All names and tags
 * are fictional.
 */
import { PART_OF_KEY, type Asset, type Location, type Origin, type Person, type RegistryState, type RoleAssignment, type Status, type TypeDef } from "@/registry/types"
import { C, type PersonKey } from "./ids"
import { celuloseLists, LIST_LABELS, workTypeId } from "./lists"
import { celuloseTemplates } from "./modelos"
import { demoTemplates } from "./modelosDemo"

const U = C.unit
const T = "2026-11-02T08:00:00-03:00"
const base = (id: string, origin: Origin = "manual", status: Status = "ativo") => ({ id, unitId: U, revision: 1, updatedAt: T, origin, status })

const LT = C.locationType
/** n, parent, type, code, name, aliases */
const LOCS: [number, number | null, string, string, string, string[]][] = [
  [1, null, LT.patio, "MAD", "Pátio de madeira e picagem", ["Pátio de toras"]],
  [2, null, LT.area, "DIG", "Digestor contínuo", ["Cozimento"]],
  [3, null, LT.area, "LAV", "Lavagem e depuração", ["Linha marrom"]],
  [4, null, LT.area, "BRQ", "Deslignificação e branqueamento", ["Branqueamento", "Planta de ClO₂"]],
  [5, null, LT.area, "EVP", "Evaporação", []],
  [6, null, LT.area, "CRC", "Caldeira de recuperação", ["CR"]],
  [7, null, LT.area, "CFB", "Caldeira de força (biomassa)", ["Caldeira de biomassa"]],
  [8, null, LT.area, "CAU", "Caustificação e forno de cal", ["Recaustificação"]],
  [9, null, LT.area, "MSC", "Máquina de secagem", ["Secagem", "Enfardamento"]],
  [10, null, LT.area, "UTL", "Utilidades (ar comprimido e água)", ["Utilidades"]],
  [11, null, LT.area, "ETE", "Estação de tratamento de efluentes", ["Efluentes"]],
  [12, null, LT.area, "SEP", "Subestação principal", ["SE principal"]],
  [13, 1, LT.sala, "MAD-PIC", "Casa do picador", []],
  [14, 2, LT.ponto, "DIG-TOPO", "Topo do digestor – elevação 62 m", []],
  [15, 2, LT.ponto, "DIG-BASE", "Base do digestor e bombas de circulação", []],
  [16, 3, LT.ponto, "LAV-TQ", "Área dos tanques de filtrado", []],
  [17, 4, LT.sala, "BRQ-CLO2", "Planta de dióxido de cloro", ["Casa do gerador de ClO₂"]],
  [18, 5, LT.sala, "EVP-SE", "Sala elétrica da evaporação", []],
  [19, 6, LT.ponto, "CRC-TUB", "Elevação 54 m – tubulão", []],
  [20, 6, LT.sala, "CRC-VENT", "Casa de ventiladores da caldeira de recuperação", []],
  [21, 7, LT.ponto, "CFB-VTI", "Duto do ventilador de tiragem induzida – elevação 18 m", []],
  [22, 8, LT.ponto, "CAU-FC", "Queimador do forno de cal", []],
  [23, 9, LT.ponto, "MSC-SEC", "Secador da máquina de secagem", []],
  [24, 10, LT.sala, "UTL-AC", "Casa de compressores", []],
  [25, 11, LT.ponto, "ETE-AER", "Tanques de aeração", []],
  [26, 11, LT.ponto, "ETE-SAI", "Calha de saída do efluente tratado", []],
  [27, 12, LT.patio, "SEP-138", "Pátio de 138 kV", []],
  [28, 12, LT.sala, "SEP-SALA", "Sala de painéis 13,8 kV", []],
  [29, 2, LT.ponto, "DIG-LB", "Rack de tubulação do licor branco", []],
]

const AT = C.assetType
/** n, type, tag, name, locations, aliases */
const ASSETS: [number, string, string, string, number[], string[]][] = [
  [1, AT.maq, "PC-01", "Picador de toras", [13], ["Picador 1"]],
  [2, AT.motor, "M-PC-01", "Motor do picador (1.500 kW)", [13], []],
  [3, AT.transp, "TC-101", "Transportador de cavacos", [1], ["Correia 101"]],
  [4, AT.vaso, "DG-01", "Digestor contínuo", [2, 14, 15], ["Digestor"]],
  [5, AT.bomba, "B-DG-01", "Bomba de circulação superior do digestor", [15], []],
  [6, AT.bomba, "B-DG-02", "Bomba de circulação inferior do digestor", [15], []],
  [7, AT.tubo, "LB-204", "Linha de licor branco para o digestor (6\")", [29], ["Linha de licor branco"]],
  [8, AT.tanque, "TQ-312", "Tanque de filtrado da lavagem", [16], []],
  [9, AT.bomba, "B-312", "Bomba de filtrado", [16], []],
  [10, AT.vaso, "GE-CLO2", "Gerador de dióxido de cloro", [17], ["Gerador de ClO₂"]],
  [11, AT.tanque, "TQ-CLO2", "Tanque de estocagem de ClO₂", [17], []],
  [12, AT.evap, "EV-01", "Evaporador – 1º efeito", [5], []],
  [13, AT.tanque, "TQ-LP", "Tanque de licor preto forte", [5], []],
  [14, AT.painel, "CCM-EVP-01", "CCM da evaporação", [18], []],
  [15, AT.gaveta, "CCM-EVP-01.G05", "Gaveta G05 – partida da bomba B-EV-05", [18], []],
  [16, AT.bomba, "B-EV-05", "Bomba de licor preto fraco", [5], []],
  [17, AT.cald, "CR-01", "Caldeira de recuperação", [6], ["Caldeira de recuperação química"]],
  [18, AT.vaso, "CR-01-TB", "Tubulão superior da caldeira de recuperação", [19], ["Tubulão"]],
  [19, AT.soprador, "CR-01-SF", "Sopradores de fuligem da caldeira de recuperação", [6], ["Ramonadores"]],
  [20, AT.vent, "CR-01-VTF", "Ventilador de tiragem forçada", [20], []],
  [21, AT.vent, "CR-01-VTI", "Ventilador de tiragem induzida", [20], []],
  [22, AT.precip, "CR-01-PE", "Precipitador eletrostático", [6], []],
  [23, AT.cald, "CF-01", "Caldeira de força a biomassa", [7], []],
  [24, AT.vent, "CF-01-VTI", "Ventilador de tiragem induzida da caldeira de força", [21], []],
  [25, AT.forno, "FC-01", "Forno de cal", [8, 22], []],
  [26, AT.bomba, "B-CAU-07", "Bomba de lama de cal", [8], []],
  [27, AT.tanque, "CL-01", "Clarificador de licor branco", [8], []],
  [28, AT.maq, "MS-01", "Máquina de secagem", [9], ["Secadora"]],
  [29, AT.maq, "MS-01-SEC", "Secador da máquina de secagem", [23], []],
  [30, AT.comp, "CP-01", "Compressor de ar de serviço 1", [24], []],
  [31, AT.comp, "CP-02", "Compressor de ar de instrumentos 2", [24], []],
  [32, AT.tanque, "TQ-AER-01", "Tanque de aeração 1", [25], []],
  [33, AT.inst, "AT-ETE-02", "Analisador de pH do efluente tratado", [26], ["pHmetro da saída"]],
  [34, AT.trafo, "TR-01", "Transformador principal 138/13,8 kV", [27], []],
  [35, AT.painel, "PN-13.8-01", "Painel de média tensão 13,8 kV", [28], []],
  [36, AT.bomba, "B-ETA-01", "Bomba de captação de água bruta", [10], []],
]

const K = C.relationKind
/** from, to, kind ("parte de": from is part of to). */
const RELS: [number, number, string][] = [
  [2, 1, K.parte], [5, 4, K.parte], [6, 4, K.parte], [7, 4, K.abastece], [9, 8, K.abastece],
  [11, 10, K.abastece], [13, 12, K.abastece], [15, 14, K.parte], [15, 16, K.alimenta],
  [18, 17, K.parte], [19, 17, K.parte], [20, 17, K.parte], [21, 17, K.parte], [22, 17, K.parte],
  [24, 23, K.parte], [29, 28, K.parte], [35, 34, K.alimenta], [14, 35, K.alimenta], [33, 32, K.protege], [31, 30, K.protege],
]

const R = C.role
const FIBRAS = [1, 2, 3, 4].map(C.loc)
const RECUPERACAO = [5, 6, 7, 8].map(C.loc)

type P = { key: PersonKey; name: string; company: string; employeeId: string; login: string | null; accountExpires?: string; origin?: Origin; roles: [string, number | null, string][] }
/** Cargos: [cargo, scope location n (null = the whole unit), last valid day]. */
const PEOPLE_DATA: P[] = [
  { key: "ricardo", name: "Ricardo Almeida", company: "Celulose Demo", employeeId: "E-3101", login: "ricardo.almeida", origin: "ad", roles: [[R.supTurno, null, "2027-06-30"]] },
  { key: "aline", name: "Aline Castro", company: "Celulose Demo", employeeId: "E-3102", login: "aline.castro", origin: "ad", roles: [[R.supTurno, null, "2027-06-30"]] },
  { key: "fernanda", name: "Fernanda Rocha", company: "Celulose Demo", employeeId: "E-3103", login: "fernanda.rocha", origin: "ad", roles: [[R.gerArea, 5, "2027-12-31"], [R.gerArea, 6, "2027-12-31"], [R.gerArea, 7, "2027-12-31"], [R.gerArea, 8, "2027-12-31"], [R.gerArea, 10, "2027-12-31"]] },
  { key: "lucas", name: "Lucas Pereira", company: "Celulose Demo", employeeId: "E-3104", login: "lucas.pereira", origin: "ad", roles: [[R.tecMec, null, "2027-03-31"]] },
  { key: "juliana", name: "Juliana Martins", company: "Celulose Demo", employeeId: "E-3105", login: "juliana.martins", origin: "ad", roles: [[R.tecEle, null, "2027-03-31"]] },
  { key: "andre", name: "André Souza", company: "Celulose Demo", employeeId: "E-3106", login: "andre.souza", origin: "ad", roles: [[R.tecIns, null, "2027-03-31"]] },
  { key: "patricia", name: "Patrícia Lima", company: "Celulose Demo", employeeId: "E-3107", login: "patricia.lima", origin: "ad", roles: [1, 2, 3, 4].map((n) => [R.operador, n, "2027-06-30"] as [string, number, string]) },
  // Recycling of NR-13 due this month: the cargo ends on 20/11.
  { key: "gustavo", name: "Gustavo Teixeira", company: "Celulose Demo", employeeId: "E-3108", login: "gustavo.teixeira", origin: "ad", roles: [5, 6, 7, 8].map((n) => [R.operador, n, "2026-11-20"] as [string, number, string]) },
  { key: "marcos", name: "Marcos Oliveira", company: "Celulose Demo", employeeId: "E-3109", login: "marcos.oliveira", origin: "ad", roles: [[R.coordMan, null, "2027-12-31"]] },
  { key: "camila", name: "Camila Ferreira", company: "Celulose Demo", employeeId: "E-3110", login: "camila.ferreira", origin: "ad", roles: [5, 6, 7, 8].map((n) => [R.coordArea, n, "2027-12-31"] as [string, number, string]) },
  { key: "roberto", name: "Roberto Gomes", company: "Celulose Demo", employeeId: "E-3111", login: "roberto.gomes", origin: "ad", roles: [[R.gerMan, null, "2027-12-31"]] },
  { key: "helena", name: "Helena Duarte", company: "Celulose Demo", employeeId: "E-3112", login: "helena.duarte", origin: "ad", roles: [[R.gerInd, null, "2027-12-31"]] },
  { key: "thiago", name: "Thiago Barbosa", company: "Celulose Demo", employeeId: "E-3113", login: "thiago.barbosa", origin: "ad", roles: [[R.espOp, null, "2027-06-30"]] },
  { key: "renata", name: "Renata Campos", company: "Celulose Demo", employeeId: "E-3114", login: "renata.campos", origin: "ad", roles: [[R.espMan, null, "2027-06-30"]] },
  { key: "eduardo", name: "Eduardo Nunes", company: "Celulose Demo", employeeId: "E-3115", login: "eduardo.nunes", origin: "ad", roles: [[R.tecSeg, null, "2027-03-31"]] },
  // Contractors: a vigia without login (named on the PT, does not sign), a team leader whose account
  // ends with the contract, and an executante whose cargo expired last week (not eligible).
  { key: "jose", name: "José Carvalho", company: "Serviços Tibagi (contratada)", employeeId: "C-7201", login: null, origin: "csv", roles: [[R.vigia, null, "2026-12-31"]] },
  { key: "sandro", name: "Sandro Ribeiro", company: "Montagens Serra (contratada)", employeeId: "C-7301", login: "sandro.ribeiro", accountExpires: "2026-12-01T00:00:00-03:00", origin: "csv", roles: [[R.lider, null, "2026-11-30"]] },
  { key: "diego", name: "Diego Moura", company: "Montagens Serra (contratada)", employeeId: "C-7302", login: null, origin: "csv", roles: [[R.exec, null, "2026-11-05"]] },
  { key: "luciana", name: "Luciana Prado", company: "Celulose Demo", employeeId: "E-3119", login: "luciana.prado", origin: "ad", roles: [] },
]

const people: Person[] = PEOPLE_DATA.map((p) => ({
  ...base(C.person[p.key], p.origin),
  name: p.name, company: p.company, employeeId: p.employeeId, login: p.login, enabled: true, accountExpires: p.accountExpires ?? null, adObjectGuid: null,
  roles: p.roles.map(([roleId, scope, validUntil], i): RoleAssignment => ({ id: C.personRole(p.key, i + 1), roleId, scopeLocationId: scope === null ? null : C.loc(scope), validUntil })),
}))

export const celuloseRegistry: RegistryState = {
  units: [{ id: U, code: "CEL-01", name: "Fábrica de celulose · demonstração", timezone: "America/Sao_Paulo" }],
  locationTypes: [
    { id: LT.area, label: "Área de processo", icon: "fabrica", active: true },
    { id: LT.sala, label: "Sala", icon: "sala", active: true },
    { id: LT.ponto, label: "Ponto de trabalho", icon: "ponto", active: true },
    { id: LT.patio, label: "Pátio", icon: "zona", active: true },
  ],
  roleTypes: [
    { id: R.operador, label: "Operador de área", active: true },
    { id: R.tecMec, label: "Técnico de manutenção mecânica", active: true },
    { id: R.tecEle, label: "Técnico de manutenção elétrica", active: true },
    { id: R.tecIns, label: "Técnico de instrumentação", active: true },
    { id: R.supTurno, label: "Supervisor de turno", active: true },
    { id: R.coordMan, label: "Coordenador de manutenção", active: true },
    { id: R.coordArea, label: "Coordenador da área", active: true },
    { id: R.gerArea, label: "Gerente da área", active: true },
    { id: R.gerMan, label: "Gerente de manutenção", active: true },
    { id: R.gerInd, label: "Gerente industrial", active: true },
    { id: R.espOp, label: "Especialista de operação", active: true },
    { id: R.espMan, label: "Especialista de manutenção", active: true },
    { id: R.tecSeg, label: "Técnico de segurança do trabalho", active: true },
    { id: R.vigia, label: "Vigia", active: true },
    { id: R.lider, label: "Líder de equipe (contratada)", active: true },
    { id: R.exec, label: "Executante (contratada)", active: true },
  ],
  assetTypes: [
    { id: AT.vaso, label: "Vaso de pressão", icon: "tanque", active: true },
    { id: AT.tanque, label: "Tanque", icon: "tanque", active: true },
    { id: AT.bomba, label: "Bomba", icon: "bomba", active: true },
    { id: AT.motor, label: "Motor elétrico", icon: "motor", active: true },
    { id: AT.cald, label: "Caldeira", icon: "caldeira", active: true },
    { id: AT.vent, label: "Ventilador", icon: "ventilador", active: true },
    { id: AT.soprador, label: "Soprador de fuligem", icon: "compressor", active: true },
    { id: AT.comp, label: "Compressor de ar", icon: "compressor", active: true },
    { id: AT.painel, label: "Painel / CCM", icon: "eletrico", active: true },
    { id: AT.gaveta, label: "Gaveta de CCM", icon: "eletrico", active: true },
    { id: AT.trafo, label: "Transformador", icon: "bateria", active: true },
    { id: AT.tubo, label: "Tubulação", icon: "tubulacao", active: true },
    { id: AT.inst, label: "Instrumento", icon: "medidor", active: true },
    { id: AT.forno, label: "Forno rotativo", icon: "temperatura", active: true },
    { id: AT.maq, label: "Máquina de processo", icon: "fabrica", active: true },
    { id: AT.transp, label: "Transportador", icon: "empilhadeira", active: true },
    { id: AT.evap, label: "Evaporador", icon: "temperatura", active: true },
    { id: AT.precip, label: "Precipitador eletrostático", icon: "antena", active: true },
  ],
  workTypes: LIST_LABELS.trabalho.map((label): TypeDef => ({ id: workTypeId(label), label, active: true })),
  relationKinds: [
    { id: K.alimenta, label: "alimenta", active: true },
    { id: K.abastece, label: "abastece", active: true },
    { id: K.protege, label: "protege / supervisiona", active: true },
    { id: K.parte, label: "é parte de", systemKey: PART_OF_KEY, active: true },
  ],
  locations: LOCS.map(([n, parent, typeId, code, name, aliases]): Location => ({ ...base(C.loc(n)), parentId: parent === null ? null : C.loc(parent), typeId, code, name, aliases })),
  assets: ASSETS.map(([n, typeId, code, name, locs, aliases]): Asset => ({ ...base(C.asset(n), n === 36 ? "csv" : "manual"), typeId, code, name, aliases, locationIds: locs.map(C.loc) })),
  relations: RELS.map(([from, to, kindId], i) => ({ id: C.rel(i + 1), fromId: C.asset(from), toId: C.asset(to), kindId })),
  people,
  optionLists: celuloseLists(T),
  templates: [...celuloseTemplates, ...demoTemplates],
}

export const AREAS = { FIBRAS, RECUPERACAO }
