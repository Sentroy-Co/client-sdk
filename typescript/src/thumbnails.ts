/**
 * Media thumbnail URL helpers — display target'ına göre uygun boyutta
 * URL döndürür. Orijinal kaliteyi avatar/grid card gibi küçük yerlerde
 * göstermek bandwidth ve render cost açısından mantıksız.
 *
 * CDN tarafı upload sırasında image'lar için pre-generated thumbnail'lar
 * üretir (`imageMeta.thumbnails[]`). Bu helper:
 *  1. Hedef boyutu kapsayacak en küçük thumbnail'ı seçer (yoksa en büyük).
 *  2. Thumbnail URL'i exposed ise direkt onu kullanır.
 *  3. Değilse `media.url`'in CDN prefix'ine `thumbnail.fileName` ekleyerek
 *     URL inşa eder ({cdn-base}/{bucketId}/{thumbnail.fileName}).
 *  4. Hiçbir public URL yoksa download endpoint'ini `?quality=N` ile döner.
 *  5. En kötü durumda media.downloadUrl ya da undefined.
 */

import type { Media, MediaThumbnail } from "./types"

/**
 * Yardımcı fonksiyona verilebilecek minimum Media subset — Media tipinin
 * tamamını import etmek istemeyen consumer'lar için.
 */
export type ThumbnailSourceMedia = Pick<
  Media,
  "url" | "downloadUrl" | "imageMeta" | "type"
>

/**
 * Display hedef boyutuna göre uygun thumbnail URL'sini döndür.
 *
 * @param media     Sentroy media object (list / get / upload result).
 * @param targetPx  Display'in maksimum boyutu (genişlik veya yükseklik) px.
 *                  Retina için `2x` ile çağırın: `pickThumbnailUrl(m, 56*2)`.
 *
 * @returns         URL string ya da hiçbir şey üretilemezse `undefined`.
 *
 * @example
 * ```tsx
 * const avatarUrl = pickThumbnailUrl(media, 56 * 2) // 112px target
 * <img src={avatarUrl} className="size-14 rounded-full" />
 * ```
 *
 * @example
 * ```tsx
 * const cardUrl = pickThumbnailUrl(media, 320)
 * const fullUrl = media.url // grid'te küçük, lightbox'ta orijinal
 * ```
 */
export function pickThumbnailUrl(
  media: ThumbnailSourceMedia,
  targetPx: number,
): string | undefined {
  // Image değilse veya thumbnail listesi boşsa — orijinal URL.
  const thumbs = media.imageMeta?.thumbnails
  if (!thumbs || thumbs.length === 0 || media.type !== "image") {
    return media.url ?? media.downloadUrl
  }
  if (!targetPx || targetPx <= 0) {
    return media.url ?? media.downloadUrl
  }

  // En yakın "kapsayan" thumbnail — width >= target olan en küçük; yoksa
  // en büyük (target'tan küçük olsa bile en az bozulmayı verir).
  const sorted = [...thumbs].sort((a, b) => a.width - b.width)
  const fit =
    sorted.find((t) => t.width >= targetPx) ?? sorted[sorted.length - 1]

  // Backend bazı endpoint'lerde thumbnail'ın kendi URL'ini de döndüyor
  // (CdnUploadResult.imageMeta.thumbnails[].url). Tipte opsiyonel olarak
  // değil ama runtime'da gelirse direkt kullanırız.
  const fitWithUrl = fit as MediaThumbnail & { url?: string }
  if (typeof fitWithUrl.url === "string" && fitWithUrl.url.length > 0) {
    return fitWithUrl.url
  }

  // Pattern fallback: original URL'in son `/`'ından sonraki kısmı atıp
  // thumbnail'ın fileName'ini ekle. Backend pattern'ı:
  //   {cdn}/{bucketId}/{originalFileName}     ← media.url
  //   {cdn}/{bucketId}/{thumbnailFileName}    ← inşa edilen
  if (media.url) {
    const slash = media.url.lastIndexOf("/")
    if (slash >= 0) {
      // Query string varsa düşür — thumbnail için anlamsız.
      const base = media.url.substring(0, slash + 1)
      const cleanBase = base.split("?")[0]
      return cleanBase + fit.fileName
    }
  }

  // Public URL hiç yoksa proxy download endpoint'ini quality=N ile çağır.
  if (media.downloadUrl) {
    const sep = media.downloadUrl.includes("?") ? "&" : "?"
    return `${media.downloadUrl}${sep}quality=${fit.width}`
  }

  return undefined
}

/**
 * Yaygın preset boyutları — semantik isimle çağırmak isteyen consumer
 * için kısayol. Retina-aware: avatar ufacık olduğundan @2x; orta boy
 * preview için orijinal yerine ~640.
 *
 * Manuel `targetPx` vermek istemediğinde:
 * `pickPresetThumbnailUrl(media, "avatar")`.
 */
export const THUMBNAIL_PRESETS = {
  /** Avatar / round chip — 28-64px display, 2x retina için ~120 hedef. */
  avatar: 128,
  /** List/grid card — 200-300px display, ~500 hedef. */
  card: 500,
  /** Modal preview — büyük ama orijinali yormayan ~960. */
  preview: 960,
  /** Hero / fullbleed — 1280-1920 display, neredeyse orijinal. */
  hero: 1600,
} as const

export type ThumbnailPreset = keyof typeof THUMBNAIL_PRESETS

/**
 * `pickThumbnailUrl`'in semantik kısayolu — display amacını isimle ifade
 * et, helper preset → px mapping'ini halletsin.
 */
export function pickPresetThumbnailUrl(
  media: ThumbnailSourceMedia,
  preset: ThumbnailPreset,
): string | undefined {
  return pickThumbnailUrl(media, THUMBNAIL_PRESETS[preset])
}
