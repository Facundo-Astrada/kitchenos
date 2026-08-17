# PLAN-JUEGO-CERCADO — 3 features derivadas del marco conceptual (ago 2026)

> **Ejecutar con Sonnet.** Fases independientes, no hay que hacerlas en orden salvo F1 antes que F2 si el tiempo aprieta (F1 es la de mejor relación esfuerzo/diferenciación).
> Fundamento: `FUNDAMENTO-EL-JUEGO-CERCADO.md` (no vive en este repo — resumen completo guardado en memoria de Claude Code como `project_fundamento_juego_cercado`, sección "Traducción a producto").
> Cada fase toca un módulo distinto y no se pisan entre sí. Cada una termina con `npm run build` verde y commit propio.

**Resumen de una línea del porqué:** el documento sostiene que la cocina profesional es "un juego sin acta" — hay señales de resultado (percepción, clima de equipo, devoluciones) pero ningún sistema las registra. Estas tres fases son las brechas concretas de esa tesis que hoy existen en KitchenOS, ordenadas por relación esfuerzo/diferenciación.

---

## F1 — Lectura del servicio en el cierre de turno

**Problema:** `cierres_turno` (`types/index.ts:471`, hook `lib/hooks/useCierresTurno.ts`) hoy solo guarda inventario y metadata de entrega: `restaurante_id, jornada, turno_id, plaza, cerrado_por, cerrado_at, items_total, items_completados`. No hay ningún campo sobre *cómo salió* el servicio. El documento marca esto como el mejor momento del día para capturar esa lectura (memoria fresca, atención de los dos turnos a la vez) — y que ninguna app del rubro lo modela.

**Propuesta:**
1. Agregar a `cierres_turno`: `percepcion` (enum corto: `bien | regular | complicado`, o similar — definir con el usuario el set exacto) y `notas_servicio` (texto libre opcional, "qué se rompió / cómo se resolvió"). Migración + `CierreTurno` en `types/index.ts`.
2. En el flujo de entrega de plaza (el botón que llama `entregarPlaza()` en `useCierresTurno.ts:90`), sumar ese paso de 2-3 taps antes de confirmar — no bloqueante, se puede entregar sin completarlo.
3. Mostrar la lectura declarada al lado de un dato duro cuando exista (merma del turno, devoluciones si las hubiera) — la utilidad real está en la *discrepancia* entre percepción y dato, no en el campo aislado. Candidato natural: Reportes → Auditoría, que ya deduce pases desde `cierres_turno` (ver `ESTADO-ACTUAL.md` fila de Reportes).

**Verificar:** el cierre sigue siendo posible sin completar el campo nuevo (no es obligatorio); Modo Control (que ya arma el pase con el botón "+") no se ve afectado — este campo es aparte, no reemplaza nada de lo que ya funciona ahí.

---

## F2 — Historial de cambios en fichas técnicas (Recetario)

**Problema:** `useRecetas.ts:223` hace `supabase.from('recetas').update(datos).eq('id', id)` sin dejar rastro de quién cambió qué ni cuándo. El documento lo llama "open source sin historial de commits": cualquiera puede proponer y el jefe de partida para arriba ratifica, pero el cambio se pierde en cuanto se guarda. Es además requisito de facto para cualquier perfil con trazabilidad regulatoria (bromatología, RNPA si se llega a modelar ese perfil).

**Propuesta:**
1. Tabla nueva `recetas_historial` (o similar): `receta_id, campo_o_snapshot, valor_anterior, valor_nuevo, editado_por, editado_at`. Decidir con el usuario si es diff por campo o snapshot completo del JSON de la receta — snapshot completo es más simple de implementar y más barato de auditar visualmente.
2. Trigger en `recetas` o wrapper en el `update()` de `useRecetas.ts` que escriba la fila de historial en cada cambio real (comparar antes de escribir para no loguear updates sin cambios).
3. UI mínima: un tab o acordeón "Historial" en el detalle de receta, lista simple de "Fulano cambió X el DD/MM".

**Verificar:** no ralentiza el guardado percibido (puede ser fire-and-forget); no rompe el import masivo con IA (que también pasa por `update`/`insert` de recetas) — decidir si el historial se activa ahí o solo en ediciones manuales.

---

## F3 — Bandeja de propuestas (juego de autoría visible)

**Problema:** hoy proponer un cambio de receta o de carta es informal — se habla, no queda estado. El documento marca esto como la palanca contra la deserción temprana: el juego de autoría (sin techo, es donde está la distinción) existe en la práctica pero es invisible para quien recién entra.

**Nota:** esta es la fase más ambigua de las tres — no está tan claramente delimitada como F1/F2, y depende de F2 (sin historial de cambios, una bandeja de propuestas no tiene dónde aterrizar cuando se aprueban). Conviene scopearla en la sesión, no antes: mínimo viable podría ser una tabla `propuestas` con estado (`pendiente/aprobada/rechazada`), autor, y a qué receta/ítem de carta apunta, con una lista simple visible para jefe de partida+.

---

## Fuera de este plan (mencionado en el análisis pero no scopeado)

- **Alerta/bloqueo de edición en fichas con RNPA** (perfil E/producción): no aplica hoy porque KitchenOS no modela ese perfil todavía (no hay campo RNPA en `recetas` ni en ningún lado del código — verificado, cero resultados). Prematuro hasta que ese perfil exista.
- **Registro de rendimiento portable** (que el cocinero se lleve su historial al cambiar de trabajo): el documento mismo lo marca como decisión política antes que técnica (a quién beneficia, riesgo de vigilancia). No es un ticket de producto, es una decisión de negocio a tomar antes de scopear nada.
