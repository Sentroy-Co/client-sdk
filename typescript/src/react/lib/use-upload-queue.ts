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

  /**
   * Aktif (in-flight) upload sayısını synchronous olarak takip eden ref.
   * `entries` state setEntries ile async güncellendiğinden, recursive
   * `pump` çağrılarında `entries.filter(e => e.status === "uploading")`
   * eski listeyi görür → aynı queued entry birden çok kez başlatılır
   * (Chrome side `ERR_INSUFFICIENT_RESOURCES`). Ref ile incre/decre
   * synchronous; concurrency limiti gerçekten devreye girer.
   */
  const inFlightRef = useRef(0)
  /**
   * Henüz başlatılmamış queued entry id'lerinin sıralı listesi. setEntries
   * async olduğu için listeden seçim yapmak yarış koşulu üretir; ref
   * üzerinden FIFO push/shift hem deterministik hem hızlı.
   */
  const queueRef = useRef<string[]>([])

  const updateEntry = useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
    },
    [],
  )

  pumpRef.current = () => {
    // Slot doluysa veya queue boşsa erken dön.
    if (inFlightRef.current >= concurrency) return
    const nextId = queueRef.current.shift()
    if (!nextId) return

    // Slot'u synchronously rezerve et — bir sonraki pump çağrısı bu
    // entry'i tekrar shift edemez.
    inFlightRef.current++

    const entry = entriesRef.current.find((e) => e.id === nextId)
    if (!entry) {
      // Cancel öncesi remove edilmiş; slot'u iade et ve pump'a devam.
      inFlightRef.current--
      pumpRef.current?.()
      return
    }

    // Mark uploading
    updateEntry(entry.id, { status: "uploading" })

    const bucketSlug = bucketMapRef.current[entry.id]
    if (!bucketSlug) {
      updateEntry(entry.id, { status: "error", error: "No bucket" })
      inFlightRef.current--
      pumpRef.current?.()
      return
    }

    const controller = new AbortController()
    cancelMapRef.current[entry.id] = () => controller.abort()

    client.media
      .upload(
        bucketSlug,
        { body: entry.file, filename: entry.file.name },
        {
          onProgress: (loaded, total) => {
            updateEntry(entry.id, { loaded, total })
          },
          signal: controller.signal,
        },
      )
      .then((media) => {
        updateEntry(entry.id, {
          status: "done",
          media,
          loaded: entry.file.size,
          total: entry.file.size,
        })
        onUploadedRef.current?.(media)
      })
      .catch((err: unknown) => {
        const aborted =
          (err as { message?: string })?.message === "Upload aborted"
        updateEntry(entry.id, {
          status: aborted ? "canceled" : "error",
          error: aborted
            ? undefined
            : ((err as Error)?.message ?? "Upload failed"),
        })
      })
      .finally(() => {
        delete cancelMapRef.current[entry.id]
        inFlightRef.current--
        // Slot açıldı, sıradakini başlat.
        pumpRef.current?.()
      })

    // Aynı tick'te kalan slot'ları doldur — concurrency artık
    // synchronously inFlightRef ile guard'lı, çift başlatma yok.
    if (inFlightRef.current < concurrency) pumpRef.current?.()
  }

  const bucketMapRef = useRef<Record<string, string>>({})
  const cancelMapRef = useRef<Record<string, () => void>>({})

  const enqueue = useCallback(
    (bucketSlug: string, files: File[]) => {
      if (files.length === 0) return
      const newEntries: UploadEntry[] = files.map((file) => {
        const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        bucketMapRef.current[id] = bucketSlug
        // FIFO queue — pump bu sıradan shift eder; setEntries async
        // güncellemesinden bağımsız synchronous source-of-truth.
        queueRef.current.push(id)
        return {
          id,
          file,
          status: "queued",
          loaded: 0,
          total: file.size,
          cancel: () => {
            const c = cancelMapRef.current[id]
            if (c) c()
            else {
              queueRef.current = queueRef.current.filter((qid) => qid !== id)
              setEntries((prev) =>
                prev.map((e) =>
                  e.id === id && e.status === "queued"
                    ? { ...e, status: "canceled" }
                    : e,
                ),
              )
            }
          },
        }
      })
      setEntries((prev) => [...prev, ...newEntries])
      // pump on next tick — state update'ten sonra entriesRef güncel olsun.
      // pumpRef kendi içinde sequential pump zincirini sürdürür (her
      // başarılı slot rezervasyonundan sonra bir dahaki pump'ı çağırır),
      // dolayısıyla burada tek tetikleme yeterli.
      Promise.resolve().then(() => pumpRef.current?.())
    },
    [],
  )

  const cancel = useCallback((id: string) => {
    const c = cancelMapRef.current[id]
    if (c) c()
    else {
      queueRef.current = queueRef.current.filter((qid) => qid !== id)
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id && e.status === "queued"
            ? { ...e, status: "canceled" }
            : e,
        ),
      )
    }
  }, [])

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    queueRef.current = queueRef.current.filter((qid) => qid !== id)
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
