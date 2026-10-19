# Plan — Organigrama: varios puestos por persona, "Quién responde" y reunión de organización

**Estado:** `PROPUESTA` · 19/10/2026 — diseño cerrado en sesión Opus, sin código todavía.
Ejecutar con Sonnet, en sesión nueva, fase por fase.
**Origen:** caso real de Bros (18-19/10). Tres socios (Franco, Agustín, Tefa) que llegan y no
saben a quién preguntarle sobre cocina, salón o compras. León es cocinero y además hace
compras, pagos, seguimiento de pedidos y mantenimiento. Lo que se busca: que los socios se
sienten y, en una reunión, documenten la organización que ya tienen o armen una nueva.

---

## 0. La frase corta

Una persona puede tener **varios trabajos**, no solo varias decisiones. Cada trabajo es un
puesto con sus tareas escritas, que sigue existiendo aunque la persona se vaya. La app tiene
que mostrar en una frase a quién se le pregunta cada cosa, y darles a los dueños una reunión
guiada que termine en un acta.

**Decisión de Facundo (19/10):** el modelo es **"puesto principal + puestos que también
cubre"**, no "un puesto + áreas a cargo". La pregunta que lo decidió fue: *si mañana León no
está, ¿qué le pasás al que lo cubre en compras?* La respuesta fue *una lista de qué hacer y
cómo*, y eso es un puesto.

---

## 1. Lo que encontró la auditoría (18/10, datos reales de Bros)

| Hallazgo | Se resuelve en |
|---|---|
| Agustín y Tefa no están cargados | Pendiente por pedido de Facundo (`PENDIENTES.md`) |
| León figura en el puesto "Dueño / Dirección". En realidad es cocinero, encargado de compras (con pagos y seguimiento) y de mantenimiento | Fase 1 + reunión |
| Salón, Comercial/Reservas y RRHH están activas **sin responsable** | Reunión (Fase 3) |
| Cobertura: 16 de 24 casillas obligatorias en rojo | Reunión (Fase 3) |
| Cocina tiene 4 responsables. El primero de la lista recibe los avisos (`responsableDeModulo`), pero ese orden es arbitrario e invisible | Fase 2 (titular explícito) |
| El puesto "Pasteleria" no tiene área, así que no aparece en Estructura | Fase 0 |
| El nivel de la persona no coincide con el de su puesto (León: nivel chef en un puesto admin; Zoe: nivel cocinero en un puesto sous_chef) | Reunión, cuando se reasignen los puestos |
| 0 descripciones de puesto, Carta de la casa vacía. **La condición de salida de la decisión 014 está cumplida desde el 02/10** | Decisión de negocio pendiente (ver § 8) |
| El tour del Coach habla de "tres vistas" (hay cinco) y no menciona Puestos, Polivalencia ni la Carta de la casa | Fase 0 |
| Texto viejo en Estructura: "creá uno en Equipo → Puestos" | Fase 0 |
| La pantalla está hecha para configurar, no para consultar: no hay forma de preguntarle a la app "¿a quién le pregunto por X?" | Fase 2 |

---

## 2. El modelo: tres preguntas distintas

| Pregunta | Dónde vive | Cuántos por persona |
|---|---|---|
| **¿Qué trabajo hace?** (las tareas, el manual) | `puestos` + `puesto_descripciones` | 1 principal + N que también cubre |
| **¿Quién responde por esta etapa del área?** | `area_capas` (Cobertura) | Las que sea. El **primero** de la lista es el titular |
| **¿A quién le pregunto cómo se hace en la plaza?** | `competencias` nivel 4 (referente) | Se detecta, no se designa (glosario regla 4) |

León con el modelo nuevo:

```
Puesto principal:      Cocinero Polivalente   (cocina)
También cubre:         Encargado de compras   (compras_almacen)  ← pedir, recibir, seguimiento, facturas, pagos
                       Mantenimiento          (infraestructura)  ← puesto nuevo, desde template
Responde (Cobertura):  Compras · Preparar + Controlar   (titular)
                       Infraestructura · todas           (titular)
```

**Qué define el puesto principal y qué no:**

