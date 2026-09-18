# Plan — Descripción de puesto (Organigrama)

**Estado:** `PROPUESTA` · 17/09/2026 — no se escribió código todavía.
**Origen:** pedido de Facundo (17/09) + 3 documentos reales de Standard 69 en
`ejemplos descripcion de puesto/` + cruce con `SINTESIS-ORGANIZACION-GASTRONOMICA.md`,
`PLAN-IMPLANTACION-2026-09.md` y lo que `puestos` ya tiene cargado.

**Decisión de moratoria — resuelta el 18/09/2026:** excepción nombrada de forma cerrada,
decisión 014 (`~/Desktop/START UP KOS/00-decisiones/DECISIONES.md`, destilada en
`.claude/docs/negocio.md` § 7). Cubre Fases 1, 2 y 4. La Fase 3 (acuse de lectura) sigue
condicionada a la consulta legal — ver § 10.1 B. Ver § 9.

---

## 0. La frase corta

K-OS ya tiene la mitad del documento cargado y no lo sabe. La función no es "un editor de
descripciones de puesto": es **componer lo que la app ya sabe del puesto y preguntar solo lo
que no puede deducir**.

---

## 1. Qué son en realidad los tres ejemplos

Los tres PDF de la carpeta parecen el mismo objeto y no lo son. Esto es lo más importante
del análisis, porque decide el schema.

| Archivo | Unidad | Cambia cuando | Equivalente en K-OS |
|---|---|---|---|
| `S69 04-OPC-M01 MANUAL DE COCINA` | **La casa** | Cambia la política o el horario de la casa | No existe |
| `Cocinero_a - std` | **El puesto** | Cambia la función, no la persona | `puestos` (parcial) |
| `Descripcion de puestos 2025` (Despacho) | **La partida / plaza** | Cambia la carta o el equipamiento | `plaza_default`, `competencias`, `checklist` (parcial) |

El Manual de Cocina define cultura, horarios del día, uniforme, circuito de despacho,
circuito de mercadería y limpieza. Eso vale para los 14 puestos: **si se mete dentro de la
descripción de puesto, cambiar el horario de apertura obliga a editar 14 documentos.**

El de Despacho es el más operativo de los tres y ni siquiera es de un puesto: es de una
**estación**. Lista el equipamiento de la partida (heladera de despacho, plancha, anafes,
horno, prensa, freidora), las horas duras ("mise en place lista a las 12 hs MÁXIMO") y cómo
se entrega la estación al que entra. Ese documento se reescribe cuando cambia la carta, no
cuando cambia el cocinero.

El de Cocinero/a es el único que es del puesto, y sobrevive a la rotación — exactamente el
criterio con el que ya se construyó el organigrama
(`20260819b_organigrama_areas.sql`: *"se va el parrillero, entra otro, la estructura no se toca"*).

> **Consecuencia de diseño:** son **tres objetos, no uno**. El PDF que se le entrega a una
> persona los **compone**: carta de la casa + su puesto + su(s) plaza(s). Eso es literalmente
> lo que Standard 69 entrega (manual de cocina + manual de puesto) y es lo que ninguna
> plantilla de Word compone sola.

---

## 2. Anatomía del documento del puesto — las 10 secciones del ejemplo

Del `Cocinero_a - std`, que es el más completo y el que hay que igualar:

| # | Sección | Qué contiene en el ejemplo | ¿Existe en K-OS? |
|---|---|---|---|
| I | Introducción | Una frase de pertenencia ("no te sumás a un puesto…") | No |
| II | Identificación | Nombre · área · reporta a · modalidad · jornada | **Sí, casi entera** (`nombre`, `area_key`, `reporta_a_puesto_id`) — falta modalidad y jornada |
| III | **Misión del puesto** | Dos párrafos: para qué existe el puesto | No (`descripcion` es una línea, no una misión) |
| IV | Responsabilidades | **8 bloques con sub-bullets**, no lista plana | **Parcial** — `tareas_funciones text[]` es plano |
| V | **Expectativas: qué esperamos** | 9 frases en segunda persona | No |
| VI | **Qué NO esperamos** | 10 frases — los no negociables en negativo | No |
| VII | Indicadores de desempeño | Desperdicio · CMV · alineación cultural | **Parcial** — `objetivos` solo cubre postre/café/ticket |
| VIII | Competencias | Técnicas / blandas | No (polivalencia mide plaza, no competencia) |
| IX | Requisitos | Educación · experiencia · edad · disponibilidad | No |
| X | Condiciones que ofrecemos | Remuneración · beneficios · capacitación · **crecimiento** | No |

Y del de Despacho, tres cosas que el de Cocinero no tiene y son las más operativas:

- **El día de punta a punta con horas duras** — "la MEP del ejecutivo lista a las 12:00 máximo".
- **Equipamiento que comprende la partida** — la lista de máquinas de las que se hace cargo.
- **Cómo se entrega la estación** — "tuppers cargados, mise lista, y se comunica lo importante
  a quien cubre después". Eso ya lo hace `pase` en K-OS y nadie lo escribió nunca en un puesto.

> El pedido textual de Facundo — *"qué hace desde que abre la puerta de ingreso hasta que
> marca salida"* — **no está en el ejemplo de Cocinero**. Está en el de Despacho y en el
> Manual de Cocina (la línea de tiempo de 9h a 00:30). Es una sección propia, no un renglón
> de "responsabilidades".

---

