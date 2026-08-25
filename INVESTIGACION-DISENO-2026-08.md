# Investigación de diseño — agosto 2026 (v2, ampliada)

Base de evidencia para `DESIGN.md` y para el rediseño de superficie (nivel 2, post PLAN-SUPERFICIE S0–S5).
Contexto: vitrina = **Mise**. Dial de personalidad = **7/10**. Audiencias = **cocinero + venta**, gana el cocinero cuando chocan.
v2 integra: `FUNDAMENTO-EL-JUEGO-CERCADO.md`, `SINTESIS-ORGANIZACION-GASTRONOMICA.md`, `AUDITORIA-4-CAPAS.md`, memorias de Organigrama, + 8 fuentes externas nuevas (game feel, co-op, cartas de jugador, tecnología calma, relevo clínico, INP).

---

## 0. Ergonomía física de la cocina (el frente que faltaba)

Guantes, manos mojadas, grasa, vapor, lectura a distancia, ruido. El único frente con normas internacionales y números duros — y nadie del rubro lo aplica.

**Tamaño de target táctil (ISO/TS 9241-411, ISA 101, IEC 61131):**

| Condición | Mínimo físico | ≈ CSS px |
|---|---|---|
| Dedo desnudo | 12 mm | ~45 px |
| Guante fino (nitrilo/latex) | 15 mm | ~57 px |
| Guante grueso de trabajo | 19 mm | ~72 px |
| Control crítico (ISA 101) | 25 mm | ~95 px |
| Separación entre targets | ≥ 3 mm | ~11 px |

Los 44 px de Apple / 48 dp de Google son el nivel **dedo desnudo**. Regla propuesta: **56 px mínimo en superficie de servicio**, 44 px solo en gestión de escritorio.

**Manos mojadas** (agua = conductiva → toques fantasma): ninguna acción destructiva detrás de un gesto; **undo en vez de confirmación** (un modal con las manos mojadas agrega un toque en el momento de mayor torpeza). **Grasa:** los estudios de KDS piden evitar scroll largo — paginado, colapsables y swipe discreto antes que listas infinitas.

---

## 1. Velocidad y fluidez

- **Umbral de Doherty (IBM 1982):** respuesta < **400 ms** o el cerebro pasa de "haciendo" a "esperando".
- **INP (Core Web Vital, reemplazó a FID en 2024):** bueno ≤ **200 ms** en p75; 200–500 necesita mejora; >500 pobre. **Es la métrica medible del presupuesto de fluidez** — auditable con datos de campo de Vercel/CrUX.
- **Skeletons vs spinners:** percepción 20–30 % más rápida con skeleton (Viget; paper 2018) — pero el mismo paper: con spinner la tarea se completó *más rápido* la primera vez. Ganan en percepción, no en velocidad.
- **Optimistic UI:** actualizar ya, corregir solo si falla. Sin indicador de carga.

**Para el Mise:** ni skeleton ni spinner en la acción repetida. Tildar es idempotente y reversible → **optimistic + undo, estado de carga = ninguno**. Skeletons quedan para carga inicial de pantalla (S5.3, ya hecho).

---

## 2. Reglas de interacción

- **Zona del pulgar:** 49 % sostiene con una mano, 75 % de interacciones con el pulgar. Acción primaria abajo (BottomNav ya lo cumple).
- **Fitts + §0:** en cocina el tamaño pesa más que la distancia. **Hick:** en servicio, una pantalla = una decisión.
- **Descubribilidad de gestos:** invisibles hasta aprenderse; se descubren por accidente o instrucción. → affordance visible (peek, chevron) + **gesto = acelerador, jamás única vía**.
- **Rauno Freiberg (Vercel), Web Interface Guidelines:** *"acciones frecuentes y de baja novedad evitan animación extra"* — valida el presupuesto de movimiento por frecuencia.

---

## 3. Movimiento — vocabulario resuelto por otros

- **Material Motion, 4 patrones:** *container transform* (card→detalle), *shared axis* (el swipe de OPS), *fade through*, *fade*. Principio: **continuidad espacial** → mapa mental confiable de dónde vive cada cosa.
- **Emil Kowalski (Linear; autor de Sonner/Vaul):** transform/opacity primero (no layout thrash), spring vs CSS, **gestos interrumpibles** (un swipe arrancado debe poder devolverse siguiendo el dedo — hoy los nuestros no), reduced-motion.

