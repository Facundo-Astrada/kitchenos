# Testing — KitchenOS

## Qué hay hoy

**Vitest** — 5 archivos, todos testeando lógica pura (funciones sin IO), sin mocks de Supabase:

| Archivo | Qué cubre |
|---|---|
| `lib/ops/mise.test.ts` | Reglas del mise en place: cuándo un ítem "tiene recipiente" (nombre Y capacidad), cálculo de `targetStockMise` (con/sin recipiente, sumando `demanda_viva` del salón) y `deficitMise` |
| `lib/ops/miseBus.test.ts` | El bus de eventos que sincroniza Producción ↔ Mise en la misma pestaña (`emitMiseRegistroPatch`/`onMiseRegistroPatch`): entrega a suscriptores, desuscripción, fan-out a múltiples instancias montadas |
| `lib/ops/turnos.test.ts` | Cálculo de fecha/hora en zona horaria ART (evita el bug de `toISOString()` cruzando de día), `turnoVigente`/`turnoActivo`/`turnoAnterior`/`turnoSiguiente`, `cierreIncompleto` |
| `lib/comanda/stateMachine.test.ts` | Máquina de estados de comandas e ítems (salón/KDS): transiciones válidas, cancelación desde cualquier estado no-final, rechazo de saltos de estado |
| `lib/carta/ingenieriaMenu.test.ts` | Clasificación de ingeniería de menú (Kasavana-Smith: umbral fijo de popularidad + promedio ponderado de rentabilidad): distribución sesgada de ventas, casos borde N=0/N=1, fallback sin ventas cargadas |

**Playwright** — 1 spec: `e2e/salon-kds.spec.ts`, camino feliz salón → KDS → bump → reflejo en salón, con login real contra `admin@elrescoldo.com`. Requiere `npx playwright install chromium` + `npm run dev` corriendo en `localhost:3000`.

**Lint de diseño** (`scripts/design-lint.mjs`, P5 de `INVESTIGACION-DISENO-2026-08.md`) — estático, sin browser, sin LLM juez: verifica reglas puntuales de `DESIGN.md` contra el código fuente (grep estructurado, no un parser de JSX real). Precisión intencionalmente angosta — se calibró contra una corrida real que mostró que un chequeo amplio (hex/box-shadow fuera de token, cualquier `height:` chico) generaba casi puro ruido sobre deuda pre-existente nunca auditada, no sobre deriva nueva. Lo que sí chequea, con esa precisión:
- `confirm()` nativo — **ERROR** (bloquea, exit 1) solo dentro de superficie de servicio (`app/(servicio)/**`, y `checklist`/`produccion`/`pase`/`operaciones` dentro de `app/(app)/`); **WARN** en el resto (gestión — Turnos, Clientes, HACCP, Carta: debate de estilo, no el mismo bug).
- `alert()` — siempre WARN (reporte de error, no confirmación de una acción; P4 decidió no tocarlo, el lint no lo contradice).
- Botones con `height:` menor al piso documentado (56px Preparación-servicio, 64px `app/(servicio)`) — WARN. Se salta si el botón ya tiene `className="hit-slop"` (la mitigación sancionada). Heurística de ventana de texto, no AST: puede pescar el `height` de un hijo decorativo en vez del propio botón — el mensaje lo dice explícito cuando pasa.
- Duraciones de animación hardcodeadas (`duration: 0.N`) en archivos que usan `motion/react` sin importar `DURATION` de `lib/ui/motion` — WARN.

**No** wireado a CI todavía: la primera corrida encontró 5 ERROR reales pre-existentes (confirm() en `produccion/page.tsx` y `salon/config/page.tsx`, ninguno tocado en esta sesión) — wirearlo hoy pondría el pipeline en rojo por deuda ajena al commit que lo dispare. Wirear una vez que esos 5 se resuelvan o se acepten explícitamente como baseline.

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
