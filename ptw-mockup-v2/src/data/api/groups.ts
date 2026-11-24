import type { PersonGroup } from "@/core/governance"
import type { GroupPort } from "../port"
import type { Http } from "./http"

export function createGroupPort(http: Http): GroupPort {
  return {
    read: async () => {
      const r = await http.request<PersonGroup[]>({ method: "GET", path: "/person-groups" })
      return r.ok ? r.data : r.error
    },
    save: async (group, revision) => {
      const create = revision === null
      const r = await http.request<PersonGroup>({ method: create ? "POST" : "PUT", path: create ? "/person-groups" : `/person-groups/${group.id}`,
        body: group, ...(create ? { key: group.id } : { ifMatch: revision }) })
      return r.ok ? r.data : r.error
    },
  }
}
