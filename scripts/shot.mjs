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
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i]
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const ruta = args.ruta
const viewport = args.viewport || 'mobile'
const cuenta = args.cuenta || 'demo'
const out = args.out || `docs/shots/${(ruta || '').replace(/^\//, '').replace(/\//g, '-') || 'shot'}-${viewport}.png`

if (!ruta) {
  console.error('Uso: node scripts/shot.mjs --ruta /stock [--viewport mobile|desktop] [--cuenta bros|demo] [--out docs/shots/x.png]')
  process.exit(1)
}
if (!VIEWPORTS[viewport]) {
  console.error(`viewport inválido: "${viewport}" (usar mobile|desktop)`)
  process.exit(1)
}
const login = CUENTAS[cuenta]
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
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 60000 })
  await sleep(2500)
  await dismissTours(page)
  await waitLoaded(page)
  await sleep(1500)
  await dismissTours(page)

  const file = resolve(out)
  await page.screenshot({ path: file })
  console.log('->', file)
} finally {
  await browser.close()
}
