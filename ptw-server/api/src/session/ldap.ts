/** LDAP nunca recebe senha vazia nem envia bind antes do TLS verificado. */
import { readFileSync } from "node:fs"
import { Client, InvalidCredentialsError } from "ldapts"
import type { ConnectionOptions } from "node:tls"
import { ApiError, pta } from "../errors/apiError.js"

export const ALL_GRANTS = ["cadastro", "modelos", "auditoria", "exportacao"] as const
export type Grant = typeof ALL_GRANTS[number]
export interface LdapConfig {
  url: string
  serverName?: string
  startTls: boolean
  bindDn: string
  password: string
  baseDn: string
  loginAttribute: string
  guidAttribute: string
  groupBaseDn: string
  memberAttribute: string
  accessGroup: string
  grantGroups: Partial<Record<Grant, string>>
  ca?: string
  timeout: number
}

export function loadLdap(file: string | undefined): LdapConfig | null {
  if (!file) return null
  const c = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
  const required = (key: string): string => {
    if (typeof c[key] !== "string" || !c[key]) throw new Error(`LDAP: ${key} obrigatório`)
    return c[key] as string
  }
  const url = new URL(required("url"))
  if (c.serverName !== undefined && (typeof c.serverName !== "string" || !/^[a-zA-Z0-9.-]+$/.test(c.serverName))) throw new Error("LDAP: serverName inválido")
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/") ||
      !(url.protocol === "ldaps:" || (url.protocol === "ldap:" && c.startTls === true))) {
    throw new Error("LDAP: use ldaps:// ou ldap:// com startTls; URL sem credenciais ou caminho")
  }
  const attr = (key: string, fallback: string): string => {
    const value = c[key] ?? fallback
    if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) throw new Error(`LDAP: atributo ${key} inválido`)
    return value
  }
  const grantGroups = (c.grantGroups ?? {}) as Partial<Record<Grant, string>>
  if (!grantGroups || Array.isArray(grantGroups) || typeof grantGroups !== "object" ||
      Object.entries(grantGroups).some(([k,v]) => !ALL_GRANTS.includes(k as Grant) || typeof v !== "string" || !v)) throw new Error("LDAP: grantGroups inválido")
  const password = readFileSync(required("passwordFile"), "utf8").replace(/\r?\n$/, "")
  if (!password) throw new Error("LDAP: segredo da conta de busca vazio")
  return { url: url.toString(), serverName: c.serverName as string | undefined, startTls: c.startTls === true, bindDn: required("bindDn"), password,
    baseDn: required("baseDn"), loginAttribute: attr("loginAttribute","sAMAccountName"),
    guidAttribute: attr("guidAttribute","objectGUID"), groupBaseDn: required("groupBaseDn"),
    memberAttribute: attr("memberAttribute","member"), accessGroup: required("accessGroup"), grantGroups,
    ...(c.caFile ? { ca: readFileSync(required("caFile"),"utf8") } : {}), timeout: 5000 }
}

/** RFC4515: escape UTF-8 octets especiais de um valor, nunca montar filtro com entrada crua. */
export const escapeFilter = (s: string): string => [...s].map(c => c.charCodeAt(0)===0 || "()*\\".includes(c) ? `\\${c.charCodeAt(0).toString(16).padStart(2,"0")}` : c).join("")
export function directoryGuid(value: unknown): string | null {
  if (typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return value.toLowerCase()
  if (!Buffer.isBuffer(value) || value.length !== 16) return null
  const hex = (b: Buffer): string => b.toString("hex")
  return [hex(Buffer.from(value.subarray(0,4)).reverse()),hex(Buffer.from(value.subarray(4,6)).reverse()),
    hex(Buffer.from(value.subarray(6,8)).reverse()),hex(value.subarray(8,10)),hex(value.subarray(10))].join("-")
}

export async function directoryLogin(c: LdapConfig, login: string, password: string): Promise<{ guid: string; grants: Grant[] }> {
  if (!password || !login) throw pta.unauthorized("Login ou senha inválidos")
  const tls: ConnectionOptions = { minVersion: "TLSv1.2", servername:c.serverName ?? new URL(c.url).hostname, rejectUnauthorized: true, ...(c.ca ? { ca: c.ca } : {}) }
  // ldapts interpreta tlsOptions no construtor como LDAPS, mesmo quando a URL é ldap://.
  const make = (): Client => new Client({ url:c.url, timeout:c.timeout, connectTimeout:c.timeout, ...(c.startTls ? {} : {tlsOptions:{...tls}}) })
  const lookup = make(), user = make()
  let userBinding = false
  try {
    if (c.startTls) await lookup.startTLS({...tls})
    await lookup.bind(c.bindDn,c.password)
    const { searchEntries: entries } = await lookup.search(c.baseDn, { scope:"sub", filter:`(${c.loginAttribute}=${escapeFilter(login)})`,
      attributes:[c.guidAttribute], explicitBufferAttributes:c.guidAttribute.toLowerCase()==="objectguid" ? [c.guidAttribute] : [], sizeLimit:2 })
    if (entries.length !== 1) throw pta.unauthorized("Login ou senha inválidos")
    const entry = entries[0]!
    const guid = directoryGuid(entry[c.guidAttribute])
    if (!guid) throw pta.forbidden("Conta sem identificador válido no diretório")
    if (c.startTls) await user.startTLS({...tls})
    userBinding = true
    await user.bind(entry.dn,password)
    userBinding = false
    // Consulta cada grupo configurado pela base exata: sem truncar listas grandes e sem referrals.
    const memberOf = async (dn: string): Promise<boolean> => {
      if (!dn.toLowerCase().endsWith(c.groupBaseDn.toLowerCase())) throw pta.forbidden("Grupo fora da base configurada")
      const result = await lookup.search(dn, { scope:"base", filter:`(${c.memberAttribute}=${escapeFilter(entry.dn)})`, attributes:["1.1"], sizeLimit:1 })
      return result.searchEntries.length === 1
    }
    if (!await memberOf(c.accessGroup)) throw pta.forbidden("Conta sem acesso ao PTW")
    const grants: Grant[] = []
    for (const grant of ALL_GRANTS) if (c.grantGroups[grant] && await memberOf(c.grantGroups[grant]!)) grants.push(grant)
    return { guid, grants }
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (userBinding && err instanceof InvalidCredentialsError) throw pta.unauthorized("Login ou senha inválidos")
    // Não expor nem registrar mensagens do diretório (podem conter dados de identidade).
    throw new ApiError(503,"PTA01","Não foi possível consultar o login da empresa; tente novamente", { headers:{"retry-after":"5"} })
  } finally {
    await Promise.allSettled([lookup.unbind(),user.unbind()])
  }
}
