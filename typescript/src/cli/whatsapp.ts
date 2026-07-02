/**
 * `sentroy whatsapp …` — WhatsApp Santral subcommands.
 *
 * List connected numbers, manage templates, and send template-based messages
 * (single or to an audience) via the shared `stk_` access token. Hits the
 * platform gateway under `/api/whatsapp/companies/<slug>/…` (core forwards to
 * the whatsapp backend), matching the SDK's `sentroy.whatsapp.*` routing.
 */
import * as fs from "fs"
import {
  apiFetch,
  fail,
  ok,
  parseFlags,
  resolveSharedOpts,
  type SharedOpts,
} from "./args"
import { printDetail, printRows, type Column } from "./format"

interface NumberRow {
  sessionId: string
  phoneNumber: string | null
  label: string | null
  status: string
  connected: boolean
}
interface TemplateRow {
  id: string
  name: string
  variables: string[]
  category: string | null
  createdAt: string
}
interface AudienceRow {
  id: string
  name: string
  entryCount: number
  createdAt: string
}
interface LogRow {
  id: string
  to: string
  status: string
  templateId: string | null
  error: string | null
  createdAt: string
}

function ctx(args: string[]): {
  positional: string[]
  flags: Record<string, string | boolean>
  shared: SharedOpts
} {
  const { positional, flags } = parseFlags(args)
  const shared = resolveSharedOpts(flags, { requireCompanySlug: true })
  return { positional, flags, shared }
}

/** WhatsApp gateway path — core rewrites `/api/whatsapp/companies/*` → backend. */
function waPath(shared: SharedOpts, suffix: string): string {
  return `/api/whatsapp/companies/${encodeURIComponent(shared.companySlug as string)}${suffix}`
}

function sliceDate(s: string | undefined, n = 10): string {
  return typeof s === "string" ? s.slice(0, n) : ""
}

function readStdin(): string {
  if (process.stdin.isTTY) return ""
  try {
    return fs.readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

/** Resolve template body: --body='…' · --body-file=<path> · piped stdin. */
function resolveTemplateBody(
  flags: Record<string, string | boolean>,
  allowStdin: boolean,
): string | null {
  const file = typeof flags["body-file"] === "string" ? flags["body-file"] : null
  if (file) {
    if (!fs.existsSync(file)) fail(`file not found: ${file}`)
    return fs.readFileSync(file, "utf8")
  }
  const inline = typeof flags.body === "string" ? flags.body : null
  if (inline) return inline
  if (allowStdin) {
    const piped = readStdin()
    if (piped.trim()) return piped
  }
  return null
}

/** Parse `--vars='{"k":"v"}'` JSON object into a string map. */
function parseVars(flags: Record<string, string | boolean>): Record<string, string> {
  const raw = typeof flags.vars === "string" ? flags.vars : null
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) out[k] = String(v)
      return out
    }
  } catch {
    fail(`--vars must be a JSON object, e.g. --vars='{"name":"Ada"}'`)
  }
  return {}
}

// ── numbers ──────────────────────────────────────────────────────────────────

async function numbersList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const data = await apiFetch<NumberRow[]>(shared, waPath(shared, "/numbers"))
  const cols: Column<NumberRow>[] = [
    { header: "SESSION", get: (r) => r.sessionId, maxWidth: 20 },
    { header: "PHONE", get: (r) => r.phoneNumber ?? "" },
    { header: "LABEL", get: (r) => r.label ?? "" },
    { header: "STATUS", get: (r) => r.status },
    { header: "CONNECTED", get: (r) => (r.connected ? "yes" : "no") },
  ]
  printRows(data ?? [], cols, flags)
}

// ── templates ──────────────────────────────────────────────────────────────

async function templatesList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const data = await apiFetch<TemplateRow[]>(shared, waPath(shared, "/templates"))
  const cols: Column<TemplateRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "NAME", get: (r) => r.name },
    { header: "VARIABLES", get: (r) => (r.variables ?? []).join(", "), maxWidth: 40 },
    { header: "CATEGORY", get: (r) => r.category ?? "" },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt) },
  ]
  printRows(data ?? [], cols, flags)
}

async function templatesGet(args: string[]): Promise<void> {
  const { positional, flags, shared } = ctx(args)
  const id = positional[0]
  if (!id) fail("usage: sentroy whatsapp templates get <id>")
  const data = await apiFetch<Record<string, unknown>>(
    shared,
    waPath(shared, `/templates/${encodeURIComponent(id!)}`),
  )
  printDetail(data ?? {}, flags)
}

