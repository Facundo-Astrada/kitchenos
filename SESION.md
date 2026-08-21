# Sesión — 2026-08-20 (2) — Menú como plaza dedicada en el mise

## Qué se cerró
- **Bug real reportado por Facundo con captura**: un menú activado (`plaza_control='general'`) duplicaba cada preparación en TODAS las plazas del mise (`'general'` se inyecta en todas) y otra vez en Producción (columna "General" duplicando la columna real del plan). Fix: `'menu'` pasa a ser plaza dedicada (ámbar, no física — nunca `PLAZAS_FIJAS`), migración `20260820_menu_plaza_dedicada.sql` reasigna lo existente, columna nueva `checklist_items.menu_paso` para que el despacho caiga en la columna real.
- **Guarda contra doble despacho** en `handleCrearTarea` (chequea `tareas` en memoria antes de insertar) — resuelve de raíz el pendiente "doble-tap táctil" que estaba en `PENDIENTES.md`.
- **Una sola puerta de activación por tipo de menú** (decisión de Facundo): fijo → solo por vigencia en el mise; evento → solo por fecha directa a Producción. Tocado: `ComposicionEditor`, `MenusView`, picker de Planificación, Calendario ("Planificar evento", antes "Planificar menú").
- **Bug propio encontrado en vivo y arreglado en el momento**: `gridProgress` no cubría la plaza `'menu'` nueva y explotaba el selector — capturado con Playwright antes de dar el fix por cerrado.
- Color de Menú ajustado de índigo a **ámbar** (mismo que "Todo" en OpsToggle) tras feedback de Facundo sobre visibilidad — 2do commit.
- Limpieza de datos: 21 tareas duplicadas ya existentes en Bros borradas (a pedido explícito), 0 grupos duplicados verificado post-limpieza.
- 2 commits (`8d5e4da`, `8e8e3f9`), pusheados, deploy en Vercel. Build + 111/111 Vitest en verde en cada uno. Verificado en vivo con capturas reales (magic-link a `franco@broscomedor.com`, admin de Bros).
- Docs actualizados: `hooks.md` (sección "Menú/Evento en el mise" reescrita con la puerta única + plaza dedicada + guarda de duplicados), `columnas.md` (`checklist_items.plaza='general'`/`menu_paso`, `menus.plaza_control`), `ESTADO-ACTUAL.md` (filas 8 Carta, 9 Mise, 13 Calendario, 15 Producción, 24 OPS), `PENDIENTES.md` podado.

## Qué quedó a medias
- Nada de esta sesión — los dos commits cierran el bug reportado de punta a punta (causa raíz + duplicados históricos + verificación visual).

## Probar primero mañana
- Confirmar en Bros con uso real (no test) que un menú fijo nuevo, activado con plaza de control default "Menú", se ve bien en la apertura del turno de mañana — hoy solo se verificó con datos existentes + capturas de El Rescoldo (sin datos de menú activado).

## Próximo paso concreto
- Sin pendiente puntual disparado por esta sesión. Retomar backlog de `PENDIENTES.md` por prioridad (🔴/🟠).
- Nota aparte (arrastrada de sesiones previas): `PENDIENTES.md` sigue en ~21KB, por encima del ~10KB de referencia — vale una poda a fondo cuando haya lugar.
- Nota nueva encontrada hoy: la cuenta de prueba `cocina@broscomedor.com` tiene `rol='cocinero'` (no matchea `MODULOS_POR_ROL`) y el sidebar le muestra solo "Inicio" pese a tener `permisos_app` completo — anotado en `PENDIENTES.md` junto al bug ya conocido de `usePermisos` que traga el error real (probablemente la misma causa).
