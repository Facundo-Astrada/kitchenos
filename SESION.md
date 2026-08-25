# Sesión — 2026-08-25 (triage en vivo: OPS + shell de escritorio)

Sesión reactiva: Facundo fue probando la app (mobile y desktop) y reportando bugs uno a uno; cada uno se diagnosticó, arregló, verificó con Playwright contra el dev server y se deployó. Sin tocar `PENDIENTES.md` — nada de esto estaba trackeado, todo se encontró y cerró en el momento.

## Qué se cerró

1. **Swipe entre tabs de OPS no funcionaba en Planificación** — tenía su propio `overflow:auto` horizontal que se comía el gesto calculado a mano. Reemplazado por scroll-snap nativo (fila `flex` + `scroll-snap-type`), que de paso resuelve el pedido de "que la pantalla siguiente aparezca en vivo mientras arrastro el dedo". `c5076e1`.
2. **Planificación "saltaba" un instante al llegar deslizando** — tenía scroll vertical propio anidado dentro de la fila de scroll-snap (bug de altura, no de animación). Unificado al mismo patrón que Producción/Mise: raíz flex-column, contenido en un hijo `flex:1` con su propio `overflowY:auto`. `9c354c0`.
3. **Turno (OPS) sin sombras y con botones de header sin superficie propia** — header pasa a `--surface`+`shadow-2`, filas pendientes ganan `shadow-1` (las hechas se asientan sin sombra), Imprimir/Editar pasan a botón-ícono circular de 34px. `bb6d0c6`.
4. **Sidebar de escritorio no scrolleaba** (el menú de abajo — Insumos/Gestión/Sistema/perfil — quedaba fuera de pantalla): cadena de altura rota en dos puntos (wrapper sin `height:100%` en `DesktopShell`, `<nav>` sin `minHeight:0`). `77c557a`.
5. **Scrollbar gris de Windows visible** en sidebar y panel principal — nueva clase `.hide-scrollbar`. `0911ecd`.
6. **Organigrama invisible en la sidebar de escritorio** — existía completo, pero `SidebarNav.tsx` usa una lista hardcodeada que nunca se actualizó (a diferencia del menú "MÁS" de mobile, que sí deriva de `MODULOS_POR_ROL`). `f32d6c7`.

Docs actualizados: `.claude/docs/ui.md` (cadena de altura rota — generalizado desde Boards Kanban; patrón de tabs con scroll-snap nativo; gotcha de `SidebarNav` hardcodeado), `ESTADO-ACTUAL.md` (fila de OPS).

## Qué quedó a medias

Nada de lo tocado hoy — los 6 ítems cerraron y se verificaron con captura real antes de pushear.

## Probar primero mañana

1. **Sigue sin cargarse el crédito de Anthropic** (🔴 de `PENDIENTES.md`, no tocado hoy) — toda la IA de la app sigue caída.
2. Confirmar en el celu/tablet real: el swipe de OPS con la sensación nueva, y la pantalla Turno con las sombras.
3. Confirmar en escritorio: la sidebar scrollea entera (Reportes, Ventas, Clientes... hasta el perfil) y Organigrama aparece en Sistema.

## Próximo paso concreto

Sin bug nuevo abierto. Volver al backlog de `PENDIENTES.md` — el 🔴 sigue siendo cargar crédito en Anthropic; después, `PLAN-ACCESO-Y-USO` § B5.3 (funciones ya construidas que nadie encuentra) es la alternativa de bajo costo y alto retorno más próxima.
