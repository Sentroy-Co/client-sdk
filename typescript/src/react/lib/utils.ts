/**
 * Minimal class name combiner — clsx + twMerge gibi davranır ama
 * dependency yok. Falsy filtrele, dedup yapma. Tema override'larında
 * Tailwind utility çakışmaları için consumer kendi cn'ini kullanırsa
 * `className` prop'u son geldiği için doğal şekilde kazanır.
 */
export function cn(
  ...args: Array<string | undefined | null | false | 0>
): string {
  return args.filter(Boolean).join(" ")
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${Number.isInteger(v) ? v : v.toFixed(decimals)} ${units[i]}`
}

/** İlk image-like extension veya MIME → "image", "video", "audio", "pdf",
 *  "doc" (word/excel/ppt), "archive", "code", "other". */
export function detectKind(file: {
  mimeType?: string | null
  fileName?: string
}): MediaKind {
  const mt = (file.mimeType ?? "").toLowerCase()
  const ext = (file.fileName ?? "").split(".").pop()?.toLowerCase() ?? ""
  if (mt.startsWith("image/")) return "image"
  if (mt.startsWith("video/")) return "video"
  if (mt.startsWith("audio/")) return "audio"
  if (mt === "application/pdf" || ext === "pdf") return "pdf"
  if (
    /^(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|txt|md|csv)$/.test(ext) ||
    mt.startsWith("application/vnd.")
  ) {
    return "doc"
  }
  if (/^(zip|tar|gz|7z|rar|bz2)$/.test(ext)) return "archive"
  if (
    /^(js|ts|tsx|jsx|json|html|css|scss|sh|py|go|rb|php|rs|java|c|cpp)$/.test(
      ext,
    )
  ) {
    return "code"
  }
  return "other"
}

export type MediaKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "archive"
  | "code"
  | "other"

export const KIND_LABELS: Record<MediaKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  doc: "Document",
  archive: "Archive",
  code: "Code",
  other: "Other",
}

/**
 * `<input accept="...">` semantics — pattern listesi virgülle ayrılır,
 * her parça:
 *  - `image/*` → MIME wildcard (image/png, image/jpeg ✓)
 *  - `image/png` → MIME exact match
 *  - `.png` → file extension (case-insensitive)
 *
 * Hiçbir parça eşleşmezse false. Accept boş/undefined olursa caller
 * filter'ı atlamalı — bu fonksiyon o yüzden boş string'i false döner.
 */
export function matchAccept(
  file: { mimeType?: string | null; fileName?: string },
  accept: string,
): boolean {
  const patterns = accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (patterns.length === 0) return false
  const mt = (file.mimeType ?? "").toLowerCase()
  const fn = (file.fileName ?? "").toLowerCase()
  for (const p of patterns) {
    if (p.startsWith(".")) {
      if (fn.endsWith(p)) return true
    } else if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1) // "image/*" → "image/"
      if (mt.startsWith(prefix)) return true
    } else if (p === mt) {
      return true
    }
  }
  return false
}