## 3. Lo que K-OS ya sabe y no hay que volver a preguntar

Este es el argumento entero de la función. Sin esto, es un Word con tema oscuro.

| Sección del documento | Sale solo de | Hoy |
|---|---|---|
| Identificación (nombre, área, reporta a) | `puestos` | ✅ ya se imprime en el PDF |
| Quién ocupa el puesto | `equipo_miembros.puesto_id` | ✅ ya se imprime |
| Partida / plaza | `puestos.plaza_default` | ✅ |
| Módulos de la app que usa | `puestos.permisos_app` | ✅ ya se imprime |
| **A quién le pregunto** (referente) | `competencias` nivel 4 | ❌ no se compone |
| Tareas de apertura y cierre | `checklist_items` por plaza | ❌ |
| Mise en place de la partida | producciones de OPS por plaza | ❌ |
| Objetivos de venta sugestiva | `puestos.objetivos` | ❌ no se imprime |
| Indicador de merma | módulo `merma` filtrado por plaza | ❌ |
| Uniforme que entrega la casa | `equipo_miembros.uniforme` (claves JSONB) | ❌ |
| Responsable del área a la que pertenece | `area_capas` | ❌ |
| Horario del turno | `turnos` | ❌ |

**Doce filas. Cinco ya impresas, siete disponibles y sin componer.** El documento puede nacer
lleno al ~60 % antes de la primera pregunta.

---

## 4. El principio: el cuestionario es la interfaz, la plantilla es el andamio

Facundo lo dijo: *"no es ideal que la función venga preestablecida"*. La síntesis dice lo
mismo desde el otro lado (§ 10.3): *"documento a la carta"* + *"querer controlarlo todo es la
mejor manera de no controlar nada"* + *"en un equipo pequeño no hay departamentos"*.

Pero la conclusión **no** es "campos de texto libre". Nadie llena diez textareas en un celular.

Las tres reglas:

1. **Ninguna pregunta cuya respuesta K-OS ya tenga.** Se confirma, no se escribe.
2. **Corregir, no redactar.** Las 14 `PUESTO_TEMPLATES` ya traen `tareas_funciones` reales.
   El cuestionario propone el borrador y el usuario tacha y agrega. Es el mismo patrón que la
   ruta rápida del importador: determinístico primero, escritura después.
3. **Núcleo mínimo de 3 secciones.** Un documento con misión + responsabilidades + no
   negociables ya sirve y ya se imprime. Las otras 7 son opcionales para siempre.

### Las preguntas — 6 tandas de 2-3 minutos

En lenguaje de cocina, no de RRHH. Cada tanda se guarda sola y se puede abandonar.

> **Versión 2 — corregida contra la investigación de Gemini Deep Research (17/09),
> `INVESTIGACION-PUESTOS-METODOLOGIA-2026-09.md`.** Qué se aceptó y qué se descartó: § 4.1.

| Tanda | Pregunta que se hace | Produce |
|---|---|---|
| 1 · Identidad | *(precargado)* "¿Esto está bien?" — nombre, área, reporta a, plaza, quién lo ocupa | confirmación |
| 2 · El día | **"Contame el día del parrillero: llega, ¿qué es lo primero que toca?"** → "¿y a las 10 de la noche con el local lleno?" → "¿y lo último antes de irse?" | `dia_tipo[]` |
| 3 · Misión | **"Si este puesto desapareciera mañana, ¿qué es lo primero que explota acá adentro?"** | `mision` |
| 4 · Responsabilidades | *(borrador de template)* "Esto es lo que suele hacer un parrillero. Sacá lo que no, agregá lo que falta." | `responsabilidades[]` |
| 5 · Expectativas y límites | "¿Cómo te das cuenta, mirando desde el pase, que hoy está teniendo un servicio excelente?" → **"Pensá en el peor error que se cometió en este puesto en el último año: ¿qué pasó?"** → *(lista cerrada + "otro")* | `expectativas[]`, `no_negociables[]` |
| 6 · Cómo se mide / qué ofrece | *(lista cerrada de indicadores que K-OS mide)* + beneficios y crecimiento | `indicadores[]`, `condiciones` |

**El día va primero, no la misión.** Es la *Grand Tour question* de Spradley: cualquier
gastronómico puede narrar cómo se abre su local, no hay respuesta incorrecta, y eso baja la
defensa y estabiliza el dictado antes de pedir algo abstracto. Recién con las tareas
mecánicas ya narradas el cerebro está en condiciones de agruparlas en una misión.

**La misión sigue preguntándose por la ausencia** — es la formulación que la investigación
valida como CIT indirecto. Preguntar "¿cuál es la misión del puesto?" devuelve "cocinar".

### 4.1 Lo que corrigió la investigación

**Aceptado:**

1. **El orden** (día → misión), por lo de arriba.
2. **Los no negociables ya no se preguntan en hipotético.** La formulación original
   —*"¿qué cosa, si pasa una sola vez, ya es un problema serio?"*— es un hipotético negativo:
   obliga a construir la regla y después invertirla, satura la memoria de trabajo en dictado y
   produce lugar común (*"que no haga las cosas mal"*). Se reemplaza por el **incidente crítico
   episódico**: se pregunta por el peor error real del último año y de ahí se **infiere** el
   límite.