| Lo define el principal | Lo suman los que también cubre |
|---|---|
| La carta del Plantel (color, plaza, nivel) | Permisos (`permisos_app`, unidos) |
| `plaza_default`, la bienvenida del onboarding, el costo y las horas en reportes | Aparecer como ocupante "también" en el árbol, la ficha del puesto y el PDF |
| Lo primero que se ve en Perfil → Mi puesto | Recibir los avisos de Calendario dirigidos a ese puesto |
| | Aparecer en Perfil → Mi puesto, en "También cubrís" |

`ver_costos`: `true` si cualquiera de los puestos lo tiene en `true`; si no, `false` si alguno
lo tiene en `false`; si no, `null`. Cubrir un puesto es hacer su trabajo, y el que paga
facturas necesita ver precios. `modulos_restringidos` sigue ganándole a todo.

**Por qué no "áreas a cargo" sin puesto:** Cobertura dice *quién*, no *qué*. Las tareas de
compras de León no quedarían escritas en ningún lado, y el objetivo de la reunión es
estandarizar.

---

## 3. Fase 0 — Limpieza (chica, sin cambios en la base)

1. Tour del Coach (`lib/coach/tours.ts` → `organigrama`): las 5 pestañas, Carta de la casa y
   la ficha del puesto. Agregar los `data-coach-target` que falten a `COACH_HIGHLIGHT_IDS`.
2. `app/(app)/organigrama/page.tsx`, `AreaBlock`: "Equipo → Puestos" pasa a "la pestaña
   Puestos".
3. `PUESTO_TEMPLATES` (`lib/hooks/useEquipo.ts`):
   - A **Encargado de compras** sumarle `'Hacer el seguimiento de los pedidos pendientes'` y
     `'Pagar a proveedores según vencimiento'`. Las facturas ya tienen `condicion_pago`,
     `fecha_vencimiento` y `status`.
   - Template nuevo **Mantenimiento** (área `infraestructura`): revisar equipos, coordinar
     técnicos, registrar arreglos. Es el único área con trabajo físico que no tiene template.
4. Datos de Bros: darle `area_key = 'cocina'` al puesto "Pasteleria". Es un dato obvio; igual
   avisarle a Facundo.

---

## 4. Fase 1 — Puestos que también cubre

### 4.1 Base de datos
Migración `supabase/migrations/2026MMDD_miembro_puestos_extra.sql`:
- `equipo_miembros.puestos_extra uuid[] not null default '{}'`. Va en paralelo a
  `modulos_extra` y al patrón `responsables uuid[]` de `areas`. **No es tabla nueva.**
- Trigger `before delete on puestos` que hace
  `array_remove(puestos_extra, old.id)` en los miembros del mismo restaurante. Sin FK, un
  puesto borrado deja ids colgando. Verificar que RLS deje correr el update. Si no, usar
  `security definer` con `search_path` fijo (ver `.claude/docs/rls.md`).
- Sin cambio de RLS: la columna vive en una tabla que ya filtra por `mi_restaurante_id()`.
- `NOTIFY pgrst, 'reload schema'` (memoria: PostgREST schema cache).

### 4.2 Permisos (lo delicado: correr `/impacto resolverModulosEfectivos` antes)
- `lib/permisos/resolver.ts`: `resolverModulosEfectivos` pasa a recibir
  `permisosApp: string[][]` (o una variante nueva `unirPermisosPuestos`) y une todos. Tests
  en `resolver.test.ts`: union, restringidos ganan, principal sin `permisos_app` + extra con
  permisos.
- `lib/hooks/usePermisos.ts` y `lib/permisos/server.ts` (réplica para el Coach): leer
  `puestos_extra`, traer los puestos con `.in('id', [principal, ...extras])`, resolver
  `ver_costos` como en § 2.
- `useEquipo.getModulosMiembro` (la duplicación client-side que usa `FichaMiembro`): misma
  unión.

### 4.3 Dónde se ve
| Lugar | Cambio |
|---|---|
| `MiembroCard` (frente) | Debajo del puesto: "También: Compras · Mantenimiento" (chips con el nombre corto del puesto) |
| `FichaMiembro` | Debajo del selector de puesto: "Puestos que también cubre", multi-select. Excluye el principal; deshabilitado si no hay principal |
| Estructura, `PuestoTreeRow` | Ocupantes: principales primero, después "León (también)" |
| `FichaPuesto` / formación | Mismo criterio de ocupantes |
| `PuestosEditor` y `kc_screen_context.puestosVacantes` | Un puesto que alguien cubre como extra **no** está vacante |
| `exportOrganigramaPDF` | Ocupantes con "(también)" |
| `lib/calendario/aviso-destino.ts` + `avisar.ts` + `useCalendario` | Destino "puestos" incluye a quien lo cubre como extra |
| `lib/coach/tools/registry.ts:149` | Mismo criterio al buscar personas por puesto |
| `/perfil/puesto` | Principal arriba; abajo la sección "También cubrís", con link a la ficha de cada puesto en modo lectura |
| `reportes/personal`, `BienvenidaPuesto`, `/api/invitar` | **Sin cambio:** principal solamente (§ 2) |