---

## 4. Game feel — la jerarquía que ordena todo el trabajo

**Steve Swink, *Game Feel*: game feel = control en tiempo real + espacio simulado predecible + polish. En ese orden y no en otro:**

1. **Respuesta instantánea** — un juego que no responde al instante no puede sentirse bien por más polish que tenga. (= §1: INP ≤ 200 ms, optimistic UI.)
2. **Espacio predecible** — lo simulado se comporta como el jugador espera. (= §3: continuidad espacial, container transform.)
3. **Juice** — squash/stretch, partículas, sonido: **amplifica lo que ya funciona**, no lo arregla.

**"Juice It or Lose It" (Jonasson & Purho, 2012)** y **"The Art of Screenshake" (Nijman/Vlambeer, 2013):** capas de satisfacción sobre un juego que *ya funciona*. Las técnicas de peso vienen de los 12 principios de Disney.

**UI diegética (Dead Space, el RIG):** la información vive **dentro del objeto**, no flotando encima → el progreso va *en* la carta de plaza que se llena, no en una barra de chrome. Consistencia de color y forma de aparición en todos los contextos.

**Límite:** el juice es para eventos **discretos, raros, de alto impacto**. En herramienta de trabajo: cerrar la plaza (1×/turno), cerrar la apertura (1×/día). Jamás en el tap #40.

---

## 5. Juegos cooperativos — el estado compartido ES el diseño

Este frente conecta directo con la doctrina "el juego es el turno y la plaza, nunca la persona":

- **Overcooked (Ghost Town Games):** la cooperación no se pide, se **produce por diseño** — comandas, estado de hornallas y de ingredientes visibles para todos; los roles emergen solos de ver el mismo tablero. Y el fallo es **suave**: la comanda perdida descuenta poco, para dejar aire a coordinarse. *Un juego ambientado en una cocina eligió como mecánica central exactamente lo que K-OS es: un tablero compartido.*
- **Deep Rock Galactic / Left 4 Dead — el panel de compañeros:** estado de cada compañero **siempre visible en periferia** (salud, estado especial), sin ocupar el centro; señalización por contexto (ping/marcar) en vez de texto. El patrón: *awareness ambiente del equipo, jamás intrusivo, jamás comparativo*.
- **Duolingo Friends Quests:** objetivo **colectivo** con progreso agregado, el equipo reparte el trabajo como quiere, recompensa compartida. Gamificación cooperativa sin leaderboard — el molde exacto para "la apertura del día" como quest del equipo.

**Traducción:** en el Mise, las otras plazas se ven de reojo (avatar + anillo de progreso, estilo panel de compañeros), el objetivo del día es uno solo y agregado, y el error nunca se pinta como falla personal.

---

## 6. Cartas de jugador — la regla de los 3 segundos

El fundamento compara el restaurante con un **club de fútbol** (plantel, DT, posiciones, mercado de pases) y el Organigrama ya shippeó `MiembroCard` como carta de jugador. La referencia real madura — **FIFA Ultimate Team**, 15 años de iteración — aporta reglas concretas:

- **El core de la carta se lee en ≤ 3 segundos.** Identidad (foto/avatar + nombre) domina; stats secundarias en **una sola línea** abajo (FUT las movió de dos columnas a una línea para dar aire a la identidad).
- La rareza/tier se comunica por el **material de la carta** (color/acabado), no por texto. Nuestro gradiente por `nivel` en MiembroCard y el badge de rareza en Carta (Estrella/Caballo/Puzzle/Perro) ya van por ahí.
- Guardrail nuestro que FUT no tiene: la carta muestra **composición** (plazas, módulos, antigüedad), nunca rendimiento individual (doctrina juego-cercado cap. VI: juegos sin oponente producen culpa, no bronca).

---

## 7. Tecnología calma — el contrapeso del jugo

**Weiser & Brown (Xerox PARC, 1995) / Amber Case, *Calm Technology*:** la tecnología calma **se mueve entre la periferia y el centro de la atención** — informa desde la periferia sin sobrecargar, y pasa al centro solo cuando hace falta. *"La tarea primaria de una persona no es computar, es ser humana."*

