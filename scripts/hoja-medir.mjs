// Mide dónde está un control dentro de una captura y escupe el `style` listo
// para pegar en un <span class="ring">. Existe para no calcular los anillos a
// ojo: el alto tiene que salir del ancho por la proporción de la captura, si
// no el anillo se ve ovalado, y 2px de más lo dejan pisando el botón de al lado.
//
//   node scripts/hoja-medir.mjs docs/shots/mc-fila-blanca.png --color azul --zona .72,0,.87,1
//   node scripts/hoja-medir.mjs docs/shots/mc-header.png --color claro --zona .6,0,.9,.75 --halo 2 --sq
//
//   --color  azul | claro | oscuro | no-blanco   (qué píxeles cuentan como "el control")
//   --zona   x0,y0,x1,y1 en fracciones de la imagen, para aislar un control
//   --halo   px CSS de aire alrededor del control (default 2)
//   --sq     el control es cuadrado (chip/botón con esquinas), no un círculo
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pw from 'playwright'

const args = process.argv.slice(2)
const archivo = args.find(a => !a.startsWith('--'))
const opt = (n, def) => {
  const i = args.indexOf('--' + n)
  return i === -1 ? def : (args[i + 1]?.startsWith('--') ? true : args[i + 1])
}
if (!archivo) {
  console.error('Uso: node scripts/hoja-medir.mjs <captura.png> [--color azul|claro|oscuro|no-blanco] [--zona x0,y0,x1,y1] [--halo 2] [--sq]')
  process.exit(1)
}

const TESTS = {
  azul:        'bl > 150 && bl - r > 45 && bl - g > 25',
  claro:       'r > 215 && g > 215 && bl > 215',
  oscuro:      'r < 90 && g < 90 && bl < 90',
  'no-blanco': 'r < 245 || g < 245 || bl < 245',
}
const color = String(opt('color', 'azul'))
const test = TESTS[color]
if (!test) { console.error(`--color inválido: ${color} (usar ${Object.keys(TESTS).join(' | ')})`); process.exit(1) }
const zona = String(opt('zona', '0,0,1,1')).split(',').map(Number)
const halo = Number(opt('halo', 2))
const cuadrado = opt('sq', false) === true

const browser = await pw.chromium.launch()
const page = await browser.newPage()
await page.goto('about:blank')
const dataUrl = 'data:image/png;base64,' + readFileSync(resolve(archivo)).toString('base64')

const r = await page.evaluate(async ({ dataUrl, test, zona }) => {
  const img = new Image(); img.src = dataUrl; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const fn = new Function('r', 'g', 'bl', `return ${test}`)
  const [fx0, fy0, fx1, fy1] = zona
  const x0 = Math.round(fx0 * c.width), x1 = Math.round(fx1 * c.width)
  const y0 = Math.round(fy0 * c.height), y1 = Math.round(fy1 * c.height)
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * c.width + x) * 4
    if (fn(data[i], data[i + 1], data[i + 2])) {
      n++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return { w: c.width, h: c.height, n, minX, maxX, minY, maxY }
}, { dataUrl, test, zona })
await browser.close()

if (r.n === 0) {
  console.error('No matcheó ningún píxel: probá otro --color o ampliá la --zona.')
  process.exit(1)
}

// Las capturas salen a 2x, así que los px de imagen son la mitad en CSS.
const cssW = r.w / 2, cssH = r.h / 2
const ancho = (r.maxX - r.minX + 1) / 2, alto = (r.maxY - r.minY + 1) / 2
const cx = ((r.minX + r.maxX) / 2) / 2, cy = ((r.minY + r.maxY) / 2) / 2
const lado = Math.max(ancho, alto) + halo * 2
const w = lado / cssW * 100
const h = lado / cssH * 100
const left = (cx - lado / 2) / cssW * 100
const top = (cy - lado / 2) / cssH * 100
const f = v => v.toFixed(2).replace(/\.?0+$/, '')

console.log(`\ncaptura   ${r.w}x${r.h} px  (${cssW}x${cssH} CSS, proporción ${f(cssW / cssH)})`)
console.log(`control   ${f(ancho)}x${f(alto)} CSS, centro en ${f(cx)},${f(cy)}`)
console.log(`anillo    ${f(lado)}px CSS de lado (control + ${halo}px de aire a cada lado)\n`)
console.log(`  <span class="ring${cuadrado ? ' sq' : ''}" style="left:${f(left)}%; top:${f(top)}%; width:${f(w)}%; height:${f(h)}%;"></span>\n`)
console.log(`  (alto = ancho × ${f(cssW / cssH)} — verificalo con: node scripts/hoja-check.mjs)\n`)
