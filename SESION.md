# Sesión — 2026-08-18 (noche, 2) — OPS: plaza General + duplicación menú

## Qué se cerró
- **Plaza `general` en azul** (`#2563eb`) en vez de gris, en `lib/constants.ts` y `lib/ops/mise.ts` (mantenidas en espejo) — se destaca como especial, no es una plaza física.
- **Fix de la duplicación menú/plaza**: `handleCrearTarea` (`checklist/ClientView.tsx`) creaba toda tarea despachada desde el mise con `modo: 'carta'` a ciegas. Ahora mira `checklist_item.menu_id`: si el ítem viene de un menú activado, la tarea nace con `modo: 'menu'` y no vuelve a aparecer como columna "General" de Carta duplicando la banda Menú. Documentado en `hooks.md`.
- **Datos de Bros limpiados** (no solo el código): 11 tareas viejas creadas con el bug se recategorizaron; 8 eran duplicado exacto del mismo día y se fusionaron (heredando SP/`listo` donde correspondía) borrando la redundante. `tareas.plaza='general'` quedó en 0 filas.
- Commit `1b1e7c0`, pusheado, deploy verde en Vercel. `tsc --noEmit` limpio, `menuMise.test.ts` 21/21.

## Qué quedó a medias
- Nada de este tema — cerrado de punta a punta (código + datos + verificación).

## Probar primero mañana
- Abrir Producción en Bros y confirmar visualmente: la plaza General se ve azul, y ya no aparece como columna de Carta duplicando el menú activo.
- Si se activa un menú nuevo con `plaza_control='general'` y se despacha un déficit desde el mise, confirmar que la tarea nace directo en la banda Menú (no en Carta).

## Próximo paso concreto
Sin tema abierto de esta sesión. Seguir con `PLAN-4-CAPAS.md` (B4, B6 o B7 — independientes entre sí) según lo que quedó en la sesión de B3 proveedores.
