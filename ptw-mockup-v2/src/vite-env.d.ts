/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Data layer loaded by default: "memoria" (default; the scenarios) or "api" (the server; `?dados=` in the address wins). */
  readonly VITE_DADOS?: string
}
