import { useCallback, useRef, useState } from "react"
import type { Sentroy } from "../.."
import type { Media } from "../../types"

/**
 * Tek dosyalık upload entry — UI tarafında queue listesi olarak render edilir.
 *
 * State machine:
 *   queued → uploading → done | error | canceled
 * `error` ve `canceled` terminal; `done` terminal + `media` set olur.
 */
export interface UploadEntry {
  id: string
  file: File
  status: "queued" | "uploading" | "done" | "error" | "canceled"
  loaded: number
  total: number
  /** Server response — done iken non-null. */
  media?: Media
  error?: string
  /** Per-entry cancel handle (XHR abort'u tetikler). */
  cancel: () => void
}

export interface UseUploadQueueOptions {
  /** Aynı anda kaç dosya yüklensin. Default 3. */
  concurrency?: number
  /** Dosya başarıyla yüklendiğinde tetiklenir — caller refresh edebilir. */
  onUploaded?: (media: Media) => void
}

export interface UseUploadQueueResult {
  entries: UploadEntry[]
  /** Yeni dosyaları queue'ya ekler ve worker'ı tetikler. */
  enqueue: (bucketSlug: string, files: File[]) => void
  /** Bir entry'i iptal eder (uploading ise XHR abort, queued ise drop). */
  cancel: (id: string) => void
  /** Tek bir entry'i listeden temizler (terminal state'tekiler için). */
  remove: (id: string) => void
  /** Done/error/canceled olanları listeden temizler. */
  clearDone: () => void
  /** Aktif (queued + uploading) entry sayısı. */
  activeCount: number
}

/**
 * Upload queue hook — concurrency-pooled, per-entry progress + cancel.
 *
 * Storage app'in `apps/storage/lib/upload-client.ts` + `FileUploader` queue
 * davranışını SDK'ya taşır. SDK consumer'ı (MediaManager veya 3rd-party)
 * `entries` array'ini render eder, `enqueue`/`cancel`/`remove` çağırır.
 *
 * onUploaded: caller refresh için kullanır (örn `setRefreshKey + 1`).
 */
export function useUploadQueue(
  client: Sentroy,
  opts: UseUploadQueueOptions = {},
): UseUploadQueueResult {
  const concurrency = opts.concurrency ?? 3
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const entriesRef = useRef<UploadEntry[]>([])
  entriesRef.current = entries
  const onUploadedRef = useRef(opts.onUploaded)
  onUploadedRef.current = opts.onUploaded

  // Worker pump — queued entry varsa ve aktif < concurrency ise başlat.
  const pumpRef = useRef<() => void>(() => {})

  const updateEntry = useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
    },
    [],
  )

  pumpRef.current = () => {
    const list = entriesRef.current
    const active = list.filter((e) => e.status === "uploading").length
    if (active >= concurrency) return
    const next = list.find((e) => e.status === "queued")
    if (!next) return

    // Mark uploading
    updateEntry(next.id, { status: "uploading" })

    // Bucket slug entry içine save edilemiyor (entry shape'i bilmesi
    // gerekmez); enqueue closure'unda capture edilir, ayrı bucket map.
    const bucketSlug = bucketMapRef.current[next.id]
    if (!bucketSlug) {
      updateEntry(next.id, { status: "error", error: "No bucket" })
      pumpRef.current?.()
      return
    }

    const controller = new AbortController()
    cancelMapRef.current[next.id] = () => controller.abort()

    client.media
      .upload(
        bucketSlug,
        { body: next.file, filename: next.file.name },
        {
          onProgress: (loaded, total) => {
            updateEntry(next.id, { loaded, total })
          },
          signal: controller.signal,
        },
      )
      .then((media) => {
        updateEntry(next.id, {
          status: "done",
          media,
          loaded: next.file.size,
          total: next.file.size,
        })
        onUploadedRef.current?.(media)
      })
      .catch((err: unknown) => {
        const aborted =
          (err as { message?: string })?.message === "Upload aborted"
        updateEntry(next.id, {
          status: aborted ? "canceled" : "error",
          error: aborted
            ? undefined
            : (err as Error)?.message ?? "Upload failed",
        })
      })
      .finally(() => {
        delete cancelMapRef.current[next.id]
        // Yeni slot açıldı; başka queued varsa al.
        pumpRef.current?.()
      })

    // Aynı tick'te birden fazla slot doldur.
    if (active + 1 < concurrency) pumpRef.current?.()
  }

  const bucketMapRef = useRef<Record<string, string>>({})
  const cancelMapRef = useRef<Record<string, () => void>>({})

  const enqueue = useCallback(
    (bucketSlug: string, files: File[]) => {
      if (files.length === 0) return
      const newEntries: UploadEntry[] = files.map((file) => {
        const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        bucketMapRef.current[id] = bucketSlug
        return {
          id,
          file,
          status: "queued",
          loaded: 0,
          total: file.size,
          cancel: () => {
            const c = cancelMapRef.current[id]
            if (c) c()
            else
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === id && e.status === "queued"
                    ? { ...e, status: "canceled" }
                    : e,
                ),
              )
          },
        }
      })
      setEntries((prev) => [...prev, ...newEntries])
      // pump on next tick — state update'ten sonra entriesRef güncel olsun
      Promise.resolve().then(() => pumpRef.current?.())
    },
    [],
  )

  const cancel = useCallback((id: string) => {
    const c = cancelMapRef.current[id]
    if (c) c()
    else
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id && e.status === "queued"
            ? { ...e, status: "canceled" }
            : e,
        ),
      )
  }, [])

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    delete bucketMapRef.current[id]
    delete cancelMapRef.current[id]
  }, [])

  const clearDone = useCallback(() => {
    setEntries((prev) =>
      prev.filter(
        (e) =>
          e.status !== "done" &&
          e.status !== "error" &&
          e.status !== "canceled",
      ),
    )
  }, [])

  const activeCount = entries.filter(
    (e) => e.status === "queued" || e.status === "uploading",
  ).length

  return { entries, enqueue, cancel, remove, clearDone, activeCount }
}
