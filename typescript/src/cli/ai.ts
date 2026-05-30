/**
 * `sentroy ai install` — install the Sentroy SDK skill into AI coding
 * assistants (Claude Code, Cursor, Windsurf) and/or a universal
 * AGENTS.md file at the project root.
 *
 * Detection rules (autodetect mode, no explicit target flags):
 *   - `.claude/` dir OR `CLAUDE.md` file present  → install Claude target
 *   - `.cursor/` dir present                       → install Cursor target
 *   - `.windsurfrules` file present                → install Windsurf target
 *   - none of the above                            → fall back to AGENTS.md
 *
 * Explicit flags override detection:
 *   --claude / --cursor / --windsurf / --agents → install only those
 *   --all                                       → install every target
 *   --no-agents                                 → suppress AGENTS.md fallback
 *
 * Re-install / upgrade:
 *   Each merge-capable target wraps its body in a versioned sentinel block
 *   so future installs can find and replace it in-place. --upgrade refuses
 *   to write when the installed version already matches the bundled one.
 *
 * Dry-run:
 *   --check prints the plan (created / updated / unchanged / skipped) and
 *   exits without touching the filesystem.
 *
 * Source override:
 *   --source <path> loads SKILL.md from a local file instead of the
 *   bundled `<package>/skill/SKILL.md` shipped with the npm package.
 */

import * as fs from "fs"
import * as path from "path"
import { parseFlags, fail, info, ok, warn, c } from "./args"

// ── Constants ────────────────────────────────────────────────────────────

const SENTINEL_BEGIN = "<!-- sentroy-skill-begin"
const SENTINEL_END = "<!-- sentroy-skill-end -->"

type Target = "claude" | "cursor" | "windsurf" | "agents"

interface BundledSkill {
  raw: string
  version: string
}

interface WriteResult {
  status: "created" | "updated" | "unchanged" | "skipped"
  path: string
  note?: string
}

// ── Bundled skill loader ─────────────────────────────────────────────────

/**
 * Load the canonical SKILL.md. By default reads from the package's
 * `skill/SKILL.md` (sibling of `dist/`). With --source, reads any
 * local file the caller points at.
 *
 * Version resolution priority:
 *   1. `version:` field in YAML frontmatter (preferred — single source of truth)
 *   2. footer comment `<!-- skill-version: x.y.z -->`
 *   3. package.json version of the SDK (fallback — always present)
 */
function readBundledSkill(sourceFlag?: string): BundledSkill {
  const resolved = sourceFlag
    ? path.resolve(process.cwd(), sourceFlag)
    : path.join(__dirname, "..", "..", "skill", "SKILL.md")

  if (!fs.existsSync(resolved)) {
    fail(
      sourceFlag
        ? `--source path not found: ${resolved}`
        : `bundled SKILL.md missing at ${resolved}. Reinstall @sentroy-co/client-sdk.`,
    )
  }
  const raw = fs.readFileSync(resolved, "utf8")
  const version = parseSkillVersion(raw) ?? readPackageVersion()
  return { raw, version }
}

function parseSkillVersion(raw: string): string | null {
  // Try frontmatter first.
  const fm = extractFrontmatter(raw)
  if (fm) {
    const m = fm.match(/^\s*version\s*:\s*['"]?([^'"\n]+)['"]?\s*$/m)
    if (m) return m[1]!.trim()
  }
  // Fallback: footer/anywhere comment.
  const c2 = raw.match(/<!--\s*skill-version:\s*([^\s>]+)\s*-->/i)
  if (c2) return c2[1]!.trim()
  return null
}

function readPackageVersion(): string {
  try {
    // From dist/cli/ai.js → ../../package.json. From src during tests too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(path.join(__dirname, "..", "..", "package.json")) as {
      version: string
    }
    return pkg.version
  } catch {
    return "0.0.0"
  }
}

// ── Frontmatter helpers ──────────────────────────────────────────────────

function extractFrontmatter(raw: string): string | null {
  if (!raw.startsWith("---")) return null
  // Match a leading `---\n...\n---` block. Use a non-greedy capture.
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  return m ? m[1]! : null
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (!m) return raw
  return raw.slice(m[0].length).replace(/^\r?\n+/, "")
}

// ── Sentinel block helpers (load-bearing for re-installs) ────────────────

function makeSentinelBlock(body: string, version: string): string {
  const header = `${SENTINEL_BEGIN} v${version} -->`
  // Always terminate with a single trailing newline so concatenation in
  // merged files stays tidy across re-installs.
  return `${header}\n${body.trimEnd()}\n${SENTINEL_END}\n`
}

function findSentinelBlock(
  contents: string,
): { start: number; end: number; version: string | null } | null {
  const beginRe = /<!--\s*sentroy-skill-begin(?:\s+v([^\s>]+))?\s*-->/
  const beginMatch = beginRe.exec(contents)
  if (!beginMatch) return null
  const start = beginMatch.index
  const endIdx = contents.indexOf(SENTINEL_END, start)
  if (endIdx < 0) return null
  const end = endIdx + SENTINEL_END.length
  return { start, end, version: beginMatch[1] ?? null }
}

