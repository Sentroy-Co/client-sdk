import { useEffect } from "react"
import type { Media } from "../../types"
import { detectKind, formatBytes } from "./utils"

/**
 * Sadeleştirilmiş lightbox — tek media item için fullscreen preview.
 * Image/video native render, audio HTML5 player, diğerleri "download"
 * fallback. ESC kapat, ←/→ next/prev (caller index callback'i sağlar).
 *
 * Headless yapı: tüm renderable HTML/inline class'lar default; consumer
 * className override'ı ile değiştirebilir.
 */
export interface LightboxProps {
  media: Media
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  className?: string
}

export function Lightbox({
  media,
  onClose,
  onPrev,
  onNext,
  className,
}: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && onPrev) onPrev()
      if (e.key === "ArrowRight" && onNext) onNext()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose, onPrev, onNext])

  const kind = detectKind(media)
  const url = media.url || media.downloadUrl

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={
        className ||
        "fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      }
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Prev */}
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

      {/* Next */}
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

      {/* Content */}
      <div className="flex max-h-full max-w-5xl flex-col items-center gap-3">
        {kind === "image" && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={media.alt ?? media.fileName}
            className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
        {kind === "video" && url && (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full rounded-lg shadow-2xl"
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

        <div className="flex items-center gap-3 rounded-md bg-black/40 px-3 py-1.5 text-xs text-white/80">
          <span className="font-mono truncate max-w-xs">{media.fileName}</span>
          <span>·</span>
          <span>{formatBytes(media.size ?? 0)}</span>
          {media.mimeType && (
            <>
              <span>·</span>
              <span className="font-mono opacity-70">{media.mimeType}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
