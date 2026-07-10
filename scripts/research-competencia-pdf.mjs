// Convierte docs/research-competencia-2026-07.md → HTML con estilo KitchenOS → PDF (Edge headless).
// Uso: node scripts/research-competencia-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SRC  = resolve('docs/research-competencia-2026-07.md')
const HTML = resolve('docs/research-competencia-2026-07.html')
const PDF  = resolve('docs/research-competencia-2026-07.pdf')

const md = readFileSync(SRC, 'utf8')

// ── Inline formatting ────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s) {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  return out
}

// ── Block parser ─────────────────────────────────────────────
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

  // blockquote
  if (/^>\s?/.test(line)) {
    para = flushParagraph(para)
    const buf = []
    while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
    html += `<blockquote>${inline(buf.join(' '))}</blockquote>\n`
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

  // unordered list
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

  // ordered list
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

  para.push(line.trim())
  i++
}
para = flushParagraph(para)

// ── HTML con estilo editorial ejecutivo ──────────────────────
const doc = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; font-size: 10.8px; line-height: 1.6; margin: 0;
  }

  /* Portada generada en CSS */
  .cover {
    background: linear-gradient(150deg, #1a2a47, #101c33);
    color: #fff;
    padding: 40px 36px 36px;
    border-radius: 12px;
    margin-bottom: 24px;
    page-break-after: avoid;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(231,160,73,.18);
    border: 1px solid rgba(231,160,73,.45);
    color: #e7a049;
    font-size: 9.5px; font-weight: 700;
    letter-spacing: .14em; text-transform: uppercase;
    padding: 5px 13px; border-radius: 999px; margin-bottom: 18px;
  }
  .cover h1 {
    color: #fff; font-size: 28px; border: none; margin: 0 0 10px;
    font-weight: 800; line-height: 1.1;
  }
  .cover-sub {
    font-size: 13px; color: #c5cfe3; margin: 0 0 22px; max-width: 60ch;
  }
  .cover-meta {
    display: flex; gap: 24px; border-top: 1px solid rgba(255,255,255,.12);
    padding-top: 18px; margin-top: 8px;
  }
  .cover-meta-item { font-size: 9.5px; color: #8ea0bb; }
  .cover-meta-item strong { display: block; color: #e0e9f4; font-size: 11px; margin-bottom: 2px; }

  /* Headings */
  h1 {
    color: #1c2d4a; font-size: 20px;
    border-bottom: 3px solid #1c2d4a; padding-bottom: 6px;
    margin: 32px 0 14px; page-break-after: avoid;
  }
  h2 {
    color: #1c2d4a; font-size: 15px; margin: 26px 0 8px;
    border-left: 4px solid #4361a0; padding-left: 10px;
    page-break-after: avoid;
  }
  h3 {
    color: #4361a0; font-size: 12.5px; margin: 18px 0 6px;
    page-break-after: avoid;
  }
  h4 { color: #374151; font-size: 11px; margin: 12px 0 4px; font-weight: 700; page-break-after: avoid; }

  p { margin: 6px 0 8px; }
  ul, ol { margin: 6px 0 10px; padding-left: 20px; }
  li { margin: 3px 0; }
  strong { color: #111827; }
  a { color: #4361a0; text-decoration: none; }
  em { color: #374151; }

  code {
    background: #f1f3f7; color: #1c2d4a;
    padding: 1px 5px; border-radius: 4px;
    font-family: "Cascadia Code", Consolas, monospace; font-size: 10px;
  }
  pre {
    background: #f6f7f9; border: 1px solid #e3e6ec; border-radius: 8px;
    padding: 12px 14px; overflow-x: auto; page-break-inside: avoid;
    margin: 10px 0;
  }
  pre code { background: none; padding: 0; color: #334155; line-height: 1.4; font-size: 9.5px; }

  blockquote {
    border-left: 4px solid #4361a0; background: #f4f6fb;
    margin: 10px 0; padding: 8px 14px;
    color: #374151; border-radius: 0 6px 6px 0; font-style: italic;
  }
  hr { border: none; border-top: 1px solid #e3e6ec; margin: 22px 0; }

  /* Tablas */
  table {
    border-collapse: collapse; width: 100%;
    margin: 10px 0 16px; font-size: 9.8px;
    page-break-inside: avoid;
  }
  th {
    background: #1c2d4a; color: #fff;
    text-align: left; padding: 7px 9px; font-weight: 700;
    font-size: 9.2px;
  }
  td {
    border: 1px solid #e3e6ec; padding: 5px 9px;
    vertical-align: top; line-height: 1.45;
  }
  tbody tr:nth-child(even) { background: #f8f9fb; }

  /* Emojis de la tabla comparativa — centrar */
  td:not(:first-child) { text-align: center; }
  /* Pero la tabla de gaps y backlog no centra */
  .no-center td { text-align: left; }
</style>
</head><body>

<div class="cover">
  <div class="cover-badge">Research de competencia · Julio 2026</div>
  <h1>K-OS vs 9 plataformas<br>de gestión gastronómica</h1>
  <div class="cover-sub">Fichas individuales · tabla comparativa · gaps detectados · backlog priorizado para escalar K-OS en el mercado LATAM.</div>
  <div class="cover-meta">
    <div class="cover-meta-item"><strong>Plataformas inspeccionadas</strong>Fudo · CajaOS · bcnsoft · Artics · Frambuesa · Ganapán · Iristrace · Cuiner · Yurest</div>
    <div class="cover-meta-item"><strong>Fecha</strong>5 de julio de 2026</div>
    <div class="cover-meta-item"><strong>Método</strong>Inspección directa de sitios oficiales (~27 páginas)</div>
  </div>
</div>

${html}
</body></html>`

writeFileSync(HTML, doc, 'utf8')
console.log('✓ HTML generado:', HTML)

// ── Imprimir a PDF con Edge headless ─────────────────────────
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
execFileSync(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  `--print-to-pdf=${PDF}`,
  `file:///${HTML.replace(/\\/g, '/')}`,
], { stdio: 'inherit', timeout: 60_000 })
console.log('✓ PDF generado:', PDF)
