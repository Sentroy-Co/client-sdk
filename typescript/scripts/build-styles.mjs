// SDK build sonrası `react-advanced-cropper` paketinin `compact.css` temasını
// + Sentroy override'larını tek dosyada `dist/react/crop/styles.css` olarak
// emit eder. Consumer'lar `@sentroy-co/client-sdk/react/crop/styles.css`
// import eder; paketin internal path'ine (`react-advanced-cropper/dist/...`)
// bağımlı kalmaz.
//
// `compact.css` `themes/default.css`'ten daha kompakt handler/line geometrisi
// sunuyor — Sentroy crop UI'sı için tercih edilen tema.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const SRC = path.join(
  ROOT,
  "node_modules/react-advanced-cropper/dist/themes/compact.css",
)
const DST_DIR = path.join(ROOT, "dist/react/crop")
const DST = path.join(DST_DIR, "styles.css")

if (!fs.existsSync(SRC)) {
  console.error("[styles] compact.css bulunamadı:", SRC)
  process.exit(1)
}

const compact = fs.readFileSync(SRC, "utf8")

// Sentroy override'ları — line wrapper width fix + handler wrapper size.
// react-advanced-cropper'ın bazı varsayılan boyutları Sentroy dialog
// layout'unda overflow'a yol açıyor; bu küçük override'lar sorunu kapatır.
const overrides = `
/* ─ Sentroy overrides ────────────────────────────────────────────────── */
.advanced-cropper-line-wrapper--east,
.advanced-cropper-line-wrapper--west,
.advanced-cropper-line-wrapper--north,
.advanced-cropper-line-wrapper--south {
  width: 2px !important;
}
.advanced-cropper-handler-wrapper {
  height: auto !important;
  width: auto !important;
}
`

fs.mkdirSync(DST_DIR, { recursive: true })
fs.writeFileSync(DST, compact + overrides, "utf8")
console.log(
  `[styles] ${path.relative(ROOT, DST)} yazıldı (${compact.length + overrides.length} byte)`,
)
