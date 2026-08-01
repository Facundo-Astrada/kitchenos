// Convierte INSTRUCTIVO-ONBOARDING.md → HTML de diapositivas con estilo KitchenOS → PDF (Edge headless).
// Regenera docs/onboarding-guia-inicio.html y KitchenOS-Guia-de-Inicio.pdf a partir del .md fuente
// cada vez que la Guía de inicio cambie — no editar el PDF a mano, editar el .md y correr esto.
// Uso: node scripts/onboarding-to-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const SRC = resolve('INSTRUCTIVO-ONBOARDING.md')
const HTML = resolve('docs/onboarding-guia-inicio.html')
const PDF = resolve('KitchenOS-Guia-de-Inicio.pdf')

const md = readFileSync(SRC, 'utf8')
const lines = md.split(/\r?\n/)

// ── Emoji del documento → identidad visual KitchenOS (Material Symbols / dots) ──
// El .md fuente usa emoji porque es un documento de contenido, no UI de la app —
// pero el PDF final respeta la convención "solo Material Symbols, sin emoji".
const DOT = (color) => `<span class="dot" style="--dc:${color}"></span>`
const MI = (name, extra = '') => `<span class="mi ${extra}">${name}</span>`
const EMOJI_MAP = [
  ['🧑‍🍳', MI('supervisor_account')], // ZWJ sequence — antes que sus componentes sueltos
  ['🎬', ''], // marcador de diapositiva — no se imprime, solo se usa para detectar el bloque
  ['👤', MI('admin_panel_settings')],
  ['🔪', MI('soup_kitchen')],
  ['📈', MI('trending_up')],
  ['📷', MI('photo_camera')],
  ['📄', MI('description')],
  ['🎙️', MI('mic')],
  ['📑', MI('library_books')],
  ['✍️', MI('edit_note')],
  ['⚠️', MI('warning')],
  ['⭐', MI('star')],
  ['✓', MI('check_circle', 'mi-ok')],
  ['🟢', DOT('#16a34a')],
  ['🟡', DOT('#d97706')],
  ['⚪', DOT('#9aa3b2')],
  ['🟠', DOT('#e0913c')],
  ['🔵', DOT('#3b6fd4')],
  ['🟣', DOT('#7c5cd4')],
]
function replaceEmoji(s) {
  let out = s
  for (const [emoji, html] of EMOJI_MAP) out = out.split(emoji).join(html)
  return out
}

// ── Inline formatting (igual criterio que md-to-pdf-instructivo.mjs) ──────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s) {
  let out = esc(s)
  out = replaceEmoji(out)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out.trim()
}

