# Manual de OPS — Operaciones

> Guía de capacitación y referencia del módulo **OPS (Operaciones)** de KitchenOS.
> Pensada para leerse rápido: la primera mitad es la **puesta en marcha** (cómo meter OPS en la rutina del restaurante); la segunda es el **manual de referencia**, donde queda registrado cada botón, ícono y comportamiento de la pantalla.

---

## Qué es OPS en una frase

OPS es el centro de operación diaria de la cocina: **qué hay que producir hoy, qué mise dejar armado en cada plaza y qué menú se planifica para los próximos días.** Todo lo demás de la app (recetas, stock, carta, HACCP, salón) desemboca acá cuando arranca el servicio.

OPS vive en **una sola pantalla con tres pestañas**, que se recorren de derecha a izquierda en el tiempo:

```
PLANIFICACIÓN  →  PRODUCCIÓN  →  MISE
(qué se viene)    (qué hago hoy)   (qué dejo listo en mi plaza)
```

| Pestaña | Para qué sirve | Quién la usa |
|---|---|---|
| **Producción** | Lista de tareas del día, agrupadas por prioridad o por categoría. Es donde se tilda lo que se va produciendo. | Todo el equipo de cocina |
| **Mise** | Checklist de apertura/cierre por plaza + rutinas y auditoría. El "estoy listo para el servicio". | Cada cocinero, en su plaza |
| **Planificación** | Activar menús del catálogo y sugerir producción por ventas históricas. Genera las tareas de Producción. | Encargado / chef |

> TIP: La **ejecución** (tildar tareas) vive en Producción y en Mise. La **planificación** (decidir qué se va a hacer) vive en Planificación. Planificación *crea* las tareas; Producción las *ejecuta*.

---

## Cómo se abre y cómo se navega

- OPS es el ítem **Operaciones** del menú inferior (o lateral en escritorio).
- Al entrar se abre siempre en **Producción**. La pestaña activa se puede fijar por URL (`?tab=produccion`, `?tab=mise`, `?tab=planificacion`) para links directos.
- El **badge rojo** sobre la pestaña Producción muestra cuántas tareas de hoy quedan sin completar — se ve sin cambiar de pestaña.
- Cada pestaña se "monta" recién la primera vez que se entra y de ahí en más conserva su estado (no se pierde lo que estabas mirando al cambiar de tab).

---

# PARTE 1 — Puesta en marcha (capacitación)

> FLUJO: Esta parte es la que se le muestra al equipo la primera semana. Explica el circuito, no cada botón. La referencia botón por botón está en la Parte 2.

## El circuito diario, en 5 movimientos

1. **La noche anterior / temprano** — el encargado entra a **Planificación**, activa el menú del día (o pide "Sugerir producción"). Eso crea automáticamente las tareas en Producción.
2. **Al abrir** — cada cocinero entra a **Mise**, elige su plaza y hace la checklist de **Apertura**: revisa stock, marca qué falta producir.
3. **Durante la preparación** — el equipo trabaja sobre **Producción**: va tildando cada tarea (pendiente → en curso → listo). Si algo no se puede hacer, lo marca con "duda".
4. **Antes del servicio** — quien produjo algo lo marca listo en Mise; si el restaurante usa etiquetas, imprime la etiqueta de caducidad.
5. **Al cerrar** — cada plaza hace la checklist de **Cierre** (deja registrado cuánto stock quedó) y marca su salida de turno.

> TIP: Todo esto está sincronizado. Tildar una preparación en Mise tilda su tarea en Producción, y viceversa. No hay que cargar nada dos veces.

## Roles: quién toca qué

| Rol | Qué hace en OPS |
|---|---|
| **Dueño / Encargado / Chef** | Planifica (activa menús, pide sugerencias), revisa el avance del día, arma las secciones del mise de cada plaza. |
| **Cocinero de plaza** | Hace su Mise (apertura/cierre), ejecuta sus tareas en Producción, crea "pases de turno" para el turno siguiente. |
| **Auditor / responsable de calidad** | Usa la pestaña Rutina del Mise (auditoría con puntaje y foto). Activa el "Modo Control". |

