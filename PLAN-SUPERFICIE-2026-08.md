# PLAN-SUPERFICIE — Capa visual, movimiento y flujo rápido (ago 2026)

> **Ejecutar con Sonnet.** Un bloque por sesión, autocontenido, termina con `npm run build` limpio + commit propio.
> **S0 va primero y bloquea a los demás** (los otros consumen sus tokens y su helper de motion), igual que D0 en `PLAN-UI-IDENTIDAD-2026-07.md`.
> **Regla de encuadre del plan (pedido de Facundo, 22/08):** *se agrega sobre lo que hay, no se construye nada nuevo.* Cero módulos nuevos, cero tablas, cero columnas. Todo lo de acá reordena, viste o anima datos y pantallas que ya existen.

**Origen:** auditoría de diseño del 22/08/2026 — código leído (`app/`, `components/`, `globals.css`, `constants.ts`) + capturas reales de producción con la cuenta El Rescoldo (dashboard mobile 390×844, dashboard desktop 1440×900, `/operaciones` mobile, `/organigrama` desktop).

---

## 1. Diagnóstico

### Lo que está bien y no se toca

- **El sistema visual existe y es coherente.** Navy `#1c2d4a` / crema `#f4f2ee` / accent `#4361a0`, DM Sans, Material Symbols, componentes canónicos en `components/ui/` (D0, jul 2026). Las 30+ pantallas comparten el mismo esqueleto: header navy → cuerpo de tarjetas claras → BottomNav flotante. Eso es un activo, no un problema.
- **Las reglas de densidad y de tap del mise están ganadas con dolor** (`.claude/docs/ui.md`): sin stagger, sin translate en listas tappables, checkbox arriba a la izquierda, `select()` al enfocar. No se revisan.
- **La carta de puesto del Organigrama** (`components/organigrama/MiembroCard.tsx`) es la mejor pieza gráfica de la app: gradiente por nivel, badge de plaza, bloque de stats PLZ/MOD/TAR/ANT, flip 3D. Es la semilla del bloque S3.

### Los seis hallazgos

1. **El Dashboard es un lanzador con un muro de alertas adelante, no una cabina.** Orden real en mobile: perfil → 3 KPIs (dos leen `0/13` y `0/0`) → banner rojo "2 atrasados" → Iniciar turno → banner rojo "1 factura vencida" → Pase → Mi Plaza 0% → y recién ahí, tres pantallas más abajo, la grilla de 17 módulos. La primera pantalla del día contesta *"¿qué debo?"* antes que *"¿qué hago ahora?"*.
2. **Una de las tres tarjetas de KPI está hardcodeada en cero.** `EightySixCard` en `components/dashboard/DashboardHeader.tsx` devuelve el literal `0` y "Sin 86s activos" — siempre, en todas las cuentas. Ocupa un tercio del espacio más caro de la app. El dato real existe: `carta_items.disponible = false`.
3. **En desktop la columna principal se la lleva la navegación.** 17 tiles idénticos, mismo ícono accent, sin agrupar ni priorizar — mientras el `SidebarNav` de la izquierda ya navega a lo mismo. La grilla duplica al sidebar y le come el lugar al día de trabajo.
4. **No hay movimiento: `PageTransition` es un no-op.** `components/PageTransition.tsx` devuelve `<div style={{height:'100%'}}>` y lo importan 16 pantallas. La única transición real de la app es un crossfade de **100 ms** en `app/(app)/layout.tsx`. Además hay **dos copias de la misma librería** instaladas (`framer-motion` **y** `motion`, ambas 12.38) usadas en solo 7 archivos, y **cero** manejo de `prefers-reduced-motion` en todo el repo.
5. **La identidad declarada no está en el producto.** `KitchenOS-ThermalOrder-DesignPhilosophy.md` define navy + **ámbar brasa** + crema, dos registros tipográficos (grotesca autoritaria + serif itálica "voz humana") y halos de sombra azul. En la app el ámbar aparece solo como peligro, como FAB del Coach y como pill "TODO" de OPS — tres significados encimados —, hay una sola tipografía y la elevación es casi toda borde de 1px. El deck se ve más KitchenOS que la app.
6. **El vacío gana el pixel de arriba.** En `/operaciones` mobile el header navy se lleva ~25% de la pantalla (4 filas), y debajo "IMPORTANTE — Sin avisos del turno" y "PEDIDOS — Sin pedidos anotados" ocupan media pantalla con sus inputs abiertos, empujando LIMPIEZA 0/7 (el trabajo real) al borde inferior. El FAB del Coach vuelve a pisar contenido — el botón de enviar del Pase en el dashboard, las filas de Limpieza en OPS — pese a que D1 ya lo corrigió una vez.

