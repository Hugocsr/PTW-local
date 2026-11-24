import type { AppearanceRecord } from "@/core/appearance"
import type { AppearancePort } from "../port"
import type { Http } from "./http"

export function createAppearancePort(http: Http): AppearancePort {
  return {
    read: async () => {
      const r = await http.request<AppearanceRecord>({ method: "GET", path: "/appearance" })
      return r.ok ? r.data : r.error
    },
    save: async (brand, revision) => {
      const r = await http.request<AppearanceRecord>({ method: "PUT", path: "/appearance", body: { brand }, ifMatch: revision })
      return r.ok ? r.data : r.error
    },
    upload: async (base64) => {
      const r = await http.request<{ file: string }>({ method: "POST", path: "/appearance/assets", body: { base64 } })
      return r.ok ? r.data : r.error
    },
  }
}
