# Testing — KitchenOS

## Qué hay hoy

**Vitest** — 4 archivos, todos testeando lógica pura (funciones sin IO), sin mocks de Supabase:

| Archivo | Qué cubre |
|---|---|
| `lib/ops/mise.test.ts` | Reglas del mise en place: cuándo un ítem "tiene recipiente" (nombre Y capacidad), cálculo de `targetStockMise` (con/sin recipiente, sumando `demanda_viva` del salón) y `deficitMise` |
| `lib/ops/miseBus.test.ts` | El bus de eventos que sincroniza Producción ↔ Mise en la misma pestaña (`emitMiseRegistroPatch`/`onMiseRegistroPatch`): entrega a suscriptores, desuscripción, fan-out a múltiples instancias montadas |
| `lib/ops/turnos.test.ts` | Cálculo de fecha/hora en zona horaria ART (evita el bug de `toISOString()` cruzando de día), `turnoVigente`/`turnoActivo`/`turnoAnterior`/`turnoSiguiente`, `cierreIncompleto` |
| `lib/comanda/stateMachine.test.ts` | Máquina de estados de comandas e ítems (salón/KDS): transiciones válidas, cancelación desde cualquier estado no-final, rechazo de saltos de estado |

**Playwright** — 1 spec: `e2e/salon-kds.spec.ts`, camino feliz salón → KDS → bump → reflejo en salón, con login real contra `admin@elrescoldo.com`. Requiere `npx playwright install chromium` + `npm run dev` corriendo en `localhost:3000`.

**CI** (`.github/workflows/ci.yml`, push/PR a `main`): typecheck (`tsc --noEmit`) → Vitest (`npm test`) → `npm run build`. Playwright **no** corre en CI (necesita server levantado); es manual.

## Cuándo escribir qué

- **Vitest**: para cualquier función pura nueva en `lib/` con reglas no obvias (fechas, máquinas de estado, cálculos de stock/target/déficit, lo que ya tiene bugs conocidos de "casi funciona"). Si la función no toca IO (Supabase, fetch), va acá. Seguí el patrón de los 4 archivos existentes: `describe` por función, casos con nombres que explican la regla (no "test 1").
- **Playwright**: solo para flujos cross-dispositivo/realtime que Vitest no puede probar (dos pestañas/browsers, sincronización en vivo). Es caro de mantener — no agregar specs para cosas que un test unitario ya cubre.
- **No hay tests de hooks todavía** (Testing Library con mock del cliente Supabase) — ver `PENDIENTES.md` 🟢. Si vas a agregar uno, es la primera vez que se hace: no hay patrón existente que copiar.

## Correr

```bash
npm test              # vitest run — una vez, para CI/verificación
npm run test:watch    # vitest en watch
npm run test:coverage # con cobertura
npm run test:e2e      # playwright — requiere dev server + chromium instalado
```
