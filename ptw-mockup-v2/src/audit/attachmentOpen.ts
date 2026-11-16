import { createContext } from "react"

/**
 * Told when someone opens (visto) or downloads (baixado) an attachment, before the file is shown: the
 * PT records "acesso.anexo.visto/baixado" (ptw.audit_access). Absent in Testar (no PT, nothing recorded).
 */
export const AttachmentOpenContext = createContext<((attachmentId: string, how: "visto" | "baixado") => void) | null>(null)
