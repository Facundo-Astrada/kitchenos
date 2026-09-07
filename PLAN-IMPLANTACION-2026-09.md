# Plan — Ruta de implantación de K-OS en un restaurante

**Estado:** `DISEÑADO, SIN EJECUTAR` · 07/09/2026
**Origen:** lluvia de ideas de Facundo en pizarrón (07/09) + investigación web (9 búsquedas: equipos de alto rendimiento, liderazgo en cocina, adopción de tecnología en restaurantes, formación de hábito, matriz de polivalencia, organigrama gastronómico).
**Documento visual (tabla completa, matriz dibujada, ficha de line-up):**
https://claude.ai/code/artifact/3a5be79b-8dcf-4d50-b747-7a865082c9e8

Responde a la pregunta que Facundo circuló en el pizarrón: **¿quién cubre cada función en la app?**
La respuesta corta: cada función necesita **dos** personas — una que responde y una a la que le preguntan.

---

## 0. Antes de ejecutar: la moratoria

`.claude/docs/negocio.md` § 7 (decisión 012) prohíbe módulos nuevos hasta 3 cuentas pagando,
y obliga a decirlo **antes** de escribir código.

De este plan:
- **Los huecos 1-4 NO son módulo nuevo** — son datos, plantillas y una función de composición
  sobre lo que ya existe. Se pueden hacer sin tocar la moratoria.
- **La ficha de line-up (hueco 6) NO es módulo nuevo** — es una pantalla que compone datos que
  ya están en la base (86, `pase_mensajes`, `checklist_items`, calendario). Cero schema.
- **La matriz de polivalencia (hueco 5) SÍ es superficie nueva** (tabla + pantalla). Es la única
  pieza que necesita una decisión de negocio explícita antes de construirse.
  Si se aprueba, se escribe primero en `~/Desktop/START UP KOS/00-decisiones/DECISIONES.md`.

Y § 6 del mismo doc manda sobre todo el plan: se evalúa por **tiempo hasta el primer valor**,
no por completitud. Por eso existe el hito 0 (30 minutos a un food cost real) antes de la ruta.

---

## 1. Tres cosas que el pizarrón mezcla, y que se construyen distinto

| | Qué mide | Unidad | ¿Termina? |
|---|---|---|---|
| **A · Implantación** | El restaurante tiene la función viva (datos + dueño) | El restaurante | Sí |
| **B · Capacitación** | *Esta persona* sabe usar esta función | La persona | Termina y vuelve a empezar con cada ingreso |
| **C · Adopción** | La función se sigue usando el mes 3 | Restaurante × tiempo | **No** — es el "100%" |

Si se construyen mezcladas, la app dice "listo" porque el admin cargó las recetas mientras
en la cocina nadie abrió el mise. **A y B son la montaña; C es el medidor permanente.**

Con rotación anual > 75% en el sector, **A se recorre una vez y B se recorre todo el tiempo.**
B es el que se usa todos los meses y es el que se pierde si se construyen juntos.

---

## 2. El modelo

**7 hitos** (lo que se dibuja) · **31 estaciones** (el detalle que abre cada bandera) ·
**2 checkpoints por estación** · **1 reloj de 90 días.**

- **Checkpoint de carga** — hay datos. Habilita la bandera siguiente.
- **Checkpoint de inserción** — se usa sin que nadie lo pida. **Es el único que suma al 100%.**
- **Qué se apaga** — la costumbre vieja que muere. La prueba más honesta de inserción.

El reloj lo puso la investigación de retención: en gastronomía la mayoría de las bajas ocurre
en los primeros 90 días y los primeros 30 son decisivos. Hito 0 = día 1 · hitos 1-3 = día 30 ·
hito 4 = día 60 · hito 5 = día 90 · hito 6 opcional.

**Miradores** (no son estaciones, no piden nada, no suman al progreso — son la recompensa):
`home` `reportes` `ventas` `coach` `muro` `espacios` `calendario`.

---

## 3. Las 31 estaciones

`R` = responsable (una persona, la que responde) · `Ref` = referente (a quien le preguntan).