## Puesta a punto la primera vez

Antes de que el circuito fluya, hay que dejar tres cosas armadas (se hacen una sola vez):

1. **Secciones del mise por plaza.** En Mise → elegí una plaza → engranaje (arriba a la derecha) → creá las secciones (Heladera, Secos, Estación…). Sin secciones, el mise arranca vacío con una pantalla de bienvenida que invita a crear la primera.
2. **Menús en el catálogo.** Los menús se arman en **Carta → Menús**. Después se activan desde Planificación. Sin menús, Planificación te manda a crearlos.
3. **Plazas asignadas al equipo.** Cada persona puede tener plaza(s) asignada(s) (en Turnos → Equipo). Si tiene una sola, el Mise entra directo a esa plaza; si tiene varias, aparece un selector.

> OJO: OPS no inventa datos. Si una plaza no tiene secciones, o no hay menús en el catálogo, las pantallas se ven vacías **a propósito** y te ofrecen el atajo para crear lo que falta. No es un error.

---

# PARTE 2 — Referencia completa

> A partir de acá se documenta **cada control** de las tres pestañas. Los íconos van con su nombre real de Material Symbols entre comillas (`check_circle`, `add_task`, etc.) para que se puedan identificar en pantalla.

# TAB 1 · Producción

La lista de tareas del día. Es la pantalla de trabajo del equipo durante la preparación.

## Encabezado (header navy)

| Control | Qué hace |
|---|---|
| Título **Producción** + fecha | La fecha del día en curso (formato "lunes, 28 de julio"). |
| **Toggle de modo** (arriba der.) | 4 vistas: **Menú**, **Carta**, **Evento**, **Todo**. Cambia cómo se agrupan las tareas. Se guarda por dispositivo. |
| **Barra de stats** | Aparece si hay tareas hoy: "Hoy: X/Y listos" + barra de progreso verde. |

### Los 4 modos del toggle

| Modo | Cómo agrupa | Columnas que muestra |
|---|---|---|
| **Carta** | Por prioridad | SP · P · REF · Check + Pedidos + Limpieza |
| **Menú** | Por categoría del menú | Apetizer, Entrada, Proteína, Pasta, Veggie, Postre… + Pedidos + Limpieza |
| **Evento** | Igual que Menú, para tareas de evento | Secciones del menú + Pedidos + Limpieza |
| **Todo** (naranja) | Un recuadro por origen | Carta + Menú + Evento + Pedidos + Limpieza |

> NOTA: "Todo" es solo una vista combinada; una tarea nunca se guarda como "todo". Lo que crees dentro del recuadro Carta/Menú/Evento de esa vista se guarda con ese modo.

## Prioridades (los colores de las columnas)

| Sigla | Significado | Color |
|---|---|---|
| **SP** | Súper Prioridad (urgente) | Rojo |
| **P** | Prioridad | Naranja |
| **REF** | Refuerzo (controlar) | Azul |
| **Check** | Check (sin acción urgente) | Gris |

## Banner de evento

Si hay un evento cargado para hoy o mañana, aparece un banner naranja arriba de la lista.

| Control | Qué hace |
|---|---|
| **Generar lista** | Crea una tarea por cada sección de cocina para ese evento. |
| **✓ Lista creada** | Estado tras generar (no se puede duplicar). |
| **`close`** (X) | Descarta el banner por esta sesión. |

## Columnas / secciones

Cada columna es una tarjeta plegable. Se puede **reordenar arrastrando** el ícono `drag_indicator` del encabezado (el orden se guarda por restaurante + modo, en este dispositivo).

| Elemento del encabezado de columna | Qué hace |
|---|---|
| `drag_indicator` | Handle para arrastrar y reordenar la columna. |
| Nombre + sublabel | Ej. "SP · Súper Prioridad". |
| Contador `X/Y` | Listos / total. Verde cuando está completa. |
| `expand_more` | Pliega / despliega la columna. |
| Barra de color | Progreso de la columna. |

### Columnas especiales

