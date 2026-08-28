# Sesión — 2026-08-27 (cont.) — 12 ítems del backlog sin decisión pendiente

## Qué se cerró

Facundo pidió atacar en una sola sesión todo lo que no dependía de su decisión, del más chico al más grande. 12 commits, build+test+lint verde después de cada uno:

1. `demanda_viva` se resetea al completar la apertura (`useChecklist.resetDemandaViva`).
2. `confirm()` nativo de servicio eliminado — `ConfirmSheet` extraído a `components/ui/`, reusado en Producción y Salón/Config.
3. Foto de perfil del equipo (`PhotoPicker` en `turnos/page.tsx`).
4. `facturas-universal` resuelve `producto_id` al importar (mismo matching que `useFacturas.ts`).
5. Investigado "Ventas en 0 vs Ingeniería con datos": filtro de fecha distinto, no dos fuentes — cartel aclaratorio agregado.
6. Notificaciones in-app completas (tabla, realtime, campanita+feed, primer trigger en `asignarTurno`).
7. Clonar permisos entre puestos (Turnos → Puestos).
8. 3/5 tours de capacitación (`configuracion`, `coach`, `bitacora`) — faltaba que esas pantallas escribieran `kc_screen_context`.
9. Deshacer entrega (botón, hook ya existía) + Reportes → Auditoría ahora dice quién entregó y cuándo.
10. Coach: productos en crítico vía RPC server-side (antes bajaba 1000 filas).
11. 3 pistas visuales de `PLAN-ACCESO-Y-USO` § B5.3 (Modo Control, escalar por referencia, Sugerir producción).
12. Primeros tests de hooks: Testing Library + mock de Supabase (`useTareas`, `usePermisos`).

Detalle completo de cada uno en `HISTORIAL.md`. `PENDIENTES.md` podado en paralelo — lo resuelto se sacó, lo parcial quedó recortado a lo que falta.

## Qué quedó a medias

- **KDS/Muro sin tour**: contenido escrito (`TOURS.kds`/`TOURS.muro`), pero esas pantallas viven en un layout que a propósito no monta el FAB del Coach (doctrina "Registro Servicio"). Necesita que Facundo elija entre sumar el FAB ahí, un trigger mínimo propio, o dejarlas sin tour.
- **Notificaciones**: solo el trigger de `asignarTurno`. Cualquier otro (stock crítico, vencimientos) es una decisión de producto aparte, no wireado.
- **Ingeniería de menú**: el cartel aclara el filtro de fecha, pero si conviene que scopee a un período en vez de todo el historial sigue sin decidirse.
- **`tareas` 594 kB** (peso en mobile) — riesgo real de romper Planificación si se aprieta la ventana de 60 días; queda para sesión propia.

## Probar primero mañana

1. Notificaciones: asignar un turno real a alguien con cuenta vinculada y confirmar que le llega la campanita (se probó con una fila insertada por SQL, no con el flujo real de punta a punta).
2. Deshacer entrega en un dispositivo real — el demo no tenía items de mise cargados para probar el flujo completo (entregar → deshacer).
3. `/reportes` → Auditoría: confirmar que "Pases entregados" aparece bien apenas haya `cierres_turno` reales de esta semana (Bros, no El Rescoldo demo).

## Próximo paso concreto

Backlog libre de nuevo — quedan los 🔴/🟠 de siempre (RLS de `tareas_duplicados_backup_20260826`, B9/B10 de reservas, SMTP propio) y las features grandes (Muro F4, Calendario F2-F5, Bitácora F2-F3, Coach en Carta, container-transform del Mise) para cuando haya una sesión dedicada a alguna. **`PENDIENTES.md` sigue en ~30 KB** pese a la poda de hoy — la mayoría es contenido de sesiones previas que no tocamos; merece su propia pasada de re-priorización con Facundo si sigue creciendo.
