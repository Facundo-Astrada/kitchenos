# KitchenOS medido contra el marco de dominio

*Auditoría aplicada · Agosto 2026 · el marco vive en `dominio-marco.md`*

Método: se leyó completo el código citado (`types/index.ts`, `lib/constants.ts`,
`lib/ops/` entero con sus tests, `lib/comanda/`, `lib/carta/ingenieriaMenu.ts`,
`lib/menus/`, los hooks de comandas/cuenta/menús/HACCP, `lib/reportes/`,
`lib/fiscal/index.ts`), se contrastó contra el lenguaje del dominio real
(`SINTESIS-ORGANIZACION-GASTRONOMICA.md`) y contra `AUDITORIA-4-CAPAS.md`, y se
verificó contra la base viva (conteo de tablas, índices, triggers — 31/08).

Números del relevamiento: **91 tablas** en `public` (90 productivas + 1 backup),
**139 tipos** en `types/index.ts` (82 interfaces + 57 type aliases — el número de la
consigna verifica), **84 migraciones**, **20 carpetas de dominio** en `lib/`,
**107 archivos** nombran "plaza" y **90** nombran "turno", **6 tablas** llevan
"turno" en el nombre y ninguna significa lo mismo que otra.

Escala de veredictos: ✅ cumple · ⚠️ parcial · 🔴 violado.

---

## 0. Correcciones previas

