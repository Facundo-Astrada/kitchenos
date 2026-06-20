import { chromium } from '@playwright/test'
import fs from 'fs'

const BASE = 'http://localhost:3001'
const OUT = 'C:/tmp/kos-verify'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false })
  console.log(`[shot] ${name}`)
}

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.fill('input[type="email"]', 'admin@elrescoldo.com')
  await page.fill('input[type="password"]', 'kitchenos2026')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
}

// ── DESKTOP ──────────────────────────────────────────────
const dCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const dp = await dCtx.newPage()
await login(dp)
await shot(dp, '01-dashboard-desktop.png')

const sidebar = dp.locator('aside')
const st = await sidebar.textContent()
console.log('[1] sidebar visible:', await sidebar.isVisible())
console.log('[2] logo KitchenOS:', st.includes('KitchenOS'))
console.log('[3] Operaciones:', st.includes('Operaciones'))
console.log('[4] Insumos:', st.includes('Insumos'))
console.log('[5] Gestión:', st.includes('Gesti'))
console.log('[6] Importar datos:', st.includes('Importar datos'))

// mobile BottomNav must NOT be visible — check by its "Más" button with grid_view icon
const masBtn = dp.locator('button:has-text("Más")')
console.log('[7] mobile BottomNav hidden (no Más btn):', !(await masBtn.isVisible().catch(() => false)))

// Navigate Recetario
await dp.locator('aside a[href="/recetario"]').click()
await dp.waitForURL('**/recetario', { timeout: 15000 })
await shot(dp, '02-recetario-desktop.png')
console.log('[8] nav recetario:', dp.url().includes('recetario'))

// Navigate Stock via direct goto (may be slow server component)
await dp.goto(`${BASE}/stock`)
await dp.waitForLoadState('networkidle', { timeout: 30000 })
await shot(dp, '03-stock-desktop.png')
console.log('[9] nav stock:', dp.url().includes('stock'))

// Active state on stock link in sidebar
const stockLink = dp.locator('aside a[href="/stock"]')
const activeStyle = await stockLink.getAttribute('style')
const isActiveStyled = activeStyle?.includes('rgba(255,255,255,0.13)')
console.log('[10] active link styled:', isActiveStyled)

await dCtx.close()

// ── MOBILE ───────────────────────────────────────────────
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mp = await mCtx.newPage()
await login(mp)
await shot(mp, '04-dashboard-mobile.png')

const mSidebar = mp.locator('aside')
console.log('[11] sidebar hidden on mobile:', !(await mSidebar.isVisible().catch(() => false)))

const mNav = mp.locator('nav').first()
console.log('[12] bottom nav visible on mobile:', await mNav.isVisible().catch(() => false))

const masOnMobile = mp.locator('button:has-text("Más")')
console.log('[13] Más btn on mobile:', await masOnMobile.isVisible().catch(() => false))

await mCtx.close()
await browser.close()
console.log('[done] screenshots:', OUT)

// Quick active-style check on fresh run
;(async () => {
  const b2 = await chromium.launch({ headless: true })
  const ctx2 = await b2.newContext({ viewport: { width: 1280, height: 800 } })
  const p2 = await ctx2.newPage()
  await p2.goto('http://localhost:3001/login')
  await p2.waitForSelector('input[type="email"]')
  await p2.fill('input[type="email"]', 'admin@elrescoldo.com')
  await p2.fill('input[type="password"]', 'kitchenos2026')
  await p2.click('button[type="submit"]')
  await p2.waitForURL('http://localhost:3001/', { timeout: 20000 })
  await p2.goto('http://localhost:3001/stock')
  await p2.waitForLoadState('networkidle')
  const link = p2.locator('aside a[href="/stock"]')
  const style = await link.getAttribute('style')
  const bg = await link.evaluate(el => window.getComputedStyle(el).backgroundColor)
  console.log('[active inline style]:', style?.slice(0, 120))
  console.log('[active computed bg]:', bg)
  await b2.close()
})()
