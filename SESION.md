# Sesión — 2026-08-31 (noche, cont. 5) — Día 6 del plan consolidado: Carta, pasos 0+1

## Qué se cerró

Día 6 completo de `.claude/docs/ingenieria/plan-consolidado.md` §2 (`refactor-kos.md` §2, pasos 0+1). 1 commit (`8cddfaa`).

- **`e2e/carta-smoke.spec.ts` nuevo**: lista → toggle 86 (overlay en la tarjeta) →
  abrir el plato → el badge 86 se refleja en detail → volver a la lista →
  Rentabilidad → las 4 tabs renderizan. Revierte el toggle siempre
  (try/finally) para no dejar El Rescoldo marcada 86. Corre en viewport
  mobile (en desktop la lista usa FlipCard, no navega directo a detail).
  Pasa 2 veces seguidas contra el dev server.
- **~200 líneas muertas borradas** de `carta/page.tsx`: rama `view==='nuevo'`
  + `handleCrear` (el botón "Nuevo" ya pasa por `ComposicionEditor`), rama
  `isCreate` de `FormView` (ahora editor puro, `initialData` obligatorio),
  `CAT_ICONS`. 3.906 → 3.703 líneas; techo del ratchet bajado a 3710.
- Typecheck, 225 tests, build y ratchets en verde. Lint: mismos ~10.000
  problemas pre-existentes (verificado con `git stash`).
- Docs actualizados: `testing.md` (2do spec de Playwright), `ESTADO-ACTUAL.md`
  (conteo de tests 219→225 que había quedado desactualizado desde el día 5),
  `PENDIENTES.md` (ítem de Carta acotado a días 7+9), `HISTORIAL.md`.

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).
- El git worktree viejo en `.claude/worktrees/sleepy-jepsen` (rama
  `claude/sleepy-jepsen`) sigue sin revisar con Facundo.

## Probar primero mañana

- Nada específico de UI — el paso 1 solo borró código inalcanzable. Si se
  quiere verificar a mano: crear un plato desde el botón "Nuevo" en
  `/carta` (pasa por `ComposicionEditor`, no por el `FormView` que quedó
  editor-only).

## Próximo paso concreto

**Día 7 del plan consolidado** (`plan-consolidado.md` §2, `refactor-kos.md`
§2 paso 2+4): moves puros — `PlatoCard`+`PlatoCardBack`+`PlatoCardSkeleton`+
`fmtMoney`+`fcBadge`+`marginBadge` → `cards.tsx`; `exportCartaPDF`+
`exportRentabilidadPDF` → `exportar.ts`; `PackagingGruposDrawer` → su
archivo; `ImportCartaModal` → su archivo; `FormView` → `EditarPlato.tsx`.
Solo compilador + build + smoke como red (son moves, no cambian
comportamiento). 2 × ½ día.