**Es el marco para "uso constante que no agota":** una app que se usa 40 veces por turno no puede pedir atención 40 veces. El dial 7 se resuelve así: **calma por defecto, carácter en los momentos**. La periferia (estado de plazas, progreso del día, ámbar de atención) informa sin interrumpir; el centro (completar, cerrar, celebrar) tiene el carácter.

**Fatiga de alarmas (salas de control):** alarmas excesivas → se pierden las críticas. Métrica nueva: **presupuesto de ámbar ≤ 3 simultáneos por pantalla** (S2 auditó coherencia; faltaba auditar densidad). **Conciencia situacional dirigida por eventos:** el sistema empuja al frente lo relevante al cruzarse un umbral (ahorra 30–60 s) — valida el bloque «Ahora» como patrón. **HFES:** 15–25 % de caída de velocidad por cambio de contexto. **Recuperación tras interrupción:** en una cocina toda tarea se interrumpe — la pregunta frecuente no es "¿qué hago?" sino **"¿dónde estaba?"** → señal de contexto al volver (principio de diseño, no feature).

---

## 8. El relevo de turno — evidencia clínica (SBAR)

La entrega de turno de enfermería es el análogo profesional más estudiado de nuestra "zona de relevo" (juego-cercado §9.2). **SBAR** (Situation–Background–Assessment–Recommendation) estructura el traspaso y los resultados medidos son enormes: efectividad de comunicación de **77 % → 100 %**, reducciones significativas de errores de traspaso, más teamwork y confianza. Ya existe implementación digital (checklist ISBAR en tablet).

**Traducción directa:** la entrega de plaza / cierre de turno (F1 de `PLAN-JUEGO-CERCADO`) no es un campo de percepción suelto — es un **protocolo de 4 pasos con forma propia**: *Situación* (cómo quedó la plaza, dato duro auto-completado) → *Contexto* (qué pasó: 86s, mermas, imprevistos) → *Lectura* (bien/regular/complicado) → *Recomendación* (qué debe saber el que entra). Auto-completar 1 y 2 desde datos; 3 y 4 son los 2-3 taps humanos.

---

## 9. Síntesis con la investigación gastronómica propia

### 9.1 Los dos tiempos (elBulli 7.2) → dos registros de interfaz

*"La restauración tiene dos tiempos muy marcados con su modo de funcionar característico."* Primera fase (todo lo que prepara el servicio) / segunda fase (el servicio mismo). El juego cercado agrega: ejecución optimiza **no variar** (fricción mínima, cero decisiones); fuera de servicio vive la autoría. Y `ui.md` ya tiene la regla suelta "KDS y Muro no se tocan".

**La generalización — el hallazgo de diseño de esta investigación:** eso no es una lista de excepciones, es un **sistema de registros**. La interfaz de K-OS tiene dos temperaturas, mapeadas a las 4 capas:

| Registro | Capas | Pantallas | Carácter |
|---|---|---|---|
| **Registro Preparación** | Preparar + Definir + Controlar | Mise, Stock, Recetario, Carta, Pedidos, Reportes, Organigrama | Táctil y con materia: tarjetas, peso, sombra, movimiento, juice al completar. Acá vive el dial 7. |
| **Registro Servicio** | Ejecutar | KDS, Muro, OPS en servicio | HUD calmo: fondo fijo, cero animación de entrada, información en periferia, tipografía a distancia. Dial 2. |

Ningún software de gestión hace esto — todos son un solo registro (el formulario). **Que la app cambie de temperatura con el momento del día es la identidad.**

### 9.2 El día tipo (elBulli 10.4) = el mapa horario de la app

La línea 9h→1h del día real es el mapa de "cuándo se usa cada pantalla". Bloque «Ahora» y nav contextual (S1/S4) ya lo hacen; el registro visual (§9.1) lo completa: la app **abre en el registro del momento**.

### 9.3 Las tres escalas (juego cercado III) = tres unidades visuales

- **Plato/tarea** — rutina juzgada, sin revancha → la interacción atómica: tilde, optimistic, feedback inmediato.
- **Servicio/turno** — partido remontable → progreso agregado del equipo, curva, remontable visualmente (nunca "vas perdiendo").
- **Día** — *"si la mise puntúa antes del silbato, la unidad de competencia es el día"* → la quest colectiva: apertura → servicio → cierre como un solo arco con su momento de cierre.

### 9.4 Sincronía: la unidad de éxito es la mesa, no el plato

