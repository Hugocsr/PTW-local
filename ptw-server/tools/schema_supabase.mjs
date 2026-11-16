// Emit the hosted bootstrap from the canonical SQL, without modifying the local schema.
import { readFileSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"

const dir = new URL("../db/schema/", import.meta.url)
const uuid = `
create function ptw.uuidv7() returns uuid
  language sql volatile set search_path = pg_catalog as $$
  select (
    lpad(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0')
    || '7' || substr(random_hex, 14)
  )::uuid
  from (select replace(gen_random_uuid()::text, '-', '') as random_hex) random_uuid;
$$;
`
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()
const hashes = {}
for (const file of files) {
  let sql = readFileSync(new URL(file, dir), "utf8").replaceAll("\r\n", "\n")
  if (file === "00_base.sql") {
    sql = sql.replace("create schema ptw;", () => "create schema ptw;" + uuid)
  }
  sql = sql.replaceAll(/(?<![\w.])uuidv7\(\)/g, "ptw.uuidv7()")
  if (file === "50_auditoria.sql") {
    // The hosted database also contains Supabase-managed schemas.
    sql = sql.replace("where not in_extension and coalesce(schema_name, '') !~ '^pg_temp' loop",
      "where not in_extension and schema_name = 'ptw' loop")
    sql = sql.replace("where original and not is_temporary loop",
      "where original and not is_temporary and schema_name = 'ptw' loop")
  }
  if (file === "60_acesso.sql") {
    // Optional planner optimization requiring superuser. RLS stays enabled.
    sql = sql.replace(/^alter function pg_catalog\.enum_eq\(anyenum, anyenum\) leakproof;\n/m, "")
  }
  hashes[file] = createHash("sha256").update(sql).digest("hex")
  process.stdout.write(sql + "\n")
}
process.stdout.write(`select ptw.schema_record('${JSON.stringify(hashes)}'::jsonb);\n`)
