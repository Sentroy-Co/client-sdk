// SDK build sonrası `react-mobile-cropper`'ın `style.css` baseline'ını
// `dist/react/crop/styles.css` olarak emit eder. Consumer'lar
// `@sentroy-co/client-sdk/react/crop/styles.css` import eder; paketin
// internal path'ine bağımlı kalmaz.
//
// `react-mobile-cropper` zaten iOS-vari mobile look default veriyor; ek
// theme dosyası (advanced-cropper'daki compact/bubble/classic gibi) yok.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const SRC = path.join(
  ROOT,
  "node_modules/react-mobile-cropper/dist/style.css",
)
const DST_DIR = path.join(ROOT, "dist/react/crop")
const DST = path.join(DST_DIR, "styles.css")

if (!fs.existsSync(SRC)) {
  console.error("[styles] kaynak bulunamadı:", SRC)
  process.exit(1)
}

const base = fs.readFileSync(SRC, "utf8")

fs.mkdirSync(DST_DIR, { recursive: true })
fs.writeFileSync(DST, base, "utf8")
console.log(
  `[styles] ${path.relative(ROOT, DST)} yazıldı (${base.length} byte)`,
)
