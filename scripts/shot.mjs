// Driver de screenshots reutilizable — reemplaza los ~20 scripts one-off
// que reescribían login + navegar + esperar + capturar desde cero.
// Uso: node scripts/shot.mjs --ruta /stock --viewport mobile --cuenta demo --out docs/shots/stock.png
// En Git Bash, anteponer MSYS_NO_PATHCONV=1 (si no, "/stock" se traduce a un path de Windows).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const BASE = 'https://kos-app-one.vercel.app'

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

const CUENTAS = {
  demo: { email: 'admin@elrescoldo.com', pass: 'kitchenos2026' },
  bros: { email: 'franco@broscomedor.com', pass: process.env.BROS_PASSWORD },
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
  await page.screenshot({ path: file, fullPage })
  console.log('->', file)
} finally {
  await browser.close()
}
