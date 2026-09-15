# Sesión — 15/09/2026

## Qué se cerró
- **Organigrama en mobile**: la fila de 5 tabs (Plantel/Puestos/Estructura/
  Cobertura/Polivalencia) no entraba en pantallas angostas — `Cobertura` y
  `Polivalencia` quedaban cortadas contra el borde, sin forma de llegar a
  ellas. Reportado por Facundo con captura. Causa: `SegmentedTabs` (tabs
  canónicos, compartido por media docena de pantallas) no tenía scroll
  horizontal propio — el overflow se perdía contra el borde en vez de poder
  deslizarse, a diferencia de `FilterChips` que ya resolvía este mismo
  problema. Fix: `overflowX:auto` + `.hide-scrollbar` en el wrapper,
  `whiteSpace:nowrap` en cada tab para que no se parta a la mitad. No cambia
  el look cuando los tabs entran (2-4, el caso de casi todas las pantallas).
  Commit `ab507ae`. Deploy a prod vía `git push` (build local limpio antes).
- Doc actualizado: `ui.md` (nota en la entrada de `SegmentedTabs`).

## Qué quedó a medias
Nada.

## Probar primero mañana
- Organigrama en el celular real: swipe en la fila de tabs hasta Cobertura y
  Polivalencia.

## Próximo paso concreto
Sin tema abierto — retomar de `PENDIENTES.md` según prioridad (sección 🟠
Alto).
