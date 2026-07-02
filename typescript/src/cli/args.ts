/**
 * Shared CLI utilities — flag parser, ANSI helpers, auth resolver, HTTP
 * client, fail/info/ok/warn loggers. Reused by every subcommand
 * (env, mail, storage, ai).
 *
 * `env.ts` historically inlined these; new subcommands import them from
 * here to stay DRY and to allow extending `VALUE_FLAGS` in one place.
 */

export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
}

export interface SharedOpts {
  token: string
  baseUrl: string
  /** Company slug — mail/storage commands need it; env doesn't (token is
   *  vault-scoped). Resolved from --company-slug, $SENTROY_COMPANY_SLUG,
   *  or thrown error. */
  companySlug?: string
}

// ── ANSI helpers (no deps) ──────────────────────────────────────────────
// Honor https://no-color.org and FORCE_COLOR override before falling back
// to TTY detection. Captured at module load — wrappers/tests that need to
// override should set the env var before requiring this module.
const supportsColor = (() => {
  if (typeof process === "undefined") return false
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== "0"
  return Boolean(process.stdout?.isTTY) && process.env.TERM !== "dumb"
})()

export const c = {
  bold: (s: string) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s: string) => (supportsColor ? `\x1b[35m${s}\x1b[0m` : s),
}

export function fail(msg: string): never {
  process.stderr.write(`${c.red("✗")} ${msg}\n`)
  process.exit(1)
}

export function info(msg: string): void {
  process.stdout.write(`${c.cyan("→")} ${msg}\n`)
}

export function ok(msg: string): void {
  process.stdout.write(`${c.green("✓")} ${msg}\n`)
}

export function warn(msg: string): void {
  process.stdout.write(`${c.yellow("⚠")} ${msg}\n`)
}

/**
 * Flags that take a value as a separate token (`--flag value`). All other
 * `--flag` tokens are booleans. The `--flag=value` form always works
 * regardless of this list.
 */
const VALUE_FLAGS = new Set([
  "token",
  "url",
  "company-slug",
  "output",
  "page",
  "limit",
  "skip",
  "mailbox",
  "folder",
  "q",
  "domain",
  "reason",
  "status",
  "from",
  "to",
  "days",
  "type",
  "sort",
  "dir",
  "out",
  "source",
  "pin",
  // template write commands (`mail templates create|update`)
  "name",
  "subject",
  "mjml",
  "mjml-file",
  // whatsapp commands (`whatsapp templates|send|logs`)
  "body",
  "body-file",
  "audience",
  "template",
  "vars",
  "mediaUrl",
  "category",
  "description",
  "session",
])

export function parseFlags(args: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (!a.startsWith("--")) {
      positional.push(a)
      continue
    }
    const body = a.slice(2)
    const eq = body.indexOf("=")
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1)
      continue
    }
    if (VALUE_FLAGS.has(body)) {
      const next = args[i + 1]
      if (next === undefined || next.startsWith("--")) {
        fail(
          `flag --${body} requires a value (use --${body}=value or --${body} value)`,
        )
      }
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { positional, flags }
}

/**
 * Resolve shared opts for general (non-vault) Sentroy CLI commands.
 *
 * Token resolution priority:
 *   1. --token=stk_... flag
 *   2. SENTROY_API_KEY env var
 *   3. SENTROY_ENV_API_KEY env var (back-compat — same token namespace works)
 *
 * Base URL priority:
 *   1. --url=https://... flag
 *   2. SENTROY_API_URL env var
 *   3. SENTROY_ENV_API_URL env var
 *   4. https://sentroy.com
 *
 * Company slug priority (REQUIRED for mail/storage):
 *   1. --company-slug=<slug> flag
 *   2. SENTROY_COMPANY_SLUG env var
 */
export function resolveSharedOpts(
  flags: Record<string, string | boolean>,
  opts: { requireCompanySlug?: boolean } = {},
): SharedOpts {
  const token =
    (typeof flags.token === "string" ? flags.token : null) ??
    process.env.SENTROY_API_KEY ??
    process.env.SENTROY_ENV_API_KEY ??
    null
  if (!token) {
    fail(
      "no token. Pass --token=stk_... or set SENTROY_API_KEY (or SENTROY_ENV_API_KEY for vault) in your environment.",
    )
  }
  const baseUrl = (
    (typeof flags.url === "string" ? flags.url : null) ??
    process.env.SENTROY_API_URL ??
    process.env.SENTROY_ENV_API_URL ??
    "https://sentroy.com"
  ).replace(/\/+$/, "")

  const companySlug =
    (typeof flags["company-slug"] === "string"
      ? (flags["company-slug"] as string)
      : null) ??
    process.env.SENTROY_COMPANY_SLUG ??
    undefined
  if (opts.requireCompanySlug && !companySlug) {
    fail(
      "no company slug. Pass --company-slug=<slug> or set SENTROY_COMPANY_SLUG in your environment.",
    )
  }
  return { token, baseUrl, companySlug }
}

/**
 * Thin fetch wrapper used by all subcommands that hit the Sentroy REST
 * API. Strips trailing slashes from baseUrl, adds Bearer auth, unwraps
 * `{success, data}` envelope, raises on non-2xx with a useful message.
 */
export async function apiFetch<T = unknown>(
  shared: SharedOpts,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${shared.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${shared.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    // Sentroy returns different envelopes depending on handler; try the
    // common shapes in priority order before falling back to HTTP status.
    let errMsg = `HTTP ${res.status} ${res.statusText}`.trim()
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>
      if (typeof b.error === "string") errMsg = b.error
      else if (typeof b.message === "string") errMsg = b.message
      else if (
        b.error &&
        typeof b.error === "object" &&
        typeof (b.error as Record<string, unknown>).message === "string"
      ) {
        errMsg = (b.error as Record<string, string>).message
      }
    }
    throw new Error(`${path}: ${errMsg}`)
  }
  // Envelope: {success: true, data: T} (most endpoints) or raw {data: T}.
  // Some return body directly without envelope; fall back to body.
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data
  }
  return body as T
}
