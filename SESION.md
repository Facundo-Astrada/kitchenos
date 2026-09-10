# Sesión — 2026-09-10

## Qué se cerró
- **Producción escalonada de eventos** (6 commits, `6d4011c`…`e30fefb`, cada uno
  con typecheck+Vitest(406)+build antes de push): un evento se cocina desde
  días antes y hasta hoy `activarMenuParaFechas` volcaba la lista completa en
  cada fecha del rango, sin distinguir plazas del mise (una preparación de
  evento no debía pasar por ahí — se tilda, no se cuenta).
- `menu_preparaciones.dias_antes` (NOT NULL DEFAULT 0, migrada y verificada en
  Supabase) + chips "Cuándo se produce" en `ComposicionEditor` + badge de
  anticipación en la fila colapsada. `fechaProduccion()`/`cronogramaDeEvento()`
  en `lib/menus/activarMenu.ts` (con tests) derivan el día de trabajo de
  `fecha_evento − dias_antes` — con `dias_antes=0` (todo lo ya cargado) el
  comportamiento es idéntico al de antes.
- Arrastre de evento hasta el día D en vez de un solo día (`tareas/ClientView.tsx`);
  el carryover que borra pendientes de ayer quedó SOLO para menú fijo (en
  evento borraba trabajo real). Propagación al editar un menú ya activado
  partida por tipo — la rama de evento sincroniza contra el cronograma, no
  metía las 14 preparaciones en cada uno de los 4 días.
- Banda EVENTO del board (`ProduccionBoard.tsx`): header con nombre + cuenta
  regresiva ("en 3 días"/"mañana"/"hoy", derivada de las tareas ya cargadas,
  sin fetch a `menus`) y badge "también en Menú/Evento" cuando el mismo
  nombre normalizado aparece hoy en más de una banda (no fusiona filas, solo
  avisa para hacerlas juntas).
- Fake de Supabase con filtrado real extraído a `lib/test-utils/fakeSupabaseStore.ts`
  (antes vivía embebido en `menuMise.test.ts`) para compartirlo con los tests
  nuevos de `activarMenu.test.ts`.
- `ESTADO-ACTUAL.md` (Carta, Producción/Planificación, OPS) y `.claude/docs/columnas.md`
  actualizados con el comportamiento nuevo.

## Qué quedó a medias
- **Dos eventos activos a la vez no tienen una cuenta regresiva propia** —
  la banda EVENTO se sigue mostrando junta (columnas por paso, no por evento)
  pero sin subtítulo si hay más de un `menu_id`. Anotado en `PENDIENTES.md`
  como backlog chico, límite explícito no bug.
- **Sin verificación visual del board** (header de banda, badge de duplicado):
  se probó el cronograma en uso real (confirmado por Facundo), pero el header
  nuevo de `ProduccionBoard` y el badge "también en..." solo pasaron por
  typecheck+build, no por pantalla.
- **`PENDIENTES.md` pasó los 38KB** (guideline del propio archivo: ~10KB) —
  no se podó esta sesión porque no era el foco; sería su propia sesión de
  limpieza dedicada, no algo para meter al cierre de otra.

## Probar primero mañana
- Header de la banda Evento en un evento real con fecha próxima: confirmar
  que dice "en N días"/"mañana" correctamente y que el badge de nombre
  repetido aparece cuando el mismo ítem está en el mise fijo y en un evento
  el mismo día.
- Mover la fecha de un evento ya activado con preparaciones en distintos
  `dias_antes` y confirmar que las pendientes se recalculan solas (las ya
  empezadas/listas no se mueven).

## Próximo paso concreto
- Retomar `PENDIENTES.md` 🟠 Alto: SMTP propio para invitaciones, o "Nada
  avisa cuando producción se rompe" (01/09). Si se abre sesión de limpieza de
  backlog, `PENDIENTES.md` es el primer candidato (38KB, guideline ~10KB).