function getInstalledVersion(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf8")
  const block = findSentinelBlock(raw)
  return block?.version ?? null
}

/**
 * Append-or-replace a sentinel-wrapped block in a merge-capable file.
 * Creates the file (and parent dirs) when missing.
 *
 * Returns:
 *   "created"   — file did not exist before
 *   "updated"   — block existed but body/version differed
 *   "unchanged" — block existed and content matched exactly
 */
function writeSentinelBlock(
  filePath: string,
  body: string,
  version: string,
  opts: { check: boolean; upgrade: boolean },
): WriteResult {
  const block = makeSentinelBlock(body, version)
  const exists = fs.existsSync(filePath)

  if (!exists) {
    if (opts.check) return { status: "created", path: filePath }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, block, "utf8")
    return { status: "created", path: filePath }
  }

  const current = fs.readFileSync(filePath, "utf8")
  const found = findSentinelBlock(current)

  let next: string
  if (found) {
    const existingBlock = current.slice(found.start, found.end)
    if (existingBlock.trimEnd() === block.trimEnd()) {
      return { status: "unchanged", path: filePath }
    }
    if (opts.upgrade && found.version === version) {
      // Same version but body drifted (manual edit?). Don't clobber unless
      // explicitly asked via --all/non-upgrade install path.
      return {
        status: "unchanged",
        path: filePath,
        note: "version matches; pass --all to force overwrite",
      }
    }
    next =
      current.slice(0, found.start) +
      block.trimEnd() +
      "\n" +
      current.slice(found.end).replace(/^\r?\n+/, "")
  } else {
    // Append at end with a separating blank line.
    const sep = current.endsWith("\n") ? "\n" : "\n\n"
    next = current + sep + block
  }

  if (opts.check) return { status: "updated", path: filePath }
  fs.writeFileSync(filePath, next, "utf8")
  return { status: "updated", path: filePath }
}

/**
 * Write a standalone file (Claude / Cursor targets) without sentinel.
 * Compares bytes to detect unchanged. Always creates parent dirs.
 */
function writeStandalone(
  filePath: string,
  contents: string,
  opts: { check: boolean; upgrade: boolean; installedVersion: string | null; nextVersion: string },
): WriteResult {
  const exists = fs.existsSync(filePath)
  if (exists) {
    const current = fs.readFileSync(filePath, "utf8")
    if (current === contents) return { status: "unchanged", path: filePath }
    if (opts.upgrade && opts.installedVersion === opts.nextVersion) {
      return {
        status: "unchanged",
        path: filePath,
        note: "version matches; pass --all to force overwrite",
      }
    }
  }
  if (opts.check) {
    return { status: exists ? "updated" : "created", path: filePath }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, "utf8")
  return { status: exists ? "updated" : "created", path: filePath }
}

// ── Target detection ─────────────────────────────────────────────────────

interface DetectFlags {
  claude: boolean
  cursor: boolean
  windsurf: boolean
  agents: boolean
  all: boolean
  noAgents: boolean
}

function detectTargets(cwd: string, flags: DetectFlags): Target[] {
  if (flags.all) return ["claude", "cursor", "windsurf", "agents"]

  const explicit: Target[] = []
  if (flags.claude) explicit.push("claude")
  if (flags.cursor) explicit.push("cursor")
  if (flags.windsurf) explicit.push("windsurf")
  if (flags.agents) explicit.push("agents")
  if (explicit.length > 0) return explicit

  // Autodetect.
  const detected: Target[] = []
  if (
    fs.existsSync(path.join(cwd, ".claude")) ||
    fs.existsSync(path.join(cwd, "CLAUDE.md"))
  ) {
    detected.push("claude")
  }
  if (fs.existsSync(path.join(cwd, ".cursor"))) detected.push("cursor")
  if (fs.existsSync(path.join(cwd, ".windsurfrules"))) detected.push("windsurf")

  if (detected.length === 0 && !flags.noAgents) {
    detected.push("agents")
  } else if (!flags.noAgents && !detected.includes("agents")) {
    // Also drop an AGENTS.md alongside detected tools so non-Claude/Cursor
    // agents (Aider, Cline, Codex, …) still pick up the skill.
    detected.push("agents")
  }
  return detected
}

// ── Per-target installers ────────────────────────────────────────────────

function installClaude(
  cwd: string,
  skill: BundledSkill,
  opts: { check: boolean; upgrade: boolean },
): WriteResult {
  // Claude SKILL spec requires the file as-is with frontmatter.
  const target = path.join(cwd, ".claude", "skills", "sentroy", "SKILL.md")
  const installed = parseSkillVersion(
    fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "",
  )
  return writeStandalone(target, skill.raw, {
    check: opts.check,
    upgrade: opts.upgrade,
    installedVersion: installed,
    nextVersion: skill.version,
  })
}

