# KitchenOS — Pendientes

Lista priorizada de lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md`.

**Este archivo es la lista corta, a propósito.** El detalle largo de cada ítem
(cómo se encontró, qué se descartó y por qué) vive en `HISTORIAL.md` §
"Detalle de ítems abiertos — archivado de PENDIENTES.md (11/09/2026)". Si un
ítem de acá parece que le falta contexto, está allá completo. Guideline de
tamaño: ~10 KB. Quedó en 17 KB tras la poda del 11/09 (venía de 38,6 KB) — bajar
de ahí exigía sacar el criterio de decisión de cada ítem ("solo si molesta en uso
real", "no apurar sin un cliente con plan"), que es justo lo que hace que la
lista sirva. Cuando vuelva a crecer, podar mudando a `HISTORIAL.md`, nunca
borrando.

**Ítems de ingeniería (31/08):** el orden, las dependencias y las fusiones viven
en `.claude/docs/ingenieria/plan-consolidado.md`. Si difieren, manda el plan.

---

## 🔴 Crítico

### Candado de duplicados de Producción — falta el paso 0 y correr el SQL
El código ya tolera el 23505 (`lib/ops/insertarTareas.ts`, 11/09) y el SQL está
escrito en `supabase/migrations/pendientes/`. **Medido el 11/09: hay 14 grupos
duplicados en producción (16 filas, peor caso 4 gemelas)**, así que el
`CREATE UNIQUE INDEX` falla hasta limpiarlos. Leer
`CANDADO_TAREAS_LEER_ANTES.md` antes de tocar nada: la columna generada toma
`ACCESS EXCLUSIVE` sobre `tareas` y va **fuera de servicio**.

---

## 🟠 Alto

### Ruta de implantación — lo que quedó abierto (ejecutada el 07/09)
1. ~~No hay scheduler~~ **resuelto 11/09**: `app/api/cron/avisos` corre el
   reconocimiento semanal. **Falta prenderlo**: poner `AVISOS_ACTIVOS=1` en
   Vercel y agregar el cron a `vercel.json` (hoy anda en modo seco — calcula y
   reporta lo que mandaría, sin escribir notificaciones). Mirar una corrida seca
   real antes de prenderlo.
2. **Retirar `/onboarding`.** Convive con `/implantacion` a propósito
   (estrangulamiento). Retirar la vieja cuando la nueva esté probada contra un
   restaurante real.
3. **Dos checkpoints se confirman a mano** porque no hay dato que los sostenga:
   "se leyó el line-up en voz alta" y la estación 5.5.
4. **Nadie verificó la ruta contra datos reales.** Los umbrales (3 semanas de
   facturas, 5 días de pase, 20 tareas) son criterio, no medición: mirarlos
   contra El Rescoldo y Bros y ajustarlos.

### Invitación por email falla a veces — falta SMTP propio
🔒 **Bloqueado, no es código.** Supabase manda con su mailer compartido (2
emails/hora). Facundo ya creó la cuenta en Resend pero falta un **dominio propio
verificado**. El caso típico (invitar de a uno) funciona; el límite solo pisa
con 3+ seguidas. Retomar cuando moleste o cuando haya dominio por otro motivo.

### Fiscal ARCA — homologación end-to-end
🔒 **Bloqueado:** falta el certificado real de ARCA del contribuyente. El código
está completo (`lib/fiscal/wsaa.ts`, `wsfev1.ts`, `api/fiscal/emitir`). Después:
probar contra el server de testing de AFIP y poner URLs de prod en
`config_fiscal`.

### OPS Consolidación — diferido
"Copiar a otro día" e "Ingredientes consolidados" se sacaron con la planilla
legacy. Reimplementar sobre `tareas` **solo si el usuario los pide**.

### Migrar las 2 copias viejas de "modal centrado" a `components/ui/Modal.tsx`
El barrido del 08/09 migró 14 pantallas. Quedan `stock/ClientView.tsx` y
`checklist/ClientView.tsx` — migrar **la próxima vez que se toque esa pantalla,
no antes**.

---

## 🟡 Medio — Planes y cobro

Decisiones tomadas (01/09) en `~/Desktop/START UP KOS/00-decisiones/`, 004 a
008. Si difieren, manda esa carpeta. **Stripe descartado: no opera en
Argentina** — el cobro va por Mercado Pago `preapproval`.
Ya hecho: tabla `ia_uso`, `restaurantes.plan`, `lib/planes.ts`, hook `usePlan()`.

### Feature gating (siguiente)
Cablear `puedeUsar()` en las pantallas, probablemente en `RouteGuard`. Coach
(con tope), HACCP, Presupuesto/CMV y Reportes solo en Control; OPS/mise/pase
desde Cocina. **No apurar sin al menos un cliente con plan asignado** — hoy
`restaurantes.plan` es NULL en las 5 cuentas y `puedeUsar` devuelve siempre true.

### Cobro automático (último)
Mercado Pago `preapproval` + webhooks, UI en Configuración → Plan. **Recién
cuando cobrar a mano moleste** (cliente 4-5). Prerrequisito que no es código:
monotributo + facturación ARCA. Diseñar el dunning desde el día uno (20-40% de
las bajas en LatAm son involuntarias).

---

## 🟢 Bajo — Roadmap abierto

### Presupuesto — fuera de alcance de la Fase 1
Detalle en `PLAN-PRESUPUESTO-CMV-2026-08.md` §11: partir venta comida/bebida
(hoy `ventas_items` matchea 13 de 272 nombres), merma con costo real,
comparación mes contra mes, cubiertos/Q real, presupuesto de personal/alquiler
desglosado.

### Kitchen Coach — memoria persistida
Falta tabla `coach_conversaciones` para historial cross-device (hoy localStorage).

### Kitchen Coach — asistir activamente en el editor de Carta
Hoy solo responde navegación. **Recomendado: B** — extender el patrón de
`crear_evento` con `agregar_componentes_menu(menu_id, componentes[])` que
escribe a DB y el editor refresca. Exige guardar el menú antes. Sesión aparte.

### Fotos — falta completar
`PhotoPicker` ya está en recetario, carta y equipo. Falta facturas, si se decide.

### Notificaciones — faltan triggers, y push/email sin decidir
In-app resuelto (tabla, hook con realtime, campanita, `crearNotificacion()`
reusable). **Dos triggers reales**: `useEquipo.asignarTurno` y el recordatorio al
responsable de una estación de `/implantacion`. Wirear más (stock crítico,
vencimientos) es una decisión de producto por cada uno — no asumir.
**`public/sw.js` no tiene
handler de `push` ni de `notificationclick`**; faltan esos, claves VAPID, tabla
de suscripciones y endpoint disparador. Sin eso el aviso solo llega si la
persona abre la app — justo lo que no hace quien está abandonando.
Email/WhatsApp para el que dejó de entrar: sin decisión.

### PWA offline — completar fuera de Salón/KDS
La vista de servicio ya tiene offline completo. El resto (stock, facturas) no.

### Onboarding wizard guiado
`/implantacion` **no reemplaza esto**: mide al restaurante, no acompaña a una
persona nueva. Falta el flujo completo (datos → plazas → stock → equipo →
permisos) persistiendo en `restaurantes.configuracion.onboarding_step`.
**Gap concreto:** el wizard solo se dispara si el restaurante tiene 0 productos,
0 facturas y 0 recetas — un cocinero invitado a un restaurante operativo nunca
lo ve. Disparar por "primer login de este usuario". (Bug asociado: el flag
`kc_ops_welcomed` se marca *antes* de que el tour termine, así que navegar
rápido lo pierde para siempre.)

### Objetivos de venta — falta editor del override por persona
El modelo y el editor del puesto están completos. Falta UI para pisar un
objetivo puntual por persona (hoy solo por SQL). Mismo patrón visual que
`modulos_extra` en la ficha de miembro.

### Permisos — falta vista matriz
Clonar permisos entre puestos ya está. Falta la vista puestos × módulos.

### Capacitación — KDS/Muro sin mecanismo para mostrar su tour
`TOURS.kds`/`TOURS.muro` están escritos pero son inalcanzables: viven bajo
`app/(servicio)/layout.tsx`, que deliberadamente no monta el FAB del Coach
(DESIGN.md §2). **Decisión pendiente de Facundo**: (a) aceptar el FAB ahí,
(b) un trigger mínimo tipo "?", o (c) dejarlas sin tour a propósito.
De hojas instructivas solo existe la de OPS/Mise, sin índice.
`docs/instructivo-carga-datos.md` no cubre HACCP, Turnos, Organigrama,
Espacios, Calendario, Clientes, Proveedores ni Configuración.

### Mise — container-transform diferido
`ChecklistPage` tiene dos `return` distintos y fusionarlos en un árbol con
`AnimatePresence` es reestructurar control de flujo en un componente de 2700
líneas. Hoy es un fade+scale simple. Su propio bloque, no algo para forzar.

### `confirm()` nativo — 21 en pantallas de gestión
Los 5 de superficie de servicio ya se resolvieron (`ConfirmSheet`). Los 21
restantes, en 17 archivos, son pantallas de gestión: el lint los marca WARN, no
ERROR — ahí es debate de estilo, no el mismo bug.

### `tareas`/`checklist`/`produccion` como permiso: gatea el sidebar, no la ruta
Las tres rutas son stubs que redirigen a `/operaciones?tab=...`, y el código lo
documenta como deliberado. Sacarle `checklist` a un puesto solo oculta el link.
**Confirmar con Facundo** si esos 3 checkboxes deberían desaparecer del editor
de puesto en vez de prometer un filtro que no aplica.

### 4 hooks lista-al-montar sin SWR — migrar al tocarlos
`useUserRol`, `useOnboardingProgress`, `useProduccionRegistros`, `useCalendario`.
Costo chico (requests repetidos, no bugs). **Uno por vez cuando una sesión ya
los toque — no hacer batch dedicado.** Los otros 16 sin SWR no son deuda
(censo en `arquitectura-kos.md` §2.2).

### Tests — Testing Library para hooks
Cubiertos con Testing Library: `useTareas`, `usePermisos`, `useMesas`,
`useComandas`. Cubierta su **lógica pura** (11/09, sin renderizar el hook):
`useStock` (`calcEstado`/`calcStockSeguridad` — los bordes de bajo/crítico/alto)
y `useEquipo` (`construirArbolPuestos`/`idsDescendientes` — huérfanos, ciclos y
orden del organigrama). Sin tests: `useChecklist` y `useCarta`, los dos grandes.
**Agregar el que se toque, no perseguir cobertura total** — un hook que solo
hace `select` + `insert` sin reglas propias no aporta como test.

### OPS — seguir bajando el peso en celular
Mise en mobile bajó de 2582 kB a 899 kB. Queda **`tareas` 594 kB**, lo más
pesado y sin tocar: apretar la ventana de 60 días de `useTareas` a ~3 semanas
daría el salto pero rompe Planificación al navegar a un día viejo. Evaluar en
sesión propia.

### Ingeniería de menú lee todo el historial de ventas, no el período de `/ventas`
Causa confirmada: `/ventas` arranca en "mes", Ingeniería usa `useVentas()` pelado
(histórico completo). Cartel aclaratorio ya agregado. **Fix de fondo pendiente y
es decisión de producto**: si debería scopear a un período (¿mes? ¿90 días?) —
cambiaría qué platos caen en cada cuadrante.

### Ocho funciones ya construidas que nadie encuentra
Tabla completa en `PLAN-ACCESO-Y-USO-2026-08.md` §B5.3. Quedan 4 sin tocar:
paleta de comandos (Ctrl/K sin indicación), swipe entre tabs de OPS (sin
affordance), guía del Mise (dos niveles de profundidad), vincular ingredientes
con stock (botón sin explicar qué hace).

### Backlog chico — sin síntoma reportado, priorizar solo si molesta en uso real
Lista completa con el detalle de cada uno en `HISTORIAL.md`. En una línea:

- Cuenta regresiva de la banda Evento no soporta **dos eventos activos a la vez**.
- **`puestos.nivel` no es confiable** para decisiones automáticas ("Chef
  Ejecutivo" está cargado como `nivel='cocinero'`) — segmentar por puesto concreto.
- HACCP: 3 modales largos sin agrupar.
- OPS Producción: el orden de columnas persiste en `localStorage` por dispositivo,
  no en DB.
- Mise en tablet ancha sigue en columna única (`pointer:fine` a propósito) — hay
  que sacarlo de `globals.css` **y** de `isGridLayout`, o quedan desincronizados.
- Volvió el acceso DDL: plazas custom y cantidad de recipientes ya podrían tener
  tabla/columna real en vez del workaround JSONB/sufijo.
- Carta: "Cantidad" significa cosas distintas en modo Plato y en Menú/Evento.
- El resumen OPS de `ComposicionEditor` no mira `peso_porcion`; y el editor
  todavía no conoce `plato_recetas.gramaje` (funciona porque `handleComposicionSave`
  espeja el valor al guardar, no porque lo sepa).
- **Editor de "porciones" sin UI desde sep 2026** — `actualizarPlatoReceta` sigue
  viva y sin callers. Primer lugar a mirar si el consumo teórico se ve raro.
- `AudioRecorderModal` en Recetario está en Tailwind puro, cero tokens.
- `FilterChips` no hace auto-scroll al chip activo cuando cambia por scroll
  (componente compartido por media docena de pantallas — radio de impacto).
- Organigrama: reasignar `reporta_a_puesto_id` es un `<select>`, no drag; y el
  árbol de un área no anida puestos que reportan cruzado.
- **Worktree viejo `.claude/worktrees/sleepy-jepsen` sin borrar** — las ramas ya
  se borraron, falta la carpeta (un proceso la tiene bloqueada en Windows).
  Reintentar `git worktree remove --force` tras reiniciar.
- Evento con presencia heredada en el mise no tiene "Sacar del mise" en el picker
  de Planificación (sí en `MenusView`).
- Stock: celda apretada en 480-1023px — falta verla en **modo edición**.
- Nota de ítem no viaja a la tarea de Producción (módulos distintos a propósito).
- **Botón de plegar el Coach tapa contenido en desktop** — afecta cualquier
  pantalla con el dock abierto.
- Compras: "Cargar factura" es un patrón mobile sin adaptar a desktop (CTA
  gigante en monitor ancho). Repensar junto con el refactor de Facturas.

### Mise / pase de turno — flecos de la tanda de agosto
Detalle completo en `HISTORIAL.md`. Lo que quedó afuera:
- **El plegado del pase no aplica a Menú/Evento** (sus columnas son pasos, y no
  existe "entregar un paso" — inventarlo sería semántica falsa).
- **El rezagado**: el selector de turno cambia turno pero no fecha; el arreglo de
  fondo es navegación de fecha en el mise.
- **La sugerencia de producción sobreestima si el cierre fue en Modo Control**
  (asume `stockActual = 0` sin registro numérico). Salida posible: descontar lo
  ya despachado como `pase_turno` en vez de asumir cero.
- **Policies de `checklist_registros`** podrían pasar del subquery a
  `restaurante_id = mi_restaurante_id()`. Con 425 filas no hace falta, y el blast
  radius es el mise de todas las cuentas.
- **Producción "más fácil de ver"** (pedido de Facundo, 03/09): sin definir el
  síntoma real todavía — celular, jefe barriendo la cocina y tablet colgada son
  tres remedios distintos, y dos ya existen. **Definir el síntoma antes de tocar.**
- **"Copiar pase" con bullets tipados**: descartado por ahora. Evaluar tras ~2
  semanas de uso real en Bros.

### Muro — F4 del plan (MURO-PLAN.md)
Solo después de una semana de uso real en servicio, y cada ítem es hipótesis a
validar: tomar/asignar desde el muro, sonido en una `duda` nueva, cronómetro por
ítem, foto del turno al entregar.

### Calendario — F2 a F5 del plan de expansión
F1 deployado. En orden: F2 motor de rutinas recurrentes (generalizar
`haccp_limpieza` a una tabla `rutinas` compartida — **decisión de Facundo:
generalizar, no duplicar por dominio**), F3 más reflejos de solo lectura, F4
Coach con contexto del calendario, F5 extras (ICS, feriados, semana tipo).

### Bitácora — F2 y F3 del plan
F1 deployado (13/08). F2: estados/tipos por ítem + convertir un ítem en tarea
real de OPS (`tarea_id` en `bitacora_items`, hoy sin esa columna) + arrastrar los
abiertos a la reunión siguiente. F3: plantillas, ítem→pase, export PDF.

### Rutina de turno — flecos de la pantalla nueva
- **Validar el corte apertura/cierre con el equipo** — es la única decisión de la
  transcripción que no sale literal del papel.
- **No hay plantilla base**: solo Bros tiene los 28 pasos; otra cuenta abre en
  `EmptyState`. Sembrar una genérica si se usa fuera de Bros.
- **El Coach no conoce la pantalla** — correr la skill `coach-screen` sobre el
  tab Turno (falta escribir insights de la rutina en `kc_screen_context`).

### Las guías viejas de OPS contradicen la app
`docs/ops-guia-rapida.html` y `docs/manual-ops.md` describen el flujo anterior
(orden de tabs viejo, "Cerrar turno" donde hoy va **Entregar plaza**, el mise sin
Modo Control). **Decidir** si el manual largo se actualiza o se reemplaza por
hojas por pantalla (skill `hoja-instructiva`).

### Marco "juego cercado" — F2/F3
F1 pasos 1-2 shippeados (24/08). **Falta el paso 3**: mostrar la percepción del
turno junto a un dato duro (merma, devoluciones) en Reportes → Auditoría — la
utilidad está en la discrepancia, no en el campo aislado. Sin tocar: **F2**
historial de cambios en fichas técnicas, **F3** bandeja de propuestas.

### `factura_items.producto_id` / `merma.producto_id` casi nunca se completan
`facturas-universal` ya resuelve `producto_id` al insertar (27/08), pero solo
hacia adelante. Falta: **backfill sobre lo histórico** (~1% poblado) y
`merma.producto_id`, que sigue sin tocarse. `lib/reportes/fuga.ts` tiene fallback
por nombre normalizado mientras tanto.

### Hardening de seguridad (`get_advisors`)
- 🔒 **Bloqueado, no es código:** protección de contraseñas filtradas (HIBP)
  requiere plan Pro de Supabase (la API devuelve 402).
- ~~`fiscal_config`/`fiscal_tickets` sin policies~~ **— revisado 11/09: el ítem
  estaba mal planteado y NO hay que agregarles policies.** Guardan `key_pem` (la
  clave privada de AFIP) y los tokens WSAA; el patrón estándar de `rls.md` le
  daría esa clave a cualquier miembro logueado, leíble desde el browser. Y no
  están inutilizables: sus 3 accesos van por `createAdminClient()` desde API
  routes. RLS sin policies es la postura correcta. Detalle y el REVOKE opcional
  (defensa en profundidad, sin correr, sin urgencia) en
  `supabase/migrations/pendientes/FISCAL_RLS_NO_ES_LO_QUE_PARECE.md`. **No
  confundir con `config_fiscal`**, tabla distinta de nombre invertido.
- **Sacarle el salto de línea a `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel.**
  Confirmado el 11/09 por el health-check nuevo, corrido contra producción: la
  variable **sigue sucia**. `lib/supabase/env.ts` hace `.trim()` y la vuelve
  inofensiva, pero cualquier lectura que no pase por el helper reintroduce el bug
  del realtime caído. Es un cambio de dashboard, no de código.
- **Los dos respaldos de la limpieza** (`restaurantes_basura_backup_20260901`,
  `voglio1_datos_backup_20260901`) — borrables cuando se confirme que no hacía
  falta nada de esos 12 restaurantes.

---

## Tracking

- 🔴 Crítico → resolver en la próxima sesión.
- 🟠 Alto → batch de 1-2 sesiones cada uno.
- 🟡 Medio → no empezar código hasta tener el spec definido en `DECISIONES.md`.
- 🟢 Bajo → priorizar según feedback real de El Rescoldo.
