/**
 * `sentroy env <subcommand>` — vault sync from a local .env file.
 *
 * The token's (project, environment) scope is implicit; the CLI never
 * asks for either since it can't change them.
 */

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import {
  parseDotenv,
  serializeDotenv,
  type DotenvEntry,
} from "./dotenv"

const DEFAULT_FILE = ".env"
const DEFAULT_BASE_URL = "https://sentroy.com"

interface SharedOpts {
  token: string
  baseUrl: string
}

interface RemoteVariable {
  key: string
  value: string
  type: string
  public: boolean
}

interface PushResponse {
  project: string
  environment: string
  added: number
  updated: number
  unchanged: number
  deleted: number
  total: number
}

interface FetchResponse {
  project: string
  environment: string
  variables: RemoteVariable[]
}

// ── ANSI helpers (no deps) ───────────────────────────────────────────────
const supportsColor = process.stdout.isTTY && process.env.TERM !== "dumb"
const c = {
  bold: (s: string) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s: string) => (supportsColor ? `\x1b[35m${s}\x1b[0m` : s),
}

function fail(msg: string): never {
  process.stderr.write(`${c.red("✗")} ${msg}\n`)
  process.exit(1)
}

function info(msg: string): void {
  process.stdout.write(`${c.cyan("→")} ${msg}\n`)
}

function ok(msg: string): void {
  process.stdout.write(`${c.green("✓")} ${msg}\n`)
}

function warn(msg: string): void {
  process.stdout.write(`${c.yellow("⚠")} ${msg}\n`)
}

function resolveSharedOpts(rest: Record<string, string | boolean>): SharedOpts {
  const token =
    (typeof rest.token === "string" ? rest.token : null) ??
    process.env.SENTROY_ENV_API_KEY ??
    null
  if (!token) {
    fail(
      "no token. Pass --token=stk_env_... or set SENTROY_ENV_API_KEY in your environment.",
    )
  }
  const baseUrl =
    (typeof rest.url === "string" ? rest.url : null) ??
    process.env.SENTROY_ENV_API_URL ??
    DEFAULT_BASE_URL
  return { token, baseUrl: baseUrl.replace(/\/+$/, "") }
}

async function http<T>(
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
    const errMsg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(`${path}: ${errMsg}`)
  }
  return (body as { data?: T })?.data as T
}

function readFileOrFail(file: string): string {
  if (!fs.existsSync(file)) {
    fail(`file not found: ${file}`)
  }
  return fs.readFileSync(file, "utf8")
}

interface Diff {
  added: DotenvEntry[]
  updated: { entry: DotenvEntry; remote: RemoteVariable }[]
  unchanged: { entry: DotenvEntry; remote: RemoteVariable }[]
  deleted: RemoteVariable[]
}

function computeDiff(
  local: DotenvEntry[],
  remote: RemoteVariable[],
): Diff {
  const remoteByKey = new Map(remote.map((v) => [v.key, v]))
  const added: DotenvEntry[] = []
  const updated: Diff["updated"] = []
  const unchanged: Diff["unchanged"] = []
  for (const e of local) {
    const r = remoteByKey.get(e.key)
    if (!r) {
      added.push(e)
      continue
    }
    if (r.value !== e.value || r.public !== e.public) {
      updated.push({ entry: e, remote: r })
    } else {
      unchanged.push({ entry: e, remote: r })
    }
  }
  const localKeys = new Set(local.map((e) => e.key))
  const deleted = remote.filter((v) => !localKeys.has(v.key))
  return { added, updated, unchanged, deleted }
}

function printDiff(diff: Diff, deleteMissing: boolean): void {
  for (const e of diff.added) {
    process.stdout.write(`  ${c.green("+")} ${e.key}\n`)
  }
  for (const u of diff.updated) {
    process.stdout.write(`  ${c.yellow("~")} ${u.entry.key}\n`)
  }
  if (deleteMissing) {
    for (const d of diff.deleted) {
      process.stdout.write(`  ${c.red("-")} ${d.key}\n`)
    }
  } else if (diff.deleted.length > 0) {
    process.stdout.write(
      `  ${c.dim(`(${diff.deleted.length} key(s) only in vault, kept — pass --delete-missing to remove)`)}\n`,
    )
  }
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close()
      resolve(ans.trim().toLowerCase())
    })
  })
  return answer === "y" || answer === "yes"
}

// ── push ─────────────────────────────────────────────────────────────────