En Ejecutar, la visualización correcta agrupa por **mesa/convergencia**, no por ítem suelto. (Para el KDS futuro; hoy: el Muro ya agrupa.)

### 9.5 Culpa, no bronca (juego cercado III)

Juegos sin oponente producen culpa. Regla de tono transversal: el desvío se pinta como **dato del tablero compartido** (ámbar sobre la tarea), jamás como falla de la persona (nada rojo sobre un avatar; el Coach corrige el dato, no a la persona). Ya es doctrina; ahora tiene fundamento y entra al `DESIGN.md`.

### 9.6 Los 5 criterios de mise (elBulli 7.4) — algoritmo, no estética

Disponibilidad → tiempo → atención → vida útil → tipo de tarea: es el **orden sugerido** de la lista del Mise, listo para implementar. La mejor superficie es la que además de verse bien, ordena bien. (Hueco funcional detectado por la investigación de diseño — anotar en `PENDIENTES.md`.)

### 9.7 "Querer controlarlo todo es la mejor manera de no controlar nada"

Todo lo nuevo de este plan es **progresivo y desactivable**; ninguna capa bloquea a otra por estar vacía. El SBAR de entrega es opcional y de 2-3 taps, no un formulario obligatorio.

---

## 10. El plan enriquecido

Orden interno de cada bloque = jerarquía de Swink: **respuesta → espacio → juice**. El movimiento cierra, no abre.

**P0 — `DESIGN.md`, la constitución visual.** Un archivo corto y duro: paleta con hex y rol de cada color · escala DM Sans · radios/spacing · 3 niveles de sombra azul con valores · **los dos registros** (§9.1) y qué pantalla vive en cuál · presupuesto de movimiento por frecuencia del evento · presupuestos medibles: INP ≤ 200 ms, targets ≥ 56 px en servicio, ámbar ≤ 3/pantalla, carta legible en ≤ 3 s · reglas negativas (sin segunda tipografía, sin Chart.js, sin ranking de personas, sin rojo sobre personas, cero movimiento en Registro Servicio, nunca animar posición de tappable, ninguna sombra/hex fuera de token, gesto nunca única vía).

**P1 — Investigación visual dirigida (Game UI Database + Interface In Game).** Consultas concretas: paneles de compañeros co-op · progreso que llena el objeto (diegético) · celebración de objetivo colectivo · cartas/tiers por material. Salida: 5-6 patrones traducidos a navy/ámbar/crema, no moodboard.

**P2 — Mise, la vitrina.** (a) Respuesta: optimistic + undo en tildar, medir INP; (b) espacio: container transform carta→detalle, targets 56 px, orden por los 5 criterios; (c) equipo: panel de compañeros periférico (otras plazas: avatar + anillo, sin ranking) + quest del día colectiva; (d) juice al final: cierre de plaza (existe el pulse) + cierre de apertura con presupuesto de momento real (1×/día).

**P3 — Entrega de turno como relevo SBAR.** Absorbe F1 de `PLAN-JUEGO-CERCADO`: 4 pasos, 1-2 auto-completados con datos, 3-4 humanos en 2-3 taps, opcional. Con la señal de contexto "¿dónde estaba?" al volver a la app.

**P4 — Registro Servicio en limpio.** Formalizar el HUD calmo: auditoría de densidad de ámbar, información en periferia, "empujar al frente" por evento (patrón «Ahora» en OPS), tipografía a distancia. Sin agregar movimiento — quitando lo que sobre.

**P5 — Lint de diseño (Playwright, CSS/DOM, sin LLM juez).** Verifica el `DESIGN.md`: hex fuera de paleta, sombras fuera de token, targets < 56 px en rutas de servicio, conteo de ámbar por pantalla, duraciones fuera de `motion.ts`. Corre antes de deploy; evita la erosión en la sesión 40.

**Dependencias:** P0 bloquea todo; P1 alimenta P2; P2–P4 independientes entre sí; P5 al final pero su checklist nace en P0.

---

## 11. P1 ejecutado — patrones de Game UI Database / Interface In Game, traducidos

**Nota de método:** ambos sitios bloquean el fetch directo (403, protección anti-bot — son bases de datos de imágenes, esperable). En vez de navegar la galería, reconstruí el mismo terreno con juegos concretos y documentados por fuera — mismo tipo de evidencia que citaría el propio inspector de GUIDB (juego, mecánica, por qué funciona), verificable en cada caso. Sale más sólido que un moodboard: son 6 patrones con mecánica explicada, no capturas sueltas.

