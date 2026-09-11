# Candado "una preparación, una fila" — pendiente de aprobación

**Estado: escrito y NO corrido.** Necesita aprobación de Facundo y ventana fuera
de servicio.

## Qué cierra

La última rendija de los duplicados de Producción: dos dispositivos despachando
el mismo ítem en el mismo segundo. El guard de `useTareas.agregarTarea` compara
contra la cache local, así que dos tablets no se ven entre sí y crean la fila
gemela igual. No se ve (el board fusiona por identidad), pero queda en la base y
con el tiempo distorsiona Reportes.

## Por qué NO se corrió esta noche

1. **Toma un `ACCESS EXCLUSIVE` sobre `tareas`.** Agregar una columna generada
   reescribe la tabla entera: durante ese rato nadie puede leer ni escribir
   tareas. Con el servicio andando, eso es la cocina parada.
2. **Puede fallar por duplicados ya existentes.** `CREATE UNIQUE INDEX` sobre
   datos que ya violan la restricción aborta. Hay que mirar el paso 0 primero.

## El orden, que importa

- ✅ **Ya hecho y deployado** (commit de esta noche): los inserts en lote
  toleran el 23505 (`lib/ops/insertarTareas.ts`) y los dos UPDATE que tocan la
  clave lo atrapan. Sin esto, el día que exista el índice, activar un menú de 14
  preparaciones fallaría **entero** porque una ya estaba — Postgres tumba el
  lote completo si una sola fila choca.
- ⬜ **Paso 0**: correr la consulta de duplicados y decidir qué se hace con los
  que aparezcan (ver abajo).
- ⬜ **Paso 1**: `candado_tareas.sql`, fuera de servicio.

## Paso 0 — ¿cuántos duplicados hay hoy?

**Medido el 11/09/2026: 14 grupos duplicados, 16 filas a resolver, peor caso 4
gemelas de la misma preparación.** O sea: hoy el `CREATE UNIQUE INDEX` del paso
1 **falla**. No es hipotético — hay que hacer el paso 0 sí o sí.

Correr `duplicados_actuales.sql` (solo lectura) para ver el detalle. Si devuelve filas, el índice
del paso 1 **va a fallar** hasta resolverlas. Criterio para resolverlas, que es
el mismo que ya usa el board (`mejorRepresentante` en `dedupeTareas.ts`): gana
la que tiene `checklist_item_id` (es la única por la que tildar en Producción
vuelve al mise); entre iguales, la más reciente.

No se escribió el DELETE a propósito: borrar filas de producción real es una
decisión con datos a la vista, no un script a ciegas.

## Nota sobre la normalización

`kos_normalizar_titulo()` replica `normalizarTitulo()` de `dedupeTareas.ts` con
`translate()` sobre el set de acentos del español. El JS usa NFD y saca TODA
marca diacrítica, así que para un carácter fuera de ese set (un título en
alemán, digamos) los dos podrían diferir. No se usó `unaccent()` porque no es
`IMMUTABLE` y una columna generada la rechaza.
