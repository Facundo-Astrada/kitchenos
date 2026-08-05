# Sesión — 2026-08-05 (b)

## Qué se cerró
- **Planificación: menú y evento separados.** Un día con varios menús activos aplanaba todo en las mismas secciones. Ahora cada menú es un bloque propio (badge Menú/Evento, nombre, avance, vaciar solo ese) + filtro Todo/Menú/Evento con conteos. Puntos del calendario: verde menú, naranja evento.
- **Guía de uso del Mise** (`MiseGuiaSheet`): botón "?" en el header con la explicación de cada control (turnos, fases, progreso, Modo Control, checkbox, g/porc, recipiente, "hay ahora", producir, add_task, tarjeta de cierre), cada uno con qué hace y cómo repercute en el turno siguiente. Sección "la primera vez que cargás lo que hay", linkeada desde el banner "recibís sin cierre".
- **Recorrido guiado** (`MiseTourOverlay`): el mismo contenido señalado sobre la pantalla real — fondo oscurecido, control con borde naranja, viñeta con puntita. Cambia de fase para mostrar la tarjeta de cierre y restaura la que tenía el usuario.
- **Bug real encontrado verificando el recorrido:** el tab **Cierre mostraba la tarjeta de Apertura** en toda cuenta con turnos de servicio (`turno === 'cierre'` contra un valor codificado `'almuerzo:cierre'`). Fix con `parseTurnoFase`.
- **Auditoría de performance de OPS en celular**, medida con `shot.mjs --net` sobre la cuenta real: abrir Mise pasó de **2582 kB / 64 requests → 899 kB / 46**. Lo grande: `useRecetasLite` (1623→143 kB), `useRestauranteConfig` (11 requests a `restaurantes` → 1), fin de queries redundantes de `checklist_items` (253→70 kB), `soloEscritura` en `useTareas`/`useHaccp`, ventana de 60 días en `tareas`, realtime filtrado por restaurante, card memoizada, dos índices nuevos. **Tildar dejó de esperar tres round-trips en serie: se pinta en el frame del tap.**
- Docs: reglas nuevas en `hooks.md` (peso de pantalla, escrituras optimistas), `ui.md` (memo en listas largas, guía+recorrido) y `columnas.md` (`checklist_registros.turno` va codificado, leer con `parseTurnoFase`).

## Qué quedó a medias
- Nada a medias en código: 10 commits, todos compilan y están en producción, cada uno verificado en prod con capturas.
- Sigue sin tocar, esperando confirmación de Facundo: `mcp-index.js`, `mcp-sdk-client.js`, `mcp-stdio.js`, dos `.tgz` en la raíz y `.claude/settings.json` modificado sin commitear.

## Probar primero mañana
- **Tildar en un celular real, en la cocina.** Se verificó con Playwright (tilde instantáneo + registro persistido en DB), pero el objetivo era la sensación en mano: confirmar que el círculo responde al toque y que cambiar Apertura↔Cierre ya no deja la lista en blanco.
- El recorrido guiado del Mise en mobile: la viñeta se posiciona sobre/bajo el control según el espacio; en pantallas angostas con el control cerca del borde puede quedar apretada.
- Planificación con menú + evento el mismo día (Bros lo tiene hoy): que el filtro y los bloques se lean bien en mobile, no solo en desktop.

## Próximo paso concreto
- Si aparece feedback de velocidad, seguir con lo anotado en `PENDIENTES.md` → "OPS — seguir bajando el peso en celular": `tareas` (594 kB; antes de apretar la ventana de 60 días hay que hacer que Planificación consulte por su cuenta las fechas que queden afuera) y el count de `productos` del panel del Coach.
- Si el foco vuelve a features: F2 del Calendario (motor de rutinas, `CALENDARIO-PLAN.md`), o el 🟠 Alto de `PENDIENTES.md` (invitación de usuarios = solo config de Supabase; fiscal ARCA = necesita certificado real).
