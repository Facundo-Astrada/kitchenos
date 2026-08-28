# Testing — KitchenOS

## Qué hay hoy

**Vitest, lógica pura** (funciones sin IO, sin mocks de Supabase):

| Archivo | Qué cubre |
|---|---|
| `lib/ops/mise.test.ts` | Reglas del mise en place: cuándo un ítem "tiene recipiente" (nombre Y capacidad), cálculo de `targetStockMise` (con/sin recipiente, sumando `demanda_viva` del salón) y `deficitMise` |
| `lib/ops/miseBus.test.ts` | El bus de eventos que sincroniza Producción ↔ Mise en la misma pestaña (`emitMiseRegistroPatch`/`onMiseRegistroPatch`): entrega a suscriptores, desuscripción, fan-out a múltiples instancias montadas |
| `lib/ops/turnos.test.ts` | Cálculo de fecha/hora en zona horaria ART (evita el bug de `toISOString()` cruzando de día), `turnoVigente`/`turnoActivo`/`turnoAnterior`/`turnoSiguiente`, `cierreIncompleto` |
| `lib/comanda/stateMachine.test.ts` | Máquina de estados de comandas e ítems (salón/KDS): transiciones válidas, cancelación desde cualquier estado no-final, rechazo de saltos de estado |
| `lib/carta/ingenieriaMenu.test.ts` | Clasificación de ingeniería de menú (Kasavana-Smith: umbral fijo de popularidad + promedio ponderado de rentabilidad): distribución sesgada de ventas, casos borde N=0/N=1, fallback sin ventas cargadas |
| `lib/ops/dedupeTareas.test.ts`, `lib/ops/menuMise.test.ts`, `lib/ops/syncMise.test.ts`, `lib/permisos/resolver.test.ts`, `lib/reportes/consumoTeorico.test.ts`, `lib/reportes/ventasPorPersona.test.ts`, `lib/utils/helpers.test.ts` | Cada uno su propio dominio — mismo criterio: función pura, sin IO |

**Vitest, hooks** (Testing Library + mock del cliente Supabase — empezado 27/08):

| Archivo | Qué cubre |
|---|---|
| `lib/hooks/useTareas.test.ts` | Fetch de la lista, `soloEscritura` no descarga nada, `agregarTarea` no duplica cuando ya hay una fila con la misma clave (`claveTarea`) e inserta cuando no la hay |
| `lib/hooks/usePermisos.test.ts` | Cascada admin → puesto → fallback por rol (`puedeVer`, `verCostos`) contra datos de Supabase mockeados |

Mock reusable en `lib/test-utils/mockSupabase.ts` — `createMockSupabaseClient()` arma un builder encadenable (`.from().select().eq()...`) que resuelve por nombre de tabla vía `setResponse(tabla, {data, error})`; no reimplementa filtros de PostgREST (eso ya lo cubren los tests de lógica pura de arriba). Si una tabla recibe una lectura Y una escritura con forma distinta en el mismo test (típico: `mutate()` revalida la lista después de un insert), setear por operación con `'tabla:metodo'` (ej. `'tareas:insert'`) — gana sobre la respuesta genérica de la tabla. Patrón de test completo: `vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))`, mockear también `useRestauranteId`/`useAuth`/`useRestauranteConfig` (lo que el hook use) para aislarlo del resto del stack, `renderHook` con un wrapper `<SWRConfig value={{provider: () => new Map()}}>` (cache nueva por test, si no las keys quedan compartidas entre tests del mismo archivo). Requiere `// @vitest-environment jsdom` al principio del archivo — el resto de los tests corre en `node` (más rápido), jsdom es solo para los que rendereizan hooks de React.

**Playwright** — 1 spec: `e2e/salon-kds.spec.ts`, camino feliz salón → KDS → bump → reflejo en salón, con login real contra `admin@elrescoldo.com`. Requiere `npx playwright install chromium` + `npm run dev` corriendo en `localhost:3000`.

**Lint de diseño** (`scripts/design-lint.mjs`, P5 de `INVESTIGACION-DISENO-2026-08.md`) — estático, sin browser, sin LLM juez: verifica reglas puntuales de `DESIGN.md` contra el código fuente (grep estructurado, no un parser de JSX real). Precisión intencionalmente angosta — se calibró contra una corrida real que mostró que un chequeo amplio (hex/box-shadow fuera de token, cualquier `height:` chico) generaba casi puro ruido sobre deuda pre-existente nunca auditada, no sobre deriva nueva. Lo que sí chequea, con esa precisión:
- `confirm()` nativo — **ERROR** (bloquea, exit 1) solo dentro de superficie de servicio (`app/(servicio)/**`, y `checklist`/`produccion`/`pase`/`operaciones` dentro de `app/(app)/`); **WARN** en el resto (gestión — Turnos, Clientes, HACCP, Carta: debate de estilo, no el mismo bug).
- `alert()` — siempre WARN (reporte de error, no confirmación de una acción; P4 decidió no tocarlo, el lint no lo contradice).
- Botones con `height:` menor al piso documentado (56px Preparación-servicio, 64px `app/(servicio)`) — WARN. Se salta si el botón ya tiene `className="hit-slop"` (la mitigación sancionada). Heurística de ventana de texto, no AST: puede pescar el `height` de un hijo decorativo en vez del propio botón — el mensaje lo dice explícito cuando pasa.
- Duraciones de animación hardcodeadas (`duration: 0.N`) en archivos que usan `motion/react` sin importar `DURATION` de `lib/ui/motion` — WARN.

**No** wireado a CI todavía. Los 5 ERROR que encontró la primera corrida (confirm() en `produccion/page.tsx` y `salon/config/page.tsx`) se resolvieron 27/08 — ya puede wirearse sin quedar rojo por deuda ajena al commit que lo dispare.

**CI** (`.github/workflows/ci.yml`, push/PR a `main`): typecheck (`tsc --noEmit`) → Vitest (`npm test`) → `npm run build`. Playwright **no** corre en CI (necesita server levantado); es manual.

## Cuándo escribir qué

- **Vitest, lógica pura**: para cualquier función pura nueva en `lib/` con reglas no obvias (fechas, máquinas de estado, cálculos de stock/target/déficit, lo que ya tiene bugs conocidos de "casi funciona"). Si la función no toca IO (Supabase, fetch), va acá. Seguí el patrón de los archivos existentes: `describe` por función, casos con nombres que explican la regla (no "test 1").
- **Vitest, hooks**: para un hook nuevo o al tocar uno de los ya cubiertos (`useTareas`, `usePermisos`) — reusar `lib/test-utils/mockSupabase.ts`, no inventar un mock nuevo por archivo. Priorizar los hooks más usados/con más lógica (dedup, cascadas de permisos), no perseguir cobertura total — un hook que solo hace `select` + `insert` sin reglas propias no aporta mucho como test.
- **Playwright**: solo para flujos cross-dispositivo/realtime que Vitest no puede probar (dos pestañas/browsers, sincronización en vivo). Es caro de mantener — no agregar specs para cosas que un test unitario ya cubre.

## Correr

```bash
npm test              # vitest run — una vez, para CI/verificación
npm run test:watch    # vitest en watch
npm run test:coverage # con cobertura
npm run test:e2e      # playwright — requiere dev server + chromium instalado
```
