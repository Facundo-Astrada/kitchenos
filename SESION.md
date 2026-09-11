# Sesión — 2026-09-11 (noche, desatendida)

Sesión corrida sola mientras Facundo dormía, con cola aprobada de antemano.
7 commits (`a191798`…`5c2a493`), cada uno con typecheck + Vitest + build verdes
antes de pushear. 441 tests al arrancar, **504 al cerrar**. Producción verificada
después de los 7 deploys: health OK, app respondiendo.

## Qué se cerró
- **Algo avisa cuando producción se rompe** (`a191798`). `/api/cron/health`,
  diario. El canal de alerta es el código HTTP: devuelve **503** si algo está
  roto, así la corrida fallida se ve en Vercel sin que nadie abra un dashboard.
  Revisa claves (falta / cruzada / sucia), el handshake del realtime y la base.
  El handshake se mide con un GET pelado: verificado contra el proyecto real que
  `/realtime/v1/websocket` da **500 con clave válida** y **401 con inválida**.
- **Reconocimiento semanal corriendo solo** (`89b6d1a`), en **modo seco**.
  No se portó `fetchRuta` al servidor (dos trampas: `ingredientes` no tiene
  `restaurante_id` y el admin client sumaría todos los tenants; y el árbol de la
  carta vive en un módulo `'use client'`). En vez: la foto la escribe el cliente
  (tabla `implantacion_progreso`), el cron solo lee y resta.
- **Inserts de tareas endurecidos** contra el candado (`c0f7d6a`).
  `lib/ops/insertarTareas.ts` reintenta fila por fila si el lote choca.
- **Un rol desconocido ya no tira la navegación abajo** (`871b328`).
- **`PENDIENTES.md` podado de 38,6 KB a 17,9 KB** (`4fe1c45`), como mudanza:
  el archivo completo quedó archivado en `HISTORIAL.md`. 36/36 secciones
  verificadas programáticamente.
- **Bug real encontrado corriendo la app** (`a55b8dc`): `fetchRuta` pedía
  `restaurantes.tipo`, columna que **no existe** → 400 en cada carga de
  `/implantacion`, `rest` null, y el subtítulo "Día N de la implantación"
  **nunca se mostró desde que existe la pantalla**. Arreglado y verificado:
  antes 1 request fallida y sin día, después 0 fallidas y "DÍA 176".
- **22 tests de lógica pura** de `useStock` y `useEquipo` (`5c2a493`).

## Lo que te toca a vos (tres cosas, ninguna es código)
1. **El SQL del candado espera aprobación.** `supabase/migrations/pendientes/` —
   leer `CANDADO_TAREAS_LEER_ANTES.md`. **Hay 14 grupos duplicados en prod hoy
   (16 filas, peor caso 4 gemelas)**: el `CREATE UNIQUE INDEX` falla hasta
   limpiarlos, un paso que el plan original no contemplaba. El DELETE no se
   escribió a propósito. Va **fuera de servicio**: toma `ACCESS EXCLUSIVE`.
2. **Prender los avisos**, cuando quieras: `AVISOS_ACTIVOS=1` en Vercel + la
   entrada del cron en `vercel.json`. Hoy corre en seco. Mirá una corrida seca
   antes (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/avisos`).
3. **Limpiar la anon key en el dashboard de Vercel.** El health-check lo
   confirmó contra producción: **sigue sucia**. Hoy la salva el `.trim()` de
   `env.ts`, pero cualquier lectura que no pase por el helper reintroduce el bug
   del realtime caído.

## Qué quedó a medias / sin hacer
- **`coach-screen` sobre el tab Turno: saltado.** Necesita anclas visuales
  (`data-coach-target`) que no se pueden ubicar sin ver la pantalla.
- **Policies fiscales: NO se hacen, y el ítem estaba mal planteado.**
  `fiscal_config` guarda `key_pem` — la clave privada de AFIP. El "arreglo" que
  pedía el backlog habría abierto un agujero real. Documentado en
  `FISCAL_RLS_NO_ES_LO_QUE_PARECE.md` + regla nueva en `rls.md`.
- **El Coach no se tocó** más allá de lo anterior.

## Probar primero mañana
- **Mirar `/implantacion` en pantalla**: ahora debería decir "DÍA N DE LA
  IMPLANTACIÓN" en el header (estuvo muerto desde siempre). Verificado con
  Playwright contra El Rescoldo, pero no por ojo humano.
- **El Rescoldo marca 1 de 34 (3%)** pese a estar seedeado en todos los módulos.
  **No es un bug nuevo**: los umbrales piden actividad *sostenida* (3 semanas
  seguidas de facturas, 5 días seguidos de pase), no datos cargados. Es
  exactamente el ítem 4 de la ruta ("nadie la verificó contra datos reales").
  Ahora hay una medición para ajustarlos.
- El sidebar con una cuenta no-admin, tras el cambio de `mapRol`.

## Próximo paso concreto
- Si querés cerrar lo de esta noche: el **candado** (🔴 en `PENDIENTES.md`) —
  limpiar los 14 grupos y correr el SQL fuera de servicio.
- Si arrancás tema nuevo: `producto_id` en `plato_recetas` (quedó declarado como
  límite el 10/09, toca schema+costeo+editor+mise, sesión propia).
