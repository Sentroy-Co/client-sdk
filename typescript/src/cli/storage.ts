/**
 * `sentroy storage <subcommand>` — bucket + media browsing for the
 * Sentroy storage product.
 *
 * Mirrors the dashboard at https://storage.sentroy.com but stays
 * read-only: list/get buckets and media, surface usage + quota. Mutating
 * ops (upload/delete) are intentionally not in this CLI — use the SDK or
 * dashboard, which give you progress + crop UX.
 *
 * Auth: Bearer stk_… via `resolveSharedOpts({requireCompanySlug: true})`.
 * Every path is prefixed `/api/companies/<slug>`.
 */

import {
  parseFlags,
  resolveSharedOpts,
  apiFetch,
  fail,
  info,
  c,
  type SharedOpts,
} from "./args"
import { printRows, printDetail, type Column } from "./format"

// ── Types (loose — match server response shape) ─────────────────────────

interface Bucket {
  id: string
  name: string
  slug: string
  description?: string | null
  isPublic: boolean
  storageUsed: number
  fileCount: number
  createdAt: string
  updatedAt?: string
  [k: string]: unknown
}

interface Media {
  id: string
  bucketId?: string
  originalName: string
  fileName?: string
  type: string
  mimeType: string
  size: number
  folder?: string | null
  isPublic: boolean
  url?: string
  imageMeta?: Record<string, unknown> | null
  audioMeta?: Record<string, unknown> | null
  videoMeta?: Record<string, unknown> | null
  tags?: string[]
  createdAt?: string
  [k: string]: unknown
}

interface MediaListResponse {
  items: Media[]
  total: number
  limit: number
  skip: number
  sort?: string
  dir?: string
}

interface QuotaResponse {
  used: number
  limit: number
  remaining: number
}

interface UsageResponse {
  quota: QuotaResponse
  buckets: Array<{
    id: string
    name: string
    slug: string
    storageUsed: number
    fileCount: number
  }>
  byType: Record<string, { count: number; size: number }>
  timeSeries: Array<{ date: string; size: number; count: number }>
  recent: Media[]
}

// ── Helpers ─────────────────────────────────────────────────────────────

function humanBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

function yesNo(v: unknown): string {
  return v ? "yes" : "no"
}

function shortDate(v: unknown): string {
  if (typeof v !== "string" || v.length < 10) return ""
  return v.slice(0, 10)
}

function companyPrefix(shared: SharedOpts): string {
  if (!shared.companySlug) {
    fail("internal: company slug missing after resolveSharedOpts guard")
  }
  return `/api/companies/${encodeURIComponent(shared.companySlug)}`
}

