/**
 * Icons a location or asset type can carry. The type stores the key; the UI maps it to a glyph
 * (`components/shell/TypeIcon.tsx`). A type without a chosen icon gets a guess from its name, so old
 * data and new types still show one.
 *
 * To add an icon: add the key and its label to one group here, and the glyph in `TypeIcon.tsx`
 * (TypeScript refuses a key without a glyph). Keys are stored in the database: never rename or remove one.
 */
export const TYPE_ICON_GROUPS = [
  {
    title: "Locais",
    icons: {
      predio: "Prédio", galpao: "Galpão", fabrica: "Fábrica", area: "Área", linha: "Linha", sala: "Sala", zona: "Zona", ponto: "Ponto",
      andar: "Andar / nível", patio: "Pátio / cercado", doca: "Doca / expedição", almoxarifado: "Almoxarifado", oficina: "Oficina",
      laboratorio: "Laboratório", escritorio: "Escritório", portaria: "Portaria", refeitorio: "Refeitório", ambulatorio: "Ambulatório",
      estacionamento: "Estacionamento", rua: "Rua / via", externa: "Área externa", subestacao: "Subestação / poste", torre: "Torre",
      porto: "Porto / cais", barragem: "Barragem", ponte: "Ponte", obra: "Obra", conteiner: "Contêiner", local: "Genérico (local)",
    },
  },
  {
    title: "Elétrica",
    icons: {
      eletrico: "Elétrico", painel: "Painel / placa", disjuntor: "Disjuntor / chave", tomada: "Tomada", cabo: "Cabo", bateria: "Bateria",
      gerador: "Gerador / combustível", solar: "Painel solar", iluminacao: "Iluminação", carregador: "Carregador",
    },
  },
  {
    title: "Mecânica e processo",
    icons: {
      motor: "Motor", bomba: "Bomba / fluido", tubulacao: "Tubulação", valvula: "Válvula / conexão", tanque: "Tanque / vaso", tambor: "Tambor",
      caldeira: "Caldeira / chama", aquecedor: "Aquecedor", refrigeracao: "Refrigeração", compressor: "Ar / gás", ventilador: "Ventilador",
      exaustao: "Exaustão / duto", filtro: "Filtro", quimico: "Produto químico", balanca: "Balança", icamento: "Içamento / carga",
      ferramenta: "Ferramenta", furadeira: "Máquina-ferramenta",
    },
  },
  {
    title: "Instrumentos e automação",
    icons: {
      medidor: "Medidor", pressao: "Pressão", temperatura: "Temperatura", sensor: "Sensor", instrumento: "Instrumento / sinal",
      clp: "CLP / controlador", robo: "Robô", camera: "Câmera", antena: "Antena", rede: "Rede", servidor: "Servidor", computador: "Computador",
    },
  },
  {
    title: "Segurança e veículos",
    icons: {
      extintor: "Extintor", alarme: "Alarme / sirene", bloqueio: "Bloqueio", radiacao: "Radiação", biologico: "Risco biológico",
      empilhadeira: "Empilhadeira", caminhao: "Caminhão", veiculo: "Veículo", trator: "Trator", trem: "Trem / vagão", ativo: "Genérico (ativo)",
    },
  },
] as const

type Groups = (typeof TYPE_ICON_GROUPS)[number]["icons"]
export type TypeIconKey = Groups extends infer G ? (G extends unknown ? keyof G : never) : never

export const TYPE_ICON_LABEL = Object.assign({}, ...TYPE_ICON_GROUPS.map((g) => g.icons)) as Record<TypeIconKey, string>
export const TYPE_ICON_KEYS = Object.keys(TYPE_ICON_LABEL) as TypeIconKey[]

export const isTypeIconKey = (v: string | null | undefined): v is TypeIconKey => !!v && Object.hasOwn(TYPE_ICON_LABEL, v)

/** Name → icon, first match wins. Checked against the lowercased type name. */
const LOCATION_GUESS: [RegExp, TypeIconKey][] = [
  [/galp/, "galpao"], [/pr[ée]dio|edif/, "predio"], [/f[áa]brica|planta|unidade/, "fabrica"], [/subesta/, "subestacao"],
  [/almox|dep[óo]sito|estoque/, "almoxarifado"], [/oficina/, "oficina"], [/laborat/, "laboratorio"], [/escrit|administra/, "escritorio"],
  [/portaria|guarita/, "portaria"], [/refeit|cozinha/, "refeitorio"], [/ambulat|enfermaria/, "ambulatorio"], [/estaciona/, "estacionamento"],
  [/doca|expedi/, "doca"], [/p[áa]tio/, "patio"], [/andar|piso|n[íi]vel|pavimento/, "andar"], [/torre/, "torre"], [/rua|via|avenida/, "rua"],
  [/[áa]rea/, "area"], [/linha/, "linha"], [/sala|room/, "sala"], [/zona/, "zona"], [/ponto/, "ponto"],
]
const ASSET_GUESS: [RegExp, TypeIconKey][] = [
  [/disjuntor|seccionadora|chave/, "disjuntor"], [/painel|ccm|m[óo]dulo|gaveta|quadro/, "painel"], [/subesta|transformador/, "eletrico"],
  [/alimentador|cabo/, "cabo"], [/gerador/, "gerador"], [/lumin|ilumina/, "iluminacao"], [/motor/, "motor"], [/bomba/, "bomba"],
  [/v[áa]lvula/, "valvula"], [/tubula|linha de/, "tubulacao"], [/tanque|vaso|silo|reator/, "tanque"], [/caldeira|forno|queimador/, "caldeira"],
  [/compressor/, "compressor"], [/ventila/, "ventilador"], [/exaust|duto/, "exaustao"], [/chiller|refriger|resfri/, "refrigeracao"],
  [/filtro/, "filtro"], [/balan[çc]a/, "balanca"], [/ponte rolante|talha|guindaste|guincho/, "icamento"], [/empilhadeira/, "empilhadeira"],
  [/caminh/, "caminhao"], [/transmissor|sensor|detector/, "sensor"], [/man[ôo]metro|pressostato/, "pressao"], [/term[ôo]metro|termopar/, "temperatura"],
  [/medidor|instrumento/, "medidor"], [/clp|plc|controlador/, "clp"], [/rob[ôo]/, "robo"], [/c[âa]mera/, "camera"], [/extintor|hidrante/, "extintor"],
]

/** Best guess from the type's name; used when no icon was chosen. */
export function guessTypeIcon(label: string, family: "locationTypes" | "assetTypes"): TypeIconKey {
  const t = label.toLowerCase()
  const table = family === "locationTypes" ? LOCATION_GUESS : ASSET_GUESS
  return table.find(([re]) => re.test(t))?.[1] ?? (family === "locationTypes" ? "local" : "ativo")
}

export const typeIconKey = (t: { label: string; icon?: string | null } | undefined, family: "locationTypes" | "assetTypes"): TypeIconKey =>
  isTypeIconKey(t?.icon) ? t.icon : guessTypeIcon(t?.label ?? "", family)