// ── Parser de bloques markdown → HTML (reutilizable para cover/divider/slide) ──
function blockToHtml(bodyLines) {
  let html = ''
  let i = 0
  let para = []
  let inCode = false
  let codeBuf = []

  function flushParagraph(buf) {
    if (buf.length) html += `<p>${inline(buf.join(' '))}</p>\n`
    return []
  }

  while (i < bodyLines.length) {
    const line = bodyLines[i]

    if (line.trim().startsWith('```')) {
      if (!inCode) { para = flushParagraph(para); inCode = true; codeBuf = [] }
      else { html += `<pre class="wireframe"><code>${esc(codeBuf.join('\n'))}</code></pre>\n`; inCode = false }
      i++; continue
    }
    if (inCode) { codeBuf.push(line); i++; continue }

    if (/^---+\s*$/.test(line)) { para = flushParagraph(para); i++; continue }

    if (line.trim() === '') { para = flushParagraph(para); i++; continue }

    // blockquote (agrupa líneas consecutivas)
    if (/^>\s?/.test(line)) {
      para = flushParagraph(para)
      const buf = []
      while (i < bodyLines.length && /^>\s?/.test(bodyLines[i])) { buf.push(bodyLines[i].replace(/^>\s?/, '')); i++ }
      const raw = buf.join(' ')
      const warning = raw.includes('⚠️')
      html += `<div class="callout${warning ? ' callout-warn' : ''}">${warning ? '' : `<span class="mi callout-ico">format_quote</span>`}<div>${inline(raw)}</div></div>\n`
      continue
    }

    // tabla
    if (/^\|.*\|\s*$/.test(line) && i + 1 < bodyLines.length && /^\|[\s:|-]+\|\s*$/.test(bodyLines[i + 1])) {
      para = flushParagraph(para)
      const headerCells = line.split('|').slice(1, -1).map(c => c.trim())
      i += 2
      const rows = []
      while (i < bodyLines.length && /^\|.*\|\s*$/.test(bodyLines[i])) {
        rows.push(bodyLines[i].split('|').slice(1, -1).map(c => c.trim()))
        i++
      }
      html += '<table class="stable"><thead><tr>'
      html += headerCells.map(c => `<th>${inline(c)}</th>`).join('')
      html += '</tr></thead><tbody>'
      for (const r of rows) html += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'
      html += '</tbody></table>\n'
      continue
    }

    // lista (agrupa consecutivas)
    if (/^\s*-\s+/.test(line)) {
      para = flushParagraph(para)
      html += '<ul>'
      while (i < bodyLines.length && /^\s*-\s+/.test(bodyLines[i])) {
        html += `<li>${inline(bodyLines[i].replace(/^\s*-\s+/, ''))}</li>`
        i++
      }
      html += '</ul>\n'
      continue
    }

    // negrita a nivel de línea suelta (ej. "**Lo importante:**")
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      para = flushParagraph(para)
      html += `<p class="lead-line">${inline(line.trim())}</p>\n`
      i++; continue
    }

    para.push(line.trim())
    i++
  }
  flushParagraph(para)
  return html
}

// ── Parseo del documento en diapositivas ──────────────────────────────────
const FLOWS = {
  '👤': { color: '#e0913c', ink: '#b06a1f', soft: '#fbf1e2', icon: 'admin_panel_settings', short: 'Dueño / Administrador' },
  '🧑‍🍳': { color: '#2f9e6b', ink: '#1f7d51', soft: '#e7f4ee', icon: 'supervisor_account', short: 'Encargado' },
  '🔪': { color: '#3b6fd4', ink: '#2a52a0', soft: '#e8eefb', icon: 'soup_kitchen', short: 'Cocinero / Bachero' },
}
const CLOSING = { color: '#e7a049', ink: '#7a4f12', soft: '#fdf6e9' }

let title = '', subtitle = '', introLines = []
const slides = []
let flow = { color: '#e0913c', ink: '#b06a1f', soft: '#fbf1e2', icon: 'rocket_launch', name: 'Arranque', short: 'Arranque' }
let cur = null // slide actual: { kind:'divider'|'content', ...body[] }

function pushCur() {
  if (cur) slides.push(cur)
  cur = null
}