### Contra lo que necesita el usuario (marco de las 4 capas)

`AUDITORIA-4-CAPAS.md` mide cobertura funcional: Ejecutar 90%, Preparar 70%, Definir 25%, Controlar 45%. Este plan **no toca esa cobertura** — toca algo que esa auditoría no mide: **la app no dice en qué momento del día estás.**

El día de cocina es una secuencia (llegada → apertura del mise → control de carta pre-servicio → servicio → cierre y entrega de plaza → pase). K-OS tiene las seis piezas construidas y verificadas. Pero la pantalla de entrada las muestra como 17 cuadraditos iguales, sin noción de *cuándo*. La maquinaria para arreglarlo **ya está escrita**: `turnoVigente`, `hoyOperativo`, `proximoTurnoEnVentana` en `lib/ops/turnos.ts` (esta última ya alimenta el banner de Control de Carta). Falta usarla en el Dashboard.

---

## 2. Las tres reglas que este plan no rompe

1. **Nada de rendimiento individual expuesto.** La estética de videojuego entra como *progreso del turno y de la plaza*, tacto y cartas — nunca ranking de personas, puntaje por cocinero ni cronómetro comparativo. Es la doctrina del proyecto, escrita en el encabezado de `MiembroCard.tsx` y en `project_fundamento_juego_cercado`: exponer desempeño individual en una interfaz produce culpa, no mejora. El "juego" acá es el turno; el marcador es qué tan lista está la plaza.
2. **KDS y Muro no se tocan.** Fondo oscuro fijo, cero animaciones de entrada, cero dropdowns (`ui.md` § Vista de servicio). Reciben realtime y cualquier animación bloquea taps.
3. **No se anima nada que mueva un target bajo el dedo.** Sin stagger, sin translate en listas tappables (`ui.md` § Animaciones de lista — ya costó el bug de "hay que apretar dos veces"). Se anima el chrome, la entrada de pantalla, el cambio de estado de un ítem y los números. No la posición de una tarjeta que se va a tocar.

---

## 3. Bloques

## S0 — Sistema de movimiento + limpieza de peso 🔴 Base (bloquea todo)

- [x] Completado — fecha: 2026-08-24

**Qué hacer:**

1. `lib/ui/motion.ts`: tokens únicos de duración y easing (`instant 120ms` para feedback de tap, `base 200ms` para estado, `enter 260ms` para pantalla/sheet; `ease-out` estándar, spring solo en sheets — el que ya usa `MoreMenu`) + hook `useReducedMotion()` que lee `prefers-reduced-motion` (hoy: **0 usos en el repo**) y devuelve duración 0.
2. **Arreglar `PageTransition`** (hoy no-op, 16 importadores): fade + 6px de subida, `enter`, respetando reduced-motion, sin duplicar el crossfade del layout — o unificar ambos ahí, decidir en la sesión, pero que no queden dos transiciones encimadas.
3. **Sacar la librería duplicada**: están `framer-motion` y `motion` (misma librería, misma 12.38). Consolidar en una sola en los 7 archivos que la usan y desinstalar la otra.
4. `tap()` en `lib/ui/motion.ts`: háptico corto (`navigator.vibrate?.(10)`) para confirmaciones en mobile. Hoy hay **un** uso suelto (`checklist/ClientView.tsx:879`) — se generaliza a tildar mise, despachar y entregar plaza.
5. Documentar en `.claude/docs/ui.md` una sección "Movimiento": qué se anima, qué no, y las tres reglas de arriba.

**Criterio:** build limpio; el mise no pierde el primer tap; con "reducir movimiento" activado en el SO la app queda estática y usable; el bundle de las pantallas pesadas **no sube** (con la librería duplicada afuera, debería bajar).

---

## S1 — Dashboard: de lanzador a cabina del día 🔴 Alta (el pedido central)

- [x] Completado — fecha: 2026-08-24

