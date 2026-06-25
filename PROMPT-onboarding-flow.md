# Prompt — Rediseño del flujo de onboarding de KitchenOS

Usá el agente `spec-to-code` para planificar antes de escribir cualquier código.

---

## Contexto del proyecto

KitchenOS es una app SaaS de gestión de restaurantes. Stack: Next.js 16.2 (App Router), React 19, TypeScript, Tailwind v4, Supabase. La app es **mobile-first** pero también se usa en web/desktop — el onboarding debe funcionar bien en ambas superficies.

Reglas críticas del proyecto (leer antes de escribir código):
- Auth via `proxy.ts` — **NO `middleware.ts`** (breaking en Next.js 16)
- `useRestauranteId()` devuelve `''` mientras carga — todos los hooks deben saltear fetches con `''`
- Iconos: `<span className="material-symbols-outlined">nombre</span>` — no emoji, no SVG custom
- Colores: `var(--navy)`, `var(--accent)`, `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text-1/2/3)`
- Gráficos: CSS divs con `width: X%` — **no Chart.js**
- Supabase client browser: `lib/supabase/client.ts`

---

## Lo que existe hoy

`app/(app)/onboarding/page.tsx` — flujo de 5 pasos orientado a **importar datos** (proveedores, facturas, listas de precios, fichas técnicas). Funciona pero no considera roles de usuario ni guía al admin a configurar la app paso a paso. Hay que **rediseñarlo completamente**, no solo extenderlo.

---

## Objetivo

Construir un onboarding **orientado a roles** que reemplace el actual. Tres flujos distintos según el tipo de usuario:

| Rol | Tipo | Descripción |
|-----|------|-------------|
| **Admin** | Configuración completa | 8 pasos para dejar la app lista para el equipo |
| **Encargado** | Setup operativo | 4 pasos para arrancar el trabajo diario |
| **Cocinero / Bachero** | Activación rápida | 2 pasos para estar listo en minutos |

El rol se detecta desde `equipo_miembros.puestos.nivel` (valores: `'admin'`, `'sous_chef'`, `'cocinero'`, `'bachero'`). Admin = nivel admin.

---

## Cuándo mostrar el onboarding

- Se muestra solo la primera vez que el usuario entra a la app.
- Guardar en Supabase: tabla `user_restaurantes` ya existe — agregar columna `onboarding_completed_at TIMESTAMPTZ DEFAULT NULL`. Si es NULL → mostrar. Si tiene fecha → no mostrar.
- Alternativamente (más simple para empezar): `localStorage.getItem('onboarding_done_<userId>')`.
- El usuario puede cerrarlo en cualquier momento con "Saltar todo" → marca como completado.
- Debe poder volver a abrirlo desde Configuración → "Guía de inicio".

---

## Flujo: ADMIN (8 pasos)

Pensado como un **instructivo de configuración** — se hace una vez, deja la app lista.

### Paso 1 — Creá tu cuenta ✓ (ya hecho al registrarse)
Este paso se puede mostrar como "completado" de entrada. Solo mostrar un mensaje de bienvenida con el nombre del restaurante.

### Paso 2 — Cargá tu carta
- Mostrar 3 opciones de carga: foto del menú, Excel/CSV, o "Dictarle al Coach"
- El Coach abre el FAB con el prompt pre-cargado: "Quiero cargar mi carta. Te voy a dictar los platos con nombre y precio."
- Deeplink: `/carta`
- Dato de interés: mostrar cuántos platos ya tiene cargados (`carta_items` count)

### Paso 3 — Armá recetas y subrecetas
- Opción rápida: subir fichas técnicas (PDF/Excel/DOCX) → IA extrae y crea recetas
- Opción manual: crear desde el recetario
- Deeplink: `/recetario`
- Dato de interés: mostrar `recetas` count + food cost promedio calculado si ya hay recetas

### Paso 4 — Definí las plazas
- Lista de plazas ya creadas (de `configuracion_plazas` o `checklist_secciones`)
- Botón para agregar nueva plaza con nombre y tipo
- Deeplink: `/configuracion`
- Dato de interés: número de plazas activas

### Paso 5 — Configurá el mise en place ⭐ (paso clave)
- Explicar que se define qué y cuánto debe haber en cada plaza antes del servicio
- Deeplink: `/checklist` (o `/operaciones?tab=mise`)
- Nota importante para el usuario: "Para cargar cantidades por 'unidad' (und), el producto debe estar previamente costeado en el stock con su medida unitaria — la app toma ese dato de ahí."
- Dato de interés: progreso de items configurados por plaza

### Paso 6 — Invitá al equipo
- Generar link de invitación o QR
- Mostrar miembros ya activos (`equipo_miembros` count)
- Deeplink: `/turnos`
- Dato de interés: cuántos miembros tiene el equipo actualmente

### Paso 7 — Cargá el stock base
- Opción rápida: subir Excel o facturas (conectar con el importador existente)
- Deeplink: `/stock`
- Dato de interés: productos en stock, % con precio asignado

### Paso 8 — Configurá los checklists
- Mostrar plantillas prediseñadas disponibles
- Deeplink: `/checklist`
- Dato de interés: rutinas activas configuradas

---

## Flujo: ENCARGADO (4 pasos)

Más corto, orientado a operar, no a configurar.

