# Sesión — 19/09/2026

## Qué se cerró
- **Ficha del puesto** (`FichaPuesto.tsx`, commit `b69403e`, en prod): el detalle de un puesto pasó de tarjetas sueltas a una pantalla CV + tablero. Dueño: un lápiz por sección que abre la tanda del cuestionario. Cocinero: la misma ficha en lectura desde Perfil → **Mi puesto** (`/perfil/puesto`).
- **Formación por plaza (opción A)**: nivel de cada ocupante en la plaza del puesto + padrino opcional (`competencias.ensena_miembro_id`, migración aplicada a prod; null = el referente de la plaza).
- Decisiones de Facundo: dirección visual del mockup, formación A (no por tarea), entrada del cocinero desde Perfil.

## Qué quedó a medias
- El camino **"puesto con plaza"** (Cobertura, "A quién le preguntan", `<select>` "Le enseña") no se vio en navegador: El Rescoldo no tiene puestos con plaza y no hay credenciales de dueño de Bros. Build/lint/typecheck limpios; lo demás se capturó.

## Probar primero mañana
- Con la cuenta de dueño de Bros: Organigrama → Puestos → **Parrillero** (único con plaza). Revisar la ficha y asignar un "Le enseña" a alguien en formación.
- Tablet de Bros (`cocina@broscomedor.com`): Perfil → Mi puesto.

## Próximo paso concreto
- La condición de salida de la decisión 014 sigue corriendo: **0 descripciones vigentes en Bros** (vence ~02/10). La ficha ahora muestra el documento: el próximo paso es que Franco complete al menos Parrillero.
- Formación por tarea (opción B) y valores vivos de los indicadores quedan en `PENDIENTES.md`; B necesita decisión de moratoria antes de código.