**Pedidos** (ícono `shopping_cart`, celeste) — notas libres, no accionan nada. Se anotan cosas para pedir y se borran cuando se resuelven. No tienen estado ni entran en las estadísticas.
- Escribir en "Anotar pedido…" + `add` → agrega la nota.
- `close` en cada nota → la elimina.

**Limpieza** (ícono `cleaning_services`, verde) — muestra las limpiezas de HACCP que tocan hoy (de todas las plazas).
- Tocar el cuadrado → registra la limpieza como hecha (es el mismo registro que la pantalla de HACCP; no se duplica).
- "Agregar limpieza…" + guardar → crea una limpieza diaria general de alta rápida (se afina después en HACCP).

## La tarjeta de tarea (ItemOps)

Cada ítem de una columna es una fila con estos controles:

| Control | Gesto | Qué hace |
|---|---|---|
| **Círculo de estado** (izq.) | Tap | Cicla el estado: **pendiente → en curso (`more_horiz`, azul) → listo (`check`, verde) → pendiente**. |
| **Nombre** | Tap | Expande la tarjeta (ver sub-preparaciones y alertas). |
| **Nombre** | Mantener 600 ms | Marca la tarea como **duda** (`help`, ámbar, con borde). Un tap la saca de duda. |
| Badge **"turno ant."** | — | La tarea viene arrastrada de ayer (carryover de 1 día). |
| Badge **"pase de turno"** (violeta, `event_upcoming`) | — | Tarea programada desde otro turno; el tooltip muestra la nota. |
| Badge de sección / prioridad | Tap (si es editable) | En modo Menú/Evento, el badge de prioridad se toca para ciclarla (SP→P→REF→Check). |
| `menu_book` | Tap | Abre el **drawer de receta** (ingredientes + última producción). Solo si la tarea tiene receta vinculada. |
| `add_task` | Tap | Abre el **sheet de crear tarea** (hoy o mañana / pase de turno). Solo con receta vinculada. |
| `expand_more` | Tap | Expande/pliega igual que tocar el nombre. |

### Al expandir la tarjeta

- **Alertas de stock** — si la receta usa ingredientes por debajo del mínimo, se listan en rojo con un botón **"+ Producir"** que crea una sub-tarea de reposición.
- **Sub-preparaciones** — las sub-tareas se muestran indentadas, cada una con su propio círculo de estado.
- **"Agregar sub-preparación…"** — campo para sumar una sub-tarea.

### Al marcar una tarea con receta como "listo"

Se abre el **sheet de producción real** (`ProduccionSheet`) para registrar cuánto se produjo de verdad:

| Control | Qué hace |
|---|---|
| Pills **×0.8 / ×1 / ×1.2 / ×1.5** | Multiplicador rápido vs. lo planificado. |
| **otro** | Habilita un campo para un multiplicador libre (ej. ×1.3). |
| Cartel de **desviación** | Muestra +/-% y las pax reales resultantes. |
| **Escalar por ingrediente** | Desplegable: elegís un ingrediente de referencia y cuánto usaste; calcula el multiplicador solo. |
| **Registrar desviación / Confirmar** | Guarda el registro de producción. |
| **Omitir** | Cierra sin registrar (el estado ya cambió; el registro es informativo). |

## El sheet "Crear tarea" (CrearTareaSheet)

Es el mismo sheet que se usa desde `add_task` en Producción y desde el Mise. Sirve para duplicar un componente como tarea, hoy o para el próximo turno.

| Control | Qué hace |
|---|---|
| **¿Para cuándo?** Hoy / Mañana | "Mañana" crea un **pase de turno**: aparece en la Producción del turno siguiente con badge violeta. |
| **Prioridad** SP/P/REF/Check | Prioridad de la tarea nueva. |
| **Multiplicador ×1/×2/×3** o **Cantidad libre** | Si la receta tiene porciones, ofrece multiplicador; si no, un campo de cantidad. |
| Rendimiento real promedio | Se muestra si hay historial (ej. ×1.15). |
| **Plazas** | Chips de plazas si el plato tiene multi-plaza configurada. |
| **Nota** | Texto libre para el próximo turno (ej. "se vendió mucho, reforzar"). |
| **Crear tarea / Programar para mañana** | Confirma. |