export async function cmdPush(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args)
  const file = positional[0] ?? DEFAULT_FILE
  const dryRun = !!flags["dry-run"]
  const deleteMissing = !!flags["delete-missing"]
  const shared = resolveSharedOpts(flags)

  const text = readFileOrFail(path.resolve(process.cwd(), file))
  const parsed = parseDotenv(text)
  if (parsed.errors.length > 0) {
    process.stderr.write(`${c.red("✗")} parse errors in ${file}:\n`)
    for (const err of parsed.errors) {
      process.stderr.write(`    line ${err.line}: ${err.message}\n`)
    }
    process.exit(1)
  }

  info(`fetching current vault snapshot…`)
  const remote = await http<FetchResponse>(shared, "/api/env-vault/fetch")
  const diff = computeDiff(parsed.entries, remote.variables)

  process.stdout.write(
    `\n${c.bold(remote.project)} ${c.dim("/")} ${c.magenta(remote.environment)} ${c.dim(
      `(${file} → ${shared.baseUrl})`,
    )}\n`,
  )
  printDiff(diff, deleteMissing)
  process.stdout.write(
    `\n  ${c.dim("summary:")} ${diff.added.length} new · ${diff.updated.length} updated · ${diff.unchanged.length} unchanged${
      deleteMissing ? ` · ${diff.deleted.length} to delete` : ""
    }\n\n`,
  )

  if (
    diff.added.length === 0 &&
    diff.updated.length === 0 &&
    (!deleteMissing || diff.deleted.length === 0)
  ) {
    ok("nothing to push.")
    return
  }

  if (dryRun) {
    info("dry run — no changes pushed.")
    return
  }

  if (deleteMissing && diff.deleted.length > 0) {
    if (flags.yes) {
      info(`--yes provided, skipping confirmation for ${diff.deleted.length} delete(s).`)
    } else if (!process.stdin.isTTY) {
      fail(
        `refusing to delete ${diff.deleted.length} key(s) without --yes in a non-interactive shell.`,
      )
    } else {
      const proceed = await confirm(
        `${c.yellow("⚠")} this will delete ${diff.deleted.length} key(s) from the vault. continue?`,
      )
      if (!proceed) {
        warn("aborted.")
        return
      }
    }
  }

  const result = await http<PushResponse>(shared, "/api/env-vault/push", {
    method: "POST",
    body: JSON.stringify({
      entries: parsed.entries.map((e) => ({
        key: e.key,
        value: e.value,
        public: e.public,
        description: e.description,
      })),
      deleteMissing,
    }),
  })
  ok(
    `${result.added} added · ${result.updated} updated · ${result.unchanged} unchanged · ${result.deleted} deleted`,
  )
}

// ── pull ─────────────────────────────────────────────────────────────────

export async function cmdPull(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args)
  const file = positional[0] ?? DEFAULT_FILE
  const force = !!flags.force
  const publicOnly = !!flags["public-only"]
  const shared = resolveSharedOpts(flags)

  const target = path.resolve(process.cwd(), file)
  if (fs.existsSync(target) && !force) {
    fail(`${file} already exists. Pass --force to overwrite.`)
  }

  info(`fetching from ${shared.baseUrl}…`)
  // Browser-safe subset (public-only) hits a dedicated endpoint that
  // strips secrets — useful for `.env.public` files committed to repos.
  const endpoint = publicOnly
    ? "/api/env-vault/public"
    : "/api/env-vault/fetch"
  const remote = await http<FetchResponse>(shared, endpoint)
  const entries: DotenvEntry[] = remote.variables.map((v) => ({
    key: v.key,
    value: v.value,
    public: v.public,
    description: null,
  }))
  const text = serializeDotenv(entries)
  fs.writeFileSync(target, text, "utf8")
  ok(
    `wrote ${entries.length} variable(s) to ${file} (${remote.project}/${remote.environment})${
      publicOnly ? " [public-only]" : ""
    }`,
  )
}

// ── list ─────────────────────────────────────────────────────────────────

export async function cmdList(args: string[]): Promise<void> {
  const { flags } = parseFlags(args)
  const showValues = !!flags.values
  const publicOnly = !!flags["public-only"]
  const shared = resolveSharedOpts(flags)

  const endpoint = publicOnly ? "/api/env-vault/public" : "/api/env-vault/fetch"
  const remote = await http<FetchResponse>(shared, endpoint)
  process.stdout.write(
    `${c.bold(remote.project)} ${c.dim("/")} ${c.magenta(remote.environment)} ${c.dim(`(${remote.variables.length} variable(s))`)}\n`,
  )
  for (const v of remote.variables) {
    const tag = v.public ? c.dim(" [public]") : ""
    if (showValues) {
      process.stdout.write(`  ${c.cyan(v.key)}=${v.value}${tag}\n`)
    } else {
      process.stdout.write(`  ${c.cyan(v.key)}${tag}\n`)
    }
  }
}

// ── diff ─────────────────────────────────────────────────────────────────

export async function cmdDiff(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args)
  const file = positional[0] ?? DEFAULT_FILE
  const deleteMissing = !!flags["delete-missing"]
  const shared = resolveSharedOpts(flags)

  const text = readFileOrFail(path.resolve(process.cwd(), file))
  const parsed = parseDotenv(text)
  if (parsed.errors.length > 0) {
    process.stderr.write(`${c.red("✗")} parse errors in ${file}:\n`)
    for (const err of parsed.errors) {
      process.stderr.write(`    line ${err.line}: ${err.message}\n`)
    }
    process.exit(1)
  }
  const remote = await http<FetchResponse>(shared, "/api/env-vault/fetch")
  const diff = computeDiff(parsed.entries, remote.variables)

  process.stdout.write(
    `${c.bold(remote.project)} ${c.dim("/")} ${c.magenta(remote.environment)} ${c.dim(`(${file} vs vault)`)}\n`,
  )
  printDiff(diff, deleteMissing)
  process.stdout.write(
    `\n  ${c.dim("summary:")} ${diff.added.length} new · ${diff.updated.length} updated · ${diff.unchanged.length} unchanged · ${diff.deleted.length} only in vault\n`,
  )
}

// ── flag parser ──────────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
}

/**
 * Flags that take a value as a separate token (`--flag value`). All other
 * `--flag` tokens are booleans. The `--flag=value` form always works
 * regardless of this list. Keeping this explicit avoids the classic argv
 * bug where `--dry-run /path/to/file` swallows the positional.
 */
const VALUE_FLAGS = new Set(["token", "url"])

function parseFlags(args: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
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
        fail(`flag --${body} requires a value (use --${body}=value or --${body} value)`)
      }
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { positional, flags }
}
