import { chromium } from '@playwright/test'
import fs from 'fs'

const BASE = 'http://localhost:3001'
const OUT = 'C:/tmp/kos-fase1'
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

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const p = await ctx.newPage()
await login(p)

// Check header padding is ~20px not 46px
const navHeader = p.locator('[style*="var(--header-top)"]').first()
const headerExists = await navHeader.count() > 0
console.log('[1] --header-top var used in DOM:', headerExists)

// Check sidebar has ALL modules including missing ones
const sidebar = p.locator('aside')
const st = await sidebar.textContent()
console.log('[2] Proveedores in sidebar:', st.includes('Proveedores'))
console.log('[3] Turnos in sidebar:', st.includes('Turnos'))
console.log('[4] Producción in sidebar:', st.includes('Producción') || st.includes('Producci'))

// Navigate each key module and screenshot
const modules = [
  { name: 'operaciones', href: '/operaciones', shot: '01-operaciones.png' },
  { name: 'facturas',    href: '/facturas',    shot: '02-facturas.png' },
  { name: 'recetario',   href: '/recetario',   shot: '03-recetario.png' },
  { name: 'carta',       href: '/carta',       shot: '04-carta.png' },
  { name: 'haccp',       href: '/haccp',       shot: '05-haccp.png' },
  { name: 'reportes',    href: '/reportes',    shot: '06-reportes.png' },
  { name: 'turnos',      href: '/turnos',      shot: '07-turnos.png' },
  { name: 'ventas',      href: '/ventas',      shot: '08-ventas.png' },
  { name: 'merma',       href: '/merma',       shot: '09-merma.png' },
  { name: 'pedidos',     href: '/pedidos',     shot: '10-pedidos.png' },
  { name: 'proveedores', href: '/proveedores', shot: '11-proveedores.png' },
  { name: 'calendario',  href: '/calendario',  shot: '12-calendario.png' },
]

for (const mod of modules) {
  await p.goto(`${BASE}${mod.href}`)
  await p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await shot(p, mod.shot)
  const active = p.locator(`aside a[href="${mod.href}"]`)
  const isActive = await active.count() > 0
  console.log(`[nav] ${mod.name}: sidebar link present=${isActive}`)
}

await ctx.close()
await browser.close()
console.log('[done]', OUT)
