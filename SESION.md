# Sesión — 2026-08-31 — Investigación de ingeniería, núcleo 2/3: diseño guiado por el dominio (DDD)

## Qué se cerró

Sesión de investigación (sin código de producción). Segundo núcleo de la fuente de
ingeniería, dos docs nuevos:

- `.claude/docs/ingenieria/dominio-marco.md` (422 líneas) — el marco DDD destilado:
  bounded contexts y patrones de relación traducidos al stack, lenguaje ubicuo (el
  comentario "no confundir con" como detector), táctico por pieza (agregado = frontera
  de transacción; evento de dominio = tabla de hechos + realtime; repo DDD vs Fowler),
  y la tabla honesta de cuándo DDD es exceso.
- `.claude/docs/ingenieria/dominio-kos.md` — la auditoría: mapa de 9 contextos con
  patrón por borde, core domain destilado (la máquina turno/mise/producción + Servicio
  offline), glosario ubicuo con las rupturas ("turno" = 7 cosas, mise = 3 nombres),
  agregados con quién custodia cada invariante (verificado contra la base: 0 triggers,
  índices), links polimórficos juzgados (ref_id = costura correcta), y por dónde se
  partiría K-OS.
- Fila nueva en "Docs condicionales" de `CLAUDE.md`; 6 acciones a `PENDIENTES.md`
  (2×🟠, 2×🟡, 2×🟢).

Hallazgos no esperados: `actualizarMenu` hace delete-then-insert de las preparaciones
desde el browser — modo de falla = pérdida total, peor que `crearFactura`; el candado
de agregado de cajas (`idx_cajas_turnos_una_abierta`) existe pero su gemelo para
cuentas no; el censo real es 91 tablas, no 78; y `TAREA_PRIO_TO_MISE` es la prueba de
que Carta y OPS ya son dos contextos con traducción explícita.

## Qué quedó a medias

- Nada de esta sesión. Docs completos, commiteados.
- `.claude/settings.json` sigue modificado sin commitear (decisión de Facundo, ya en PENDIENTES).

## Probar primero mañana

- Nada que probar (no hubo código).

## Próximo paso concreto

1. **El 🔴 vigente** sigue siendo el de la sesión 1: cerrar los 3 endpoints sin auth +
   sacar `restaurante_id` del body en `useCuenta` (2-3 h, `arquitectura-kos.md` §7.1).
2. Los dos 🟠 nuevos de dominio: rpc para `actualizarMenu` y trigger de la comanda
   (`dominio-kos.md` §8.1-8.2), 2-3 h cada uno.
3. **Núcleo 3/3 (refactorización)** — sesión propia. Insumos listos: el mapa de
   contextos de `dominio-kos.md` §1 decide el orden de partición de las pantallas
   grandes (§6: las que viven adentro de un contexto se parten por vistas; las que
   montan varios contextos — OPS — se parten respetando bordes), y §2 dice dónde vale
   la hora de diseño (lib/ops, lib/comanda) y dónde no.
