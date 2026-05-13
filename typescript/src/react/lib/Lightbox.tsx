import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { Media } from "../../types"
import { pickPresetThumbnailUrl } from "../../thumbnails"
import { detectKind, formatBytes } from "./utils"

/**
 * Sentroy Lightbox — fullscreen single-media preview.
 *
 * Tasarım hedefi: image viewer için "Photos.app" hissiyatı; viewport'a
 * fit (resim ne kadar büyük/uzun olursa olsun ilk açılışta tamamı görünür),
 * fare tekerleği veya butonlarla zoom, zoom>fit iken drag ile pan.
 *
 * Önceki sürüm sabit `max-h-[80vh]` ile portrait/long resimleri kırpıyor +
 * caption şeridi viewport'u taşırıyordu. Yeni sürüm container size'ını
 * ölçer, image natural size'ına göre `fitScale`'i hesaplar ve transform
 * matrisi ile uygular — CSS `max-*` zincirlerine güvenmez.
 *
 * Klavye:
 *   Esc → close, ←/→ → prev/next, +/- → zoom, 0 → reset (fit), Space →
 *   1× ↔ fit toggle.
 */

export interface LightboxProps {
  media: Media
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Outer container override — default fixed inset-0 black backdrop. */
  className?: string
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8

export function Lightbox({
  media,
  onClose,
  onPrev,
  onNext,
  className,
}: LightboxProps) {
  const kind = detectKind(media)
  const url =
    kind === "image"
      ? pickPresetThumbnailUrl(media, "preview") ?? media.url ?? media.downloadUrl
      : media.url ?? media.downloadUrl

  // Body scroll lock + key handlers — bu effect media değişse de aynı kalır.
  const onCloseRef = useRef(onClose)
  const onPrevRef = useRef(onPrev)
  const onNextRef = useRef(onNext)
  onCloseRef.current = onClose
  onPrevRef.current = onPrev
  onNextRef.current = onNext

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  // ── Image-only zoom/pan state ──────────────────────────────────────────
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const dragStateRef = useRef<{
    active: boolean
    startX: number
    startY: number
    baseX: number
    baseY: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Yeni media → state sıfırla (fit recompute imgLoad'da gelir)
  useEffect(() => {
    setNatural(null)
    setFitScale(1)
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [media.id])

  const recomputeFit = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !natural) return
    // Stage'in viewport içindeki boyutu — padding/border yok varsayıyoruz.
    const sw = stage.clientWidth
    const sh = stage.clientHeight
    if (sw <= 0 || sh <= 0) return
    const fit = Math.min(sw / natural.w, sh / natural.h, 1)
    setFitScale(fit)
    setScale(fit)
    setTranslate({ x: 0, y: 0 })
  }, [natural])

  useLayoutEffect(() => {
    recomputeFit()
  }, [recomputeFit])

  useEffect(() => {
    const onResize = () => recomputeFit()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [recomputeFit])

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  // Zoom around a pivot (cursor or center). Pivot stage-relative coords.
  const zoomAt = useCallback(
    (nextScale: number, pivot?: { x: number; y: number }) => {
      const stage = stageRef.current
      if (!stage) return
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
      const rect = stage.getBoundingClientRect()
      const cx = pivot?.x ?? rect.width / 2
      const cy = pivot?.y ?? rect.height / 2
      // Image origin relative to stage center (current translate accounted)
      // p = ((c - center) - t) / s → world coords. Yeni translate:
      // t' = (c - center) - p * s'
      const ox = cx - rect.width / 2 - translate.x
      const oy = cy - rect.height / 2 - translate.y
      const ratio = clamped / scale
      const tx = cx - rect.width / 2 - ox * ratio
      const ty = cy - rect.height / 2 - oy * ratio
      setScale(clamped)
      setTranslate({ x: tx, y: ty })
    },
    [scale, translate],
  )

  const zoomBy = useCallback(
    (factor: number, pivot?: { x: number; y: number }) =>
      zoomAt(scale * factor, pivot),
    [scale, zoomAt],
  )

  const resetView = useCallback(() => {
    setScale(fitScale)
    setTranslate({ x: 0, y: 0 })
  }, [fitScale])

  const toggle1x = useCallback(() => {
    if (Math.abs(scale - 1) < 0.001) {
      resetView()
    } else {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
  }, [scale, resetView])

  // Wheel zoom (cursor-aware)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (kind !== "image") return
      e.preventDefault()
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomBy(factor, pivot)
    },
    [kind, zoomBy],
  )

  // Drag-to-pan
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (kind !== "image") return
      // Sadece sol tıklama (button 0) veya touch
      if (e.button !== 0 && e.pointerType === "mouse") return
      dragStateRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        baseX: translate.x,
        baseY: translate.y,
      }
      setIsDragging(true)
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [kind, translate],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ds = dragStateRef.current
      if (!ds?.active) return
      e.preventDefault()
      const dx = e.clientX - ds.startX
      const dy = e.clientY - ds.startY
      setTranslate({ x: ds.baseX + dx, y: ds.baseY + dy })
    },
    [],
  )

  const endDrag = useCallback(() => {
    if (dragStateRef.current?.active) {
      dragStateRef.current.active = false
      setIsDragging(false)
    }
  }, [])

  // Klavye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
      ) {
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
      } else if (e.key === "ArrowLeft" && onPrevRef.current) {
        e.preventDefault()
        onPrevRef.current()
      } else if (e.key === "ArrowRight" && onNextRef.current) {
        e.preventDefault()
        onNextRef.current()
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        zoomBy(1.2)
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        zoomBy(1 / 1.2)
      } else if (e.key === "0") {
        e.preventDefault()
        resetView()
      } else if (e.key === " ") {
        e.preventDefault()
        toggle1x()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [zoomBy, resetView, toggle1x])

  const canPan = kind === "image" && scale > fitScale + 0.001

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={
        className ||
        "fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      }
    >
      {/* Top bar — close + filename */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3 text-xs text-white/70">
          <span className="font-mono truncate max-w-md">
            {media.fileName}
          </span>
          {media.size ? (
            <span className="text-white/40">·</span>
          ) : null}
          {media.size ? <span>{formatBytes(media.size)}</span> : null}
          {media.mimeType ? (
            <>
              <span className="text-white/40">·</span>
              <span className="font-mono text-white/40">{media.mimeType}</span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        onWheel={handleWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative flex flex-1 min-h-0 items-center justify-center overflow-hidden select-none"
        style={{
          cursor:
            kind === "image"
              ? isDragging
                ? "grabbing"
                : canPan
                  ? "grab"
                  : "default"
              : "default",
        }}
      >
        {kind === "image" && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={url}
            alt={media.alt ?? media.fileName}
            draggable={false}
            onLoad={handleImgLoad}
            onDoubleClick={toggle1x}
            className="origin-center select-none"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: isDragging ? "none" : "transform 0.18s ease-out",
              maxWidth: "none",
              maxHeight: "none",
              willChange: "transform",
            }}
          />
        )}
        {kind === "video" && url && (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        )}
        {kind === "audio" && url && (
          <div className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-white/10 p-6 text-white">
            <div className="text-center text-sm font-medium">
              {media.fileName}
            </div>
            <audio src={url} controls className="w-full" />
          </div>
        )}
        {kind !== "image" && kind !== "video" && kind !== "audio" && (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-white/10 p-8 text-white">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <div className="text-sm font-medium">{media.fileName}</div>
            <a
              href={url}
              download={media.fileName}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90"
            >
              Download
            </a>
          </div>
        )}

        {/* Prev / Next nav — overlay'da, alttaki bottom bar tarafından
            gizlenmesin diye nav transform-y-50% */}
        {onPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            aria-label="Previous"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            aria-label="Next"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom toolbar — image only (zoom controls + readout) */}
      {kind === "image" && (
        <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-4 py-2.5">
          <ToolbarBtn onClick={() => zoomBy(1 / 1.2)} title="Zoom out (−)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="11" cy="11" r="7" />
              <path d="M8 11h6M21 21l-4.3-4.3" />
            </svg>
          </ToolbarBtn>
          <span className="font-mono text-[11px] text-white/60 min-w-[3.5rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarBtn onClick={() => zoomBy(1.2)} title="Zoom in (+)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="11" cy="11" r="7" />
              <path d="M8 11h6M11 8v6M21 21l-4.3-4.3" />
            </svg>
          </ToolbarBtn>
          <span className="mx-2 h-5 w-px bg-white/15" />
          <ToolbarBtn onClick={resetView} title="Fit (0)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </ToolbarBtn>
          <ToolbarBtn onClick={toggle1x} title="100% (Space)">
            <span className="font-mono text-[11px] font-medium">1:1</span>
          </ToolbarBtn>
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex size-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}
