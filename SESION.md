# Sesión — 2026-08-25 (Presupuesto CMV por sector, planeada y ejecutada completa)

## Qué se cerró

Módulo nuevo **`/presupuesto`** (CMV por sector) de punta a punta, deployado — desde la propuesta visual sobre datos reales de Bros hasta Coach integrado. Plan completo en `PLAN-PRESUPUESTO-CMV-2026-08.md` (los 10 pasos, todos hechos):

1. **Bug real arreglado de paso**: `.eq('status','confirmada')` en 7 lugares (`useReportes.ts` ×6, `fuga.ts` ×1) dejaba a Reportes viendo ~1 de cada 2.800 facturas de una cuenta real. Al verificar el fix apareció un segundo bug tapado por el primero: `fetchCMV` sumaba TODAS las categorías (alquiler, marketing), no solo mercadería. Los dos corregidos y deployados (`e5d19cc`).
2. Tablas `presupuesto_mes`/`presupuesto_sector` + flags `categorias_gasto.cuenta_en_cmv`/`es_mejora`, aplicadas contra la DB real. A propósito NO se tocó `presupuestos` (rompía el onConflict del tab Familias).
3. Hook `usePresupuestoCMV` — verificado con SQL que replica la lógica exacta antes de tocar UI.
4. Módulo cableado (sidebar, permisos por `ver_costos`, backfill de puestos/roles existentes).
5. Pantalla con 4 bloques (mes, sectores, ritmo semanal, desperdicio+arreglos) + tab Familias movido tal cual desde Reportes (que queda en 11 tabs, sin escrituras).
6. Seed de El Rescoldo: 12 categorías, 17 facturas reales categorizadas, `reset_demo_restaurante()` parcheada (clona categorías + presupuesto, y de paso cerró un gap real: `facturas.categoria_gasto_id` nunca se clonaba a la demo).
7. Coach integrado vía skill `coach-screen`: contexto con insights, 6 targets, tour de 6 pasos, sugerencias, prompt examples. `RUTA_A_TOUR` (mapa separado de `RUTA_A_MODULO`) también cableado — sin eso el tour nunca arranca solo.
8. Docs: `columnas.md`, `ESTADO-ACTUAL.md`, `AUDITORIA-4-CAPAS.md` (hueco #5 cerrado), `hooks.md` (gotcha nuevo de `RUTA_A_TOUR`), instructivo de carga de datos + PDF regenerado.

Todo verificado con Playwright contra el dev server real (login, datos reales de Bros y El Rescoldo, mobile+desktop) antes de cada commit, `npx tsc`/`vitest`/`npm run build` limpios en cada paso.

## Qué quedó a medias

Nada de lo tocado hoy — los 10 pasos del plan cerraron y se verificaron.

## Probar primero mañana

1. Abrir `/presupuesto` en el celu real (mobile) y confirmar que el tour automático dispara solo la primera vez.
2. Confirmar que el crédito de Anthropic sigue siendo el 🔴 bloqueante (no tocado hoy, toda la IA de la app depende de eso).

## Próximo paso concreto

Sin bug nuevo abierto. El backlog de Fase 2 de Presupuesto quedó anotado en `PENDIENTES.md` 🟢 (partir venta comida/bebida, merma con costo real, comparación mes a mes) — bajo, no urgente. Volver al 🔴 de siempre (crédito de Anthropic) o a `PLAN-4-CAPAS.md` B9 (reservas dentro del día de trabajo), que sigue siendo la alternativa de mayor retorno del backlog general.
