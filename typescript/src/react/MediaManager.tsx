import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Sentroy } from ".."
import type { Bucket, Media } from "../types"
import { Lightbox } from "./lib/Lightbox"
import { useMediaList } from "./lib/use-media-list"
import { useUploadQueue } from "./lib/use-upload-queue"
import { UploadQueuePanel } from "./lib/UploadQueuePanel"
import { pickPresetThumbnailUrl } from "../thumbnails"
import {
  cn,
  detectKind,
  formatBytes,
  KIND_LABELS,
  matchAccept,
  type MediaKind,
} from "./lib/utils"

/**
 * MediaManager — Sentroy storage'a bağlanan tek-component dosya yöneticisi.
 *
 * Tasarım hedefleri:
 *  - Tek bir prop'la (`client`) tam workflow: bucket select → list → arama →
 *    upload → seç → preview (lightbox) → delete.
 *  - Ne single ne multi-file selection için zorla; `multiple` prop'u akış
 *    belirler. `onChange` her seçim değişikliğinde tetiklenir.
 *  - `initialValue` ile pre-selected file'lar (Media obje veya id string).
 *  - Tema override: kök `className` + `classNames` map ile alt-component
 *    class'larını override edebilir consumer (ileride farklı tema
 *    promptları için tek değişiklik noktası).
 *  - Spacebar selected item'i lightbox'ta açar; ESC kapatır.
 *  - Drag-drop + click-to-upload.
 *
 * Tailwind class kullanır ama kendisi Tailwind import etmez — host app'in
 * Tailwind setup'ı kullanılır. Class çakışmalarında tailwind-merge yerine
 * "consumer'ın className son geliyor" kuralı yeterli.
 */

export interface MediaManagerClassNames {
  root?: string
  toolbar?: string
  searchInput?: string
  filterSelect?: string
  uploadButton?: string
  bucketSelect?: string
  grid?: string
  card?: string
  cardSelected?: string
  thumbnail?: string
  cardMeta?: string
  empty?: string
  details?: string
  dropZoneOverlay?: string
}

export interface MediaManagerProps {
  /** Sentroy client instance — caller kendi access token'i ile yaratır. */
  client: Sentroy
  /**
   * Başlangıçta açılacak bucket. Verilmezse component bucket list çeker
   * ve ilkini açar; ilk render'da kullanıcı dropdown'tan değiştirebilir.
   */
  bucketSlug?: string
  /** Birden fazla seçilebilir mi? Default false. */
  multiple?: boolean
  /**
   * Multi-mode'da cap. multiple=true iken cap'e ulaşılınca yeni seçim
   * sessizce engellenir. multiple=false iken yok sayılır (single = 1).
   * Default: undefined (cap yok).
   */
  maxItems?: number
  /**
   * Upload + grid filter için MIME pattern — örn `"image/*"`,
   * `"image/png,image/jpeg"`, `"video/*,application/pdf"`.
   * - Upload `<input type="file">` `accept` özniteliğine geçer.
   * - Grid'de `accept` ile uyumlu olmayan item'lar gizlenir
   *   (kullanıcı yine de bucket'ında görebilir ama picker'da seçemez).
   */
  accept?: string
  /** Kullanıcının önceden seçtiği item'lar — Media obje ya da id string. */
  initialValue?: Array<Media | string>
  /** Seçim her değiştiğinde — tek seçimde array.length<=1. */
  onChange?: (selected: Media[]) => void
  /** Çift tık veya tek seçim "confirm" — picker dialog'larda useful. */
  onSelect?: (selected: Media[]) => void
  /** Bucket dropdown'unda hangi bucket'lar görünsün — gizli system
   *  bucket'larını filtrelemek için. */
  bucketFilter?: (bucket: Bucket) => boolean
  /** Custom kök class. */
  className?: string
  /** Alt-component class override haritası. */
  classNames?: MediaManagerClassNames
  /** Detail panel'i sağda göster mi (default true). */
  showDetailsPane?: boolean
  /** Toolbar'da bucket selector görünsün mü (default true). */
  showBucketSelector?: boolean
  /**
   * Yükleme öncesi her dosya için çağrılan async hook. Caller dosyayı
   * dönüştürebilir (örn. image crop), `null` döndürerek skip edebilir.
   * Verilmezse dosyalar olduğu gibi yüklenir.
   *
   * @example Image crop
   * ```ts
   * preprocessFile={async (file) => {
   *   if (!file.type.startsWith("image/")) return file
   *   return await openCropDialog(file) // ya orijinal File ya cropped File
   * }}
   * ```
   */
  preprocessFile?: (file: File) => Promise<File | null>
}

