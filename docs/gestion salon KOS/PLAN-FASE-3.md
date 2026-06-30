# PLAN — Fase 3: KDS Completo (P0 + P1 cocina)

> **Estado:** En curso (30 jun 2026). Ejecutar después de Fase 2.
> **Objetivo:** Elevar el KDS de skeleton funcional a pantalla de producción. Las features P0 pendientes + las P1 de cocina más valoradas.

## Pasos

| # | Feature | Prioridad | Schema change |
|---|---|---|---|
| 1 | Alertas sonoras + visual en KDS | P0 | No |
| 2 | All-day view (conteo total por ítem) | P1 | No |
| 3 | Recall (restaurar comanda bumpeada) | P1 | No |
| 4 | Hold/fire (pausar comanda hasta marchar) | P1 | `comandas.held BOOL` |

## Paso 1 — Alertas sonoras

- Beep agudo doble (880 Hz → 1100 Hz) cuando llega comanda nueva.
- Tono grave (440 Hz) cuando ticket time cruza el umbral rojo (>10 min).
- Botón mute en el header del KDS (icono `volume_up` / `volume_off`).
- Preferencia persiste en `localStorage('kds_muted')`.
- Implementado en `lib/servicio/useAlertasSonoras.ts` (AudioContext programático, sin archivos externos).

## Paso 2 — All-day view

- Botón "All-day" en header KDS.
- Abre panel inferior fijo (slide-up) con tabla: Plato | Cantidad total across todas las tarjetas abiertas.
- Ordenado por cantidad desc. Solo ítems no-bumpeados.
- Tap en el panel fuera del panel cierra.

## Paso 3 — Recall

- Botón "Recall" en header KDS.
- Panel lateral/drawer con últimas 10 comandas bumpeadas (< 30 min).
- Tap en una → `restaurarComanda(id)` en hook: UPDATE items bumpeados → pendiente, comanda → enviada, INSERT eventos_cocina recalled.
- SWR mutate + realtime propaga al KDS de vuelta.

## Paso 4 — Hold/fire

- Migración: `ALTER TABLE comandas ADD COLUMN held BOOLEAN NOT NULL DEFAULT FALSE`.
- KDS: comandas `held=true` se muestran con overlay gris oscuro + badge "EN HOLD".
- Botón "FIRE" grande en lugar de "BUMP COMANDA" para comandas en hold.
- FIRE: `held=false` + avanza ítems pendientes a `en_prep`.
- HOLD: tap en header de la tarjeta → `holdComanda(id)`.

## Criterios de aceptación

- Alerta suena cuando llega una comanda nueva (sin que el cocinero mire la pantalla).
- All-day muestra conteos correctos con múltiples comandas abiertas.
- Recall restaura una comanda y aparece de vuelta en el KDS en tiempo real.
- Una comanda en hold no suena como "nueva" ni aparece como urgente — sale de la grilla normal.
- No rompe nada del walking skeleton (Fase 2).
