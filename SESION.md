# Sesión — 2026-09-09

## Qué se cerró
- Auditoría completa de carga de Plato/Menú/Evento en Carta (12 puntos) + drag 2D en
  Mise, 9 commits (`1a56f70`…`8f571d2`) pusheados uno por uno con typecheck+Vitest+build
  antes de cada push.
- Botón "Crear receta" en el preview de un ítem de Menú/Evento sin ingredientes (pedido
  inicial), después auditoría completa: borrador local + Ctrl/Cmd+S, pegar lista completa
  de ítems (WhatsApp/notas), foto del plato al crearlo, drag para reordenar y migrar de
  sección (con preview flotante + auto-scroll + rAF para que no se sienta trabado), "Texto
  libre" expuesto, "Duplicar" menú/evento, nota libre por ítem (viaja al mise/tarea al
  activar), comensales del evento (`menus.pax`), activar Producción directo al guardar un
  evento con fecha, panel OPS recortado en modo Evento, IA en `RecetaEditSheet`.
- Mismo drag llevado a Mise (pedido aparte, screenshot con la grilla de desktop): mouse
  además de touch, hit-test 2D en la grilla — antes 1D y sin mouse, por eso la grilla se
  limitaba a "donde no hay drag".
- 4 rondas de ajuste sobre feedback real (Texto libre abría todo Producción, drag sin
  feedback visual, drag trabado) resueltas en la misma sesión, no dejadas para después.
- Migraciones: `menus.pax`, `menu_preparaciones.nota`, `plato_recetas.nota`, `tareas.nota`.
  Extraído `lib/carta/reordenarItems.ts` y `lib/ops/miseReorder.ts` (con tests) para no
  duplicar la geometría del drag ni seguir engordando `ClientView.tsx` (tiene techo de
  líneas).
- `PENDIENTES.md`, `ESTADO-ACTUAL.md`, `.claude/docs/rls.md`, `.claude/docs/ui.md`,
  `.claude/docs/columnas.md` actualizados — detalle completo en `HISTORIAL.md`.

## Qué quedó a medias
- **Sin verificación visual en browser real** — no había herramienta de automatización
  disponible esta sesión. Todo lo de Carta y Mise se verificó por typecheck+tests+build,
  no por uso real en pantalla. Es la sesión con más superficie UI/drag tocada sin ese
  chequeo — prioridad para la próxima apertura.
- **`plato_recetas.nota` sin UI en `DetailView.tsx`** — la nota por componente de un plato
  solo se puede cargar al CREAR el plato desde `ComposicionEditor`; un plato ya existente
  (el caso común, se edita desde el detalle) no tiene dónde escribirla. Puro UI, sin riesgo
  de migración.
- **Ítem #3 de la auditoría original, descartado a propósito**: importar el menú completo
  desde una foto/PDF (como ya existe para la carta de platos) es una pieza de IA nueva
  (parsear estructura de menú, no de plato) — el pegado de texto (#2) ya cubrió la mayor
  parte de la urgencia real.
- Mise en tablet táctil ancha sigue en columna única (`pointer:fine` en el media query,
  a propósito) — el drag 2D ya existe, solo falta decidir si vale la pena sacarle esa
  condición en CSS y JS.

## Probar primero mañana
- Carta → Evento/Menú: pegar una lista de WhatsApp en el buscador, arrastrar un ítem entre
  secciones (Entrada→Principal) en mobile y en desktop con mouse, cerrar la pestaña a
  mitad de carga y confirmar que el borrador se recupera solo al reabrir.
- Mise: arrastrar un ítem con mouse en la grilla de desktop (antes no había forma) y
  confirmar que sigue andando con touch en mobile como siempre.
- Evento nuevo con fecha cargada → confirmar que aparece ya activado en Producción al
  guardar, sin tener que ir a buscarlo a Planificación.

## Próximo paso concreto
- Verificar en vivo (dev server + celular/desktop reales) lo de esta sesión antes de seguir
  agregando — es lo que quedó sin chequear. Si todo anda, retomar `PENDIENTES.md` 🟠 Alto:
  SMTP propio para invitaciones (bloqueado en dominio propio de Resend) o feature gating
  (`puedeUsar()` sin cablear a ninguna pantalla todavía).
