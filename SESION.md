# Sesión — 2026-08-22 (PLAN-4-CAPAS bloque B8)

## Qué se cerró
- **Reservas: el modelo y la pantalla** (PLAN-4-CAPAS B8): tabla nueva `reservas` (RLS + `reset_demo_restaurante()`), hook `useReservas.ts`, pantalla `/reservas` con vista Día (lista por hora, pax, teléfono, estado) y Semana (carga por día, cubiertos vivos vía `lib/reservas/helpers.ts`, con test Vitest de `semanaDeFecha`/`cubiertosVivos`). Sheet único de alta/edición con selector de estado (pendiente/confirmada/sentada/no_show/cancelada) y origen (teléfono/WhatsApp/web/walk-in).
- Módulo nuevo (`ModuloId 'reservas'`) sumado a `MODULO_CONFIG`, `MODULOS_POR_ROL` (admin/chef), `RUTA_A_MODULO`, `SidebarNav` (sección Servicio), `MODULOS_ASIGNABLES` (Turnos→Puestos) y `GRID_MODULOS` (Dashboard). Deliberadamente **no** sumado a `MODULOS_EMPRENDIMIENTO` — queda oculto en ese perfil, tal como pedía el plan.
- **Punto de decisión resuelto**: el plan pedía revisar el track de validación con Bros/Rescoldo antes de arrancar B8. No se había corrido. Facundo decidió avanzar igual — documentado en `DECISIONES.md` §22. El track sigue pendiente y ahora pesa sobre si vale la pena seguir con B9/B10, no sobre B8 (ya construido).
- Verificado en vivo (Playwright + dev server) contra El Rescoldo real: crear reserva → aparece en Día → cuenta en Semana → cambiar estado a Confirmada → eliminar. Datos de prueba limpiados de producción al terminar. `npm run build` + `tsc --noEmit` limpios, 135/135 tests Vitest (127 previos + 8 nuevos).
- Commits pusheados: `feat(reservas)` + `docs` (checkbox B8 en el plan).

## Qué quedó a medias
- Nada bloqueante — el bloque quedó verificado de punta a punta y aislado, tal como lo definía el plan.

## Probar primero mañana
- Nada urgente. La pantalla es nueva: si Facundo la prueba a mano y algo del flujo de carga (teléfono, pax, nota) no se siente natural, es candidato a ajuste antes de seguir a B9.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — quedan B9 (reservas dentro del día de trabajo: OPS, Salón, Calendario, Dashboard) y B10 (reservas alimentan previsión de producción y sugerencia de compra), ambos dependientes de B8. Antes de arrancar B9, considerar correr por fin el track de validación con Bros/Rescoldo (3 preguntas de `PLAN-4-CAPAS.md`) — si a ninguno le duele reservas, B9-B10 se reordenan o se pausan.
