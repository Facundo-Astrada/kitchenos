# Sesión — 2026-09-07 (segunda del día: pizarrón → investigación → ruta de implantación entera)

## Qué se cerró
Empezó como una foto de un pizarrón de Facundo con la pregunta circulada **"¿quién cubre cada
función en la app?"** y terminó con el plan diseñado, investigado, escrito y **ejecutado entero**
en el mismo día.

**Plan:** `PLAN-IMPLANTACION-2026-09.md` (7 hitos, 31 estaciones).
**Visual:** https://claude.ai/code/artifact/3a5be79b-8dcf-4d50-b747-7a865082c9e8

### El hallazgo que ordenó todo
La cadena `módulo → área → responsable` **ya estaba construida** (`AREA_CATALOGO` en
`lib/constants.ts` + el tab Cobertura de Organigrama) y **no la consultaba nadie**. Media
respuesta a la pregunta del pizarrón llevaba meses en el repo sin conectar.

### Lo que aportó la investigación (9 búsquedas, ver § 8 del plan)
1. **Cada estación necesita dos personas.** El responsable se designa (Cobertura); el
   **referente** se detecta y casi nunca es el jefe — la gente le pregunta a un par de
   confianza antes que a soporte.
2. **"Qué se apaga"** como definición de adoptado: K-OS compite contra el pizarrón, el
   cuaderno y el audio de WhatsApp, no contra otra app.
3. **La matriz de polivalencia** (herramienta que los chefs ya conocen) convierte el tutorial
   binario en una escala y produce los referentes sola.
4. **El line-up**: no inventar un ritual, apropiarse del que ya existe. Fue la pieza de mayor
   retorno de todo el plan.
5. **Las cadencias son asimétricas**: recordatorio diario, reconocimiento semanal — el
   reconocimiento diario baja 12% la confianza en la dirección.

### Lo que se construyó (6 commits, todo deployado)
- `a752498` — huecos 1-4: dueño único por módulo (`modulosUsa` nuevo), 4 módulos huérfanos
  adoptados, 6 plantillas de puesto fuera de cocina, `lib/organigrama/responsable.ts`.
- `0d723c9` — matriz de polivalencia: tabla `competencias`, `useCompetencias`, tab nuevo en
  Organigrama con lectura de **riesgo por plaza**.
- `f78ef5f` — ficha de line-up: `lib/ops/lineup.ts` + `useLineUp` + `/lineup` + strip en el
  Dashboard. Cero schema nuevo.
- `a7b6458` — la ruta como dato (`lib/implantacion/ruta.ts`, 31 estaciones declarativas) y la
  cordillera (`/implantacion`), con el % que **solo mueve la inserción, no la carga**.
- `e7535a6` — avisos al responsable con las dos cadencias separadas.
- Docs: `DECISIONES.md` § 25, decisión de negocio **013** en `~/Desktop/START UP KOS/`
  (excepción nombrada a la moratoria 012), `CLAUDE.md`, `PENDIENTES.md`, `ESTADO-ACTUAL.md`,
  `.claude/docs/negocio.md`.

**370 tests (76 nuevos), lint limpio en todo lo nuevo, build OK.**

## Errores reales que encontraron los tests, no yo
- El **arqueo de caja** estaba modelado en `ventas`, que es un mirador — y los miradores no se
  cargan. Vive en `salon`.
- `useRutaImplantacion` llamaba **`Date.now()` dentro de un `useMemo`**: función impura en
  render, distinta en cada re-render. Lo agarró el lint; el cálculo se movió al fetcher.
- El 5º módulo duplicado entre áreas era **`reportes`**, no `calendario` como decía el análisis
  inicial. Corregido en el plan.

## Qué quedó a medias
Nada roto, pero sí **cinco cosas explícitamente afuera** (detalle en `PENDIENTES.md` 🟠):
1. **No hay scheduler** — el aviso se dispara a mano; el reconocimiento semanal está escrito y
   testeado pero no cableado.
2. **No hay push real** — `public/sw.js` sigue sin handler de `push`.
3. **`/onboarding` sigue vivo** — convive con la cordillera a propósito (estrangulamiento).
4. **Tres checkpoints se confirman a mano** (sin estandarizar, line-up leído, estación 5.5).
5. **Los umbrales de inserción no están validados contra datos reales.**

## Probar primero mañana
**Nada de esto se probó con un navegador contra producción.** Está typechequeado, testeado
(370) y buildeado, pero las cuatro pantallas nuevas o tocadas —Organigrama → Polivalencia,
`/lineup`, `/implantacion`, y la tira del Dashboard— **no las vio nadie funcionando**. Ese es el
primer paso de mañana, en ese orden.

Ojo con `/implantacion` en una cuenta con muchos datos: son ~30 counts en paralelo.

## Próximo paso concreto
1. Abrir las cuatro pantallas en prod (`admin@elrescoldo.com`) y mirar que no exploten.
2. **Mirar el % real de El Rescoldo y de Bros** y decidir si los umbrales de inserción están
   bien calibrados — hoy son criterio, no medición.
3. Cargar la matriz de polivalencia de un local real: es lo único que no tiene dato sembrado y
   sin ella no hay referentes.