### Paso 1 — Tu plaza
- Confirmar o elegir su plaza de trabajo (de `equipo_miembros.puestos.plaza_default`)
- Si no tiene plaza asignada, mostrar selector

### Paso 2 — Revisá el mise en place
- Mostrar el checklist de su plaza con los items configurados
- Deeplink: `/operaciones?tab=mise`

### Paso 3 — Chequeá el stock crítico
- Mostrar productos con stock bajo o crítico
- Deeplink: `/stock`

### Paso 4 — El pase de turno
- Explicar cómo funciona: mensajes entre turnos, crear tareas desde mensajes
- Deeplink: `/pase`

---

## Flujo: COCINERO / BACHERO (2 pasos)

Activación rápida.

### Paso 1 — Tu plaza
- Confirmar plaza (misma lógica que Encargado paso 1)

### Paso 2 — Tus tareas del día
- Mostrar las tareas asignadas a su plaza para hoy
- Deeplink: `/operaciones`

---

## [DATOS DE INTERÉS — A completar por el admin]

*Esta sección se completará con métricas e insights que Facundo quiere mostrar durante el onboarding. Por ahora, dejar placeholders en el código que sean fáciles de reemplazar:*

```typescript
// placeholder — completar con datos reales
const IMPACT_STATS = {
  tiempo_ahorrado: "3 hs/semana",     // promedio de restaurantes similares
  food_cost_mejora: "4–8%",           // mejora típica al usar food cost real
  // ... más datos a definir
}
```

---

## Diseño / UX

### Estructura general (mobile-first)
- **Header navy fijo** (`var(--navy)`) con: nombre del restaurante, badge del rol, barra de progreso (steps completados)
- **Cards por paso**: una card grande por paso. Borde izquierdo coloreado por grupo (amber = setup base, green = recetas/plazas, blue = equipo/stock, purple = checklists)
- **Por cada paso**: título + descripción corta + acción principal (botón deeplink o acción inline) + indicador de estado (✓ completado / en progreso / pendiente)
- **Botones**: "Ir a configurar →" (deeplink) + "Ya lo tengo ✓" (marca el paso como listo sin navegar)
- **Footer**: "Saltar todo" (izquierda) + "Continuar" (derecha)

### Comportamiento en mobile vs web
- **Mobile** (`max-width: 768px`): pantalla completa, cards stacked verticalmente, botones de ancho completo, safe-area-inset respetado
- **Web/Desktop**: centrado `max-width: 720px`, cards con más padding, layout de 1 columna (no 2 — mantener simplicidad)
- El mismo componente debe funcionar en ambas superficies sin lógica separada

### Progress tracking
Cada paso tiene 3 estados: `pending` | `in_progress` | `done`. La barra del header muestra cuántos pasos están `done`. Un paso pasa a `done` cuando el usuario hace clic en "Ya lo tengo ✓" o cuando se detecta que ya tiene datos (ej: si ya tiene plazas creadas, el Paso 4 arranca en `done`).

---

## Instrucciones técnicas

1. **Antes de escribir código**, corré `/supabase-check equipo_miembros` y `/supabase-check user_restaurantes` para verificar columnas reales.

2. **Para scaffoldear el módulo**: `/new-module onboarding` — pero el archivo `app/(app)/onboarding/page.tsx` ya existe, así que moverlo a `page_v1.tsx.bak` antes y crear el nuevo.

3. **Para el Kitchen Coach en el paso 2** (opción "Dictarle al Coach"): usar `/coach-screen onboarding` para integrar el FAB con contexto del paso actual.

4. **Detección de rol**:
```typescript
// hooks/useUserRol.ts — crear si no existe
const { data } = await supabase
  .from('equipo_miembros')
  .select('puestos(nivel)')
  .eq('restaurante_id', restauranteId)
  .eq('user_id', userId)
  .single()
const nivel = data?.puestos?.nivel  // 'admin' | 'sous_chef' | 'cocinero' | 'bachero'
const esAdmin = nivel === 'admin'
```

5. **Guardar progreso por paso** — usar un objeto simple en state + persistir en localStorage:
```typescript
type OnboardingProgress = Record<number, 'pending' | 'done'>
```

6. **No usar `middleware.ts`** para proteger la ruta — ya está cubierto por `proxy.ts`.

7. **Recordá que la app es mobile-first**: probá mentalmente en 375px antes de asumir que algo cabe.

---

## Archivos a crear/modificar

| Acción | Archivo |
|--------|---------|
| Crear | `app/(app)/onboarding/page.tsx` (reemplaza el actual) |
| Crear | `hooks/useOnboardingProgress.ts` |
| Crear | `components/onboarding/StepCard.tsx` |
| Crear | `components/onboarding/RoleBadge.tsx` |
| Modificar | `app/(app)/configuracion/page.tsx` — agregar link "Guía de inicio" |
| Opcional | Migración SQL para `user_restaurantes.onboarding_completed_at` |

---

## Output esperado

Un onboarding funcional que:
- Detecta el rol del usuario y muestra el flujo correcto
- En mobile: pantalla completa, fluida, tappable
- En web: centrado, bien proporcionado
- Cada paso muestra datos reales del restaurante (qué ya está cargado)
- El admin puede completar los 8 pasos sin salir del onboarding (deeplinking suave)
- Tiene "Saltar todo" como válvula de escape en cualquier momento
- No rompe el flujo de auth existente
