import { motion, AnimatePresence } from "motion/react"
import type { UploadEntry } from "./use-upload-queue"
import { cn, formatBytes } from "./utils"

/**
 * Upload queue panel — MediaManager içinde grid'in altında collapsible bar.
 *
 * Tasarım:
 *  - Header: aktif sayı + total progress + clear-done butonu
 *  - Liste: her entry filename + circular progress + cancel/retry/remove
 *  - Animations: motion/react ile stagger entry, smooth progress, completion
 *    checkmark, error shake. `motion` paketi ~3KB minified — framer-motion
 *    yerine bilinçli seçim (SDK bundle hassasiyeti).
 */

export interface UploadQueuePanelProps {
  entries: UploadEntry[]
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onClearDone: () => void
  className?: string
}

export function UploadQueuePanel({
  entries,
  onCancel,
  onRemove,
  onClearDone,
  className,
}: UploadQueuePanelProps) {
  if (entries.length === 0) return null

  const active = entries.filter(
    (e) => e.status === "queued" || e.status === "uploading",
  ).length
  const done = entries.filter((e) => e.status === "done").length
  const failed = entries.filter(
    (e) => e.status === "error" || e.status === "canceled",
  ).length

  // Aggregate progress (toplam loaded / toplam total)
  const totalLoaded = entries.reduce((s, e) => s + e.loaded, 0)
  const totalSize = entries.reduce((s, e) => s + e.total, 0)
  const aggPercent = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "border-t bg-card/50 backdrop-blur-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          {active > 0 && (
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
              </span>
              {active} uploading
            </span>
          )}
          {done > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              {done} done
            </span>
          )}
          {failed > 0 && (
            <span className="text-destructive">{failed} failed</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {totalSize > 0 && (
            <span className="tabular-nums text-muted-foreground">
              {formatBytes(totalLoaded)} / {formatBytes(totalSize)} ·{" "}
              {aggPercent}%
            </span>
          )}
          {(done > 0 || failed > 0) && (
            <button
              type="button"
              onClick={onClearDone}
              className="rounded-md border px-2 py-0.5 text-[10px] hover:bg-muted/50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-48 overflow-y-auto py-1">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => (
            <UploadRow
              key={entry.id}
              entry={entry}
              index={i}
              onCancel={() => onCancel(entry.id)}
              onRemove={() => onRemove(entry.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function UploadRow({
  entry,
  index,
  onCancel,
  onRemove,
}: {
  entry: UploadEntry
  index: number
  onCancel: () => void
  onRemove: () => void
}) {
  const percent =
    entry.total > 0 ? Math.round((entry.loaded / entry.total) * 100) : 0
  const isTerminal =
    entry.status === "done" ||
    entry.status === "error" ||
    entry.status === "canceled"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{
        duration: 0.22,
        ease: [0.22, 1, 0.36, 1],
        delay: index < 5 ? index * 0.04 : 0,
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2",
        entry.status === "error" && "bg-destructive/5",
      )}
    >
      {/* Status indicator */}
      <div className="flex size-7 shrink-0 items-center justify-center">
        {entry.status === "uploading" && (
          <CircularProgress percent={percent} />
        )}
        {entry.status === "queued" && (
          <span className="size-2 animate-pulse rounded-full bg-muted-foreground/40" />
        )}
        {entry.status === "done" && <CheckmarkAnim />}
        {entry.status === "error" && (
          <span className="text-base text-destructive">!</span>
        )}
        {entry.status === "canceled" && (
          <span className="text-xs text-muted-foreground">×</span>
        )}
      </div>

      {/* Filename + meta */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium" title={entry.file.name}>
          {entry.file.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {entry.status === "uploading" && (
            <>
              {formatBytes(entry.loaded)} / {formatBytes(entry.total)} ·{" "}
              {percent}%
            </>
          )}
          {entry.status === "queued" && (
            <>{formatBytes(entry.total)} · queued</>
          )}
          {entry.status === "done" && (
            <span className="text-emerald-600 dark:text-emerald-400">
              uploaded · {formatBytes(entry.total)}
            </span>
          )}
          {entry.status === "error" && (
            <span className="text-destructive">
              {entry.error ?? "failed"}
            </span>
          )}
          {entry.status === "canceled" && <>canceled</>}
        </span>
      </div>

      {/* Action */}
      <button
        type="button"
        onClick={isTerminal ? onRemove : onCancel}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        aria-label={isTerminal ? "Remove from list" : "Cancel upload"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  )
}

function CircularProgress({ percent }: { percent: number }) {
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-muted/40"
      />
      <motion.circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="text-blue-500"
      />
    </svg>
  )
}

function CheckmarkAnim() {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 text-emerald-500"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <motion.path
        d="M20 6 9 17l-5-5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
      />
    </motion.svg>
  )
}
