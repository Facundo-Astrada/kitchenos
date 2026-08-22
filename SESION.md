# Sesión — 2026-08-22 (2ª del día — la 1ª fue "evento en el mise", cerrada en `b660667`)

## Qué se cerró
- Bug reportado por Facundo: en iPhone 12/13/14 la app llena la pantalla, pero en algunos Motorola y Samsung "sale más fina y estirada". Causa: `#shell` en `app/globals.css` capaba el ancho en `max-width:420px` para todo lo menor a 1024px. Los Android que reportan más de 420 CSS px quedaban con bandas de `--navy` a los costados — Motorola (1080px @ DPR 2.25) = **480 CSS px**, 60px de banda por lado; con "Tamaño de pantalla" en chico hasta **540**, 120px por lado. El iPhone nunca lo mostró porque reporta 390: el número entraba de casualidad.
- Fix: el cap de 420px pasó a `@media (min-width:600px)` (`sw600dp` de Android — todo celular en vertical queda debajo). Tablet y desktop intactos. De paso se arregló que FABs y sheets (`position:fixed`, anclados al viewport real) flotaran fuera de la columna en esos equipos.
- Verificado con Playwright emulando 390 / 480 / 540 CSS px en `/`, `/stock` y `/operaciones`: bandas laterales 60/120px antes → **0px** después, sin scroll horizontal, capturas revisadas a 480 y 540. Confirmado también contra el CSS que sirve producción. Deployado.
- Docs: regla nueva en `.claude/docs/ui.md` § "Ancho del `#shell`", contrato del shell en `ESTADO-ACTUAL.md` §4, y el ítem de Stock 480-1023px de `PENDIENTES.md` reescrito (ese rango ya no es solo tablet — ahora son celulares reales).

## Qué quedó a medias
- `--header-top:46px` (padding pensado para la status bar de iOS) se aplica igual en Android y en navegador, donde no hace falta: ~46px de navy de más arriba en toda la app. No se tocó porque cambia el look en todas las pantallas — decisión de Facundo. El fix sería `max(env(safe-area-inset-top), 12px)`.

## Probar primero mañana
- Abrir la app en el Motorola/Samsung físico donde se vio el problema, **con recarga forzada** (el service worker sirve el CSS viejo la primera vez): tiene que llenar el ancho, sin bandas oscuras, y los FAB/sheets caer dentro de la pantalla sin pegarse al borde.
- En Stock desde ese mismo equipo (480-540px es justo el rango señalado en `PENDIENTES.md`): entrar en **modo edición** de una celda de stock y ver si el número editable y el editor de mínimo entran juntos. En modo lectura ya se verificó que sí.
- Pendiente arrastrado de la 1ª sesión de hoy, sin confirmar en prod: que "Menu estandar +1 -" no aparezca en Frios ni en ninguna plaza real del mise (solo en la plaza Menú), y que el board de Producción muestre "Menú" y "Evento" como bandas separadas.

## Próximo paso concreto
Nada crítico abierto. El backlog 🟠 Alto sigue siendo el mismo: las verificaciones en dispositivo real (`PENDIENTES.md` § "Verificaciones en dispositivo real"), donde ahora se sumó el chequeo del ancho completo — todas se cierran en una sola pasada con el celular en la cocina.
