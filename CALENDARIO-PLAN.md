# Calendario — plan de expansión

> Lluvia de ideas de Facundo (2026-08-04) organizada + hallazgos del código.
> Estado: **propuesta, sin implementar**. Decidir fases antes de tocar código.

---

## 1. Punto de partida real

| Pieza | Dónde | Estado |
|---|---|---|
| Pantalla | `app/(app)/calendario/page.tsx` (739 líneas) | Vista Mes + Semana, form de evento, detalle del día debajo de la grilla |
| Hook | `lib/hooks/useCalendario.ts` (254 líneas) | CRUD sobre `eventos` + realtime + auto-generación read-only |
| Tabla | `eventos` (15 columnas) | `titulo, descripcion, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, recurrente, frecuencia, color, proveedor_id, usuario_id, restaurante_id` |
| Coach | `app/api/coach/route.ts:409` | Ya existe la tool `crear_evento` (propose→confirm, en `coach_acciones`) |

**Lo que ya funciona y hay que aprovechar:** el hook no solo lee `eventos` — también sintetiza eventos read-only desde `pedidos.fecha_entrega_esperada` y desde `produccion_diaria`. Ese patrón (*el calendario refleja lo que ya vive en otras tablas, sin duplicar el dato*) es la base de casi todo lo que sigue. No hay que inventarlo, hay que extenderlo.

### Tres bugs / deudas encontradas de paso

1. **`recurrente` y `frecuencia` existen en la tabla pero nadie los procesa.** El fetch filtra `fecha_inicio` entre el primer y último día del mes, así que un evento marcado "semanal" aparece **una sola vez**, el día que se creó. Hoy el checkbox miente. → Bloquea directamente el pedido de "rutinas".
2. **El realtime refetchea el mes equivocado** (`useCalendario.ts:236`): usa `new Date()` en vez del mes que estás mirando. Si navegás a septiembre y alguien crea un evento, te vuelven los datos de agosto.
3. **`usuario_id` es `text`, no `uuid`** — sin FK. Antes de construir "responsable de la rutina" hay que decidir si se normaliza contra la tabla de equipo.

---

## 2. La distinción que ordena todo el pedido

La lista de Facundo (reuniones, limpieza, stockear, días de pedido, ingreso de proveedores, stock mensual/anual, ingresos de mercadería, capacitaciones, chequeo de costeo, menú de personal) mezcla **tres naturalezas distintas**. Tratarlas igual es lo que haría que el calendario no escale.

### A. Eventos — pasan una vez, a una hora
Reunión, capacitación, visita de bromatología, evento privado, mantenimiento.
→ Ya soportados. Solo necesitan mejor UI.

### B. Rutinas — no son eventos, son **reglas que generan ocurrencias**
"Limpieza profunda de campana los lunes", "stock los domingos", "pedido a Frigorífico martes y viernes", "chequeo de costeo el día 1", "menú de personal cada lunes", "stock anual el 31/12".

La diferencia importa: una rutina no se carga 52 veces. Se carga una vez, genera ocurrencias, y **cada ocurrencia se marca hecha o no hecha**, tiene responsable, y aparece en OPS/Tareas del día que toca. Sin esto, "días de stock" significa cargar 12 eventos a mano por año y sin trazabilidad de si se hizo.

**Ya existe medio motor de rutinas en el proyecto, encerrado en HACCP:** `haccp_limpieza` tiene `dia_semana`, `dia_mes`, `frecuencia`, `sync_ops` y `checklist_item_id` (migración `haccp_limpieza_calendario_ops.sql`). Genera un `checklist_item` en OPS cuando toca. Es exactamente el patrón que se necesita — pero solo sirve para limpieza.

> **Decisión de arquitectura pendiente:** generalizar ese motor a una tabla `rutinas` que sirva a limpieza + stock + pedidos + costeo + capacitaciones + menú de personal, y dejar `haccp_limpieza` como un consumidor. La alternativa (una tabla por dominio) multiplica el código de generación de ocurrencias por 6.

Esquema propuesto:

