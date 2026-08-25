# DESIGN.md — Constitución visual de KitchenOS

Reglas duras y números. Base de evidencia: `INVESTIGACION-DISENO-2026-08.md`. Filosofía en prosa: `KitchenOS-ThermalOrder-DesignPhilosophy.md`. Convenciones de implementación y gotchas: `.claude/docs/ui.md`.
**Fuente canónica de valores: el código** (`app/globals.css`, `lib/ui/motion.ts`). Este archivo fija los **roles y los límites**; si un valor cambia en el código, se actualiza acá en el mismo commit.

---

## 1. Identidad en una frase

Los sistemas de gestión se usan *después* del trabajo; K-OS se usa *durante*. Se diseña para el cocinero de la hora 12, parado, con una mano, con la pantalla mojada. Cuando la venta (pitch, capturas, landing) choca con ese usuario, **gana el que tiene el teléfono en la mano** (Thermal Order).

Dial de personalidad: **7/10** — carácter claro, nunca demandante. Fórmula: **calma por defecto, carácter en los momentos** (tecnología calma: la información vive en la periferia y pasa al centro solo cuando hace falta).

## 2. Los dos registros

La restauración tiene dos tiempos (elBulli 7.2); la interfaz también. Toda pantalla pertenece a un registro y no se mezclan:

| | **Registro Preparación** | **Registro Servicio** |
|---|---|---|
| Capas | Preparar · Definir · Controlar | Ejecutar |
| Pantallas | Mise, Stock, Recetario, Carta, Pedidos, Reportes, Organigrama, Dashboard, Ajustes | KDS, Muro, OPS durante servicio |
| Carácter | Táctil, con materia: tarjetas, sombra, movimiento, juice al completar | HUD calmo: fondo fijo, **cero animación de entrada**, periferia, lectura a distancia |
| Dial | 7 | 2 |

El registro Servicio se diseña **quitando**, no agregando. Una pantalla nueva declara su registro antes de escribir el primer div.

## 3. Paleta (hex exactos y rol — `app/globals.css`)

| Token | Hex (light) | Rol — y nada más que ese rol |
|---|---|---|
| `--bg` | `#f4f2ee` | Crema de fondo. Nunca blanco puro como fondo de app. |
| `--surface` | `#ffffff` | Superficie de tarjeta. |
| `--navy` | `#1c2d4a` | Autoridad: headers, texto fuerte, el "chrome" del sistema. |
| `--navy-light` | `#2d4070` | Navy secundario. |
| `--accent` | `#4361a0` | Acento interactivo. |
| `--text` / `--text-2` / `--text-3` | `#1a2b4b` / `#64748b` / `#94a3b8` | Jerarquía de texto en 3 niveles. |
| `--border` | `#e2e8f0` | Borde hairline donde no hay elevación. |
| `--green` | `#10b981` | OK / confirmación / **celebración** (el pulse de plaza es verde, no ámbar). |
| `--yellow` (ámbar) | `#f59e0b` | **Atención** — nivel medio de la escala verde·ámbar·rojo. Excepción documentada: identidad de la plaza Menú. |
| `--red` | `#ef4444` | Crítico. Jamás sobre una persona (§9). |
| `--orange` / `--blue` | `#f97316` / `#3b82f6` | Severidad alta-media / informativo. |

- Ningún hex suelto en componentes: **todo color sale de un token**. Dark mode ya resuelto en `[data-theme="dark"]` — no se definen colores solo-dark en componentes.
- **Presupuesto de ámbar: ≤ 3 elementos ámbar simultáneos por pantalla.** Si una pantalla necesita más, el problema es de agregación (agrupar en un contador), no de color. (Fatiga de alarmas, salas de control.)

## 4. Tipografía

- **Una sola familia: DM Sans** (300–700) + **DM Mono** (400/500) solo para números tabulares vía `<Num>`. Decisión cerrada en S5: no hay segunda tipografía; la jerarquía se hace con peso, tamaño y tracking.
- Precios, cantidades y KPIs: siempre `<Num>` (`tabular-nums`) — los números que cambian no deben bailar de ancho.
- Iconos: **Material Symbols Outlined** únicamente. No emoji, no SVG custom.
- Registro Servicio: tamaños para lectura a ≥ 1 m de distancia — el texto operativo principal no baja de 16 px, los números clave se leen de reojo.

## 5. Forma y materia

- **Radios:** `12` tarjeta estándar · `10` control interno · `16` sheet/tarjeta grande · `99` pill (chips, tabs). No inventar otros.
- **Elevación = sombra azul, no borde** (S2). Tres niveles, tokens `--shadow-1/2/3` (halo `rgba(28,45,74,…)` — azul navy, nunca negro/gris en light): 1 = tarjeta en lista · 2 = tarjeta destacada · 3 = flotante (sheet, dropdown). Ninguna sombra fuera de token.
- La sombra es **jerarquía** (qué está más cerca del ojo), no decoración: si dos elementos compiten en elevación sin razón, uno miente.
- **Diegético antes que chrome:** el estado vive *en* el objeto — el progreso llena la carta de plaza, la rareza es el material del badge — antes que en barras o etiquetas flotantes (Dead Space / FUT).
- **Cartas (FlipCard, MiembroCard, PlatoCard): el frente se lee en ≤ 3 segundos.** Identidad dominante, stats secundarias en una línea, tier por material (gradiente/acabado), no por texto. El dorso: resumen + a lo sumo 1–2 acciones, nunca un editor.

## 6. Movimiento

