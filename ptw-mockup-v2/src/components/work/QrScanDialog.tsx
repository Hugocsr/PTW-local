import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2Icon, CircleAlertIcon, ScanQrCodeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { assetFromScan, exactAsset, type ScanContext } from "@/core/assetLookup"
import { placePath, type PlaceCounts } from "@/core/locationPicker"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { useData } from "@/data/hooks"
import { cameraProblem, makeDecoder, parseAssetCode } from "@/lib/qrScan"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import type { Asset, Location } from "@/registry/types"

type Note = { kind: "ok" | "error"; text: string } | null

/**
 * SPEC 019: reads the QR of an asset with the camera and adds it to the PT, with its place. Stays open to read
 * several; the code can also be typed when the camera is not available. Nothing here is the only way in: the
 * list and the place picker keep working.
 */
type Props = {
  assetTypeIds: readonly string[]; locationTypeIds: readonly string[]; counts: PlaceCounts
  locationId: string; assetIds: readonly string[]
  onAdd: (asset: Asset, placeId: string) => void
}

export function QrScanDialog({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg"><ScanPanel {...props} onDone={() => onOpenChange(false)} /></DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open: the camera and the notes start clean each time. */
function ScanPanel({ assetTypeIds, locationTypeIds, counts, locationId, assetIds, onAdd, onDone }: Props & { onDone: () => void }) {
  const { state } = useRegistry()
  const port = useData()
  const video = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState("")
  const [note, setNote] = useState<Note>(null)
  // The asset just read, waiting for the person to confirm it (and its place, when it sits in more than one).
  const [found, setFound] = useState<{ asset: Asset; places: Location[] } | null>(null)
  const [placeId, setPlaceId] = useState("")
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const last = useRef({ text: "", at: 0 })
  // The reading loop runs off a timer: it asks for the latest props through this ref.
  const live = useRef<ScanContext>(null as unknown as ScanContext)
  const paused = useRef(false)
  // The parent passes a new function on every render (the draft autosaves): a ref keeps the camera from restarting with it.
  const add = useRef(onAdd)
  useEffect(() => {
    live.current = { assetTypes: state.assetTypes, assetTypeIds, locations: state.locations, locationTypes: state.locationTypes, locationTypeIds, counts, locationId, taken: assetIds }
    paused.current = busy || !!found
    add.current = onAdd
  })

  const handle = useCallback(async (text: string) => {
    const code = parseAssetCode(text)
    if (!code) { setNote({ kind: "error", text: "Este QR Code não é de um ativo." }); return }
    setBusy(true)
    try {
      const page = await port.queries.assets({ q: code, sort: null, page: 0, pageSize: 20 })
      const out = assetFromScan(code, exactAsset(page.items, code), live.current)
      if (!out.ok) { setNote({ kind: "error", text: out.message }); return }
      setFound({ asset: out.asset, places: out.places }); setPlaceId(out.places.length === 1 ? out.places[0]!.id : ""); setNote(null)
    } catch {
      setNote({ kind: "error", text: "Não foi possível consultar o ativo agora. Tente de novo." })
    } finally { setBusy(false) }
  }, [port])

  useEffect(() => {
    let stop = false
    let stream: MediaStream | null = null
    let timer = 0
    const decoder = makeDecoder()
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("insecure")
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return }
        const el = video.current
        if (!el) return
        el.srcObject = stream
        await el.play().catch(() => undefined)
        timer = window.setInterval(() => {
          if (!video.current) return
          void decoder.decode(video.current).then((text) => {
            if (!text || stop) return
            const now = Date.now()
            // The same code still in front of the camera is the same reading: it counts again only after it left the view.
            if (text === last.current.text && now - last.current.at < 1500) { last.current.at = now; return }
            if (paused.current) return
            last.current = { text, at: now }
            void handle(text)
          })
        }, 250)
      } catch (e) { if (!stop) setCameraError(cameraProblem(e)) }
    })()
    return () => { stop = true; window.clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [handle])

  const confirm = () => {
    if (!found || !placeId) return
    add.current(found.asset, placeId)
    setNote({ kind: "ok", text: `Ativo ${found.asset.code} adicionado.` }); setFound(null)
  }
  const submitTyped = () => { const code = parseAssetCode(typed); if (!code) { setNote({ kind: "error", text: "Digite o código do ativo." }); return } void handle(code); setTyped("") }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Ler QR Code do ativo</DialogTitle>
          <DialogDescription>Aponte a câmera para a etiqueta do equipamento e confirme o ativo lido. Pode ler mais de um; toque em Concluir ao terminar.</DialogDescription>
        </DialogHeader>
        {cameraError
          ? <p role="alert" className="flex items-start gap-2 rounded-md border border-st-warn-solid bg-st-warn-surface p-3 type-body text-st-warn-fg"><CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />{cameraError} Escolha o ativo na lista ou digite o código abaixo.</p>
          : <video ref={video} muted playsInline aria-label="Imagem da câmera" className={cn("aspect-video w-full rounded-md bg-black object-cover", found && "hidden")} />}
        <div role="status" aria-live="polite" className="min-h-6 type-body">
          {note && <p className={note.kind === "ok" ? "flex items-center gap-2 text-st-ok-fg" : "flex items-start gap-2 text-st-danger-fg"}>{note.kind === "ok" ? <CheckCircle2Icon aria-hidden className="size-4 shrink-0" /> : <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />}{note.text}</p>}
        </div>
        {found && (
          <div role="group" aria-label="Confirmar ativo lido" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <AssetIcon id={found.asset.id} className="mt-0.5 size-5 shrink-0" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="type-heading break-words">{found.asset.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{found.asset.code} · {state.assetTypes.find((t) => t.id === found.asset.typeId)?.label ?? ""}</p>
              </div>
            </div>
            {found.places.length === 1
              ? <p className="type-body"><span className="type-meta">Local </span>{placePath(state.locations, found.places[0]!.id)}</p>
              : <fieldset className="flex flex-col gap-2"><legend className="type-body">Este ativo está em mais de um local. Qual será o local da PT?</legend>
                  {found.places.map((p) => <Button key={p.id} type="button" variant={placeId === p.id ? "default" : "outline"} aria-pressed={placeId === p.id} className="min-h-11 justify-start whitespace-normal md:min-h-9" onClick={() => setPlaceId(p.id)}>{placePath(state.locations, p.id)}</Button>)}
                </fieldset>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11 md:min-h-9" disabled={!placeId} onClick={confirm}>Adicionar à PT</Button>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => setFound(null)}>Ler outro</Button>
            </div>
          </div>
        )}
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); submitTyped() }}>
          <Input aria-label="Código do ativo" placeholder="Ou digite o código" value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-11 md:min-h-9" />
          <Button type="submit" variant="outline" className="min-h-11 md:min-h-9" disabled={busy || !typed.trim()}>Buscar</Button>
        </form>
        <DialogFooter><Button type="button" className="min-h-11 md:min-h-9" onClick={onDone}>Concluir</Button></DialogFooter>
    </>
  )
}

export function QrScanButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="outline" className="min-h-11 w-fit md:min-h-9" disabled={disabled} onClick={onClick}><ScanQrCodeIcon data-icon="inline-start" />Ler QR Code do ativo</Button>
}
