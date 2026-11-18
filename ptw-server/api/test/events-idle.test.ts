import { expect, it, vi } from "vitest"
import { Db } from "../src/db.js"
import { EventHub } from "../src/http/events.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { makeApp, testConfig } from "./helpers/app.js"

it("modo hospedado mantém tarefas de fundo sem reservar LISTEN antes de assinantes", async () => {
  const driver = new FakeDriver()
  const made = await makeApp({ driver, config: { background: true, db: { ...testConfig().db, listenPort: 5432 } } })
  try {
    await vi.waitFor(() => expect(driver.find(/sistema\.servidor\.iniciado/)).toHaveLength(1))
    expect(driver.listening("ptw")).toBe(0)
  } finally { await made.app.close() }
  expect(driver.find(/sistema\.servidor\.parado/)).toHaveLength(1)
})

it("abre uma sessão para vários assinantes e fecha ao sair o último", async () => {
  const driver = new FakeDriver()
  const hub = new EventHub(new Db(driver), () => {}, true)
  expect(driver.listening("ptw")).toBe(0)
  const a = hub.subscribe(() => {}); const b = hub.subscribe(() => {})
  await hub.start(); expect(driver.listening("ptw")).toBe(1)
  a(); await Promise.resolve(); expect(driver.listening("ptw")).toBe(1)
  b(); await vi.waitFor(() => expect(driver.listening("ptw")).toBe(0))
  await hub.close()
})
it("saída antes de o LISTEN conectar não deixa sessão abandonada", async () => {
  const driver = new FakeDriver()
  const original = driver.listen.bind(driver)
  let release = (): void => {}
  const ready = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(driver, "listen").mockImplementationOnce(async (...args) => { await ready; return original(...args) })
  const hub = new EventHub(new Db(driver), () => {}, true)
  const off = hub.subscribe(() => {}); off(); release()
  await hub.close()
  expect(driver.listening("ptw")).toBe(0)
})
it("novo assinante durante fechamento espera e recebe avisos pela nova sessão", async () => {
  const driver = new FakeDriver()
  const original = driver.listen.bind(driver)
  let release = (): void => {}; let stopping = false
  const ready = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(driver, "listen").mockImplementationOnce(async (...args) => {
    const stop = await original(...args)
    return async () => { stopping = true; await ready; await stop() }
  })
  const hub = new EventHub(new Db(driver), () => {}, true)
  const off = hub.subscribe(() => {}); await hub.start(); off()
  await vi.waitFor(() => expect(stopping).toBe(true))
  const notice = vi.fn(); const offNew = hub.subscribe(notice); release(); await hub.start()
  driver.notify("ptw", { unit: "u", permit: null, seq: 1 })
  expect(notice).toHaveBeenCalledTimes(1)
  expect(driver.listening("ptw")).toBe(1)
  offNew(); await hub.close(); expect(driver.listening("ptw")).toBe(0)
})
