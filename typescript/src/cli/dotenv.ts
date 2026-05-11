/**
 * Minimal .env parser + serializer used by the CLI.
 *
 * Format conventions (mirrors apps/core/components/admin/env-vault-content.tsx
 * developer mode):
 *   - blank line resets pending description/public flag
 *   - `# @public` on its own line marks the next variable as browser-readable
 *   - `# any other text` becomes the next variable's description
 *   - `KEY=value`               (unquoted)
 *   - `KEY="value with spaces"` (double-quoted; supports \n, \", \\ escapes)
 *   - `KEY='single quotes'`     (single-quoted; literal)
 *   - `export KEY=value`        (export prefix stripped)
 *
 * Anything else is reported as a parse error with the offending line number.
 */

export interface DotenvEntry {
  key: string
  value: string
  public: boolean
  description: string | null
}

export interface DotenvParseResult {
  entries: DotenvEntry[]
  errors: { line: number; message: string }[]
}

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export function parseDotenv(text: string): DotenvParseResult {
  const lines = text.split(/\r?\n/)
  const entries: DotenvEntry[] = []
  const errors: DotenvParseResult["errors"] = []
  const seen = new Set<string>()

  let pendingDescription: string[] = []
  let pendingPublic = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ""
    const line = raw.trim()

    if (line === "") {
      pendingDescription = []
      pendingPublic = false
      continue
    }

    if (line.startsWith("#")) {
      const body = line.slice(1).trim()
      if (body === "@public") {
        pendingPublic = true
      } else if (body) {
        pendingDescription.push(body)
      }
      continue
    }

    const work = line.startsWith("export ") ? line.slice(7).trimStart() : line
    const eq = work.indexOf("=")
    if (eq <= 0) {
      errors.push({
        line: i + 1,
        message: "invalid syntax (expected KEY=value)",
      })
      pendingDescription = []
      pendingPublic = false
      continue
    }

    const key = work.slice(0, eq).trim()
    let value = work.slice(eq + 1)

    if (!KEY_PATTERN.test(key)) {
      errors.push({
        line: i + 1,
        message: "key must match [A-Z_][A-Z0-9_]*",
      })
      pendingDescription = []
      pendingPublic = false
      continue
    }

    const trimmed = value.trim()
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      value = trimmed.slice(1, -1)
      if (trimmed.startsWith('"')) {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
      }
    } else {
      value = trimmed
    }

    if (seen.has(key)) {
      errors.push({ line: i + 1, message: `duplicate key ${key}` })
      pendingDescription = []
      pendingPublic = false
      continue
    }
    seen.add(key)

    entries.push({
      key,
      value,
      public: pendingPublic,
      description:
        pendingDescription.length > 0 ? pendingDescription.join(" ") : null,
    })

    pendingDescription = []
    pendingPublic = false
  }

  return { entries, errors }
}

/**
 * Inverse of parseDotenv — emit a .env document that round-trips through it.
 * Quotes values that contain whitespace or shell-special characters.
 */
export function serializeDotenv(entries: DotenvEntry[]): string {
  const blocks: string[] = []
  for (const e of entries) {
    const parts: string[] = []
    if (e.description) parts.push(`# ${e.description}`)
    if (e.public) parts.push("# @public")
    const value = e.value
    const needsQuote = /[\s"'#$`\\]/.test(value) || value === ""
    const escaped = needsQuote
      ? `"${value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")}"`
      : value
    parts.push(`${e.key}=${escaped}`)
    blocks.push(parts.join("\n"))
  }
  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "")
}
