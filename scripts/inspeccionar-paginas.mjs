// Mide la altura de cada .page y captura PNGs para inspección visual.
import puppeteer from 'puppeteer-core'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const HTML = resolve('docs/instructivo-carga-datos.html')
const OUT = resolve('docs/inspect'); mkdirSync(OUT, { recursive: true })
const A4 = 1122.5 // px @96dpi

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(HTML).href, { waitUntil: 'networkidle0' })
await page.evaluateHandle('document.fonts.ready')
await new Promise(r => setTimeout(r, 600))

const data = await page.$$eval('.page', els => els.map((e, i) => ({
  i, h: Math.round(e.getBoundingClientRect().height), sh: e.scrollHeight,
  cls: e.className.replace('page', '').trim(),
  head: (e.querySelector('h1,h2')?.textContent || '').slice(0, 30),
})))

const CLIENT = Math.round(296.6 * 96 / 25.4) // altura interior en px
console.log('client height =', CLIENT, 'px')
for (const d of data) {
  const over = d.sh > CLIENT + 2 ? `  ⚠ DESBORDE contenido +${d.sh - CLIENT}px` : ''
  console.log(`#${String(d.i).padStart(2)} scroll=${String(d.sh).padStart(5)}px ${d.cls.padEnd(10)} ${d.head}${over}`)
}

// PNG de páginas indicadas por argv (o las primeras 6)
const want = process.argv.slice(2).map(Number)
const idxs = want.length ? want : [0, 1, 2, 3, 4]
const pages = await page.$$('.page')
for (const i of idxs) {
  if (!pages[i]) continue
  await pages[i].screenshot({ path: resolve(OUT, `p${String(i).padStart(2, '0')}.png`) })
  console.log('PNG ->', `p${String(i).padStart(2, '0')}.png`)
}
await browser.close()
