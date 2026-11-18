import { execFileSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { previewEntries } from "./preview-users.mjs"

export function preparePreviewDirectory(dir, password, extraPasswordsJson) {
  if (!password || password.length < 20) throw new Error("Defina uma senha forte em PTW_PREVIEW_LOGIN_PASSWORD")
  const reader = randomBytes(32).toString("hex")
  const suffix = "dc=ptw,dc=test"
  const people = `ou=people,${suffix}`
  const groups = `ou=groups,${suffix}`
  const readerDn = `cn=reader,${suffix}`
  const cert = join(dir, "ldap.crt")
  const key = join(dir, "ldap.key")
  const conf = join(dir, "slapd.conf")
  const mdb = join(dir, "ldap")
  mkdirSync(mdb, { mode: 0o700 })
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
    "-out", cert, "-keyout", key,
  ], { stdio: "ignore" })
  const hash = (value) => {
    const salt = randomBytes(16)
    const digest = createHash("sha1").update(value).update(salt).digest()
    return "{SSHA}" + Buffer.concat([digest, salt]).toString("base64")
  }
  const entries = previewEntries(password, extraPasswordsJson, hash)
  writeFileSync(conf, `include /etc/ldap/schema/core.schema
include /etc/ldap/schema/cosine.schema
include /etc/ldap/schema/inetorgperson.schema
pidfile ${dir}/slapd.pid
argsfile ${dir}/slapd.args
modulepath /usr/lib/ldap
moduleload back_mdb
TLSCertificateFile ${cert}
TLSCertificateKeyFile ${key}
security simple_bind=128
database mdb
maxsize 10485760
suffix "${suffix}"
rootdn "${readerDn}"
rootpw ${hash(reader)}
directory ${mdb}
access to attrs=userPassword by anonymous auth by * none
access to * by * none
`, { mode: 0o600 })
  execFileSync("/usr/sbin/slapadd", ["-f", conf], { input: `dn: ${suffix}
objectClass: domain
dc: ptw

dn: ${people}
objectClass: organizationalUnit
ou: people

dn: ${groups}
objectClass: organizationalUnit
ou: groups

${entries.ldif}
` })
  return {
    command: ["/usr/sbin/slapd", ["-f", conf, "-h", "ldaps://127.0.0.1:1636", "-d", "0"], {}],
    password: reader,
    caFile: cert,
    config: {
      url: "ldaps://127.0.0.1:1636", serverName: "localhost", bindDn: readerDn,
      baseDn: people, loginAttribute: "uid", guidAttribute: "entryUUID",
      groupBaseDn: groups, accessGroup: entries.accessGroup,
      grantGroups: Object.fromEntries(["cadastro", "modelos", "auditoria", "exportacao"].map((grant) => [grant, entries.adminGroup])),
    },
  }
}