Un helper puro reemplaza la comparación `m.puesto_id === p.id` repetida:
`lib/organigrama/ocupantes.ts` → `ocupantesDePuesto(puestoId, miembros)` devuelve
`{ principales, tambien }`, más `puestosDeMiembro(m)`. Con tests.

### 4.4 Para verificar
`npm run build` + `npm test`. En Bros: a León como principal Cocinero Polivalente + extras
Encargado de compras y Mantenimiento. Tiene que entrar a Pedidos, Proveedores y Facturas
**sin override manual**, y su carta tiene que mostrar los dos chips. Esto se hace en la
reunión con Facundo, no a escondidas: cambiarle el principal le saca módulos del puesto
"Dueño / Dirección".

---

## 5. Fase 2 — "Quién responde" (consulta, para todo el equipo)

### 5.1 La vista
Nueva pestaña **Quién responde**, primera de la lista y la que abre por defecto para quien no
es admin. Una tarjeta por área activa, escrita en lenguaje de cocina:

```
Compras y almacén
proveedores · pedidos · recepción · pagos
  Decide cómo se hace        Franco
  Lo lleva día a día         León          ← titular · suplente: Facundo
  Revisa que salga bien      León
  Puestos: Encargado de compras — León (también)
```

- Las capas se traducen así: Definir → "Decide cómo se hace", Preparar → "Lo lleva día a
  día", Controlar → "Revisa que salga bien". **Ejecutar no se muestra**: es de todo el equipo.
- Cada tarjeta lleva un subtítulo con palabras de ejemplo, para que se encuentre "pagos"
  aunque el área se llame "Compras y almacén". Va como `ejemplos` nuevo en `AREA_CATALOGO`.
- Si una etapa está vacía: el admin ve "Nadie todavía" en rojo; el resto ve "Preguntale a
  {titular de Dirección}". Nunca un rojo que el cocinero no pueda resolver.
- Buscador arriba ("pagos", "heladera", "reservas") que filtra por nombre del área,
  `ejemplos` y tareas de los puestos del área.
- Datos: `area_capas` + `areas` + `puestos` + ocupantes (§ 4.3). Sin query nueva: la página
  ya carga todo.

### 5.2 Titular explícito
`ResponsablesPicker`: el primero de la lista lleva el badge "Titular" y el resto, "Suplente".
Acción "Hacer titular" para mover a alguien al primer lugar. Así queda visible algo que hoy
`responsableDeModulo` ya usa en secreto (el primero recibe el aviso).

### 5.3 Coach
Sumar al `kc_screen_context` de Organigrama el mapa `{ area, decide, lleva, revisa }[]`, más
un ejemplo en el system prompt: "¿a quién le pregunto por el pago a un proveedor?" → León,
Compras, "Revisa que salga bien". Fuera de Organigrama el Coach no tiene este mapa; si hace
falta, va en `buildSnapshot`. Medirlo antes de agregarlo.

---

## 6. Fase 3 — Reunión de organización

### 6.1 Entrada
Botón en el header, solo admin: **"Reunión"** (ícono `groups`). No reemplaza al asistente de
3 preguntas: el asistente es para arrancar de cero, la reunión es para ordenar lo que ya hay.

### 6.2 El recorrido (una pantalla por paso, en celular o tablet sobre la mesa)
0. **Quiénes están.** Se eligen los participantes. Se guarda una **foto del "antes"**
   (áreas, capas, puestos, ocupantes) en `localStorage`, con clave por restaurante, para que
   el acta salga aunque se recargue la página.
