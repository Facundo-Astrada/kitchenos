// Captura pantallas reales de KitchenOS (prod, cuenta demo El Rescoldo) para el instructivo.
// Usa el Edge instalado vía puppeteer-core (no descarga Chromium).
// Uso: node scripts/capturar-pantallas.mjs
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'https://kos-app-one.vercel.app'
const EMAIL = 'admin@elrescoldo.com'
const PASS = 'kitchenos2026'
const OUT = resolve('docs/shots')
mkdirSync(OUT, { recursive: true })

const SCREENS = [
  { name: 'pedidos',   path: '/pedidos' },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Cierra tours/onboarding del Coach (botones "Saltar" / "Saltar todo" / "Entendido")
async function dismissTours(page) {
  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')]
      const t = btns.find(b => /^(saltar|saltar todo|entendido|cerrar|omitir)$/i.test(b.textContent.trim()))
      if (t) { t.click(); return true }
      return false
    }).catch(() => false)
    if (!clicked) break
    await sleep(500)
  }
}

// Espera a que el contenido cargue (desaparezca "Cargando")
async function waitLoaded(page, ms = 18000) {
  await page.waitForFunction(
    () => !/Cargando/i.test(document.body.innerText),
    { timeout: ms, polling: 400 },
  ).catch(() => {})
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

try {
  const page = await browser.newPage()

  // ── Login ─────────────────────────────────────────────
  console.log('Login...')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForSelector('input[type="email"]', { timeout: 30000 })
  await page.type('input[type="email"]', EMAIL, { delay: 20 })
  await page.type('input[type="password"]', PASS, { delay: 20 })
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  ])
  await sleep(4000)
  await dismissTours(page)
  console.log('URL tras login:', page.url())

  // ── Capturas ──────────────────────────────────────────
  for (const s of SCREENS) {
    try {
      console.log('Capturando', s.name, '...')
      await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle2', timeout: 60000 })
      await sleep(2500)
      await dismissTours(page)      // cerrar tour de onboarding si aparece
      await waitLoaded(page)        // esperar a que desaparezca "Cargando"
      // reintentar si la pantalla cayó en error de carga transitorio
      for (let r = 0; r < 3; r++) {
        const retry = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => /reintentar/i.test(x.textContent))
          if (b) { b.click(); return true }
          return false
        }).catch(() => false)
        if (!retry) break
        console.log('  reintentando carga...')
        await sleep(4000)
        await waitLoaded(page)
      }
      await sleep(2500)             // animaciones de entrada de la lista
      await dismissTours(page)      // por si el tour aparece tras cargar
      const file = resolve(OUT, `${s.name}.png`)
      await page.screenshot({ path: file })
      console.log('  ->', file)
    } catch (e) {
      console.log('  ERROR en', s.name, ':', e.message)
    }
  }
} finally {
  await browser.close()
}
console.log('Listo.')
