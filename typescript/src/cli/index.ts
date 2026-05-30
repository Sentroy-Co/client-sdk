/**
 * `sentroy` — CLI entry point.
 *
 * Subcommand router with no third-party deps. Groups:
 *   - env       Vault sync (push/pull/list/diff) — vault-scoped token
 *   - mail      Mail resource queries (templates/domains/mailboxes/...)
 *   - storage   Storage resource queries (buckets/media/usage)
 *   - ai        AI Skill install (Claude/Cursor/Windsurf/AGENTS.md)
 *
 * Shared helpers live in `./args` (parseFlags, resolveSharedOpts, apiFetch,
 * c, fail, info, ok, warn) and `./format` (printRows, printDetail, loc).
 */

import { cmdPush, cmdPull, cmdList, cmdDiff } from "./env"
import { MAIL_HANDLERS } from "./mail"
import { STORAGE_HANDLERS } from "./storage"
import { AI_HANDLERS } from "./ai"

const VERSION = "__VERSION__" // replaced at runtime via package.json read

interface SubCommand {
  description: string
  handler: (args: string[]) => Promise<void> | void
}

const ENV_SUBCOMMANDS: Record<string, SubCommand> = {
  push: {
    description: "Push a local .env file to the vault (full sync if --delete-missing)",
    handler: cmdPush,
  },
  pull: {
    description: "Fetch the vault scope and write to a local .env file",
    handler: cmdPull,
  },
  list: {
    description: "Print every key in the vault scope (--values to include values, --public-only)",
    handler: cmdList,
  },
  diff: {
    description: "Show what would change if you pushed the local .env file",
    handler: cmdDiff,
  },
}

// MAIL/STORAGE/AI subcommands use sub-sub-command pattern:
//   `sentroy mail templates list` → MAIL_HANDLERS["templates.list"]
//   `sentroy mail logs get <id>`  → MAIL_HANDLERS["logs.get"]
//
// Router joins argv[1] + argv[2] with "." for resource+verb lookup.
// `sentroy mail analytics` has no verb → MAIL_HANDLERS["analytics"].
// `sentroy ai install` has no resource → AI_HANDLERS["install"].

/**
 * Maps `mail templates list` → `templatesList`, `storage buckets get` →
 * `bucketsGet`. If verb missing, tries plain resource key (e.g. `analytics`
 * or `usage`). Returns the handler fn + how many argv tokens it consumed
 * past the group (2 = resource+verb, 1 = resource only) so caller can
 * slice the rest as args.
 */
function resolveHandler(
  handlers: Record<string, (args: string[]) => Promise<void> | void>,
  resource: string,
  verb: string | undefined,
): { fn: (args: string[]) => Promise<void> | void; consumed: number } | null {
  // Flag tokens are NOT verbs (e.g. `mail analytics --days=7`).
  const verbToken = verb && !verb.startsWith("--") ? verb : undefined
  if (verbToken) {
    const camel =
      resource + verbToken.charAt(0).toUpperCase() + verbToken.slice(1)
    const h = handlers[camel]
    if (h) return { fn: h, consumed: 3 }
  }
  const direct = handlers[resource]
  if (direct) return { fn: direct, consumed: 2 }
  return null
}

function readPackageVersion(): string {
  if (VERSION !== "__VERSION__") return VERSION
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require("../../package.json") as { version: string }
    return version
  } catch {
    return "unknown"
  }
}

