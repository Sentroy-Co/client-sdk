/**
 * `sentroy mail …` — read-only subcommands for the mail product.
 *
 * Every handler resolves shared opts (token + base URL + company slug),
 * builds an optional query string from CLI flags, calls the platform
 * REST API under `/api/companies/<slug>/…`, then prints the result via
 * the shared table/json formatter (`printRows` for lists, `printDetail`
 * for single-resource gets).
 *
 * Auth: Bearer `stk_…` access token (resolved by `resolveSharedOpts`).
 * Output: table by default, `--output=json` for scripting.
 *
 * The handler map is exported as `MAIL_HANDLERS` so `cli/index.ts` can
 * dispatch `sentroy mail <group> <action>` without each handler having
 * to know about the router.
 */
import { apiFetch, parseFlags, resolveSharedOpts, type SharedOpts } from "./args"
import { loc, printDetail, printRows, type Column } from "./format"

// ── Types (loose — matches platform JSON shape, not Mongoose models) ────

type LocalizedString = string | Record<string, string>

interface TemplateRow {
  id: string
  name: LocalizedString
  subject: LocalizedString
  domainId: string
  thumbnailUrl?: string
  category?: string
  createdAt: string
}

interface DomainRow {
  id: string
  domain: string
  status: string
  isAssigned: boolean
  catchAll?: boolean
  createdAt: string
}

interface MailboxRow {
  id: string
  email: string
  domainId: string
  isCatchAll: boolean
  createdAt: string
}

interface InboxRow {
  id: string
  mailbox: string
  folder: string
  subject: string
  from: string
  to: string | string[]
  snippet?: string
  unread: boolean
  receivedAt: string
}

interface SuppressionRow {
  id: string
  email: string
  reason: string
  domainId?: string
  createdAt: string
}

interface LogRow {
  id: string
  messageId: string
  to: string | string[]
  from: string
  subject: string
  status: string
  domainId?: string
  createdAt: string
}

interface WebhookRow {
  id: string
  url: string
  events: string[]
  domainId?: string
  active: boolean
}

// ── Query string builder ────────────────────────────────────────────────

/**
 * Build a query string from a flag map, copying only the keys listed in
 * `keys`. Skips booleans (those are switches, not values) and undefined.
 * Returns "" if nothing to encode — caller can append safely.
 */
function buildQuery(
  flags: Record<string, string | boolean>,
  keys: readonly { flag: string; param?: string }[],
): string {
  const params = new URLSearchParams()
  for (const { flag, param } of keys) {
    const v = flags[flag]
    if (v === undefined) continue
    if (typeof v === "boolean") {
      if (v) params.set(param ?? flag, "true")
      continue
    }
    params.set(param ?? flag, v)
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

/** Slice ISO timestamps to "YYYY-MM-DD" or "YYYY-MM-DD HH:mm". */
function sliceDate(value: string | undefined | null, len: 10 | 16): string {
  if (!value) return ""
  const s = String(value)
  if (len === 16) return s.slice(0, 10) + " " + s.slice(11, 16)
  return s.slice(0, 10)
}

function yesNo(value: unknown): string {
  if (value === true) return "yes"
  if (value === false) return "no"
  return ""
}

function ctx(args: string[]): { positional: string[]; flags: Record<string, string | boolean>; shared: SharedOpts } {
  const { positional, flags } = parseFlags(args)
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  return { positional, flags, shared }
}

function companyPath(shared: SharedOpts, suffix: string): string {
  return `/api/companies/${encodeURIComponent(shared.companySlug as string)}${suffix}`
}

// ── Templates ───────────────────────────────────────────────────────────

async function templatesList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "page" },
    { flag: "limit" },
  ])
  const data = await apiFetch<TemplateRow[]>(shared, companyPath(shared, `/templates${qs}`))
  const cols: Column<TemplateRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "NAME", get: (r) => loc(r.name) },
    { header: "SUBJECT", get: (r) => loc(r.subject), maxWidth: 50 },
    { header: "DOMAIN", get: (r) => r.domainId, maxWidth: 24 },
    { header: "CATEGORY", get: (r) => r.category ?? "" },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt, 10) },
  ]
  printRows(data ?? [], cols, flags)
}

async function templatesGet(args: string[]): Promise<void> {
  const { positional, flags, shared } = ctx(args)
  const id = positional[0]
  if (!id) {
    process.stderr.write("usage: sentroy mail templates get <id>\n")
    process.exit(1)
  }
  const data = await apiFetch<Record<string, unknown>>(
    shared,
    companyPath(shared, `/templates/${encodeURIComponent(id)}`),
  )
  printDetail(data ?? {}, flags)
}

// ── Domains ─────────────────────────────────────────────────────────────

async function domainsList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "page" },
    { flag: "limit" },
  ])
  const data = await apiFetch<DomainRow[]>(shared, companyPath(shared, `/domains${qs}`))
  const cols: Column<DomainRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "DOMAIN", get: (r) => r.domain },
    { header: "STATUS", get: (r) => r.status },
    { header: "ASSIGNED", get: (r) => yesNo(r.isAssigned) },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt, 10) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── Mailboxes ───────────────────────────────────────────────────────────

