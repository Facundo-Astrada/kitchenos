# Sesión — 2026-08-31 (noche, cont. 6) — Día 7 del plan consolidado: Carta, pasos 2+4

## Qué se cerró

Día 7 completo de `.claude/docs/ingenieria/plan-consolidado.md` §2 (`refactor-kos.md` §2, pasos 2+4). 1 commit (`8392e87`), pusheado.

- **Cinco moves puros** desde `carta/page.tsx` (3.703 líneas): `cards.tsx`
  (`PlatoCard`+`PlatoCardBack`+`PlatoCardSkeleton`+`fmtMoney`+`fcBadge`+`marginBadge`),
  `exportar.ts` (`exportCartaPDF`+`exportRentabilidadPDF`),
  `PackagingGruposDrawer.tsx`, `ImportCartaModal.tsx` (con sus tipos y
  `autoMatch`), y `EditarPlato.tsx` — renombre de `FormView` (ya editor-only
  desde el día 6). `page.tsx` bajó a 2.054 líneas: solo quedan `DetailView` +
  `RentabilidadView` + el shell de `CartaPage`.
- Techo del ratchet bajado a 2060.
- Red validada en la práctica: smoke e2e pasó 2 veces seguidas sin tocarse +
  verificación manual (script Playwright ad-hoc, descartado) de que
  `EditarPlato` e `ImportCartaModal` renderizan sin errores tras el move.
- Typecheck, 225 tests, build y lint (mismos ~10.000 problemas pre-existentes)
  en verde. Docs actualizados: `PENDIENTES.md`, `HISTORIAL.md`.

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).
- El git worktree viejo en `.claude/worktrees/sleepy-jepsen` (rama
  `claude/sleepy-jepsen`) sigue sin revisar con Facundo.

## Probar primero mañana

- Nada específico de UI — son moves puros, sin cambio de comportamiento.

## Próximo paso concreto

**Día 9 del plan consolidado** (`plan-consolidado.md` §2, `refactor-kos.md`
§2 paso 5a): la única cirugía real del plan de Carta. Migrar
`handleGuardarOPS` de `DetailView` ([carta/page.tsx:147-253](app/(app)/carta/page.tsx#L147-L253))
a los helpers de `lib/ops/mise.ts` (`sumPlatoRecetaCantidad`,
`upsertMiseChecklistItem`, `shrinkOrPruneMise` — hoy no se llama, es el bug
latente que la migración arregla gratis), copiando el flujo de
`CartaBoard.tsx` como referencia viva. Antes de tocar: `/impacto
upsertMiseChecklistItem` y `/impacto shrinkOrPruneMise` para los callers que
deben quedar idénticos. Extraer `porcionesDesdeCapacidad` a `lib/ops/mise.ts`
con test (está duplicada 2 veces dentro del mismo componente). Verificación:
matriz manual en dev contra la base (no solo la UI) — asignar OPS desde
DetailView vs. desde ComposicionEditor y comparar filas de
`checklist_items`; mover de plaza y ver que la plaza vieja se achica; Quitar
y ver el prune. 1 día entero — no empezarlo sin eso.
