# Plan de arreglos — 08/09/2026

Seis observaciones de Facundo sobre la superficie de Organigrama/Configuración, más
el bug de invitaciones de Bros. Investigado en Opus, **se ejecuta en Sonnet**.

Orden de ejecución: 1 → 6. El bloque 1 es backend puro y no toca UI, así que puede
salir solo y deployarse antes que el resto.

---

## 1. El bug de invitaciones — `/api/invitar` nunca creó una ficha de equipo

### Qué pasó, exactamente

Facundo invitó a `tamaraampuero25@gmail.com` a Bros el **26/08 19:46**. La app dice
que la invitación salió, Tamara la aceptó y **entró el 27/08 21:35**. Pero no aparece
en el plantel. Estado real en la base:

| Tabla | Tamara |
|---|---|
| `auth.users` | ✅ existe, confirmada, con último login |
| `user_restaurantes` | ✅ `rol: cocinero`, Bros |
| `equipo_miembros` | ❌ **no existe** |

La causa raíz está en `app/api/invitar/route.ts`:

```ts
await adminSupabase.from('equipo_miembros').upsert(
  { ...datos },
  { onConflict: 'email,restaurante_id', ignoreDuplicates: true }
)
```

`onConflict: 'email,restaurante_id'` le pide a Postgres un `ON CONFLICT (email,
restaurante_id)`, y **para eso tiene que existir un índice único sobre esas dos
columnas**. No existe: `equipo_miembros` solo tiene único la PK sobre `id`.
Verificado contra producción con una sonda que se revierte sola:

```
ERROR 42P10 — no hay unique index para (email, restaurante_id)
```

Postgres tira `42P10` en **todas** las llamadas. Y el `await` no destructura
`{ error }`, así que el fallo se traga entero y el endpoint devuelve `ok: true`.
El admin ve "Invitación enviada" y no pasó nada.

**Esto nunca funcionó.** El caso de control es Valentino Cortes: su ficha se creó
el 20/08 a las 20:17, **siete minutos antes** de que existiera su usuario de auth
(20:24). O sea, se cargó a mano desde Organigrama y recién después se lo invitó.
Todos los invitados que hoy están en el plantel llegaron por ese camino manual.

Después, `/api/invitar/vincular` (que corre en cada login como autoreparación) hace
un `UPDATE ... WHERE email ilike ... AND auth_user_id IS NULL`. Sin fila que
matchear, actualiza 0 filas, devuelve `vinculado: false` y **tampoco es un error**.
El agujero queda cerrado por los dos lados en silencio.

### A quiénes afecta hoy

Barrido de todas las cuentas: personas con `user_restaurantes` y sin ficha.

| Email | Restaurante | Rol | Invitado | Último login |
|---|---|---|---|---|
| `tamaraampuero25@gmail.com` | Bros | cocinero | 26/08 | 27/08 |
| `zrw.viajes@gmail.com` | Bros | sous_chef | 01/08 | 05/08 |
| `facuastrada15+test@gmail.com` | Bros | sous_chef | 04/07 | 04/07 |
| `facuastrada15@gmail.com` | Bros | admin | 10/06 | 10/06 |

Dos personas reales perdidas (Tamara y zrw.viajes) y dos cuentas propias de Facundo.

Consecuencia para ellas: **sí pueden entrar** — `user_restaurantes` alcanza para el
login — pero `usePermisos` no encuentra su fila en `equipo_miembros`, así que ignora
el `permisos_app` del puesto y cae al fallback por rol (`rol_permisos`). No figuran
en el plantel, no tienen puesto, no entran en polivalencia ni en la cobertura.

### Qué se hace

**a) Migración — el índice único que falta.** Nuevo archivo
`supabase/migrations/20260908_equipo_miembros_email_unico.sql`:

```sql
create unique index if not exists equipo_miembros_email_restaurante_uniq
  on public.equipo_miembros (email, restaurante_id);
```

Sobre las columnas crudas, **no** sobre `lower(email)` ni parcial con `WHERE email
is not null`: PostgREST genera `ON CONFLICT (email, restaurante_id)` sin cláusula
`WHERE`, y Postgres no puede inferir un índice de expresión ni uno parcial desde
ahí — seguiría tirando 42P10. Los `NULL` son distintos entre sí por defecto, así que
la fila de Franco (email null) y cualquier otra sin email conviven sin problema.
Ya verifiqué contra prod que **no hay duplicados** de `(lower(email),
restaurante_id)` en ninguna cuenta: la migración entra sin limpieza previa.