**1. Overwatch — el panel de compañeros, patrón de referencia.** Salud + carga de definitiva + ícono de héroe de los 3 compañeros, en fila fija a un costado de pantalla — nunca al centro. Es exactamente el "panel de escuadra" que pedía §5 de la v1, ya con años de iteración de un estudio que vive de esto.
→ **Traducción:** en el Mise, un riel lateral/inferior discreto con las otras plazas — avatar + anillo de progreso, navy sobre crema, sin números de tiempo ni comparación. Se mira de reojo, no ocupa el centro.

**2. Valorant — el medidor de definitiva, de barra a ícono circular.** La serie iteró 5 años: pasó de puntitos que nadie entendía a un ícono circular limpio, integrado al HUD del jugador. La lección no es la forma final sino el criterio: **cuando un indicador es ambiguo, se reemplaza por una forma reconocible, no por una etiqueta de texto.**
→ **Traducción:** el estado de una tarea del Mise (pendiente/en curso/lista) es forma y color, nunca la palabra "pendiente" escrita.

**3. Deep Rock Galactic — diales diegéticos en la maquinaria del mundo.** Los objetivos de misión tienen diales y barras físicas *en la maquinaria del juego*, que progresan con el objetivo — no HUD flotante.
→ **Confirma y concreta** lo que v1 tomó de Dead Space: el progreso de una plaza va *en* la carta que se llena (ya diseñado como dirección en `FlipCard`), nunca en una barra de chrome aparte.

**4. Monster Hunter World — rareza de equipo por progresión de color/material, sin texto.** El material y el color de una pieza *avanzan visualmente* con la rareza (rango bajo → alto); se lee de un vistazo antes de leer el número.
→ Confirma la regla ya escrita en `DESIGN.md` §5 (tier por gradiente/material, no por texto) — con un ejemplo de 8 niveles que muestra que la progresión escala sin volverse ilegible.

**5. Hearthstone — vocabulario mínimo de rareza: una gema de color + un tratamiento especial para el techo.** 4 colores de gema (blanco/azul/violeta/dorado) para 4 tiers, más un tratamiento *categóricamente distinto* (marco dorado + ilustración animada) reservado solo para el nivel más alto — nunca un quinto color más, un salto de tipo.
→ **Aporte concreto y accionable:** el badge de rareza de Carta (Estrella/Caballo/Puzzle/Perro) puede tomar esta regla tal cual — 3 niveles por color/forma normales, y el nivel tope (si existe) no es "un color más", es un tratamiento distinto (animación breve al entrar, borde con textura). Barato de implementar, con precedente de 10+ años en el juego de cartas más pulido que existe.

**6. Persona 5 — el límite de advertencia, no un modelo a seguir.** Es el caso más citado de personalidad al extremo: tipografía que se mueve, contraste altísimo, quiebra deliberadamente la neutralidad de un menú. Reconocible a un metro de distancia — pero la propia crítica especializada señala que la tipografía con ejes dinámicos y líneas de base variables **compromete la legibilidad** en nombre del estilo.
→ **Es la prueba viva de qué pasa pasado el dial 7-8.** Sirve como ancla del límite superior: KitchenOS quiere carácter reconocible sin pagar el precio de legibilidad que paga Persona 5 — útil precisamente como el punto que *no* se toca.

### Sin evidencia sólida (se descarta, no se fuerza)

Cook Serve Delicious / Overcooked como referencia de *timers de cocción visuales* — la búsqueda no devolvió mecánica documentada de forma verificable (solo resultados genéricos de "cómo saber si algo está cocido"). No se incluye como patrón: mejor no forzar una referencia sin poder mostrar cómo funciona de verdad. Overcooked ya está bien cubierto en v1 §5 por su mecánica de cooperación, que sí tiene fuente sólida.

---

## Fuentes