## Agregar tareas (QuickAdd)

Al final de cada columna hay un campo para sumar una tarea suelta.
- Escribís el nombre + `add` (o Enter).
- Si tipeás 3+ letras que coinciden con una receta, aparecen **chips de sugerencia** con `menu_book`: al tocarlos, la tarea queda vinculada a esa receta (el campo se resalta en azul).

## Recuadros de la vista "Todo"

En modo Todo, Carta/Menú/Evento se muestran como recuadros resumen (`ModoResumenCard`) con barra de progreso propia, la lista de tareas de ese origen (agrupada por sección en Menú/Evento) y su propio QuickAdd.

---

# TAB 2 · Mise

La checklist de apertura y cierre de cada plaza, más las rutinas y la auditoría. Es el "estoy listo para el servicio" de cada cocinero.

## Selector de plaza

Si el usuario no tiene una única plaza asignada, primero aparece una **grilla de plazas**:

| Plaza | Ícono |
|---|---|
| Parrilla | `local_fire_department` |
| Fríos | `ac_unit` |
| Calientes | `soup_kitchen` |
| Pase | `room_service` |
| Pastelería | `cake` |
| Panadería | `bakery_dining` |
| General | `groups` |

- Cada tarjeta muestra el progreso de apertura de esa plaza (X/Y completados) y se pinta verde al 100%.
- Si el usuario tiene **una sola** plaza asignada, entra directo. Si tiene **varias**, la grilla y un switcher superior muestran solo las suyas + General.

## Encabezado de la plaza

| Control | Qué hace |
|---|---|
| `arrow_back` | Vuelve al selector de plazas. |
| Nombre de plaza + fecha | — |
| **`fact_check` (Modo Control)** | Activa/desactiva el Modo Control (ver abajo). Se guarda por dispositivo. |
| **`settings`** | Abre el **editor de secciones**. |

### Pestañas del Mise

| Pestaña | Qué muestra |
|---|---|
| **Apertura** | Checklist de apertura: stock que hay que dejar preparado. |
| **Cierre** | Checklist de cierre: cuánto stock quedó (con input numérico). |
| **Rutina** | Rutinas periódicas + ítems de auditoría con puntaje. |

- **Barra de progreso** general (apertura/cierre): X/Y completados.
- **Modo Control** — cuando está activo, muestra un banner ("solo tildá lo que está listo") y reemplaza las tarjetas ricas por checkboxes simples. Pensado para chequeo rápido / supervisión. Desactiva el arrastre de ítems.

## La tarjeta de ítem del mise (ProductoMiseCard)

Es la pieza central del Mise. Cambia según sea apertura o cierre.

### Controles comunes

| Control | Gesto | Qué hace |
|---|---|---|
| **Checkbox** (`radio_button_unchecked` / `check_circle`) | Tap | Marca el ítem como completado. Sincroniza la tarea de Producción vinculada. |
| **Nombre** | Tap | Despliega una fila con el estándar, peso por porción / porciones, ubicación y botón **Eliminar**. |
| Badge **"receta"** | — | El ítem está vinculado a una receta. |
| Badge **"Pedidas hoy: N"** | — | Demanda viva: porciones ya pedidas desde el salón en el turno. |
| **Badge de prioridad** (SP/P/REF) | Tap | Cicla la prioridad del ítem (sp → p → ref). |
| **`add_task` / `task_alt`** | Tap | Abre el sheet de crear tarea. Se pone verde (`task_alt`) si ya hay una tarea pendiente para este ítem. |

### En Apertura (sin recipiente)

- **Caja "stock"** — editable: tocás y cargás cuánto hay ahora (arranca del cierre anterior). Se pinta verde/ámbar/rojo según el ratio contra el objetivo.
- **Caja "a producir"** — el target fijo del ítem (solo lectura).

### En Apertura (con recipiente configurado)

- Chip de **recipiente** (nombre × capacidad en porciones, + peso por porción).
- **"hay ahora"** — editable (cuánto hay).
- **"falta producir"** — déficit calculado = capacidad + demanda viva − stock. Verde si "stock ok", rojo si falta.
- **CTA "Producir X porc (Yg)"** — botón rojo/naranja que crea la tarea de producción de un tap (prioridad alta, hoy).