**b) `/api/invitar` deja de tragarse el error.** Destructurar `{ error }` del upsert
de `equipo_miembros` y del de `user_restaurantes`, y devolver 500 con el mensaje
real. Normalizar el email a minúsculas antes de insertar (el índice es
case-sensitive; `vincular` ya matchea con `ilike`, así que el resto tolera lo viejo).

**c) `/api/invitar/vincular` pasa a crear la ficha si no existe.** Es el cambio que
cierra la clase de bug, no solo esta instancia: hoy solo hace `UPDATE`. Si el usuario
tiene `user_restaurantes` y no hay ninguna fila de `equipo_miembros` que le
corresponda, la crea — `auth_user_id`, `email`, `rol` de `user_restaurantes`,
`nombre` del metadata de auth o del prefijo del email, `activo: true`, `puesto_id`
null. Como `lib/auth/context.tsx` ya llama a este endpoint en cada login, cualquiera
que quede en este estado se autorepara la próxima vez que entre.

**d) Backfill de los cuatro.** Un `INSERT ... SELECT` que crea la ficha faltante para
toda fila de `user_restaurantes` sin `equipo_miembros`, con `puesto_id` null para que
Facundo se lo asigne desde Organigrama. Sale como script único contra prod, no como
migración (es data, no schema).

**Tests** (Vitest): que el upsert devuelva error y el endpoint 500; que `vincular`
cree la fila cuando no existe, vincule cuando existe sin `auth_user_id`, y sea no-op
cuando ya está vinculada.

---

## 2. La ficha del plantel pasa a ser un modal centrado

### Qué pasa hoy

En Organigrama → Plantel, tocar una carta la da vuelta y muestra "Editar accesos";
ese botón hace `setPlantelMode('ficha')`, y `FichaMiembroPanel` **reemplaza la
grilla entera** dentro del mismo tab (content-swap). Se lee como una pantalla nueva
sin serlo: no hay transición, no hay contexto de dónde venís, y volver es una flecha
arriba a la izquierda. Los tres modos (`ficha`, `nuevo`, `editar`) sufren lo mismo.

### Qué se hace

**Se crea `components/ui/Modal.tsx`** — el componente canónico que `ui.md` § línea
174 viene pidiendo desde hace cuatro copias:

> *"Cuarta copia en `checklist/ClientView.tsx` — ya se pagó dos veces el mismo bug al
> copiarlo mal (z-index bajo el nav, `useSheetOpen()` olvidado): extraer a
> `components/ui/` la próxima vez que se toque cualquiera de los cuatro."*

Esta sería la quinta. Se extrae en vez de copiar de nuevo. El componente encapsula
lo que las cuatro copias comparten y lo que dos de ellas se olvidaron:

- backdrop `position:fixed, inset:0, zIndex:2000, background:rgba(0,0,0,.55)` +
  `backdropFilter:'blur(4px)'` — el fondo translúcido que pide Facundo;
- card centrada `borderRadius:18, maxWidth` (default 560), `maxHeight:'calc(100dvh -
  48px)', overflowY:'auto'`, cierra por click en backdrop (`stopPropagation` en la
  card) y por `Escape`;
- `useSheetOpenWhen(open)` adentro, para que el FAB del Coach se esconda solo;
- en `< 1024px` (`useIsDesktop`) degrada a sheet full-height desde abajo, que es el
  patrón que ya usa el resto de la app en celular;
- entrada con `motion/react` usando `SPRING_SHEET` y `DURATION.enter` de
  `lib/ui/motion.ts`, respetando `useReducedMotion()`.

**Se usa para la ficha**: `plantelMode !== 'grid'` deja de reemplazar la grilla y
pasa a montar `<Modal>` con `FichaMiembroPanel` adentro. La grilla queda visible y
difuminada detrás. El header interno de la ficha ("← Ficha") se cambia por el título
del modal + la X.

De paso se migra el modal de **Invitar** de `organigrama/page.tsx` (hoy inline, con
su propio backdrop y `zIndex: 200` — que está *por debajo* del BottomNav en `z-100`
solo por suerte de orden de montaje) al mismo componente.

**No** se migran las otras cuatro copias en esta sesión: queda anotado en
`PENDIENTES.md` como deuda con el componente ya disponible.

**Tests**: Vitest sobre `Modal` (cierra por backdrop, por Escape, no cierra por click
en la card, monta/desmonta el contador de `useSheetOpen`).

---

## 3. Configuración se queda sin Equipo; Plantel gana "Ver inactivos"

### Qué pasa hoy

