# Sesión — 2026-08-22 (PLAN-4-CAPAS bloque B7)

## Qué se cerró
- **Checklist de la carta pre-servicio** (elBulli 10.1): tabla nueva `control_carta_registros` (RLS + reset_demo), hook `useControlCarta.ts`, pantalla `/control-carta` — lista de platos agrupados por plaza, tres botones sin números (ok/ajustar/no_sale). `no_sale` marca el 86 automático en `carta_items.disponible` (y lo levanta si se corrige después); `ajustar` crea una tarea de producción en la plaza real. CTA en OPS (`proximoTurnoEnVentana`, nuevo helper en `lib/ops/turnos.ts` con tests) que solo aparece en la ventana de 2h previa a que arranque un turno, no todo el día.
- **Hallazgo real durante la verificación**: `plato_plazas` (la tabla que iba a usarse para resolver la plaza de cada plato) está **vacía en El Rescoldo** (0 filas) — se usa `plato_recetas.plaza` en su lugar, que cubre 18/32 platos reales. Documentado en `columnas.md`.
- Verificado en vivo (Playwright + dev server) contra El Rescoldo real: agrupado por plaza, los tres estados, el 86 automático y la creación de tarea funcionan de punta a punta. Datos de prueba limpiados de producción al terminar (registros, tareas y `disponible` restaurados). `npm run build` + 127/127 tests Vitest limpios.
- Commit pendiente de pushear al cierre de esta sesión.

## Qué quedó a medias
- Nada bloqueante — el bloque quedó verificado de punta a punta.

## Probar primero mañana
- Nada urgente. Si se quiere pulir: cargar `plato_recetas.plaza` en los ítems que hoy caen en "Sin estación asignada" (14/32 en El Rescoldo) para que el agrupado sea más útil de entrada.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — queda B8 (Reservas), que es el punto de decisión: revisar el track de validación con Bros/Rescoldo antes de arrancarlo. Si no hay respuesta clara todavía, considerar si conviene reordenar hacia otro bloque.
