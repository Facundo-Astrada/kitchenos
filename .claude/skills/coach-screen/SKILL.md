---
name: coach-screen
description: Integra Kitchen Coach completo en una pantalla de KitchenOS, con el nivel de detalle del módulo OPS (screen context con insights, data-coach-target, tour, suggestions, funciones explicadas y acciones). Usar cuando se quiere que el Coach entienda, explique y opere sobre una pantalla nueva.
argument-hint: "nombre de la pantalla (ej: stock, recetario, proveedores, pase)"
---

Integrar **Kitchen Coach** en la pantalla `$ARGUMENTS` de KitchenOS llevándola al nivel del módulo OPS (el más desarrollado). El objetivo no es solo que el Coach "ilumine botones": es que **entienda** la pantalla (datos), la **explique** (funciones) y pueda **operar** sobre ella (acciones).

## Antes de escribir nada — reconocer la pantalla

1. Leer la page de la pantalla: `app/(app)/$ARGUMENTS/page.tsx` (o `ClientView.tsx`). Identificar:
   - Los datos que ya tiene cargados (hooks, `useMemo` con stats, conteos).
   - Los **elementos accionables clave** (tabs, FAB, filtros, botón importar, listas, KPIs).
   - Los sub-tabs si los hay (definen `requireTab` en el tour).
