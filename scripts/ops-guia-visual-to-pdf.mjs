// Genera la "Guía visual de OPS" → HTML → PDF (Edge headless).
// Versión gráfica de la guía rápida: diagramas, mockups de teléfono, mínimo texto.
// La captura real de Mise se embebe en base64; los otros dos tabs quedan como
// huecos marcados para reemplazar por capturas reales cuando estén disponibles.
// Correr: node scripts/ops-guia-visual-to-pdf.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const HTML = resolve('docs/ops-guia-visual.html')
const PDF = resolve('KitchenOS-OPS-Guia-Visual.pdf')

// ── Assets embebidos (self-contained: capturas + fuente de íconos) ──
function b64(path, mime) {
  if (!existsSync(path)) return null
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}
const miseShot = b64(resolve('docs/shots/mise.png'), 'image/png')
// Auto-detectadas: si algún día se agregan estas capturas, se incrustan solas.
const produccionShot = b64(resolve('docs/shots/produccion.png'), 'image/png')
const planificacionShot = b64(resolve('docs/shots/planificacion.png'), 'image/png')
const iconFont = b64(resolve('docs/fonts/material-symbols-outlined.woff2'), 'font/woff2')

// mockup de teléfono: si hay captura la muestra; si no, hueco marcado ──────────
function phone({ shot, mi, label, sub, accent }) {
  const inner = shot
    ? `<img src="${shot}" alt="${label}" class="shot"/>`
    : `<div class="shot placeholder">
         <span class="mi ph-ico">${mi}</span>
         <div class="ph-tx">Captura pendiente</div>
         <div class="ph-sub">${label}</div>
       </div>`
  return `<figure class="phone">
    <div class="phone-frame" style="--pa:${accent}">${inner}</div>
    <figcaption><span class="cap-dot" style="background:${accent}"></span>${label}<span class="cap-sub">${sub}</span></figcaption>
  </figure>`
}

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>KitchenOS — OPS Guía visual</title>
<style>
  ${iconFont ? `@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:400;src:url('${iconFont}') format('woff2');}` : ''}
  @page { size: A4; margin: 12mm 12mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; margin:0; padding:0; }
  body{ font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2937; font-size:12px; line-height:1.5; }
  .mi{ font-family:'Material Symbols Outlined'; font-weight:normal; font-style:normal; line-height:1;
       vertical-align:middle; font-variation-settings:'FILL' 0,'wght' 500,'GRAD' 0,'opsz' 24; }

  /* Cover */
  .cover{ background:linear-gradient(160deg,#1a2a47,#101c33); color:#fff; border-radius:14px; padding:26px 28px; margin-bottom:16px;
          display:flex; align-items:center; justify-content:space-between; }
  .cover .eyebrow{ text-transform:uppercase; letter-spacing:.18em; font-size:10px; font-weight:700; color:#e7a049; margin-bottom:7px; }
  .cover h1{ font-size:26px; font-weight:800; letter-spacing:-.01em; }
  .cover p{ color:#c7d0e2; font-size:12px; margin-top:6px; max-width:52ch; }
  .cover .clock{ font-size:52px; color:#e7a049; opacity:.9; }

  h2{ font-size:14px; color:#1c2d4a; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
      margin:22px 0 12px; display:flex; align-items:center; gap:8px; }
  h2 .mi{ font-size:19px; color:#4361a0; }

  /* Circuito — 3 columnas con flechas */
  .circuit{ display:flex; align-items:stretch; gap:6px; }
  .cstep{ flex:1; border:1px solid #e3e6ec; border-radius:14px; padding:16px 12px; text-align:center; background:#fff; }
  .cstep .badge{ width:46px; height:46px; border-radius:14px; margin:0 auto 9px; display:flex; align-items:center; justify-content:center; }
  .cstep .badge .mi{ font-size:26px; color:#fff; }
  .cstep h3{ font-size:13.5px; color:#1c2d4a; font-weight:800; }
  .cstep .role{ font-size:10.5px; color:#6b7280; margin-top:3px; }
  .cstep .what{ font-size:11px; color:#374151; margin-top:8px; font-weight:600; }
  .arrow{ display:flex; align-items:center; color:#c3ccdb; }
  .arrow .mi{ font-size:26px; }
  .circuit-cap{ text-align:center; font-size:11px; color:#4361a0; font-weight:700; margin-top:10px; }

  /* Timeline 4 momentos */
  .flow{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .fcard{ border:1px solid #e3e6ec; border-radius:14px; padding:13px 14px 13px 13px; background:#fbfcfe; display:flex; gap:11px; }
  .fnum{ flex-shrink:0; width:30px; height:30px; border-radius:50%; background:#1c2d4a; color:#fff; font-weight:800; font-size:14px;
         display:flex; align-items:center; justify-content:center; }
  .fcard .mi.fi{ font-size:17px; color:#4361a0; vertical-align:-2px; margin-right:4px; }
  .fcard h3{ font-size:12.5px; color:#1c2d4a; font-weight:800; margin-bottom:3px; }
  .fcard p{ font-size:11px; color:#475467; line-height:1.5; }

  /* Galería de pantallas (mockups) */
  .gallery{ display:flex; gap:14px; justify-content:center; align-items:flex-start; }
  .phone{ flex:1; max-width:33%; }
  .phone-frame{ border:3px solid #1c2d4a; border-top-width:14px; border-bottom-width:14px; border-radius:20px;
                background:#0f1c33; overflow:hidden; position:relative; box-shadow:0 8px 22px rgba(20,35,63,.18); }
  .phone-frame .shot{ display:block; width:100%; height:auto; }
  .phone-frame .placeholder{ aspect-ratio:780/1000; background:repeating-linear-gradient(135deg,#f4f6fb,#f4f6fb 10px,#eef1f7 10px,#eef1f7 20px);
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:#9aa3b2; }
  .ph-ico{ font-size:40px; color:var(--pa,#4361a0); opacity:.55; }
  .ph-tx{ font-size:12px; font-weight:800; color:#64748b; }
  .ph-sub{ font-size:10px; color:#9aa3b2; }
  figcaption{ margin-top:8px; text-align:center; font-size:11px; font-weight:800; color:#1c2d4a;
              display:flex; flex-direction:column; align-items:center; gap:2px; }
  .cap-dot{ width:8px; height:8px; border-radius:50%; display:inline-block; }
  .cap-sub{ font-size:9.5px; font-weight:600; color:#8892a3; }

  /* Estados */
  .states{ display:flex; gap:8px; flex-wrap:wrap; }
  .state{ display:flex; align-items:center; gap:7px; border:1px solid #e3e6ec; border-radius:99px; padding:6px 13px 6px 8px; background:#fff; }
  .sdot{ width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
  .sdot .mi{ font-size:11px; color:#fff; }
  .state b{ font-size:11.5px; color:#1c2d4a; }
  .state span.d{ font-size:10.5px; color:#6b7280; }

  /* Cierre — 3 cajitas */
  .closing{ display:flex; gap:10px; }
  .cbox{ flex:1; border:1px solid #e3e6ec; border-radius:12px; padding:12px 13px; }
  .cbox .mi{ font-size:20px; }
  .cbox h3{ font-size:11.5px; font-weight:800; margin:5px 0 3px; color:#1c2d4a; }
  .cbox p{ font-size:10.5px; color:#5b6472; line-height:1.45; }
  .cbox.did{ background:#edf7f0; border-color:#bfe3d0; } .cbox.did .mi,.cbox.did h3{ color:#16a34a; }
  .cbox.left{ background:#fdf6e9; border-color:#f1dcb4; } .cbox.left .mi,.cbox.left h3{ color:#d0832f; }
  .cbox.next{ background:#f3f0fb; border-color:#ddd4f4; } .cbox.next .mi,.cbox.next h3{ color:#7c5cd4; }

  .foot{ margin-top:20px; padding-top:10px; border-top:1px solid #e3e6ec; font-size:10px; color:#9aa3b2; text-align:center; }
</style></head><body>

  <div class="cover">
    <div>
      <div class="eyebrow">KitchenOS · Operaciones</div>
      <h1>OPS en un vistazo</h1>
      <p>El circuito diario de la cocina, en una hoja. Entrás, ves qué dejar listo, lo hacés durante el turno y al cerrar queda todo registrado.</p>
    </div>
    <span class="mi clock">schedule</span>
  </div>

  <h2><span class="mi">alt_route</span> El circuito · 3 pantallas, una línea de tiempo</h2>
  <div class="circuit">
    <div class="cstep">
      <div class="badge" style="background:#7c5cd4"><span class="mi">event_note</span></div>
      <h3>Planificación</h3>
      <div class="role">Encargado · antes del turno</div>
      <div class="what">Activa el menú del día → crea las tareas (algunas se arrastran del día anterior)</div>
    </div>
    <div class="arrow"><span class="mi">chevron_right</span></div>
    <div class="cstep">
      <div class="badge" style="background:#4361a0"><span class="mi">task_alt</span></div>
      <h3>Producción</h3>
      <div class="role">Todo el equipo · durante el turno</div>
      <div class="what">La lista del día. Se va tildando lo que se hace</div>
    </div>
    <div class="arrow"><span class="mi">chevron_right</span></div>
    <div class="cstep">
      <div class="badge" style="background:#16a34a"><span class="mi">playlist_add_check</span></div>
      <h3>Mise</h3>
      <div class="role">Cada cocinero · su plaza</div>
      <div class="what">Checklist de tu plaza: qué stock revisar y dejar listo, en apertura y cierre</div>
    </div>
  </div>
  <div class="circuit-cap">Planificación crea · Producción y Mise ejecutan · todo se sincroniza solo</div>

  <h2><span class="mi">bolt</span> Un día en OPS · 4 momentos</h2>
  <div class="flow">
    <div class="fcard"><div class="fnum">1</div><div>
      <h3><span class="mi fi">event_note</span>Antes de abrir</h3>
      <p>El encargado verifica que el menú del día esté cargado y con los platos correctos, y lo activa en Planificación (se puede activar para varios días). Las tareas aparecen solas en Producción.</p></div></div>
    <div class="fcard"><div class="fnum">2</div><div>
      <h3><span class="mi fi">kitchen</span>Al llegar — revisás tu plaza</h3>
      <p>Entrás al Mise, elegís tu plaza y hacés la Apertura: abrís la heladera, mirás y vas tildando lo que hay y lo que falta. El encargado revisa que esté todo en orden y delega tareas nuevas si hace falta.</p></div></div>
    <div class="fcard"><div class="fnum">3</div><div>
      <h3><span class="mi fi">trending_up</span>Durante el turno — ves lo que falta</h3>
      <p>En Producción tildás cada tarea (pendiente → en curso → listo). Arriba, el avance: "8/14 listos". También podés anotar pedidos al instante para que no se pierdan, o limpiezas que surgen en el momento.</p></div></div>
    <div class="fcard"><div class="fnum">4</div><div>
      <h3><span class="mi fi">inventory</span>Al cerrar — queda registrado</h3>
      <p>En Cierre cargás cuánto stock quedó. Se asienta lo hecho y lo pendiente, y lo no terminado pasa al turno siguiente (no siempre al día siguiente: muchos locales tienen doble turno).</p></div></div>
  </div>

  <h2><span class="mi">smartphone</span> Las 3 pantallas</h2>
  <div class="gallery">
    ${phone({ shot: planificacionShot, mi: 'event_note', label: 'Planificación', sub: 'activar menú', accent: '#7c5cd4' })}
    ${phone({ shot: produccionShot, mi: 'task_alt', label: 'Producción', sub: 'tareas del día', accent: '#4361a0' })}
    ${phone({ shot: miseShot, mi: 'playlist_add_check', label: 'Mise', sub: 'checklist de plaza', accent: '#16a34a' })}
  </div>

  <h2><span class="mi">radio_button_checked</span> Los 4 estados de una tarea</h2>
  <div class="states">
    <div class="state"><span class="sdot" style="background:#cbd5e1"></span><b>Pendiente</b><span class="d">sin empezar</span></div>
    <div class="state"><span class="sdot" style="background:#3b82f6"><span class="mi">more_horiz</span></span><b>En curso</b><span class="d">haciéndose</span></div>
    <div class="state"><span class="sdot" style="background:#22c55e"><span class="mi">check</span></span><b>Listo</b><span class="d">terminado</span></div>
    <div class="state"><span class="sdot" style="background:#f59e0b"><span class="mi">help</span></span><b>Duda</b><span class="d">consultar (mantené apretado)</span></div>
  </div>

  <h2><span class="mi">assignment_turned_in</span> Al cerrar queda registrado</h2>
  <div class="closing">
    <div class="cbox did"><span class="mi">check_circle</span><h3>Lo que se hizo</h3><p>Las tareas y el mise que se tildaron durante el turno.</p></div>
    <div class="cbox left"><span class="mi">warning</span><h3>Lo que no</h3><p>Lo sin completar se muestra como "Pendiente del turno" en Cierre.</p></div>
    <div class="cbox next"><span class="mi">event_upcoming</span><h3>Al próximo turno</h3><p>Lo no terminado pasa al turno siguiente; lo que dejes dicho va como "pase de turno".</p></div>
  </div>
</body></html>`

writeFileSync(HTML, html, 'utf8')
console.log('HTML generado:', HTML, miseShot ? '(con captura de Mise)' : '(sin captura)')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
execFileSync(EDGE, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  `--print-to-pdf=${PDF}`, `file:///${HTML.replace(/\\/g, '/')}`,
], { stdio: 'inherit', timeout: 60000 })
console.log('PDF generado:', PDF)
