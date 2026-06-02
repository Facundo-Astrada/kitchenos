---
name: update-status
description: Cierra la sesión de trabajo actualizando PENDIENTES.md, ESTADO-ACTUAL.md y capturando aprendizajes nuevos en .claude/docs/. Usar al final de cada sesión para mantener la memoria del proyecto actualizada.
---

Al final de la sesión de trabajo en KitchenOS, hacer lo siguiente:

## 1. Preguntarle a Facundo qué se resolvió

"¿Qué bugs o features cerramos en esta sesión? Decime los números del PENDIENTES.md o describí qué hicimos."

## 2. Actualizar PENDIENTES.md

- Mover los ítems resueltos a la tabla ✅ Resuelto con la fecha de hoy
- Renumerar si hace falta para que quede prolijo
- Si surgió algún bug nuevo durante la sesión, agregarlo en la sección 🔴 Crítico

## 3. Actualizar ESTADO-ACTUAL.md §4 "Implementado en últimas sesiones"

Agregar una entrada con:
```
### Sesión [fecha] — [descripción breve]
- [lista de lo que se hizo]
```

## 4. Capturar aprendizajes nuevos

Si durante la sesión se descubrió algo importante sobre:
- Una columna con nombre raro → agregar a `.claude/docs/columnas.md`
- Un patrón de código que funciona o no funciona → agregar a `.claude/docs/hooks.md`
- Una regla de UI nueva → agregar a `.claude/docs/ui.md`
- Un endpoint nuevo o comportamiento del importador → agregar a `.claude/docs/importador.md`

## 5. Verificar calidad de CLAUDE.md

Chequear que CLAUDE.md sigue siendo lean (no más de 110 líneas). Si alguien agregó contenido detallado directo al CLAUDE.md en vez de a `.claude/docs/`, moverlo al archivo correcto.

## 6. Confirmar

Reportar a Facundo:
- Qué se marcó como resuelto
- Qué se agregó a los docs
- Si CLAUDE.md está en buen estado
- Cuál es el próximo ítem prioritario del PENDIENTES.md