No es una pantalla nueva: es reordenar `DashboardClientView.tsx` y sumar un bloque arriba.

**Qué hacer:**

1. **Bloque "Ahora"** — una sola tarjeta grande, arriba de todo, que contesta *en qué momento del día estás* y ofrece **un** CTA. Se calcula con lo que ya existe (`turnoVigente`, `proximoTurnoEnVentana`, avance de `useChecklist`, `cierres_turno`, `useTareas`):
   - Antes de la apertura → "Abrí tu plaza" → `/operaciones` tab Mise
   - En apertura → "Mise 4/13 — seguí" con la barra viva
   - Ventana pre-servicio → "Control de carta" (el banner de B7 que ya existe, promovido acá en vez de vivir suelto en OPS)
   - En servicio → "Salón / KDS / Muro" según el rol
   - Cierre → "Entregá tu plaza"
   - Fuera de turno → resumen del día y qué quedó para mañana
2. **KPIs vivos**: matar el `0` hardcodeado de `EightySixCard` — contar `carta_items.disponible = false` (dato real, ya lo mantiene Carta). Las tres tarjetas del header pasan a ser el avance del turno, no tres números sueltos.
3. **Alertas plegadas**: los banners rojos apilados (pedidos atrasados + facturas vencidas + stock) se juntan en **una** fila "Pendientes del negocio · 3" plegable, **debajo** del bloque de trabajo. Hoy la deuda le gana el pixel a la operación.
4. **Módulos**: en mobile, la grilla baja de 17 a **los 6 más usados** (frecuencia en `localStorage`, mismo patrón de preferencias locales que ya usa el orden de columnas de OPS) + "Ver todos" que abre el `MoreMenu` que ya existe. En desktop, la grilla **sale** de la columna principal (el `SidebarNav` ya navega) y ese lugar lo ocupa el día: bloque Ahora + avance por plaza + pase.
5. **Números que suben**: contador y barras animan al montar con los tokens de S0. Es donde el "videojuego" se siente sin costo cognitivo.

**Criterio:** en un celular, la primera pantalla del día muestra la próxima acción **sin scrollear**; ningún KPI muestra un valor inventado; el FAB del Coach no pisa el botón de enviar del Pase.

---

## S2 — Thermal Order: subir la temperatura de la app 🟠 Alta

- [x] Completado — fecha: 2026-08-24 (alcance recortado, ver registro de sesiones)

Aplicar en el producto la identidad que ya está escrita para el deck.

**Qué hacer:**

1. **Desencimar el ámbar.** Hoy significa peligro, Coach y "TODO" a la vez. Queda como **estado activo / en curso** (turno abierto, plaza trabajando, ítem despachado); el peligro se queda con el rojo; la plaza Menú mantiene su ámbar propio (es identidad de plaza, señal semántica, ya documentada).
2. **Halos de sombra azul como token de elevación**, en 3 niveles, en vez de bordes de 1px en todo. El valor ya está calibrado en `MiembroCard`: `0 1px 2px rgba(28,45,74,.08), 0 10px 24px rgba(28,45,74,.14)`. Es el cambio más barato con más rendimiento visual de todo el plan.
3. ~~Segundo registro tipográfico (serif itálica)~~ — **decidido 24/08: no.** La app se queda con DM Sans sola; más simple y consistente, el ámbar reordenado + las sombras de elevación ya suben bastante la temperatura sin tocar tipografía.
4. Verificar contraste en dark mode (`[data-theme="dark"]`) y confirmar que KDS/Muro quedan intactos.

**Criterio:** una captura del dashboard nueva al lado de una vieja se lee como la misma app, más cálida y con profundidad; contraste AA en ambos temas; KDS/Muro sin diff.

---

## S3 — Cartas de jugador fuera del Organigrama 🟠 Media

- [ ] Completado — fecha:

Extender `MiembroCard` (gradiente + badge + stats + flip) a los objetos que la app ya tiene. Ningún dato nuevo.

**Qué hacer:**

