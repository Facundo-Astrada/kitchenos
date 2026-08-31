/**
 * e2e smoke: Carta — lista, toggle 86, detail, Rentabilidad
 *
 * Paso 0 del plan de refactor de `app/(app)/carta/page.tsx`
 * (.claude/docs/ingenieria/plan-consolidado.md, día 6 · refactor-kos.md §2):
 * la red mínima antes de mover código. No cubre cada rama — cubre el camino
 * feliz, para detectar "la pantalla no carga" o "el toggle/las tabs dejaron
 * de andar" durante los pasos 2, 4 y 5 (moves + la cirugía de DetailView).
 *
 * Prerrequisitos:
 *   1. npx playwright install chromium
 *   2. npm run dev (en otra terminal, en localhost:3000)
 *   3. Las credenciales de prueba (admin@elrescoldo.com / kitchenos2026) deben funcionar.
 *
 * Correr: npm run test:e2e -- carta-smoke
 *
 * Nota: usa la cuenta demo El Rescoldo (marketing, seedeada en todos los
 * módulos) — el toggle de disponible se revierte siempre (try/finally) para
 * no dejarla marcada 86 si el test falla a mitad de camino.
 */

import { test, expect, chromium } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@elrescoldo.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'kitchenos2026'

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="email"], input[name="email"]', EMAIL)
  await page.fill('input[type="password"], input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  // El login redirige a "/" (Inicio) — esperar cualquier salida de /login en
  // vez de una lista de rutas destino evita depender de a dónde redirige hoy.
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}

test.describe('Camino feliz: Carta — lista, toggle 86, detail, Rentabilidad', () => {

  test('la lista renderiza, el toggle 86 se refleja en detail, las 4 tabs de Rentabilidad andan', async () => {
    test.setTimeout(60_000)
    // Viewport mobile: en desktop (>=1024px) la lista usa FlipCard (tap para
    // dar vuelta) en vez de navegar directo a detail — mobile es el camino
    // más corto al mismo destino y el que este smoke necesita recorrer.
    const browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()

    await login(page)

    // ── Lista: renderiza con al menos un plato ──────────────────────────────
    await page.goto(`${BASE_URL}/carta`)
    const lista = page.locator('[data-coach-target="carta-lista"]')
    await expect(lista).toBeVisible({ timeout: 10_000 })
    const primeraTarjeta = lista.locator('> div').first()
    await primeraTarjeta.waitFor({ timeout: 10_000 })

    // Cada tarjeta tiene dos <button>: el área clickeable (nombre/descripción,
    // navega a detail) y el toggle de disponible (el último, con stopPropagation).
    const botonAbrir = primeraTarjeta.locator('button').first()
    const botonToggle = primeraTarjeta.locator('button').last()
    const estadoInicial = (await botonToggle.textContent())?.trim() ?? ''
    expect(['Disponible', 'No disponible']).toContain(estadoInicial)

    try {
      // ── Toggle 86 desde la lista: overlay "86" en la tarjeta ──────────────
      await botonToggle.click({ timeout: 10_000 })
      await expect(primeraTarjeta.getByText('86', { exact: true })).toBeVisible({ timeout: 5_000 })

      // ── Abrir el plato: el detail refleja el mismo estado (badge "86") ────
      await botonAbrir.click({ timeout: 10_000 })
      await expect(page.getByText('86', { exact: true })).toBeVisible({ timeout: 5_000 })

      // ── Volver a la lista ──────────────────────────────────────────────────
      await page.locator('button').filter({ hasText: 'arrow_back' }).first().click({ timeout: 10_000 })
      await expect(lista).toBeVisible({ timeout: 10_000 })
    } finally {
      // ── Toggle de vuelta: no dejar la cuenta demo marcada 86 ──────────────
      const estadoActual = (await botonToggle.textContent())?.trim() ?? ''
      if (estadoActual !== estadoInicial) await botonToggle.click({ timeout: 10_000 })
    }
    await expect(botonToggle).toHaveText(estadoInicial)

    // ── Rentabilidad: las 4 tabs renderizan ───────────────────────────────────
    await page.locator('[data-coach-target="carta-rentabilidad"]').click({ timeout: 10_000 })
    await expect(page.locator('text=Rentabilidad')).toBeVisible({ timeout: 10_000 })
    for (const label of [/^Lista$/, /^Ingeniería$/, /^Reprecio$/, /^Salud/]) {
      const tab = page.locator('button').filter({ hasText: label })
      await expect(tab).toBeVisible({ timeout: 10_000 })
      await tab.click({ timeout: 10_000 })
      // Ninguna tab tira la pantalla abajo: el header sigue visible.
      await expect(page.locator('text=Rentabilidad')).toBeVisible({ timeout: 10_000 })
    }

    await browser.close()
  })
})