async function templatesCreate(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const name = typeof flags.name === "string" ? flags.name : null
  if (!name) fail("--name is required")
  const body = resolveTemplateBody(flags, true)
  if (!body) fail("no body. Pass --body='…', --body-file=<path>, or pipe on stdin.")
  const created = await apiFetch<Record<string, unknown>>(
    shared,
    waPath(shared, "/templates"),
    {
      method: "POST",
      body: JSON.stringify({
        name,
        body,
        ...(typeof flags.mediaUrl === "string" ? { mediaUrl: flags.mediaUrl } : {}),
        ...(typeof flags.category === "string" ? { category: flags.category } : {}),
      }),
    },
  )
  ok(`Template created: ${(created as { id?: string }).id ?? ""}`)
  printDetail(created ?? {}, flags)
}

async function templatesDelete(args: string[]): Promise<void> {
  const { positional, shared } = ctx(args)
  const id = positional[0]
  if (!id) fail("usage: sentroy whatsapp templates delete <id>")
  await apiFetch(shared, waPath(shared, `/templates/${encodeURIComponent(id!)}`), {
    method: "DELETE",
  })
  ok(`Template deleted: ${id}`)
}

// ── audiences ──────────────────────────────────────────────────────────────

async function audiencesList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const data = await apiFetch<AudienceRow[]>(shared, waPath(shared, "/audiences"))
  const cols: Column<AudienceRow>[] = [
    { header: "ID", get: (r) => r.id, maxWidth: 24 },
    { header: "NAME", get: (r) => r.name },
    { header: "RECIPIENTS", get: (r) => String(r.entryCount ?? 0) },
    { header: "CREATED", get: (r) => sliceDate(r.createdAt) },
  ]
  printRows(data ?? [], cols, flags)
}

// ── send ───────────────────────────────────────────────────────────────────

async function send(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const to = typeof flags.to === "string" ? flags.to : undefined
  const audienceId = typeof flags.audience === "string" ? flags.audience : undefined
  const templateId = typeof flags.template === "string" ? flags.template : undefined
  const bodyText = typeof flags.body === "string" ? flags.body : undefined
  const from = typeof flags.from === "string" ? flags.from : undefined
  if (!to && !audienceId) fail("--to=<phone> or --audience=<audienceId> is required")
  if (!templateId && !bodyText) fail("--template=<id> or --body='…' is required")

  const result = await apiFetch<{
    total: number
    sent: number
    failed: number
  }>(shared, waPath(shared, "/send"), {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      audienceId,
      templateId,
      body: bodyText,
      variables: parseVars(flags),
    }),
  })
  ok(`Sent ${result.sent}/${result.total} (failed ${result.failed})`)
  printDetail(result as unknown as Record<string, unknown>, flags)
}

// ── logs ───────────────────────────────────────────────────────────────────

async function logsList(args: string[]): Promise<void> {
  const { flags, shared } = ctx(args)
  const qp: string[] = []
  for (const key of ["status", "page", "limit", "session", "template"] as const) {
    const flagKey = key === "session" ? "session" : key
    const v = flags[flagKey]
    if (typeof v === "string") {
      const param =
        key === "session" ? "sessionId" : key === "template" ? "templateId" : key
      qp.push(`${param}=${encodeURIComponent(v)}`)
    }
  }
  const qs = qp.length ? `?${qp.join("&")}` : ""
  const result = await apiFetch<{ data: LogRow[] }>(shared, waPath(shared, `/logs${qs}`))
  const cols: Column<LogRow>[] = [
    { header: "TO", get: (r) => r.to },
    { header: "STATUS", get: (r) => r.status },
    { header: "TEMPLATE", get: (r) => r.templateId ?? "", maxWidth: 24 },
    { header: "ERROR", get: (r) => r.error ?? "", maxWidth: 30 },
    { header: "AT", get: (r) => sliceDate(r.createdAt, 19).replace("T", " ") },
  ]
  printRows(result?.data ?? [], cols, flags)
}

export const WHATSAPP_HANDLERS = {
  numbersList,
  templatesList,
  templatesGet,
  templatesCreate,
  templatesDelete,
  audiencesList,
  send,
  logsList,
} as const
