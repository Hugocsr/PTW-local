import { describe, expect, it } from "vitest"
import { cpuText, formatBytes, isStale, memoryText, parseStatus, resourceRows, resourceTotal, usageTone, type ResourceStatus } from "./resources"

const MB = 1024 ** 2
const sample = {
  v: 1, at: "2026-11-09T12:00:00Z", interval: 5,
  services: [
    { name: "storage", state: "exited", health: null, memory: { used: null, limit: 384 * MB }, cpu: { used: null, limit: 1 }, image: { name: "s", size: 700 * MB }, volumes: [{ name: "ptw_files", size: 3 * MB }] },
    { name: "web", state: "running", health: "healthy", memory: { used: 12 * MB, limit: 64 * MB }, cpu: { used: 0.01, limit: 0.5 }, image: { name: "w", size: 145 * MB }, volumes: [{ name: "ptw_webdata", size: 4096 }] },
    { name: "db", state: "running", health: "unhealthy", memory: { used: 500 * MB, limit: 512 * MB }, cpu: { used: 0.85, limit: 1 }, image: { name: "p", size: 433 * MB }, volumes: [{ name: "ptw_pgdata", size: null }] },
  ],
  imagesSize: 1278 * MB, volumesSize: null, disk: { free: 10 * MB, total: 100 * MB }, sizesAt: "2026-11-09T11:59:30Z",
}

describe("recursos do rodapé", () => {
  it("lê o arquivo do coletor e reconhece o ausente e o inválido", () => {
    expect(parseStatus({ v: 1, absent: true })).toBe("absent")
    expect(parseStatus("<html>")).toBeNull()
    expect(parseStatus({ v: 2 })).toBeNull()
    const st = parseStatus(sample) as ResourceStatus
    expect(st.services).toHaveLength(3)
    expect(st.disk).toEqual({ free: 10 * MB, total: 100 * MB })
  })

  it("ordena web, db, storage e lê situação, tom e disco por serviço", () => {
    const rows = resourceRows(parseStatus(sample) as ResourceStatus)
    expect(rows.map((r) => r.label)).toEqual(["App", "Banco", "Arquivos"])
    expect(rows[1]).toMatchObject({ stateText: "Com falha", stateTone: "stop", disk: null })
    expect(rows[1].memory.tone).toBe("stop")       // 500 de 512 = 97,7 %
    expect(rows[1].cpu.tone).toBe("attention")     // 85 %
    expect(rows[2]).toMatchObject({ stateText: "Parado", running: false, disk: 3 * MB })
  })

  it("soma o uso dos que estão no ar e o limite de todos", () => {
    const t = resourceTotal(parseStatus(sample) as ResourceStatus)
    expect(t.memory).toMatchObject({ used: 512 * MB, limit: 960 * MB })
    expect(t.cpu.limit).toBe(2.5)
    expect(t.disk?.tone).toBe("attention")         // 90 % do disco ocupado
    expect(t.running).toBe(2)
  })

  it("limiares: âmbar a partir de 80 %, vermelho a partir de 95 %", () => {
    expect(usageTone(0.79)).toBeNull()
    expect(usageTone(0.8)).toBe("attention")
    expect(usageTone(0.95)).toBe("stop")
    expect(usageTone(null)).toBeNull()
  })

  it("formata em pt-BR, com — para o desconhecido", () => {
    expect(formatBytes(64 * MB)).toBe("64 MB")
    expect(formatBytes(1.3 * 1024 * MB)).toBe("1,3 GB")
    expect(formatBytes(null)).toBe("—")
    expect(formatBytes(1006.9 * 1024 * MB)).toBe("1 TB")
    expect(memoryText({ used: 12 * MB, limit: 64 * MB })).toBe("12 MB de 64 MB")
    expect(memoryText({ used: null, limit: 384 * MB })).toBe("— de 384 MB")
    expect(cpuText({ used: 0.01, limit: 0.5 })).toBe("2% de 0,5 CPU")
    expect(cpuText({ used: 0.001, limit: 1 })).toBe("< 1% de 1 CPU")
  })

  it("dado velho: mais de 30 s (ou 3 intervalos) pelo relógio do servidor", () => {
    const st = parseStatus(sample) as ResourceStatus
    expect(isStale(st, Date.parse("2026-11-09T12:00:20Z"))).toBe(false)
    expect(isStale(st, Date.parse("2026-11-09T12:00:31Z"))).toBe(true)
  })
})
