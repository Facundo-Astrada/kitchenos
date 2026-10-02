# Plan — El Asistente al centro (oct 2026)

> Sesión de planificación 24/09/2026. Nada de esto está construido. Referencias visuales del
> usuario en `IDEAS.2026/nuevo diseño/inicio/` (HUD Iron Man, XSIAM Command Center, terminal
> sci-fi, home de ChatGPT).

## 0. La idea en una línea

El Kitchen Coach deja de ser un botón flotante y pasa a ser **la pantalla de inicio**: a la
izquierda el asistente, a la derecha un **lienzo** donde aparecen los datos que le pedís. Y deja
de esperar a que le pregunten: **le avisa a cada persona lo que le toca según su puesto**, en el
momento justo y sin molestar.

---

## 1. Qué ya existe (no se construye de cero)

| Pieza | Dónde | Estado |
|---|---|---|
| Coach con 20 tools (consulta + carga), streaming, confirmación de acciones, memoria cross-device | `app/api/coach/route.ts`, `lib/coach/tools/`, `coach_conversaciones` | Vivo |
| Panel del Coach reutilizable | `components/coach/CoachPanelContent.tsx` (404 l.) dentro de `KitchenCoachFAB.tsx` (888 l.) | Vivo |
| Notificaciones in-app + push, un solo punto de entrada | `lib/notificaciones/crear.ts` → `crearNotificacion()` | Vivo, **push sin VAPID en Vercel** |
| Campana + feed | `components/notificaciones/NotificacionesBell.tsx`, `useNotificaciones` | Vivo |
| Cron de avisos | `app/api/cron/avisos` (08:00 diario), **modo seco** hasta `AVISOS_ACTIVOS=1` | Vivo, apagado |
| Quién hace qué | `puesto_descripciones.responsabilidades` / `dia_tipo` / `jornada` | Vivo, 0 vigentes en Bros |
| Cuándo pasan las cosas | `proveedores.dias_entrega`, `rutina_turno_items.horas/dias_semana`, `stock_sectores.ultimo_conteo_at`, turnos de servicio | Vivo |
| Momento del día en el home | `lib/dashboard/momento`, `AhoraCard` | Vivo |
| Costo de IA imputado + tope | `ia_uso`, decisión 008 | Vivo |

El cambio **es la mayor parte de lo que falta para que el Coach sea un asistente**, pero no es
un módulo nuevo: reordena el home y pone en marcha los avisos que ya existen. Cabe en el argumento
de la decisión 013 ("hace que se use lo que ya existe"). **Excepción:** la Fase 6 (rediseño visual
de toda la app) no cabe ahí y se decide aparte.

---

## 2. Qué hacen las apps de IA para retener (y qué se copia)

### En pantalla

| Patrón | Quién | Qué se copia en K-OS |
|---|---|---|
| **Pantalla vacía con una pregunta y un campo de texto al centro** ("What can I help with?") | ChatGPT, Claude, Gemini | Sí: saludo por momento del día + input + dictado por voz |
| **Sugerencias en chips** debajo del input, que cambian según el contexto | todos | Sí, pero **por puesto y momento**: a León a las 9 del lunes le aparece "Armar pedido de la semana", no "Brainstorm" |
| **Panel lateral de trabajo** (el chat pide, el panel muestra el resultado) | Claude Artifacts, ChatGPT Canvas, Gemini Canvas | Sí, es **el lienzo**. Los datos se muestran como tabla/tarjeta/lista, no como un párrafo |
| **Memoria visible y editable** ("Claude recuerda que…", borrable) | ChatGPT Memory, Claude | Sí: las rutinas y lo que el asistente sabe de cada puesto se pueden ver y editar |
| **Streaming**: el texto aparece mientras se escribe, así la espera se siente corta | todos | Ya está |
| Proyectos / historial en la barra lateral | ChatGPT, Claude | A medias: historial sí; "proyectos" no hace falta |

### Proactividad y notificaciones

