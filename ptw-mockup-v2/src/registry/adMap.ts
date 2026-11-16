/**
 * Mapping from our person fields to Active Directory attributes, for a later AD/LDAP sync.
 * The UI shows `label`; `ad` appears only in tooltips.
 */
export interface FieldDef {
  label: string
  ad: string
}

export const F = {
  name: { label: "Nome", ad: "displayName" },
  company: { label: "Empresa", ad: "company" },
  employeeId: { label: "Matrícula", ad: "employeeID" },
  login: { label: "Login", ad: "sAMAccountName" },
  accountExpires: { label: "Acesso até", ad: "accountExpires" },
  adObjectGuid: { label: "Vínculo AD", ad: "objectGUID" },
  enabled: { label: "Conta", ad: "userAccountControl" },
} satisfies Record<string, FieldDef>
