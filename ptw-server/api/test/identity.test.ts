import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import { directoryGuid, directoryLogin, escapeFilter, loadLdap } from "../src/session/ldap.js"
import { MemorySessionStore } from "../src/session/store.js"
import { cookiePair, HOST, ORIGIN, makeApp, testConfig } from "./helpers/app.js"
import { createTestDb, HAS_DB, T_ANA, T_UNIT, type TestDb } from "./helpers/realDb.js"

it("escapa filtro e converte objectGUID do AD sem trocar a identidade", () => {
  expect(escapeFilter("a*)(uid=*)\\\0")).toBe("a\\2a\\29\\28uid=\\2a\\29\\5c\\00")
  expect(directoryGuid(Buffer.from("33221100554477668899aabbccddeeff","hex"))).toBe("00112233-4455-6677-8899-aabbccddeeff")
  expect(directoryGuid("invalido")).toBeNull()
})

it("polling não renova inatividade; atividade exige CSRF; expiração registrada uma vez", async () => {
  let now = new Date()
  const t = await makeApp({build:{now:()=>now}})
  try {
    const s = await t.login()
    now=new Date(now.getTime()+20*60_000)
    expect((await t.app.inject({url:"/api/v1/session",headers:s.headers})).statusCode).toBe(200)
    expect((await t.app.inject({method:"POST",url:"/api/v1/session/activity",headers:{cookie:s.cookie}})).statusCode).toBe(403)
    expect((await t.app.inject({method:"POST",url:"/api/v1/session/activity",headers:s.headers})).statusCode).toBe(204)
    now=new Date(now.getTime()+20*60_000)
    expect((await t.app.inject({url:"/api/v1/status",headers:s.headers})).statusCode).toBe(200)
    now=new Date(now.getTime()+10*60_000)
    for (let n=0;n<2;n++) expect((await t.app.inject({url:"/api/v1/session",headers:s.headers})).statusCode).toBe(401)
    expect(t.driver.find(/audit_log\('sessao.expirada'/)).toHaveLength(1)
  } finally { await t.app.close() }
})

it("grants bloqueiam escrita, auditoria e exportação, sem impedir leitura para PT", async () => {
  const t = await makeApp({build:{autoload:true,routes:[]}})
  try {
    const s=await t.login()
    const store=t.app.ptw.sessions as MemorySessionStore
    for(const record of store.sessions.values()) record.grants=[]
    for (const url of ["/audit/events","/audit/exports"]) expect((await t.app.inject({url:"/api/v1"+url,headers:s.headers})).statusCode).toBe(403)
    expect((await t.app.inject({method:"POST",url:"/api/v1/types",headers:s.headers,payload:{}})).statusCode).toBe(403)
  } finally { await t.app.close() }
})

describe.skipIf(!HAS_DB || process.env.PTW_TEST_LDAP !== "1")("LDAP real com TLS e banco real",()=>{
  let db:TestDb, app:FastifyInstance
  const password="Teste-local-2026!"
  const cfg=()=>loadLdap(process.env.PTW_LDAP_CONFIG_FILE)!
  const login=(user:string,pw=password,ip="10.0.0.1")=>app.inject({method:"POST",url:"/api/v1/session/login",headers:{host:HOST,origin:ORIGIN,"x-forwarded-for":ip},payload:{login:user,password:pw}})
  beforeAll(async()=>{
    db=await createTestDb("identity")
    app=await buildApp({config:testConfig({db:db.config,devLogin:false,ldap:cfg()}),driver:postgresDriver(db.config),logger:false})
    await app.ready()
  })
  afterAll(async()=>{await app?.close(); await db?.drop()})
  it("bind, grupo, cookie e identidade persistida; senha nunca na trilha",async()=>{
    const r=await login("ana")
    expect(r.statusCode,r.body).toBe(200)
    expect(r.json()).toMatchObject({auth:"ldap",grants:["cadastro","modelos","auditoria","exportacao"]})
    expect(r.headers["set-cookie"]).toContain("Max-Age=43200")
    expect((await app.inject({url:"/api/v1/session",headers:{cookie:cookiePair(r)}})).statusCode).toBe(200)
    const rows=await db.owner`select ad_object_guid from ptw.person where id=${T_ANA}`
    expect(rows[0]!.ad_object_guid).toBe("00000001-0000-4000-8000-000000000001")
    expect(JSON.stringify(await db.owner`select data,text from ptw.audit_event`)).not.toContain(password)
  })
  it("StartTLS e conta sem permissões administrativas",async()=>{
    const id=await directoryLogin({...cfg(),url:"ldap://ldap-test:1389",startTls:true},"paulo",password)
    expect(id.grants).toEqual([])
  })
  it("senha errada, usuário inexistente, sem grupo, conta local desativada e senha vazia",async()=>{
    for(const [name,pw,status] of [["ana","errada",401],["desconhecido",password,401],["semgrupo",password,403],["bia",password,403],["ana","",400]] as const) {
      const r=await login(name,pw)
      expect(r.statusCode,r.body).toBe(status)
      expect(r.headers["set-cookie"]).toBeUndefined()
    }
  })
  it("certificado não confiável e indisponibilidade não viram login ou fallback",async()=>{
    await expect(directoryLogin({...cfg(),ca:undefined},"ana",password)).rejects.toMatchObject({status:503})
    await expect(directoryLogin({...cfg(),url:"ldaps://ldap-test:1999",timeout:500},"ana",password)).rejects.toMatchObject({status:503})
  })
  it("identidade reciclada com mesmo login não herda a conta",async()=>{
    await db.owner.begin(async tx=>{
      await tx`select ptw.set_context(${T_UNIT}::uuid,null,null,'servico')`
      await tx`update ptw.person set ad_object_guid='00000009-0000-4000-8000-000000000009' where id=${T_ANA}`
    })
    expect((await login("ana")).statusCode).toBe(403)
  })
  it("rajada paralela reserva só cinco tentativas; reiniciar API não remove bloqueio",async()=>{
    const all=await Promise.all(Array.from({length:10},()=>login("rajada","errada","10.0.0.2")))
    expect(all.filter(r=>r.statusCode===401)).toHaveLength(5)
    expect(all.filter(r=>r.statusCode===429)).toHaveLength(5)
    await app.close()
    app=await buildApp({config:testConfig({db:db.config,devLogin:false,ldap:cfg()}),driver:postgresDriver(db.config),logger:false})
    const r=await login("rajada","errada","10.0.0.2")
    expect(r.statusCode).toBe(429)
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0)
    expect((await db.owner`select count(*)::int as n from ptw.audit_event where action='conta.bloqueada'`)[0]!.n).toBeGreaterThan(0)
  })
})