### Hito 0 — Campamento base · "tu primer número" · día 1, 30 min

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 0.1 | Crear cuenta + tipo de negocio (`configuracion`) | Dueño | Restaurante con tipo y turnos | — | — |
| 0.2 | Importar facturas del último mes (`facturas`) | Dueño · quien recibe mercadería | ≥1 lote por ruta rápida | El precio de un insumo se actualizó solo | El Excel de gastos y la carpeta de facturas |
| 0.3 | Cargar las 10 recetas que más facturan (`recetario`) | Chef · sous | 10 recetas con rendimiento | Alguien la abrió en pleno turno | El cuaderno de recetas del chef |
| 0.4 | Ver el food cost real de esos 10 (`carta → Rentabilidad`) | Dueño | 10 platos con FC sobre gramaje | Volvió a mirarlo a la semana | La calculadora y el "me parece que da" |

### Hito 1 — El equipo · ¿quién hace qué? · día 7

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 1.1 | Activar áreas (`organigrama → Estructura`) | Dueño | ≥4 áreas de las 12 | 30 días sin retocarlo | El organigrama que solo vive en la cabeza del dueño |
| 1.2 | Crear puestos (`organigrama → Puestos`) | Dueño · chef | ≥3 puestos con permisos | Se editó uno al cambiar alguien de función | "Acá todos hacemos de todo" |
| 1.3 | Plantel + invitaciones (`organigrama → Plantel`) | Dueño · sous | Todas las personas con puesto | ≥60% aceptó y entró | El grupo de WhatsApp como lista de personal |
| 1.4 | **★ Cobertura: responsable por área × capa** (`organigrama → Cobertura`) | Dueño | Cero alertas rojas | Se reasignó sin que nadie lo pidiera | "¿De quién era esto?" |
| 1.5 | **★ Matriz de polivalencia** (NUEVO) | Chef · sous | Cada persona con nivel por plaza | Un nivel subió porque alguien se formó | "Hoy no puede faltar Sofi" dicho de memoria |

> **1.4 es la estación que responde la pregunta del pizarrón, y ya está construida.** Es el tab
> Cobertura de Organigrama. Hoy no está conectada a nada. **1.5 es nueva** y es la que produce
> los referentes de toda la tabla.

### Hito 2 — La carta · ¿qué vendemos? · día 30

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 2.1 | Carta completa (`carta`) | Chef · encargado de salón | Platos con precio y categoría | Alta/baja de plato desde la app | La carta impresa como fuente de verdad del precio |
| 2.2 | Recetario más allá de las 10 (`recetario`) | Chef · jefe de partida | Cero platos sin receta | Se editó una receta por semana | "Preguntale a Juan cómo se hace" |
| 2.3 | **★ Gramaje real por plato** (`carta → detalle`) | Chef · jefe de partida | Cero "sin estandarizar" | El FC cambió por gramaje, no por precio | El ojo como unidad de medida |
| 2.4 | Precio y margen objetivo (`carta → Rentabilidad`) | Dueño · chef | Margen objetivo cargado | Se repreció desde Reprecio | El precio del de al lado como único criterio |

### Hito 3 — La compra · ¿qué entra? · día 30

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 3.1 | Proveedores (`facturas → Proveedores`) | Enc. compras · quien recibe | ≥5 con contacto | Se le pidió a uno desde la app | La agenda del celular del dueño |
| 3.2 | **★ Facturas al día** (`facturas`) | Enc. compras · quien recibe | Facturas del mes cargadas | **3 semanas seguidas sin hueco** | La caja de zapatos con los remitos |
| 3.3 | Stock + auto-link a recetas (`stock`) | Enc. compras · sous | ≥80% ingredientes linkeados | Una receta nueva se linkeó sola | La lista de compras a mano |
| 3.4 | Conteo inicial (`stock`) | Enc. compras · ayudante de depósito | Conteo completo una vez | Dos conteos en el mes | El inventario en papel del domingo |
| 3.5 | Pedidos (`facturas → Pedidos`) | Enc. compras · chef | ≥1 pedido creado | Un pedido se recibió y se hizo factura | El audio de WhatsApp al proveedor |

