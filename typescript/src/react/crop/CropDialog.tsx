import { useCallback, useEffect, useState } from "react"
import Cropper from "react-easy-crop"
import { motion, AnimatePresence } from "motion/react"

/**
 * Image crop dialog — `react-easy-crop` üzerine ince bir wrapper. Storage
 * upload akışında `preprocessFile` hook'unun içinde çağrılır:
 *   - Aspect preset toolbar (1:1, 4:3, 16:9, 3:2, 9:16, Free)
 *   - Zoom slider (+/− ile de)
 *   - Pan + touch built-in (`react-easy-crop`)
 *   - Apply → cropped Blob, Cancel → null, "Use original" → original File
 *
 * Ayrı bir entry point (`@sentroy-co/client-sdk/react/crop`) — ana SDK
 * import'u `react-easy-crop`'u bundle'a çekmesin (lazy subpath).
 *
 * Lazy çağrı pattern: Caller tarafında `await openCropDialog(file)` yardımcı
 * fonksiyonu (bkz `./openCropDialog`) modal mount/unmount'u yönetir,
 * Promise<File | null> döner.
 */

interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

const ASPECT_PRESETS: Array<{ id: string; label: string; aspect: number | null }> = [
  { id: "free", label: "Free", aspect: null },
  { id: "1:1", label: "1:1", aspect: 1 },
  { id: "16:9", label: "16:9", aspect: 16 / 9 },
  { id: "4:3", label: "4:3", aspect: 4 / 3 },
  { id: "3:2", label: "3:2", aspect: 3 / 2 },
  { id: "9:16", label: "9:16", aspect: 9 / 16 },
]

const MAX_PIXEL_GUARD = 50_000_000 // ~24 MP — üstü tarayıcı memory peak'i riskli

export interface CropDialogProps {
  open: boolean
  /** Crop edilecek dosya. Image MIME değilse modal hiç açılmaz (caller'da
   *  filter). */
  file: File
  /** Apply: cropped File döner. Cancel: null. Use original: orijinal File. */
  onClose: (result: File | null) => void
  /** Default aspect preset id'si — 'free' (default) veya '1:1', '16:9', vb. */
  defaultAspect?: string
  /** Output JPEG quality 0-1 (default 0.92). Convert sonucu daima image/jpeg
   *  veya orijinal MIME (PNG'ler için PNG korunur). */
  outputQuality?: number
}

export function CropDialog({
  open,
  file,
  onClose,
  defaultAspect = "free",
  outputQuality = 0.92,
}: CropDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [aspectId, setAspectId] = useState(defaultAspect)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)
  const [busy, setBusy] = useState(false)
  const [tooLarge, setTooLarge] = useState(false)

  // Object URL lifecycle
  useEffect(() => {
    if (!open) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setAspectId(defaultAspect)
    setTooLarge(false)
    // Pixel guard — large image decode tarayıcıyı çökertir
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > MAX_PIXEL_GUARD) {
        setTooLarge(true)
      }
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [open, file, defaultAspect])

  const onCropComplete = useCallback(
    (_area: CropArea, areaPixels: CropArea) => {
      setCroppedAreaPixels(areaPixels)
    },
    [],
  )

  const aspect =
    ASPECT_PRESETS.find((p) => p.id === aspectId)?.aspect ?? undefined

  const handleApply = useCallback(async () => {
    if (!imageUrl || !croppedAreaPixels) return
    setBusy(true)
    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels, file.type, outputQuality)
      // Cropped File — orijinal name'i koru ama uzantı output type'ına göre
      const ext = blob.type === "image/png" ? "png" : "jpg"
      const baseName = file.name.replace(/\.[^.]+$/, "")
      const cropped = new File([blob], `${baseName}.${ext}`, {
        type: blob.type,
      })
      onClose(cropped)
    } finally {
      setBusy(false)
    }
  }, [imageUrl, croppedAreaPixels, file, onClose, outputQuality])

  const handleUseOriginal = useCallback(() => onClose(file), [file, onClose])
  const handleCancel = useCallback(() => onClose(null), [onClose])

  // ESC kapatır
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        handleCancel()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleCancel])

  return (
    <AnimatePresence>
      {open && imageUrl && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // z-index ana MediaManager modal'ından yüksek (nested)
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancel()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Crop image</span>
                <span className="truncate text-xs text-muted-foreground">
                  {file.name}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Cancel"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Aspect toolbar */}
            <div className="flex flex-wrap items-center gap-1 border-b bg-muted/20 px-3 py-2">
              {ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAspectId(p.id)}
                  className={cls(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    aspectId === p.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Cropper canvas */}
            <div className="relative flex-1 bg-black">
              {tooLarge ? (
                <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-white/70">
                  Image too large to crop in browser. Upload as-is or resize
                  beforehand.
                </div>
              ) : (
                <Cropper
                  image={imageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  showGrid
                  objectFit="contain"
                />
              )}
            </div>

            {/* Zoom + actions */}
            <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3">
              {!tooLarge && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Zoom</span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
                    className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted/50"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                    className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted/50"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1)
                      setCrop({ x: 0, y: 0 })
                    }}
                    className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted/50"
                  >
                    Reset
                  </button>
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUseOriginal}
                  disabled={busy}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50"
                >
                  Use original
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={busy || tooLarge || !croppedAreaPixels}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Cropping…" : "Apply crop"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Canvas ile crop area'yı çıkar + Blob döndür.
 * Output MIME: PNG ise PNG, diğerleri JPEG (transparency yoksa).
 */
async function getCroppedBlob(
  imageUrl: string,
  area: CropArea,
  sourceMime: string,
  quality: number,
): Promise<Blob> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement("canvas")
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  )
  const outputMime = sourceMime === "image/png" ? "image/png" : "image/jpeg"
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      outputMime,
      outputMime === "image/jpeg" ? quality : undefined,
    )
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function cls(...arr: Array<string | false | null | undefined>): string {
  return arr.filter(Boolean).join(" ")
}
