/**
 * Perfis de acesso e grupos de exemplo (SPEC 002), carregados com o cadastro SGI depois de zerar o banco.
 * Os perfis dão as permissões de sessão; os cargos de assinatura continuam nas pessoas.
 */
import type { AccessProfileInput, GroupInput } from "@/core/governance"
import { ID, seedUuid } from "@/registry/seedIds"
import { SGI_LOC } from "./registry"

const P = (n: number) => seedUuid(0x0070, n)
const G = (n: number) => seedUuid(0x0071, n)

export const SGI_PROFILE = { admin: P(1), cadastro: P(2), modelos: P(3), sms: P(4) } as const

export const sgiProfiles: AccessProfileInput[] = [
  { id: SGI_PROFILE.admin, name: "Administrador", description: "Gestão completa do PTW na unidade", permissions: ["cadastro", "modelos", "auditoria", "exportacao"], active: true },
  { id: SGI_PROFILE.cadastro, name: "Gestor de cadastros", description: "Ativos, pessoas, tipos, listas, grupos, perfis e delegações", permissions: ["cadastro"], active: true },
  { id: SGI_PROFILE.modelos, name: "Gestor de modelos", description: "Modelos de PT e identidade visual", permissions: ["modelos"], active: true },
  { id: SGI_PROFILE.sms, name: "Gestor SMS", description: "Segurança, meio ambiente e saúde: auditoria e exportação da trilha", permissions: ["auditoria", "exportacao"], active: true },
]

export const sgiGroups: Required<GroupInput>[] = [
  { id: G(1), name: "Administradores", description: "Administração do PTW na unidade", active: true, memberIds: [ID.person.marina], profileIds: [SGI_PROFILE.admin], plantIds: [SGI_LOC.norte, SGI_LOC.sul] },
  { id: G(2), name: "Gestores SMS", description: "Gestão de segurança, meio ambiente e saúde", active: true, memberIds: [ID.person.joana], profileIds: [SGI_PROFILE.sms], plantIds: [SGI_LOC.sul] },
  { id: G(3), name: "Executantes Norte", description: "Time de campo da Planta Norte", active: true, memberIds: [ID.person.paulo, ID.person.sergio], profileIds: [], plantIds: [SGI_LOC.norte] },
]
