import { useCallback, useEffect, useRef, useState } from "react"
import { Cropper, type CropperRef } from "react-mobile-cropper"
import { motion, AnimatePresence } from "motion/react"

/**
 * Image crop dialog — iOS Photos benzeri full-screen crop UI.
 * `react-mobile-cropper` üzerine kurulu; paket native olarak iOS-vari
 * stencil + handler + transition davranışı veriyor (manual layout/icon
 * gerek yok).
 *
 * iOS Photos pattern:
 *   - Header: Cancel (sol) — "Crop" başlığı (orta) — Done (sağ)
 *   - Main: Cropper full width, stencil ile karartılmış kenar
 *   - Bottom toolbar: aspect chip'leri (Free / 1:1 / 4:3 / 16:9 / 3:2 / 9:16)
 *     + sağ tarafta tek rotate ikonu
 *
 * Preview thumbnail kasıtlı olarak yok — iOS Photos'ta da yok; kullanıcı
 * stencil'in içini direkt görüyor.
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

const MAX_PIXEL_GUARD = 50_000_000 // ~24 MP

export interface CropDialogProps {
  open: boolean
  /** Crop edilecek dosya. Image MIME değilse modal hiç açılmaz (caller'da
   *  filter). */
  file: File
  /** Apply: cropped File döner. Cancel: null. Use original: orijinal File. */
  onClose: (result: File | null) => void
  /** Default aspect preset id'si — 'free' (default) veya '1:1', '16:9', vb. */
  defaultAspect?: string
  /** Output JPEG quality 0-1 (default 0.92). PNG'ler için PNG korunur. */
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
  const cropperRef = useRef<CropperRef | null>(null)

  // Object URL lifecycle
  useEffect(() => {
    if (!open) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setAspectId(defaultAspect)
    setTooLarge(false)
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > MAX_PIXEL_GUARD) {
        setTooLarge(true)
      }
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [open, file, defaultAspect])

  const aspectRatio =
    ASPECT_PRESETS.find((p) => p.id === aspectId)?.aspect ?? undefined

  // Aspect preset değişirse stencil koordinatlarını yeni aspect'e snap'le
  useEffect(() => {
    const cropper = cropperRef.current
    if (!cropper || aspectRatio === undefined) return
    const state = cropper.getState()
    const c = state?.coordinates
    if (!c) return
    const newWidth = c.width
    const newHeight = c.width / aspectRatio
    cropper.setCoordinates({ width: newWidth, height: newHeight })
  }, [aspectRatio, aspectId])

  const handleApply = useCallback(async () => {
    const cropper = cropperRef.current
    if (!cropper) return
    setBusy(true)
    try {
      const canvas = cropper.getCanvas({ imageSmoothingQuality: "high" })
      if (!canvas) {
        setBusy(false)
        return
      }
      const outputMime =
        file.type === "image/png" ? "image/png" : "image/jpeg"
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
  const handleRotate = useCallback(() => {
    cropperRef.current?.rotateImage(90)
  }, [])

  // ESC kapat, R rotate
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
        handleRotate()
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
          // Inline color — host app'in tema değişkenleri text-white
          // utility'sini override etse bile child icon/text bu rengi
          // inherit eder (rotate ikonu, chip metinleri vs).
          style={{ color: "#ffffff" }}
          className="fixed inset-0 z-[60] flex flex-col bg-black"
        >
          {/* Header — iOS Photos: Cancel sol / başlık orta / Done sağ */}
          <header
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              style={{ color: "rgba(255,255,255,0.85)" }}
              className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <div className="flex min-w-0 flex-col items-center text-center">
              <span className="text-sm font-semibold">Crop</span>
              <span
                style={{ color: "rgba(255,255,255,0.5)" }}
                className="truncate max-w-xs text-[11px]"
              >
                {file.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || tooLarge}
              style={{ backgroundColor: "#fff", color: "#0a0a0a" }}
              className="rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Cropping…" : "Done"}
            </button>
          </header>

          {/* Main: cropper full bleed */}
          <div className="relative flex-1 min-h-0 bg-black">
            {tooLarge ? (
              <div
                style={{ color: "rgba(255,255,255,0.7)" }}
                className="flex h-full w-full items-center justify-center p-6 text-center text-sm"
              >
                Image too large to crop in browser. Upload as-is or resize
                beforehand.
              </div>
            ) : (
              <Cropper
                ref={cropperRef}
                src={imageUrl}
                stencilProps={{
                  aspectRatio: aspectRatio,
                }}
                className="sentroy-mobile-cropper"
              />
            )}
          </div>

          {/* Bottom toolbar — aspect chips (sol) + rotate (sağ).
              iOS Photos pattern. */}
          <footer
            className="flex items-center gap-2 px-3 py-3"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div
              className="flex flex-1 items-center gap-1 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {ASPECT_PRESETS.map((p) => {
                const active = aspectId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAspectId(p.id)}
                    style={
                      active
                        ? { backgroundColor: "#fff", color: "#0a0a0a" }
                        : { color: "rgba(255,255,255,0.7)" }
                    }
                    className={
                      "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors " +
                      (active ? "font-medium" : "hover:bg-white/10")
                    }
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div
              className="mx-2 hidden h-5 w-px md:block"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />
            <button
              type="button"
              onClick={handleRotate}
              title="Rotate (R)"
              aria-label="Rotate"
              style={{ color: "rgba(255,255,255,0.85)" }}
              className="inline-flex shrink-0 size-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            >
              <RotateIcon />
            </button>
            <button
              type="button"
              onClick={handleUseOriginal}
              disabled={busy}
              style={{ color: "rgba(255,255,255,0.6)" }}
              className="hidden shrink-0 rounded-md px-3 py-1.5 text-[11px] transition-colors hover:bg-white/10 disabled:opacity-50 sm:inline-flex"
            >
              Use original
            </button>
          </footer>

          {/* Cropper container sizing — paketin kendi style.css'i çoğu
              görseli sağlar; bizim sadece full-bleed boyutlama. Cropper'ın
              ana rengini (stencil border + handler accent) `color`
              property'si üzerinden geçir; root'a beyaz set ettik. */}
          <style>{`
            .sentroy-mobile-cropper {
              height: 100%;
              width: 100%;
              background: #000;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function RotateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}