1. **Carta de plaza** — en la ventana de selección de plaza del Mise (que ya muestra el avance por plaza) y en el encabezado de columna del Muro: gradiente con `PLAZA_COLORS`/`plazaColor()` de `lib/constants.ts`, ícono de `PLAZA_ICONS`, avance del turno, quién la tiene, hora de entrega. Es la ventana que ya existe, vestida.
2. **Carta de plato** — en Carta y en Recetario → Platos: foto + food cost con su color semántico (verde <30 / amarillo 30-35 / rojo >35, ya definido) + gramaje por porción + el cuadrante de ingeniería de menú (**Estrella / Caballo / Puzzle / Perro**, ya calculado en Rentabilidad) como la "rareza" de la carta. Es el cromo más natural del negocio y no inventa un solo dato.
3. Flip al dorso con la ficha (componentes y procedimiento en el plato; ítems y notas en la plaza), mismo patrón 3D ya escrito.
4. **Extraer el patrón** a `components/ui/` en vez de copiar `MiembroCard` por tercera vez.

**Criterio:** las tres cartas comparten componente; el flip no rompe el scroll en mobile; nada muestra rendimiento por persona.

---

## S4 — Flujo rápido de trabajo 🟠 Media

- [ ] Completado — fecha:

**Qué hacer:**

1. **Acción del momento en el BottomNav**: el nav gana un slot contextual que cambia con el momento del día (fichar / abrir mise / control de carta / entregar plaza). Mismo cálculo del bloque "Ahora" de S1 — se resuelve una vez, se usa en los dos lados.
2. **Paleta de comandos (⌘K)** en desktop, sobre `useDesktopShortcuts` que ya existe, con las acciones que ya están implementadas como tools del Coach: crear tarea, registrar merma, marcar 86, sugerir producción, ir a pantalla.
3. **Swipe horizontal entre tabs de OPS** (Producción ↔ Mise ↔ Planificación ↔ Turno) en mobile — hoy son cuatro pills que se tocan con el pulgar en el borde superior de la pantalla.
4. **Secciones vacías colapsadas** en OPS: "IMPORTANTE — Sin avisos" y "PEDIDOS — Sin pedidos anotados" pasan a una línea con su `+`; el trabajo real sube media pantalla.

**Criterio:** desde el dashboard, la acción del momento está a **1 tap**; el swipe no compite con el drag de reordenar del mise (que es long-press vertical); nada de esto agrega una pantalla.

---

## S5 — Estados y pulido: el juego sin puntaje 🟡 Media

- [ ] Completado — fecha:

**Qué hacer:**

1. **Transición de estado del ítem**: pendiente → en curso → listo con cambio de color animado (tokens de S0) y "pop" del tilde. En el ciclo de tap del Muro y del mise, que ya tienen la máquina de estados.
2. **Cierre de plaza al 100%**: pulso ámbar en la carta de plaza + háptico, y el aviso persistente que ya existe hereda la forma. Nada de confetti global.
3. **Skeletons** en lugar de `Cargando…` en las tres pantallas más pesadas (Carta 3829 líneas, Recetario 3670, Stock 3396) — hoy el salto de layout al terminar de cargar se come el primer tap.
4. **Toasts unificados** sobre `toast-enter`, que ya está en `globals.css`.

**Criterio:** ninguna animación supera 300 ms; con reduced-motion todo sigue siendo legible; sin regresiones de tap en el mise.

---

## 4. Fuera de este plan

- **Rediseñar módulos internos** (Stock, Carta, Reportes). Son las pantallas más grandes del repo y tocarlas es otro proyecto, no una capa de superficie.
- **Cambiar la paleta base o el shell.** Navy + crema + el `#shell` responsivo se quedan como están (el ancho ya costó una sesión entera el 22/08).
- **Sonido.** Existe `lib/servicio/useAlertasSonoras.ts` para el servicio; ampliarlo a la app de gestión es una decisión aparte (cocina ruidosa, celular en el bolsillo).
- **Gamificación con puntaje.** Ver regla 1. Si alguna vez entra, entra por `PLAN-JUEGO-CERCADO`, no por acá.

---

## 5. Decisiones pendientes de Facundo

1. **Orden.** Sugerido: **S0 → S1 → S2 → S4 → S3 → S5**. S1 es lo que pediste; S2 es el que más cambia la foto por hora invertida; S3 es el más vistoso pero el que menos mueve el trabajo diario.
2. **Serif itálica (S2.3)**: ¿entra la segunda tipografía o la app se queda con DM Sans sola? Es el punto más "de marca" y el más discutible.
3. **Carta de plato (S3.2)**: mostrar el cuadrante de ingeniería (Estrella/Perro) en la carta del plato expone rentabilidad en una pantalla que ve todo el equipo — hoy precio y food cost son solo admin. ¿Se muestra solo a admin, o el cuadrante se queda en Rentabilidad?

