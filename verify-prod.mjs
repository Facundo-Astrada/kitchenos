import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const OUT = 'C:/tmp/kos-prod'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false })
}

// Desktop (1280x800)
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const dp = await desktop.newPage()

console.log('Navegando a prod...')
await dp.goto('https://kos-app-one.vercel.app/login', { waitUntil: 'networkidle', timeout: 30000 })
await shot(dp, '00-login-desktop.png')

await dp.fill('input[type="email"]', 'admin@elrescoldo.com')
await dp.fill('input[type="password"]', 'kitchenos2026')
await dp.click('button[type="submit"]')
await dp.waitForTimeout(5000)
await shot(dp, '01-ops-desktop.png')

// Navegar módulos clave
for (const [href, name] of [
  ['/stock', '02-stock-desktop'],
  ['/facturas', '03-facturas-desktop'],
  ['/recetario', '04-recetario-desktop'],
  ['/reportes', '05-reportes-desktop'],
  ['/haccp', '06-haccp-desktop'],
  ['/carta', '07-carta-desktop'],
]) {
  await dp.goto(`https://kos-app-one.vercel.app${href}`, { waitUntil: 'networkidle', timeout: 15000 })
  await dp.waitForTimeout(1500)
  await shot(dp, `${name}.png`)
  console.log(`✓ ${href}`)
}

// Mobile (390x844 — iPhone)
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mp = await mobile.newPage()
await mp.goto('https://kos-app-one.vercel.app/login', { waitUntil: 'networkidle', timeout: 30000 })
await mp.fill('input[type="email"]', 'admin@elrescoldo.com')
await mp.fill('input[type="password"]', 'kitchenos2026')
await mp.click('button[type="submit"]')
await mp.waitForTimeout(5000)
await shot(mp, '10-ops-mobile.png')
await mp.goto('https://kos-app-one.vercel.app/stock', { waitUntil: 'networkidle', timeout: 15000 })
await mp.waitForTimeout(1500)
await shot(mp, '11-stock-mobile.png')

await browser.close()
console.log(`\nScreenshots en ${OUT}`)
