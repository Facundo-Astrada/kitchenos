// Driver de screenshots reutilizable — reemplaza los ~20 scripts one-off
// que reescribían login + navegar + esperar + capturar desde cero.
// Uso: node scripts/shot.mjs --ruta /stock --viewport mobile --cuenta demo --out docs/shots/stock.png
// En Git Bash, anteponer MSYS_NO_PATHCONV=1 (si no, "/stock" se traduce a un path de Windows).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const BASE_PROD = 'https://kos-app-one.vercel.app'

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

const CUENTAS = {
  demo: { email: 'admin@elrescoldo.com', pass: 'kitchenos2026' },
  bros: { email: 'franco@broscomedor.com', pass: process.env.BROS_PASSWORD },
  // Tablet fija de cocina (ver memoria "Bros — IDs y paths críticos"). Sirve
  // para verificar lo que ve el equipo, no el dueño: sus permisos_app son un
  // subconjunto (home/operaciones/recetario/stock/pase/carta).
  broscocina: { email: 'cocina@broscomedor.com', pass: process.env.BROS_COCINA_PASSWORD },
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    // Flags booleanos (--full): el siguiente token es otro flag o no hay más.
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else args[key] = argv[++i]
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
// --base http://localhost:3000 para capturar contra el dev server — sin esto no
// hay forma de ver una pantalla que todavía no se deployó (la iteración de UI va
// contra dev, el deploy es fin de bloque; ver CLAUDE.md → Método de trabajo).
const BASE = typeof args.base === 'string' ? args.base.replace(/\/$/, '') : BASE_PROD
const ruta = args.ruta
const viewport = args.viewport || 'mobile'
const cuenta = args.cuenta || 'demo'
const out = args.out || `docs/shots/${(ruta || '').replace(/^\//, '').replace(/\//g, '-') || 'shot'}-${viewport}.png`
// --click: selectores Playwright a clickear en orden antes de capturar, separados
// por "||" (ej. abrir una plaza y después el "?" de la guía). --full: página entera.
const clicks = typeof args.click === 'string' ? args.click.split('||').map(s => s.trim()).filter(Boolean) : []
const fullPage = args.full === true
const waitMs = args.wait ? parseInt(String(args.wait), 10) || 0 : 0
const probe = typeof args.probe === "string" ? args.probe : null
const medirRed = args.net === true
// --ls "clave=valor||clave2=valor2": escribe localStorage ANTES de navegar a la
// ruta. Necesario para las preferencias que viven solo en el browser y no se
// pueden alcanzar con clicks desde una URL (ej. checklist_modo_control).
const lsPairs = typeof args.ls === 'string'
  ? args.ls.split('||').map(s => s.trim()).filter(Boolean).map(p => {
      const i = p.indexOf('=')
      return i === -1 ? [p, 'true'] : [p.slice(0, i), p.slice(i + 1)]
    })
  : []
// --sel: recorta la foto al elemento que matchee (en vez de a la pantalla),
// con --pad px de margen. Para explicar un control puntual en un manual.
const sel = typeof args.sel === 'string' ? args.sel : null
const pad = args.pad ? parseInt(String(args.pad), 10) || 0 : 0
// --scroll N: baja N píxeles la lista antes de disparar. Sirve para sacar del
// medio lo que tapa el FAB del Coach, o para llegar al fondo de una lista.
const scrollY = args.scroll ? parseInt(String(args.scroll), 10) || 0 : 0
// --clip "x,y,w,h" en píxeles CSS: recorte por coordenadas, para lo que no
// tiene un selector propio (una fila de una lista, una banda del header).
const clipArg = typeof args.clip === 'string'
  ? (() => {
      const n = args.clip.split(',').map(v => parseInt(v.trim(), 10))
      if (n.length !== 4 || n.some(v => Number.isNaN(v))) {
        console.error('--clip espera "x,y,ancho,alto" en píxeles CSS')
        process.exit(1)
      }
      return { x: n[0], y: n[1], width: n[2], height: n[3] }
    })()
  : null

if (!ruta) {
  console.error('Uso: node scripts/shot.mjs --ruta /stock [--viewport mobile|desktop] [--cuenta bros|demo] [--out docs/shots/x.png] [--click "sel1||sel2"] [--full]')
  process.exit(1)
}
if (!VIEWPORTS[viewport]) {
  console.error(`viewport inválido: "${viewport}" (usar mobile|desktop)`)
  process.exit(1)
}
// Override puntual: cualquier otra cuenta (ej. la tablet de cocina de un cliente)
// sin agregarle una entrada fija a CUENTAS ni escribir su password en el repo.
const login = (args.email && args.pass) ? { email: args.email, pass: args.pass } : CUENTAS[cuenta]
if (!login) {
  console.error(`cuenta inválida: "${cuenta}" (usar bros|demo)`)
  process.exit(1)
}
if (!login.pass) {
  console.error(`Falta la contraseña de la cuenta "${cuenta}" — setear la env var BROS_PASSWORD`)
  process.exit(1)
}

mkdirSync(dirname(resolve(out)), { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Cierra tours/onboarding del Kitchen Coach (botones "Saltar" / "Entendido" / etc)
async function dismissTours(page) {
  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const t = btns.find((b) => /^(saltar|saltar todo|entendido|cerrar|omitir)$/i.test(b.textContent.trim()))
      if (t) { t.click(); return true }
      return false
    }).catch(() => false)
    if (!clicked) break
    await sleep(500)
  }
}