```
rutinas
  id, restaurante_id, nombre, tipo, activa
  frecuencia        diaria | semanal | quincenal | mensual | anual
  dia_semana[]      para semanal (permite "martes y viernes")
  dia_mes           para mensual
  fecha_ancla       para anual / quincenal
  responsable_id, plaza, hora_sugerida
  genera            tarea | checklist_item | nada (solo marca en calendario)
  proveedor_id      para rutinas de pedido/entrega

rutina_ocurrencias
  id, rutina_id, fecha, estado (pendiente|hecha|omitida)
  completado_por, completado_at, nota
```

Las ocurrencias se materializan de forma perezosa: al pedir un mes, se calculan las fechas y se hace upsert solo de las que alguien tocó. No se pre-generan filas hasta 2030.

### C. Reflejos — datos que ya existen en otras tablas
No se cargan en el calendario: se **muestran** ahí. Costo bajo, valor alto, cero duplicación.

| Reflejo | Fuente | Ya está |
|---|---|---|
| Entregas de proveedor | `pedidos.fecha_entrega_esperada` | ✅ |
| Producción planificada | `produccion_diaria` | ✅ |
| Eventos / menús de Carta | `menus.fecha_evento` (migración `20260707`) | ❌ |
| Quién trabaja ese día | `turnos` / `useFichaje` | ❌ |
| Limpiezas HACCP programadas | `haccp_limpieza` | ❌ |
| Antigüedad del conteo de stock | último conteo por sector | ❌ ("hace 34 días que no se cuenta Cámara") |
| Vencimientos de pago a proveedores | `useCuentaCorriente` | ❌ |
| Checklist del día | `checklist` | ❌ |

Con filtros por capa (chips arriba de la grilla) para poder apagar el ruido.

---

## 3. Los cuatro ejes de trabajo

### Eje A — La grilla (lo que se ve)

Referencia: Google Calendar. Lo que hoy falta:

- **Celdas altas** (~110-130px en desktop) en vez de cuadrados chicos. La grilla debe ocupar el alto útil, no un tercio.
- **Los eventos se ven dentro de la celda**, como píldoras con título — no como puntitos que obligan a hacer click. Con `+N más` cuando desborda.
- **Franja de color por tipo** en cada píldora (el mapa de colores ya existe en `TIPO_CONFIG`).
- El header navy actual ocupa demasiado alto para lo que informa — comprimir a una fila (mes + flechas + Hoy + toggle Mes/Semana/Año), mismo criterio que se aplicó al header de OPS.
- **Botón "Hoy"** — hoy no existe; si navegás tres meses, volver es a mano.
- **Drag para mover** un evento de día.
- **Click en día vacío = crear**, sin pasar por el FAB.
- **Vista Año** (heatmap) — para ver rutinas anuales y estacionalidad de un vistazo.
- **Día operativo vs día calendario:** OPS ya corta a las 05:00. El servicio del sábado a la 1am tiene que caer en sábado, no en domingo. Definir esto una vez y respetarlo.

> Ver `.claude/docs/ui.md` — la regla de "densidad de header operativo" y "un dato un lugar" aplican acá igual que en OPS.

### Eje B — Notas del día

Panel a la derecha de la grilla, vinculado al día seleccionado. Sirve para organizar la semana y para tomar notas en reunión.

- Tabla `calendario_notas` (`restaurante_id, fecha, contenido, autor_id, updated_at`) — una nota por día por restaurante.
- Autoguardado con debounce (`useDebounce` ya existe en el proyecto).
- Indicador en la celda del mes cuando el día tiene nota.
- **Extra de alto valor:** seleccionar una línea de la nota → "convertir en tarea". Las notas de reunión terminan siendo tareas; hoy ese salto se hace a mano o se pierde.
- El Coach lee las notas (ver Eje D).

### Eje C — Vocabulario operativo

Cada ítem de la lista de Facundo mapeado a su naturaleza:

| Lo que pidió | Es | Genera |
|---|---|---|
| Reuniones | Evento | — |
| Tareas de limpieza y rutina | Rutina | checklist OPS (ya existe el puente) |
| Días de stockear | Rutina semanal | tarea + link a `/stock` |
| Stock mensual / anual | Rutina mensual/anual | tarea |
| Días de pedidos (hacer el pedido) | Rutina | tarea + link a `/pedidos` |
| Días que ingresa cada proveedor | Rutina con `proveedor_id` | marca en calendario |
| Ingresos de mercadería | Reflejo de `pedidos` | ✅ ya está |
| Capacitaciones | Evento | — |
| Chequeo de costeo | Rutina mensual | tarea + link a `/reportes` |
| Menú de personal | Rutina semanal | tarea + link a `/carta` |

