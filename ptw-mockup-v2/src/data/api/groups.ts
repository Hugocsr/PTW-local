import type { AccessProfile, GrantSource, PersonGroup } from "@/core/governance"
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
    profiles: async () => {
      const r = await http.request<AccessProfile[]>({ method: "GET", path: "/access-profiles" })
      return r.ok ? r.data : r.error
    },
    saveProfile: async (profile, revision) => {
      const create = revision === null
      const r = await http.request<AccessProfile>({ method: create ? "POST" : "PUT", path: create ? "/access-profiles" : `/access-profiles/${profile.id}`,
        body: profile, ...(create ? { key: profile.id } : { ifMatch: revision }) })
      return r.ok ? r.data : r.error
    },
    personAccess: async (personId) => {
      const r = await http.request<GrantSource[]>({ method: "GET", path: `/people/${personId}/access` })
      return r.ok ? r.data : r.error
    },
  }
}