async function waitLoaded(page, ms = 18000) {
  await page.waitForFunction(() => !/Cargando/i.test(document.body.innerText), { timeout: ms }).catch(() => {})
}

const vp = VIEWPORTS[viewport]
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  })
  const page = await context.newPage()

  // --net: mide lo que baja la pantalla desde Supabase (REST). Sirve para
  // comparar el peso de una vista antes y después de un cambio de queries.
  const net = new Map()
  let netOn = false
  if (medirRed) {
    page.on('response', async (res) => {
      if (!netOn) return
      const url = res.url()
      if (!url.includes('/rest/v1/')) return
      let bytes = 0
      try { bytes = (await res.body()).length } catch { return }
      const tabla = url.split('/rest/v1/')[1].split('?')[0]
      const prev = net.get(tabla) ?? { n: 0, bytes: 0 }
      net.set(tabla, { n: prev.n + 1, bytes: prev.bytes + bytes })
    })
  }

  console.log(`Login como "${cuenta}" (${login.email})...`)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.fill('input[type="email"]', login.email)
  await page.fill('input[type="password"]', login.pass)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
  ])
  await sleep(4000)
  await dismissTours(page)

  if (lsPairs.length > 0) {
    console.log(`localStorage: ${lsPairs.map(([k, v]) => `${k}=${v}`).join(', ')}`)
    await page.evaluate((pairs) => {
      for (const [k, v] of pairs) localStorage.setItem(k, v)
    }, lsPairs)
  }

  console.log(`Capturando ${ruta} (${viewport})...`)
  netOn = true   // solo cuenta lo de la pantalla, no lo del login
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 60000 })
  await sleep(2500)
  await dismissTours(page)
  await waitLoaded(page)
  await sleep(1500)
  await dismissTours(page)

  for (const sel of clicks) {
    console.log(`Click: ${sel}`)
    await page.click(sel, { timeout: 15000 })
    await sleep(1200)
  }
  // El scroll va en el contenedor que realmente scrollea (las listas de OPS
  // viven en un panel con overflow propio, no en el body).
  if (scrollY > 0) {
    console.log(`Scroll: ${scrollY}px`)
    await page.evaluate((y) => {
      const scrollable = [...document.querySelectorAll('*')].find((el) => {
        const s = getComputedStyle(el)
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 40
      })
      if (scrollable) scrollable.scrollTop = y
      else window.scrollTo(0, y)
    }, scrollY)
    await sleep(700)
  }

  // Espera extra antes de disparar la foto (animaciones, overlays que buscan
  // su target, listas que recargan al cambiar de tab).
  if (waitMs > 0) { console.log(`Esperando ${waitMs}ms...`); await sleep(waitMs) }

  // --probe: además de la foto, lista qué matchea un selector en ese momento.
  // Sirve para entender por qué un overlay/tour no encuentra su target sin
  // escribir un script aparte que repita todo el login.
  if (probe) {
    const found = await page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)].slice(0, 40).map((el) => {
        const r = el.getBoundingClientRect()
        return `${el.tagName.toLowerCase()}${el.getAttribute('data-coach-target') ? `[${el.getAttribute('data-coach-target')}]` : ''} ${Math.round(r.width)}x${Math.round(r.height)}`
      })
    }, probe)
    console.log(`Probe "${probe}": ${found.length} match(es)`)
    for (const f of found) console.log('  -', f)
  }

  if (medirRed) {
    const filas = [...net.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
    const total = filas.reduce((s, [, v]) => s + v.bytes, 0)
    const reqs = filas.reduce((s, [, v]) => s + v.n, 0)
    console.log(`\nRed Supabase: ${reqs} requests · ${(total / 1024).toFixed(0)} kB`)
    for (const [tabla, v] of filas.slice(0, 12)) {
      console.log(`  ${String(Math.round(v.bytes / 1024)).padStart(5)} kB  ${String(v.n).padStart(2)}x  ${tabla}`)
    }
    console.log('')
  }

  const file = resolve(out)
  if (clipArg) {
    console.log(`Recorte: ${clipArg.width}x${clipArg.height} en ${clipArg.x},${clipArg.y}`)
    await page.screenshot({ path: file, clip: clipArg })
  } else if (sel) {
    const box = await page.locator(sel).first().boundingBox()
    if (!box) throw new Error(`--sel "${sel}" no matcheó ningún elemento visible`)
    const vpBox = page.viewportSize()
    const clip = {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(vpBox.width, box.width + pad * 2),
      height: Math.min(vpBox.height, box.height + pad * 2),
    }
    console.log(`Recorte: ${Math.round(clip.width)}x${Math.round(clip.height)} en ${Math.round(clip.x)},${Math.round(clip.y)}`)
    await page.screenshot({ path: file, clip })
  } else {
    await page.screenshot({ path: file, fullPage })
  }
  console.log('->', file)
} finally {
  await browser.close()
}