**1. El censo de tablas está viejo.** [ARQUITECTURA.md:226](ARQUITECTURA.md#L226) dice
78 tablas; la base tiene 91 (verificado con `pg_tables`). Las 13 de diferencia son
tablas de agosto que el doc no incorporó (`reservas`, `bitacora_*`,
`control_carta_registros`, `rutina_turno_*`, `proveedor_incidencias`,
`notificaciones`, `areas`, `area_capas`, `presupuesto_mes`, `presupuesto_sector`) más
el backup `tareas_duplicados_backup_20260826`. Acción 🟢-6.

**2. Precisión sobre el descarte de la sesión 1.** `arquitectura-marco.md` §5 descartó
"DDD táctico completo" diciendo que "el único concepto DDD que este stack usa de facto
es el aggregate implícito". El descarte del aparato (clases, repos, bus) se confirma;
lo del agregado *implícito* se revierte: §4 de esta auditoría muestra que dejarlo
implícito es exactamente lo que produjo las tres invariantes que hoy no garantiza nadie.
El detalle en `dominio-marco.md` §4.

**3. La deuda de hooks de la sesión 1 tiene explicación de dominio.**
`arquitectura-kos.md` §2.2 censó los hooks que no encajan en el patrón SWR estándar y
los defendió caso por caso. Vistos desde el dominio, no son excepciones sueltas: el
patrón estándar modela **estado vivo del restaurante** (listas keyed por tenant que
cambian en tiempo real), y los que no encajan sirven **otro tipo de modelo** —
documentos históricos paginados (`useFacturas`), agregaciones por período
(`useReportes`), un stream de mensajes (`usePase`). La frontera que el código estaba
pidiendo no era técnica sino de modelo: lo operativo-vivo y lo histórico-consultable
son lecturas de naturaleza distinta, y está bien que tengan patrones distintos. Eso
convierte el "borde de diseño legítimo" de la sesión 1 en una regla enunciable: hook
nuevo → preguntar primero de qué lado del borde está su dato.

---

## 1. El mapa de contextos — ⚠️ existe en el código, no existe como decisión

La pregunta de la sesión: 28 módulos y 91 tablas — ¿cuántos bounded contexts hay de
verdad? Respuesta: **nueve con frontera real, más tres satélites chicos.** No es una
propuesta estética: cada frontera de abajo ya se ve en el código como cambio de
vocabulario, de actor o de runtime.

| # | Contexto | Tablas (núcleo) | `lib/` | Módulos | Subdominio |
|---|---|---|---|---|---|
| 1 | **OPS — operación de cocina** | `tareas`, `checklist_*` (7), `cierres_turno`, `rutina_turno_*`, `produccion_diaria`, `produccion_registros`, `espacios`, `espacio_plazas`, `pase_mensajes`, `calendario_nota_items`, `eventos`, `evento_items`, `control_carta_registros` | `ops/` (5 módulos + 5 tests — la carpeta más madura del repo), `checklist/`, `produccion/` | operaciones, pase, calendario, espacios, muro | **CORE** (§2) |
| 2 | **Servicio — salón y KDS** | `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina`, `mesas`, `salon_elementos`, `estaciones` | `comanda/`, `salon/`, `servicio/`, `offline/` | salon, kds — con **route group propio** `(servicio)`: otro layout, offline, sin Coach | **CORE** (segundo) |
| 3 | **Catálogo — recetario, carta, menús** | `recetas`, `ingredientes`, `carta_items`, `carta_categorias`, `plato_recetas`, `plato_plazas`, `plato_packaging`, `packaging_*`, `menus`, `menu_preparaciones`, `platos_compuestos`, `plato_componentes` | `recetas/`, `carta/`, `menus/` | recetario, carta | Soporte del core — es la capa "Definir" |
| 4 | **Abastecimiento** | `productos`, `categorias_producto`, `stock_sectores`, `stock_estantes`, `precio_historial`, `proveedores`, `proveedor_incidencias`, `pedidos`, `pedido_items`, `facturas`, `factura_items`, `categorias_gasto`, `merma` | `stock/` | stock, pedidos, proveedores, facturas, merma | Soporte (la detección de fuga es su punta diferencial) |
| 5 | **Cobro y caja** | `cuentas`, `pagos`, `medios_pago`, `cajas_turnos`, `caja_movimientos`, `clientes`, `cuenta_corriente_movimientos` | — | cobro, clientes | Soporte |
| 6 | **Fiscal** | `config_fiscal`, `comprobantes`, `comprobante_items`, `fiscal_config`, `fiscal_tickets` | `fiscal/` | fiscal | **Genérico** — comprado vía ACL |
| 7 | **Control y métricas** | `ventas`, `ventas_items`, `presupuestos`, `presupuesto_mes`, `presupuesto_sector`, `checklist_auditorias` | `reportes/`, `carta/ingenieriaMenu.ts` | reportes, presupuesto, ventas | Soporte (cierra el ciclo de las 4 capas) |
| 8 | **HACCP / calidad** | `haccp_*` (5) | `haccp/` | haccp | Soporte |
| 9 | **Identidad y acceso** | `restaurantes`, `perfiles`, `user_restaurantes`, `rol_permisos`, `puestos`, `equipo_miembros`, `turnos`, `turnos_personal`, `areas`, `area_capas` | `auth/`, `permisos/` | equipo, turnos, organigrama, configuracion | Soporte / shared kernel |
| — | Satélites | Comercial (`reservas`), Bitácora (`bitacora_*`), Coach (`coach_acciones`), Notificaciones (`notificaciones`) | `reservas/`, `coach/`, `notificaciones/` | reservas, bitacora, coach | Embrión / soporte / transversal |

Nota sobre el marco propio del proyecto: `AUDITORIA-4-CAPAS.md`
(Definir/Preparar/Ejecutar/Controlar, [lib/constants.ts:357](lib/constants.ts#L357)) es
un candidato natural a mapa, pero **no es un mapa de contextos: es un eje transversal.**
Cada contexto de arriba atraviesa las cuatro capas (Abastecimiento define stock mínimo,
prepara pedidos, ejecuta recepción y controla incidencias). Las capas dicen *qué
función* cumple una feature; los contextos dicen *en qué lenguaje y con qué tablas*.
Se complementan, no compiten. Lo mismo el catálogo de 12 áreas
([lib/constants.ts:283](lib/constants.ts#L283)): es organigrama humano, no frontera de
modelo — aunque coincide notablemente con la tabla de arriba, lo cual es buena señal:
el negocio y el código ven fronteras parecidas.

### 1.1 Las relaciones entre vecinos — dónde ya hay costura y de qué tipo

| Borde | Patrón (marco §1.3) | Evidencia | Veredicto |
|---|---|---|---|
| Catálogo → OPS | **Customer/Supplier con traducción explícita** | `upsertMiseChecklistItem` ([lib/ops/mise.ts:156-200](lib/ops/mise.ts#L156-L200)), `sincronizarMiseDeMenu` ([lib/ops/menuMise.ts:31-51](lib/ops/menuMise.ts#L31-L51)), `activarMenuParaFechas` ([lib/menus/activarMenu.ts:20-45](lib/menus/activarMenu.ts#L20-L45)). La prueba de que son DOS modelos: existe una tabla de traducción de prioridades entre las dos escalas — `TAREA_PRIO_TO_MISE` ([lib/ops/mise.ts:22-28](lib/ops/mise.ts#L22-L28)): `critica/alta/media/baja` de un lado, `sp/p/ref/chk` del otro | ✅ La costura más trabajada del repo. Es la que sostiene el producto |
| Servicio → OPS | Integración por hecho aditivo | El Salón incrementa `checklist_items.demanda_viva` vía `/api/salon/prep-list-update` ([.claude/docs/columnas.md:71](.claude/docs/columnas.md#L71)) — un contador, no una edición del modelo ajeno | ✅ Forma correcta: el Servicio no toca el mise, le suma demanda |
| Servicio → Catálogo | Conformist (lectura) + escritura acotada a UN campo | El KDS/Salón leen `carta_items` como vienen; la única escritura cruzada es `disponible` (el 86), con tres escritores legítimos que hablan el mismo término: `/api/carta/86`, la tool `marcar_86` del Coach ([lib/coach/tools/registry.ts:113-137](lib/coach/tools/registry.ts#L113-L137)) y el `no_sale` del control de carta ([types/index.ts:464-468](types/index.ts#L464-L468)) | ✅ en diseño (⚠️ el endpoint sigue sin auth — 🔴 vigente de la sesión 1) |
| Cobro → Fiscal | **La mejor relación entre contextos del repo**: hecho disparado, estado propio, sin bloqueo | `cobrarCuenta` dispara la emisión y si falla queda `'pendiente'` — deliberado y comentado ([lib/hooks/useCuenta.ts:119](lib/hooks/useCuenta.ts#L119)); el otro lado es un ACL de manual: `ProveedorFiscal` + stub que degrada legible ([lib/fiscal/index.ts:23-36](lib/fiscal/index.ts#L23-L36)) | ✅ Modelo a imitar para todo borde futuro |
| Abastecimiento ↔ Catálogo | Dos nombres para la misma cosa física = dos modelos correctos, con puente por id | "Producto" (bulto, proveedor, stock) vs "ingrediente" (línea de receta con cantidad/unidad/merma), unidos por `ingredientes.producto_id` y el auto-link por nombre (`/api/recetas/auto-link-ingredientes`) | ✅ No es sinonimia rota: es la frontera bien puesta |
| Control (Ventas) → Catálogo | **Published language**: nombre de plato normalizado | `normalizarNombrePlato` + `buildCartaItemLookup` ([lib/reportes/consumoTeorico.ts:13-15](lib/reportes/consumoTeorico.ts#L13-L15), [53-60](lib/reportes/consumoTeorico.ts#L53-L60)) — el mismo criterio compartido por ingeniería de menú, fuga y sugerencia | ⚠️ Correcto como ACL de datos externos sin id (el POS no manda ids), pero el costo está medido: 13 de 272 nombres matchean en producción ([PENDIENTES.md:65](PENDIENTES.md#L65)) |
| HACCP ↔ OPS | Sync por id + matching por nombre | La limpieza crea una `checklist_rutina` y guarda su id... en una columna llamada `checklist_item_id` ([lib/hooks/useHaccp.ts:314-317](lib/hooks/useHaccp.ts#L314-L317), [401-402](lib/hooks/useHaccp.ts#L401-L402)); heladera/freezer linkean por `ilike` de nombre ([.claude/docs/columnas.md:40](.claude/docs/columnas.md#L40)) | ⚠️ Funciona, pero el nombre de la columna miente (§3) y el link por nombre se rompe en silencio al renombrar |
| Coach → todos | Conformist en lectura, published language en escritura | Lee las filas con RLS filtrando; escribe solo a través del registry con schema Zod + confirmación | ✅ |
| Identidad → todos | Shared kernel | `restaurante_id` en todo, `equipo_miembros.id` como convención de `usuario_id` | ✅ mientras se mantenga mínimo |
| Comercial (Reservas) → nadie | **Separate ways deliberado** | El comentario lo declara: "Tabla aislada: sin enganches a OPS/Salón/Calendario/Dashboard todavía" ([types/index.ts:1233-1235](types/index.ts#L1233-L1235)) | ✅ como táctica de entrega — B9/B10 son exactamente el plan de integrarla |

**Veredicto en una línea:** las costuras existen y varias son de manual — lo que no
existe es el mapa como documento de decisión. Cada costura se diseñó bien *en el
momento*, pero nada le dice a la próxima feature qué patrón le toca a su borde. Esta
tabla es ese documento a partir de ahora.

---

## 2. El core domain — la destilación

**¿Qué hace único a K-OS frente a un ERP gastronómico genérico?** No el recetario con
food cost (lo tiene cualquiera), ni las facturas con OCR (commodity de 2026), ni los
reportes. Es esto:

> **La máquina del turno de cocina**: la jornada operativa que no rueda a medianoche
> ([lib/ops/turnos.ts:12-15](lib/ops/turnos.ts#L12-L15)), el turno vigente decidido por
> la entrega de la plaza y no por el reloj
> ([lib/ops/turnos.ts:148-153](lib/ops/turnos.ts#L148-L153),
> [192-222](lib/ops/turnos.ts#L192-L222)), el mise con déficit por recipiente y demanda
> viva del salón ([lib/ops/mise.ts:60-73](lib/ops/mise.ts#L60-L73)), la identidad "una
> preparación, una fila" que fusiona los cuatro caminos por los que llega el mismo
> trabajo ([lib/ops/dedupeTareas.ts:3-17](lib/ops/dedupeTareas.ts#L3-L17)), y la
> entrega como hecho inmutable que activa el turno siguiente
> ([types/index.ts:517-519](types/index.ts#L517-L519)).

Tres evidencias de que ese es el core y el proyecto ya lo trata como tal sin decirlo:

1. **Es el único rincón del repo con densidad de tests de dominio**: `lib/ops/` tiene 5
   módulos y 5 archivos de test; ningún otro contexto se le acerca.
2. **Es donde el proyecto superó al material**: `AUDITORIA-4-CAPAS.md` §4 lo dice
   textual — "el material describe hojas de papel y reuniones; esto es otra categoría
   de solución" ([AUDITORIA-4-CAPAS.md:177](AUDITORIA-4-CAPAS.md#L177)). Donde no hay
   libro contra el cual copiar, hay diferenciación.
3. **Es donde duelen los bugs**: los tres bugs reales con fecha y nombre que el código
   conmemora en comentarios son de acá — la rutina que abría en el turno equivocado
   ([lib/ops/turnos.ts:96](lib/ops/turnos.ts#L96)), la "Trucha curada" ×10
   ([lib/ops/dedupeTareas.ts:12](lib/ops/dedupeTareas.ts#L12)), el aceite de ajo
   tildado con la tarea abierta ([lib/ops/syncMise.ts:19-24](lib/ops/syncMise.ts#L19-L24)).
   Los bugs se acumulan donde está la complejidad esencial.

**Segundo core:** el Servicio con offline real (bump en cola IndexedDB, estado
optimista, reconexión — [lib/hooks/useComandas.ts:212-220](lib/hooks/useComandas.ts#L212-L220)).
Es core porque un KDS que pierde bumps con el wifi de una cocina no se vende dos veces.

**Genéricos** (comprar/adaptar, cero diseño propio): Fiscal (ya resuelto vía ACL), Auth
(Supabase), pagos futuros (Stripe). **Soporte** (lo más simple que funcione, CRUD sin
culpa): HACCP, Bitácora, Clientes, Notificaciones, Identidad, y la mayor parte de
Abastecimiento y Control.

**La consecuencia práctica**, que es para lo que sirve la destilación: una hora de
diseño/test vale más en `lib/ops/` y `lib/comanda/` que en cualquier otro lado; y a la
inversa, sofisticar un contexto de soporte (un patrón nuevo para el CRUD de categorías)
es esfuerzo core gastado en soporte. La sesión 3 (refactorización) debería ordenar su
lista con esta tabla en la mano.

---

## 3. El glosario ubicuo — ⚠️ existe sin saberlo, con rupturas caras

K-OS ya habla el idioma de la cocina en el código — eso está por encima de lo normal.
El glosario real, extraído del código y contrastado con la síntesis gastronómica:

### 3.1 Los términos que se sostienen

| Término | En la cocina | En el código | Estado |
|---|---|---|---|
| **plaza** | La partida/estación (la síntesis usa "partida", el habla argentina "plaza") | `Plaza`, `PLAZAS_FIJAS`, `checklist_items.plaza`, `merma.plaza`… — 107 archivos, un solo significado | ✅ El mejor término del repo. Las dos "plazas" no físicas (`general`, `menu`) están documentadas como especiales donde se definen ([lib/constants.ts:16-28](lib/constants.ts#L16-L28)) |
| **86** | Plato agotado, dejá de venderlo | `carta_items.disponible=false`; tres escritores, todos lo llaman 86 ([lib/coach/tools/registry.ts:117](lib/coach/tools/registry.ts#L117)) | ✅ |
| **jornada operativa** | El día de la cocina, que termina de madrugada | `hoyOperativo()`, corte 05:00, `cierres_turno.jornada` ([lib/ops/turnos.ts:65-69](lib/ops/turnos.ts#L65-L69)) | ✅ concepto; ⚠️ nombre: `tareas.turno_fecha` guarda una jornada y no lo dice |
| **comanda / mozo / mesa / bump / fire / hold / recall** | El vocabulario del pase de salón | `EstadoComanda`, `EstadoComandaItem`, `eventos_cocina` ([types/index.ts:1096-1100](types/index.ts#L1096-L1100)) | ✅ (una arruga: el ítem queda `'bumpeado'` pero el evento se llama `'bumped'` — dos idiomas en el mismo agregado) |
| **entrega de plaza** | "Entregué la plaza" = terminé mi turno y queda registrado | `cierres_turno` + `claveCierre()` ([lib/ops/turnos.ts:156-158](lib/ops/turnos.ts#L156-L158)) | ✅ y es un hecho inmutable — evento de dominio sin saberlo |
| **demanda viva** | Lo que el salón ya pidió y todavía no se repuso | `checklist_items.demanda_viva` | ✅ término inventado por el proyecto, pero preciso y de un solo dueño |
| **fuga** | Inventario que se va sin facturarse — "puede quebrar el negocio" (síntesis §6.3) | `lib/reportes/fuga.ts`, `/api/reportes/fuga` ([lib/reportes/fuga.ts:39-56](lib/reportes/fuga.ts#L39-L56)) | ✅ |
| **producto / ingrediente** | El bulto que se compra / la línea de la receta | Dos modelos con puente `producto_id` (§1.1) | ✅ frontera, no ruptura |
| **ficha técnica** | El estándar de referencia (síntesis §5.4) | `recetas` + `calcFoodCost` ([lib/hooks/useRecetas.ts:54-57](lib/hooks/useRecetas.ts#L54-L57)); "escandallo" (=costeo, síntesis) se tradujo a "food cost", que es lo que el rubro argentino habla | ✅ elección consciente |
| **merma** | La síntesis distingue merma (esperable) de desperdicio (evitable) (§5.6) | K-OS junta ambas en `merma` con `motivo` que las separa, y pone lo esperable en `productos.merma_esperada_pct` | ✅ colapso deliberado y funcional — la distinción vive en el motivo, no en dos tablas |

### 3.2 Las rupturas — una palabra, N cosas

**"turno" — la ruptura más cara del repo: al menos 7 significados.**

| Dónde | Qué significa |
|---|---|
| `turnos` | Grilla de horarios del personal |
| `turnos_personal` | Fichaje entrada/salida |
| `TurnoServicio` (JSONB en config) | Bloque horario del servicio (almuerzo/cena) ([types/index.ts:504-507](types/index.ts#L504-L507)) |
| `checklist_registros.turno` | Turno **+ fase** codificados juntos (`'cena:apertura'`) ([lib/ops/turnos.ts:227-233](lib/ops/turnos.ts#L227-L233)) |
| `cierres_turno` | La entrega de una plaza |
| `cajas_turnos` | El turno de la caja (apertura→arqueo) |
| `merma.turno` (`TurnoMerma`) | Fase del día: apertura/servicio/cierre |

Más `tareas.turno_fecha` (que es una jornada), `pase_mensajes.turno_tipo` (un enum
viejo hardcodeado `'almuerzo'|'cena'|'noche'`,
[types/index.ts:584](types/index.ts#L584), que ignora los turnos configurables) y
`rutina_turno_*`. El proyecto lo sabe — el comentario de
[types/index.ts:504-507](types/index.ts#L504-L507) desambigua contra CUATRO tablas, y
[types/index.ts:818-822](types/index.ts#L818-L822) tiene que aclarar que
`RutinaTurno` ≠ `ChecklistRutina` "pese al nombre" — y ya pagó un bug real por la
confusión entre dos de los significados
([lib/ops/turnos.ts:96](lib/ops/turnos.ts#L96)). **Costo:** cada feature que toca
tiempo necesita leer un comentario desambiguador antes de escribir una línea; grep no
sirve; y la próxima tabla con "turno" en el nombre nace ambigua por herencia.

**"mise" — un concepto, tres nombres.** El dominio y los docs dicen *mise*; las tablas
y hooks dicen *checklist* (`checklist_items`, `useChecklist`); la UI dice *Plazas*
([lib/constants.ts:129](lib/constants.ts#L129)). El concepto central del producto —
la síntesis lo llama "el concepto central, y es más grande que la cocina" — es el único
que no tiene nombre único en el sistema. **Costo:** sinonimia pura — todo onboarding
(humano o IA) tiene que aprender la equivalencia, y las búsquedas por "mise" no
encuentran las tablas.

**"sección" — cuatro cosas.** `checklist_secciones` (sección del mise),
`tareas.seccion` (que para modo menú/evento guarda el **paso** del menú —
[lib/ops/dedupeTareas.ts:55](lib/ops/dedupeTareas.ts#L55) tiene que elegir el eje según
el modo), `stock_sectores`/`mesas.sector` (lugares físicos), `Ingrediente.grupo` (etapa
de la receta) conviviendo con `seccion_mise` en la misma interfaz
([types/index.ts:63-72](types/index.ts#L63-L72)). **Costo:** medio — los usos están
separados por tabla, pero `tareas.seccion` significando "paso" es una mentira suave que
ya obliga a lógica condicional.

**"evento" — tres cosas.** `eventos` (calendario), `menus.tipo='evento'` (menú de
evento), `eventos_cocina` (hechos del KDS: fired/bumped/recalled). **Costo:** bajo
mientras no se crucen en la misma pantalla, pero "evento" ya no se puede usar pelado en
una conversación de diseño.

**"item" — dos familias.** Sufijo de línea-de-documento (`factura_items`,
`pedido_items`, `comanda_items`, `ventas_items`) y sufijo de entrada-de-catálogo
(`carta_items`, `checklist_items`, `rutina_turno_items`). **Costo:** bajo, pero la
regla implícita ("¿item de qué agregado?") nunca se escribió.

**`status` vs `estado` — dos idiomas para lo mismo.** Las tablas viejas dicen `status`
(`recetas`, `facturas`, `pedidos`, `produccion_diaria`), las nuevas `estado`
(`comandas`, `cuentas`, `mesas`, `cajas_turnos`) — y `tareas` tiene **los dos**, con la
derivación legacy resuelta en un solo escritor
([types/index.ts:549](types/index.ts#L549), [572](types/index.ts#L572)). **Costo:**
bajo por fila, permanente en total.

**El nombre que miente:** `haccp_limpieza.checklist_item_id` guarda el id de una
`checklist_rutina`, no de un `checklist_item` — el propio código lo confiesa dos veces
([lib/hooks/useHaccp.ts:317](lib/hooks/useHaccp.ts#L317),
[401](lib/hooks/useHaccp.ts#L401)). Es la ruptura más barata de documentar y la más
cara de dejar sin documentar: cada lector nuevo se equivoca hasta que un comentario lo
rescata.

**Duplicación en el shared kernel:** las plazas están definidas DOS veces —
`PLAZAS_FIJAS`+labels+colores en [lib/constants.ts:4-29](lib/constants.ts#L4-L29) y
`PLAZAS_OPS` en [lib/ops/mise.ts:8-20](lib/ops/mise.ts#L8-L20), con un comentario
"mantener en espejo". Es connascence de valor dentro del vocabulario canónico — el
lugar donde menos se la espera.

**Veredicto §3:** ⚠️ — el lenguaje es mucho mejor que el promedio (plaza, 86, fuga,
demanda viva, entrega son ubicuos de verdad), pero las rupturas están en los términos
más centrales (turno, mise) y ya cobraron al menos un bug. La acción no es renombrar:
es congelar el glosario y legislar los bautismos nuevos (acción 🟡-4).

---

## 4. Agregados e invariantes — 🔴 las invariantes cross-device viven en el cliente

La pregunta del marco §3.2: por cada agregado, ¿quién garantiza hoy su invariante?
Verificado contra la base: **cero triggers** sobre `comandas`, `comanda_items`,
`cuentas`, `mesas` y `tareas` — toda invariante de esas tablas vive en el cliente o en
ningún lado.

| Agregado | Invariante | Quién la garantiza hoy | Veredicto |
|---|---|---|---|
| **CajaTurno + movimientos** | Una sola caja abierta por restaurante; arqueo como snapshot inmutable | **La base**: índice único parcial `idx_cajas_turnos_una_abierta` (verificado) + snapshot documentado ([.claude/docs/columnas.md:76](.claude/docs/columnas.md#L76)) | ✅ El modelo a imitar — es el único agregado del repo con su invariante en el lugar correcto |
| **Mise: item + registros** | Un registro por (ítem, fecha, turno) | **La base**: `UNIQUE(checklist_item_id, fecha, turno)` (verificado) — por eso el upsert con `onConflict` funciona | ✅ |
| **Producción: identidad de tarea** | "Una preparación, una fila" por (jornada, modo, destino, menú, título) | La fusión en memoria + guard contra cache local ([lib/ops/dedupeTareas.ts:113-137](lib/ops/dedupeTareas.ts#L113-L137)); la rendija de dos dispositivos en el mismo segundo está identificada y el plan de llevarla a Postgres ya está escrito ([PENDIENTES.md:140](PENDIENTES.md#L140)) | ⚠️ con plan correcto ya redactado — ejecutarlo, no rediseñarlo |
| **Menú + preparaciones** | El menú y sus preparaciones cambian juntos | **Nadie.** `actualizarMenu` borra TODAS las `menu_preparaciones` y recién después inserta las nuevas, desde el browser ([lib/hooks/useMenus.ts:190-215](lib/hooks/useMenus.ts#L190-L215)). Un corte de red entre el delete y el insert deja el menú **vacío** — no estado a medias: pérdida del trabajo de carga | 🔴 El hallazgo nuevo más serio de esta sesión. Peor que `crearFactura` en modo de falla (ahí queda mitad; acá queda nada) |
| **Comanda + items + modificadores** | Las transiciones de la máquina de estados; y "todos los ítems listos/bumpeados ⇒ comanda lista" | Solo el cliente: los guards de `stateMachine.ts` corren antes de cada write ([lib/hooks/useComandas.ts:137-159](lib/hooks/useComandas.ts#L137-L159)), y la invariante derivada se decide contra la **cache local** posiblemente vieja ([lib/hooks/useComandas.ts:179-187](lib/hooks/useComandas.ts#L179-L187)). Dos tablets KDS bumpeando a la vez pueden dejar todos los ítems bumpeados y la comanda sin pasar a `lista` — el salón no se entera de que el plato está | ⚠️ Cross-device ⇒ le toca a la base (trigger o rpc), regla del marco §3.2 |
| **Cuenta + pagos (+ mesa)** | Cuenta cerrada ⇒ pagada; una cuenta abierta por mesa; mesa libre ⇔ sin cuenta abierta | **Nadie.** El total se escribe con el valor que manda el cliente ([lib/hooks/useCuenta.ts:94-104](lib/hooks/useCuenta.ts#L94-L104)); no existe índice único de cuenta abierta por mesa (verificado — el de cajas sí existe, el de cuentas no); la coherencia mesa↔cuenta la sostienen dos hooks distintos ([lib/hooks/useMesas.ts:81](lib/hooks/useMesas.ts#L81) pone `ocupada`, [lib/hooks/useCuenta.ts:107](lib/hooks/useCuenta.ts#L107) pone `libre`) | ⚠️ Dos mozos abriendo la misma mesa a la vez = dos cuentas abiertas. Hoy lo impide solo la UI |
| **Factura + items** | El documento entra entero o no entra | Nadie (sesión 1, 🟠-3 vigente). Lo que el dominio agrega: el **alcance correcto** de la transacción es factura+items; los efectos sobre productos/precios/proveedor son OTROS agregados y van como paso idempotente aparte, no adentro de la transacción | ⚠️ refina la acción de la sesión 1 — ver §4.1 |
| **Restaurante (signUp)** | La cuenta nace completa (5 filas) o no nace | Nadie — es la factory sin atomicidad de la sesión 1, con endpoint-curita | ⚠️ ya conocido |
| **Receta + ingredientes** | La ficha es consistente | Las escrituras están concentradas server-side en `/api/recetas/save`; el food cost se **calcula al leer** y no se persiste ([lib/hooks/useRecetas.ts:54-57](lib/hooks/useRecetas.ts#L54-L57)) — no hay copia que desincronizar | ✅ parcial — el patrón "derivado que no se guarda" es la forma más barata de invariante y acá está bien usada |
| **Stock (`productos.stock_actual`)** | El número refleja compras − consumo − merma | **Es una proyección multi-escritor sin serlo del todo**: la escriben recepción de pedidos, merma, ajustes y el rebuild — y la existencia misma de `/api/stock/rebuild` confirma que la verdad son los hechos (facturas, movimientos) y la celda es derivada | ⚠️ La lectura DDD ordena lo que ya pasa: hechos inmutables + proyección re-derivable (marco §3.4). No hay que construirlo — hay que dejar de tratarlo como celda primaria |

### 4.1 Lo que esto le corrige a la sesión 1

La sesión 1 (§3.1 de `arquitectura-kos.md`) encontró tres transaction scripts en el
browser y prescribió "transacción o endpoint". El agregado afina el bisturí:

- **`crearFactura`**: la transacción debe cubrir factura+items, **nada más**. Matching
  de productos, actualización de precios e historial son efectos sobre otros agregados:
  paso idempotente aparte (re-corrible sin duplicar). Meterlos en la misma transacción
  acoplaría Abastecimiento entero a la carga de un documento. El esfuerzo estimado de
  🟠-3 baja: el núcleo transaccional es chico.
- **`cobrarCuenta`**: los pasos 1-3 (pagos, cerrar cuenta, liberar mesa) son el
  agregado y van juntos en una rpc; los pasos 4-6 (merma-auto, fiscal, flag) son otros
  contextos y **ya están bien** como disparos con estado propio — no hay que
  "arreglarlos", hay que dejarlos exactamente como están.
- **`signUp`**: es una factory (marco §3.5) — una rpc que crea las 5 filas o ninguna.

Y suma un caso que la sesión 1 no vio: **`actualizarMenu`** (tabla de arriba), que es
el mismo patrón con peor modo de falla.

---

## 5. Los links polimórficos, juzgados desde el dominio

La sesión pedía leer las razones antes de opinar. Leídas
([ARQUITECTURA.md:254](ARQUITECTURA.md#L254),
[.claude/docs/columnas.md:67](.claude/docs/columnas.md#L67)):

**`menu_preparaciones.ref_id` (+ `tipo` plato/receta/producto) — ✅ es la costura
correcta, no un contexto mal cortado.** La clave está en qué es una preparación: una
**línea de planificación** cuyo payload real es `nombre` (denormalizado a propósito,
[lib/hooks/useMenus.ts:12-32](lib/hooks/useMenus.ts#L12-L32)); el `ref_id` es
enriquecimiento opcional hacia el Catálogo. Un menú tiene que sobrevivir a que la
receta se borre o cambie — es un documento del plan, no una vista del catálogo. Un FK
duro haría exactamente lo contrario: ataría la historia de los menús al ciclo de vida
del catálogo. El mismo razonamiento vale para `calendario_nota_items.tarea_id` y
`proveedor_incidencias.pedido_id`
([.claude/docs/columnas.md:81](.claude/docs/columnas.md#L81),
[83](.claude/docs/columnas.md#L83)). El costo aceptado: refs colgantes posibles y nadie
las mira — de ahí la acción 🟢-5 (chequeo de huérfanos, NO agregar FKs).

**`checklist_secciones` ↔ HACCP por `ilike` de nombre — ⚠️ vivible, con el costo
enunciado.** Es identidad-por-convención entre dos contextos: renombrar la sección
rompe el link en silencio. La alternativa (FK) acoplaría la estructura del mise al
ciclo de vida de HACCP — peor. Se acepta, pero el glosario debe decirlo y la UI podría
avisar al renombrar. Distinto es `checklist_item_id` guardando un id de rutina: eso no
es polimorfismo, es un nombre que miente (§3.2).

**`ventas_items.nombre_plato` por nombre normalizado — ✅ como ACL, con su costo ya
medido.** Los datos del POS externo no traen ids: matchear por published language
(nombre normalizado) es la única opción, y el proyecto la centralizó bien
([lib/reportes/consumoTeorico.ts:1-11](lib/reportes/consumoTeorico.ts#L1-L11)). El
13/272 de PENDIENTES no es un bug del mecanismo — es la medida de cuánto divergen los
nombres del POS de los de la carta, y la solución (tabla de alias o mapeo asistido) es
una decisión de producto, no de arquitectura.

---

## 6. Si K-OS se parte algún día, por dónde

Esta respuesta no existía escrita. El orden, del corte más barato al más caro — con la
advertencia de Newman: no partir antes de que las fronteras se estabilicen, y "partir"
acá casi nunca significa otro deploy:

1. **El mecanismo de partición ya existe y no es partir: es apagar módulos.**
   `MODULOS_EMPRENDIMIENTO` ([lib/constants.ts:199-207](lib/constants.ts#L199-L207))
   ya vende un subconjunto de contextos (perfil productor sin Salón/KDS/HACCP-pesado)
   sobre el mismo deploy. Cualquier "K-OS Lite" futuro debería ser otro perfil de
   módulos, no otra app.
2. **Fiscal** — el corte más limpio si hiciera falta un servicio aparte (p. ej. para
   venderlo como emisor a terceros): el puerto está terminado, las 5 tablas son suyas,
   la única entrada es `/api/fiscal/emitir`. Costo de corte: casi cero.
3. **Servicio (Salón+KDS)** — el candidato real a producto separado ("la comandera").
   Ya tiene runtime propio (route group `(servicio)`, offline, sin Coach). Lo que el
   corte exigiría: `carta_items` como catálogo publicado de solo-lectura, y
   `demanda_viva`/merma-auto como hechos que cruzan el borde — que es casi la forma que
   ya tienen.
4. **Abastecimiento** — separable como producto de compras/stock; sus bordes por id y
   por nombre ya están catalogados en §1.1.
5. **Lo que NUNCA se parte: OPS + Catálogo.** El sync de cuatro vías
   (carta↔mise↔producción↔menús) es el producto mismo; las funciones de traducción de
   §1.1 son densas y bidireccionales. Partir ahí es partir el core por la mitad.

Para la sesión 3, esto también ordena qué pantalla grande se refactoriza primero: las
que viven **adentro** de un contexto (carta/page.tsx, checklist/ClientView.tsx) se
pueden partir por tabs/vistas internas sin tocar bordes; las que están **sobre** un
borde (operaciones/page.tsx, que monta tabs de varios contextos) necesitan respetar el
mapa de §1 al elegir dónde cortar.

---

## 7. Deuda deliberada vs accidental

| Ítem | Clase | Evidencia |
|---|---|---|
| `ref_id` y familia sin FK | **Deliberada y correcta** | Documentada en [ARQUITECTURA.md:254](ARQUITECTURA.md#L254) y razonada en §5 |
| Reservas sin enganches | **Deliberada** (separate ways temporal) | [types/index.ts:1233-1235](types/index.ts#L1233-L1235) + plan B9/B10 |
| Merma y desperdicio colapsados con `motivo` | **Deliberada** | La distinción del material vive en `MOTIVOS_MERMA` + `merma_esperada_pct` |
| Fiscal fire-and-forget | **Deliberada** | [lib/hooks/useCuenta.ts:119](lib/hooks/useCuenta.ts#L119) |
| `pase_mensajes` compartida por Notas de Plaza | **Deliberada** | El header lo argumenta: "una sola bandeja de avisos en vez de un silo nuevo" ([lib/hooks/useNotasPlaza.ts:16-20](lib/hooks/useNotasPlaza.ts#L16-L20)) |
| `encodeTurnoFase` resuelto al escribir, nunca re-derivado | **Deliberada** | [lib/ops/turnos.ts:227-230](lib/ops/turnos.ts#L227-L230) — cambiar horarios no reescribe historia |
| Cierre incumplido deducido de la ausencia (sin flag) | **Deliberada** | [lib/ops/turnos.ts:245-248](lib/ops/turnos.ts#L245-L248) — "imposible que se desincronice" |
| `miseBus` como parche de latencia intra-pestaña | **Deliberada y acotada** | Su header delimita qué NO es ([lib/ops/miseBus.ts:19-21](lib/ops/miseBus.ts#L19-L21)) |
| `actualizarMenu` delete-then-insert | **Accidental** | Ningún comentario la defiende; contradice el cuidado del resto del módulo |
| Invariante de comanda en cache local | **Accidental** (por omisión) | La máquina de estados existe y se usa; nadie decidió que la base no la respalde |
| Sin candado "una cuenta abierta por mesa" | **Accidental** | El candado gemelo de cajas SÍ existe — la asimetría delata omisión, no decisión |
| Homonimia de "turno" / triple nombre del mise | **Accidental reconocida** | Los comentarios desambiguadores son el reconocimiento; nunca se legisló hacia adelante |
| `PLAZAS_OPS` en espejo de `PLAZAS_FIJAS` | **Accidental reconocida** | El comentario "mantener en espejo" ([lib/ops/mise.ts:9](lib/ops/mise.ts#L9)) es un "acordate de" clásico |

---

## 8. Acciones priorizadas

Formato listo para `PENDIENTES.md`. Ninguna propone reescritura; todas son
incrementales y la primera de cada una ya deja valor.

### 🟠 1. Cerrar la ventana de pérdida de datos de `actualizarMenu`
**Problema:** [useMenus.ts:190-215](lib/hooks/useMenus.ts#L190-L215) borra todas las `menu_preparaciones` del menú y después inserta las nuevas, desde el browser. Un corte entre ambas deja el menú sin preparaciones — pérdida total del trabajo de carga, en el flujo que más se usa desde el celular.
**Por qué importa:** es el agregado con la invariante más simple de enunciar ("el menú y sus preparaciones cambian juntos") y el único write del repo cuyo modo de falla es pérdida, no estado a medias.
**Solución:** función de Postgres `reemplazar_menu_preparaciones(menu_id, preps jsonb)` — delete+insert en una transacción real, corre con RLS — y `actualizarMenu` la llama. La propagación a `tareas` (líneas 218-274) queda FUERA de la transacción a propósito: es otro agregado, sincronización eventual como ya es hoy.
**Esfuerzo:** 2-3 h con test.

### 🟠 2. La invariante de la comanda a la base
**Problema:** "todos los ítems bumpeados ⇒ comanda lista" se decide contra la cache local del cliente ([useComandas.ts:179-187](lib/hooks/useComandas.ts#L179-L187)); verificado que no hay ningún trigger sobre `comandas`/`comanda_items`. Dos tablets KDS a la vez pueden dejar la comanda sin pasar a `lista` — el salón no ve que el plato está.
**Por qué importa:** es invariante cross-device del segundo core (Servicio) — por la regla del marco §3.2 le toca a la base, y es compatible con la cola offline (los reintentos pasan por el mismo UPDATE que dispararía el trigger).
**Solución:** trigger AFTER UPDATE sobre `comanda_items` que recalcule el estado de la comanda (o rpc `bumpear_items`). El guard client-side queda como está (feedback inmediato); la base pasa a ser la verdad.
**Esfuerzo:** 2-3 h con test multi-cliente.

### 🟡 3. Candado "una cuenta abierta por mesa" en la base
**Problema:** no existe índice único parcial sobre `cuentas` (verificado) — dos mozos abriendo la misma mesa crean dos cuentas abiertas; la coherencia mesa↔cuenta la sostienen dos hooks distintos ([useMesas.ts:81](lib/hooks/useMesas.ts#L81) / [useCuenta.ts:107](lib/hooks/useCuenta.ts#L107)).
**Por qué importa:** el candado gemelo ya existe para cajas (`idx_cajas_turnos_una_abierta`) y funciona — es copiar un patrón propio, no diseñar uno.
**Solución:** `CREATE UNIQUE INDEX ... ON cuentas(mesa_id) WHERE estado='abierta' AND mesa_id IS NOT NULL` + atrapar el 23505 en `abrirMesa` con mensaje legible. Antes: query de duplicados históricos (puede haber datos que violen el índice hoy).
**Esfuerzo:** 1-2 h.

### 🟡 4. Congelar el glosario y legislar los bautismos
**Problema:** "turno" significa 7 cosas, el mise tiene 3 nombres, "sección" 4, `status`/`estado` conviven — y las ambigüedades ya cobraron un bug real ([turnos.ts:96](lib/ops/turnos.ts#L96)). Renombrar en producción no se paga; dejar que la próxima tabla herede la ambigüedad, tampoco.
**Por qué importa:** cada término ambiguo cobra peaje en cada sesión (humana o de Claude) y multiplica los comentarios "no confundir con".
**Solución:** volcar §3 de este doc a un doc condicional propio (o sección de `columnas.md`) con tres reglas para lo nuevo: `estado` (no `status`), `jornada` para la fecha operativa (no `turno_fecha`), "turno" solo para `TurnoServicio` — todo otro uso lleva prefijo (`caja_`, `fichaje_`). Alias tipados baratos donde ayuden (`type Jornada = string`). Unificar `PLAZAS_OPS` con `PLAZAS_FIJAS` (importar, no espejar) entra acá.
**Esfuerzo:** 1-2 h de doc + 30 min del espejo de plazas.

### 🟢 5. Chequeo de huérfanos de las refs polimórficas
**Problema:** `ref_id`, `tarea_id`, `pedido_id` sin FK pueden quedar colgando cuando se borra el destino, y hoy nadie lo mira. La decisión de no tener FK es correcta (§5) — el costo aceptado era "refs colgantes posibles", no "refs colgantes invisibles".
**Solución:** una query de huérfanos (LEFT JOIN ... IS NULL por cada ref) expuesta en el tab Salud de Carta o como script de mantenimiento. NO agregar FKs.
**Esfuerzo:** 1-2 h.

### 🟢 6. Actualizar el censo de ARQUITECTURA.md
**Problema:** [ARQUITECTURA.md:226](ARQUITECTURA.md#L226) dice 78 tablas; son 91 (§0). La tabla de dominios de §5 tampoco lista las 13 nuevas.
**Solución:** actualizar el conteo y sumar las tablas nuevas a sus dominios (que coinciden con los contextos de §1). Aprovechar y decidir el destino del backup `tareas_duplicados_backup_20260826` (ya está en PENDIENTES 🔴 por RLS).
**Esfuerzo:** 30 min.

---

## Cierre

El patrón de la sesión 1 se repite agrandado: **el proyecto está más avanzado de lo que
sabe.** Ya tiene dos modelos donde un ERP genérico tendría uno (producto/ingrediente),
una tabla de traducción entre escalas de prioridad que es un borde de contextos de
manual, cuatro tablas de hechos inmutables, un ACL terminado (fiscal), un candado de
agregado en el lugar correcto (cajas) y un lenguaje que en sus mejores términos (plaza,
86, fuga, demanda viva, entrega) es ubicuo de verdad. Lo que falta no es adoptar DDD:
es **terminar de cobrar lo que ya se pagó** — declarar el mapa que las costuras ya
dibujan, copiar el candado de cajas a cuentas y comandas, cerrar la única escritura de
agregado que pierde datos, y congelar el glosario antes de que la próxima tabla herede
la ambigüedad de "turno".