3. **Y después de la pregunta episódica va una lista cerrada, no otra pregunta abierta.** La
   investigación se contradice acá: declara anti-patrón la pregunta negativa abierta y sin
   embargo mete *"¿qué no tolerás? eso que es motivo de despido directo"* en sus 8
   imprescindibles — y en su propia tabla de rescate predice que va a fallar. La salida está en
   esa misma tabla de rescate, que ofrece opciones cerradas. **Conclusión que la investigación
   no saca: saltear la pregunta abierta e ir directo a la lista cerrada con "otro".** Mismo
   patrón que la tanda 6, que ya estaba diseñada así.
4. **Capa de repregunta** (nueva, § 8.1).
5. **Un segundo nivel en la tanda 2**: el "mini tour" del pico de servicio ("las 10 de la noche
   con el local lleno") separa lo vital de lo accesorio y no estaba en el diseño original.

**Descartado, y por qué:**

| Pregunta de la investigación | Por qué no va |
|---|---|
| #40 *"¿creés que le estás pagando un sueldo justo por todo lo que le exigís?"* | La investigación la celebra diciendo que *"el sistema lo expone ante sí mismo"*. Exponer al usuario no es una feature: cierra la app. Además § 5.3 ya decide que la remuneración no entra al documento |
| #39 *"¿qué te frustra de supervisar este puesto?"* | Invita a catarsis sobre una persona. `DESIGN.md` § 9: nada de rendimiento individual expuesto |
| #30 (propinas) · #34 (francos y vida personal) | Buenas preguntas de gestión, pero no son de una descripción de puesto. Si se quieren, van a la carta de la casa (§ 6.1) |
| Las 40 completas | El producto tiene 6 tandas y ~9 minutos. El banco es una cantera, no un cuestionario |

**La adaptación que la investigación no hace, y es la más importante:** varias de sus
preguntas son **sobre la persona**, no sobre el puesto — *"alguna vez que **esta persona** te
salvó las papas"*. Si el documento se llena de anécdotas sobre Nico, muere cuando Nico se va, y
toda la premisa (§ 1) es que sobreviva a la rotación.

> **Regla, a escribir en el código y no solo acá: el incidente es la entrada, el dato guardado
> es la tarea o el límite que se extrae de él.** Se pregunta por lo que pasó con Nico y se
> guarda *"el parrillero avisa el faltante de carne antes de que se corte"*. Ningún nombre
> propio entra a `puesto_descripciones`.

### 4.5 Los límites que no los pone el dueño — seed precargado

El segundo research (`INVESTIGACION-PUESTOS-LEGAL-2026-09.md` § 3) separa lo que impone la
norma de lo que define la casa. **Los de norma son iguales en todos los restaurantes del país y
se precargan; los de la casa son los únicos que se preguntan.** Eso acorta la tanda 5 y es lo
que la hace viable a partir del segundo puesto (§ 10.1 A).

Seed nacional, con la norma citada (CAA = ley 18.284; Cap. II del CAA publicado por MAGyP):

| Ítem | Roles | Norma |
|---|---|---|
| Carnet de manipulador de alimentos vigente | todos los que tocan alimento | CAA art. 21 + ordenanza municipal |
| Capacitación en BPM | cocina, bacha, recepción | CAA cap. II · Res. GMC 80/96 |
| Cadena de frío, control de temperaturas y rotulado | cocina, recepción | CAA caps. II, IV y V |
| No trabajar con enfermedad infectocontagiosa | cocina, salón | CAA art. 21 |
| Higiene personal y lavado de manos | todos | CAA cap. II · Res. GMC 80/96 |
| Uniforme higiénico, uñas y cabello contenidos | cocina, bacha, salón | CAA cap. II *(la estética, no — esa es de la casa)* |

**Dos condiciones para mostrarlos, y no son cosméticas:**

1. **Van en un bloque aparte, rotulado "esto lo pide la norma, no vos"**, visualmente separado
   de la lista de la casa. El dueño no los redacta ni los discute; los puede ocultar del PDF,
   no editar el texto.
2. **K-OS no afirma cumplimiento.** El control bromatológico es facultad municipal: el nivel de
   exigencia cambia cruzando el límite de un partido. El seed es un **piso nacional**, y la
   pantalla lo dice. *"Esto es lo que pide la norma nacional. Tu municipio puede pedir más."*

Y se redactan como tarea, nunca como responsabilidad legal — § 10.1 B.

### 4.2 Vocabulario

La investigación es tajante con el léxico y contradice los títulos de sección de este plan.
Evita: *misión del puesto · responsabilidades · competencias · KPIs · requisitos excluyentes ·
reporte jerárquico*. Usa: *el día a día · qué esperamos · la cancha · el despacho · reglas del
juego · cómo te das cuenta si rinde · las mañas.*

Se adopta **en la UI**, no en el schema — las columnas se siguen llamando `mision`,
`responsabilidades`, `indicadores`, porque el nombre de la columna lo lee un programador.

Dos salvedades:

- **"Organigrama" ya es el nombre de un módulo de K-OS** y está en el menú, en la ruta y en la
  ruta de implantación. No se renombra por esto.
- El vocabulario propuesto **es conocimiento del modelo sobre el habla rioplatense, no un
  hallazgo con fuente** (§ 4.3). Es plausible y probablemente correcto, pero se valida con
  Bros antes de estamparlo en toda la pantalla.

### 4.3 Qué tan firme es este respaldo

Vale saberlo antes de rediseñar encima:

- **La claim central —la refutación de las preguntas negativas— está citada a Studocu**, un
  sitio de apuntes de estudiante, no al texto de Krosnick & Presser. El contenido es
  consistente con lo que se sabe de dobles negaciones y *satisficing*; el sostén es flojo.
- **El respaldo LatAm que se pidió no aparece.** La única fuente argentina (37) es el diseño
  curricular de una tecnicatura en gastronomía, no un cuestionario de consultoría. Los datos de
  rotación (60-74 % anual) vienen de EE.UU., Turquía, Nigeria y Sudáfrica.
- Hay Wikipedia, tres Scribd y blogs de producto entre las 49 fuentes.
- Se le pidió marcar recomendación propia vs. hallazgo: lo hizo en 1 de 40 filas.

**Nada de esto invalida las correcciones aceptadas** — son de sentido común metodológico y el
costo de aplicarlas es bajo. Pero no se toma como evidencia dura, y lo que decide es Bros.

### 4.4 El recorrido — martes 16:40, Rescoldo

Martín, dueño y chef. Cargó el plantel la semana pasada (estación 1.3). Está en la tablet de
la oficina, con el celular al lado. Entra a **Organigrama → Puestos → Parrillero**.

**La puerta.** Debajo de la carta del puesto, una franja que antes no estaba:

> **Descripción de puesto** · sin empezar
> *De este puesto ya sabemos 7 cosas. Faltan 5 preguntas.* → **[Armarla]**

**Tanda 1 · Identidad — no se escribe, se confirma.** Todo precargado:

> Parrillero · Cocina · reporta a Chef / Sous Chef · Plaza: Parrilla
> Lo ocupan hoy: **Nico Herrera**, **Dami Sosa**
> A quién le preguntan: **Nico Herrera** — *único nivel 4 en Parrilla*
> Usa en la app: Mise · Recetario · Stock · Pase · Carta
> **[Está bien]**  ·  [Corregir]

El renglón del referente es el primer momento de valor: es un dato que Martín nunca escribió,
salió de la matriz de polivalencia.

**Tanda 2 · El día — se arranca por acá, no por la misión.** Es la pregunta que cualquiera
puede narrar sin sentirse evaluado. K-OS pone lo que ya sabe y pregunta el hueco:

> **El día del parrillero.** Esto ya lo sabe la app:
> `15:00` Entrada — turno tarde
> `15:00` Prender el fuego · Bajar carne del freezer · Revisar brasa — *checklist de apertura de Parrilla*
> `23:30` Dejar el pase — *ya lo hace todos los días*
>
> **¿Qué pasa entre el fuego y el servicio?**
> *(y después)* **¿Y a las 10 de la noche, con el local lleno, qué está haciendo todo el tiempo?**
> *(y al final)* **¿Cómo tiene que dejar la parrilla antes de apagar la luz?**

**Tanda 3 · Misión — ahora sí, con las tareas ya narradas.**

> **Si mañana no hubiera parrillero, ¿qué es lo primero que explota acá adentro?**
> 🎤 **[Contámelo]**  ·  [Prefiero escribir]

Martín dicta: *"Y… no sale nada. La parrilla es el 70% de la carta. Se cae el asado, el vacío,
las achuras. Y el que agarra la brasa tiene que saber manejar el fuego desde temprano porque
si no a las nueve no tenés brasa."*

Vuelve redactado, sin nada agregado: *"La parrilla sostiene el 70% de la carta: sin este
puesto no salen las carnes ni las achuras. La responsabilidad empieza mucho antes del
servicio — el fuego se maneja desde temprano para tener brasa en punto a las 21."*
→ **[Así está]** · [Editar] · [Dictar de nuevo]

**Tanda 4 · Responsabilidades — tachar, no redactar.** Llega agrupado en bloques desde la
plantilla + las `tareas_funciones` que ya tenía cargadas:

> **Fuego y brasa** (3) · **Cocción** (4) · **La estación** (3) · **Con el equipo** (2)
> *Tocá para sacar. Escribí para agregar. Arrastrá para reagrupar.*

**Tanda 5 · Expectativas y límites — primero lo bueno, después el episodio real.**

> **¿Cómo te das cuenta, mirando desde el pase, que hoy está teniendo un servicio excelente?**
> — *"Que la carne salga igual siempre. Que yo no tenga que ir a mirar."*
>
> **Ahora pensá en el peor error que se cometió en este puesto en el último año. ¿Qué pasó?**
> — *"Uf. Se fue sin decir que quedaba poca entraña y el sábado a las once nos quedamos sin.
> Tuvimos que salir a decirle a las mesas que no había. Y encima había dejado la parrilla hecha
> un desastre porque se fue apurado."*

De ese relato el sistema **no guarda la anécdota**: extrae dos límites y los propone.
Y en vez de preguntar abierto "¿qué más no tolerás?", muestra una lista para tildar:

> Del relato sacamos:
> ☑ Avisar el faltante de carne **antes** de que se corte
> ☑ La parrilla se entrega limpia, aunque se salga tarde
>
> ¿Alguna de estas también?
> ☐ Llegar tarde sin avisar ☑ El celular en la parrilla ☐ Usar mal la mercadería cara
> ☐ Tratar mal a un compañero ☐ **Otro:** `___`

Martín tilda una y escribe nada más. **Tres límites, ninguno con nombre propio adentro** — el
documento sigue siendo del puesto, no de quien lo ocupa hoy.

**Tanda 6 · Cómo se mide — lista cerrada, solo lo que K-OS mide.**

> ☑ Merma de la plaza Parrilla — *la mide Merma* — meta `[ 3 ]%`
> ☐ Food cost de los platos de parrilla — *Carta → Rentabilidad*
> ☐ Mise completo antes de abrir — *Mise*
> ☑ Sin vencidos en su heladera — *HACCP*

Nueve minutos. **[Dejar vigente]**.

**El PDF que sale:** carta de la casa (si la cargó) · misión · identificación · el día ·
responsabilidades en 4 bloques · qué esperamos · **no negociables** · cómo se mide · qué
ofrece la casa · **a quién le preguntás: Nico Herrera** · módulos de la app · pie con espacio
para firma.

**La segunda vida del documento.** Dos semanas después entra Fede. Martín lo invita desde
Plantel con puesto Parrillero. Fede acepta, abre la app por primera vez y **antes del home ve
su descripción de puesto**, no un tour genérico. Al final: **[Leí y entiendo]** → queda el
acuse con fecha.

Tres meses después Martín saca "bajar carne del freezer" porque ahora viene fraccionada. El
documento pasa a v2 y **el acuse de Fede vence**: la próxima vez que entre le aparece *"cambió
tu descripción de puesto"* con el diff de esa línea. Para eso está `version` en la tabla de
acuses.

---

## 5. Schema

### 5.1 Tabla nueva, no columnas en `puestos`

`puestos` se fetchea en `useEquipo` para resolver permisos en cada render. Son ~10 campos de
texto largo: inflar ese fetch caliente para imprimir un PDF es el intercambio equivocado.
Además el documento tiene ciclo de vida propio (borrador / vigente, versión, quién lo revisó)
que no es del puesto.

```sql
create table public.puesto_descripciones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  puesto_id uuid not null references public.puestos(id) on delete cascade,

  mision text,
  -- Bloques jerárquicos como el ejemplo (8 títulos con sub-bullets), no lista plana:
  -- [{ "titulo": "Gestión de insumos", "items": ["Rotar mercadería", "Rotular todo"] }]
  responsabilidades jsonb not null default '[]',
  -- [{ "momento": "Ingreso", "hora": "09:00", "que_hace": "Cambiado y en el puesto" }]
  dia_tipo jsonb not null default '[]',
  jornada jsonb,            -- { modalidad, turno_tipo, dias, hora_entrada, hora_salida }
  expectativas text[] not null default '{}',
  no_negociables text[] not null default '{}',
  -- [{ "nombre": "Merma de la plaza", "meta": "< 3%", "modulo": "merma" }] — `modulo`
  -- ata el indicador a una pantalla real; sin él es una frase, no un indicador.
  indicadores jsonb not null default '[]',
  competencias jsonb,       -- { tecnicas: [], blandas: [] }
  requisitos jsonb,         -- { formacion, experiencia, certificaciones: [], disponibilidad }
  condiciones jsonb,        -- { beneficios: [], capacitacion, carrera }  ← SIN sueldo, ver 5.3

  estado text not null default 'borrador' check (estado in ('borrador','vigente','archivado')),
  version int not null default 1,
  revisado_por uuid references public.equipo_miembros(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (puesto_id)
);
```

### 5.1.b El acuse necesita una versión inmutable — no un contador

**Corregido el 18/09 contra `INVESTIGACION-PUESTOS-LEGAL-2026-09.md` § 2.** El diseño
original era una tabla de acuses con una columna `version int` apuntando a
`puesto_descripciones`. **No sirve**, por una razón concreta:

Un botón "Leí y entiendo" en la app es **firma electrónica**, no firma digital (ley 25.506,
arts. 5 y 6). La diferencia decide todo: la firma digital presume autoría; en la electrónica,
**si el trabajador la desconoce, la carga de la prueba se invierte y cae sobre el empleador**,
que tiene que costear una pericial informática para acreditar autoría e inalterabilidad.

Con el schema original, esa pericial se pierde sola: `puesto_descripciones` es una fila
mutable que se edita en el lugar, así que **la versión 1 que firmó Fede deja de existir en la
base en cuanto Martín edita un renglón**. El acuse apunta a un número de versión sin contenido.

La versión publicada pasa a ser una fila propia e inmutable, y el acuse cuelga de ella:

```sql
-- Snapshot inmutable. Se inserta al pasar a `vigente` y NO se actualiza nunca.
create table public.puesto_descripcion_versiones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  descripcion_id uuid not null references public.puesto_descripciones(id) on delete cascade,
  version int not null,
  contenido jsonb not null,   -- el documento entero, congelado
  contenido_hash text not null,
  publicado_por uuid references public.equipo_miembros(id) on delete set null,
  publicado_at timestamptz not null default now(),
  unique (descripcion_id, version)
);

create table public.puesto_descripcion_acuses (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  version_id uuid not null references public.puesto_descripcion_versiones(id) on delete restrict,
  miembro_id uuid not null references public.equipo_miembros(id) on delete cascade,
  -- Lo que hace falta si algún día hay que probarlo:
  contenido_hash text not null,   -- lo que la persona tuvo delante, no lo que hay hoy
  user_agent text,
  ip inet,
  leido_at timestamptz not null default now(),  -- del servidor, nunca del cliente
  unique (version_id, miembro_id)
);
```

Tres reglas que van con esto:

- **`on delete restrict`** en `version_id`: una versión con acuses no se borra. Es el único
  `restrict` del plan y es a propósito.
- **Sin `update` ni `delete` en las policies de las dos tablas.** RLS de `select` e `insert`
  con `mi_restaurante_id()` y nada más — append-only. Si el dueño puede editar el acuse, el
  acuse no prueba nada.
- **`leido_at` lo pone el servidor.** Un timestamp que viaja desde el browser no sirve.

`puesto_descripciones` queda como el **borrador vivo** (mutable, editable); las versiones son
lo que se firmó. Eso además hace trivial la lógica de "el acuse vence cuando el documento
cambia": hay acuse para la versión N y no para la N+1.

Más `notify pgrst, 'reload schema'` en las tres tablas (sin eso el browser no las ve —
`feedback_postgrest_schema_cache`).

> Esto **no** convierte el acuse en prueba plena — sigue siendo firma electrónica. Lo que hace
> es que la pericial sea ganable en vez de imposible. La pregunta de si conviene tenerlo sigue
> siendo del abogado (§ 10.1 B).

### 5.2 No duplicar lo que ya está

`puestos.descripcion` y `puestos.tareas_funciones` **se quedan donde están**. La tabla nueva
guarda solo lo que no existe, y el documento compone las dos fuentes. Al crear una descripción
por primera vez, `tareas_funciones` se siembra como el primer bloque de `responsabilidades`
(título: "Tareas diarias") y desde ahí el usuario lo reagrupa. Dos copias del mismo dato es
exactamente la connascence que `.claude/docs/ingenieria/arquitectura-kos.md` manda evitar.

### 5.3 El sueldo no va

El ejemplo dice *"sueldo competitivo acorde al convenio gastronómico"* — texto, no número.
Y `equipo_miembros.costo_hora` ya existe con gate de admin. Si la remuneración entrara acá, el
PDF que se cuelga en la cocina expone sueldos. `condiciones` guarda beneficios, capacitación y
carrera; el número, nunca.

---

## 6. Los otros dos objetos

### 6.1 Carta de la casa (el Manual de Cocina)

Una por restaurante. Vive en `restaurantes.configuracion` (JSONB, mismo patrón que las plazas
custom — `project_plazas_custom`), **sin tabla nueva**:

- Cultura y valores · políticas de la casa (el ejemplo: *cocina silenciosa*, *orden
  permanente*, *"oído"*) · uniforme · el día tipo de la casa (la línea de tiempo 9h→00:30) ·
  no negociables de la casa.
- Se escribe una vez y aparece **en la cabecera de los 14 documentos de puesto**.

Es lo que responde la pregunta de Facundo *"¿cuál es la cultura de trabajo?"*, y responderla
por puesto sería contestarla 14 veces.

### 6.2 Ficha de partida (el de Despacho)

Una por plaza. Va contra las plazas que ya existen (`lib/constants.ts` + `usePlazasCustom`):
equipamiento de la estación · horas duras · qué se entrega al que entra.

**Esta es la de menor prioridad de las tres** y la única que se puede diferir entera: el
equipamiento no está modelado en ningún lado (`espacios`/`espacio_plazas` tiene recipientes,
no máquinas) y agregarlo sí es superficie nueva.

---

## 7. Dónde se usa — o el documento muere en un PDF

El research de `PLAN-IMPLANTACION-2026-09.md` § 5 es tajante: el problema de K-OS no es que
falten módulos, es que los que hay no se adoptan. Cinco enganches, en orden de retorno:

1. **La inducción del que entra.** `equipo_miembros.onboarding_visto_at` ya existe. Cuando
   alguien acepta la invitación, lo primero que ve es la descripción de **su** puesto. Es la
   *"sesión de orientación para nuevos"* que pide la síntesis (§ 8.2) y hoy no existe.
2. **El acuse.** "Leí y entiendo", con fecha y versión. Es lo único que convierte esto en un
   documento de RRHH y no en un apunte. Si el documento se edita, el acuse vence y se vuelve a
   pedir — por eso `version` está en la tabla de acuses.
3. **El A4 imprimible.** Ya hay precedente exacto: `/hoja-instructiva`. Se cuelga en la cocina.
4. **El referente impreso en el documento.** `competencias` nivel 4 responde *"¿a quién le
   pregunto?"*, que según § 5.1 del plan de implantación es lo que el personal de línea
   realmente hace antes que llamar a nadie. Hoy ese dato existe y no se muestra en ningún lado
   fuera de la matriz.
5. **Estación 1.6 de la ruta de implantación.** Después de 1.5 (polivalencia). *Listo cuando:*
   el puesto más crítico tiene descripción vigente. *Insertado cuando:* se editó una al cambiar
   algo real. **Qué se apaga:** *"ya sabés lo que hay que hacer"* dicho en el pase.

---

## 8. El rol de la IA — y su límite

`.claude/docs/negocio.md` § 4: *"antes de mandar algo a la IA, preguntarse si hay ruta
determinística"*. Acá hay ruta determinística para el 60 % (§ 3) y plantillas para buena parte
del resto. La IA entra en dos lugares y **el flujo se completa sin ella**:

1. **Redactar, no inventar.** Convertir la respuesta cruda del dueño ("que no llegue tarde,
   que no deje la estación hecha un desastre") en las frases del documento. **Haiku**, con la
   consigna explícita de no agregar contenido que el usuario no dijo.
2. **Borrador para un puesto sin template.** K-OS se vende a varios sectores, no solo parrilla
   (`project_multisector_gastronomico`): sushiman, pizzero, repartidor, telemarketer no están
   en las 14 plantillas. Ahí sí conviene un borrador generado.

Las dos rutas imputan en `ia_uso` con `restaurante_id` (`lib/ia/costos.ts` → `registrarUsoIA`).
Una ruta nueva sin imputar es un agujero en el único número de costo que hay.

**Dictado por voz.** El dueño no escribe diez párrafos en el celular, pero cuenta el día del
parrillero en dos minutos hablando. Es el multiplicador de adopción más grande de toda la
función y el que decide si el documento se llena o queda en borrador.

### 8.1 La repregunta — la capa que agregó la investigación

Cuando la respuesta viene en piloto automático (*satisficing*), el sistema la detecta y
repregunta con una frase de rescate que fuerza especificidad. Es lo más valioso del research y
no estaba en el diseño original.

| Respuesta fallada | Repregunta de rescate |
|---|---|
| *"Hace de todo un poco, es un comodín"* | "Hacé memoria de **ayer a la noche puntualmente**: nombrame tres cosas exactas que agarró, cocinó, limpió o resolvió." |
| *"Se encarga de cocinar y sacar platos"* | "Imaginate que lo estoy viendo por la cámara en pleno despacho: ¿qué plato está sacando, qué máquina está prendiendo, qué grita en el pase?" |
| *"Tiene que tener actitud y ganas"* | "Todos piden eso. ¿Cómo te das cuenta en los **primeros 10 minutos de prueba** que las tiene? ¿Qué le ves hacer con las manos?" |
| *"Yo no tolero que hagan las cosas mal"* | *(no se repregunta: se pasa directo a la lista cerrada — ver § 4.1 punto 3)* |

**Detección, en dos escalones, y en ese orden por costo:**

1. **Determinístico primero** (`negocio.md` § 4): menos de N palabras, sin verbo de acción, o
   coincide con una lista corta de muletillas conocidas ("de todo un poco", "lo que haga
   falta", "actitud y ganas"). Cubre la mayoría de los casos y cuesta cero.
2. **Haiku solo si el escalón 1 no decidió.** Una llamada extra por respuesta, no por sesión.
   Con 6 tandas es acotado, pero **se imputa en `ia_uso` igual** y se mide antes de dejarlo
   prendido para todas las respuestas.

La repregunta se ofrece **una sola vez** y siempre con salida ("así está bien"). Insistir dos
veces sobre la misma respuesta es el camino al abandono.

---

## 9. La moratoria — decidir antes de escribir código

**Resuelto el 18/09/2026 — decisión 014.** Facundo aprobó la excepción. Queda el
razonamiento de abajo como registro de por qué.

La decisión 012 prohíbe módulos nuevos hasta 3 cuentas pagando, y obliga a decirlo **antes**.

**A favor de que no cuente como módulo nuevo** (mismo argumento que la decisión 013 para
polivalencia y line-up): no agrega superficie que haya que vender. Es un tab dentro de
Organigrama, que profundiza `puestos`, que ya existe, y extiende un export PDF que ya existe.
Hace que se use lo que ya está.

**En contra, honestamente:** son 2 tablas nuevas + un flujo de 6 pantallas. Es más grande que
los huecos 1-4 del plan de implantación (que eran datos y un array) y comparable a
polivalencia, que **necesitó** una excepción nombrada.

**Recomendación:** tratarla como la 013 — excepción nombrada de forma cerrada, escrita en
`~/Desktop/START UP KOS/00-decisiones/DECISIONES.md` antes de tocar código, con condición de
salida escrita: *si a las dos semanas de shippear no hay ninguna descripción en estado
`vigente` en la cuenta viva, se revierte.*

---

## 10. Fases

| Fase | Qué entra | Schema | Esfuerzo |
|---|---|---|---|
| **0** | **Extender el PDF con lo que ya hay** — misión no, pero sí: objetivos del puesto, referente de la plaza, checklist de apertura/cierre, responsable del área, uniforme | cero | 2-3 h |
| **1** | Tabla `puesto_descripciones` + cuestionario de 6 tandas + editor + PDF completo | 1 tabla | 1,5-2 d |
| **2** | Carta de la casa (cultura, políticas, día tipo, uniforme) en `restaurantes.configuracion` | cero | 0,5 d |
| **3** | Acuse de lectura + inducción del que entra | 1 tabla chica | 1 d |
| **4** | Dictado por voz + redacción con Haiku + borrador para puesto sin template | cero | 0,5 d |
| **5** | Ficha de partida (equipamiento de la estación) | a definir | **diferida** |

**La fase 0 se puede hacer hoy sin tocar la moratoria ni el schema**, y sola ya mejora el
"manual de puesto" que el PDF exporta desde agosto.

### 10.1 Dos huecos abiertos — ni el plan ni la investigación los cubren

**A · El puesto número 2 al 14.** Todo lo diseñado hasta acá describe *una* sesión para *un*
puesto. Pero el dueño tiene 14. A nueve minutos cada uno son dos horas, y nadie hace dos horas
de esto. **Qué se hereda entre puestos es la diferencia entre llenar uno y llenar catorce:**

- Cultura, políticas y no negociables **de la casa** no se repiten — salen de la carta de la
  casa (§ 6.1). Ese es el argumento más fuerte para subir la fase 2 de prioridad.
- Beneficios y crecimiento (`condiciones`) son casi siempre los mismos para todo el plantel:
  se copian del puesto anterior y se confirman, no se vuelven a dictar.
- Lo único verdaderamente por puesto: misión, el día, responsabilidades, indicadores.

→ A partir del segundo puesto la sesión debería ser de **3 tandas, no 6**. Sin esto, la
función se usa una vez y queda con un documento vigente y trece en blanco.

**B · El encuadre laboral.** *(Actualizado 18/09 con `Legalidad Puestos Gastronómicos
LatAm.md`. Lo que sigue no es asesoramiento legal: es el material ordenado para la consulta.)*

Lo que la investigación deja firme, con norma citada:

| Hallazgo | Norma | Consecuencia en el producto |
|---|---|---|
| El botón "leí y entiendo" es **firma electrónica**, no digital. Desconocida por el trabajador, la carga de la prueba cae en el empleador | Ley 25.506, arts. 5 y 6 | Rediseño del schema del acuse — § 5.1.b |
| Un detalle de tareas escrito y firmado **cristaliza condiciones esenciales** y limita el *ius variandi* posterior | LCT art. 66 | El documento describe, no contrata. Ver abajo |
| El CCT gastronómico dice que su descripción de tareas es **"a modo ilustrativo"** y no limita al empleador | CCT 389/04, desde art. 16 | Alivia el riesgo a nivel convenio, **no** a nivel del documento propio de la casa |
| Para ser oponible, el reglamento necesita **notificación fehaciente previa**; la jurisprudencia actual se conforma con probar toma de conocimiento real, sin homologación | LCT arts. 68 y 70 | El acuse tiene sentido — pero solo si es probable (§ 5.1.b) |

Y dos cosas que el propio documento marca como `inferencia`, o sea razonamiento del modelo sin
fallo que lo sostenga — **son las que más cambian el diseño y las que hay que confirmar**:

1. **El riesgo inverso.** Escribir que "el parrillero es responsable de la cadena de frío" no
   traslada nada: ante bromatología o la SRT, la sanción va al titular del fondo de comercio.
   La responsabilidad administrativa es indelegable por contrato interno.
2. **La vara que se da vuelta.** Si el documento exige registrar temperaturas y la casa no
   proveyó termómetro calibrado ni capacitación, la injuria se revierte y el despido con causa
   se cae.

> **Regla de redacción que sale de las dos, y va al seed y al prompt de Haiku: el documento
> describe tareas que la persona ejecuta, nunca responsabilidad legal que la persona asume.**
> *"Registra la temperatura de recepción"* — sí. *"Es responsable de la cadena de frío"* — no.
> Es una diferencia de una palabra y cambia de qué habla el documento.

**Qué se hace mientras tanto:** las fases 0-2 siguen sin bloqueo (no hay acuse ni límites
guardados). La fase 3 no se shipea hasta la consulta. Los no negociables se guardan y se
imprimen como **"expectativas de la casa"**, sin *"motivo de despido"* ni lenguaje
disciplinario en ninguna parte de la UI ni del PDF.

**Las 5 preguntas para el abogado** están redactadas en el § 2 de la investigación. La más
cargada de producto es la 3: si una **cláusula de polivalencia aceptada** neutraliza el
problema del art. 66. K-OS ya tiene matriz de polivalencia — si la respuesta es que sí, hay un
enganche fuerte; si es que no, se descarta. **No se construye nada de eso antes de preguntar.**

---

## 11. Lo que NO se hace

- **No es un editor de texto libre.** Si termina siendo un Word, pierde las 12 filas del § 3 y
  no hay razón para hacerlo dentro de K-OS.
- **No se evalúa a personas con esto.** `DESIGN.md` § 9 y § 10: *nada de rendimiento individual
  expuesto, rojo sobre personas, rankings individuales*. La descripción es **del puesto**, no
  de quien lo ocupa — mismo criterio con que el organigrama sobrevive a la rotación. Si la
  función se desliza hacia "evaluación de desempeño de Juan", viola la constitución del
  proyecto. Vale la pena escribirlo en el código, no solo acá.
- **Nada obligatorio.** Ninguna sección bloquea, ningún puesto queda "incompleto" en rojo. El
  documento sirve con tres secciones.
- **Sin sueldos** (§ 5.3).
- **Sin módulo propio en el menú.** Vive adentro de Organigrama, donde ya está el resto del
  objeto.

---

## 12. Con qué se cruza en el repo

- `lib/hooks/useEquipo.ts` — `Puesto`, `PUESTO_TEMPLATES` (14), `crearPuesto`/`actualizarPuesto`
- `components/organigrama/PuestosEditor.tsx` — el editor donde entra la puerta al cuestionario
- `lib/exportPDF.ts:331` — el "mini manual de puesto" que ya existe y que la fase 0 extiende
- `lib/constants.ts` — `AREA_CATALOGO`, `CAPAS`, plazas
- `components/organigrama/PolivalenciaPanel.tsx` + tabla `competencias` — de donde sale el referente
- `components/organigrama/OrganigramaWizardSheet.tsx` — el precedente de flujo por preguntas
- `lib/ia/claude.ts` + `lib/ia/costos.ts` — `pedirAClaude` y `registrarUsoIA`
- `PLAN-IMPLANTACION-2026-09.md` § 3 hito 1 — donde entra la estación 1.6
- `.claude/docs/negocio.md` § 7 — la moratoria
- `DESIGN.md` § 2 (registro Preparación), § 9, § 10
