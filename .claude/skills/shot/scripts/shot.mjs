#!/usr/bin/env node
// Login + navegar + esperar + capturar una pantalla de KitchenOS.
// Ver .claude/skills/shot/SKILL.md para la interfaz documentada.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
}

const CUENTAS = {
  demo: { email: 'admin@elrescoldo.com', password: 'kitchenos2026' },
  bros: { email: process.env.BROS_EMAIL || '', password: process.env.BROS_PASSWORD || '' },
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1]
      i++
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const ruta = args.ruta || '/'
const viewportName = args.viewport || 'mobile'
const cuentaName = args.cuenta || 'demo'
// Extensión sobre la interfaz documentada: --base para apuntar al dev server
// local en vez de producción (ej. verificar un cambio antes de deployar).
const base = args.base || 'https://kos-app-one.vercel.app'
const out = args.out || `docs/shots/${ruta.replace(/^\//, '').replace(/\//g, '-') || 'home'}-${viewportName}.png`

const viewport = VIEWPORTS[viewportName]
if (!viewport) {
  console.error(`Viewport inválido: ${viewportName}. Usar mobile o desktop.`)
  process.exit(1)
}

const cuenta = CUENTAS[cuentaName]
if (!cuenta || !cuenta.email) {
  console.error(`Cuenta inválida o sin credenciales: ${cuentaName}.`)
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport })

try {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', cuenta.email)
  await page.fill('input[type="password"]', cuenta.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })

  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  await page.screenshot({ path: out, fullPage: false })
  console.log(`Screenshot guardado en ${out}`)
} finally {
  await browser.close()
}
