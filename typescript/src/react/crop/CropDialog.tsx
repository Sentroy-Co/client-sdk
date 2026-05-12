import { useCallback, useEffect, useRef, useState } from "react"
import { Cropper, type CropperRef } from "react-advanced-cropper"
import { motion, AnimatePresence } from "motion/react"
import "react-advanced-cropper/dist/style.css"

/**
 * Image crop dialog — iOS Photos benzeri full-screen crop UI. Önceki
 * `react-easy-crop` implementation'ı drag UX ve preview render
 * tarafında zayıftı; `react-advanced-cropper` daha modern stencil
 * sistemi + native-feel pinch/zoom verir.
 *
 * Akış (storage upload pipeline'ından preprocess hook):
 *   - Aspect preset toolbar (1:1, 4:3, 16:9, 3:2, 9:16, Free)
 *   - Rotate 90° CW/CCW butonları (R / Shift+R)
 *   - Cropper'ın `getCanvas()` çıktısından **live preview**
 *     thumbnail — kullanıcı Apply'a basmadan sonucu görür.
 *   - Output pixel boyutu (örn. 1200×800) read-out.
 *   - Apply: ref üzerinden `getCanvas().toBlob` → File.
 *   - "Use original": orijinal File döner; Cancel: null.
 *
 * Tam ekran: `inset-0`, scrim'siz; consent flow gibi destination-only UX —
 * dialog her şeyi kaplar, dikkat dağıtmaz.
 *
 * Lazy subpath (`@sentroy-co/client-sdk/react/crop`) — ana SDK import'u
 * cropper bundle'ı yutmasın.
 */

const ASPECT_PRESETS: Array<{
  id: string
  label: string
  aspect: number | null
}> = [
  { id: "free", label: "Free", aspect: null },
  { id: "1:1", label: "1:1", aspect: 1 },
  { id: "16:9", label: "16:9", aspect: 16 / 9 },
  { id: "4:3", label: "4:3", aspect: 4 / 3 },
  { id: "3:2", label: "3:2", aspect: 3 / 2 },
  { id: "9:16", label: "9:16", aspect: 9 / 16 },
]

