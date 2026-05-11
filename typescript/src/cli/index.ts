/**
 * `sentroy` — CLI entry point.
 *
 * Subcommand router with no third-party deps. Today only `env` exists;
 * future subcommands (`mail`, `media`, etc.) hook in here.
 */

import { cmdPush, cmdPull, cmdList, cmdDiff } from "./env"

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

function readPackageVersion(): string {
  if (VERSION !== "__VERSION__") return VERSION
  // Walk up from this file: dist/cli/index.js → dist/cli → dist → package.
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
      `  sentroy <command> [args] [flags]\n\n` +
      `COMMANDS\n` +
      `  env push  [<file>]     ${ENV_SUBCOMMANDS.push.description}\n` +
      `  env pull  [<file>]     ${ENV_SUBCOMMANDS.pull.description}\n` +
      `  env list               ${ENV_SUBCOMMANDS.list.description}\n` +
      `  env diff  [<file>]     ${ENV_SUBCOMMANDS.diff.description}\n\n` +
      `GLOBAL FLAGS\n` +
      `  --token=stk_env_...    Vault token (default: $SENTROY_ENV_API_KEY)\n` +
      `  --url=https://...      Sentroy core URL (default: $SENTROY_ENV_API_URL or https://sentroy.com)\n\n` +
      `ENV PUSH FLAGS\n` +
      `  --delete-missing       Remove vault keys not present in the local file (full sync)\n` +
      `  --dry-run              Print the diff but do not write\n` +
      `  --yes                  Skip the delete-confirmation prompt (CI-friendly)\n\n` +
      `ENV PULL FLAGS\n` +
      `  --force                Overwrite the file if it already exists\n\n` +
      `ENV LIST FLAGS\n` +
      `  --values               Include values (default: keys only)\n` +
      `  --public-only          Only variables marked public\n\n` +
      `EXAMPLES\n` +
      `  sentroy env push .env.production --delete-missing\n` +
      `  sentroy env pull .env --force\n` +
      `  sentroy env diff .env.production --delete-missing\n` +
      `  sentroy env list --values --public-only\n\n` +
      `Token scope (project + environment) is implicit — generate one in the\n` +
      `Sentroy vault dashboard.\n\n`,
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