| Patrón | Quién | Lección |
|---|---|---|
| **Resumen diario asincrónico**: un set chico de tarjetas preparado de noche, se lee en 2 min y **termina** | ChatGPT Pulse | El mejor modelo para K-OS: un **brief finito** por puesto, no un feed infinito |
| **Tareas programadas en lenguaje natural** ("todos los lunes a las 8 decime…") | ChatGPT Tasks, Gemini Scheduled Actions | Sí: el usuario le pide la rutina al asistente y queda en una lista editable |
| **Niveles de interrupción** (pasivo / activo / sensible al tiempo / crítico) + resúmenes agrupados | iOS, Android | Sí, 4 niveles (ver §4). Agrupar: "3 cambios en recetas de Fríos" en vez de 3 avisos |
| **Bandeja con triage** (leído = sale de la vista, sigue en el historial) | Linear Inbox, Slack | Es exactamente la idea de la campana → popup |
| **Rachas y culpa** ("¡Vas a perder tu racha!") | Duolingo | **No va.** Choca con DESIGN.md §9: nada de rendimiento individual, nada de culpa |

**Aclaración importante.** Las apps de consumo miden éxito por *tiempo en la app*. K-OS tiene que
medir lo contrario: **cuántas cosas se resolvieron desde el aviso sin tener que buscarlas**. Un
cocinero que abre la app menos veces y el pedido igual sale el lunes es la victoria. La métrica
del asistente es *aviso → acción*, no aperturas.

### Reglas para que avise sin molestar (del research, filtradas a una cocina)

1. **Cada interrupción tiene que ganarse su lugar**: solo hay push si hay algo que hacer *ahora*.
   Lo demás va al brief o a la bandeja.
2. **Nunca durante el servicio** salvo urgente: si la persona está fichada en un turno de servicio,
   los avisos se guardan para el brief del cierre. Esto es propio de una cocina y ninguna app de IA
   lo tiene.
3. **Presupuesto por persona**: ≤ 5 push por semana (ver §2b, reemplaza el "3 por día" original); lo que sobra se agrupa.
4. **"¿Por qué me llegó esto?"** en cada aviso → lleva a la rutina que lo generó, editable o
   apagable ahí mismo.
5. **Un solo toque a la acción**: el aviso abre el lienzo con el dato ya cargado, no la pantalla
   genérica.
6. **Finito**: el brief termina. Nada de scroll infinito.

---

## 2b. Investigación 2 (24/09) — lo que la evidencia agrega

**La métrica rectora (se adopta):** las apps de consumo miden el éxito por el tiempo que pasás
adentro. K-OS mide lo contrario: **cuántas cosas se resolvieron directo desde un aviso, sin que
nadie tuviera que ir a buscarlas.** Se mide como *aviso → acción cumplida* (abrir el link y
terminar lo que pedía), nunca como aperturas o minutos en la app.

| Hallazgo | Fuente | Qué cambia en el plan |
|---|---|---|
| Juntar los avisos en **3 tandas por día** bajó el estrés y subió la concentración frente a recibirlos sueltos. Juntarlos **cada hora no cambió nada**, y **apagarlos del todo dio más ansiedad** (miedo a perderse algo) | Fitz, Kushlev et al., *Computers in Human Behavior* 2019, ensayo aleatorizado con 237 personas | Tres tandas fijas por persona, ancladas a la cocina: **antes de abrir, entre turnos y al cierre**. Apagar todo no se ofrece como opción por defecto |
| Después de una interrupción se tarda **~23 min** en volver al mismo nivel de foco | Gloria Mark, UC Irvine (CHI 2008) | Durante el servicio no hay push salvo urgente. Una interrupción en el pase se paga en platos |
| En terapia intensiva, **72-99 % de las alarmas son falsas o no hay nada que hacer** con ellas, y el personal aprende a ignorarlas, incluso las reales | Revisiones de fatiga de alarmas (NCBI, PMC) | Es el riesgo más grande del motor proactivo: **si un aviso no pide ninguna acción, no se manda como push**. Una alarma "urgente" que no era urgente le quita valor a las siguientes |
| **Entre 2 y 5 push por semana** ya hacen que una parte grande de la gente los desactive. Con 6-10 por semana, ~30 % deja la app | Datos de la industria (Braze, Business of Apps) | El tope se cuenta por **semana**, no por día: en régimen, ≤ 5 push por semana y por persona. Lo demás va a las tandas |
| La ayuda que no se pidió puede sentirse como **"me está diciendo que no sé hacer mi trabajo"**, y eso baja la adopción. Se compensa explicando por qué aparece, dejando claro que es opcional y reservándola para momentos que importan | *Proactive AI Adoption can be Threatening*, arXiv 2509.09309 (2025) | Cuadra con DESIGN.md §9. El asistente **nunca le avisa a alguien que hizo algo mal**: avisa a quién le toca actuar. Cada aviso dice por qué llegó |
| Los estudios de asistentes proactivos (CHI 2025) coinciden: la sugerencia sirve **si llega entre tareas, no en el medio**, y si está personalizada | CHI 2025, asistentes proactivos para programar | El momento justo en una cocina es el **fin de un hito**: se cerró el conteo, se terminó el mise, se cerró el turno. Estos eventos disparan avisos, la hora del reloj no |
| Principios de iniciativa compartida: tener en cuenta a qué está prestando atención la persona, **minimizar el costo de equivocarse**, dejar la opción de posponer | Horvitz, *Principles of Mixed-Initiative UI* (CHI 1999) | Cada aviso trae "recordámelo al cierre". Las rutinas pedidas en voz se confirman antes de quedar activas (patrón `proposeAction` ya existente) |
| Pulse: **5-10 tarjetas**, preparadas de noche, que **se terminan** | OpenAI, sep 2025 | El brief por puesto: máximo 5 tarjetas y se termina. Si hay más, se prioriza, no se alarga |
| ChatGPT Tasks y Gemini Scheduled Actions: rutinas en lenguaje natural, **tope de 10 activas** | OpenAI (ene 2025), Google (jun 2025) | Tope de rutinas pedidas por persona (10). Evita que el asistente se convierta en ruido que armó el propio usuario |
| Tecnología calma: la información vive en la periferia y **pasa al centro solo cuando hace falta** | Weiser y Brown 1995; Amber Case | Ya es la fórmula de DESIGN.md. El núcleo del lienzo es la periferia; el aviso es el paso al centro |

