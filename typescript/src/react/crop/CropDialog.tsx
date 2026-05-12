import { useCallback, useEffect, useRef, useState } from "react"
import Cropper from "react-easy-crop"
import { motion, AnimatePresence } from "motion/react"

/**
 * Image crop dialog — `react-easy-crop` üzerine professional crop UI:
 *   - Aspect preset toolbar (1:1, 4:3, 16:9, 3:2, 9:16, Free)
 *   - Zoom slider (+/− ile de)
 *   - Rotate 90° CW/CCW (`R` shortcut)
 *   - Sağ panelde **live preview thumbnail** — crop alanı her değiştiğinde
 *     küçük canvas'a aynı transformasyonu uygulayıp output sonucunu gösterir;
 *     kullanıcı Apply'a basmadan "ne çıkacak" göründüğü için
 *     Photoshop / Figma seviyesinde feedback.
 *   - Output pixel boyutu (örn. 1200×800) — RP'lerin export presetlerine
 *     hizalanmak için.
 *   - Apply → cropped Blob, Cancel → null, "Use original" → original File.
 *
 * Ayrı bir entry point (`@sentroy-co/client-sdk/react/crop`) — ana SDK
 * import'u `react-easy-crop`'u bundle'a çekmesin (lazy subpath).
 *
 * `getCroppedBlob` rotation-aware: önce kaynak image rotate edilir,
 * sonra `croppedAreaPixels`'in döndürülmüş koordinat sisteminden çıkarılır.
 * react-easy-crop'un `croppedAreaPixels` çıktısı zaten rotation'a göre
 * transform edilmiş — biz canvas'a aynı rotation'ı uygulayıp aynı koordinat
 * sisteminde drawImage yapıyoruz.
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
const PREVIEW_MAX_DIM = 220 // sidebar thumbnail için max edge (px)

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
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)
  const [busy, setBusy] = useState(false)
  const [tooLarge, setTooLarge] = useState(false)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewRafRef = useRef<number | null>(null)
  const imageElRef = useRef<HTMLImageElement | null>(null)

  // Object URL lifecycle
  useEffect(() => {
    if (!open) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setAspectId(defaultAspect)
    setTooLarge(false)
    // Pixel guard + cache HTMLImageElement (preview drawImage source).
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > MAX_PIXEL_GUARD) {
        setTooLarge(true)
      }
      imageElRef.current = img
    }
    img.src = url
    return () => {
      URL.revokeObjectURL(url)
      imageElRef.current = null
    }
  }, [open, file, defaultAspect])

  const onCropComplete = useCallback(
    (_area: CropArea, areaPixels: CropArea) => {
      setCroppedAreaPixels(areaPixels)
    },
    [],
  )

  // Live preview render — crop / rotation değiştikçe sağ panel thumbnail'ı
  // güncelle. requestAnimationFrame ile throttle (drag sırasında her event'te
  // canvas çizmek pahalı).
  useEffect(() => {
    if (!croppedAreaPixels || !imageElRef.current || tooLarge) return
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current)
    }
    previewRafRef.current = requestAnimationFrame(() => {
      const canvas = previewCanvasRef.current
      const img = imageElRef.current
      if (!canvas || !img) return
      const area = croppedAreaPixels
      // Preview boyutu — aspect korunarak max edge PREVIEW_MAX_DIM
      const scale =
        area.width >= area.height
          ? PREVIEW_MAX_DIM / area.width
          : PREVIEW_MAX_DIM / area.height
      const pw = Math.max(1, Math.round(area.width * scale))
      const ph = Math.max(1, Math.round(area.height * scale))
      canvas.width = pw
      canvas.height = ph
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.imageSmoothingQuality = "high"
      ctx.clearRect(0, 0, pw, ph)
      drawRotatedCrop(ctx, img, area, rotation, pw, ph)
      previewRafRef.current = null
    })
    return () => {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = null
      }
    }
  }, [croppedAreaPixels, rotation, tooLarge])

  const aspect =
    ASPECT_PRESETS.find((p) => p.id === aspectId)?.aspect ?? undefined

  const handleApply = useCallback(async () => {
    if (!imageUrl || !croppedAreaPixels) return
    setBusy(true)
    try {
      const blob = await getCroppedBlob(
        imageUrl,
        croppedAreaPixels,
        rotation,
        file.type,
        outputQuality,
      )
      const ext = blob.type === "image/png" ? "png" : "jpg"
      const baseName = file.name.replace(/\.[^.]+$/, "")
      const cropped = new File([blob], `${baseName}.${ext}`, {
        type: blob.type,
      })
      onClose(cropped)
    } finally {
      setBusy(false)
    }
  }, [imageUrl, croppedAreaPixels, rotation, file, onClose, outputQuality])

  const handleUseOriginal = useCallback(() => onClose(file), [file, onClose])
  const handleCancel = useCallback(() => onClose(null), [onClose])
  const handleRotate = useCallback(
    (delta: 90 | -90) => {
      setRotation((r) => {
        const next = (r + delta + 360) % 360
        return next
      })
    },
    [],
  )

  // ESC kapatır, R döndürür
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        handleCancel()
      } else if (e.key === "r" || e.key === "R") {
        if (
          e.target instanceof HTMLElement &&
          (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        ) {
          return
        }
        e.preventDefault()
        handleRotate(e.shiftKey ? -90 : 90)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleCancel, handleRotate])

  const outputWidth = croppedAreaPixels ? Math.round(croppedAreaPixels.width) : 0
  const outputHeight = croppedAreaPixels ? Math.round(croppedAreaPixels.height) : 0
  // Rotation 90° / 270° iken output dimensions swap edilir (canvas rotate
  // sonrası kullanıcı görsel olarak swap görür).
  const displayW = rotation % 180 === 0 ? outputWidth : outputHeight
  const displayH = rotation % 180 === 0 ? outputHeight : outputWidth

  return (
    <AnimatePresence>
      {open && imageUrl && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
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
            className="flex h-[min(92vh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex flex-col min-w-0">
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

            {/* Aspect + rotate toolbar */}
            <div className="flex flex-wrap items-center gap-1 border-b bg-muted/20 px-3 py-2">
              <div className="flex flex-1 flex-wrap items-center gap-1">
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
              <div className="ms-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRotate(-90)}
                  title="Rotate left (Shift+R)"
                  aria-label="Rotate left"
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <RotateLeftIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleRotate(90)}
                  title="Rotate right (R)"
                  aria-label="Rotate right"
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <RotateRightIcon />
                </button>
              </div>
            </div>

            {/* Body: cropper + preview sidebar */}
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden md:flex-row">
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
                    rotation={rotation}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                    onRotationChange={setRotation}
                    showGrid
                    objectFit="contain"
                  />
                )}
              </div>

              {/* Preview sidebar */}
              <div className="flex w-full shrink-0 flex-col gap-3 border-t bg-muted/10 p-4 md:w-64 md:border-l md:border-t-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Preview
                  </span>
                  {displayW > 0 && displayH > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {displayW}×{displayH}
                    </span>
                  )}
                </div>
                <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed bg-background/40 p-2">
                  {tooLarge ? (
                    <span className="text-[11px] text-muted-foreground">
                      Preview unavailable
                    </span>
                  ) : croppedAreaPixels ? (
                    <canvas
                      ref={previewCanvasRef}
                      className="max-h-[220px] max-w-full rounded-sm shadow-sm"
                    />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Adjust crop…
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Aspect</span>
                    <span className="font-mono">
                      {ASPECT_PRESETS.find((p) => p.id === aspectId)?.label ??
                        "Free"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Rotation</span>
                    <span className="font-mono">{rotation}°</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Zoom</span>
                    <span className="font-mono">{zoom.toFixed(2)}×</span>
                  </div>
                </div>
              </div>
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
                      setRotation(0)
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
 * Rotated crop'u canvas'a yaz. Rotation 0° fast-path; aksi halde önce
 * "rotated bounding box" canvas'ı oluştur (orijinal image'in döndürülmüş
 * versiyonu), sonra croppedAreaPixels koordinatlarında çıkar.
 *
 * react-easy-crop's `croppedAreaPixels` rotation-aware: koordinatlar
 * orijinal image'i rotasyon merkezinden döndürdükten sonraki "visual"
 * bounding box üzerinden hesaplanır — biz aynı transform'u canvas'a
 * uygulayıp aynı koordinatlardan drawImage yapıyoruz.
 */
function drawRotatedCrop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  area: CropArea,
  rotation: number,
  dstW: number,
  dstH: number,
): void {
  if (rotation === 0) {
    ctx.drawImage(
      image,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      dstW,
      dstH,
    )
    return
  }
  // Build a rotated source canvas at the size of the rotated bounding box,
  // then crop from it.
  const rad = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const iw = image.naturalWidth
  const ih = image.naturalHeight
  const bbW = iw * cos + ih * sin
  const bbH = iw * sin + ih * cos
  const tmp = document.createElement("canvas")
  tmp.width = bbW
  tmp.height = bbH
  const tctx = tmp.getContext("2d")
  if (!tctx) return
  tctx.translate(bbW / 2, bbH / 2)
  tctx.rotate(rad)
  tctx.drawImage(image, -iw / 2, -ih / 2)
  ctx.drawImage(
    tmp,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    dstW,
    dstH,
  )
}

/**
 * Canvas ile crop area'yı çıkar + Blob döndür.
 * Output MIME: PNG ise PNG, diğerleri JPEG (transparency yoksa).
 */
async function getCroppedBlob(
  imageUrl: string,
  area: CropArea,
  rotation: number,
  sourceMime: string,
  quality: number,
): Promise<Blob> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement("canvas")
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.imageSmoothingQuality = "high"
  drawRotatedCrop(ctx, image, area, rotation, area.width, area.height)
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

function RotateLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function RotateRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}
