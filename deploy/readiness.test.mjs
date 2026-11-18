import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { waitForApi } from "./readiness.mjs"

test("Aguarda o health ficar disponível antes de liberar a inicialização", async () => {
  let calls = 0
  const server = createServer((_req, res) => { calls++; res.writeHead(calls === 1 ? 503 : 200); res.end("health") })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    await waitForApi(`http://127.0.0.1:${server.address().port}`, 1500)
    assert.ok(calls >= 2)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
test("API indisponível não libera o proxy", async () => {
  const server = createServer((_req, res) => { res.writeHead(503); res.end() })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try { await assert.rejects(waitForApi(`http://127.0.0.1:${server.address().port}`, 100), /não ficou pronta/) }
  finally { await new Promise(resolve => server.close(resolve)) }
})
