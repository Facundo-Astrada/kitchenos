// Verifica una hoja instructiva antes de publicarla: que entre en una sola A4,
// que las columnas de todos los bloques caigan en la misma medianera, que las
// filas que deberían empezar juntas empiecen juntas, y que ningún anillo haya
// quedado ovalado. Deja además un PNG de cómo sale impresa.
//
//   node scripts/hoja-check.mjs docs/ops-modo-control-una-hoja.html
//
// Sale con código 1 si algo no pasa, así se puede encadenar antes de publicar.
import { pathToFileURL } from 'node:url'
import { resolve, basename } from 'node:path'
import pw from 'playwright'

const archivo = process.argv[2] || 'docs/ops-modo-control-una-hoja.html'
// Caja útil de una A4 con los márgenes de @page (8mm arriba/abajo, 9mm a los
// lados): 192mm x 281mm ≈ 726 x 1062 px CSS. Se deja 8px de colchón.
const ANCHO = 726, ALTO = 1062
const png = resolve(archivo).replace(/\.html$/, '.print.png')

const browser = await pw.chromium.launch()
const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(pathToFileURL(resolve(archivo)).href)
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)

let fallas = 0
const ok = (cond, txt) => { console.log(`  ${cond ? '✓' : '✗'} ${txt}`); if (!cond) fallas++ }
const casi = (a, b, tol = 1) => Math.abs(a - b) <= tol

console.log(`\n${basename(archivo)}\n`)

// ── 1. Entra en una A4 ───────────────────────────────────────
const alto = await page.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().height)
ok(alto <= ALTO, `entra en una A4: ${Math.round(alto)}px de ${ALTO} (sobran ${Math.round(ALTO - alto)})`)

// ── 2. Medianeras: todo bloque de ancho completo, en el mismo canal ──
const bordes = await page.$$eval('.block > .h, .block > .orden, .block > .par, .block > .dudas, .block > .chips, .block > .fig, .block > .aparte',
  els => els.map(e => { const b = e.getBoundingClientRect(); return [+b.left.toFixed(1), +b.right.toFixed(1)] }))
const izq = [...new Set(bordes.map(b => b[0]))], der = [...new Set(bordes.map(b => b[1]))]
ok(izq.length === 1 && der.length === 1, `todos los bloques al mismo ancho: L${izq.join('/')} R${der.join('/')}`)

// Las grillas de 3 columnas (chips y dudas) tienen que compartir columnas
const cols = await page.$$eval('.chips, .dudas', gs => gs.map(g =>
  [...g.children].map(c => +c.getBoundingClientRect().left.toFixed(1)).join(',')))
ok(new Set(cols).size <= 1, `chips y dudas comparten columnas: ${cols[0] ?? '—'}`)

// Los .par, todos con la misma medianera
const pares = await page.$$eval('.par', ps => ps.map(p => {
  const hijos = [...p.children].map(c => c.getBoundingClientRect())
  return +Math.min(...hijos.filter(h => h.left > p.getBoundingClientRect().left + 10).map(h => h.left)).toFixed(1)
}))
ok(new Set(pares).size <= 1, `las secciones a dos columnas comparten medianera: ${pares.join(' / ') || '—'}`)

// ── 3. Filas que deben arrancar juntas ───────────────────────
const filas = await page.$$eval('.par', ps => ps.map(p => {
  const g = sel => [...p.querySelectorAll(sel)].map(e => +e.getBoundingClientRect().top.toFixed(1))
  return { titulos: g(':scope > .h, :scope > div > .h'), pies: g(':scope > .nota') }
}))
filas.forEach((f, i) => {
  if (f.titulos.length > 1) ok(new Set(f.titulos).size === 1, `par ${i + 1}: títulos a la misma altura (${f.titulos.join(', ')})`)
  if (f.pies.length > 1) ok(new Set(f.pies).size === 1, `par ${i + 1}: pies a la misma altura (${f.pies.join(', ')})`)
})

// ── 4. Anillos redondos y dentro de su captura ───────────────
const anillos = await page.$$eval('.fig', figs => figs.flatMap(fig => {
  const img = fig.querySelector('img').getBoundingClientRect()
  return [...fig.querySelectorAll('.ring')].map(r => {
    const b = r.getBoundingClientRect()
    return {
      w: +b.width.toFixed(1), h: +b.height.toFixed(1),
      dentro: b.left >= img.left - 1 && b.right <= img.right + 1 && b.top >= img.top - 1 && b.bottom <= img.bottom + 1,
    }
  })
}))
anillos.forEach((a, i) => {
  ok(casi(a.w, a.h), `anillo ${i + 1} redondo: ${a.w}x${a.h}px`)
  ok(a.dentro, `anillo ${i + 1} dentro de su captura`)
})
if (anillos.length === 0) console.log('  · esta hoja no tiene anillos')

// ── 5. Foto de cómo sale impresa ─────────────────────────────
await page.screenshot({ path: png, fullPage: true })
console.log(`\n  impresión simulada -> ${png}`)
console.log(fallas === 0 ? '\n  todo en orden.\n' : `\n  ${fallas} cosa(s) para corregir.\n`)

await browser.close()
process.exit(fallas === 0 ? 0 : 1)