1. **Área por área.** Primero las activas; después las inactivas, con una sola pregunta
   ("¿esto existe en el local aunque nadie lo tenga asignado?"). En cada área se muestra
   **cómo está hoy, ya cargado**:
   - Puestos del área y quién los ocupa (principal / también). Si alguien hace ese trabajo y
     no figura: "Agregar puesto" desde template, o "Lo cubre también…" con el multi-select
     de la Fase 1.
   - Decide / Lleva / Revisa, con titular y suplente.
   - Botón grande **"Así está bien"** (un toque, pasa a la siguiente) o se cambia ahí mismo.
   - **"¿Está escrito cómo se hace?"**: tres casillas (descripción del puesto vigente /
     reglas en la Carta de la casa / rutinas en Mise o HACCP). No se edita nada en la
     reunión: lo que falta pasa a la lista de "por escribir", con responsable y fecha en
     texto libre. La reunión tiene que durar 45 minutos, no tres horas.
2. **Por persona.** Puestos y áreas de cada uno, y la alerta de carga: *"si falta Franco,
   quedan sin titular: Dirección, Calidad, I+D"*. Es la misma lectura que Polivalencia hace
   con las plazas, aplicada a las áreas. Función pura `lib/organigrama/carga.ts`
   (`cargaPorPersona`, `siFalta(miembroId)`) con tests.
3. **Acta.** PDF (`exportActaOrganizacionPDF` en `lib/exportPDF.ts`, mismo estilo que el
   organigrama): fecha, participantes, **antes → ahora** por área (solo lo que cambió, más
   "se confirmó sin cambios: …"), puestos por persona, lista "por escribir" y líneas para
   **firmar a mano**. Firma electrónica no: es el mismo problema legal que la Fase 3 de la
   descripción de puesto.

### 6.3 Cómo se guarda
Cada cambio se guarda en el momento, con las mutaciones que ya existen (`toggleAreaActiva`,
`toggleCapaResponsable`, `actualizarMiembro`, `crearPuesto`). Si la reunión se corta a la
mitad, queda una organización válida a medio ordenar, no un borrador colgado. El "antes" del
acta sale de la foto del paso 0. La lista "por escribir" vive en `localStorage` hasta que se
genera el acta. **No se crea tabla de reuniones ni de actas**: si después se quiere un
historial, es otra decisión.

---

## 7. Lo que NO se hace

- **El porcentaje societario no entra a la app.** Tener el 50% no da autoridad operativa; eso
  queda en el contrato social.
- Horas o costo partidos por puesto: el costo de León va entero a su puesto principal.
- Un módulo "Procesos". Cada estándar se carga donde ya vive: descripción del puesto, Carta
  de la casa, rutinas de Mise/HACCP.
- Firma electrónica del acta, e historial de reuniones o actas en la base.
- Drag-and-drop en el árbol de Estructura (sigue siendo `<select>`).
- Agustín y Tefa: se cargan cuando Facundo lo diga (`PENDIENTES.md`).

---

## 8. Moratoria y decisiones pendientes

- **No es un módulo nuevo** (no hay `ModuloId` nuevo ni tabla nueva): son una columna, una
  pestaña de consulta y un recorrido sobre datos que ya existen. Mismo argumento que la 013 y
  la 014: hace que se use la superficie que ya hay. Igual conviene **dejar una decisión
  escrita** (017) en `~/Desktop/START UP KOS/00-decisiones/DECISIONES.md` antes de la Fase 3,
  con su condición de salida.
- **Propuesta de condición de salida:** dos semanas después de la Fase 3, Bros hizo la reunión
  (hay un acta) y Cobertura no tiene casillas rojas sin decidir.
- **La decisión 014 está en condición de revertirse** (0 descripciones vigentes en Bros). Este
  plan le da a la 014 una razón concreta: la reunión deja "por escribir" la descripción de
  Encargado de compras, con León como responsable. Decidir si se espera a eso o si se revierte.

---

## 9. Orden y tamaño

| Fase | Qué | Tamaño |
|---|---|---|
| 0 | Tour, texto viejo, templates, Pastelería con área | ~1 h |
| 1 | `puestos_extra` + permisos unidos + dónde se ve | ~1 día (lo caro es el permiso: tests primero) |
| 2 | Quién responde + titular explícito + contexto del Coach | ~medio día |
| 3 | Reunión + carga por persona + acta PDF | ~1-1,5 días |

Después de la Fase 3: hacer la reunión real en Bros (Facundo, Franco, León) y medirla contra
la condición de salida.
