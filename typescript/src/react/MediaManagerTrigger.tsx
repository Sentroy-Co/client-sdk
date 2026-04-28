import { useCallback, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { Media } from "../types"
import { MediaManager, type MediaManagerProps } from "./MediaManager"
import { cn } from "./lib/utils"

/**
 * MediaManagerTrigger — herhangi bir consumer-defined öğe (button, avatar
 * thumb, ikon, vb.) tıklandığında MediaManager'ı modal içinde açan
 * sarmalayıcı.
 *
 * Tasarım hedefi: kullanıcı kendi tetikleyicisini (`trigger` prop) verir,
 * tıklanma + modal yönetimi + confirm/cancel akışı SDK tarafında olur.
 * Böylece consumer her seferinde Dialog state ve render boilerplate'ini
 * yazmak zorunda kalmaz — sadece "şu butonum şu callback'i tetiklesin"
 * kadar kısa olur.
 *
 * Modal Tailwind utility class kullanır (host app'in design token'ları)
 * ve `react-dom` portal ile `<body>`'ye render edilir — parent
 * overflow:hidden / transform stacking context'lerine takılmaz.
 *
 * @example
 * ```tsx
 * <MediaManagerTrigger
 *   client={client}
 *   trigger={<Button>Change avatar</Button>}
 *   maxItems={1}
 *   accept="image/*"
 *   onSelect={(media) => console.log(media[0].url)}
 * />
 * ```
 */

export interface MediaManagerTriggerProps
  extends Omit<MediaManagerProps, "onSelect" | "onChange" | "multiple"> {
  /** Tıklanabilir herhangi bir öğe — button, image, div, vb. */
  trigger: ReactNode
  /**
   * Maksimum seçilebilir item sayısı. 1 = single mode, >1 = multi up to
   * cap. Default 1. Cap'e ulaşılınca yeni item seçimi sessizce engellenir.
   */
  maxItems?: number
  /** Confirm — kullanıcı "Use selection" butonuna bastığında çağrılır. */
  onSelect: (selected: Media[]) => void
  /** Modal başlığı. Default "Select media". */
  title?: string
  /** Modal description satırı (opsiyonel). */
  description?: string
  /**
   * Controlled mode — open state'ini parent yönetmek isterse.
   * Default uncontrolled (kendi içinde useState).
   */
  open?: boolean
  /** Controlled mode için open değişikliği callback'i. */
  onOpenChange?: (open: boolean) => void
  /** Modal panel class override. */
  modalClassName?: string
  /** Trigger wrapper class — default `inline-block cursor-pointer`. */
  triggerClassName?: string
  /** Confirm butonu metni. Default "Use selection". */
  confirmLabel?: string
  /** Cancel butonu metni. Default "Cancel". */
  cancelLabel?: string
  /** Trigger'ın disabled durumu — modal açılmaz. */
  disabled?: boolean
}

export function MediaManagerTrigger(props: MediaManagerTriggerProps) {
  const {
    trigger,
    maxItems = 1,
    onSelect,
    title = "Select media",
    description,
    open: controlledOpen,
    onOpenChange,
    modalClassName,
    triggerClassName,
    confirmLabel = "Use selection",
    cancelLabel = "Cancel",
    disabled = false,
    ...mmProps
  } = props

  const [internalOpen, setInternalOpen] = useState(false)
  const [selected, setSelected] = useState<Media[]>([])
  const [mounted, setMounted] = useState(false)

  // SSR guard — portal yalnızca client'ta.
  useEffect(() => {
    setMounted(true)
  }, [])

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = useCallback(
    (v: boolean) => {
      if (!isControlled) setInternalOpen(v)
      onOpenChange?.(v)
      if (!v) setSelected([])
    },
    [isControlled, onOpenChange],
  )

  // ESC — modal'ı kapat.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  // Body scroll lock — modal açıkken arka planda scroll olmasın.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const handleConfirm = useCallback(() => {
    onSelect(selected)
    setOpen(false)
  }, [onSelect, selected, setOpen])

  const handleTriggerClick = useCallback(() => {
    if (disabled) return
    setOpen(true)
  }, [disabled, setOpen])

  // Trigger — span'a click handler bağla. Consumer'ın trigger'ı zaten
  // button olabilir; bu durumda nested button HTML invalid olur ama
  // tarayıcılar tolere eder. İstenirse triggerClassName ile span yerine
  // başka semantik kullanılabilir (consumer kendi trigger'ında onClick
  // override edemez — modal handler'ı her zaman çalışır).
  const triggerNode = (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-disabled={disabled}
      onClick={handleTriggerClick}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setOpen(true)
        }
      }}
      className={cn(
        "inline-block",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        triggerClassName,
      )}
    >
      {trigger}
    </span>
  )

  const modalNode =
    open && mounted ? (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sentroy-mm-title"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            // Default boyutlar mütevazı — single-image avatar/cover picker
            // için idealdir. Geniş kullanım için consumer `modalClassName`
            // ile `max-w-5xl` veya `max-w-7xl` set edebilir.
            //
            // `h-[min(80vh,640px)]` küçük ekranda viewport oranlı,
            // 4K/ultrawide ekranda 640px hard cap — modal tüm ekranı
            // kaplamaz, dialog hissi korunur.
            "relative z-10 flex h-[min(85vh,640px)] w-full max-w-[60vw] flex-col gap-3 rounded-xl border bg-background p-4 shadow-2xl",
            modalClassName,
          )}
          style={{
            maxWidth: "60vw",
            minHeight: "85vh",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="sentroy-mm-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
              aria-label="Close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MediaManager
              {...mmProps}
              multiple={maxItems > 1}
              maxItems={maxItems}
              onChange={setSelected}
              className={cn("h-full", mmProps.className)}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs text-muted-foreground">
              {selected.length === 0
                ? maxItems === 1
                  ? "Select an item"
                  : `Select up to ${maxItems} items`
                : maxItems === 1
                  ? "1 item selected"
                  : `${selected.length} / ${maxItems} selected`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted/50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.length === 0}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null

  return (
    <>
      {triggerNode}
      {mounted && modalNode ? createPortal(modalNode, document.body) : null}
    </>
  )
}