### En Cierre

- **5 puntitos de stock** (`StockDots`) — indicador visual del nivel contra el objetivo.
- **Input numérico** editable — cuánto quedó. Se pinta verde (ok) o naranja (bajo el estándar).
- **"/ X unidad"** — el objetivo de referencia.

### Etiqueta de producción (al marcar como listo)

Si el restaurante tiene vencimientos habilitados, al tildar aparece el bloque de etiqueta:

| Control | Qué hace |
|---|---|
| **Caduca en N días** | Editable; arranca de la vida útil de la receta o 3 días por defecto. Muestra la fecha resultante. |
| **Imprimir etiqueta** (`print`) | Imprime por impresora USB (ESC/POS), si está habilitada. |
| **Bluetooth** (`bluetooth`) | Imprime por impresora Bluetooth. |
| **Descargar .bin** (`download`) | Descarga el archivo ESC/POS. |
| **Crear vencimiento en HACCP** (`event`) | Registra el vencimiento en HACCP. Queda en verde "Vencimiento creado". |

## Agregar un ítem al mise (AddItemSheet)

Se abre con **"Agregar"** dentro de una sección.

| Control | Qué hace |
|---|---|
| **Nombre** | Con autocompletar de recetas (`restaurant_menu`): al elegir una, hereda porciones. |
| **Prioridad** SP/P/REF/OK | El texto de abajo aclara qué hace cada una. **SP y P crean automáticamente una tarea en Producción.** |
| **Cantidad estándar + Unidad** | El objetivo del ítem. Unidades: u, kg, g, l, ml, pax, porc, bandeja, gastro, tupper. |
| **Agregar** | Guarda. |

## Editor de secciones (SectionEditor)

Se abre con `settings`. Es la fuente única para crear/renombrar/reordenar/borrar/tipar secciones (con sub-secciones de 1 nivel).

| Control | Qué hace |
|---|---|
| **Swatch de ícono** | Tocar abre una grilla de íconos reales para elegir. |
| **Nombre** | Editable en línea. |
| `arrow_upward` / `arrow_downward` | Mueven la sección entre sus hermanas. |
| `delete` | Borra la sección (bloqueado si tiene contenido; hay que vaciarla primero). |
| **Chips de tipo** | Producción · Almacén · Heladera · Freezer · Estación. |
| **Productos de esta sección** | Solo en tipo "Almacén": elegís qué productos del stock actualiza "Stockear sección" (Mesa de Trabajo). |
| **Agregar subsección** | Crea una sub-sección anidada (1 nivel). |
| **Nueva sección** | Ícono + nombre + `add`. |
| **Guardar** | Aplica todos los cambios. |

> NOTA: Heladera y Freezer se enlazan a HACCP por **nombre** (no hay que configurar nada extra): una sección "Heladera" se cruza con el equipo HACCP del mismo nombre.

## Reordenar ítems del mise

- **Mantené presionado 400 ms** un ítem (vibra) → entra en modo arrastre.
- Arrastralo dentro de la sección o **a otra sección** (el fantasma muestra "→ destino").
- Auto-scroll en los bordes al arrastrar. La posición queda fija (no "salta" al cambiar de badge o tildar).

## Pestaña Rutina

| Elemento | Qué hace |
|---|---|
| **Resumen de auditoría** | Barra + score % del día (verde ≥90, naranja ≥70, rojo debajo). |
| **Fila de rutina normal** | Checkbox para marcar hecha, badge de frecuencia (Diaria/Semanal/…), "Últ: …", `tune` (editar), `close` (borrar). |
| **Fila de auditoría** (`verified`) | Botones **OK** / **Falla**, foto obligatoria si aplica (`photo_camera`), "Deshacer". |
| **Agregar rutina** | Abre el sheet de rutina. |

> NOTA: Marcar una auditoría como **Falla** crea automáticamente una tarea de revisión en Producción (prioridad alta).

### Sheet de rutina (AddRutinaSheet)