### Hito 4 — El día · ¿cómo se trabaja? · día 60

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 4.1 | Plazas y secciones (`checklist`) | Chef · jefe de partida | Plazas con secciones | Se creó una sección sin ayuda | El pizarrón de la cocina |
| 4.2 | Turnos y grilla (`equipo` · `/turnos`) | Chef · sous | Turnos cargados | Grilla completa 2 semanas seguidas | La grilla en papel de la oficina |
| 4.3 | Mise por plaza (`checklist`) | Resp. de cada plaza · nivel 4 de esa plaza | Cada plaza con ≥5 ítems | Los ítems los edita la plaza, no el chef | La lista de mise escrita a mano cada mañana |
| 4.4 | **★ Ficha de line-up** (NUEVO) | Quien abre el turno · sous | Se genera sola | Se lee en voz alta 5 servicios seguidos | El "¿alguna novedad?" que nadie contesta |
| 4.5 | Despachar producción (`produccion`) | El equipo del turno · jefe de partida | ≥1 tarea despachada | Se despacha todos los días de servicio | "Acordate de hacer más salsa" |
| 4.6 | **★ Entregar el pase** (`pase`) | Quien cierra cada plaza · sous | 1 entrega registrada | **5 días seguidos, apertura + cierre, todas las plazas** | El mensaje de WhatsApp al que entra |
| 4.7 | Limpieza y temperaturas (`haccp`) | Resp. calidad · bachero | Registros configurados | Completos 2 semanas seguidas | Las planillas de la carpeta |

### Hito 5 — El control · ¿qué pasó? · día 90

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 5.1 | Merma (`merma`) | Chef · jefe de partida | ≥10 registros | Se registra sin que nadie lo pida | El "se tiró y listo" |
| 5.2 | Presupuesto y CMV objetivo (`presupuesto`) | Dueño | Presupuesto del mes por sector | Se comparó real vs objetivo al cierre | El Excel del contador |
| 5.3 | Bitácora (`bitacora`) | Chef · sous | ≥1 entrada | Entradas en ≥50% de los servicios | La memoria |
| 5.4 | Leer el mes (`reportes`) | Dueño · chef | Un mes completo con datos | Entró 4 semanas seguidas | El resumen del contador a fin de mes |
| 5.5 | **★ Ajustar el estándar** (`carta` · `checklist`) | Dueño + chef | — | Un desvío de Reportes cambió una receta, un precio o un mise | La reunión anual que no cambia nada |

> 5.5 es donde se completa la vuelta de las 4 capas (Definir → Preparar → Ejecutar → Controlar
> → Definir). Ver `PLAN-4-CAPAS.md` y `AUDITORIA-4-CAPAS.md`.

### Hito 6 — El salón · opcional según el tipo de negocio

| # | Estación (módulo) | R · Ref | Listo cuando | Insertado cuando | Qué se apaga |
|---|---|---|---|---|---|
| 6.1 | Mapa de mesas (`salon`) | Enc. salón · mozo más antiguo | Mapa con mesas reales | Se movió una mesa por un cambio real | El plano en la cabeza del encargado |
| 6.2 | Comandas y KDS (`salon` · `kds`) | Enc. salón · mozo + pase | ≥1 servicio comandado | Un servicio entero sin volver al papel | La comanda en papel |
| 6.3 | Clientes y reservas (`clientes` · `reservas`) | Enc. salón · recepción | Cartera inicial | Una reserva tomada desde la app | La libreta de reservas |
| 6.4 | Arqueo de caja (`salon → Caja`) | Enc. salón | ≥1 arqueo | Arqueo en todos los cierres de una semana | El papelito con la cuenta de caja |

---

## 4. Los 6 huecos del código

La cadena `módulo → área → responsable` **ya existe**: `AREA_CATALOGO` (`lib/constants.ts:300`)
mapea cada una de las 12 áreas a sus módulos, y Cobertura asigna responsable por área × capa.
Está cortada en seis lugares.