`configuracion/page.tsx` (1196 líneas) tiene un tab **Equipo** que lista los miembros
y deja editar **Rol** y **Plaza** con dos `<select>`. Es el modelo viejo y plano:
escribe `equipo_miembros.rol` y `plaza_asignada` directo. Organigrama → Plantel hace
lo mismo y mejor, por el modelo de tres capas (nivel → puesto → overrides). Que
existan los dos es exactamente la confusión que reporta Facundo — y peor: el `rol`
que se edita ahí ya casi no se lee (el rol efectivo sale de `user_restaurantes.rol`
vía `mapRol`, no de esta columna).

Además hay un tab fantasma: `<button>Equipo →</button>` que no cambia de tab, hace
`router.push('/turnos')`. Dos entradas llamadas "Equipo" en la misma tira, una que es
tab y otra que es link a otra pantalla.

Y hay **170 líneas de código muerto**: `InvitarTab` está definido y no se renderiza
desde ningún lado (los tabs son solo `equipo | permisos | restaurante`). Ahí adentro
vivía el toggle de activar/desactivar miembros. O sea que hoy, en toda la app,
**desactivar a alguien es irreversible desde la UI**.

### Qué se hace

- Se borra el tab **Equipo** de Configuración (`EquipoTab` + su `MiembroCard` local +
  el fetch de `miembros` y `updateMiembro`).
- Se borra el tab fantasma `Equipo →`.
- Se borra `InvitarTab` entero (código muerto).
- En su lugar, Configuración muestra un link corto: *"El equipo se gestiona en
  Organigrama →"*.
- **Organigrama → Plantel gana el filtro "Inactivos"**: un chip más en la tira de
  `FilterChips` que ya está. Con el chip activo, `useEquipo` trae también los
  `activo: false` (hoy filtra `.eq('activo', true)` duro), las cartas se pintan en
  gris/desaturadas y la ficha ofrece **Reactivar** en vez de Desactivar. Cierra el
  agujero que abre la consolidación y arregla el bug de la desactivación
  irreversible.

Detalle de implementación en `useEquipo`: agregar un parámetro `incluirInactivos`
que entre en la key de SWR (`equipo-${rid}-${incluirInactivos}`), no un filtro en
cliente — si no, se traen todos siempre y el resto de la app que consume el hook
empieza a ver gente desactivada en los selectores de puesto y de turnos.

**Ojo con esto**: `useEquipo` lo usan varias pantallas. Correr `/impacto useEquipo`
antes de tocar la firma.

---

## 4. "Permisos por rol" se muda a Organigrama, adentro de Puestos

### Qué pasa hoy

Es el segundo tab de Configuración. Edita `rol_permisos`: qué módulos ve cada rol de
base (`admin`, `sous_chef`, `cocinero`, `bachero`) más cuatro flags de edición.

### Qué se hace

Va como **sección plegable al final del tab Puestos** de Organigrama, no como un 6º
tab. La razón es que es literalmente eso en el código: `usePermisos` resuelve
`admin → módulos efectivos del puesto → rol_permisos`, o sea que `rol_permisos` es
**el fallback para quien todavía no tiene puesto asignado**. Ponerlo debajo del
editor de puestos lo explica solo; un tab aparte lo presenta como un segundo sistema
de permisos paralelo, que es justo lo que no es.

- Título: *"Permisos por rol"*, subtítulo *"Lo que ve alguien que todavía no tiene
  puesto asignado. Si el puesto está cargado, manda el puesto."*
- Arranca plegada. El resumen del encabezado dice cuánta gente cae hoy en el fallback
  (`miembros.filter(m => !m.puesto_id).length`) — si es 0, lo dice: *"Nadie depende
  de esto hoy."*
- Se mueve `PermisosTab` tal cual a
  `components/organigrama/PermisosPorRolPanel.tsx`, con sus handlers
  (`toggleModulo`, `toggleEditPermiso`, `seedMissingRoles`), que hoy viven sueltos en
  `configuracion/page.tsx`.
- Configuración deja de usar `usePermisos().allPermisos` / `fetchPermisos`.

Después de esto, Configuración queda con un solo tab (**Restaurante**) + el botón
Fiscal. Se le saca la tira de tabs entera y el contenido de `RestauranteTab` pasa a
ser el cuerpo de la pantalla.

---

## 5. Guía de inicio y Organización salen del header de Configuración

### Qué pasa hoy

Las dos son pastillas de 12px en el header de Configuración. Búsqueda en todo el
repo: **ese es el único acceso que existe**. `/implantacion` no está enlazada desde
ningún otro lado, y `/onboarding` solo desde el redirect de alta. La cordillera —
que por diseño *no termina nunca* — está escondida detrás de dos clicks en una
pantalla que se abre una vez por mes.

### Qué se hace (las dos cosas)

**a) Entradas propias en la navegación.** En la sección **Sistema** del sidebar
desktop (`components/shell/SidebarNav.tsx`, junto a Organigrama y Configuración) y en
el menú **MÁS** de mobile (`components/shell/MoreMenu.tsx`).

