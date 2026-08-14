# Sesión — 2026-08-14

## Qué se cerró
- **Bitácora F1 deployada**: `/bitacora`, hoja de ruta/reuniones de equipo (reemplaza el Google Docs del equipo). Tablas `bitacora_entradas`/`bitacora_items` con RLS+realtime, hook `useBitacora`, editor tipo-doc (Enter parte la línea en el cursor y crea la siguiente, Tab indenta, Backspace al inicio fusiona con la anterior, checkbox, pegar multilínea desde Docs se parte en ítems), participantes desde el día 1, solo admin/chef.
- Dos bugs reales encontrados y arreglados con pruebas Playwright contra dev server + verificación en DB: (1) crear ítem esperaba el round-trip de red antes de limpiar el input — tipear rápido pegaba dos líneas en una; fix con id generado en cliente + estado optimista de verdad (hooks.md #24). (2) refrescar a mitad de escribir volvía a la lista y podía perder una línea sin Enter; fix con sessionStorage + flush del borrador en visibilitychange/beforeunload/unmount (hooks.md #25).
- Sumadas las dos tablas nuevas a `reset_demo_restaurante()` (la demo se quedaba sin Bitácora tras el reset nocturno) — verificado corriendo la función.
- Deployado a producción (push a main).

## Qué quedó a medias
Nada — F1 completo y en producción.

## Probar primero mañana
Nada bloqueante. Si se sigue con Bitácora, probar el flush de borrador en un celular real (iOS Safari puede comportarse distinto que Chromium en `visibilitychange`).

## Próximo paso concreto
Bitácora F2: convertir un ítem en tarea real de OPS (`tarea_id` en `bitacora_items`) + arrastrar a la reunión siguiente los ítems que quedaron abiertos. Si no es el foco, resto del backlog 🟠 (Mise en dos dispositivos, invitación de usuarios, Fiscal ARCA).