const KIND_FILTERS: Array<{ value: MediaKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "image", label: KIND_LABELS.image },
  { value: "video", label: KIND_LABELS.video },
  { value: "audio", label: KIND_LABELS.audio },
  { value: "pdf", label: KIND_LABELS.pdf },
  { value: "doc", label: KIND_LABELS.doc },
  { value: "archive", label: KIND_LABELS.archive },
  { value: "code", label: KIND_LABELS.code },
  { value: "other", label: KIND_LABELS.other },
]

export function MediaManager(props: MediaManagerProps) {
  const {
    client,
    bucketSlug: initialBucketSlug,
    multiple = false,
    maxItems,
    accept,
    initialValue,
    onChange,
    onSelect,
    bucketFilter,
    className,
    classNames: cls = {},
    showDetailsPane = true,
    showBucketSelector = true,
    preprocessFile,
  } = props

  // ── Bucket state ───────────────────────────────────────────────────────
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [bucketsLoading, setBucketsLoading] = useState(false)
  const [activeBucketSlug, setActiveBucketSlug] = useState<string | null>(
    initialBucketSlug ?? null,
  )

  useEffect(() => {
    setBucketsLoading(true)
    client.buckets
      .list()
      .then((list) => {
        const filtered = bucketFilter ? list.filter(bucketFilter) : list
        setBuckets(filtered)
        if (!activeBucketSlug && filtered.length > 0) {
          setActiveBucketSlug(filtered[0].slug)
        }
      })
      .catch(() => {
        setBuckets([])
      })
      .finally(() => setBucketsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  // ── Media list ────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0)
  const { items, loading, error } = useMediaList({
    client,
    bucketSlug: activeBucketSlug,
    refreshKey,
  })

  // ── Selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const v of initialValue ?? []) {
      initial.add(typeof v === "string" ? v : v.id)
    }
    return initial
  })

  // initialValue Media[] ise hemen onChange'i çağır ki parent state senkron
  // başlasın. Sadece mount'ta.
  useEffect(() => {
    if (!initialValue || initialValue.length === 0) return
    const objects = initialValue.filter(
      (v): v is Media => typeof v !== "string",
    )
    if (objects.length > 0) onChange?.(objects)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSelect = useCallback(
    (media: Media) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (multiple) {
          if (next.has(media.id)) {
            next.delete(media.id)
          } else {
            // maxItems cap — multi-mode'da limite ulaşıldıysa yeni
            // seçimi engelle (mevcut state'i değiştirmeden döndür).
            if (typeof maxItems === "number" && next.size >= maxItems) {
              return prev
            }
            next.add(media.id)
          }
        } else {
          // Single: aynısı tıklanırsa deselect
          if (next.has(media.id) && next.size === 1) next.clear()
          else {
            next.clear()
            next.add(media.id)
          }
        }
        return next
      })
    },
    [multiple, maxItems],
  )

  const selected = useMemo(
    () => items.filter((m) => selectedIds.has(m.id)),
    [items, selectedIds],
  )

  // selected değiştiğinde onChange'i çağır
  useEffect(() => {
    onChange?.(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, items])

  // ── Search + filter ────────────────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<MediaKind | "all">("all")

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((m) => {
      if (q && !m.fileName.toLowerCase().includes(q)) return false
      if (kindFilter !== "all" && detectKind(m) !== kindFilter) return false
      if (accept && !matchAccept(m, accept)) return false
      return true
    })
  }, [items, search, kindFilter, accept])

  // ── Upload ─────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Queue: per-file progress + abort + concurrency-pooled. Pre-upload hook
  // (`preprocessFile`) image crop gibi caller-side transform yapabilir;
  // null dönerse dosya skip, File dönerse o swap'lenir.
  const queue = useUploadQueue(client, {
    concurrency: 3,
    onUploaded: () => setRefreshKey((k) => k + 1),
  })
  const uploading = queue.activeCount > 0

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!activeBucketSlug) return
      const incoming = Array.from(files)
      const processed: File[] = []
      for (const file of incoming) {
        const out = preprocessFile ? await preprocessFile(file) : file
        if (out) processed.push(out)
      }
      if (processed.length > 0) queue.enqueue(activeBucketSlug, processed)
    },
    [activeBucketSlug, queue, preprocessFile],
  )

  // ── Delete ─────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const handleDelete = useCallback(
    async (media: Media) => {
      if (!activeBucketSlug) return
      const ok = window.confirm(`Delete ${media.fileName}?`)
      if (!ok) return
      setDeletingId(media.id)
      try {
        await client.media.delete(activeBucketSlug, media.id)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(media.id)
          return next
        })
        setRefreshKey((k) => k + 1)
      } finally {
        setDeletingId(null)
      }
    },
    [client, activeBucketSlug],
  )

  // ── Lightbox (spacebar opens for active selection) ─────────────────────
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      // Input/textarea içinde değilse spacebar lightbox'ı açar.
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select") return
      if (selected.length === 0 || lightboxIdx !== null) return
      e.preventDefault()
      const idx = visibleItems.findIndex((m) => m.id === selected[0].id)
      if (idx >= 0) setLightboxIdx(idx)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selected, visibleItems, lightboxIdx])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-background text-foreground",
        className,
        cls.root,
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
      }}
    >
      {/* Toolbar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-3 py-2",
          cls.toolbar,
        )}
      >
        {showBucketSelector && (
          <select
            value={activeBucketSlug ?? ""}
            onChange={(e) => setActiveBucketSlug(e.target.value || null)}
            disabled={bucketsLoading || buckets.length === 0}
            className={cn(
              "h-8 rounded-md border bg-transparent px-2 text-xs",
              cls.bucketSelect,
            )}
          >
            {buckets.length === 0 && <option value="">No buckets</option>}
            {buckets.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          className={cn(
            "h-8 flex-1 rounded-md border bg-transparent px-2 text-xs",
            cls.searchInput,
          )}
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as MediaKind | "all")}
          className={cn(
            "h-8 rounded-md border bg-transparent px-2 text-xs",
            cls.filterSelect,
          )}
        >
          {KIND_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!activeBucketSlug || uploading}
          className={cn(
            "h-8 rounded-md border bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50",
            cls.uploadButton,
          )}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple || true}
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              uploadFiles(e.target.files)
              e.target.value = ""
            }
          }}
        />
      </div>

      {/* Grid + details */}
      <div className="flex min-h-[280px] flex-1">
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-md bg-muted/50"
                />
              ))}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && visibleItems.length === 0 && (
            <div
              className={cn(
                "flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground",
                cls.empty,
              )}
            >
              <span>No files match.</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs underline"
              >
                Upload one
              </button>
            </div>
          )}
          {!loading && !error && visibleItems.length > 0 && (
            <div
              className={cn(
                "grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
                cls.grid,
              )}
            >
              {visibleItems.map((media) => {
                const isSel = selectedIds.has(media.id)
                const kind = detectKind(media)
                // Grid card 200-300 px display — orijinal 4K JPG yerine
                // "card" preset (~500px) thumbnail. Gerçek thumbnail yoksa
                // helper orijinale fallback yapar.
                const thumb =
                  kind === "image"
                    ? pickPresetThumbnailUrl(media, "card") ?? null
                    : null
                return (
                  <button
                    key={media.id}
                    type="button"
                    onClick={() => toggleSelect(media)}
                    onDoubleClick={() => {
                      const idx = visibleItems.findIndex(
                        (m) => m.id === media.id,
                      )
                      if (idx >= 0) {
                        if (!isSel) toggleSelect(media)
                        setLightboxIdx(idx)
                        if (multiple === false && onSelect) {
                          onSelect([media])
                        }
                      }
                    }}
                    className={cn(
                      "group flex flex-col overflow-hidden rounded-md border text-start transition-all",
                      isSel
                        ? cn(
                            "border-foreground/60 ring-2 ring-foreground/30",
                            cls.cardSelected,
                          )
                        : "border-border hover:border-foreground/30",
                      cls.card,
                    )}
                  >
                    <div
                      className={cn(
                        "relative aspect-square overflow-hidden bg-muted/40",
                        cls.thumbnail,
                      )}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={media.alt ?? media.fileName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-[10px] uppercase text-muted-foreground">
                          {KIND_LABELS[kind]}
                        </div>
                      )}
                      {isSel && (
                        <div className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex flex-col gap-0.5 px-2 py-1.5 text-[11px]",
                        cls.cardMeta,
                      )}
                    >
                      <span className="truncate font-medium">
                        {media.fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(media.size ?? 0)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {showDetailsPane && (
          <aside
            className={cn(
              "hidden w-64 shrink-0 flex-col gap-2 border-s bg-muted/10 p-3 lg:flex",
              cls.details,
            )}
          >
            {selected.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Select a file to see details. Press{" "}
                <kbd className="rounded border bg-muted px-1 text-[10px]">
                  Space
                </kbd>{" "}
                to preview.
              </div>
            ) : selected.length === 1 ? (
              (() => {
                const m = selected[0]
                const kind = detectKind(m)
                return (
                  <>
                    <div className="aspect-square overflow-hidden rounded-md bg-muted/30">
                      {kind === "image" &&
                      pickPresetThumbnailUrl(m, "card") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pickPresetThumbnailUrl(m, "card") ?? ""}
                          alt={m.alt ?? m.fileName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                          {KIND_LABELS[kind]}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="break-all text-xs font-medium">
                        {m.fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(m.size ?? 0)}
                        {m.mimeType ? ` · ${m.mimeType}` : ""}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const idx = visibleItems.findIndex(
                            (it) => it.id === m.id,
                          )
                          if (idx >= 0) setLightboxIdx(idx)
                        }}
                        className="flex-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted/50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m)}
                        disabled={deletingId === m.id}
                        className="flex-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {deletingId === m.id ? "…" : "Delete"}
                      </button>
                    </div>
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => onSelect(selected)}
                        className="rounded-md bg-foreground px-2 py-1.5 text-[11px] font-medium text-background hover:opacity-90"
                      >
                        Use selection
                      </button>
                    )}
                  </>
                )
              })()
            ) : (
              <>
                <div className="text-xs font-medium">
                  {selected.length} files selected
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Total {formatBytes(
                    selected.reduce((s, m) => s + (m.size ?? 0), 0),
                  )}
                </div>
                {onSelect && (
                  <button
                    type="button"
                    onClick={() => onSelect(selected)}
                    className="mt-auto rounded-md bg-foreground px-2 py-1.5 text-[11px] font-medium text-background hover:opacity-90"
                  >
                    Use selection
                  </button>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed border-foreground/40 bg-foreground/5",
            cls.dropZoneOverlay,
          )}
        />
      )}

      {/* Upload queue panel — entries varsa görünür, alttan slide-in */}
      <UploadQueuePanel
        entries={queue.entries}
        onCancel={queue.cancel}
        onRemove={queue.remove}
        onClearDone={queue.clearDone}
      />

      {/* Lightbox */}
      {lightboxIdx !== null && visibleItems[lightboxIdx] && (
        <Lightbox
          media={visibleItems[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
          onPrev={
            lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined
          }
          onNext={
            lightboxIdx < visibleItems.length - 1
              ? () => setLightboxIdx(lightboxIdx + 1)
              : undefined
          }
        />
      )}
    </div>
  )
}
