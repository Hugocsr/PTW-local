// Carga explícita de demonstração: só a unidade usa o dono; todo cadastro usa ptw_api e os gatilhos.
import { readFileSync } from "node:fs"
import postgres from "postgres"
import { loadConfig } from "../dist/config.js"
import { Db, postgresDriver } from "../dist/db.js"
import { createType } from "../dist/repo/registry/unitTypes.js"
import { createLocation } from "../dist/repo/registry/locations.js"
import { createAsset } from "../dist/repo/registry/assets.js"
import { createRelation } from "../dist/repo/registry/relations.js"
import { createPerson } from "../dist/repo/registry/people.js"
import { createOptionList } from "../dist/repo/registry/optionLists.js"
import { insertVersion, activateVersion } from "../dist/repo/templates/write.js"
import { getVersion } from "../dist/repo/templates/read.js"
import { saveGroup, saveProfile } from "../dist/repo/groups.js"

const data = JSON.parse(readFileSync(new URL("./dados/exemplo.json", import.meta.url), "utf8"))
const unit = data.units[0]
const config = loadConfig({ ...process.env, PTW_UNIT: unit.code })
const owner = postgres({ host: config.db.host, port: config.db.port, database: config.db.database, username: "ptw_owner", max: 1, onnotice: false,
  password: readFileSync(process.env.PTW_OWNER_PASSWORD_FILE ?? "/run/secrets/db_owner", "utf8").trim() })
try {
  const existing = await owner`select id from ptw.unit where code = ${unit.code}`
  if (existing[0] && existing[0].id !== unit.id) throw new Error("O código da unidade já pertence a outro cadastro; carga recusada")
  await owner`insert into ptw.unit (id, code, name, timezone)
    values (${unit.id}, ${unit.code}, ${unit.name}, ${unit.timezone}) on conflict (id) do nothing`
} finally { await owner.end() }

const db = new Db(postgresDriver(config.db))
try {
  await db.withContext({ unitId: unit.id, personId: null, auth: "servico", client: "carga-demonstracao" }, async (tx) => {
    const present = await tx`select id from ptw.template where unit_id = ptw.current_unit()`
    if (present.length) {
      console.log("Unidade já carregada; nenhum cadastro foi alterado.")
      return
    }
    for (const [key, family] of [["locationTypes", "local"], ["assetTypes", "ativo"], ["roleTypes", "cargo"], ["relationKinds", "relacao"]]) {
      for (const item of data[key]) {
        if (item.systemKey) await tx`insert into ptw.type_def (unit_id, id, family, label, icon, active, system_key)
          values (ptw.current_unit(), ${item.id}, ${family}, ${item.label}, ${item.icon ?? null}, ${item.active ?? true}, ${item.systemKey})`
        else await createType(tx, { ...item, family })
      }
    }
    for (const item of data.locations) await createLocation(tx, item)
    for (const item of data.assets) await createAsset(tx, item)
    for (const item of data.relations) await createRelation(tx, item)
    for (const item of data.people) await createPerson(tx, item)
    for (const item of data.optionLists) await createOptionList(tx, item)
    for (const model of data.templates) {
      await tx`insert into ptw.template (unit_id, id, name, retention_class)
        values (ptw.current_unit(), ${model.id}, ${model.name}, ${model.retentionClass ?? "pt"})`
      for (const version of model.versions.filter(v => v.status !== "arquivada")) {
        await insertVersion(tx, model.id, version, { number: version.number })
        if (version.status === "ativa") {
          const saved = await getVersion(tx, model.id, version.id)
          await activateVersion(tx, model.id, version.id, saved.revision)
        }
      }
    }
    // Perfis e grupos (SPEC 002): governança exige uma pessoa no contexto; a carga age como a primeira
    // administradora do exemplo, como serviço (sem trava de permissões).
    const adminId = data.groups?.[0]?.memberIds?.[0]
    if (adminId && data.accessProfiles?.length) {
      await tx`select ptw.set_context(${unit.id}::uuid, ${adminId}::uuid, null, 'servico', 'carga-demonstracao')`
      for (const p of data.accessProfiles) await saveProfile(tx, p, null)
      for (const g of data.groups) await saveGroup(tx, g, null)
      await tx`select ptw.set_context(${unit.id}::uuid, null, null, 'servico', 'carga-demonstracao')`
    }
    await tx`select ptw.audit_system('sistema.carga.demonstracao', 'Cadastro e modelos de demonstração carregados', '{}'::jsonb)`
    console.log(`Carga concluída: ${data.people.length} pessoas, ${data.assets.length} ativos e ${data.templates.length} modelos. Nenhuma PT antiga importada.`)
  })
} finally { await db.end() }