### Reglas de aviso, versión 2

1. **Hay push solo si hay una acción, un responsable y un momento.** Si falta alguno de los tres, va a una tanda.
2. **Tres tandas por día por persona**, ancladas a la cocina (antes de abrir / entre turnos / al cierre), no a la hora del reloj.
3. **Nada durante el servicio** salvo urgente (seguridad alimentaria, algo que corta el servicio).
4. **≤ 5 push por semana y por persona** en régimen. Es un presupuesto: si se gasta, lo que sigue espera a la tanda.
5. **Cada aviso dice por qué llegó** y se puede posponer o apagar desde ahí mismo.
6. **Se le avisa a quien le toca actuar, nunca a quien se equivocó.**
7. **Se revisan las alarmas que no llevaron a ninguna acción**: si un tipo de aviso casi nunca termina en acción, se baja de nivel solo.

---

## 2c. Prototipo `/centro` (24/09) — qué se probó

Ruta aparte, sin tocar el home ni deployar. Coach real a la izquierda, lienzo a la derecha.
- **Cómo llega el dato al lienzo:** un cuarto marcador en el stream (`COACH_VISTAS_MARK`) con lo que
  devolvió cada herramienta de consulta en el turno. Solo se manda si el cliente pide `vistas: true`,
  así que el Coach de siempre no cambia. El texto de las tools ya viene como `- nombre: valor`, y el
  lienzo lo convierte en tabla sin tocar ninguna tool.
- **Hallazgo 1:** el modelo contestaba desde el resumen de contexto que ya recibe, sin llamar
  herramientas, y el lienzo quedaba vacío. Se corrigió con una instrucción en el prompt, solo para
  `/centro`: "llamá la herramienta aunque el dato esté en el contexto y no repitas la lista en el texto".
  Con eso la respuesta queda en 1-3 frases y la tabla va al costado. Así tiene que funcionar.
- **Hallazgo 2:** el contador de "en crítico" (`productos_criticos_count`, el mismo del Coach actual)
  dice 100 en El Rescoldo, y el Coach dice 8. Son dos definiciones distintas de "crítico". Hay que
  resolverlo antes de que el núcleo se use en serio. Relacionado: "crítico" ya se sacó de la
  pantalla Stock (ago 2026).
- **Deuda si se queda:** que cada tool devuelva una `vista` estructurada en vez de que el lienzo
  interprete texto. Que las vistas se guarden con la conversación (hoy se pierden al recargar). El
  sheet de mobile.

---

## 3. El home "Centro" — distribución

