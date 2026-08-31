# Sesión — 2026-08-31 (noche, cont. 2) — Día 3 del plan consolidado (invariantes 2/2) + bonus

## Qué se cerró

Los 2 ítems de hoy en `.claude/docs/ingenieria/plan-consolidado.md` §2 (día 3
completo + el "si sobra"). 2 commits (`2b13107`, `78a39e7`), pusheados.

- **La comanda ya no queda colgada en `en_prep` con dos tablets bumpeando a
  la vez.** Trigger `trg_comanda_items_bump_actualiza_comanda` decide "todos
  los ítems bumpeados ⇒ comanda lista" en Postgres (contra el estado real,
  con `SELECT ... FOR UPDATE` que serializa transacciones concurrentes) en
  vez de en la copia local (SWR) del cliente. `useComandas.ts` se simplificó:
  ya no recalcula ni escribe `comandas.estado` tras un bump online; el
  camino offline-optimista sigue igual (no hay nada que el trigger pueda ver
  hasta reconectar).
- **Chequeo de huérfanos de refs polimórficas.** `scripts/chequear-huerfanos-refs.mjs`
  corre un `LEFT JOIN ... IS NULL` contra prod por cada una de las 3 refs sin
  FK (`menu_preparaciones.ref_id`, `calendario_nota_items.tarea_id`,
  `proveedor_incidencias.pedido_id`). Corrida: 0 huérfanos hoy.
- Verificado con una simulación de dos bumps concurrentes en una transacción
  con rollback contra prod + 4 tests nuevos de `useComandas` (primer archivo
  de test para ese hook). `get_advisors` sin hallazgos nuevos. Build +
  typecheck + 210 tests OK.
- Docs actualizados: gotcha #28 en `hooks.md` (el patrón general: invariante
  agregado recalculado en cache local → trigger de DB), fila nueva en
  `testing.md`.

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).

## Probar primero mañana

- En producción: bump normal de ítems en KDS (un solo dispositivo) — debe
  verse exactamente igual que antes. Si hay chance, dos pestañas/tablets
  bumpeando ítems distintos de la misma comanda casi a la vez: la comanda
  tiene que pasar a "lista" sola (realtime ya refresca ambas pantallas).

## Próximo paso concreto

**Día 4 del plan consolidado** (`plan-consolidado.md` §2): Ratchets de
ingeniería. Crear `lib/ingenieria/ratchets.test.ts` (corre con `npm test` →
ya queda en CI): techos de líneas por pantalla grande que solo bajan +
patrones prohibidos por grep — gotcha #20 (`createClient()` sin `useMemo` en
`useFacturas.ts`, `usePase.ts`, `useReportes.ts`, 1 línea de fix c/u),
gotcha #18 (canal realtime sin `filter` por tenant en
`useCarta.ts:579-588`), `createAdminClient` sin `requireRestauranteId` en
`app/api/**`, `'use client'` en `lib/<dominio>/` fuera de hooks. Arreglar lo
marcado en la misma sesión. 3-4 h.
