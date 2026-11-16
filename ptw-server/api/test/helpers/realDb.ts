/**
 * Banco de verdade para os testes (A23): cria um banco descartável a partir de `db/schema`, como dono,
 * e entrega o acesso como `ptw_api` (o login da API). Só roda com `PTW_TEST_DB=1`
 * (`api/compose.test.yaml`); sem isso os testes com banco ficam pulados.
 *
 * Cada pacote usa o seu banco: `ptw_api_<pacote>`. O banco `ptw` não é tocado.
 */
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import type { Config } from "../../src/config.js"

export const HAS_DB = process.env.PTW_TEST_DB === "1"

export const T_UNIT = "00000000-0000-7000-8000-000000000001"
export const T_ANA = "00000000-0000-7000-8000-0000000000d1"
export const T_BIA = "00000000-0000-7000-8000-0000000000d2"
export const T_UNIT_CODE = "UN-T1"

const read = (file: string): string => readFileSync(file, "utf8").replace(/\r?\n$/, "")

function hostPort(): { host: string; port: number } {
  return { host: process.env.PTW_DB_HOST ?? "db", port: Number(process.env.PTW_DB_PORT ?? 5432) }
}

function ownerSql(database: string): postgres.Sql {
  const password = process.env.PTW_TEST_OWNER_PASSWORD ?? read(process.env.PTW_TEST_OWNER_PASSWORD_FILE ?? "/run/secrets/db_owner")
  return postgres({ ...hostPort(), database, username: "ptw_owner", password, max: 1, onnotice: false })
}

export interface TestDb {
  name: string
  /** Configuração de banco para `postgresDriver` (como `ptw_api`). */
  config: Config["db"]
  /** Consulta como dono (fora do RLS), para conferir o que ficou gravado. */
  owner: postgres.Sql
  drop(): Promise<void>
}

/** Cria `ptw_api_<pacote>` do zero, com uma unidade e duas pessoas (Bia com a conta desativada). */
export async function createTestDb(pacote: string): Promise<TestDb> {
  if (!/^[a-z0-9_]{1,30}$/.test(pacote)) throw new Error("nome de pacote inválido")
  const name = `ptw_api_${pacote}`
  const admin = ownerSql("postgres")
  try {
    await admin.unsafe(`drop database if exists ${name} with (force)`)
    await admin.unsafe(`create database ${name}`)
    await admin.unsafe(`revoke all on database ${name} from public`)
    await admin.unsafe(`grant connect on database ${name} to ptw_api`)
  } finally {
    await admin.end()
  }

  const dir = process.env.PTW_TEST_SCHEMA ?? join(import.meta.dirname, "..", "..", "..", "db", "schema")
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  const owner = ownerSql(name)
  // Como db/init.sh: todos os arquivos numa transação só, depois o registro do esquema.
  const all = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n")
  await owner.begin((tx) => tx.unsafe(all))
  const sums = Object.fromEntries(files.map((f) => [f, createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")]))
  await owner.unsafe(`select ptw.schema_record('${JSON.stringify(sums)}'::jsonb)`)

  await owner.begin(async (tx) => {
    await tx.unsafe(`insert into ptw.unit (id, code, name) values ('${T_UNIT}', '${T_UNIT_CODE}', 'Unidade de teste')`)
    await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente')`)
    await tx.unsafe(`insert into ptw.person (unit_id, id, name, login, enabled) values
      ('${T_UNIT}', '${T_ANA}', 'Ana Souza', 'ana', true),
      ('${T_UNIT}', '${T_BIA}', 'Bia Lima', 'bia', false)`)
  })

  const password = process.env.PTW_DB_PASSWORD ?? read(process.env.PTW_DB_PASSWORD_FILE ?? "/run/secrets/db_api")
  return {
    name,
    config: { ...hostPort(), database: name, user: "ptw_api", password, max: 4 },
    owner,
    drop: async () => {
      await owner.end()
      const a = ownerSql("postgres")
      try {
        await a.unsafe(`drop database if exists ${name} with (force)`)
      } finally {
        await a.end()
      }
    },
  }
}
