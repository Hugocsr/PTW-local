/** Photo, video and file capture, and the list of attachments. */
import { useContext, useState } from "react"
import { AttachmentOpenContext } from "@/audit/attachmentOpen"
import { CameraIcon, FileIcon, PaperclipIcon, VideoIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AttachKind } from "@/registry/types"
import { dmHms } from "@/core/time"
import { TONE_TEXT } from "@/components/shell/Status"
import { FormFilesContext } from "./context"

export interface Actor { id: string; now: string }
export const SIM_ACTOR: Actor = { id: "", now: "" }

const CAPTURE: Record<AttachKind, { text: string; icon: typeof CameraIcon; accept: string; capture?: "environment" }> = {
  foto: { text: "Tirar foto", icon: CameraIcon, accept: "image/*", capture: "environment" },
  video: { text: "Gravar vídeo", icon: VideoIcon, accept: "video/*", capture: "environment" },
  arquivo: { text: "Anexar arquivo", icon: PaperclipIcon, accept: "" },
}

/** The kind a picked file is (by its type), whatever button picked it. */
export const kindOfFile = (f: Pick<File, "type">): AttachKind => (f.type.startsWith("image/") ? "foto" : f.type.startsWith("video/") ? "video" : "arquivo")

/**
 * On a phone, photo and video open the camera; on a computer they open the file picker. Each file is
 * stored through the form's files (SHA-256 of its bytes); the answer only gets the attachment ids.
 * A file of a kind the item does not accept is refused out loud.
 */
export function CaptureButton({ kind, itemId, accept, label, onAdd }: { kind: AttachKind; itemId: string; accept?: AttachKind[]; label: string; onAdd: (ids: string[]) => void }) {
  const c = CAPTURE[kind]
  const files = useContext(FormFilesContext)
  const [note, setNote] = useState<string | null>(null)
  const pick = async (list: FileList | null) => {
    if (!list || !files) return
    const ids: string[] = []
    let refused = 0
    for (const f of Array.from(list)) {
      const k = kindOfFile(f)
      if (accept && !accept.includes(k)) { refused++; continue }
      const a = await files.capture(itemId, k, f)
      if (a) ids.push(a.id)
      else refused++
    }
    setNote(refused ? `${refused === 1 ? "Um arquivo não foi aceito" : `${refused} arquivos não foram aceitos`}: tipo não permitido neste item.` : null)
    if (ids.length) onAdd(ids)
  }
  return (
    <>
    <Button asChild variant="outline" disabled={!files} className="min-h-11 cursor-pointer bg-surface-row has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 md:min-h-9">
      <label>
        <c.icon data-icon="inline-start" />{c.text}
        <input type="file" className="sr-only" accept={c.accept || undefined} capture={c.capture} multiple={kind === "arquivo"} aria-label={`${c.text}: ${label}`} disabled={!files}
          onChange={(e) => { void pick(e.target.files); e.target.value = "" }} />
      </label>
    </Button>
    {note && <p className={cn("basis-full type-meta", TONE_TEXT.stop)} role="status">{note}</p>}
    </>
  )
}

/**
 * Thumbnails for photos, a small player for videos, a row for other files. Takes the answer's
 * attachment ids and reads name, kind and bytes from the form's files. Removing takes the file out
 * of the answer only: an attachment is never deleted (the database keeps it).
 */
export function AttachmentList({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const opened = useContext(AttachmentOpenContext)
  const files = useContext(FormFilesContext)
  if (ids.length === 0) return null
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ids.map((id) => {
        const f = files?.attachments.find((x) => x.id === id)
        const url = f ? files?.urlOf(f.sha256) : undefined
        const name = f?.fileName ?? "Arquivo indisponível"
        const kind = f?.kind ?? "arquivo"
        return (
          <li key={id} className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-md bg-surface-row", kind === "arquivo" && "col-span-2 sm:col-span-3")}>
            {kind === "foto" && url && <a href={url} target="_blank" rel="noreferrer" onClick={() => opened?.(id, "visto")}><img src={url} alt={name} className="aspect-[4/3] w-full object-cover" /></a>}
            {kind === "video" && url && <video src={url} controls onPlay={() => opened?.(id, "visto")} className="aspect-[4/3] w-full bg-foreground object-contain" aria-label={name} />}
            <div className="flex min-h-11 items-center gap-2 px-2 md:min-h-9">
              {kind === "arquivo" && <FileIcon className="size-4 shrink-0" aria-hidden />}
              {kind === "arquivo" && url
                ? <a href={url} download={name} onClick={() => opened?.(id, "baixado")} className="min-w-0 flex-1 truncate type-body underline underline-offset-2">{name}</a>
                : <span className="min-w-0 flex-1 truncate type-meta">{kind === "arquivo" ? name : f ? dmHms(f.capturedAt) : name}</span>}
              {onRemove && <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-8" aria-label={`Remover ${name}`} onClick={() => onRemove(id)}><XIcon /></Button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