/** Append flag-derived query params; only emits keys whose flag is set. */
function buildQuery(
  flags: Record<string, string | boolean>,
  keys: string[],
): string {
  const params: string[] = []
  for (const k of keys) {
    const raw = flags[k]
    if (raw === undefined || raw === false) continue
    const value = raw === true ? "" : String(raw)
    if (!value) continue
    params.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`)
  }
  return params.length ? `?${params.join("&")}` : ""
}

// ── Column specs ────────────────────────────────────────────────────────

const BUCKET_COLUMNS: Column<Bucket>[] = [
  { header: "ID", get: (b) => b.id, maxWidth: 24 },
  { header: "NAME", get: (b) => b.name, maxWidth: 32 },
  { header: "SLUG", get: (b) => b.slug, maxWidth: 32 },
  { header: "PUBLIC", get: (b) => yesNo(b.isPublic), maxWidth: 6 },
  { header: "USED", get: (b) => humanBytes(b.storageUsed), alignRight: true },
  { header: "FILES", get: (b) => b.fileCount, alignRight: true },
  { header: "CREATED", get: (b) => shortDate(b.createdAt), maxWidth: 10 },
]

const MEDIA_COLUMNS: Column<Media>[] = [
  { header: "ID", get: (m) => m.id, maxWidth: 24 },
  { header: "NAME", get: (m) => m.originalName, maxWidth: 40 },
  { header: "TYPE", get: (m) => m.type, maxWidth: 12 },
  { header: "MIME", get: (m) => m.mimeType, maxWidth: 24 },
  { header: "SIZE", get: (m) => humanBytes(m.size), alignRight: true },
  { header: "FOLDER", get: (m) => m.folder ?? "", maxWidth: 24 },
  { header: "PUBLIC", get: (m) => yesNo(m.isPublic), maxWidth: 6 },
]

// ── Subcommand handlers ─────────────────────────────────────────────────

async function bucketsList(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv)
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const data = await apiFetch<Bucket[] | { items: Bucket[] }>(
    shared,
    `${companyPrefix(shared)}/buckets`,
  )
  const rows = Array.isArray(data) ? data : (data?.items ?? [])
  printRows(rows, BUCKET_COLUMNS, flags)
}

async function bucketsGet(argv: string[]): Promise<void> {
  const { positional, flags } = parseFlags(argv)
  const bucketSlug = positional[0]
  if (!bucketSlug) {
    fail("usage: sentroy storage buckets get <bucketSlug>")
  }
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const data = await apiFetch<Bucket>(
    shared,
    `${companyPrefix(shared)}/buckets/${encodeURIComponent(bucketSlug)}`,
  )
  printDetail(data as unknown as Record<string, unknown>, flags)
}

async function mediaList(argv: string[]): Promise<void> {
  const { positional, flags } = parseFlags(argv)
  const bucketSlug = positional[0]
  if (!bucketSlug) {
    fail(
      "usage: sentroy storage media list <bucketSlug> [--type= --folder= --q= --sort= --dir= --limit= --skip=]",
    )
  }
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const query = buildQuery(flags, [
    "type",
    "folder",
    "q",
    "sort",
    "dir",
    "limit",
    "skip",
  ])
  const data = await apiFetch<MediaListResponse>(
    shared,
    `${companyPrefix(shared)}/buckets/${encodeURIComponent(bucketSlug)}/media${query}`,
  )
  const items = data?.items ?? []
  printRows(items, MEDIA_COLUMNS, flags)

  // Footer only in table mode — JSON consumers get total/limit/skip in payload.
  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output !== "json") {
    const total = data?.total ?? items.length
    const limit = data?.limit ?? items.length
    const skip = data?.skip ?? 0
    const page = limit > 0 ? Math.floor(skip / limit) + 1 : 1
    const pages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1
    info(`Total: ${total} item${total === 1 ? "" : "s"}, page ${page}/${pages}`)
  }
}

async function mediaGet(argv: string[]): Promise<void> {
  const { positional, flags } = parseFlags(argv)
  const bucketSlug = positional[0]
  const mediaId = positional[1]
  if (!bucketSlug || !mediaId) {
    fail("usage: sentroy storage media get <bucketSlug> <mediaId>")
  }
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const data = await apiFetch<Media>(
    shared,
    `${companyPrefix(shared)}/buckets/${encodeURIComponent(bucketSlug)}/media/${encodeURIComponent(mediaId)}`,
  )
  printDetail(data as unknown as Record<string, unknown>, flags)
}

async function usage(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv)
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const data = await apiFetch<UsageResponse>(
    shared,
    `${companyPrefix(shared)}/usage`,
  )

  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output === "json") {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }

  // Table mode renders quota summary only — the nested arrays
  // (buckets, byType, timeSeries, recent) bloat the terminal; nudge to
  // --output=json for the full picture.
  const quota = data?.quota ?? { used: 0, limit: 0, remaining: 0 }
  const pct =
    quota.limit > 0 ? ((quota.used / quota.limit) * 100).toFixed(1) + "%" : "—"
  printDetail(
    {
      used: humanBytes(quota.used),
      limit: humanBytes(quota.limit),
      remaining: humanBytes(quota.remaining),
      utilization: pct,
      buckets: data?.buckets?.length ?? 0,
      recentItems: data?.recent?.length ?? 0,
    },
    flags,
  )
  info(`Pass ${c.cyan("--output=json")} for the full byType / timeSeries / recent payload.`)
}

async function quota(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv)
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  const data = await apiFetch<QuotaResponse>(
    shared,
    `${companyPrefix(shared)}/storage-quota`,
  )
  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output === "json") {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }
  const pct =
    data.limit > 0 ? ((data.used / data.limit) * 100).toFixed(1) + "%" : "—"
  printDetail(
    {
      used: humanBytes(data.used),
      limit: humanBytes(data.limit),
      remaining: humanBytes(data.remaining),
      utilization: pct,
    },
    flags,
  )
}

// ── Export ──────────────────────────────────────────────────────────────

export const STORAGE_HANDLERS = {
  bucketsList,
  bucketsGet,
  mediaList,
  mediaGet,
  usage,
  quota,
}
