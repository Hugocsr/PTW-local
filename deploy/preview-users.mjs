const profiles = [
  ["marina.costa", "Marina Costa", "Costa", "00000001-0000-4000-8000-000000000001"],
  ["rafael.nunes", "Rafael Nunes", "Nunes", "00000002-0000-4000-8000-000000000002"],
  ["paulo.lima", "Paulo Lima", "Lima", "00000003-0000-4000-8000-000000000003"],
]

// Preview identities are fixed; configuration cannot inject LDAP records or grant admin access.
export function previewEntries(marinaPassword, extraPasswordsJson, hashPassword) {
  let extra = {}
  if (extraPasswordsJson) {
    try { extra = JSON.parse(extraPasswordsJson) } catch { throw new Error("PTW_PREVIEW_USERS_JSON deve conter JSON válido") }
    if (!extra || Array.isArray(extra) || typeof extra !== "object"
      || Object.keys(extra).some((login) => !["rafael.nunes", "paulo.lima"].includes(login))) {
      throw new Error("PTW_PREVIEW_USERS_JSON aceita somente os perfis de homologação previstos")
    }
  }
  const passwords = { ...extra, "marina.costa": marinaPassword }
  const values = Object.values(passwords)
  if (values.some((password) => typeof password !== "string" || password.length < 20)) {
    throw new Error("Cada perfil de Preview exige uma senha de pelo menos 20 caracteres")
  }
  if (new Set(values).size !== values.length) throw new Error("Use senhas distintas para os perfis de Preview")
  const suffix = "dc=ptw,dc=test"
  const people = `ou=people,${suffix}`
  const groups = `ou=groups,${suffix}`
  const users = profiles.filter(([login]) => Object.hasOwn(passwords, login))
  const entries = users.map(([login, name, surname, guid]) => `dn: uid=${login},${people}
objectClass: inetOrgPerson
cn: ${name}
sn: ${surname}
uid: ${login}
entryUUID: ${guid}
userPassword: ${hashPassword(passwords[login])}
`).join("\n")
  const accessGroup = `cn=ptw-access,${groups}`
  const adminGroup = `cn=ptw-admins,${groups}`
  const ldif = `${entries}
dn: ${accessGroup}
objectClass: groupOfNames
cn: ptw-access
${users.map(([login]) => `member: uid=${login},${people}`).join("\n")}

dn: ${adminGroup}
objectClass: groupOfNames
cn: ptw-admins
member: uid=marina.costa,${people}
`
  return { ldif, accessGroup, adminGroup }
}