Van como bloque hardcodeado **solo para `isAdmin`**, no como `ModuloId` nuevos. Es a
propósito: agregar un `ModuloId` no lo habilita para los puestos ya creados en la
base — hay que backfillear `permisos_app` de cada puesto de cada cuenta — y además
`RUTA_A_MODULO` ya mapea `/implantacion` → `'home'`, o sea que el permiso real ya
está resuelto. `MoreMenu` ya tiene el precedente: el link a `/coach` está
hardcodeado igual.

Recordar que `SidebarNav` tiene la lista de secciones hardcodeada aparte de
`MODULOS_POR_ROL` — hay que tocar **los dos** archivos o queda visible en mobile e
invisible en desktop.

**b) Tira de organización en el Inicio.** Nueva
`components/dashboard/ImplantacionStrip.tsx`, hermana de `LineUpStrip`: mismo
formato (borde izquierdo de color, ícono, dos líneas, chevron), montada en el mismo
contenedor de `DashboardClientView.tsx` (líneas 321 y 388, hay dos ramas de layout).

Muestra el % real y la próxima estación concreta:

```
🏔  Organización — 47%
    Siguiente: cargar el rendimiento de las recetas        ›
```

`useRutaImplantacion` ya devuelve `progreso.siguiente` (la primera estación no
insertada), así que el texto sale de `textoRecordatorio()` sin lógica nueva.

**El cuidado importante — el costo.** El hook son ~30 `count: 'exact', head: true`
en paralelo. Está bien para una pantalla que se abre una vez por día; ponerlo en el
Inicio lo dispara en cada apertura de la app. Mitigaciones, todas necesarias:

1. Solo si `isAdmin` — el hook ni se monta para el resto (componente hijo separado
   con render condicional, no un `if` adentro del hook).
2. El SWR key es `ruta-${rid}`, el mismo que usa `/implantacion` con
   `dedupingInterval: 300_000` — abrir la cordillera después de ver la tira ya no
   vuelve a pedir nada.
3. La tira persiste el último `progreso.porcentaje` en `localStorage` y pinta con ese
   valor mientras revalida, para que no aparezca un esqueleto en el Inicio.
4. Desaparece en 100%.

---

## 6. Polivalencia: la matriz no entra en la pantalla

### Qué pasa hoy

`PolivalenciaPanel.tsx` renderiza una `<table>` con `minWidth: 120 + plazas.length *
96` dentro de un `overflowX: 'auto'`. Con las 6 plazas fijas que quedan después de
sacar `general` y `menu`, son **~692px de ancho mínimo**. En un celular de 390px se
ven dos plazas y media. Técnicamente scrollea (la primera columna es sticky), pero no
hay ninguna señal visual de que se pueda scrollear, así que se lee como "faltan
plazas". Bros y El Rescoldo tienen **0 plazas custom** hoy; con custom, empeora.

### Qué se hace

Responsive de verdad, con el corte en `useIsDesktop()` (1024px):

- **Desktop**: se mantiene la matriz, que es donde brilla. Se le agrega la señal de
  scroll de todos modos (sombra degradada en el borde derecho mientras haya
  contenido fuera de vista), porque con plazas custom también se pasa de largo.
- **Mobile**: se transpone a **una card por plaza**. Cada card: nombre + ícono de la
  plaza, el estado de riesgo que ya calcula `riesgo()`, y la lista de personas con su
  nivel (los cuatro cuadraditos), tocable para editar igual que hoy. Las personas en
  nivel 0 van agrupadas al final en una línea: *"Sin formar: Zoe, Alex, +2"*.

Que en mobile sea **plaza-primero y no persona-primero** no es una elección de
layout: es la regla de lectura que el propio archivo declara en su encabezado —
*"mide cobertura del restaurante, no rendimiento de la persona"*, y por eso el riesgo
por plaza va arriba de todo. La versión mobile termina siendo más fiel a esa regla
que la matriz.

**Antes de ejecutar este bloque: pedirle a Facundo la captura de Polivalencia.**
Necesito ver si lo miró en celular o en desktop, y si lo que falta son plazas
custom o las fijas. Si resulta que es desktop con sidebar abierta, el arreglo es
otro (achicar la columna de persona y el ancho por plaza, que hoy es fijo en 92px).

---

## Cierre

- `npm run build` + `npm test` + `npm run lint` antes de cada push.
- `/update-status` al final, como siempre.
- Deuda que queda anotada en `PENDIENTES.md`: migrar las cuatro copias viejas de
  modal centrado a `components/ui/Modal.tsx`.
