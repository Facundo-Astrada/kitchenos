# Sesión — 2026-08-13/15

Mise / Modo Control. 6 commits (`7d9bec0` → `fafa883`), todo deployado, build + 71 tests verdes.

## Qué se cerró
- **Modo Control decide y despacha**: tilde + badge de prioridad que cicla SP→P→REF + `+` que manda a producción sin cantidad. Tres estados de fila legibles (blanca / ámbar despachada / verde tildada), con los botones apagados y deshabilitados una vez resuelta.
- **El pase de turno viaja como tarea + prioridad, no como cantidad** (decisión tuya). Cerrar en Modo Control hereda *qué falta y con qué urgencia*. Cuatro piezas para que cierre: despacho al turno siguiente real, despachado cuenta como cerrado, contador del cierre suma lo despachado, aviso ámbar "Te dejaron en producción".
- **Cualquier miembro entra a cualquier plaza.** Era restricción de UI: RLS nunca filtró por plaza.
- **El header bajó de 4 franjas (~155px) a 3, y a 1 (~38px) al scrollear.** Título-selector de plaza+turno, `?`/`⚙` en un menú de tres puntos, notas vacías colapsadas.
- Guía del "?", tour y Coach al día (incluida una afirmación falsa que el Coach arrastraba: que cambiar la prioridad crea la tarea sola).

## Qué quedó a medias
- Nada a medias. Lo que se dejó afuera fue explícito: no extraje el modal centrado a `components/ui/` (es la 4ª copia y `ui.md` lo pide) porque implicaba tocar Calendario y Stock, fuera de lo pedido.
- El commit `7d9bec0` quedó con el subject "@" por un heredoc mal armado. Cosmético; arreglarlo pide `amend` + force push a main, no lo hice por mi cuenta.

## Probar primero mañana
**Toda la tanda en la tablet real** — es lo único sin verificar y está anotado en `PENDIENTES.md` 🟠. En orden de probabilidad de necesitar ajuste:
1. Los umbrales del plegado del header (12px zona muerta / 8px delta, en `handleListScroll`): si se siente nervioso o perezoso con el dedo, ese es el número.
2. El cartel "En producción" de 9px en la fila despachada — que se lea y no coma el nombre.
3. Contraste del ámbar y del gris apagado con la luz de la cocina.

## Próximo paso concreto
Con Modo Control en manos del equipo, el ítem que se vuelve real es **que la sugerencia de producción descuente lo despachado como `pase_turno` en vez de asumir stock 0** (`lib/produccion/sugerencia.ts`). Hoy, si el equipo se acostumbra a cerrar en Modo Control, "Sugerir producción" va a pedir de más. Anotado en 🟢 con la salida propuesta.
