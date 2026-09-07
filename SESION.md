# Sesión — 2026-09-07 (segunda del día: diseño, sin código)

## Qué se cerró
Sesión de diseño pura — **no se tocó una línea de código de la app**. Facundo trajo una foto de un
pizarrón con su lluvia de ideas sobre cómo entra K-OS en un restaurante, con una pregunta circulada
en el medio: **¿quién cubre cada función en la app?**

Salió un plan completo: **`PLAN-IMPLANTACION-2026-09.md`** (ruta de 7 hitos / 31 estaciones, cada
una con responsable, referente, dos checkpoints y qué costumbre vieja apaga).
Versión visual navegable: https://claude.ai/code/artifact/3a5be79b-8dcf-4d50-b747-7a865082c9e8

Se hizo en tres pasadas:
1. **Lectura del pizarrón** y separación de las tres cosas que mezclaba (implantación del
   restaurante / capacitación de la persona / adopción sostenida).
2. **Análisis del código real** — de ahí salieron los 6 huecos, todos verificados contra archivo y
   línea, no inferidos.
3. **Investigación web** (9 búsquedas + lectura profunda): equipos de alto rendimiento, liderazgo y
   burnout en cocina, adopción de tecnología en restaurantes, formación de hábito, matriz de
   polivalencia, organigrama gastronómico, reconocimiento y rankings, line-up, ratios de personal.
   Cambió cinco cosas del diseño (§ 5 del plan).

**El hallazgo que más importa:** la cadena `módulo → área → responsable` **ya está construida**
(`AREA_CATALOGO` en `lib/constants.ts:300` + el tab Cobertura de Organigrama) y no la consulta
nadie. La pregunta del pizarrón está medio resuelta en el repo hace meses.

## Qué quedó a medias
Nada a medias — el plan está entero. Pero hay **una decisión de negocio pendiente que bloquea una
pieza**: la matriz de polivalencia (hueco 5) es superficie nueva y cae bajo la moratoria de módulos
(`negocio.md` § 7, decisión 012). Si se aprueba hay que escribirla primero en
`~/Desktop/START UP KOS/00-decisiones/DECISIONES.md`. Todo lo demás del plan se puede ejecutar sin
decisiones pendientes.

## Documentos tocados
- **Nuevo:** `PLAN-IMPLANTACION-2026-09.md`
- `DECISIONES.md` → **§ 25** (la ruta mide al restaurante nunca a la persona + responsable ≠
  referente + "qué se apaga" + cadencias de aviso)
- `PENDIENTES.md` → 🟠 Alto: los 6 huecos, la ficha de line-up, el estado real de notificaciones
- `CLAUDE.md` → fila nueva en la tabla de docs condicionales
- `ESTADO-ACTUAL.md` → fila 18 (Auth): el onboarding actual está diseñado para ser reemplazado

## Próximo paso concreto
**Bloque A del plan (§ 7): tapar los huecos 1, 2 y 3.** Son horas, no días, no necesitan ninguna
decisión y desbloquean todo lo demás:
1. Asignar área a los 4 módulos huérfanos en `AREA_CATALOGO` (`lib/constants.ts:300`) —
   `presupuesto`→`direccion`, `organigrama`/`turnos`→`rrhh`, `tareas`→`cocina`.
2. Declarar área dueña vs. usuarias en los 5 módulos que hoy están en dos áreas.
3. Escribir las ~6 `PUESTO_TEMPLATES` que faltan fuera de cocina (`lib/hooks/useEquipo.ts:196`):
   Dueño, Encargado de compras, Encargado de salón, Mozo, Responsable de calidad, Administración.

Después de eso, **bloque B: la ficha de line-up** — cero schema, compone datos que ya existen, y es
el mayor retorno por línea de código de todo el plan.