```
┌───────────┬──────────────────────────────┬──────────────────────────────┐
│ Sidebar   │  ASISTENTE                   │  LIENZO                      │
│ (igual)   │  Buenas tardes, León         │  (lo que pediste, como dato) │
│           │  [ ¿Qué necesitás?  🎙 ]     │                              │
│           │  [Armar pedido] [Stock dom.] │  Stock del domingo — 42 ítems│
│           │                              │  ▸ 6 bajo mínimo             │
│           │  Tu día (brief, 3-5 tarjetas)│  ▸ Consumo vs. semana pasada │
│           │  • Conteo del domingo listo  │  [Armar pedido con esto]     │
│           │  • Proveedor X entrega mañana│                              │
│           │                              │  Sin pedido: el estado de la │
│           │  conversación ↓              │  cocina ahora (núcleo)       │
└───────────┴──────────────────────────────┴──────────────────────────────┘
```

- **Lienzo vacío = el estado de la cocina ahora.** Acá entran tus referencias (XSIAM): las
  fuentes a la izquierda (facturas, ventas, stock, mise, HACCP) fluyen hacia un **núcleo** que
  muestra lo abierto y lo resuelto. Cuando le pedís algo al asistente, el núcleo deja lugar a la
  respuesta.
- **El lienzo muestra resultados de tools, no texto.** Cada tool del Coach que ya devuelve
  datos (`consultar_stock`, `consultar_turnos`, `composicion_plato`…) gana un *renderer* de
  lienzo. Hoy esas tools devuelven texto + links; el cambio es que devuelvan también un
  `vista: { tipo, datos }`.
- **Mobile:** asistente arriba, el brief debajo, el lienzo sube como hoja inferior (sheet)
  cuando hay respuesta. El FAB desaparece de las pantallas donde el home ya es el asistente;
  **se queda en el resto** (el Coach contextual por pantalla sigue valiendo).
- **Registro de servicio** (`app/(servicio)`) **no cambia**: ahí manda el HUD calmo, sin chat.

### La estética — hay que decidirla

La imagen de ChatGPT (violeta, vidrio esmerilado, brillo) está **prohibida por DESIGN.md §10**
("gradiente violeta-azul, glassmorphism, neón, estética de plantilla"). Tus otras tres referencias
(HUD, XSIAM, terminal) son otra cosa: fondo oscuro, líneas finas, datos en la periferia, un
núcleo central. Eso **se parece mucho al registro "HUD calmo" que DESIGN.md ya define** para
Servicio.