| # | Hueco | Dónde | Arreglo |
|---|---|---|---|
| 1 | **4 módulos sin área.** `presupuesto`, `organigrama`, `tareas`, `turnos` no figuran en ninguna de las 12 áreas → no tienen responsable posible, no hay a quién avisarle. | `lib/constants.ts` → `AREA_CATALOGO` | Presupuesto → `direccion`. Organigrama y Turnos → `rrhh`. Tareas → `cocina`. Es editar un array. |
| 2 | **5 módulos en dos áreas.** `facturas` (compras + administración), `recetario` (cocina + I+D), `clientes` (salón + comercial), `configuracion` (dirección + sistemas), `calendario`. Un aviso saldría a dos personas — y un aviso a dos no lo atiende ninguna. | ídem | Declarar **área dueña** (una, recibe el aviso) y **áreas usuarias** (solo lo ven). |
| 3 | **Las 8 plantillas de puesto son todas de cocina** (`area_key: 'cocina'`). Es una brigada de Escoffier comprimida — correcta pero incompleta: el organigrama gastronómico estándar tiene 3 departamentos (cocina, sala, gestión) y K-OS solo trae el primero. Cobertura arranca con rojos que el usuario no tiene con qué llenar. | `lib/hooks/useEquipo.ts:196` → `PUESTO_TEMPLATES` | Faltan ~6: Dueño, Encargado de compras, Encargado de salón, Mozo, Responsable de calidad, Administración. |
| 4 | **Permiso ≠ responsabilidad.** `puestos.permisos_app` dice quién *puede*; falta quién *debe*. | `lib/permisos/resolver.ts` | Sin schema nuevo: se compone `módulo → área dueña → area_capas.responsable`. Es una función. |
| 5 | **Nada registra quién sabe qué.** Sin matriz de polivalencia no hay referentes, el tutorial es binario, y la grilla no puede avisar que un turno queda sin nadie que sepa la plaza. | — | Tabla chica: persona × función × nivel 0-4. **Único schema nuevo del plan** (ver § 0). |
| 6 | **K-OS no está en el line-up.** El único momento del día en que todo el equipo mira lo mismo, y la app no aparece. `lib/ops/textoPase.ts` ("Copiar pase") ya es la idea correcta en el momento equivocado: al cerrar, no al abrir. | — | Una pantalla que compone datos existentes. Cero schema. |

---

## 5. Lo que agregó la investigación (y no estaba en el pizarrón)

### 5.1 Cada estación necesita dos personas

La difusión de responsabilidad es el resultado previsible de **nombrar a un grupo en vez de a
una persona** — de ahí el responsable único. Pero el personal de línea **le pregunta a un
compañero de confianza mucho antes que levantar la mano en una capacitación o llamar a
soporte**; la recomendación de campo es identificar 2-3 personas respetadas *por turno* antes
del lanzamiento. De ahí el referente.

**El responsable se designa; el referente se detecta.** No suelen ser la misma persona: el chef
es responsable del mise, el referente es el cocinero que de verdad lo entendió.

### 5.2 "Qué se apaga" — K-OS no compite contra otra app

La falla más común de los rollouts en restaurantes es **correr lo viejo y lo nuevo en paralelo
demasiado tiempo**: mientras el sistema anterior siga disponible, el que se resiste vuelve a él.
K-OS compite contra el pizarrón, el cuaderno y el audio de WhatsApp. Una estación no está
insertada hasta que algo viejo dejó de usarse. Es una prueba más honesta que un contador de clics.

**Ya hay precedente en el repo:** `DECISIONES.md` § 24 ("Copiar pase") es exactamente esto —
capturar el WhatsApp en el origen en vez de imitarlo.

### 5.3 La matriz de polivalencia — el tutorial deja de ser binario

Herramienta estándar de gestión de equipos gastronómicos que los chefs ya conocen:
funciones × personas × nivel.

`0` sin formar · `1` en formación · `2` con supervisión · `3` autónomo · `4` **referente (enseña)**

