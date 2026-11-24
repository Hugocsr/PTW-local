import type { Delegation } from "@/core/delegation"
import type { DelegationPort } from "../port"
import type { Http } from "./http"

export function createDelegationPort(http: Http): DelegationPort {
  return {
    read: async () => {
      const r = await http.request<Delegation[]>({ method: "GET", path: "/delegations" })
      return r.ok ? r.data : r.error
    },
    create: async (input) => {
      const r = await http.request<Delegation>({ method: "POST", path: "/delegations", body: input, key: input.id })
      return r.ok ? r.data : r.error
    },
    revoke: async (input, reason, key) => {
      const r = await http.request<Delegation>({ method: "POST", path: `/delegations/${input.id}/revoke`, body: { reason }, key, ifMatch: input.revision })
      return r.ok ? r.data : r.error
    },
  }
}
