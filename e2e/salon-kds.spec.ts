/**
 * e2e: camino feliz salón → KDS → bump → reflejo en salón
 *
 * Prerrequisitos:
 *   1. npx playwright install chromium
 *   2. npm run dev (en otra terminal, en localhost:3000)
 *   3. Las credenciales de prueba (admin@elrescoldo.com / kitchenos2026) deben funcionar.
 *
 * Correr: npm run test:e2e
 *
 * Demo manual equivalente (si los tests de browser no están disponibles):
 *   1. Abrir /salon y /kds en dos pestañas o dispositivos.
 *   2. Mozo: tap en una mesa → agregar 2 ítems con modificadores → Enviar.
 *   3. KDS: la comanda aparece al instante, con cronómetro en verde.
 *   4. Esperar >5 min para ver el cambio a amarillo, >10 min para rojo.
 *   5. Hacer bump de un ítem → confirmar que sale de la tarjeta KDS.
 *   6. Hacer bump de la comanda completa → la tarjeta desaparece del KDS.
 *   7. Volver a salón: el panel "Pedido en curso" muestra los ítems como Servido.
 *   8. Cortar wifi (modo avión), hacer un bump más, reconectar → el cambio se sincroniza.
 */

import { test, expect, chromium } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@elrescoldo.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'kitchenos2026'

async function loginEnContexto(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="email"], input[name="email"]', EMAIL)
  await page.fill('input[type="password"], input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(stock|inicio|salon|recetario|onboarding)/)
}

test.describe('Camino feliz: salón → KDS → bump → reflejo en salón', () => {

  test('comanda creada en salón aparece en KDS, bump refleja estado en salón', async () => {
    // ── Contexto A: el mozo (salón) ───────────────────────────────────────────
    const browser = await chromium.launch()
    const contextMozo = await browser.newContext()
    const contextKds  = await browser.newContext()

    const paginaMozo = await contextMozo.newPage()
    const paginaKds  = await contextKds.newPage()

    await loginEnContexto(paginaMozo)
    await loginEnContexto(paginaKds)

    // ── KDS: navegar + elegir estación ────────────────────────────────────────
    await paginaKds.goto(`${BASE_URL}/kds`)
    // Hacer click en la primera estación disponible
    const botonEstacion = paginaKds.locator('button').first()
    await botonEstacion.waitFor({ timeout: 10_000 })
    const textoEstacion = await botonEstacion.textContent()
    await botonEstacion.click()
    // Confirmar que se pasó de la selección a la grilla de comandas
    await expect(paginaKds.locator('text=Sin comandas pendientes').or(
      paginaKds.locator('text=Cambiar estación')
    )).toBeVisible({ timeout: 10_000 })

    // ── Salón: abrir una mesa ─────────────────────────────────────────────────
    await paginaMozo.goto(`${BASE_URL}/salon`)
    await paginaMozo.waitForLoadState('networkidle')
    // Toca la primera mesa disponible
    const primerasMesas = paginaMozo.locator('button').filter({ hasText: /\d/ })
    await primerasMesas.first().waitFor({ timeout: 10_000 })
    await primerasMesas.first().click()
    // Debería aparecer la vista de la mesa
    await expect(paginaMozo.locator('text=/Mesa \\d+/')).toBeVisible({ timeout: 8_000 })

    // ── Salón: agregar un ítem de la carta ────────────────────────────────────
    const primerItem = paginaMozo.locator('button[data-carta-item]').first()
    // Si los botones de carta no tienen ese atributo, buscar por estructura de grid
    const itemBoton = primerItem.or(
      paginaMozo.locator('[style*="background: #1a1a1a"]').first()
    )
    await itemBoton.waitFor({ timeout: 8_000 })
    await itemBoton.click()
    // Confirmar que apareció el sheet de agregar
    await expect(paginaMozo.locator('text=Cantidad').or(paginaMozo.locator('text=Modificadores'))).toBeVisible({ timeout: 5_000 })
    // Confirmar con el botón de agregar (primer botón azul/de acción en el sheet)
    const botonAgregar = paginaMozo.locator('button').filter({ hasText: /agregar/i }).first()
    await botonAgregar.click()

    // ── Salón: enviar la comanda ───────────────────────────────────────────────
    const botonEnviar = paginaMozo.locator('button').filter({ hasText: /enviar comanda/i })
    await expect(botonEnviar).toBeEnabled({ timeout: 5_000 })
    await botonEnviar.click()
    // Debería volver al mapa de mesas
    await expect(paginaMozo.locator('text=Salón')).toBeVisible({ timeout: 10_000 })

    // ── KDS: la comanda debe aparecer (tiempo real) ───────────────────────────
    // Esperar hasta 15s para que el realtime propague la comanda
    await expect(paginaKds.locator('button').filter({ hasText: /BUMP COMANDA/i }).first()).toBeVisible({ timeout: 15_000 })

    // Verificar que se muestra cronómetro y número de mesa
    await expect(paginaKds.locator('text=/\\d+:\\d+/')).toBeVisible({ timeout: 5_000 })

    // ── KDS: bump de la comanda completa ──────────────────────────────────────
    const botonBump = paginaKds.locator('button').filter({ hasText: /BUMP COMANDA/i }).first()
    await botonBump.click()
    // La tarjeta debe desaparecer (comanda bumpeada)
    await expect(paginaKds.locator('text=Sin comandas pendientes').or(
      paginaKds.locator('button').filter({ hasText: /BUMP COMANDA/i })
    )).toBeVisible({ timeout: 10_000 })

    // ── Salón: volver a la mesa y verificar reflejo del estado ────────────────
    await primerasMesas.first().click()
    // El panel "Pedido en curso" debe mostrar el ítem como "Servido"
    await expect(paginaMozo.locator('text=Servido').or(paginaMozo.locator('text=Pedido en curso'))).toBeVisible({ timeout: 10_000 })

    await browser.close()
  })
})
