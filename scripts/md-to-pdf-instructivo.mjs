// Convierte docs/instructivo-carga-datos.md → HTML con estilo KitchenOS → PDF (Edge headless).
// Uso: node scripts/md-to-pdf-instructivo.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SRC = resolve('docs/instructivo-carga-datos.md')
const HTML = resolve('docs/instructivo-carga-datos.html')
const PDF = resolve('docs/instructivo-carga-datos.pdf')

const md = readFileSync(SRC, 'utf8')

// ── Inline formatting ───────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s) {
  let out = esc(s)
  // inline code
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // italic (single *), avoid touching already-consumed **
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

// ── Block parser ────────────────────────────────────────────
const lines = md.split(/\r?\n/)
let html = ''
let i = 0
let inCode = false
let codeBuf = []

function flushParagraph(buf) {
  if (buf.length) html += `<p>${inline(buf.join(' '))}</p>\n`
  return []
}

let para = []

while (i < lines.length) {
  const line = lines[i]

  // code fence
  if (line.trim().startsWith('```')) {
    if (!inCode) { para = flushParagraph(para); inCode = true; codeBuf = [] }
    else { html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>\n`; inCode = false }
    i++; continue
  }
  if (inCode) { codeBuf.push(line); i++; continue }

  // horizontal rule
  if (/^---+\s*$/.test(line)) { para = flushParagraph(para); html += '<hr/>\n'; i++; continue }

  // headings
  const h = line.match(/^(#{1,6})\s+(.*)$/)
  if (h) {
    para = flushParagraph(para)
    const lvl = h[1].length
    html += `<h${lvl}>${inline(h[2])}</h${lvl}>\n`
    i++; continue
  }

  // blockquote (group consecutive)
  if (/^>\s?/.test(line)) {
    para = flushParagraph(para)
    const buf = []
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
    html += `<blockquote>${inline(buf.join(' '))}</blockquote>\n`
    continue
  }

  // table (header line followed by |---| separator)
  if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    para = flushParagraph(para)
    const headerCells = line.split('|').slice(1, -1).map(c => c.trim())
    i += 2
    const rows = []
    while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
      rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()))
      i++
    }
    html += '<table><thead><tr>'
    html += headerCells.map(c => `<th>${inline(c)}</th>`).join('')
    html += '</tr></thead><tbody>'
    for (const r of rows) html += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'
    html += '</tbody></table>\n'
    continue
  }

  // unordered list (group)
  if (/^\s*-\s+/.test(line)) {
    para = flushParagraph(para)
    html += '<ul>'
    while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
      html += `<li>${inline(lines[i].replace(/^\s*-\s+/, ''))}</li>`
      i++
    }
    html += '</ul>\n'
    continue
  }

  // ordered list (group)
  if (/^\s*\d+\.\s+/.test(line)) {
    para = flushParagraph(para)
    html += '<ol>'
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
      html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`
      i++
    }
    html += '</ol>\n'
    continue
  }

  // blank line → paragraph break
  if (line.trim() === '') { para = flushParagraph(para); i++; continue }

  // accumulate paragraph text
  para.push(line.trim())
  i++
}
para = flushParagraph(para)

// ── HTML wrapper con branding KitchenOS ─────────────────────
const doc = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; font-size: 11.5px; line-height: 1.55; margin: 0; }
  h1 { color: #1c2d4a; font-size: 22px; border-bottom: 3px solid #1c2d4a; padding-bottom: 6px;
       margin: 28px 0 14px; page-break-after: avoid; }
  h2 { color: #1c2d4a; font-size: 16px; margin: 22px 0 8px; page-break-after: avoid; }
  h3 { color: #4361a0; font-size: 13.5px; margin: 16px 0 6px; page-break-after: avoid; }
  h4 { color: #4361a0; font-size: 12px; margin: 12px 0 4px; page-break-after: avoid; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 10px; padding-left: 20px; }
  li { margin: 3px 0; }
  strong { color: #111827; }
  a { color: #4361a0; text-decoration: none; }
  code { background: #f1f3f7; color: #1c2d4a; padding: 1px 5px; border-radius: 4px;
         font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; }
  pre { background: #f6f7f9; border: 1px solid #e3e6ec; border-radius: 8px; padding: 12px 14px;
        overflow-x: auto; page-break-inside: avoid; }
  pre code { background: none; padding: 0; color: #334155; line-height: 1.4; }
  blockquote { border-left: 4px solid #4361a0; background: #f4f6fb; margin: 10px 0;
               padding: 8px 14px; color: #374151; border-radius: 0 6px 6px 0; }
  hr { border: none; border-top: 1px solid #e3e6ec; margin: 18px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 10.5px;
          page-break-inside: avoid; }
  th { background: #1c2d4a; color: #fff; text-align: left; padding: 7px 10px; font-weight: 600; }
  td { border: 1px solid #e3e6ec; padding: 6px 10px; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f8f9fb; }
  .cover { background: #1c2d4a; color: #fff; padding: 34px 30px; border-radius: 12px; margin-bottom: 8px; }
  .cover h1 { color: #fff; border: none; margin: 0 0 6px; font-size: 26px; }
  .cover p { color: #c7d0e2; margin: 0; font-size: 12px; }
</style></head><body>
<div class="cover">
  <h1>Instructivo de carga de datos</h1>
  <p>KitchenOS · Guía para administradores y equipo del día a día</p>
</div>
${html}
</body></html>`

writeFileSync(HTML, doc, 'utf8')
console.log('HTML generado:', HTML)

// ── Imprimir a PDF con Edge headless ────────────────────────
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
execFileSync(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  `--print-to-pdf=${PDF}`,
  `file:///${HTML.replace(/\\/g, '/')}`,
], { stdio: 'inherit', timeout: 60000 })
console.log('PDF generado:', PDF)