function installCursor(
  cwd: string,
  skill: BundledSkill,
  opts: { check: boolean; upgrade: boolean },
): WriteResult {
  const target = path.join(cwd, ".cursor", "rules", "sentroy.mdc")
  const body = stripFrontmatter(skill.raw)
  const mdc =
    `---\n` +
    `description: Sentroy SDK reference\n` +
    `globs: "**/*"\n` +
    `alwaysApply: false\n` +
    `version: ${skill.version}\n` +
    `---\n\n` +
    body
  // Parse installed version from the .mdc frontmatter we wrote previously.
  let installed: string | null = null
  if (fs.existsSync(target)) {
    const fm = extractFrontmatter(fs.readFileSync(target, "utf8"))
    if (fm) {
      const m = fm.match(/^\s*version\s*:\s*['"]?([^'"\n]+)['"]?\s*$/m)
      if (m) installed = m[1]!.trim()
    }
  }
  return writeStandalone(target, mdc, {
    check: opts.check,
    upgrade: opts.upgrade,
    installedVersion: installed,
    nextVersion: skill.version,
  })
}

function installWindsurf(
  cwd: string,
  skill: BundledSkill,
  opts: { check: boolean; upgrade: boolean },
): WriteResult {
  const target = path.join(cwd, ".windsurfrules")
  const body = stripFrontmatter(skill.raw)
  return writeSentinelBlock(target, body, skill.version, opts)
}

function installAgents(
  cwd: string,
  skill: BundledSkill,
  opts: { check: boolean; upgrade: boolean },
): WriteResult {
  const target = path.join(cwd, "AGENTS.md")
  // Keep frontmatter for AGENTS.md too — many tools (Codex, Cline) read it
  // verbatim, and the YAML block is harmless markdown to those that don't.
  const body = skill.raw
  return writeSentinelBlock(target, body, skill.version, opts)
}

// ── Main handler ─────────────────────────────────────────────────────────

async function cmdInstall(args: string[]): Promise<void> {
  const { flags } = parseFlags(args)

  const detectFlags: DetectFlags = {
    claude: flags.claude === true,
    cursor: flags.cursor === true,
    windsurf: flags.windsurf === true,
    agents: flags.agents === true,
    all: flags.all === true,
    noAgents: flags["no-agents"] === true,
  }
  const check = flags.check === true
  const upgrade = flags.upgrade === true
  const sourceFlag =
    typeof flags.source === "string" ? (flags.source as string) : undefined

  const skill = readBundledSkill(sourceFlag)
  const cwd = process.cwd()
  const targets = detectTargets(cwd, detectFlags)

  if (targets.length === 0) {
    fail(
      "no install targets resolved. Pass --claude/--cursor/--windsurf/--agents or --all.",
    )
  }

  info(
    `Sentroy skill v${c.bold(skill.version)} ${check ? c.dim("(dry-run)") : ""}`.trim(),
  )
  info(
    `source: ${c.dim(sourceFlag ?? "bundled (" + path.join(__dirname, "..", "..", "skill", "SKILL.md") + ")")}`,
  )
  info(`targets: ${c.cyan(targets.join(", "))}`)
  process.stdout.write("\n")

  const results: WriteResult[] = []
  for (const t of targets) {
    try {
      let r: WriteResult
      if (t === "claude") r = installClaude(cwd, skill, { check, upgrade })
      else if (t === "cursor") r = installCursor(cwd, skill, { check, upgrade })
      else if (t === "windsurf") r = installWindsurf(cwd, skill, { check, upgrade })
      else r = installAgents(cwd, skill, { check, upgrade })
      results.push(r)
      printResult(t, r, check)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warn(`${t}: ${msg}`)
      results.push({ status: "skipped", path: "(error)", note: msg })
    }
  }

  process.stdout.write("\n")
  const created = results.filter((r) => r.status === "created").length
  const updated = results.filter((r) => r.status === "updated").length
  const unchanged = results.filter((r) => r.status === "unchanged").length
  const skipped = results.filter((r) => r.status === "skipped").length
  const verb = check ? "would" : ""
  ok(
    `${verb ? verb + " " : ""}created: ${c.bold(String(created))}  ` +
      `${verb ? verb + " " : ""}updated: ${c.bold(String(updated))}  ` +
      `unchanged: ${c.bold(String(unchanged))}  ` +
      `skipped: ${c.bold(String(skipped))}`,
  )
  if (check) info("dry-run — no files written. Re-run without --check to apply.")
}

function printResult(target: Target, r: WriteResult, check: boolean): void {
  const verb = check ? "would " : ""
  const rel = path.relative(process.cwd(), r.path) || r.path
  if (r.status === "created") ok(`${target}: ${verb}create  ${c.dim(rel)}`)
  else if (r.status === "updated") ok(`${target}: ${verb}update  ${c.dim(rel)}`)
  else if (r.status === "unchanged")
    info(`${target}: unchanged  ${c.dim(rel)}${r.note ? c.dim(" — " + r.note) : ""}`)
  else warn(`${target}: skipped  ${r.note ? c.dim(r.note) : ""}`)
}

// ── Export ───────────────────────────────────────────────────────────────

export const AI_HANDLERS = {
  install: cmdInstall,
}
