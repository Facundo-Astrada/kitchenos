# Sesión — 2026-08-31 (noche, cont. 4) — Día 5 del plan consolidado: puerto de IA

## Qué se cerró

Día 5 completo de `.claude/docs/ingenieria/plan-consolidado.md` §2.

- **`lib/ia/claude.ts` nuevo** (`pedirAClaude`): punto único de llamada a
  `api.anthropic.com/v1/messages`. Usa `clasificarErrorIA` (ya existía en
  `lib/ia/errores.ts`) para clasificar la falla, **reintenta automáticamente**
  lo que la clasificación marca `reintentable` (saturado — 429/529/5xx, antes
  el campo existía y nadie lo consumía), y **loguea tokens de entrada/salida**
  en una línea por llamada (antes no había ningún registro de consumo). Test
  nuevo `lib/ia/claude.test.ts` (6 casos: sin key, éxito, error no
  reintentable, reintento exitoso, reintentos agotados, falla de red) —
  mockea `fetch`, corre con `npm test`.
- **12 rutas migradas**, mecánico: `facturas`, `listas-precios`,
  `carta/import`, `recetas/import`, `importador/fichas-tecnicas`,
  `importador/mapeo`, `importador/facturas-universal` (ya usaban
  `clasificarErrorIA` pero reimplementaban el fetch — ahora todas pasan por
  `pedirAClaude`) + `stock/import-planilla`, `importador/productos-desde-facturas`,
  `produccion/sugerencia/explicar`, `ventas/import` (no usaban `errores.ts`
  todavía, ahora sí). Cada migración preservó el comportamiento exacto de
  fallback de su ruta (demo data en `ventas/import`, degradar a "confianza
  baja" en `mapeo`, `[]` silencioso en `fichas-tecnicas`/`import-planilla`).
- **Coach (`/api/coach`) — decisión de alcance, documentada en el docstring
  de `claude.ts`**: no se migró a `pedirAClaude`. Es streaming SSE con loop
  agéntico de tool-use multi-ronda — forzarlo a la firma no-streaming del
  puerto arriesgaba ese flujo para un beneficio marginal. En cambio se le
  subieron sus 3 puntos de error (falta de key, primera llamada, error
  intra-stream) a `clasificarErrorIA`/`errorSinApiKey`/`respuestaErrorIA`,
  mismo estándar de mensaje que el resto de la app, sin tocar el streaming.
- `anthropic-beta: pdfs-2024-09-25` (header especial de
  `importador/fichas-tecnicas`) se preservó vía el parámetro `headers` de
  `pedirAClaude`.
- `PENDIENTES.md`: podado el ítem de Día 5 (resuelto).
- Typecheck, 225 tests (219 + 6 nuevos), build y ratchets — los 4 en verde.
  Lint: mismos 8 problemas pre-existentes de siempre (verificado con
  `git stash`, no los introdujo esta sesión).

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).
- El git worktree viejo en `.claude/worktrees/sleepy-jepsen` (rama
  `claude/sleepy-jepsen`) sigue sin revisar con Facundo (hallazgo de ayer).

## Probar primero mañana

- Nada específico de UI — el puerto de IA es invisible en uso normal
  (mismos prompts, mismos modelos, misma forma de respuesta). Si se quiere
  verificar el reintento: no hay forma fácil de forzar un 529 real desde la
  app; confiar en el test de `claude.ts` que lo cubre con `fetch` mockeado.

## Próximo paso concreto

**Día 6 del plan consolidado** (`plan-consolidado.md` §2): Carta — pasos 0+1.
Smoke e2e `carta-smoke.spec.ts` + borrar las ~300 líneas muertas (rama
`view='nuevo'`, `isCreate` de `FormView`, `CAT_ICONS`). Línea base de métricas
en el commit. ½ + ½ día.
