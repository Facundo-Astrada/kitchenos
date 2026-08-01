// Convierte docs/ops-guia-rapida.md → HTML con estilo KitchenOS → PDF (Edge headless).
// Guía rápida de OPS (5 minutos) — solo el circuito, sin referencia de botones.
// Editar el .md y correr: node scripts/ops-guia-rapida-to-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SRC = resolve('docs/ops-guia-rapida.md')
const HTML = resolve('docs/ops-guia-rapida.html')
const PDF = resolve('KitchenOS-OPS-Guia-Rapida.pdf')

const md = readFileSync(SRC, 'utf8')

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function inline(s) {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

const lines = md.split(/\r?\n/)
let html = '', i = 0, inCode = false, codeBuf = [], para = []
function flushParagraph(buf) { if (buf.length) html += `<p>${inline(buf.join(' '))}</p>\n`; return [] }

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
  if (h) { para = flushParagraph(para); const lvl = h[1].length; html += `<h${lvl}>${inline(h[2])}</h${lvl}>\n`; i++; continue }
  if (/^>\s?/.test(line)) {
    para = flushParagraph(para)
    const buf = []
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
    const raw = buf.join(' ')
    let cls = 'note'
    if (/^OJO:/i.test(raw)) cls = 'warn'
    else if (/^TIP:/i.test(raw)) cls = 'tip'
    html += `<blockquote class="${cls}">${inline(raw.replace(/^(NOTA|OJO|TIP):\s*/i, ''))}</blockquote>\n`
    continue
  }
  if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    para = flushParagraph(para)
    const headerCells = line.split('|').slice(1, -1).map(c => c.trim())
    i += 2
    const rows = []
    while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim())); i++ }
    html += '<table><thead><tr>' + headerCells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
    for (const r of rows) html += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'
    html += '</tbody></table>\n'
    continue
  }
  if (/^\s*-\s+/.test(line)) {
    para = flushParagraph(para); html += '<ul>'
    while (i < lines.length && /^\s*-\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*-\s+/, ''))}</li>`; i++ }
    html += '</ul>\n'; continue
  }
  if (/^\s*\d+\.\s+/.test(line)) {
    para = flushParagraph(para); html += '<ol>'
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`; i++ }
    html += '</ol>\n'; continue
  }
  if (line.trim() === '') { para = flushParagraph(para); i++; continue }
  para.push(line.trim()); i++
}
para = flushParagraph(para)

const doc = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>KitchenOS — OPS en 5 minutos</title>
<style>
  @page { size: A4; margin: 16mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1f2937; font-size: 12.5px; line-height: 1.6; margin: 0; }
  h1 { color: #1c2d4a; font-size: 20px; margin: 24px 0 10px; page-break-after: avoid; }
  h2 { color: #1c2d4a; font-size: 16px; margin: 22px 0 8px; page-break-after: avoid;
       border-left: 4px solid #e7a049; padding-left: 10px; }
  h3 { color: #4361a0; font-size: 13.5px; margin: 14px 0 5px; page-break-after: avoid; }
  p { margin: 7px 0; }
  ul, ol { margin: 7px 0 11px; padding-left: 22px; }
  li { margin: 5px 0; }
  strong { color: #111827; }
  code { background: #eef1f7; color: #1c2d4a; padding: 1px 5px; border-radius: 4px;
         font-family: "Cascadia Code", Consolas, monospace; font-size: 11px; }
  pre { background: #0f1c33; color: #d8e0f0; border-radius: 10px; padding: 16px 18px;
        overflow-x: auto; page-break-inside: avoid; font-size: 12px; line-height: 1.6; text-align: center; }
  pre code { background: none; padding: 0; color: inherit; white-space: pre; }
  blockquote { margin: 11px 0; padding: 10px 15px; border-radius: 0 8px 8px 0; font-size: 12px; page-break-inside: avoid; }
  blockquote.note { border-left: 4px solid #4361a0; background: #f4f6fb; color: #374151; }
  blockquote.tip  { border-left: 4px solid #16a34a; background: #edf7f0; color: #14532d; }
  blockquote.warn { border-left: 4px solid #e0913c; background: #fdf6e9; color: #7a4f12; }
  hr { border: none; border-top: 1px solid #e3e6ec; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 11.5px; page-break-inside: avoid; }
  th { background: #1c2d4a; color: #fff; text-align: left; padding: 8px 11px; font-weight: 600; }
  td { border: 1px solid #e3e6ec; padding: 7px 11px; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f8f9fb; }
  .cover { background: linear-gradient(160deg,#1a2a47,#101c33); color: #fff; padding: 38px 32px; border-radius: 14px; margin-bottom: 14px; }
  .cover .eyebrow { text-transform: uppercase; letter-spacing: .18em; font-size: 11px; font-weight: 700; color: #e7a049; margin-bottom: 12px; }
  .cover h1 { color: #fff; margin: 0 0 8px; font-size: 28px; }
  .cover p { color: #c7d0e2; margin: 0; font-size: 12.5px; }
</style></head><body>
<div class="cover">
  <div class="eyebrow">KitchenOS · Operaciones</div>
  <h1>OPS en 5 minutos</h1>
  <p>Guía rápida del circuito diario. Para entender cómo funciona OPS sin memorizar botones.</p>
</div>
${html}
</body></html>`

writeFileSync(HTML, doc, 'utf8')
console.log('HTML generado:', HTML)

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
execFileSync(EDGE, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  `--print-to-pdf=${PDF}`, `file:///${HTML.replace(/\\/g, '/')}`,
], { stdio: 'inherit', timeout: 60000 })
console.log('PDF generado:', PDF)
