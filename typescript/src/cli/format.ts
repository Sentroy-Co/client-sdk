/**
 * Output formatters — table (human-friendly) + json (script/automation).
 *
 * CLI commands accept `--output=json|table` (default: table) and call
 * `printRows(rows, columns, flags)`.
 */

import { c } from "./args"

export interface Column<T> {
  /** Header text shown in table mode (uppercase recommended). */
  header: string
  /** Value extractor; should return a primitive that .toString()'s cleanly. */
  get: (row: T) => string | number | null | undefined
  /** Max display width — longer values get truncated with `…`. Default 40. */
  maxWidth?: number
  /** Right-align numeric columns. Default false. */
  alignRight?: boolean
}

/**
 * Print rows as a formatted table (or JSON if --output=json).
 *
 * Table mode uses 2-space gap between columns, dim header line, no
 * vertical separators (keeps copy-paste clean). Empty cells render as
 * `c.dim("—")`.
 */
export function printRows<T>(
  rows: T[],
  columns: Column<T>[],
  flags: Record<string, string | boolean>,
): void {
  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output === "json") {
    // For JSON we dump the raw row objects, not the column projection —
    // scripts may want fields beyond what we show in the table.
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n")
    return
  }
  if (rows.length === 0) {
    process.stdout.write(c.dim("(no results)") + "\n")
    return
  }
  // Compute string cells + widths
  const cells: string[][] = rows.map((row) =>
    columns.map((col) => {
      const v = col.get(row)
      if (v === null || v === undefined || v === "") return ""
      const s = String(v)
      const max = col.maxWidth ?? 40
      if (s.length > max) return s.slice(0, max - 1) + "…"
      return s
    }),
  )
  const widths = columns.map((col, i) => {
    const headerWidth = col.header.length
    const rowMax = cells.reduce((m, r) => Math.max(m, (r[i] ?? "").length), 0)
    return Math.max(headerWidth, rowMax)
  })

  // Header
  const headerLine = columns
    .map((col, i) => padCell(col.header, widths[i]!, col.alignRight ?? false))
    .join("  ")
  process.stdout.write(c.dim(headerLine) + "\n")

  // Underline
  const underline = widths.map((w) => "─".repeat(w)).join("  ")
  process.stdout.write(c.dim(underline) + "\n")

  // Rows
  for (const cellRow of cells) {
    const line = columns
      .map((col, i) => {
        const v = cellRow[i] ?? ""
        const padded = padCell(v || c.dim("—"), widths[i]!, col.alignRight ?? false)
        return padded
      })
      .join("  ")
    process.stdout.write(line + "\n")
  }
  process.stdout.write("\n" + c.dim(`${rows.length} row${rows.length === 1 ? "" : "s"}`) + "\n")
}

function padCell(text: string, width: number, alignRight: boolean): string {
  // ANSI escape sequences mess up String.prototype.padEnd length math;
  // strip color codes for width calculation only.
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "")
  const pad = " ".repeat(Math.max(0, width - visible.length))
  return alignRight ? pad + text : text + pad
}

/**
 * Print a single object as a key/value detail panel.
 * Used by `<group> <resource> get <id>` commands.
 */
export function printDetail<T extends Record<string, unknown>>(
  obj: T,
  flags: Record<string, string | boolean>,
): void {
  const output =
    typeof flags.output === "string" ? flags.output.toLowerCase() : "table"
  if (output === "json") {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n")
    return
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) {
    process.stdout.write(c.dim("(empty)") + "\n")
    return
  }
  const longest = keys.reduce((m, k) => Math.max(m, k.length), 0)
  for (const k of keys) {
    const v = obj[k]
    const valStr =
      v === null || v === undefined
        ? c.dim("—")
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v)
    process.stdout.write(`${c.dim(k.padEnd(longest))}  ${valStr}\n`)
  }
  process.stdout.write("\n")
}

/**
 * Localized string helper — Sentroy mail/templates fields can be either a
 * plain string or `Record<locale, string>` (e.g. `{tr, en}`). For table
 * display, pick "en" fallback "tr" fallback first available, otherwise
 * the raw string.
 */
export function loc(value: unknown, preferred = "en"): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const direct = obj[preferred]
    if (typeof direct === "string") return direct
    const tr = obj.tr
    if (typeof tr === "string") return tr
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "string") return obj[k] as string
    }
  }
  return ""
}