| Control | Qué hace |
|---|---|
| **Nombre** | Editable (bloqueado si viene sincronizada de HACCP → Limpieza). |
| **Frecuencia** Diaria/Semanal/Quincenal/Mensual | — |
| **Ítem de auditoría (con puntaje)** | Toggle: convierte la rutina en ítem de auditoría. |
| **Puntaje** | Puntos que aporta al score. |
| **Requiere foto obligatoria** | Exige foto para poder responder. |
| **Mostrar solo si** | Condicional: aparece solo si otra auditoría dio OK/Falla. |

## Cerrar turno

En la pestaña **Cierre**, cuando la plaza llega al 100% y hay un fichaje abierto, aparece una barra fija abajo:
- **Cerrar turno** (`stop_circle`, rojo) → registra la hora de salida (pide confirmación).

---

# TAB 3 · Planificación

Donde se decide qué se produce. Activa menús y sugiere producción; eso **crea las tareas** que después se ejecutan en Producción.

## Encabezado

| Control | Qué hace |
|---|---|
| **Sugerir producción** (`auto_awesome`) | Abre el motor de reglas que sugiere qué producir según ventas históricas de ese día de semana. |
| **Cargar menú** (`menu_book`) | Abre el selector de menús del catálogo. |
| **Selector de fecha** | `chevron_left` / `chevron_right` para cambiar de día; tocando el texto se abre un date picker. |

## Vista sin menú cargado

Si el día no tiene menú activo:
- Si hay menús en el catálogo → botón **"Activar menú del catálogo"**.
- Si no hay ninguno → cartel "Armá un menú en Carta → Menús".
- Link **"o agregar una tarea suelta en Producción"** → salta a la pestaña Producción.

## Selector "Cargar menú"

| Control | Qué hace |
|---|---|
| **¿Un día o varios?** | "Hoy" (un día) o **"Varios días"** (abre un calendario mensual para tildar varias fechas). |
| **Calendario** (multi-día) | `chevron_left`/`right` cambia de mes; se tocan los días a activar; los días con menú ya cargado tienen punto verde. |
| **Lista de menús** | Cada menú muestra su tipo (Fijo/Evento), nombre y cantidad de preparaciones; `add_circle` lo activa. |

Al activar un menú se crean sus tareas en Producción (dedupe por preparación; en el día real se limpia lo pendiente de ayer para no duplicar el mise).

## Vista con menú activo (MenuActivoView)

| Control | Qué hace |
|---|---|
| **Resumen** "Menú activo · X/Y listas" + barra | Progreso del menú del día. |
| **+ Otro** | Activar otro menú además del actual. |
| **Vaciar** | Elimina todas las tareas del menú del día (pide confirmación). |
| **Ir a Producción a ejecutar** | Salta a la pestaña Producción. |
| Secciones y filas | Cada sección y cada fila se **arrastran** (handle `drag_indicator`) para reordenar; auto-scroll en los bordes. El orden se refleja en Producción. |
| Chips de fila | Plaza, miembro asignado, cantidad y badge de prioridad (SP/P/REF/Check). |

## Calendario del mes

Los días del mes con menú activo muestran punto verde. La navegación de fecha del header sincroniza con el calendario del selector multi-día.

---

# PARTE 3 — Cómo se conecta todo

OPS no es una isla. Estas son las conexiones que hay que entender para no cargar cosas dos veces:

| Conexión | Cómo funciona |
|---|---|
| **Mise ↔ Producción** | Tildar un ítem del mise tilda su tarea de producción (vínculo por ID, no por nombre), y viceversa. Un ítem de prioridad SP/P en el mise crea la tarea automáticamente. |
| **Planificación → Producción** | Activar un menú o confirmar una sugerencia crea las tareas del día en Producción. |
| **HACCP → Limpieza / Rutina** | Las limpiezas de HACCP con `sync_ops` aparecen en la columna Limpieza (Producción) y en la pestaña Rutina (Mise). Se registran en un solo lugar. |
| **Auditoría → Producción** | Una auditoría marcada como "Falla" crea una tarea de revisión. |
| **Salón → Mise** | Las porciones pedidas desde el salón suben la "demanda viva" del ítem, que se suma al déficit "falta producir". |
| **Carryover** | Una tarea no completada se arrastra **un solo día** al siguiente (badge "turno ant."), y después se deja de mostrar. Evita que se apilen para siempre. |
| **Pase de turno** | Una tarea creada con día "Mañana" queda para el turno siguiente con badge violeta, sin depender de que alguien avise de palabra. |