Resuelto al ejecutar S1: la grilla de módulos en mobile quedó en **6 más usados + "Ver todos"** (expande inline en la misma pantalla, sin depender del BottomNav → Más). Frecuencia por dispositivo en `localStorage` (`kc_modulo_freq`), sin historial cae al orden ya priorizado de `GRID_MODULOS`.

---

## 6. Registro de sesiones

| Bloque | Fecha | Notas |
|---|---|---|
| S0 | 2026-08-24 | `lib/ui/motion.ts` (tokens + `useReducedMotion` + `tap()`). Transición de pantalla unificada en `app/(app)/layout.tsx`; `PageTransition` pasa a ser pass-through documentado (era no-op desde el commit inicial del repo). Se sacó `framer-motion` duplicado, todo consolidado en `motion/react` (7 archivos). Háptico `tap()` en tildar mise, despachar Modo Control y entregar plaza. Build + 135/135 tests verdes, verificado en dev server contra El Rescoldo (dashboard + selector de plaza + lista del mise). |
| S1 | 2026-08-24 | Bloque "Ahora" (`lib/dashboard/momento.ts` + `components/dashboard/AhoraCard.tsx`) arriba del Dashboard mobile y desktop — apertura/control de carta/servicio/fuera de turno, calculado con lo que ya existía. KPI "86 activos" deja de estar hardcodeado en 0 (`useEn86Count`, cuenta real `carta_items.disponible=false`). Banners rojos (pedidos atrasados + facturas) plegados en "Pendientes del negocio · N" debajo del bloque de trabajo, en vez de arriba de todo. Grilla de módulos mobile: 6 más usados (frecuencia en `localStorage`) + "Ver todos" expande inline. Desktop: la grilla de módulos sale de la columna principal (el sidebar ya navega). El CTA de Control de Carta se sacó de OPS (vivía suelto, competía con el mismo botón) — ahora solo vive en el bloque Ahora. Simplificación deliberada documentada en el código: no hay estado "cierre" propio en `momento.ts` — el avance del mise que ve el Dashboard es agregado de todas las plazas, no hay señal fiable de "mi plaza entregó" sin una plaza asignada real por persona. Build + 135/135 tests verdes; verificado en dev server (bloque Ahora, fold expandido, módulos expandidos, OPS sin el banner viejo). |
| S2 | 2026-08-24 | **Alcance recortado tras auditar el código, no solo capturas**: grepear los 167 usos de `#f59e0b`/`#f97316` mostró que el "ámbar overloaded" del diagnóstico original no era tan real — la app ya usa ámbar consistentemente como nivel medio de una escala de severidad (food cost, stock, prioridad del pase) en decenas de lugares legítimos y documentados; recolorear eso a ciegas rompía la escala, no la arreglaba. En vez de un barrido de 37+ archivos: documenté la convención real en `ui.md` § "Convención de color semántico" (ámbar=atención, naranja=marca/acción, rojo=crítico — ya coherente, no hacía falta tocar código) y **sí implementé lo demás de S2**: tokens `--shadow-1/2/3` en `globals.css` (light + dark, calibrados desde `MiembroCard`) aplicados a las superficies que ya tenía tocadas de S1 (`AhoraCard`, `MiPlaza`, tiles de `ModulosGrid`) en vez de un sweep global. Serif itálica: decidido que no (DM Sans sola). **Hallazgo sin tocar, anotado para otra sesión**: en dark mode `--navy` es un gris-azul claro (`#c8d6e5`, pre-existente, no de esta sesión) — todo texto blanco sobre fondo navy (header, MiPlaza, botón Iniciar turno, y ahora AhoraCard por el mismo patrón) tiene contraste pobre en dark mode. Es sistémico a todas las superficies navy, no algo que S2 haya introducido ni algo que se arregle tocando un componente — requiere su propia sesión. Build + 135/135 tests verdes; verificado en dev server en los dos temas; confirmado sin diff en `app/(servicio)/` (KDS/Muro/Salón intactos). |