**Externas:** Laws of UX (Doherty) · web.dev (INP) · ISO/TS 9241-411, ISA 101, IEC 61131 · Viget + paper 2018 skeleton screens · Rauno Freiberg (rauno.me) · Emil Kowalski (animations.dev) · Material Design Motion · Steve Swink, *Game Feel* · Jonasson & Purho, *Juice It or Lose It* (2012) · Nijman, *The Art of Screenshake* (2013) · Dead Space RIG (Visceral) · Ghost Town Games, *Overcooked* (deep dive en Game Developer) · *Deep Rock Galactic* / *Left 4 Dead* (paneles de equipo) · Duolingo Friends Quests · FUT card design (evolución FIFA 09→FC 24) · Weiser & Brown (PARC 1995) / Amber Case, *Calm Technology* · SBAR (scoping reviews de handover clínico) · HFES (cambio de contexto) · Smashing Magazine (thumb zone) · Overwatch / Valorant HUD (evolución documentada) · Monster Hunter World (rareza de equipo) · Hearthstone (rareza de cartas, Fandom/wiki.gg) · Persona 5 UI (múltiples análisis de diseño, incluido Game UI Database).

**Propias:** `FUNDAMENTO-EL-JUEGO-CERCADO.md` (club de fútbol, 3 escalas, 2 juegos, culpa/bronca, acta) · `SINTESIS-ORGANIZACION-GASTRONOMICA.md` (dos tiempos elBulli 7.2, día tipo 10.4, 5 criterios 7.4, checklist de carta 10.1) · `AUDITORIA-4-CAPAS.md` · memorias `project_organigrama`, `project_cuadro_cuatro_capas`, `project_fundamento_juego_cercado`.

## Estado del plan

P0 (`DESIGN.md`) y P1 (este §11) cerrados — commit `c8f6da9` + el presente.

**P2 — Mise vitrina — ejecutado en 4 bloques verificados (build + tsc + 164/164 tests c/u), con Sonnet:**
- `fbd34b2` — targets táctiles (hit-slop), sin `window.confirm()` nativo (reemplazado por `ConfirmSheet` propio en "Entregar plaza"/"Marcar salida"), panel de compañeros en periferia (puntos de color por plaza, patrón Overwatch, dentro del selector de plaza/turno).
- `8753bc4` — entrada suave grilla↔plaza (fade+scale, tokens de `motion.ts`, respeta reduced-motion).
- `9337db9` — entrada animada en los avisos de cierre de plaza (reusa `.toast-enter`).
- `7d31d1f` — quest del día colectiva (apertura + cierre, todos los turnos, todo el equipo), con celebración una vez por jornada. Alcance confirmado con Facundo vía pregunta directa (era ambigüedad de producto real, no llamada de ejecución).

**Deferido explícitamente, no incumplido:** el *container transform* completo (la carta de plaza morfando literalmente hacia el header de la lista, con `layoutId` compartido) requiere fusionar los dos `return` de `ChecklistPage` en un único árbol con `AnimatePresence` — restructuración real de control de flujo en un componente de 2700 líneas. Documentado en el código (`app/(app)/checklist/ClientView.tsx`, comentario junto a `screenEnter`) como su propio bloque futuro, mismo criterio que S3 le dio a `FlipCard`.

**P3 — Entrega de turno como relevo SBAR — cerrado (`0e3f99c`):** migración `cierres_turno.percepcion`/`notas_servicio` (aplicada en prod vía MCP), `entregarPlaza()` los persiste, `EntregaPlazaSheet` los pide en 2-3 taps opcionales. Absorbe `PLAN-JUEGO-CERCADO-2026-08.md` F1 pasos 1-2 (el paso 3 — mostrar la lectura junto a un dato duro en Reportes → Auditoría — queda pendiente, no es parte de este plan de superficie).

**P4 — Registro Servicio en limpio — cerrado (`2367043`):** auditoría de KDS/Muro contra su propia doctrina ya escrita (`.claude/docs/ui.md` § Vista de servicio, "botones masivos ≥64px", regla inamovible) — no reglas nuevas. Encontrado y corregido: `window.confirm()` nativo al marcar 86 en KDS (misma familia que el de Mise en P2.1, reemplazado por sheet oscuro propio del registro), y dos targets por debajo del mínimo documentado (header de KDS 44→64px, `FilaMuro` — la interacción de mayor frecuencia del Muro — 44→64px). Cero animaciones nuevas: el objetivo era quitar/formalizar, no agregar.

Quedan: el container-transform diferido de P2 (§ arriba), y P5 (lint de diseño en Playwright) — que ahora tiene sentido escribir, con 4 bloques de código real para verificar contra el `DESIGN.md`.
