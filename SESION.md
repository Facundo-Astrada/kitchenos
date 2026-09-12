# Sesión — 12/09/2026

## Qué se cerró
- **Kitchen Coach** (auditoría completa a pedido de Facundo): `buscar_receta`
  estaba rota del todo (pedía `recetas.food_cost`, columna inexistente, error
  tragado en silencio) y elegía el duplicado vacío entre homónimas. Búsqueda
  normalizada sin tildes, por nombre Y categoría, para todas las tools.
  Tool nueva `composicion_plato` (qué recetas + gramaje componen un plato).
  Tools de solo lectura nuevas: `consultar_agenda`, `consultar_haccp`,
  `consultar_turnos`. `crear_evento` ahora setea `plaza` por paso. Accesos
  directos desde el chat armados por el server (nunca por el modelo). 6
  commits: `6dcbffe`, `47a6ea6`, `f107eeb`, `3629c1a` + docs.
- **Carta/Recetario**: tercer camino para crear una receta sin salir de un
  plato — "Crear receta acá mismo" abre `RecetaEditSheet` vacío de una, sin
  pasar por foto/texto IA. `RecetaEditSheet` ahora también edita
  `procedimiento` (antes solo ingredientes) y el import IA ahí adentro dejó
  de descartarlo. Subreceta usada como ingrediente de otra receta pasa a
  costear por peso real (`peso_escurrido_g` > `peso_total_g` > estimado) en
  vez de "una porción entera del batch" — unificado entre
  `CargaRapidaIngredientes` y la ficha de Recetario, que tenían cada una su
  propia fórmula (la de Recetario ignoraba el peso cargado a mano). El
  preview de una receta ya vinculada a un plato/menú dejó de ser un
  callejón sin salida cuando tenía ingredientes — siempre ofrece "Editar
  receta". Bug real de UI: `overflow:hidden` en `CargaRapidaIngredientes`
  recortaba el desplegable de sugerencias en la última/única fila (el caso
  común al crear una receta desde cero). 4 commits: `126e957`, `57332fc`,
  `a321635`, `e33c448`.
- Los dos hilos corrieron en paralelo (sesiones distintas) y coexisten sin
  conflicto — typecheck + 536 tests verdes con todo mezclado, build limpio.
- Docs actualizados: `ESTADO-ACTUAL.md` (filas 3 Recetario, 8 Carta, 20
  Coach), `columnas.md` (food_cost inexistente en `recetas`; prioridad
  `peso_escurrido_g`>`peso_total_g` para costeo), `hooks.md` (gotcha
  `'use client'`→server + sección Coach reescrita), `ui.md` (gotcha
  dropdown recortado por `overflow:hidden` del contenedor), `PENDIENTES.md`
  podado (candado de Producción resuelto) y corregido (4 commits, no 3).

## Qué quedó a medias
Nada — los dos hilos se cerraron completos y verificados antes de parar.

## Probar primero mañana
- Coach en prod: ficha de mbeju, "¿cuánta carne hay?", temperatura de
  cocción del cerdo, evento nuevo pidiendo plaza por paso.
- `composicion_plato` con una cuenta que no sea Bros (ahí se creó la
  mayoría del contenido de prueba).
- Carta: crear un plato nuevo, tipear un ingrediente que exista en stock
  (ej. "aceite") y confirmar que aparece el desplegable; agregar una
  subreceta como ingrediente y confirmar que pide gramos, no porciones.

## Próximo paso concreto
Sin tema abierto — retomar de `PENDIENTES.md` según prioridad. Dos ítems de
Coach sin urgencia: memoria cross-device (`coach_conversaciones` + RLS,
migración de esquema) y Coach escribiendo en Carta
(`agregar_componentes_menu`, releer los 4 commits de Carta del 12/09 antes
de tocar `ComposicionEditor`/`RecetaEditSheet`). Fuera de eso, lo prioritario
según `PENDIENTES.md` es la sección 🟠 Alto.
