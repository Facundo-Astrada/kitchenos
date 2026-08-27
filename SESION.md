# Sesión — 2026-08-26 (Duplicados en OPS Producción)

## Qué se cerró

Bug reportado por Facundo, no venía del backlog: "algunos ítems que marco en MISE me salen dobles en producción" y "lo que queda de un turno se duplica con lo que marca el que ingresa". Medido antes de tocar nada: **74 filas de más en Bros** entre el 20 y el 27/08, sobre 60 preparaciones. El 26/08 el board dibujaba 99 filas donde había 66 trabajos.

- **Causa**: cuatro caminos que no se veían entre sí (tilde del mise, cierre → `pase_turno`, activación de menú por fecha sin `checklist_item_id`, QuickAdd). El guard viejo comparaba además categoría y estado, así que con dos turnos por día el pase caía en la MISMA fecha que la producción de la mañana y quedaba al lado.
- **Fix** (`5936573` + `e7fbc0e`): `lib/ops/dedupeTareas.ts` define la identidad de una tarea — `turno_fecha + columna del board + menu_id + título normalizado` —, dejando fuera a propósito la categoría y el `checklist_item_id`. Al leer, el board colapsa gemelas y las acciones mueven a todo el grupo. Al escribir, la regla vive en `useTareas.agregarTarea` (único lugar; cubre Mise, board, Pase, Control de Carta, Calendario) con candado de módulo `Map<clave, Promise>`.
- **De paso**: un evento despachado desde el mise caía en la banda MENÚ y no EVENTO (`menus.tipo` agregado al select de `useChecklist`); la sugerencia de producción insertaba el lote sin mirar qué ya estaba cargado.
- **Base limpia**: 76 filas borradas, respaldadas en `tareas_duplicados_backup_20260826`. Bros hoy: 0 duplicados, 144 ítems de mise sin duplicar.
- Verificado replayeando los 99 despachos reales de Bros del 26/08 en orden: 66 creadas, 33 frenadas, cero claves repetidas. 196 tests, build y lint OK (mismo conteo de errores por archivo tocado).

## Qué quedó a medias

Nada a medias, pero **una rendija abierta a propósito**: dos dispositivos despachando el mismo ítem en el mismo segundo todavía crean una fila gemela. No se ve (el board fusiona) pero queda en la base. El plan completo para cerrarla —restricción en Postgres, con los 4 inserts en lote a endurecer primero— está en `PENDIENTES.md` → "Mise / pase de turno — flecos". **Hacerlo fuera de servicio**: toma un lock exclusivo sobre `tareas`.

## Probar primero mañana

1. **La apertura real en Bros.** Es la única prueba que falta: la lógica está verificada contra datos reales, pero no con el dedo en la tablet. Mirar que cada preparación aparezca una sola vez en Producción y que tildar desde ahí siga volviendo al mise.
2. Hacer un cierre en Modo Control y confirmar que lo que se deja al turno siguiente **no** se duplica con lo que marca el que entra — era el caso que originó el reporte.
3. Confirmar que el crédito de Anthropic sigue siendo el 🔴 bloqueante (no tocado hoy).

## Próximo paso concreto

Si la apertura sale limpia, el tema está cerrado. Volver al 🔴 (crédito de Anthropic) o a `PLAN-4-CAPAS.md` B9 (reservas), que sigue siendo lo de mayor retorno del backlog. La restricción en Postgres es 🟢: no urgente, y conviene agendarla fuera de servicio.

**Ojo con `PENDIENTES.md`**: está en 34 KB, muy por encima del umbral de ~10 KB. Merece una poda propia — hay bloques de agosto que ya se cerraron y siguen ahí en detalle.