El patrón común: **cada marca del calendario puede tener un destino dentro de la app**. "Día de stock" no es un recordatorio, es un botón que te lleva a contar. Eso es lo que separa esto de una agenda genérica.

### Eje D — Coach con conocimiento total del calendario

Hoy el screen context del calendario tiene 4 campos (`page.tsx:167`): total de eventos, eventos de hoy, y los 3 próximos. Es casi nada.

**Contexto que debería recibir:**
- Ventana de ±14 días: eventos, rutinas que tocan, ocurrencias vencidas sin marcar, notas del día.
- Conflictos: dos eventos pisados, entrega de proveedor un día que no hay nadie de recepción, stock programado el mismo día que un evento grande.
- Huecos: "hace 3 semanas que no se marca la limpieza de cámara".

**Tools nuevas** (`crear_evento` ya existe, extender el mismo patrón propose→confirm):
- `consultar_agenda(desde, hasta)` — lectura, sin confirmación.
- `crear_rutina(...)` — "cargá el stock mensual todos los días 1".
- `mover_evento(id, fecha)`.
- `completar_ocurrencia(id)` — "ya hicimos la limpieza de campana".
- `crear_nota(fecha, contenido)` — dictarle las notas de la reunión al Coach.

**En los dos sentidos:** un botón "Planificar mi semana" en el calendario que abre el Coach con el contexto ya cargado. Y que el Coach, desde cualquier pantalla, pueda contestar "¿qué tengo esta semana?".

Seguir la skill `/coach-screen` — es exactamente el flujo que estandariza esto (contexto + targets + tour + suggestions + acciones).

---

## 4. Ideas adicionales (no estaban en la lluvia)

Ordenadas por relación valor/costo:

1. **Export ICS / feed suscribible** — que el equipo vea el calendario del restaurante en su Google Calendar del celular sin entrar a KitchenOS. Read-only, una API route, alto impacto en adopción.
2. **Feriados argentinos precargados** + marca "¿abrimos?" — impacta compras, personal y facturación. Barato.
3. **Semana tipo / plantilla** — definir la semana estándar una vez y aplicarla al mes entero. Es el atajo que hace usable el Eje C.
4. **Recordatorios el día previo** — push, o WhatsApp (ya hay un proyecto `whatsapp-inbox` en el entorno).
5. **Vista por persona / puesto** — filtrar el calendario por responsable; se apoya en el sistema de puestos y permisos que ya existe.
6. **Densidad de carga** — sombrear en el mes los días según cuántas tareas/producciones/entregas caen, para detectar lunes sobrecargados antes de que pase.
7. **Adjuntos por día** — foto del remito, planilla de la capacitación.

---

## 5. Fases sugeridas

Una sesión = un tema (regla del proyecto). Estimación en sesiones de trabajo, no en horas.

| Fase | Qué entra | Por qué en este orden |
|---|---|---|
| **F1 — La grilla + notas** | Eje A completo + Eje B. Sin tablas nuevas salvo `calendario_notas`. Arreglar el bug del realtime de paso. | Es lo único que Facundo *ve* hoy. Puro UI, riesgo bajo, resultado inmediato. |
| **F2 — Motor de rutinas** | Tablas `rutinas` + `rutina_ocurrencias`, generación perezosa, puente a Tareas/OPS, UI de alta de rutina. Migrar `haccp_limpieza` a consumidor. | Es el corazón del pedido y lo más caro. Nada del Eje C funciona sin esto. |
| **F3 — Reflejos + filtros** | Las 6 fuentes faltantes de la tabla del punto 2.C + chips de capa. | Barato una vez que la grilla aguanta densidad (F1). |
| **F4 — Coach 100%** | Screen context rico + las 5 tools nuevas + botón "Planificar mi semana". | Necesita que existan rutinas y ocurrencias para tener de qué hablar. |
| **F5 — Extras** | ICS, feriados, semana tipo, recordatorios. | Cada uno es independiente y se puede meter suelto. |

**Riesgo principal:** F2 toca `haccp_limpieza`, que ya sincroniza con el checklist de OPS. Correr `/impacto` sobre `useHaccp` y sobre el puente `checklist_item_id` antes de escribir la migración.