**Recomendación:** tomar la *estructura* de las referencias (núcleo central, flujos, periferia,
oscuro) con los tokens actuales, y dejar afuera el violeta y el vidrio. Si querés el look ChatGPT
igual, es válido, pero se cambia primero en DESIGN.md como decisión (regla del §final: "se
discute y se cambia acá, no se esquiva en el componente") y pasa a ser la Fase 6 de toda la app.

**Probado y descartado (25/09):** vidrio líquido con `@samasante/liquid-glass` en `/centro`, local
y detrás de un interruptor. Con una lente por superficie la página caía a 0-1 fps (cada lente es un
filtro SVG que se recalcula entero); el esmerilado CSS iba a 60 fps, pero la página igual se colgó en
el Chrome del usuario y el look no convenció. Se volvió al estilo de la casa. No re-proponer sin un
motivo nuevo.

---

## 4. El motor proactivo — "Rutinas del asistente"

Una rutina = **cuándo** + **a quién** + **qué**. Tres tipos de "cuándo":

| Tipo | Ejemplo | Fuente |
|---|---|---|
| **Evento** | Se cierra el conteo de stock del domingo → informe + análisis a Compras | hook de cierre de Stockear |
| **Evento** | El chef modifica una receta → aviso a quienes tienen esa plaza | guardado de receta |
| **Evento** | Se publican o cambian turnos → aviso al afectado | ya existe en `asignarTurno` |
| **Calendario** | Lunes 8:00 → "Hoy toca pedido" a León, con el borrador armado | `puesto_descripciones.responsabilidades` + `proveedores.dias_entrega` |
| **Calendario** | Cierre de cada turno → brief de lo que quedó pendiente | turnos de servicio |
| **Pedida en voz/texto** | "Avisame los viernes si hay menos de 5 kg de vacío" | el asistente crea la rutina |

### Niveles de aviso

| Nivel | Canal | Ejemplo |
|---|---|---|
| **Silencioso** | Solo bandeja | "Se actualizó el costo de 4 platos" |
| **Resumen** | Entra al brief del día | "Proveedor X entrega mañana 8-11 hs" |
| **Aviso** | Popup in-app al abrir | "El chef cambió la receta de chimichurri" |
| **Urgente** | Push, incluso en servicio | "La cámara 2 marcó 9 °C" |

### Modelo de datos (borrador — pasar por `db-designer`)

`asistente_rutinas (id, restaurante_id, nombre, disparador jsonb, destino jsonb, accion jsonb,
nivel, activo, origen ('sistema'|'pedida'), creada_por, created_at)`

- `destino`: `{ puesto_id } | { usuario_id } | { plaza } | { todos }` — **por puesto, no por
  persona**: si León se va, el que toma Compras hereda las rutinas.
- `accion`: plantilla determinística (qué datos juntar) + `analisis: boolean` (si suma un
  párrafo de IA).
- Las rutinas "de sistema" vienen precargadas y apagables; las "pedidas" las crea el asistente
  con el patrón `proposeAction` → confirmar que ya existe.
- `notificaciones` suma `rutina_id` (para el "¿por qué me llegó esto?") y `nivel`.

### Costo (decisión 008)

- **Los datos se calculan sin IA.** Solo el párrafo de análisis pasa por la IA, con **Haiku**, **una
  vez por evento** (no una por destinatario ni cada vez que alguien lo abre), guardado en la
  notificación e imputado en `ia_uso`.
- Estimación: ~1-2 análisis por día por restaurante → centavos por mes. El chat sigue siendo lo
  caro y ya tiene tope.

### Turnos por IA

`consultar_turnos` existe. Se suma una tool mutante `proponer_turnos` con el mismo patrón de
confirmación: el asistente arma el cambio, lo muestra en el lienzo como grilla, el admin
confirma, y `asignarTurno` avisa a los afectados (esa parte ya existe).

---

## 5. La campana → popup de avisos

Tal cual lo pediste, con dos agregados del research:

- **Sin avisos sin leer, no hay campana.** Cuando llega uno aparece un popup/pill arriba ("2 avisos
  nuevos"); abrirlo los marca leídos y el popup se va.
- Historial completo en **`/avisos`** (bandeja: leídos, no leídos, filtro por tipo), accesible
  desde el perfil o el sidebar.
- **Agregado 1:** los avisos del mismo tipo se agrupan ("3 cambios en recetas").
- **Agregado 2:** cada aviso tiene "¿por qué me llegó?" → rutina → apagar/editar.

---

## 6. Fases

| Fase | Qué | Esfuerzo | Se valida con |
|---|---|---|---|
| **F0** ✅ 01/10 | Cargar VAPID en Vercel; corrida de `/api/cron/avisos` (salió en modo activo: `AVISOS_ACTIVOS=1` prendido a propósito); "crítico" → "bajo mínimo"; que Franco deje vigente al menos el puesto de Compras en Bros (decisión 014) — **esto último sigue pendiente** | ½ día | Push llega a un celular real ✅ |
| **F1** | Popup de avisos + `/avisos` + agrupado | 1 día | Chico, independiente, sale primero |
| **F2** | `asistente_rutinas` + motor determinístico + **2 disparadores reales en Bros**: conteo de stock cerrado → Compras (con análisis Haiku); receta modificada → equipo de la plaza. Silencio en servicio + presupuesto diario | 2-3 días | León recibe el informe del domingo |
| **F3** | Home "Centro": asistente + brief + lienzo con renderers para 4-5 tools (stock, turnos, receta, ventas, agenda). Desktop primero, después mobile | 3-4 días | Partir `KitchenCoachFAB` antes (`refactor-marco.md`) |
| **F4** | Rutinas pedidas en lenguaje natural + lista editable + `proponer_turnos` | 2-3 días | Admin crea una rutina hablando |
| **F5** | Brief diario por puesto (estilo Pulse), finito, al cierre/apertura | 2 días | Se lee en < 2 min |
| **F6** | Estética nueva en toda la app (**solo si se aprueba cambiar DESIGN.md**) | a estimar | Decisión aparte, fuera de 013 |

**Orden a propósito:** primero que los avisos lleguen y sirvan (F1-F2), después la cara nueva
(F3). Si el informe del domingo no le sirve a León, un home lindo no lo arregla.

**Condición de salida (estilo 013):** si dos semanas después de F2 nadie en Bros actúa sobre
los avisos (medido como aviso → pantalla abierta desde el link), se revisa antes de seguir con F3.

---

## 7. Decisiones (cerradas 01/10/2026)

1. **Estética:** estructura HUD con los tokens actuales. DESIGN.md no cambia; F6 queda fuera.
2. **Quién ve el home Centro:** dueño, chef y compras. El cocinero sigue con "Mi plaza".
3. **Quién crea rutinas para otros:** admin y chef. Cada uno puede apagarse las suyas, salvo las urgentes.
4. **Nombre:** se cambia. El asistente pasa a ser **la figura de la app** y una pieza de marketing
   ("el cerebro de la cocina"): un personaje que genere confianza e interés en el cliente que
   evalúa. Se decide junto con el nombre de la marca (abierto en `START UP KOS`, decisión 015);
   el trabajo de nombre y personaje va a la silla de Marketing (agente `kos-marketing`).
5. **Ficha de la casa:** la editan solo dueño y chef. El resto la consulta a través del Coach,
   con la lente de su puesto.
6. **Acciones grandes** (pedido, turnos de la semana): **solo borradores** que una persona
   confirma. Después de usarlo se revisa qué se puede automatizar.
7. **Lo aprendido en una charla:** el Coach pregunta "¿lo anoto?" antes de guardarlo.
8. **Lo urgente (02/10/2026):** no hay silencio durante el servicio — los avisos llegan igual, se pueden ignorar y mirar después; se asume que en ese momento no todos los van a ver. Único urgente definido: **falta un producto clave para el servicio**. Va al **puesto responsable** (Compras), no a una persona. Si nadie lo abre, **no se repite ni escala**: queda en la bandeja. Se distingue con prefijo "⚠" y destacado arriba en la bandeja, sin sonido distinto. Temperatura de cámara, vencimientos y turnos de último momento **no** son urgentes. **"Producto clave" = derivado de la carta del día:** un producto sin stock (o bajo su mínimo, a definir al construirlo) que usa algún plato de la carta de hoy vía receta → ingrediente. Sin marca manual. Depende del vínculo ingrediente→producto: en Bros 88 % vinculado (2.398 de 2.717, 02/10); los desvinculados no disparan el aviso, así que el detector de huecos (C2) tiene que listarlos.

---

## 8. Cerebro de la casa (investigación 01/10/2026) — fases nuevas

Página con diagrama, estado por pilar e investigación: https://claude.ai/artifact/GzWCqv3tPVmup2iL9r8caa

- **Cómo "usa la app" la IA:** cada acción es una herramienta (función en `lib/` que usan la
  pantalla y el Coach). No se usa "computer use" (OSWorld 2.0 estricto: 41,7 %, sep 2026).
- **Cobertura hoy:** 19 tools (11 consulta, 8 acción). Actúa en 6 de 28 módulos, solo lee 6, nada en 16.
- **Límite:** Shopify Sidekick vio que entre 20 y 50 tools el modelo las combina mal. Antes de
  pasar de 25: tool search de Anthropic (`defer_loading`) + set de evaluación.
- **El cerebro en 4 capas:** datos en vivo (existe) · Ficha de la casa · hechos aprendidos ·
  manual de la app (tools + tours + explicaciones).

| Fase | Qué | Esfuerzo |
|---|---|---|
| **C1** | Ficha de la casa: tabla, generación al final del importador, pantalla para que dueño/chef corrijan, lente por puesto (extender `verCostos`) | 2-3 días |
| **C2** | Detector de huecos (reglas sin IA: platos sin receta, evento sin menú, facturas sin cargar, puesto sin descripción) → próximos pasos dentro del brief, nunca push | 1-2 días |
| **C3** | Set de evaluación (50 preguntas reales de Bros, 10 por puesto; el mozo nunca ve costos) + tool search + 6 tools: `crear_receta`, `armar_pedido` (borrador), `proponer_turnos`, `registrar_haccp`, `crear_reserva`, `asignar_produccion` | 3-4 días |
| **C4** | Memoria de hechos aprendidos (pregunta "¿lo anoto?") + modo "mostrame cómo" (link + resaltado + tour) | 2-3 días |

Orden: F0 → F1 → F2 → C1 → C2 → C3 → F3 → F4-F5 → C4.
Regla de construcción: toda acción nueva de una pantalla se registra como tool en el mismo commit.