Resuelve tres cosas de una: produce los referentes de § 5.1, convierte el tutorial en niveles, y
**lee riesgo operativo** ("Pastelería tiene un solo nivel 4 y nadie más pasa de 1 — si falta Sofi
un viernes no hay postres", y se sabe hoy, no ese viernes). Mide cobertura del restaurante, no
rendimiento personal. Se sube de nivel con evidencia (foto del mise real — K-OS ya sabe pedir
foto en auditoría), no con un tilde.

### 5.4 El line-up: no inventar un ritual, apropiarse del que ya existe

Las capacitaciones no transfieren (~10% llega al puesto, y de eso casi nada sobrevive seis
meses). Lo que sí funciona es **meter el uso dentro de un ritual de equipo que ya existe**, con
dos minutos de resultado visible por reunión. Y hace falta **un estímulo en el momento exacto de
la acción**.

En gastronomía ese ritual existe desde antes del software: **el line-up antes del servicio**
(5-15 min, hora y lugar fijos, todo el turno presente, cocina y salón por separado).

→ **La ficha de line-up**: K-OS genera una hoja de 2 minutos que se lee en voz alta — 86,
pendientes del pase anterior, la mesa de celíacos de las 21, el plato a empujar, quién falta y
quién cubre. Todos los datos ya están en la base.

**Es el mayor retorno por línea de código de todo el plan**: una notificación compite contra
todo el celular y solo alcanza al que ya abre la app; el line-up ya tiene la atención de todo el
equipo, garantizada, todos los días. Y el que no abrió la app igual escucha lo que dice.

### 5.5 La cadencia de los avisos

**Quien recibe reconocimiento a diario puntúa 12% más bajo en confianza en la dirección que quien
lo recibe semanalmente.** Recordatorio y reconocimiento no van a la misma frecuencia:

- **Recordatorio:** máximo 1 por día por persona, al responsable de la estación, nombrando la
  consecuencia y no la tarea. Muere solo cuando la estación se completa. 3 ignorados ⇒ no
  insistir: bajar a semanal y ofrecer cambiar el responsable (no está trabada, está mal asignada).
- **Reconocimiento:** semanal, del equipo, sin nombres.

Los rankings entre personas **se dan vuelta** justo en trabajo colaborativo, sensible a la calidad
y obligatorio — una cocina es las tres cosas. Corolario útil: el research distingue rankear
*reconocimiento dado* (fomenta ayuda) de *recibido* (erosiona motivación) → mostrar quién dejó el
mejor pase para el que entra, nunca quién tildó más ítems.

### 5.6 Infraestructura de avisos hoy

- **Escalón 0 — la ficha de line-up.** El estímulo principal, y no es una notificación.
- **Escalón 1 — campanita in-app.** Ya existe entera (tabla `notificaciones`,
  `lib/notificaciones/crear.ts`, `NotificacionesBell`) y **se usa en un solo lugar de toda la app**:
  `lib/hooks/useEquipo.ts:620`, asignar turno. Solo hay que llamarla.
- **Escalón 2 — push real.** `public/sw.js` (67 líneas) **no tiene handler de `push` ni de
  `notificationclick`**. Falta eso + VAPID + tabla de suscripciones + endpoint.
- **Escalón 3 — fuera de la app (mail/WhatsApp).** El único que alcanza al que dejó de entrar,
  que es el caso que importa: el abandono no avisa.

---

## 6. Reglas que quedan fijas

1. **La ruta mide al restaurante, nunca a la persona.** El único número personal es el nivel de
   competencia propio, visible para esa persona. Ver `DECISIONES.md` § 25.
2. **El hito 0 antes que la montaña.** 30 minutos a un food cost real. Si no cierra rápido, los
   otros seis hitos no importan (`negocio.md` § 6).
3. **Los miradores no piden nada.** No cuentan para el progreso: son la recompensa.
4. **Un aviso sin responsable nombrado no se manda.** Por eso la tabla va antes que los avisos.

---

## 7. Orden de ejecución

| | Qué | Costo | Desbloquea |
|---|---|---|---|
| **A** | Tapar huecos 1, 2 y 3 (áreas huérfanas, área dueña, ~6 plantillas de puesto) | Horas | Todo lo demás |
| **B** | **La ficha de line-up** | Chico, cero schema | — |
| **C** | La matriz de polivalencia (requiere decisión de negocio, § 0) | Tabla + pantalla | Los referentes, el tutorial con niveles, el aviso de turno en riesgo |
| **D** | Escribir la ruta como dato (31 estaciones declarativas, como hoy los pasos de `app/(app)/onboarding/page.tsx` pero completo) | Medio | E, F |
| **E** | Reemplazar la guía de inicio por la cordillera + reloj de 90 días | Medio | — |
| **F** | Enchufar avisos del escalón 1, solo al responsable, dos cadencias separadas | Chico | — |

**A y B son lo que se puede hacer ya sin ninguna decisión pendiente.**

---

## 8. Fuentes de la investigación

- **Equipos:** [Project Aristotle](https://psychsafety.com/googles-project-aristotle/) (seguridad psicológica > talento/antigüedad, 180 equipos) · [las 5 condiciones de Hackman](https://umbrex.com/resources/frameworks/organization-frameworks/hackman-five-conditions-for-team-effectiveness/) (las condiciones pesan más que la supervisión — mapean 1:1 con los 7 hitos).
- **Cocina:** [The Hidden Toll of the Kitchen](https://journalihma.org/articles/JHTCP110010) (58% burnout, 41% ansiedad; predictores: hostilidad percibida y desbalance esfuerzo-recompensa) · [Why Chefs Leave](https://www.hospitalitynet.org/opinion/4130720/why-chefs-leave-what-a-global-survey-reveals-about-the-kitchen-retention-crisis) ("no se van porque el estándar sea alto, se van porque falta dignidad").
- **Adopción:** [Nory](https://www.nory.ai/blog/avoid-restaurant-tech-implementation-pitfalls) · [NexusTek](https://www.nexustek.com/insights/restaurant-tech-change-management-playbook) (champions por turno, formación por rol, la trampa del paralelo).
- **Hábito:** [Supered](https://www.supered.io/blog/software-adoption/) · [SUE Behavioural Design](https://www.suebehaviouraldesign.com/en/blog/why-software-adoption-fails/) (~10% de transferencia; el uso pega dentro de un ritual existente).
- **Onboarding:** [Poached](https://blog.poachedjobs.com/2025/09/08/restaurant-business/restaurant-onboarding-first-30-days/) · [Katalyst](https://www.katalystos.com/blog/restaurant-employee-onboarding-and-training) (bajas en los primeros 90 días; onboarding estructurado +82% retención).
- **Polivalencia:** [Interim Group](https://interimgrouphr.com/blog/matriz-polivalencia/) · [EspacioHR](https://espaciohr.com/matriz-de-polivalencia/).
- **Organigrama:** [Barcelona Culinary Hub](https://www.barcelonaculinaryhub.com/blog/organigrama-restaurante) (3 departamentos) · [Chefs Resources](https://www.chefs-resources.com/kitchen-management-tools/restaurant-operations-financial-control-kitchen-leadership/modern-kitchen-brigade-system/) (brigada comprimida a 8-15 roles).
- **Reconocimiento:** [Gies / Illinois](https://giesbusiness.illinois.edu/news/2026/03/26/peer-to-peer-recognition-leaderboards-givers-vs-receivers) · [Perceptyx](https://blog.perceptyx.com/the-downside-of-employee-recognition-when-good-intentions-go-awry) (−12% confianza con reconocimiento diario; rankings que se dan vuelta).
- **Line-up:** [7shifts](https://www.7shifts.com/blog/how-to-run-an-effective-pre-shift-meeting/) · [Ken Vick](https://coachkenvick.medium.com/the-power-of-daily-team-huddles-lessons-from-the-michelin-starred-kitchen-c820d52b0ad4).
- **Dimensionamiento / responsabilidad:** [NineGuides](https://nineguides.com/staff/restaurant-staffing-ratios/) (labor 30-35% de ventas; 25-50 cubiertos por cocinero) · [RACI vs DRI](https://www.unicornlabs.ca/blog/raci-vs-dri-accountability-framework).

---

## 9. Con qué se cruza en el repo

| Documento | Relación |
|---|---|
| `PLAN-4-CAPAS.md` · `AUDITORIA-4-CAPAS.md` | Las 4 capas (Definir/Preparar/Ejecutar/Controlar) son la columna "Capa" de las 31 estaciones. La estación 5.5 cierra la vuelta. |
| `PLAN-ACCESO-Y-USO-2026-08.md` | Bienvenida por puesto y `MODULO_DESCRIPCION` — la capa B (capacitación) empieza ahí. |
| `PROMPT-onboarding-flow.md` · `INSTRUCTIVO-ONBOARDING.md` | El onboarding actual (8/4/2 pasos por rol). Este plan lo reemplaza: la guía de inicio pasa a ser la cordillera y deja de terminar. |
| `.claude/docs/negocio.md` § 6 y § 7 | El importador como motor de onboarding + la moratoria de módulos. Ver § 0 de este plan. |
| `DECISIONES.md` § 24 y § 25 | § 24 ("Copiar pase") es el precedente de "qué se apaga". § 25 son las reglas fijas de este plan. |
| `PLAN-JUEGO-CERCADO-2026-08.md` | Marco conceptual: el juego de ejecución vs. el de autoría. La ruta instala el acta del juego. |
