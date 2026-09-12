# Sesión — 12/09/2026

## Qué se cerró
- Kitchen Coach, a pedido de Facundo tras notar que contestaba peor que este
  chat: auditoría completa del pipeline + arreglos medidos contra la base real
  (Bros), no deducidos. `buscar_receta` estaba **rota del todo** — pedía
  `recetas.food_cost` (columna inexistente) y el error se tragaba en silencio,
  así que contestaba "no encontré nada" a cualquier consulta. Elegía además el
  duplicado vacío entre homónimas ("Mbejú" x2 en Bros).
- Búsqueda normalizada para todas las tools (`lib/coach/busqueda.ts` +
  `catalogo.ts`, 26 tests): sin tildes, por nombre Y categoría, tolera plural.
  Antes "carne" solo miraba el nombre del producto e ignoraba la categoría
  Carnes (47 productos invisibles en Bros).
- Tool nueva `composicion_plato`: qué recetas componen un plato de la carta y
  el gramaje de cada una (`plato_recetas.gramaje`), encontrable por sus
  componentes ("el de gírgolas" llega a un plato que se llama distinto).
- Tools nuevas de solo lectura: `consultar_agenda`, `consultar_haccp`,
  `consultar_turnos` — antes esos datos solo llegaban si la pantalla activa
  los publicaba; desde `/coach` no había con qué contestarlos.
- `crear_evento` ahora setea `plaza` por paso cuando el usuario la dice (antes
  siempre NULL; `prioridad` ya llegaba bien por default de columna, verificado
  contra datos reales — el ítem de PENDIENTES estaba parcialmente errado).
- Accesos directos desde el chat (botón que navega a `/recetario/[id]` o
  `/carta?plato=[id]`), armados por el server con el id ya resuelto — nunca
  por el modelo, porque el texto se pinta plano sin markdown.
- Prompt: autoriza conocimiento gastronómico general (temperaturas de cocción)
  sin derivar a HACCP; techo de razonamiento subido (`max_tokens` 1024→2048,
  4→6 rondas de tool).
- Gotcha real encontrado: `calcFoodCost` vivía en un hook `'use client'` y una
  API route lo importaba — build pasa, explota solo en runtime de prod. Se
  extrajo a `lib/recetas/costo.ts` (documentado en `hooks.md`).
- 6 commits pusheados y en prod: `6dcbffe`, `47a6ea6`, `f107eeb`, `3629c1a` +
  docs de esta skill.
- Docs actualizados: `columnas.md` (fila `recetas` sin food_cost), `hooks.md`
  (gotcha `'use client'`→server, sección Coach reescrita con las tools reales
  y el patrón de búsqueda), `ESTADO-ACTUAL.md` (filas 3/8/20).

## Qué quedó a medias
- Nada del propio Coach — cada fix se verificó contra Bros antes de cerrar.
- **Trabajo en paralelo de otra sesión** (no mío, ya en prod): 4 commits sobre
  Carta/Recetario — crear receta al vuelo con procedimiento en
  `RecetaEditSheet`, fix de dropdown de sugerencias tapado, subreceta-como-
  ingrediente costea por gramaje real (no por porción del batch), preview de
  receta vinculada ahora siempre editable. Coexiste sin conflicto (verificado:
  typecheck + 536 tests verdes con todo mezclado), reflejado en
  `ESTADO-ACTUAL.md`.

## Probar primero mañana
- En prod, las cuatro preguntas que motivaron la sesión: ficha de mbeju,
  "¿cuánta carne hay?", temperatura de cocción del cerdo, y un evento nuevo
  pidiendo que un paso vaya a una plaza puntual.
- `composicion_plato` con otra cuenta que no sea Bros (ahí es donde más se creó
  contenido de prueba; confirmar que no asume nada específico de esa cuenta).

## Próximo paso concreto
Dos ítems del Coach siguen abiertos en `PENDIENTES.md`, ninguno urgente:
1. **Memoria cross-device** (`coach_conversaciones` + RLS) — migración de
   esquema, mejor con cabeza fresca.
2. **Coach escribiendo en Carta** (`agregar_componentes_menu`) — releer los 3
   commits del 12/09 sobre `ComposicionEditor`/`RecetaEditSheet` antes de
   tocar esa zona, no asumir la forma de hace una semana.

Sin tema abierto más allá de eso — retomar de `PENDIENTES.md` según prioridad.
