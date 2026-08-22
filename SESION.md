# Sesión — 2026-08-22

## Qué se cerró
- Bug reportado en vivo: un evento activado en el mise con `plaza_control='general'` se veía mezclado en TODAS las plazas (Frios incluida) — `'general'` se inyecta en cada plaza real. Corregido el dato del evento "Menu estandar +1 -" (movido a la plaza dedicada `'menu'`) y el default de `ComposicionEditor` para que un evento nuevo también arranque ahí, no en blanco.
- Bug relacionado en Producción: al editar un evento ya activado, `useMenus.ts` (`actualizarMenu`) hardcodeaba `modo:'menu'` para las tareas nuevas propagadas a días futuros — se mezclaban con la banda "Menú" del board en vez de cortar aparte en "Evento". Corregido + backfill de 25 tareas históricas mal etiquetadas (event "Menu estandar +1 -" y "Noche de Asado - Día del Padre").
- Decisión de producto aclarada con Facundo: un evento SÍ puede tener presencia en el mise (siempre en la plaza dedicada `'menu'`), matiza la regla "una sola puerta" del commit del 20/08. Registrado en `DECISIONES.md` §21, con `hooks.md`, `ESTADO-ACTUAL.md` y comentarios de `MenusView.tsx` alineados — sin cambio de comportamiento visible, solo la doc que antes contradecía lo que el código y el pedido de hoy ya hacían.

## Qué quedó a medias
- Asimetría chica encontrada de paso: el picker de Planificación (`produccion/page.tsx`) no ofrece "Sacar del mise" para un evento con presencia heredada — solo Carta → Menús lo tiene. Anotada en `PENDIENTES.md` 🟢 Bajo, no arreglada (no molesta hoy, se saca por `MenusView` o SQL).

## Probar primero mañana
- En producción: confirmar que "Menu estandar +1 -" ya no aparece en Frios ni en ninguna plaza real del mise, solo en la plaza Menú.
- Confirmar que el board de Producción hoy muestra "Menú" (Cotidiano) y "Evento" (Menu estandar +1) como bandas separadas y apiladas, no mezcladas bajo un solo encabezado.

## Próximo paso concreto
Nada crítico quedó abierto de esta sesión. Retomar `PENDIENTES.md` 🟠 Alto — las verificaciones en dispositivo real de la tanda de mise de agosto siguen siendo la deuda más vieja del backlog.
