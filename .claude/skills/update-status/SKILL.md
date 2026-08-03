---
name: update-status
description: Cierra la sesión de trabajo en KitchenOS deduciendo del historial de la sesión y de git lo que se resolvió, podando PENDIENTES.md y ESTADO-ACTUAL.md en vez de acumular, y dejando SESION.md para la continuidad de mañana.
---

Al final de la sesión de trabajo en KitchenOS, en este orden:

## 1. Deducir qué se cerró — sin preguntar

No preguntes "¿qué cerramos?". Miralo vos:
- Revisá el historial de esta conversación: qué se implementó, qué bugs se arreglaron.
- Corré `git log --oneline` desde el último commit `docs:` (o los últimos commits de la sesión si no hay uno) para ver qué se commiteó.
- Cruzá contra `PENDIENTES.md`: qué ítems abiertos quedaron resueltos por el trabajo de hoy.

Preguntá a Facundo **solo si hay ambigüedad real** (ej. un commit que no se corresponde claramente con ningún ítem del backlog, o dudas sobre si algo quedó a medias).

## 2. Podar PENDIENTES.md

- Lo resuelto **se borra** de `PENDIENTES.md` y se mueve a `HISTORIAL.md` (sección "Pendientes resueltos"), con la fecha de hoy. Nunca queda acumulado ahí.
- Si surgió un bug nuevo durante la sesión, agregarlo en 🔴 Crítico o donde corresponda por prioridad.
- El archivo debe quedar liviano (ítems abiertos, priorizados) — si supera ~10KB, es señal de que algo debería podarse también.

## 3. Podar ESTADO-ACTUAL.md

Es una foto del presente, no un changelog: para el módulo que cambió hoy, actualizar su resumen a 1-3 líneas reflejando el estado nuevo — no agregar una entrada fechada de "Sesión X". El detalle verboso de qué se hizo hoy (si vale la pena preservarlo) va a `HISTORIAL.md`, no a `ESTADO-ACTUAL.md`.

## 4. Actualizar `.claude/docs/`

Si se descubrió algo importante y reutilizable (columna con nombre raro, patrón de hook, regla de UI, comportamiento del importador): **reescribí la regla existente si cambió** — no apiles una entrada numerada nueva ni le pongas fecha/nombre de sesión. Si es una regla nueva de verdad, agregala en 2-3 líneas atemporales, mismo estilo que el resto del archivo (`hooks.md`, `columnas.md`, `ui.md`, `importador.md`, `rls.md`).

## 5. Verificar CLAUDE.md

Confirmá que sigue lean (sin @includes incondicionales de los docs grandes, sin contenido detallado que debería vivir en `.claude/docs/`). Si alguien agregó algo pesado directo ahí, moverlo.

## 6. Escribir `SESION.md` — último paso obligatorio

Sobrescribir `SESION.md` (~10 líneas, no acumular versiones viejas) con:
```
# Sesión — [fecha de hoy]

## Qué se cerró
- ...

## Qué quedó a medias
- ...

## Probar primero mañana
- ...

## Próximo paso concreto
- ...
```

## 7. Confirmar a Facundo

Reportar en pocas líneas: qué se marcó resuelto, qué se agregó/reescribió en docs, y cuál es el próximo ítem prioritario según `SESION.md`.