2. Verificar columnas reales con `/supabase-check` antes de armar el screen_context si vas a derivar insights nuevos.
3. Mirar los dos modelos de referencia ya hechos:
   - **Carta** = gold standard de `kc_screen_context` con insights → [carta/page.tsx:2780](../../../app/(app)/carta/page.tsx#L2780)
   - **OPS** = gold standard de tour + targets + welcome → [operaciones/page.tsx:601](../../../app/(app)/operaciones/page.tsx#L601) y [KitchenCoachFAB.tsx:21](../../../components/coach/KitchenCoachFAB.tsx#L21)

## La skill produce 6 entregables

### 1. `kc_screen_context` — INSIGHTS, no conteos

En la page, en un `useEffect` que dependa de los datos, escribir el contexto y limpiarlo al desmontar. **Regla de oro: el Coach no necesita saber "cuántos hay", necesita saber "qué está mal y qué falta".** Seguir el patrón Carta:

```tsx
useEffect(() => {
  // derivar insights accionables, NO solo .length
  const problemas = items.filter(/* condición de riesgo */).slice(0, 5)
  localStorage.setItem('kc_screen_context', JSON.stringify({
    screen: '$ARGUMENTS',
    total: items.length,
    // top-N de lo que requiere acción, con nombre + número:
    problemas: problemas.map(p => ({ nombre: p.nombre, valor: p.valor })),
    faltantes: /* lo que falta completar/vincular */,
    promedios: /* KPIs del período */,
    // si la pantalla tiene tabs, incluir el activo:
    ...(tab ? { tab } : {}),
  }))
  return () => localStorage.removeItem('kc_screen_context')
}, [/* deps de datos */])
```

Mal: `{ screen: 'stock', total: 120 }` · Bien: `{ screen: 'stock', criticos: [{nombre:'Crema',cantidad:2,minimo:10}], aReponer: 8 }`

### 2. `data-coach-target` en 5-8 elementos clave + alta en el catálogo

- Convención de id: **`<pantalla>-<elemento>`** (ej. `stock-fab-add`, `stock-criticos`, `stock-filtros`, `recetario-tab-ideas`).
- Etiquetar tabs, FAB, filtros, KPIs y la lista principal con `data-coach-target="..."`.
- Dar de alta esos ids en `COACH_HIGHLIGHT_IDS` en [useKitchenCoach.ts:20](../../../lib/hooks/useKitchenCoach.ts#L20), bajo un comentario de sección con el nombre de la pantalla.

### 3. Entradas en `SUGGESTIONS_BY_SCREEN`

En [KitchenCoachFAB.tsx:97](../../../components/coach/KitchenCoachFAB.tsx#L97), agregar 3-4 chips que un **cocinero o encargado realmente preguntaría** parado en esa pantalla. Acciones: `'send'` (manda la pregunta) o `'tour'` (lanza el recorrido). Ejemplo bueno (facturas): "¿Qué proveedores me subieron más los precios?" — concreto, accionable, con la jerga del rubro.

### 4. Pasos de tour (si la pantalla lo amerita)

Agregar los pasos en el **registry** `TOURS` en [lib/coach/tours.ts](../../../lib/coach/tours.ts) bajo la clave `screen` (ej. `TOURS.stock`). El motor es data-driven: el FAB lee la pantalla activa desde `kc_screen_context.screen` y carga los pasos correspondientes. Cada paso: `{ targetId, requireTab?: string, title, description }`. Si la pantalla tiene tabs, usar `requireTab` para que el tour cambie de tab solo **y** agregar un listener `kc-set-tab` en la page (patrón: ver [operaciones/page.tsx:612](../../../app/(app)/operaciones/page.tsx#L612) y [stock/ClientView.tsx](../../../app/(app)/stock/ClientView.tsx)). Las descripciones explican **para qué sirve y cuándo usarlo**, no solo qué es. Cerrar siempre con `{ targetId: null, title: '¡Ya conocés X!', description: '...' }`. Agregar también chip `{ label: 'Ver recorrido de X', action: 'tour' }` en `SUGGESTIONS_BY_SCREEN`.

### 5. Bloque de prompt con ejemplos de highlight específicos

El system prompt del hook ([useKitchenCoach.ts:110](../../../lib/hooks/useKitchenCoach.ts#L110)) lleva ejemplos por pantalla del formato JSON `{text, highlight, overlay_text, options}`. Agregar 1-2 ejemplos representativos de la pantalla nueva (como ya existen para OPS y Carta), para que la IA aprenda a iluminar bien. `overlay_text` ≤ 12 palabras.

### 6. "Funciones explicadas" — base de conocimiento de la pantalla

Documentar en prosa (estilo OPS, ver TOUR_STEPS) **qué hace cada función clave de la pantalla** en español rioplatense del rubro: mise en place, plaza, merma, food cost, 86, pase. Esto es el guion que el Coach usa para explicar. Va embebido en el tour (descriptions) y, para temas que exceden el tour, como ejemplos en el prompt.

## Visión guía + datos + acciones (target del sistema)

La integración de cada pantalla debe declarar, además de lo visual:

- **DATOS que el Coach necesita server-side** (M1): qué consultaría en Supabase para dar consejos con números reales (no solo lo que el cliente mandó). Anotarlo como TODO en [api/coach/route.ts](../../../app/api/coach/route.ts) — hoy la API recibe `restauranteId` pero **no consulta la DB**; esta es la palanca para volver al Coach un asesor real.
- **ACCIONES que el Coach puede ofrecer** (M5): qué puede *hacer* desde esa pantalla (registrar merma ya existe como botón en el panel → modelo a volver tool). Listar las acciones candidatas (ej. en stock: "marcar para reponer"; en carta: "marcar 86"; en tareas: "crear tarea").

## Convenciones inamovibles

- **Color del Coach: `#f97316`** (naranja). Todo overlay, FAB y chip del Coach usa este color, no `var(--accent)`.
- Iconos Material Symbols (`chef_hat`, `restaurant`, `tour`). Nunca emoji.
- Español argentino del rubro. Texto plano en respuestas (el prompt prohíbe markdown/asteriscos).
- `overlay_text` muy corto; `description` de tour explica el *para qué*.
- El FAB es global (está en [layout.tsx](../../../app/(app)/layout.tsx#L114)) — no agregar otro FAB por pantalla.

## Cierre

Tras integrar: `npm run build` para verificar TypeScript, y probar el tour + un par de preguntas con highlight en la pantalla. Actualizar `ESTADO-ACTUAL.md` con la pantalla cubierta (sección Coach contextual).
