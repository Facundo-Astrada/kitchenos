# Sesión — 2026-08-08

Tema: notas de plaza, el cierre del Mise a la velocidad de la apertura, y el plegado del pase en Producción. 3 commits (`8bbfc62` → `561c738`), todo en producción y **verificado en pantalla por Facundo el mismo día, en servicio real**.

## Qué se cerró
- **Datos de OPS/Pase de Bros a cero** — 949 tareas, 423 registros del mise, 78 de producción diaria, 18 rendimientos, 4 mensajes del pase y 6 rutinas con typos. Intactas: recetas, guía del mise, secciones, menús y carta. Los menús activos se re-activan desde Carta, por eso se pudo borrar hasta lo futuro.
- **Notas de plaza** — sin tabla nueva: `pase_mensajes` con `plaza`. En Producción (por columna), Mise (arriba de todo) y Muro (solo lectura). Lo escrito en una columna se lee en el Pase y al revés.
- **El cierre del Mise se cuenta como la apertura** — escribir el número tilda, Enter salta al siguiente, select-all, campo más grande, y "Producir mañana N" como espejo del CTA de apertura. Era el ítem que `PENDIENTES.md` marcaba como "el próximo paso natural".
- **Producción pliega lo terminado antes de la entrega** — "N listas antes de las HH:MM". Corte por timestamp (`cierres_turno.cerrado_at` vs `tareas.completed_at`), **no** por identidad de turno: entregar es lo que hace avanzar el turno, así que comparar turnos se apaga solo.
- De paso: nombres del Mise cortados por el chip de peso, y un bug latente (el campo del cierre se quedaba con el número de la apertura al cambiar de fase).

## Qué quedó a medias
- **El Muro sigue sin verificar en tablet real** — arrastrado de la sesión anterior, y ahora con una cosa más para mirar: la franja de notas de plaza. Faltan wake lock, rollover de las 05:00 y la franja de entregas con una entrega real.
- **El rollover de las 05:00 del plegado** — que lo plegado desaparezca solo y las pendientes se arrastren un día. No se puede forzar desde una prueba de escritorio.
- **Mise en dos dispositivos** — lo único del bloque de agosto que no se ejercitó: tablet + celular, y el eco de realtime al tildar/destildar rápido.
- `mcp-index.js`, `mcp-sdk-client.js`, `mcp-stdio.js`, dos `.tgz` en la raíz y `.claude/settings.json` sin commitear — **cuatro sesiones esperando** que Facundo decida: repo, `.gitignore` o borrar. Ya está anotado en `PENDIENTES.md` para que deje de ser invisible.

## Probar primero mañana
Colgar `/muro` en la tablet de la cocina y hacer una sola pasada que cubra todo lo pendiente de verificación:
1. Dejarla prendida sin tocar un rato largo → que no se apague (wake lock).
2. Escribir una nota de plaza desde el Mise → tiene que aparecer sola en el muro, legible a dos metros.
3. Entregar una plaza de verdad → confirmar la franja de entregas del muro **y** que en Producción lo terminado se pliegue.
4. Si se puede, mirar el cruce de las 05:00 (muro y plegado, los dos).

## Próximo paso concreto
Si el muro sale limpio: F4 (`MURO-PLAN.md` — hipótesis a validar después de una semana de uso, no pendientes fijos) o el 🟠 de `PENDIENTES.md`. Si algo falla en tablet, eso es lo primero, antes que cualquier otra cosa.
