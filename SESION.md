# Sesión — 2026-09-07/08

## Qué se cerró
- **Ruta de implantación completa, del pizarrón al código en el día.** Plan investigado
  (`PLAN-IMPLANTACION-2026-09.md`, 7 hitos / 31 estaciones) + los 6 bloques ejecutados.
  7 commits (`821dd4b`…`257dc55`), deployados — Vercel `success`, prod 08/09 00:01.
- **Organigrama → Polivalencia** (tab nuevo): matriz persona × plaza × nivel 0-4, con lectura
  de riesgo por plaza. Tabla `competencias`. Aprobada por decisión de negocio **013**.
- **`/lineup`**: la ficha que se lee en voz alta antes del servicio. Cero schema nuevo.
- **`/implantacion`**: el medidor de organización — el % lo mueve el **uso**, no la carga.
- **Huecos del modelo**: dueño único por módulo (`modulosUsa` nuevo), 4 módulos huérfanos
  adoptados, `PUESTO_TEMPLATES` de 8 (todas de cocina) a 14, `responsable.ts`.
- 370 tests (76 nuevos), lint limpio en lo nuevo, build OK.

## Qué quedó a medias
- **No hay scheduler**: el aviso se dispara a mano; el reconocimiento semanal está escrito y
  testeado pero sin cablear. Es el mismo agujero que "nada avisa cuando producción se rompe".
- **Push real**: `sw.js` sigue sin handler de `push` (ver ítem Notificaciones en `PENDIENTES.md`).
- **`/onboarding` sigue vivo** conviviendo con la cordillera (estrangulamiento, a propósito).
- **Los umbrales de inserción son criterio, no medición** (3 semanas de facturas, 5 días de pase).

## Probar primero mañana
- **Nada de esto se abrió en un navegador contra producción.** Ese es el paso 1, en este orden:
  Organigrama → Polivalencia · `/lineup` · `/implantacion` · la tira ámbar del Inicio.
- Ojo con `/implantacion` en una cuenta grande: son ~30 counts en paralelo.

## Próximo paso concreto
1. Abrir las 4 pantallas en prod (`admin@elrescoldo.com`) y confirmar que no explotan.
2. Mirar el % real de El Rescoldo y de Bros → **recalibrar los umbrales de inserción**.
3. Cargar la matriz de polivalencia de un local real: sin eso no hay referentes.
4. Facundo tiene que revisar dos decisiones mías: qué área es dueña de `recetario`,
   `configuracion` y `facturas`; y que Administración quedó sin módulos propios.
