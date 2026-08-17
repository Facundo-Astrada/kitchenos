# Sesión — 2026-08-17

Cuarta vuelta del día sobre menú↔mise: paridad Planificación + Coach al día. 2 commits (`6867920`, `2e98400`), sobre el trabajo de plaza de control ya cerrado antes hoy (`9fbe843`/`d2f4fd5`, ver `HISTORIAL.md`). Build + 92 tests verdes, deployado.

## Qué se cerró
- **"Activar en el mise" también desde OPS → Planificación**, no solo desde Carta → Menús — mismo picker donde ya se activan tareas, con una segunda acción independiente por card. `estadoMiseMenu()` extraído a `lib/ops/menuMise.ts` como fuente única de vigente/futuro/vencido, compartida entre las dos pantallas.
- **Kitchen Coach actualizado**: sabe que un menú se activa en el mise (vigencia + apertura/cierre) además de en Planificación (tareas de un día), y que existe plaza de control. `carta-menus` sumado a `COACH_HIGHLIGHT_IDS` (antes no se podía señalar ese botón en el chat).
- **Verificado en datos reales de Bros**: el menú "Cotidiano 18/8 a 28/8" (`plaza_control='general'`) sincronizó sus 15 preparaciones correctamente tras el fix de la mañana — confirmado por SQL, no solo por test.

## Qué quedó a medias
- **Dato real tocado en Bros, a confirmar con Facundo**: `vigencia_desde` de "Cotidiano 18/8 a 28/8" se movió de 18/08 a **17/08** (hoy) a pedido suyo, para poder ver el menú funcionando en el mise sin esperar a mañana. Preguntar si se deja así o se vuelve a 18/08 — no se decidió explícitamente que quede permanente.
- El nuevo botón "Activar en el mise" del picker de Planificación no se probó todavía en pantalla real (solo build + tests) — sí se probó antes el de Carta → Menús.

## Probar primero mañana
1. Bros, Operaciones → Mise → plaza General → Apertura: confirmar que las 15 preparaciones de "Cotidiano" aparecen con chip violeta del menú y badge REF (o su prioridad real).
2. Confirmar con Facundo qué hacer con la vigencia movida (dejar 17/08 o volver a 18/08).
3. Probar el botón "Activar en el mise" desde OPS → Planificación al menos una vez en pantalla.

## Próximo paso concreto
Dejar de agregar superficie a menú↔mise por un rato y usarlo en servicio real (Bros o Rescoldo) — es la cuarta sesión seguida tocando esta feature y el próximo hallazgo útil va a salir de uso real, no de seguir construyendo. Si vuelve a haber fricción de "configurar por ítem", el pendiente grande es que el Coach pueda armar/activar un menú completo por dictado (`PENDIENTES.md` → Kitchen Coach: asistir activamente en el editor de Carta).
