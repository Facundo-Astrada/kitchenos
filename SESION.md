# Sesión — 2026-09-11 (tarde)

## Qué se cerró
- **Candado de duplicados de Producción** (`8be1d94`): 11 grupos duplicados en
  Bros limpiados con el criterio de `mejorRepresentante`, índice único
  `tareas_una_preparacion_una_fila` corrido en prod. Encontrado en el camino:
  `date::text` no es IMMUTABLE — gotcha nuevo en `rls.md`.
- **Ruta de implantación** (`a9460ac`…`836d023`): cron de reconocimiento
  agendado y `AVISOS_ACTIVOS=1` activo en prod; umbrales medidos contra Bros y
  El Rescoldo (20 tareas y 5 días de pase bien calibrados); racha de facturas
  cambiada de "consecutiva estricta" a "3 de las últimas 4 semanas" (daba 0 en
  Bros pese a ~3 meses de uso real) — con OK de Facundo.
- **Bug del botón de plegar el Coach en desktop** (`1fc2c0b`): tapaba
  contenido en cualquier pantalla. Fix real fue darle un carril propio en el
  flex layout (el primer intento, anclarlo arriba, todavía tapaba el header
  de Reportes — se descartó verificando con capturas). Documentado en `ui.md`.
- Worktree viejo `sleepy-jepsen` — ya no existía, se resolvió solo.

## Qué quedó a medias
- Nada a medias — todo lo tocado quedó verificado (Vitest 510/510, tsc, build)
  y pusheado.

## Probar primero mañana
- Mirar si el cron de avisos mandó algo real cuando algún restaurante junte
  su segunda foto de progreso semanal.
- Confirmar con Facundo si la racha de facturas con gracia (4 semanas) se
  siente bien en uso real, no solo en el dato medido hoy.

## Próximo paso concreto
- `/onboarding` sigue sin poder retirarse — la ruta lleva 4 días, hace falta
  más tiempo de uso real antes de decidir.
- Backlog 🟢 sin ítems obvios "hacer y listo" que queden — lo que sigue
  necesita una decisión de producto de Facundo (ver los "Confirmar con
  Facundo" y "Decisión pendiente" en `PENDIENTES.md`) o explorar a fondo una
  pantalla grande antes de tocarla.