---

# PARTE 4 — Mejoras detectadas

> FLUJO: Observaciones surgidas de recorrer OPS botón por botón. Ordenadas de mayor a menor impacto en la experiencia del usuario. No son bugs que rompan la app; son fricciones y detalles a pulir.

## Alta prioridad

1. **La prioridad "Check" no se puede volver a elegir desde la tarjeta del mise.** El ciclo del badge en la tarjeta del mise es sp → p → ref (excluye "chk"), y un ítem cargado como "OK/Check" se muestra con el badge **"REF" en azul** (mapeo `chk → label REF`). Resultado: un ítem "Check" parece "Refuerzo" y no hay forma de devolverlo a "Check" tocando el badge. **Sugerencia:** incluir chk en el ciclo y darle su propio label/color (verde "OK"), consistente con el resto de la app.

2. **No se puede borrar una tarea suelta desde Producción.** El círculo cicla el estado pero no hay acción de eliminar una tarea de producción mal creada (solo se borran las notas de Pedidos y los duplicados de ayer, internamente). Una tarea equivocada queda dando vueltas hasta el carryover. **Sugerencia:** deslizar para eliminar, o una acción de borrar al expandir la tarjeta.

3. **Dos gestos de "mantener presionado" distintos entre pestañas.** En Producción, mantener el nombre 600 ms marca "duda"; en Mise, mantener un ítem 400 ms lo levanta para arrastrar. Misma familia de gesto, resultado distinto según la pestaña — cuesta construir memoria muscular. **Sugerencia:** unificar el patrón (ej. arrastre con handle explícito en ambos, long-press reservado a un solo significado).

## Media prioridad

4. **El orden de columnas de Producción se guarda solo en el dispositivo.** Al reordenar SP/P/REF/… el orden queda en `localStorage` por restaurante+modo, no en la base. En otro celular o navegador, el equipo ve el orden por defecto. **Sugerencia:** persistir el orden a nivel restaurante si se busca una vista consistente para todos.

5. **Baja descubribilidad de "de dónde salen las tareas".** Un usuario nuevo entra a Producción y ve tareas sin saber que se generan en Planificación (activar menú / sugerir). **Sugerencia:** en Producción vacía, un empty-state que enlace a Planificación ("Activá un menú para llenar el día").

6. **"Cerrar turno" solo aparece al 100% del cierre.** La barra de cerrar turno depende de completar la checklist de cierre + tener fichaje abierto. Si alguien quiere marcar salida sin terminar todo el cierre, no encuentra el botón en esta pantalla. **Sugerencia:** dejar el cierre de turno accesible también desde el fichaje / dashboard, independiente del 100%.

## Detalles / pulido

7. **El badge "turno ant." y "pase de turno" pueden convivir y apilarse** en la misma línea del nombre; en nombres largos el ítem se ve cargado. **Sugerencia:** unificar en un solo indicador de origen con tooltip.

8. **Las alertas de stock dentro de la tarjeta se cargan recién al expandir** (lazy, una sola vez). Están bien para performance, pero no hay señal en la fila colapsada de que "esta tarea tiene un faltante de insumo". **Sugerencia:** un puntito rojo en la fila cuando hay alerta de stock pendiente.

9. **El modo de Producción y el de creación divergen sutilmente en "Todo".** La vista "Todo" es cómoda, pero al agregar en el QuickAdd de un recuadro concreto se guarda con ese modo — comportamiento correcto pero poco visible. **Sugerencia:** un microcopy en el QuickAdd de "Todo" aclarando en qué origen se guardará.

---

> TIP: Este documento se regenera desde su fuente. Para actualizarlo: editar `docs/manual-ops.md` y correr `node scripts/manual-ops-to-pdf.mjs`. No editar el PDF a mano.
