import {
  ActivityIcon, AirVentIcon, AnchorIcon, AntennaIcon, BarrelIcon, BatteryChargingIcon, BeakerIcon, BiohazardIcon, BotIcon, BoxIcon, BoxesIcon,
  BridgeIcon, BriefcaseIcon, Building2Icon, CableIcon, CarIcon, CctvIcon, CircleDotIcon, CircleGaugeIcon, CircuitBoardIcon, CogIcon,
  ConstructionIcon, ContainerIcon, CpuIcon, CylinderIcon, DamIcon, DoorOpenIcon, DrillIcon, DropletsIcon, EvChargerIcon, FactoryIcon, FanIcon,
  FenceIcon, FireExtinguisherIcon, FlameIcon, FlaskConicalIcon, ForkliftIcon, FuelIcon, FunnelIcon, GaugeIcon, HammerIcon, HeartPulseIcon,
  HeaterIcon, LayersIcon, LayoutGridIcon, LightbulbIcon, LockIcon, MapPinIcon, MonitorIcon, NetworkIcon, NutIcon, PackageIcon, PlugIcon,
  PowerIcon, RadarIcon, RadiationIcon, RadioTowerIcon, RouteIcon, ScaleIcon, ServerIcon, ShieldCheckIcon, SirenIcon, SnowflakeIcon,
  SolarPanelIcon, SquareDashedIcon, SquareParkingIcon, ThermometerIcon, TractorIcon, TrainFrontIcon, TreesIcon, TruckIcon, UtensilsIcon,
  UtilityPoleIcon, WarehouseIcon, WavesIcon, WeightIcon, WindIcon, WorkflowIcon, WrenchIcon, ZapIcon, type LucideIcon,
} from "lucide-react"
import { createElement } from "react"
import { byId } from "@/core/indexes"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import { typeIconKey, type TypeIconKey } from "@/registry/typeIcons"
import type { TypeDef } from "@/registry/types"

/** Glyph of each icon key (`registry/typeIcons.ts`). A key without a glyph does not compile. */
export const TYPE_ICON: Record<TypeIconKey, LucideIcon> = {
  predio: Building2Icon, galpao: WarehouseIcon, fabrica: FactoryIcon, area: LayoutGridIcon, linha: WorkflowIcon, sala: DoorOpenIcon,
  zona: SquareDashedIcon, ponto: MapPinIcon, andar: LayersIcon, patio: FenceIcon, doca: BoxesIcon, almoxarifado: PackageIcon, oficina: WrenchIcon,
  laboratorio: FlaskConicalIcon, escritorio: BriefcaseIcon, portaria: ShieldCheckIcon, refeitorio: UtensilsIcon, ambulatorio: HeartPulseIcon,
  estacionamento: SquareParkingIcon, rua: RouteIcon, externa: TreesIcon, subestacao: UtilityPoleIcon, torre: RadioTowerIcon, porto: AnchorIcon,
  barragem: DamIcon, ponte: BridgeIcon, obra: ConstructionIcon, conteiner: ContainerIcon, local: CircleDotIcon,
  eletrico: ZapIcon, painel: CircuitBoardIcon, disjuntor: PowerIcon, tomada: PlugIcon, cabo: CableIcon, bateria: BatteryChargingIcon,
  gerador: FuelIcon, solar: SolarPanelIcon, iluminacao: LightbulbIcon, carregador: EvChargerIcon,
  motor: CogIcon, bomba: DropletsIcon, tubulacao: WavesIcon, valvula: NutIcon, tanque: CylinderIcon, tambor: BarrelIcon, caldeira: FlameIcon,
  aquecedor: HeaterIcon, refrigeracao: SnowflakeIcon, compressor: WindIcon, ventilador: FanIcon, exaustao: AirVentIcon, filtro: FunnelIcon,
  quimico: BeakerIcon, balanca: ScaleIcon, icamento: WeightIcon, ferramenta: HammerIcon, furadeira: DrillIcon,
  medidor: GaugeIcon, pressao: CircleGaugeIcon, temperatura: ThermometerIcon, sensor: RadarIcon, instrumento: ActivityIcon, clp: CpuIcon,
  robo: BotIcon, camera: CctvIcon, antena: AntennaIcon, rede: NetworkIcon, servidor: ServerIcon, computador: MonitorIcon,
  extintor: FireExtinguisherIcon, alarme: SirenIcon, bloqueio: LockIcon, radiacao: RadiationIcon, biologico: BiohazardIcon,
  empilhadeira: ForkliftIcon, caminhao: TruckIcon, veiculo: CarIcon, trator: TractorIcon, trem: TrainFrontIcon, ativo: BoxIcon,
}

export const locationIcon = (t: TypeDef | undefined): LucideIcon => TYPE_ICON[typeIconKey(t, "locationTypes")]
export const assetIcon = (t: TypeDef | undefined): LucideIcon => TYPE_ICON[typeIconKey(t, "assetTypes")]

const GLYPH = "size-4 shrink-0 text-muted-foreground"

/**
 * The icon of an asset's type, by asset id. Use it wherever an asset is named outside Cadastro
 * (Quadro, Minha área, PT, painéis): the icon says what kind of thing it is before the code is read.
 * Decorative: the code or name is always beside it. Unknown id → the generic asset icon.
 */
export function AssetIcon({ id, className }: { id: string | undefined; className?: string }) {
  const { assets, assetTypes } = useRegistry().state
  const a = id ? byId(assets, id) : undefined
  return createElement(assetIcon(a ? byId(assetTypes, a.typeId) : undefined), { className: cn(GLYPH, className), "aria-hidden": true })
}

/** The icon of a location's type, by location id. Same rules as `AssetIcon`. */
export function LocationIcon({ id, className }: { id: string | undefined; className?: string }) {
  const { locations, locationTypes } = useRegistry().state
  const l = id ? byId(locations, id) : undefined
  return createElement(locationIcon(l ? byId(locationTypes, l.typeId) : undefined), { className: cn(GLYPH, className), "aria-hidden": true })
}
