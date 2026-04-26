import { useCallback, useEffect, useState } from "react"
import type { Sentroy } from "../.."
import type { Media, MediaListResult } from "../../types"

/**
 * Bir bucket'taki media listesini çeken hook. Search, kind filter ve
 * folder filter local-side; SDK'nın list endpoint'i şimdilik bunları
 * server-side desteklemiyor (genelde 100-200 dosyalık küçük scale,
 * client-side OK). Büyük scale'de paginate + server filter eklenir.
 */
export function useMediaList(args: {
  client: Sentroy
  bucketSlug: string | null
  /** Yeniden tetiklenmek için artırılan key. */
  refreshKey?: number
}) {
  const { client, bucketSlug, refreshKey = 0 } = args
  const [data, setData] = useState<MediaListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bucketSlug) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    client.media
      .list(bucketSlug, { limit: 200 })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load media")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, bucketSlug, refreshKey])

  const refresh = useCallback(() => {
    // Caller kendi refreshKey'ini bump'lar; bu sadece convenience.
    setData((d) => d)
  }, [])

  return { data, items: data?.items ?? ([] as Media[]), loading, error, refresh }
}
