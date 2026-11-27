import { useMemo } from "react"
import { createPortal } from "react-dom"
import { PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { placePath } from "@/core/locationPicker"
import { useBrand } from "@/data/brand"
import { qrPath } from "@/lib/qr"
import { useRegistry } from "@/registry/store"
import type { Asset } from "@/registry/types"

function Qr({ code, className }: { code: string; className?: string }) {
  const qr = useMemo(() => qrPath(code), [code])
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={className} role="img" aria-label={`QR Code do ativo ${code}`} shapeRendering="crispEdges">
      <rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" />
    </svg>
  )
}

/**
 * SPEC 019: the asset's QR Code (it carries the tag) and its printable label. The label is printed alone: the
 * rest of the screen is hidden while `body[data-print="label"]` is set (index.css).
 */
export function AssetQrSection({ asset }: { asset: Asset }) {
  const { state } = useRegistry()
  const brand = useBrand()
  const where = asset.locationIds[0] ? placePath(state.locations, asset.locationIds[0]) : ""
  const print = () => {
    document.body.dataset.print = "label"
    window.addEventListener("afterprint", () => { delete document.body.dataset.print }, { once: true })
    setTimeout(() => window.print(), 100)
  }
  return (
    <section aria-labelledby="qr" className="flex flex-col gap-3 border-t pt-5">
      <h3 id="qr" className="type-heading">QR Code do ativo</h3>
      <div className="flex flex-wrap items-center gap-4">
        <Qr code={asset.code} className="size-32 shrink-0 rounded-md border" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="type-meta">Cole a etiqueta no equipamento. Ao criar uma PT, a leitura deste código escolhe o ativo e o local.</p>
          <Button type="button" variant="outline" className="min-h-11 w-fit md:min-h-9" onClick={print}><PrinterIcon data-icon="inline-start" />Imprimir etiqueta</Button>
        </div>
      </div>
      {createPortal(
        <div className="asset-label-print" aria-hidden>
          <div className="asset-label">
            <Qr code={asset.code} className="asset-label-qr" />
            <div className="asset-label-text">
              <strong className="asset-label-code">{asset.code}</strong>
              <span>{asset.name}</span>
              {where && <span className="asset-label-where">{where}</span>}
              <span className="asset-label-where">{brand.name}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
