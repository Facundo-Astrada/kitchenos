// Compila una hoja instructiva: toma el .src.html (contenido) y devuelve un
// .html autocontenido, con el CSS y las capturas empotrados como data URI.
// Hace falta porque el Artifact publicado bloquea cualquier host externo, y
// porque así la hoja se imprime desde cualquier lado sin llevar la carpeta
// de imágenes al lado.
//
//   node scripts/build-hoja.mjs docs/ops-modo-control-una-hoja.src.html
//   node scripts/build-hoja.mjs            # compila todas las docs/*.src.html
//
// Ver la skill `hoja-instructiva` para el procedimiento completo.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, join, extname, basename } from 'node:path'

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

function compilar(srcPath) {
  const src = resolve(srcPath)
  if (!src.endsWith('.src.html')) throw new Error(`${srcPath}: se esperaba un archivo .src.html`)
  const dir = dirname(src)
  const out = src.replace(/\.src\.html$/, '.html')
  let html = readFileSync(src, 'utf8')
  let bytes = 0
  const empotradas = []

  // 1. Hojas de estilo locales → <style> inline
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g, (m, href) => {
    if (/^(https?:)?\/\//.test(href)) return m
    const css = readFileSync(join(dir, href), 'utf8')
    bytes += css.length
    empotradas.push(`${href} (${Math.round(css.length / 1024)} kB)`)
    return `<style>\n${css}\n</style>`
  })

  // 2. Imágenes locales → data URI
  html = html.replace(/src="([^"]+)"/g, (m, ruta) => {
    if (/^(data:|https?:|\/\/)/.test(ruta)) return m
    const ext = extname(ruta).toLowerCase()
    const mime = MIME[ext]
    if (!mime) return m
    const bin = readFileSync(join(dir, ruta))
    bytes += bin.length
    empotradas.push(`${ruta} (${Math.round(bin.length / 1024)} kB)`)
    return `src="data:${mime};base64,${bin.toString('base64')}"`
  })

  const suelto = html.match(/(src|href)="(?!data:|https?:|#)[^"]+"/g)
  if (suelto) throw new Error(`${basename(src)}: quedaron referencias externas sin empotrar: ${suelto.join(', ')}`)

  writeFileSync(out, html, 'utf8')
  console.log(`${basename(src)}`)
  for (const e of empotradas) console.log(`   · ${e}`)
  console.log(`   -> ${out.replace(process.cwd() + '\\', '').replace(/\\/g, '/')} (${Math.round(html.length / 1024)} kB)\n`)
}

const args = process.argv.slice(2)
const objetivos = args.length > 0
  ? args
  : readdirSync('docs').filter(f => f.endsWith('.src.html')).map(f => join('docs', f))

if (objetivos.length === 0) {
  console.error('No hay ninguna docs/*.src.html para compilar.')
  process.exit(1)
}
for (const o of objetivos) compilar(o)
