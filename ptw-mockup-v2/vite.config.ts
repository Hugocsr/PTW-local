import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
  // The local web server still sends every data request to the real Docker API.
  // Development only: the API refuses writes from another origin, so the proxy presents the API's own.
  server: { proxy: {
    "/api": { target: "https://localhost", secure: false, changeOrigin: true, headers: { origin: "https://localhost" } },
    "/status.json": { target: "https://localhost", secure: false, changeOrigin: true },
    // The look of the plant comes from the server too, so development shows the theme in use there.
    "/tema": { target: "https://localhost", secure: false, changeOrigin: true },
  } },
})
