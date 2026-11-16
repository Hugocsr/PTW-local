import { defineConfig } from "vitest/config"

// Testes sem banco rodam em qualquer máquina (`npm test`). Os que precisam do PostgreSQL ficam
// pulados até existir PTW_TEST_DB_URL (ver compose.test.yaml e test/helpers/realDb.ts).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Contêiner só leitura: o cache vai para /tmp.
    cacheDir: process.env.PTW_TEST_CACHE ?? "node_modules/.vite",
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Cada arquivo de teste com banco usa o seu banco descartável; um arquivo por vez poupa memória.
    fileParallelism: false,
  },
})
