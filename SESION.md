# Sesión — 2026-08-31 (tarde) — Investigación de ingeniería, núcleo 3/3: refactorización — CIERRE de la investigación

## Qué se cerró

Sesión de investigación (sin código de producción). Tercer y último núcleo, tres docs:

- `.claude/docs/ingenieria/refactor-marco.md` — Fowler filtrado a React (la distinción
  mover-vs-extraer como eje), estrangulamiento/branch-by-abstraction/parallel-run por
  tipo de artefacto, postura sobre caracterización (el compilador cubre el move; el
  test se escribe en el commit de la extracción), trofeo sobre pirámide, cuadrantes de
  deuda con regla de pago.
- `.claude/docs/ingenieria/refactor-kos.md` — la auditoría: radiografía completa de
  `carta/page.tsx` (leídas las 3.906 líneas) + **plan ejecutable de 6 pasos, cada uno
  ≤1 día y reversible** + veredictos por pantalla + métricas (ratchets + graphify).
- `.claude/docs/ingenieria/plan-consolidado.md` — las tres sesiones cruzadas:
  fusiones/cancelaciones y **los 10 días ordenados con dependencias**.
- `CLAUDE.md`: 2 filas nuevas en Docs condicionales. `PENDIENTES.md`: reordenado según
  el plan (candado de cuentas subió a 🟠; gotchas-CI fusionado en "Ratchets"; ítems de
  ingeniería apuntan al plan).

Hallazgos no esperados: la premisa de GRASP sobre Carta era falsa (los 9 componentes
YA están a nivel de módulo — es mudanza, no cirugía; máximo real 24 estados, no 59);
~300 líneas de código muerto (`view='nuevo'` inalcanzable); el panel OPS de
`DetailView` duplica inline los helpers de `lib/ops/mise.ts` sin `shrinkOrPruneMise`
(bug latente: mover de plaza deja el mise viejo) con una 3ª copia de `PLAZAS_OPS`; y
el canal realtime de `useCarta` viola el gotcha #18 (sin filter por tenant, 4 tablas).

## Qué quedó a medias

- Nada de esta sesión. La investigación de ingeniería queda CERRADA (3/3).
- `.claude/settings.json` sigue modificado sin commitear (decisión de Facundo, en PENDIENTES).

## Probar primero mañana

- Nada que probar (no hubo código).

## Próximo paso concreto

**Día 1 del plan consolidado** (`plan-consolidado.md` §2): cerrar los 3 endpoints sin
auth + sacar `restaurante_id` del body en `useCuenta.cobrarCuenta` en el mismo commit
(2-3 h, patrón en `/api/stock/sync-precio`) + decidir qué hacer con
`tareas_duplicados_backup_20260826`. Después, días 2-3: invariantes a la base (rpc de
`actualizarMenu`, candado de cuentas, trigger de comanda).