function showHelp(): void {
  const v = readPackageVersion()
  process.stdout.write(
    `\nsentroy ${v} — Sentroy CLI\n\n` +
      `USAGE\n` +
      `  sentroy <group> <subcommand> [args] [flags]\n\n` +
      `ENV (vault sync — requires SENTROY_ENV_API_KEY)\n` +
      `  sentroy env push  [<file>]              ${ENV_SUBCOMMANDS.push!.description}\n` +
      `  sentroy env pull  [<file>]              ${ENV_SUBCOMMANDS.pull!.description}\n` +
      `  sentroy env list                        ${ENV_SUBCOMMANDS.list!.description}\n` +
      `  sentroy env diff  [<file>]              ${ENV_SUBCOMMANDS.diff!.description}\n\n` +
      `MAIL (requires SENTROY_API_KEY + SENTROY_COMPANY_SLUG)\n` +
      `  sentroy mail templates list             List email templates\n` +
      `  sentroy mail templates get <id>         Template detail\n` +
      `  sentroy mail domains list               List sending domains\n` +
      `  sentroy mail mailboxes list             List inbox mailboxes\n` +
      `  sentroy mail inbox list                 Recent inbox messages (--mailbox, --folder, --unread, --q, --page, --limit)\n` +
      `  sentroy mail suppressions list          Bounce/complaint suppressions (--domain, --reason)\n` +
      `  sentroy mail logs list                  Delivery logs (--status, --domain, --from, --to)\n` +
      `  sentroy mail logs get <id>              Log detail (event timeline)\n` +
      `  sentroy mail webhooks list              Webhook endpoints (--domain)\n` +
      `  sentroy mail analytics                  Aggregate stats (--days=7|30|90, --domain)\n\n` +
      `STORAGE (requires SENTROY_API_KEY + SENTROY_COMPANY_SLUG)\n` +
      `  sentroy storage buckets list            List storage buckets\n` +
      `  sentroy storage buckets get <slug>      Bucket detail\n` +
      `  sentroy storage media list <bucketSlug> List media in bucket (--type, --folder, --q, --sort, --dir, --limit, --skip)\n` +
      `  sentroy storage media get <bucketSlug> <mediaId>  Media detail\n` +
      `  sentroy storage usage                   Quota + per-bucket breakdown\n` +
      `  sentroy storage quota                   Lightweight quota only\n\n` +
      `AI SKILL (install the Sentroy AI agent skill into your project)\n` +
      `  sentroy ai install                      Autodetect tools (Claude, Cursor, Windsurf) + AGENTS.md\n` +
      `  sentroy ai install --claude             Install only into .claude/skills/sentroy/\n` +
      `  sentroy ai install --cursor             Install only into .cursor/rules/sentroy.mdc\n` +
      `  sentroy ai install --windsurf           Merge into .windsurfrules\n` +
      `  sentroy ai install --agents             Merge into AGENTS.md at cwd\n` +
      `  sentroy ai install --all                Install into every supported target\n` +
      `  sentroy ai install --upgrade            Re-install latest, replacing existing sentinel block\n` +
      `  sentroy ai install --check              Dry-run, show what would change\n\n` +
      `GLOBAL FLAGS\n` +
      `  --token=stk_...                         Override $SENTROY_API_KEY (env vault uses $SENTROY_ENV_API_KEY)\n` +
      `  --url=https://...                       Override base URL (default https://sentroy.com)\n` +
      `  --company-slug=<slug>                   Override $SENTROY_COMPANY_SLUG (required for mail/storage)\n` +
      `  --output=json|table                     Output format (default table)\n\n` +
      `EXAMPLES\n` +
      `  sentroy env push .env.production --delete-missing\n` +
      `  sentroy mail templates list --output=json | jq '.[].name'\n` +
      `  sentroy mail logs list --status=bounced --days=7\n` +
      `  sentroy storage buckets list\n` +
      `  sentroy ai install\n\n` +
      `DOCS\n` +
      `  https://docs.sentroy.com/cli            Full CLI reference\n` +
      `  https://docs.sentroy.com/ai-skills      AI Skill install guide\n\n`,
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (
    argv.length === 0 ||
    argv[0] === "-h" ||
    argv[0] === "--help" ||
    argv[0] === "help"
  ) {
    showHelp()
    return
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(`${readPackageVersion()}\n`)
    return
  }

  const cmd = argv[0]

  if (cmd === "env") {
    const sub = argv[1]
    const handler = sub ? ENV_SUBCOMMANDS[sub] : undefined
    if (!handler) {
      process.stderr.write(
        `unknown env subcommand: ${sub ?? "<missing>"}\n` +
          `available: ${Object.keys(ENV_SUBCOMMANDS).join(", ")}\n`,
      )
      process.exit(1)
    }
    await handler.handler(argv.slice(2))
    return
  }

  if (cmd === "mail") {
    // `mail <resource> [verb] [args]` → handler key = resource + Capitalize(verb).
    // Exception: `mail analytics` has no verb → handler key = "analytics".
    const resource = argv[1]
    const verb = argv[2]
    if (!resource) {
      process.stderr.write(
        `usage: sentroy mail <resource> [verb] [args]\nresources: templates, domains, mailboxes, inbox, suppressions, logs, webhooks, analytics\n`,
      )
      process.exit(1)
    }
    const handler = resolveHandler(MAIL_HANDLERS, resource, verb)
    if (!handler) {
      process.stderr.write(
        `unknown mail command: \`sentroy mail ${resource}${verb ? " " + verb : ""}\`\n` +
          `available: ${Object.keys(MAIL_HANDLERS).join(", ")}\n`,
      )
      process.exit(1)
    }
    await handler.fn(argv.slice(handler.consumed))
    return
  }

  if (cmd === "storage") {
    const resource = argv[1]
    const verb = argv[2]
    if (!resource) {
      process.stderr.write(
        `usage: sentroy storage <resource> [verb] [args]\nresources: buckets, media, usage, quota\n`,
      )
      process.exit(1)
    }
    const handler = resolveHandler(STORAGE_HANDLERS, resource, verb)
    if (!handler) {
      process.stderr.write(
        `unknown storage command: \`sentroy storage ${resource}${verb ? " " + verb : ""}\`\n` +
          `available: ${Object.keys(STORAGE_HANDLERS).join(", ")}\n`,
      )
      process.exit(1)
    }
    await handler.fn(argv.slice(handler.consumed))
    return
  }

  if (cmd === "ai") {
    const sub = argv[1]
    const handler = sub ? AI_HANDLERS[sub as keyof typeof AI_HANDLERS] : undefined
    if (!handler) {
      process.stderr.write(
        `unknown ai subcommand: ${sub ?? "<missing>"}\n` +
          `available: ${Object.keys(AI_HANDLERS).join(", ")}\n`,
      )
      process.exit(1)
    }
    await handler(argv.slice(2))
    return
  }

  process.stderr.write(
    `unknown command: ${cmd}\nrun \`sentroy --help\` for usage.\n`,
  )
  process.exit(1)
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\n\x1b[31m✗\x1b[0m ${msg}\n`)
  process.exit(1)
})