let i = 0
// Título (H1), subtítulo (H3) e intro (blockquote) — todo antes de la primera diapositiva
while (i < lines.length) {
  const l = lines[i]
  if (/^#\s+/.test(l) && !title) { title = l.replace(/^#\s+/, ''); i++; continue }
  if (/^###\s+/.test(l) && !subtitle) { subtitle = l.replace(/^###\s+/, ''); i++; continue }
  if (/^##\s+/.test(l)) break // arrancó la primera diapositiva
  if (/^#\s+/.test(l) && title) break // arrancó la primera sección (no debería pasar antes de una ##, pero por las dudas)
  introLines.push(l)
  i++
}

for (; i < lines.length; i++) {
  const l = lines[i]

  const divider = l.match(/^#\s+(.*)$/)
  if (divider) {
    pushCur()
    const raw = divider[1]
    const key = Object.keys(FLOWS).find(e => raw.includes(e))
    flow = key ? { ...FLOWS[key], name: raw } : flow
    cur = { kind: 'divider', title: raw, flow, body: [] }
    continue
  }

  const slideMatch = l.match(/^##\s+🎬\s*Diapositiva\s+(\d+)\s*—\s*(.*)$/)
  if (slideMatch) {
    pushCur()
    let t = slideMatch[2]
    let done = false, badge = null
    if (/✓\s*$/.test(t)) { done = true; t = t.replace(/✓\s*$/, '').trim() }
    const badgeMatch = t.match(/⭐\s*\(([^)]+)\)\s*$/)
    if (badgeMatch) { badge = badgeMatch[1]; t = t.replace(/⭐\s*\([^)]+\)\s*$/, '').trim() }
    const closing = /Preguntas frecuentes|Resumen final/.test(t)
    cur = { kind: 'content', num: slideMatch[1], title: t, done, badge, closing, flow, body: [] }
    continue
  }

  if (cur) cur.body.push(l)
}
pushCur()

// ── Render de cada tipo de diapositiva ─────────────────────────────────────
let slideCount = 0
function footer() {
  slideCount++
  return `<div class="sfoot"><span>KitchenOS · Guía de inicio</span><span>${slideCount}</span></div>`
}

function renderCover() {
  return `<section class="slide cover">
    <div class="cover-logo">${MI('restaurant', 'cover-logo-ico')}<span class="logo-tx">KitchenOS</span></div>
    <div class="cover-mid">
      <div class="cover-eyebrow">${esc(title)}</div>
      <h1 class="cover-title">Guía de<br>Inicio</h1>
      <div class="cover-sub">${esc(subtitle)}</div>
      <div class="cover-desc">${blockToHtml(introLines).replace(/<div class="callout">/g, '<div class="callout callout-oncover">')}</div>
    </div>
    <div class="cover-foot">
      <span class="cover-pill">${MI('rocket_launch')} 3 roles · Dueño, Encargado, Cocinero</span>
      <span class="cover-ed">El Rescoldo · Edición equipo</span>
    </div>
  </section>`
}

function renderDivider(s, n) {
  const f = s.flow
  return `<section class="slide divider" style="--dc:${f.color}">
    <div class="div-center">
      <div class="div-ghost">${n}</div>
      <div class="div-kicker">${MI(f.icon)} Flujo ${n}</div>
      <h2 class="div-title">${esc(s.title.replace(/^[^\wÁÉÍÓÚÑ]*/u, '').trim())}</h2>
      <div class="div-sub">${blockToHtml(s.body)}</div>
    </div>
  </section>`
}

// Si el cuerpo tiene un bloque de código (wireframe/resumen), se separa en 2 columnas:
// el bloque a la izquierda, el resto del contenido (listas/callouts) a la derecha.
// Evita el apilado vertical excesivo que desbordaba la diapositiva (bug real detectado).
function extractWireframe(bodyLines) {
  const idx = bodyLines.findIndex(l => l.trim().startsWith('```'))
  if (idx === -1) return null
  const endIdx = bodyLines.findIndex((l, i) => i > idx && l.trim().startsWith('```'))
  if (endIdx === -1) return null
  const fenceLines = bodyLines.slice(idx, endIdx + 1)
  const restLines = [...bodyLines.slice(0, idx), ...bodyLines.slice(endIdx + 1)]
  return { wireframeHtml: blockToHtml(fenceLines), restLines }
}

function renderContent(s) {
  const f = s.closing ? CLOSING : s.flow
  // El número de "Paso N" del título (si lo tiene) manda sobre el número de diapositiva —
  // las diapositivas 1-2 son introductorias y desalinean la numeración (Diapositiva 4 = Paso 2).
  const pasoMatch = s.title.match(/^Paso\s+(\d+):\s*(.*)$/)
  const displayTitle = pasoMatch ? pasoMatch[2] : s.title
  const numChip = pasoMatch
    ? `<span class="chip" style="--cc:${f.color};--cs:${f.soft};--ci:${f.ink}">Paso ${pasoMatch[1]}</span>`
    : (s.closing ? '' : `<span class="chip chip-flow" style="--cc:${f.color};--cs:${f.soft};--ci:${f.ink}">${esc(f.short)}</span>`)
  const doneChip = s.done ? `<span class="chip chip-done">${MI('check_circle')} Listo</span>` : ''
  const badge = s.badge ? `<span class="chip chip-star">${MI('star')} ${esc(s.badge)}</span>` : ''

  const wf = extractWireframe(s.body)
  const bodyHtml = wf
    ? `<div class="cbody-split"><div class="cbody-visual">${wf.wireframeHtml}</div><div class="cbody-text">${blockToHtml(wf.restLines)}</div></div>`
    : `<div class="cbody ${s.closing ? 'cbody-closing' : ''}">${blockToHtml(s.body)}</div>`

  return `<section class="slide content" style="--cc:${f.color};--ci:${f.ink};--cs:${f.soft}">
    <span class="content-ghost" style="color:${f.color}">${MI(f.icon)}</span>
    <div class="chead">
      ${numChip}${doneChip}${badge}
    </div>
    <h2>${esc(displayTitle)}</h2>
    ${bodyHtml}
    ${footer()}
  </section>`
}

let dividerN = 0
const body = renderCover() + slides.map(s => s.kind === 'divider' ? renderDivider(s, ++dividerN) : renderContent(s)).join('')

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>KitchenOS — Guía de Inicio</title>
<style>${FONT_FACES()}${CSS()}</style></head><body>${body}</body></html>`

writeFileSync(HTML, html, 'utf8')
console.log('HTML generado:', HTML, `(${slideCount + slides.filter(s => s.kind === 'divider').length + 1} diapositivas)`)

// ── Imprimir a PDF con Edge headless (sin dependencias npm) ────────────────
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

// ── Fuentes auto-alojadas (docs/fonts/) ─────────────────────────────────────
// Antes se cargaban desde Google Fonts vía <link>: con conexión lenta, Edge podía
// imprimir el PDF ANTES de que terminara de bajar el woff2 de Material Symbols
// (font grande, ícono al final invisible/en blanco — bug real detectado al revisar
// las capturas). Auto-alojar las hace instantáneas y determinísticas, sin red.
function FONT_FACES() {
  return `
  @font-face{
    font-family:'Material Symbols Outlined'; font-style:normal; font-weight:400;
    src:url('fonts/material-symbols-outlined.woff2') format('woff2');
  }
  @font-face{
    font-family:'Playfair Display'; font-style:normal; font-weight:800;
    src:url('fonts/playfair-display-800.ttf') format('truetype');
  }
  @font-face{
    font-family:'Playfair Display'; font-style:italic; font-weight:600;
    src:url('fonts/playfair-display-600italic.ttf') format('truetype');
  }
  `
}

// ── CSS ─────────────────────────────────────────────────────────────────────
// Layout con flexbox (nunca posicionamiento absoluto superpuesto) — el footer y las
// zonas de contenido se acomodan solos según cuánto texto haya, sin poder pisarse.
// Tipografía a escala de diapositiva 16:9 real (960×540pt), no de documento A4.
function CSS() {
  return `
  @page { size: 338.66mm 190.5mm; margin: 0; } /* 16:9, equivalente a 13.333in x 7.5in */
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root{
    --navy:#16243f; --navy2:#1c2d4a; --ink:#1f2937; --muted:#5b6677; --faint:#9aa3b2;
    --paper:#ffffff; --soft:#f4f5f8; --border:#e6e9f0;
    --serif:'Playfair Display', Georgia, 'Times New Roman', serif;
    --sans:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  }
  body{ margin:0; font-family:var(--sans); color:var(--ink); font-size:19px; line-height:1.5; }
  .mi{ font-family:'Material Symbols Outlined'; font-weight:normal; font-style:normal; vertical-align:middle;
       font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; line-height:1; }
  .mi-ok{ color:#16a34a; }
  .dot{ display:inline-block; width:13px; height:13px; border-radius:50%; background:var(--dc); vertical-align:middle; margin:0 1px; }
  h1,h2{ font-family:var(--serif); font-weight:800; letter-spacing:-.01em; margin:0; }

  .slide{ position:relative; width:338.66mm; min-height:190.5mm; padding:16mm 28mm;
          background:var(--paper); display:flex; flex-direction:column; }
  .slide + .slide{ break-before:page; }
  /* Salvavidas: si un bloque no entra, pasa a la página siguiente entero en vez de partirse feo */
  .callout, ul, table.stable, pre.wireframe, .cbody-split{ break-inside:avoid; }

  p{ margin:0 0 12px; color:#374151; }
  .lead-line{ font-weight:800; color:var(--navy2); margin:16px 0 7px; font-size:20px; }
  ul{ margin:0 0 14px; padding-left:24px; }
  li{ margin:6px 0; color:#374151; }
  strong{ color:#111827; }
  code{ background:#f1f3f7; color:var(--navy2); padding:2px 7px; border-radius:5px; font-family:'Cascadia Code',Consolas,monospace; font-size:16px; }

  /* Wireframe / mockup de pantalla (bloques de código del .md) */
  pre.wireframe{ background:#0f1c33; color:#d8e0f0; border-radius:14px; padding:20px 24px; margin:12px 0 16px;
                 font-family:'Cascadia Code',Consolas,monospace; font-size:14px; line-height:1.6;
                 box-shadow:0 16px 34px rgba(20,35,63,.22); }
  pre.wireframe code{ background:none; color:inherit; padding:0; font-size:inherit; white-space:pre; }

  /* Callouts (blockquote) */
  .callout{ display:flex; gap:14px; align-items:flex-start; background:#f4f6fb; border:1px solid #dde3f0; border-left:5px solid var(--navy2);
            border-radius:12px; padding:15px 19px; margin:12px 0 16px; font-size:17px; color:#374151; }
  .callout-ico{ color:var(--navy2); flex-shrink:0; font-size:23px; }
  .callout-oncover{ background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.18); border-left-color:#e7a049; color:#dbe3f0; }
  .callout-oncover .mi{ color:#e7a049; }
  .callout-warn{ background:#fdf6e9; border:1px solid #f1dcb4; border-left:5px solid #e0913c; color:#4a3b22; }
  .callout-warn strong{ color:#7a4f12; }
  .callout .mi{ font-size:23px; }

  /* Tabla */
  table.stable{ width:100%; border-collapse:collapse; margin:10px 0 16px; font-size:17px; }
  table.stable th{ background:var(--navy2); color:#fff; text-align:left; padding:11px 16px; font-weight:700; font-size:16px; }
  table.stable th:first-child{ border-radius:10px 0 0 0; } table.stable th:last-child{ border-radius:0 10px 0 0; }
  table.stable td{ border:1px solid var(--border); padding:11px 16px; vertical-align:top; }
  table.stable tbody tr:nth-child(even){ background:#f8f9fb; }

  /* Chips del header de contenido */
  .chead{ display:flex; gap:10px; margin-bottom:16px; flex-shrink:0; }
  .chip{ display:inline-flex; align-items:center; gap:7px; background:var(--cs); color:var(--ci); border:1px solid color-mix(in srgb,var(--cc) 35%,#fff);
         font-weight:800; font-size:15px; padding:8px 18px; border-radius:999px; }
  .chip .mi{ font-size:19px; color:var(--cc); }
  .chip-done{ background:#e7f4ee; color:#1f7d51; border-color:#bfe3d0; } .chip-done .mi{ color:#16a34a; }
  .chip-star{ background:#fdf6e9; color:#7a4f12; border-color:#f1dcb4; } .chip-star .mi{ color:#e0913c; }

  /* Diapositiva de contenido — flex column: header fijo arriba, cuerpo crece, footer al final.
     Sin overflow:hidden: si el contenido no entra, la diapositiva sigue en una página más
     (nunca se recorta en silencio — bug real que tenía la v1 de este script). */
  .content{ position:relative; }
  .content-ghost{ position:absolute; top:14mm; right:20mm; font-size:190px !important; opacity:.06; z-index:0; }
  .content h2, .chead, .cbody, .cbody-split{ position:relative; z-index:1; }
  .content h2{ font-size:48px; color:var(--navy2); line-height:1.08; margin-bottom:20px; max-width:34ch; flex-shrink:0; }
  .cbody{ max-width:220mm; }
  .cbody-closing .callout{ background:rgba(231,160,73,.12); border:1px solid rgba(231,160,73,.4); border-left:5px solid #e7a049; color:#5b4322; }
  .cbody-closing .callout .mi{ color:#e7a049; }

  /* Cuerpo a 2 columnas cuando hay un wireframe/resumen (bloque de código) */
  .cbody-split{ display:grid; grid-template-columns:1.05fr 1fr; gap:30px; align-items:start; }
  .cbody-visual{ display:flex; align-items:flex-start; justify-content:center; padding-top:4px; }
  .cbody-visual pre.wireframe{ margin:0; width:100%; }
  .cbody-text ul:last-child, .cbody-text p:last-child{ margin-bottom:0; }

  .sfoot{ margin-top:auto; padding-top:14px; border-top:1px solid var(--border); display:flex; justify-content:space-between;
          font-size:14px; color:var(--faint); flex-shrink:0; }

  /* Portada */
  .cover{ background:linear-gradient(160deg,#1a2a47,#101c33); color:#fff; padding:16mm 28mm; }
  .cover-logo{ display:flex; align-items:center; gap:11px; flex-shrink:0; }
  .cover-logo-ico{ width:40px; height:40px; border-radius:11px; background:linear-gradient(150deg,#e7a049,#d2832f); font-size:24px !important; color:#1a2a47 !important;
                   font-variation-settings:'FILL' 1 !important; display:inline-flex; align-items:center; justify-content:center; }
  .logo-tx{ font-weight:800; font-size:19px; letter-spacing:-.01em; }
  .cover-mid{ flex:1 1 auto; display:flex; flex-direction:column; justify-content:center; }
  .cover-eyebrow{ text-transform:uppercase; letter-spacing:.18em; font-size:13px; font-weight:700; color:#e7a049; margin-bottom:18px; }
  .cover-title{ font-size:82px; line-height:.98; color:#fff; font-weight:800; }
  .cover-sub{ font-family:var(--serif); font-style:italic; font-weight:600; font-size:26px; color:#e7a049; margin:20px 0 20px; }
  .cover-desc{ font-size:16px; color:#aeb9cc; max-width:70ch; line-height:1.6; }
  .cover-desc p{ color:#aeb9cc; }
  .cover-foot{ flex-shrink:0; display:flex; justify-content:space-between; align-items:center;
               border-top:1px solid rgba(255,255,255,.12); padding-top:18px; }
  .cover-pill{ display:inline-flex; align-items:center; gap:8px; border:1px solid rgba(231,160,73,.5); color:#e7a049; border-radius:999px; padding:8px 17px; font-size:13px; font-weight:700; }
  .cover-pill .mi{ font-size:18px; }
  .cover-ed{ font-size:13px; color:#8593aa; }

  /* Divisores de flujo */
  .divider{ background:linear-gradient(160deg,#1a2a47,#101c33); color:#fff; padding:0; }
  .div-center{ flex:1 1 auto; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:30mm; margin:0 auto; }
  .div-ghost{ font-family:var(--serif); font-weight:800; font-size:220px; line-height:.8; color:rgba(255,255,255,.07); margin-bottom:-50px; }
  .div-kicker{ display:flex; align-items:center; gap:9px; text-transform:uppercase; letter-spacing:.22em; font-size:15px; font-weight:700; color:var(--dc); margin-bottom:16px; }
  .div-kicker .mi{ color:var(--dc); font-size:23px; }
  .div-title{ font-size:60px; color:#fff; max-width:20ch; }
  .div-sub{ font-size:17px; color:#aeb9cc; max-width:62ch; margin-top:18px; line-height:1.6; }
  .div-sub p{ color:#aeb9cc; margin:0; }
  `
}
