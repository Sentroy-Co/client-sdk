// SDK build sonrası `react-advanced-cropper` paketinin tüm gerekli CSS'ini
// + Sentroy override'larını tek dosyada `dist/react/crop/styles.css` olarak
// emit eder. Consumer'lar `@sentroy-co/client-sdk/react/crop/styles.css`
// import eder; paketin internal path'ine (`react-advanced-cropper/dist/...`)
// bağımlı kalmaz.
//
// **Sıralama önemli:** Önce paketin `style.css` baseline'ı (geometric layout
// + transform + handler positioning), sonra `compact.css` teması (handler/
// line görsel sadeleştirmesi), en son Sentroy override'lar. Compact tema
// tek başına yetmiyor; baseline'sız stencil/handler hizalanmıyor.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const BASE = path.join(
  ROOT,
  "node_modules/react-advanced-cropper/dist/style.css",
)
const COMPACT = path.join(
  ROOT,
  "node_modules/react-advanced-cropper/dist/themes/compact.css",
)
const DST_DIR = path.join(ROOT, "dist/react/crop")
const DST = path.join(DST_DIR, "styles.css")

for (const f of [BASE, COMPACT]) {
  if (!fs.existsSync(f)) {
    console.error("[styles] kaynak bulunamadı:", f)
    process.exit(1)
  }
}

const base = fs.readFileSync(BASE, "utf8")
const compact = fs.readFileSync(COMPACT, "utf8")

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

const bundle =
  `/* react-advanced-cropper baseline (style.css) */\n` +
  base +
  `\n/* react-advanced-cropper compact theme */\n` +
  compact +
  overrides

fs.mkdirSync(DST_DIR, { recursive: true })
fs.writeFileSync(DST, bundle, "utf8")
console.log(
  `[styles] ${path.relative(ROOT, DST)} yazıldı (${bundle.length} byte; base=${base.length}, compact=${compact.length}, override=${overrides.length})`,
)