async function mailboxesList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "page" },
    { flag: "limit" },
    { flag: "domain", param: "domainId" },
  ])
  const data = await apiFetch<MailboxRow[]>(shared, companyPath(shared, `/mailboxes${qs}`))
  const cols: Column<MailboxRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "EMAIL", get: (r) => r.email },
    { header: "DOMAIN", get: (r) => r.domainId, maxWidth: 24 },
    { header: "CATCHALL", get: (r) => yesNo(r.isCatchAll) },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt, 10) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── Inbox ───────────────────────────────────────────────────────────────

async function inboxList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "mailbox" },
    { flag: "folder" },
    { flag: "unread" },
    { flag: "page" },
    { flag: "limit" },
    { flag: "q" },
  ])
  const data = await apiFetch<InboxRow[]>(shared, companyPath(shared, `/inbox${qs}`))
  const cols: Column<InboxRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "MAILBOX", get: (r) => r.mailbox },
    { header: "FOLDER", get: (r) => r.folder },
    { header: "FROM", get: (r) => r.from, maxWidth: 40 },
    { header: "SUBJECT", get: (r) => r.subject, maxWidth: 40 },
    { header: "UNREAD", get: (r) => yesNo(r.unread) },
    { header: "RECEIVED", get: (r) => sliceDate(r.receivedAt, 16) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── Suppressions ────────────────────────────────────────────────────────

async function suppressionsList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "page" },
    { flag: "limit" },
    { flag: "domain", param: "domainId" },
    { flag: "reason" },
  ])
  const data = await apiFetch<SuppressionRow[]>(shared, companyPath(shared, `/suppressions${qs}`))
  const cols: Column<SuppressionRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "EMAIL", get: (r) => r.email },
    { header: "REASON", get: (r) => r.reason, maxWidth: 20 },
    { header: "DOMAIN", get: (r) => r.domainId ?? "", maxWidth: 24 },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt, 10) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── Logs ────────────────────────────────────────────────────────────────

async function logsList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "page" },
    { flag: "limit" },
    { flag: "status" },
    { flag: "domain", param: "domainId" },
    { flag: "from" },
    { flag: "to" },
  ])
  const data = await apiFetch<LogRow[]>(shared, companyPath(shared, `/logs${qs}`))
  const cols: Column<LogRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "MESSAGE", get: (r) => r.messageId, maxWidth: 24 },
    { header: "TO", get: (r) => Array.isArray(r.to) ? r.to.join(",") : r.to },
    { header: "STATUS", get: (r) => r.status },
    { header: "DOMAIN", get: (r) => r.domainId ?? "", maxWidth: 24 },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt, 16) },
  ]
  printRows(data ?? [], cols, flags)
}

async function logsGet(args: string[]): Promise<void> {
  const { positional, flags, shared } = ctx(args)
  const id = positional[0]
  if (!id) {
    process.stderr.write("usage: sentroy mail logs get <id>\n")
    process.exit(1)
  }
  const data = await apiFetch<Record<string, unknown>>(
    shared,
    companyPath(shared, `/logs/${encodeURIComponent(id)}`),
  )
  printDetail(data ?? {}, flags)
}

// ── Webhooks ────────────────────────────────────────────────────────────

async function webhooksList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "domain", param: "domainId" },
  ])
  const data = await apiFetch<WebhookRow[]>(shared, companyPath(shared, `/webhooks${qs}`))
  const cols: Column<WebhookRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "URL", get: (r) => r.url, maxWidth: 50 },
    { header: "DOMAIN", get: (r) => r.domainId ?? "", maxWidth: 24 },
    { header: "ACTIVE", get: (r) => yesNo(r.active) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── Analytics ───────────────────────────────────────────────────────────

interface AnalyticsResponse {
  windowDays?: number
  overview?: Record<string, unknown>
  prevOverview?: Record<string, unknown>
  daily?: unknown[]
  domains?: unknown[]
  recentLogs?: unknown[]
}

async function analytics(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qs = buildQuery(flags, [
    { flag: "days" },
    { flag: "domain", param: "domainId" },
  ])
  const data = await apiFetch<AnalyticsResponse>(shared, companyPath(shared, `/analytics${qs}`))
  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output === "json") {
    process.stdout.write(JSON.stringify(data ?? {}, null, 2) + "\n")
    return
  }
  const overview = (data?.overview ?? {}) as Record<string, unknown>
  const summary: Record<string, unknown> = {
    windowDays: data?.windowDays ?? "",
    ...overview,
  }
  printDetail(summary, flags)
  process.stdout.write(
    "\x1b[2m(overview shown — pass --output=json for full daily/domain/recentLogs breakdown)\x1b[0m\n",
  )
}

// ── Router export ───────────────────────────────────────────────────────

export const MAIL_HANDLERS = {
  templatesList,
  templatesGet,
  domainsList,
  mailboxesList,
  inboxList,
  suppressionsList,
  logsList,
  logsGet,
  webhooksList,
  analytics,
} as const

export type MailHandlerName = keyof typeof MAIL_HANDLERS