const MAX_PIXEL_GUARD = 50_000_000 // ~24 MP — üstü tarayıcı memory peak'i riskli
const PREVIEW_MAX_DIM = 240

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
  const [busy, setBusy] = useState(false)
  const [tooLarge, setTooLarge] = useState(false)
  const [outputSize, setOutputSize] = useState<{ w: number; h: number } | null>(
    null,
  )
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)

  const cropperRef = useRef<CropperRef | null>(null)
  const previewRafRef = useRef<number | null>(null)

  // Object URL lifecycle
  useEffect(() => {
    if (!open) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setAspectId(defaultAspect)
    setTooLarge(false)
    setOutputSize(null)
    setPreviewDataUrl(null)
    // Pixel guard — large image decode tarayıcıyı çökertir
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > MAX_PIXEL_GUARD) {
        setTooLarge(true)
      }
    }
    img.src = url
    return () => {
      URL.revokeObjectURL(url)
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current)
        previewRafRef.current = null
      }
    }
  }, [open, file, defaultAspect])

  const aspectRatio =
    ASPECT_PRESETS.find((p) => p.id === aspectId)?.aspect ?? undefined

  // Aspect preset değişirse cropper coordinates'ini yeni aspect'e göre
  // güncelle. `setCoordinates` ile aspect'i zorla.
  useEffect(() => {
    if (!cropperRef.current) return
    if (aspectRatio === undefined) return
    const state = cropperRef.current.getState()
    if (!state) return
    const { coordinates } = state
    if (!coordinates) return
    const current = coordinates.width / coordinates.height
    if (Math.abs(current - aspectRatio) < 0.001) return
    // Aspect ratio'ya snap — width'i koru, height'i hesapla
    const newWidth = coordinates.width
    const newHeight = coordinates.width / aspectRatio
    cropperRef.current.setCoordinates({
      width: newWidth,
      height: newHeight,
    })
  }, [aspectRatio, aspectId])

  // Live preview render — cropper change event'inde getCanvas() ile
  // küçük thumbnail üret. RAF ile throttle.
  const renderPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current)
    }
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null
      const cropper = cropperRef.current
      if (!cropper) return
      const canvas = cropper.getCanvas({
        // Preview canvas — düşük boyut, smooth (output quality değil)
        maxWidth: PREVIEW_MAX_DIM * 2,
        maxHeight: PREVIEW_MAX_DIM * 2,
        imageSmoothingQuality: "medium",
      })
      if (!canvas) return
      setOutputSize({ w: canvas.width, h: canvas.height })
      // Data URL — küçük canvas; performant
      try {
        setPreviewDataUrl(canvas.toDataURL("image/jpeg", 0.7))
      } catch {
        // toDataURL nadir tainted-canvas durumunda fail edebilir; sessiz geç
      }
    })
  }, [])

  const handleCropperChange = useCallback(() => {
    renderPreview()
  }, [renderPreview])

  const handleCropperReady = useCallback(() => {
    renderPreview()
  }, [renderPreview])

  const handleApply = useCallback(async () => {
    const cropper = cropperRef.current
    if (!cropper) return
    setBusy(true)
    try {
      const canvas = cropper.getCanvas({
        imageSmoothingQuality: "high",
      })
      if (!canvas) {
        setBusy(false)
        return
      }
      const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg"
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          outputMime,
          outputMime === "image/jpeg" ? outputQuality : undefined,
        )
      })
      if (!blob) {
        setBusy(false)
        return
      }
      const ext = blob.type === "image/png" ? "png" : "jpg"
      const baseName = file.name.replace(/\.[^.]+$/, "")
      const cropped = new File([blob], `${baseName}.${ext}`, {
        type: blob.type,
      })
      onClose(cropped)
    } finally {
      setBusy(false)
    }
  }, [file, onClose, outputQuality])

  const handleUseOriginal = useCallback(() => onClose(file), [file, onClose])
  const handleCancel = useCallback(() => onClose(null), [onClose])
  const handleRotate = useCallback((delta: 90 | -90) => {
    cropperRef.current?.rotateImage(delta)
  }, [])
  const handleFlip = useCallback((axis: "h" | "v") => {
    cropperRef.current?.flipImage(axis === "h", axis === "v")
  }, [])

  // Keyboard shortcuts — ESC kapat, R rotate, F flip
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
      ) {
        return
      }
      if (e.key === "Escape") {
        e.stopPropagation()
        handleCancel()
        return
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        handleRotate(e.shiftKey ? -90 : 90)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleCancel, handleRotate])

  return (
    <AnimatePresence>
      {open && imageUrl && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Tam ekran — scrim değil, kendisi background; iOS Photos UX
          className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex min-w-0 flex-col items-center text-center">
              <span className="text-sm font-semibold">Crop image</span>
              <span className="truncate max-w-xs text-[11px] text-white/50">
                {file.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || tooLarge}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Cropping…" : "Apply"}
            </button>
          </div>

          {/* Aspect + rotate toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAspectId(p.id)}
                  className={cls(
                    "rounded-full px-3 py-1 text-xs transition-colors",
                    aspectId === p.id
                      ? "bg-white text-black"
                      : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <ToolbarIconButton
                onClick={() => handleRotate(-90)}
                title="Rotate left (Shift+R)"
                ariaLabel="Rotate left"
              >
                <RotateLeftIcon />
              </ToolbarIconButton>
              <ToolbarIconButton
                onClick={() => handleRotate(90)}
                title="Rotate right (R)"
                ariaLabel="Rotate right"
              >
                <RotateRightIcon />
              </ToolbarIconButton>
              <span className="mx-1 h-5 w-px bg-white/15" />
              <ToolbarIconButton
                onClick={() => handleFlip("h")}
                title="Flip horizontal"
                ariaLabel="Flip horizontal"
              >
                <FlipHorizontalIcon />
              </ToolbarIconButton>
              <ToolbarIconButton
                onClick={() => handleFlip("v")}
                title="Flip vertical"
                ariaLabel="Flip vertical"
              >
                <FlipVerticalIcon />
              </ToolbarIconButton>
            </div>
          </div>

          {/* Main: cropper + side panel */}
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
            {/* Cropper stage */}
            <div className="relative flex-1 bg-black">
              {tooLarge ? (
                <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-white/70">
                  Image too large to crop in browser. Upload as-is or resize
                  beforehand.
                </div>
              ) : (
                <Cropper
                  ref={cropperRef}
                  src={imageUrl}
                  className="sentroy-cropper"
                  // Stencil props — aspect lock + iOS-like rect stencil grid
                  stencilProps={{
                    aspectRatio: aspectRatio,
                    grid: true,
                    movable: true,
                    resizable: true,
                  }}
                  // Background overlay'i koyu yap (image dışı kalan kısım)
                  backgroundClassName="sentroy-cropper-background"
                  onChange={handleCropperChange}
                  onReady={handleCropperReady}
                />
              )}
            </div>

            {/* Side panel: live preview + readout */}
            <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-white/10 bg-black/30 p-4 md:w-72 md:border-l md:border-t-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                  Preview
                </span>
                {outputSize && (
                  <span className="font-mono text-[10px] text-white/40">
                    {outputSize.w}×{outputSize.h}
                  </span>
                )}
              </div>
              <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-white/10 bg-black/50 p-3">
                {tooLarge ? (
                  <span className="text-[11px] text-white/50">
                    Preview unavailable
                  </span>
                ) : previewDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewDataUrl}
                    alt="Crop preview"
                    className="max-h-[240px] max-w-full rounded-md object-contain shadow-md"
                  />
                ) : (
                  <span className="text-[11px] text-white/40">
                    Adjust crop…
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-[11px] text-white/60">
                <Stat
                  label="Aspect"
                  value={
                    ASPECT_PRESETS.find((p) => p.id === aspectId)?.label ??
                    "Free"
                  }
                />
                {outputSize && (
                  <Stat
                    label="Output"
                    value={`${outputSize.w} × ${outputSize.h} px`}
                  />
                )}
                <Stat
                  label="Format"
                  value={file.type === "image/png" ? "PNG" : "JPEG"}
                />
              </div>
              <button
                type="button"
                onClick={handleUseOriginal}
                disabled={busy}
                className="mt-auto w-full rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                Use original (skip crop)
              </button>
            </aside>
          </div>

          {/* Local cropper styles — paket default'unu Sentroy paletine
              align ediyoruz. Stencil border ve grid çizgisini ince-keskin
              tutuyoruz (iOS Photos benzeri). */}
          <style>{`
            .sentroy-cropper {
              height: 100%;
              width: 100%;
              background: #000;
            }
            .sentroy-cropper-background {
              background-color: rgba(0, 0, 0, 0.7);
            }
            .sentroy-cropper .advanced-cropper-stencil-overlay {
              background: rgba(0, 0, 0, 0.55);
            }
            .sentroy-cropper .advanced-cropper-rectangle-stencil__draggable-area {
              border: 1px solid rgba(255, 255, 255, 0.95);
            }
            .sentroy-cropper .advanced-cropper-line-wrapper {
              background: rgba(255, 255, 255, 0.95);
            }
            .sentroy-cropper .advanced-cropper-handler-wrapper--west-north,
            .sentroy-cropper .advanced-cropper-handler-wrapper--north-east,
            .sentroy-cropper .advanced-cropper-handler-wrapper--east-south,
            .sentroy-cropper .advanced-cropper-handler-wrapper--south-west {
              width: 22px;
              height: 22px;
            }
            .sentroy-cropper .advanced-cropper-handler-wrapper__draggable {
              background: #fff;
              border: 2px solid #000;
              width: 12px;
              height: 12px;
              border-radius: 2px;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-mono text-white/80">{value}</span>
    </div>
  )
}

function ToolbarIconButton({
  onClick,
  title,
  ariaLabel,
  children,
}: {
  onClick: () => void
  title: string
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="inline-flex size-8 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
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
      className="size-4"
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
      className="size-4"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}

function FlipHorizontalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M16 7l4 5-4 5" />
      <path d="M8 7l-4 5 4 5" />
    </svg>
  )
}

function FlipVerticalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M3 12h18" />
      <path d="M7 8l5-4 5 4" />
      <path d="M7 16l5 4 5-4" />
    </svg>
  )
}