Tokens en `lib/ui/motion.ts` — `DURATION.instant` 120 ms · `base` 200 ms · `enter` 260 ms · `EASE_OUT [0.16,1,0.3,1]` · `SPRING_SHEET`. Librería `motion/react` (jamás `framer-motion` aparte); micro-estados de listas largas en CSS puro (S5).

**El presupuesto se asigna por frecuencia del evento** (Swink: respuesta → espacio → juice; Rauno: lo frecuente no se anima de más):

| Evento | Frecuencia | Presupuesto |
|---|---|---|
| Tap / feedback de control | ~100×/turno | 120 ms + háptico `tap()`. Casi invisible. |
| Cambio de estado (tildar, badge, barra) | ~40×/turno | 200 ms. Se nota apenas. |
| Entrada de pantalla / sheet | ~20×/turno | 260 ms / `SPRING_SHEET`. Se disfruta. |
| Cerrar una plaza | 1×/turno | `plaza-pulse` verde + `tap(20)`. Momento chico. |
| Cerrar la apertura del día | 1×/día | El único evento con presupuesto de **momento** real. |
| Registro Servicio (KDS/Muro) | — | **0. Siempre.** |

- Continuidad espacial (Material): card→detalle = *container transform*; hermanos = *shared axis* (el swipe de OPS); sin relación = *fade through*. El movimiento dice de dónde vino y a dónde vuelve.
- Solo `transform`/`opacity` (nada que dispare layout). **Nunca animar la posición de un target tappable.**
- **Gestos interrumpibles**: siguen al dedo y se devuelven a mitad de camino (Kowalski). Todo respeta `useReducedMotion()` → duración 0, valor final aplicado igual. `tap()` es táctil, independiente de reduced-motion.
- Si una animación no comunica cambio de estado, continuidad espacial o confirmación, **no va**.

## 7. Interacción

- **Targets: ≥ 56 px en superficie de servicio** (guante fino, ISO/TS 9241-411); 44 px solo en pantallas de gestión desktop. Separación ≥ 11 px.
- **Optimistic UI + undo** en toda acción idempotente y reversible (tildar, completar, mover). Sin spinner ni skeleton en la acción repetida — el estado de carga correcto es *ninguno*. Skeletons solo para carga inicial de pantalla.
- **Undo > confirmación.** Ningún "¿estás seguro?" en flujo de servicio; deshacer visible 5 s (toast). Ninguna acción destructiva detrás de un gesto (agua conductiva → toques fantasma).
- **Gesto = acelerador, jamás única vía.** Todo swipe tiene equivalente tappable y una affordance visible (peek/chevron).
- Evitar scroll largo en servicio (manos grasosas): paginado, colapsables, una decisión por pantalla (Hick).
- **"¿Dónde estaba?":** toda tarea en cocina se interrumpe. Al volver a la app tras >2 min, la pantalla ofrece la señal de contexto (lo último tocado, el bloque «Ahora») antes que un estado neutro.

## 8. Presupuestos medibles (los verifica el lint de diseño, P5)

| Presupuesto | Valor | Cómo se mide |
|---|---|---|
| Respuesta a interacción | **INP ≤ 200 ms** (p75) | Web Vitals / Vercel Analytics |
| Target táctil en rutas de servicio | **≥ 56 px** | Playwright, bounding boxes |
| Ámbar simultáneo por pantalla | **≤ 3** | Playwright, conteo por color computado |
| Colores fuera de token | **0** | grep de hex en componentes |
| Sombras fuera de `--shadow-*` | **0** | grep de `box-shadow` literal |
| Duraciones fuera de `motion.ts` | **0** | grep de `duration:` literal |
| Frente de carta legible | **≤ 3 s** | revisión manual con captura |

## 9. Tono — el tablero es del equipo

- **Nada de rendimiento individual expuesto:** el juego es el turno y la plaza — sin ranking de personas, sin cronómetro comparativo, sin "empleado del mes". Un juego sin oponente produce culpa, no bronca (juego cercado III): el desvío se pinta **sobre la tarea** (ámbar en el ítem), jamás sobre la persona (nada rojo en un avatar; el Coach corrige el dato, no a la persona).
- El estado de los compañeros se muestra en **periferia** (avatar + progreso, estilo panel de escuadra co-op), nunca como comparación.
- La celebración es **colectiva** (quest del día, cierre de apertura) y el fallo es **suave** (Overcooked: descuento chico, aire para coordinarse — nunca pantalla de derrota).
- El sistema no coloniza el afuera: sin notificaciones ni métricas sobre el descanso o el perso.

## 10. Prohibido

- Segunda familia tipográfica · emoji o SVG custom como iconos · Chart.js (gráficos = divs CSS).
- Gradiente violeta-azul, glassmorphism, neón, estética de plantilla.
- Hex, sombras, radios o duraciones fuera de token.
- Animación de entrada en Registro Servicio; animar posición de tappables; stagger con translate en listas interactivas.
- Modales de confirmación en flujo de servicio; gestos como única vía; acciones destructivas detrás de un gesto.
- Rojo sobre personas; rankings individuales; exponer error personal en tiempo real.
- Tabs/chips/empty states/avatares/números propios por pantalla — todo sale de `components/ui/` (regla de oro de `ui.md`).

## 11. Mantenimiento

Este archivo cambia poco y por decisión, no por deriva. Antes de una pantalla nueva: declarar registro (§2) y presupuesto de movimiento (§6). Antes de deploy de UI: correr el lint de diseño (§8) cuando exista (P5). Si una regla molesta tres veces seguidas, se discute y se cambia acá — no se esquiva en el componente.
