// Convierte docs/manual-ops.md → HTML con estilo KitchenOS → PDF (Edge headless).
// Manual de capacitación + referencia del módulo OPS (Operaciones).
// No editar el HTML/PDF a mano — editar el .md y correr: node scripts/manual-ops-to-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SRC = resolve('docs/manual-ops.md')
const HTML = resolve('docs/manual-ops.html')
const PDF = resolve('KitchenOS-Manual-OPS.pdf')

const md = readFileSync(SRC, 'utf8')

// ── Inline formatting ───────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s) {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

// ── Block parser ────────────────────────────────────────────
const lines = md.split(/\r?\n/)
let html = ''
let i = 0
let inCode = false
let codeBuf = []
let para = []

function flushParagraph(buf) {
  if (buf.length) html += `<p>${inline(buf.join(' '))}</p>\n`
  return []
}

while (i < lines.length) {
  const line = lines[i]

  if (line.trim().startsWith('```')) {
    if (!inCode) { para = flushParagraph(para); inCode = true; codeBuf = [] }
    else { html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>\n`; inCode = false }
    i++; continue
  }
  if (inCode) { codeBuf.push(line); i++; continue }

  if (/^---+\s*$/.test(line)) { para = flushParagraph(para); html += '<hr/>\n'; i++; continue }

  const h = line.match(/^(#{1,6})\s+(.*)$/)
  if (h) {
    para = flushParagraph(para)
    const lvl = h[1].length
    // Los H1 que empiezan con "TAB" o "PARTE" son divisores de sección con banda navy.
    const txt = h[2]
    if (lvl === 1 && /^(PARTE|TAB|ANEXO)/i.test(txt)) {
      html += `<h1 class="divider">${inline(txt)}</h1>\n`
    } else {
      html += `<h${lvl}>${inline(txt)}</h${lvl}>\n`
    }
    i++; continue
  }

  // blockquote — soporta callout tipado con prefijo (NOTA:, OJO:, TIP:, FLUJO:)
  if (/^>\s?/.test(line)) {
    para = flushParagraph(para)
    const buf = []
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
    const raw = buf.join(' ')
    let cls = 'note'
    if (/^OJO:/i.test(raw)) cls = 'warn'
    else if (/^TIP:/i.test(raw)) cls = 'tip'
    else if (/^FLUJO:/i.test(raw)) cls = 'flow'
    html += `<blockquote class="${cls}">${inline(raw.replace(/^(NOTA|OJO|TIP|FLUJO):\s*/i, ''))}</blockquote>\n`
    continue
  }

  // table
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

  if (line.trim() === '') { para = flushParagraph(para); i++; continue }

  para.push(line.trim())
  i++
}
para = flushParagraph(para)

// ── HTML wrapper con branding KitchenOS ─────────────────────
const doc = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>KitchenOS — Manual de OPS</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; font-size: 11.5px; line-height: 1.55; margin: 0; }
  h1 { color: #1c2d4a; font-size: 21px; border-bottom: 3px solid #1c2d4a; padding-bottom: 6px;
       margin: 26px 0 13px; page-break-after: avoid; }
  h1.divider { background: linear-gradient(160deg,#1a2a47,#101c33); color: #fff; border: none;
       border-radius: 12px; padding: 20px 22px; margin: 30px 0 16px; font-size: 20px;
       letter-spacing: .01em; page-break-before: auto; }
  h2 { color: #1c2d4a; font-size: 16px; margin: 22px 0 8px; page-break-after: avoid;
       border-left: 4px solid #4361a0; padding-left: 10px; }
  h3 { color: #4361a0; font-size: 13.5px; margin: 16px 0 6px; page-break-after: avoid; }
  h4 { color: #4361a0; font-size: 12px; margin: 12px 0 4px; page-break-after: avoid; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 10px; padding-left: 20px; }
  li { margin: 3px 0; }
  strong { color: #111827; }
  a { color: #4361a0; text-decoration: none; }
  code { background: #eef1f7; color: #1c2d4a; padding: 1px 5px; border-radius: 4px;
         font-family: "Cascadia Code", Consolas, monospace; font-size: 10px; white-space: nowrap; }
  pre { background: #0f1c33; color: #d8e0f0; border-radius: 10px; padding: 14px 16px;
        overflow-x: auto; page-break-inside: avoid; font-size: 10.5px; line-height: 1.5; }
  pre code { background: none; padding: 0; color: inherit; white-space: pre; font-size: inherit; }
  blockquote { margin: 10px 0; padding: 9px 14px; border-radius: 0 8px 8px 0; font-size: 11px;
               page-break-inside: avoid; }
  blockquote.note { border-left: 4px solid #4361a0; background: #f4f6fb; color: #374151; }
  blockquote.tip  { border-left: 4px solid #16a34a; background: #edf7f0; color: #14532d; }
  blockquote.warn { border-left: 4px solid #e0913c; background: #fdf6e9; color: #7a4f12; }
  blockquote.flow { border-left: 4px solid #7c5cd4; background: #f3f0fb; color: #3f2f7a; }
  blockquote strong { color: inherit; }
  hr { border: none; border-top: 1px solid #e3e6ec; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 10.3px;
          page-break-inside: avoid; }
  th { background: #1c2d4a; color: #fff; text-align: left; padding: 7px 9px; font-weight: 600; }
  td { border: 1px solid #e3e6ec; padding: 6px 9px; vertical-align: top; }
  td:first-child { white-space: nowrap; }
  tbody tr:nth-child(even) { background: #f8f9fb; }
  .cover { background: linear-gradient(160deg,#1a2a47,#101c33); color: #fff; padding: 40px 32px;
           border-radius: 14px; margin-bottom: 10px; }
  .cover .eyebrow { text-transform: uppercase; letter-spacing: .18em; font-size: 11px; font-weight: 700;
           color: #e7a049; margin-bottom: 12px; }
  .cover h1 { color: #fff; border: none; margin: 0 0 8px; font-size: 30px; }
  .cover p { color: #c7d0e2; margin: 0; font-size: 12.5px; }
  .cover .pill { display: inline-block; margin-top: 18px; border: 1px solid rgba(231,160,73,.5);
           color: #e7a049; border-radius: 999px; padding: 6px 15px; font-size: 11px; font-weight: 700; }
</style></head><body>
<div class="cover">
  <div class="eyebrow">KitchenOS · Operaciones</div>
  <h1>Manual de OPS</h1>
  <p>Capacitación y referencia completa del módulo Operaciones — Producción · Mise · Planificación</p>
  <span class="pill">Cada botón, función y comportamiento, registrado</span>
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
