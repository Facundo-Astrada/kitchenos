# KitchenOS — Pendientes

Lista priorizada de lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md`. Lo resuelto y el detalle de sesiones pasadas viven en `HISTORIAL.md` (no acumular acá).

---

## 🔴 Crítico

### 3 endpoints con admin client sin verificar quién llama (auditoría de arquitectura 31/08 — detalle en `.claude/docs/ingenieria/arquitectura-kos.md` §7.1)
`/api/carta/86`, `/api/salon/merma-auto` y `/api/salon/prep-list-update` usan `createAdminClient()` sin auth alguna; merma-auto además acepta `restaurante_id` desde el body — y `useCuenta.cobrarCuenta` se lo manda, así que **endpoint y caller se arreglan en el mismo commit** o se rompe el cobro. Los tres alcanzables sin sesión (todo `/api/*` es público en `proxy.ts`). Anulan el RLS de las 78 tablas. Fix mecánico: `requireRestauranteId()` + verificación de pertenencia, patrón textual en `/api/stock/sync-precio`. Antes de exigir sesión en carta/86, verificar desde dónde llama el KDS. **2-3 h.**

### `tareas_duplicados_backup_20260826` expuesta sin RLS (encontrado 27/08 vía `get_advisors`)
La tabla de respaldo creada al limpiar los duplicados de Producción (76 filas, ver `HISTORIAL.md` 26/08) tiene RLS **deshabilitado** — cualquiera con la publishable key puede leer o escribir esas filas vía REST directo. Supabase la marca ERROR (la única de nivel ERROR hoy). Dos salidas: activar RLS con policy por `restaurante_id` (si todavía se necesita de referencia), o borrar la tabla directamente si el respaldo ya cumplió su función. **Facundo decide** — no autoaplicar sin su ok (activar RLS sin policy bloquea todo acceso a la tabla).

---

## 🟠 Alto

### Cerrar el ciclo de las 4 capas — plan propio en `PLAN-4-CAPAS.md`
10 bloques ejecutables (B1 a B10) que salen de `AUDITORIA-4-CAPAS.md`: corrección de ingeniería de menú, campos de la capa Definir en Stock, incidencias por proveedor, presupuesto por familias, detección de fuga, objetivos por persona, checklist de carta pre-servicio y Reservas con sugerencia de compra. **No duplicar los ítems acá** — el estado de avance vive en los checkboxes del plan. B1-B8 cerrados; quedan B9 (reservas dentro del día de trabajo: OPS/Salón/Calendario/Dashboard) y B10 (reservas alimentan previsión de producción y sugerencia de compra), ambos dependientes de B8.

**Decisión 27/08:** se sigue con B9-B10 sin esperar el track de validación Bros/Rescoldo — K-OS va a venderse a diversos sectores de gastronomía, no solo parrilla, así que Reservas conviene diseñarla genérica desde ahora (ver `project_kitchenos_expansion` / memoria). Tabla `reservas` ya existe en DB (0 filas, sin usar todavía).

### Invitación por email falla a veces — falta SMTP propio en Supabase
Auditoría 20/08 (chequeado contra la config viva vía management API): `site_url`, `uri_allow_list` y redirect a `/registro-invitado` ya están OK — ese ítem viejo estaba resuelto. El bloqueo real es otro: no hay SMTP propio configurado (`smtp_host` null) — Supabase manda con su mailer compartido, limitado a `rate_limit_email_sent: 2` (2 emails/hora) y con tendencia a caer en spam por no ser dominio propio. Si el dueño invita 3+ personas seguidas armando el equipo, la 3ra invitación falla. El frontend (`handleInvitar` en `app/(app)/turnos/page.tsx`) solo muestra el error crudo de Supabase en un toast, sin explicar el motivo ni sugerir reintentar más tarde. Fix: configurar SMTP propio (Resend recomendado, tier gratis generoso) en Supabase Auth → falta que Facundo cree la cuenta y pase la API key para conectarlo vía management API.

**Decisión 21/08:** Facundo ya creó la cuenta en Resend pero frenó ahí — hace falta además un dominio propio verificado (el dominio de prueba de Resend solo manda a la propia casilla de quien se registró, no sirve para invitar gente real). Se queda así por ahora: el caso de uso típico (invitar de a una persona) funciona sin el fix; el límite de 2/hora solo pisa si se invitan 3+ personas seguidas. Retomar cuando eso moleste en uso real o cuando haya un dominio propio de KitchenOS por otro motivo (no vale la pena comprar uno solo para esto).

### Fiscal ARCA — homologación end-to-end
Código completo (`lib/fiscal/wsaa.ts`, `lib/fiscal/wsfev1.ts`, `app/api/fiscal/emitir/route.ts`). Falta: certificado real de ARCA del contribuyente, probar contra el servidor de testing de AFIP, URLs de prod en `config_fiscal`, cachear token/sign WSAA en Supabase.

### OPS Consolidación — diferido
"Copiar a otro día" e "Ingredientes consolidados" (se sacaron con la planilla legacy) — reimplementar sobre `tareas` si el usuario los pide.

### Ingeniería — deuda de arquitectura con bug real detrás (auditoría 31/08, detalle y evidencia en `arquitectura-kos.md` §7.2-7.4)
Tres ítems de la misma sesión de auditoría, ordenados por valor:
- **Completar el puerto de IA (`lib/ia/claude.ts`).** La mitad ya existe (`lib/ia/errores.ts`, usado por 7 de 12 rutas); falta la función única de fetch con modelo + reintentos (el campo `reintentable` ya existe y nadie lo consume) + log de tokens. 15 hardcodes de modelo hoy. **3-4 h.**
- **`useFacturas.crearFactura` al servidor.** ~235 líneas multi-tabla corriendo en el browser sin transacción (factura + proveedor auto-creado + productos + precios); un corte a mitad deja datos rotos, y el matching de productos es inaccesible para `facturas-universal` (ya lo reimplementó una vez). Primer paso chico: extraer solo el matching a `lib/facturas/matching.ts` con test (2-3 h); el flujo completo, **1 día**.
- **Gotchas verificables a CI.** 3 hooks violan hoy el gotcha #20 del propio `hooks.md` (`useFacturas:48`, `usePase:18`, `useReportes:136` — `createClient()` sin `useMemo`, 1 línea de fix c/u) y nada impide el cuarto, ni un endpoint nuevo con admin client sin `requireRestauranteId`. Test de Vitest que grepee ambos patrones (allowlist para `cron/reset-demo` e `invitar`). **2-3 h.**

### Dominio — dos agregados sin custodia (auditoría de dominio 31/08, evidencia en `.claude/docs/ingenieria/dominio-kos.md` §4/§8)
- **`actualizarMenu` pierde datos ante un corte.** [useMenus.ts:190-215](lib/hooks/useMenus.ts#L190-L215) borra todas las `menu_preparaciones` y recién después inserta las nuevas, desde el browser — un corte entre ambas deja el menú vacío (pérdida total, no estado a medias). Fix: rpc `reemplazar_menu_preparaciones(menu_id, jsonb)` con delete+insert en una transacción; la propagación a `tareas` queda fuera a propósito (otro agregado). **2-3 h.**
- **La invariante de la comanda vive en la cache local.** "Todos los ítems bumpeados ⇒ comanda lista" se decide contra el snapshot del cliente ([useComandas.ts:179-187](lib/hooks/useComandas.ts#L179-L187)); cero triggers sobre `comandas`/`comanda_items` (verificado). Dos tablets KDS a la vez pueden dejar la comanda sin pasar a `lista`. Fix: trigger AFTER UPDATE sobre `comanda_items` que recalcule el estado (compatible con la cola offline). **2-3 h.**

---

## 🟡 Medio — Roadmap: Planes y Stripe

### Estructura de planes $60 / $99
`restaurantes.plan` (`'trial'|'basic'|'pro'`), tabla `suscripciones` (`restaurante_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end`), hook `usePlan()`. Definir spec en `DECISIONES.md` antes de empezar código.

### Integración Stripe
`POST /api/stripe/checkout` (Checkout Session), `POST /api/stripe/webhook` (`customer.subscription.*` → `suscripciones`), UI en Configuración → Plan, paywall en trial expirado. Depende del ítem anterior.

### Feature gating
Coach, multi-usuario, export PDF, HACCP solo en plan Pro — `puedeUsar('coach')` derivado de `usePlan`. Depende de Stripe.

### Unificar `mapRol` (×2) y conversión de unidades (×3) — auditoría 31/08, `arquitectura-kos.md` §7.5
Sin cambios respecto del informe GRASP: `lib/permisos/roles.ts` y `lib/unidades.ts`, ambos sin `'use client'` (la duplicación existe *porque* las originales viven en archivos client — el fix es de localidad). Los tests de `consumoTeorico.test.ts` se mudan y cubren a todos. Precedente documentado en `resolver.ts:1-12`. **2-3 h.**

### Declarar la convención del repositorio en `hooks.md` — auditoría 31/08, `arquitectura-kos.md` §7.6
La firma `(supabase, restauranteId, input)` ya es la convención de facto (`mise.ts`, `activarMenu.ts`, registry del Coach) pero no está escrita — la próxima extracción puede inventar otra forma. Una sección corta + la tabla de decisión del marco. **30 min.**

### Candado "una cuenta abierta por mesa" en la base — auditoría de dominio 31/08, `dominio-kos.md` §8.3
No existe índice único parcial sobre `cuentas` (verificado): dos mozos abriendo la misma mesa crean dos cuentas abiertas, y la coherencia mesa↔cuenta la sostienen dos hooks distintos. El candado gemelo ya existe para cajas (`idx_cajas_turnos_una_abierta`) — es copiar un patrón propio. `CREATE UNIQUE INDEX ... ON cuentas(mesa_id) WHERE estado='abierta' AND mesa_id IS NOT NULL` + atrapar 23505 en `abrirMesa`; antes, query de duplicados históricos. **1-2 h.**

### Congelar el glosario ubicuo y legislar los bautismos — auditoría de dominio 31/08, `dominio-kos.md` §3/§8.4
"Turno" significa 7 cosas, el mise tiene 3 nombres (mise/checklist/Plazas), "sección" 4 — y la ambigüedad ya cobró un bug real (`turnos.ts:96`). No renombrar lo existente: volcar el glosario de `dominio-kos.md` §3 a un doc condicional + tres reglas para lo nuevo (`estado` no `status`; `jornada` para fecha operativa; "turno" solo para `TurnoServicio`, el resto con prefijo). Unificar `PLAZAS_OPS` con `PLAZAS_FIJAS` (importar, no espejar) entra acá. **1-2 h.**

---

## 🟢 Bajo — Roadmap abierto

### Chequeo de huérfanos en las refs polimórficas — auditoría de dominio 31/08, `dominio-kos.md` §5/§8.5
`menu_preparaciones.ref_id`, `calendario_nota_items.tarea_id`, `proveedor_incidencias.pedido_id` sin FK pueden quedar colgando al borrar el destino, y nadie lo mira. La decisión de no-FK es correcta (documentada y razonada) — el costo aceptado era "refs colgantes posibles", no "invisibles". Una query de huérfanos en el tab Salud o script de mantenimiento; NO agregar FKs. **1-2 h.**

### Actualizar el censo de tablas en ARQUITECTURA.md — auditoría de dominio 31/08
`ARQUITECTURA.md` §5 dice 78 tablas; son 91 (verificado contra `pg_tables` el 31/08): faltan las 13 de agosto (`reservas`, `bitacora_*`, `control_carta_registros`, `rutina_turno_*`, `proveedor_incidencias`, `notificaciones`, `areas`, `area_capas`, `presupuesto_mes`, `presupuesto_sector`) más el backup. Actualizar conteo y tabla de dominios. **30 min.**

### Presupuesto — fuera de alcance de la Fase 1 (`/presupuesto`, ago 2026)
Detalle completo en `PLAN-PRESUPUESTO-CMV-2026-08.md` §11: partir venta comida/bebida (requiere mapear `ventas_items` contra `carta_items`, hoy solo matchea 13 de 272 nombres), merma con costo real (registros en $0 por falta de precio de producto), comparación mes contra mes, cubiertos/Q real (El Rescoldo y Bros no cargan `cantidad_cubiertos`), presupuesto de personal/alquiler/gastos generales desglosado por sub-categoría (mismo patrón que materia prima). Coach: sin tool de servidor propia todavía — candidatos anotados como TODO en `app/api/coach/route.ts`.

### Kitchen Coach — memoria persistida
Prompt caching y tool use agéntico ya resueltos. Falta tabla `coach_conversaciones` para historial cross-device (hoy es localStorage).

### Fotos — falta completar
`PhotoPicker` (bucket `fotos`) integrado en recetario, carta y equipo. Falta facturas, si se decide.

### Notificaciones — falta más triggers, y push/email sin decidir
In-app ya resuelto (tabla `notificaciones`, `useNotificaciones` con realtime, campanita+feed `NotificacionesBell`, `crearNotificacion()` reusable) con un solo trigger real (`useEquipo.asignarTurno`). Falta wireear más triggers si se necesitan (stock crítico, vencimientos, etc. — cada uno es una decisión de producto aparte, no asumir). Push web (PWA + service worker + VAPID) y email/WhatsApp para alertas críticas siguen sin decisión tomada.

### PWA offline — completar fuera de Salón/KDS
La vista de servicio (Salón/KDS) ya tiene offline completo (SW cachea GETs, bumps en cola IndexedDB, banner sin-conexión). El resto de la app (stock, facturas, etc.) queda pendiente.

### Onboarding wizard guiado
`WelcomeDashboard` existe. Falta el flujo completo: datos del restaurante → plazas → stock inicial → equipo → permisos, persistiendo progreso en `restaurantes.configuracion.onboarding_step`.

**Gap adicional (auditoría 20/08):** el wizard (`app/(app)/onboarding/page.tsx`, pasos por rol) solo se dispara vía redirect server-side cuando el restaurante tiene 0 productos, 0 facturas y 0 recetas (`app/(app)/page.tsx`). Un cocinero invitado a un restaurante ya operativo nunca cumple esa condición — cae directo al Dashboard sin ninguna guía, con el tour automático del Coach como único mecanismo de descubrimiento (y ese tiene su propio bug: el flag `kc_ops_welcomed`/`kc_app_welcomed` se marca en localStorage *antes* de que el tour termine de mostrarse, así que si el usuario navega rápido se pierde para siempre y no vuelve a aparecer). Fix: disparar el wizard (o una versión corta, solo los pasos del rol) por "primer login de este usuario", no solo por "restaurante vacío".

### Objetivos de venta — falta editor del override por persona (B6, ago 2026)
El modelo (`puestos.objetivos` + `equipo_miembros.objetivos` override, mezclados con `getObjetivosMiembro()`) y el editor del puesto (Turnos → Puestos) están completos y en uso en Reportes → Personal. Lo que falta: una UI para pisar un objetivo puntual por persona (hoy solo se puede vía SQL directo) — mismo patrón visual que ya existe para `modulos_extra`/`modulos_restringidos` en la ficha de miembro (`actualizarOverridesMiembro`). Bajo porque el caso común (objetivo por puesto) ya cubre la mayoría de los casos.

### Permisos — falta vista matriz
Clonar permisos entre puestos ya resuelto (select en `PuestoFormBody`, Turnos → Puestos). Sigue faltando la vista tipo matriz (puestos × módulos) para ver de un vistazo quién ve qué — no priorizada, el botón de clonar era lo que sacaba más fricción.

### Capacitación — KDS/Muro sin mecanismo para mostrar su tour (encontrado 27/08)
`configuracion`, `coach` y `bitacora` ya tienen tour. **`kds` y `muro` quedan con el contenido del tour escrito (`TOURS.kds`/`TOURS.muro` en `lib/coach/tours.ts`) pero inalcanzable**: las dos viven bajo `app/(servicio)/layout.tsx`, que deliberadamente NO monta `KitchenCoachFAB` ni corre `useTourAutomatico` — es el layout de "Registro Servicio" (DESIGN.md §2: fondo fijo, cero animación de entrada, "se diseña quitando, no agregando"). Sumarles el FAB naranja de chat es agregar justo lo que esa doctrina evita — decisión de diseño, no un bug. Alternativas a decidir con Facundo: (a) aceptar el FAB ahí igual, (b) un trigger mínimo propio (ícono "?" como el de Sidebar, sin todo el dock de chat), o (c) dejar esas dos pantallas sin tour a propósito (son tablet-first, casi siempre ya conocidas por el equipo antes de tocarlas).

De hojas instructivas imprimibles (skill `hoja-instructiva`) solo existe la de OPS/Mise (`docs/ops-modo-control-una-hoja.pdf`), sin índice que las centralice. `docs/instructivo-carga-datos.md` cubre 11 módulos pero no HACCP, Turnos, Organigrama, Espacios, Calendario, Clientes, Proveedores ni Configuración. Priorizar según qué pantallas generan más preguntas en uso real.

### Mise — container-transform diferido (`DESIGN.md`/`INVESTIGACION-DISENO-2026-08.md`, 24/08)
La carta de plaza morfando literalmente al header de la lista (shared-element `layoutId`) quedó fuera del plan de superficie: `ChecklistPage` tiene dos `return` distintos (grilla de plazas / vista de una plaza) y fusionarlos en un solo árbol con `AnimatePresence` es una restructuración de control de flujo real en un componente de 2700 líneas — su propio bloque, no algo para forzar a ciegas. Hoy la transición es un fade+scale simple (`screenEnter` en `ClientView.tsx`), no el morph completo.

### `confirm()` nativo — ~80 en pantallas de gestión (auditoría `scripts/design-lint.mjs`, 24/08)
Los 5 ERROR de superficie de servicio ya se resolvieron (`ConfirmSheet` extraído a `components/ui/ConfirmSheet.tsx`, reusado en Producción y Salón/Config) — el lint ya puede wirearse a CI sin quedar rojo por deuda ajena. Los ~80 restantes (Turnos, Clientes, HACCP, Carta, Stock, Espacios) son pantallas de gestión, no de servicio — el lint los marca WARN, no ERROR: ahí un confirm() nativo es debate de estilo, no el mismo bug (DESIGN.md §10 aplica a flujo de servicio).

### `tareas`/`checklist`/`produccion` como permiso: gatea el sidebar pero no la ruta (encontrado al arreglar `MODULOS_ASIGNABLES`, 20/08 — revisado 27/08)
`RUTA_A_MODULO` (`lib/constants.ts`) sigue mapeando las tres rutas al permiso `'operaciones'`, pero ahora `/tareas`, `/checklist` y `/produccion` son directamente stubs que redirigen a `/operaciones?tab=...` (consolidación de OPS) — el código ya trae un comentario explicando que es deliberado ("Mapeadas a 'operaciones' por consistencia de permisos"), no algo que se coló. Sigue siendo cierto que sacarle `checklist` a un puesto solo oculta el link, no la pestaña dentro de OPS. Bajar prioridad: parece una decisión ya tomada, no un bug pendiente — confirmar con Facundo si los tres checkboxes de sidebar deberían directamente desaparecer del editor de puesto en vez de seguir prometiendo un filtro que no aplica.

### 4 hooks lista-al-montar sin SWR — migrar al tocarlos (auditoría 31/08, `arquitectura-kos.md` §7.7)
`useUserRol`, `useOnboardingProgress`, `useProduccionRegistros`, `useCalendario` re-consultan en cada navegación. Costo chico y acotado (requests repetidos, no bugs). Patrón estándar de `hooks.md` §Cache-SWR, uno por vez cuando una sesión ya los toque — no hacer batch dedicado. Los otros 16 hooks sin SWR **no son deuda** (censo completo en `arquitectura-kos.md` §2.2): utilidades, derivados de la key compartida de config, por-demanda, o parametrizados donde SWR encaja mal a propósito.

### Tests — Testing Library para hooks
`@testing-library/react` + `jsdom` instalados, mock reusable en `lib/test-utils/mockSupabase.ts` (ver `.claude/docs/testing.md`), primeros dos hooks cubiertos: `useTareas` y `usePermisos`. El resto (`useEquipo`, `useChecklist`, `useCarta`, `useStock`, etc.) sigue sin tests — agregar el que se toque, no perseguir cobertura total de una sola vez.

### OPS — seguir bajando el peso en celular (ago 2026)
Entrar a Mise en mobile bajó de 2582 kB / 64 requests a 899 kB / 46 — el peso de `productos` (66 kB) bajó después vía RPC, falta remedir el total. Lo que queda:
- **`tareas` 594 kB** — lo más pesado, sin tocar (riesgo real de romper Planificación). La ventana de 60 días de `useTareas` hoy recorta 11 filas (preventiva, no ahorro real). Apretarla a ~3 semanas daría el salto, pero rompe Planificación al navegar a un día viejo: antes hay que hacer que consulte por su cuenta las fechas fuera de la ventana. No es un cambio chico — evaluar en sesión propia.

### Ingeniería de menú siempre lee todo el historial de ventas, no el período de `/ventas` (investigado 27/08)
Causa confirmada — no son dos fuentes de datos distintas, es un filtro de fecha distinto: `/ventas` arranca en período **"mes"**, Carta → Rentabilidad → Ingeniería usa `useVentas()` pelado (todo el historial, equivalente al período **"todo"** que `/ventas` sí ofrece pero no es el default). Cartel aclaratorio ya agregado en la pestaña Ingeniería. Fix de fondo pendiente (decisión de producto, no bug): si Ingeniería debería scopear a un período razonable (¿mes? ¿90 días?) en vez de histórico completo — cambiaría qué platos caen en cada cuadrante.

### Ocho funciones ya construidas que nadie encuentra (barrido 25/08)
La tabla completa está en `PLAN-ACCESO-Y-USO-2026-08.md` § B5.3. Ya resueltas: el Muro (link desde el modo pantalla completa de Producción), Modo Control del mise (etiqueta "Control" en el ícono), escalar por ingrediente de referencia (pista de doble tap arriba de la lista) y "Sugerir producción" en Planificación (naranja sólido). Quedan sin tocar, menor prioridad: paleta de comandos (Ctrl/K sin indicación, solo desktop), swipe entre tabs de OPS (sin affordance), guía del Mise (dos niveles de profundidad), vincular ingredientes con stock (botón sin explicar qué hace).

### Backlog chico — sin síntoma de usuario reportado, priorizar solo si molesta en uso real
- **`puestos.nivel` no es confiable para decisiones automáticas** (encontrado 25/08 al backfillear `ver_costos`): "Chef Ejecutivo" y "Sous Chef" están cargados con `nivel='cocinero'`, no `sous_chef`. Solo "Dueño / Dirección" tiene `nivel='admin'` y "jefe de cocina" `sous_chef`. Cualquier migración o regla que segmente por `nivel` va a errarle — segmentar por el puesto concreto o pedirle al admin que lo corrija.
- **Dark mode — contraste pobre en toda superficie navy** (encontrado ago 2026, PLAN-SUPERFICIE S2): `[data-theme="dark"] --navy` es `#c8d6e5` (gris-azul claro, no navy oscuro — decisión pre-existente, no de esa sesión). Todo componente con `background: var(--navy)` + texto blanco (header del Dashboard, `MiPlaza`, botón "Iniciar turno", `AhoraCard`) queda con texto blanco sobre fondo claro en dark mode — difícil de leer. Es sistémico (afecta todas las superficies navy a la vez), no se arregla tocando un componente suelto; necesita decidir si `--navy` en dark mode debería invertir a un navy oscuro real o si el texto de esas superficies debería pasar a oscuro cuando el token se invierte.
- HACCP: 3 modales largos (limpieza/vencimientos/temperaturas) sin agrupar — mismo problema que tenía el modal de Stock (muchos campos heterogéneos sin secciones), candidato a la misma cura de fondo pero con otro tratamiento (no son checkboxes, no aplica `SwitchRow`).
- OPS Producción: el orden de columnas (drag-and-drop) persiste en `localStorage` por dispositivo, no en DB — cada navegador recuerda su propio orden. Mover a una tabla nueva (ej. `ops_orden_columnas`) si se necesita compartido entre dispositivos del mismo restaurante.
- Mise en tablet táctil ancha (iPad landscape, 1024px exactos): se queda en columna única porque la grilla de desktop está condicionada a `pointer: fine`. El motivo es que el reordenar es un long-press que compara `clientY` contra el centro vertical de cada ítem — con dos tarjetas lado a lado elige al azar. Para ganar la grilla ahí habría que hacer el drag 2D (comparar también `clientX` dentro de la fila). Solo si alguien usa el mise desde tablet.
- **El acceso DDL volvió** (ago 2026), así que los dos workarounds "sin migración" ya podrían tener tabla/columna real: plazas custom (JSONB en `restaurantes.configuracion.plazas_custom`, `usePlazasCustom.ts`) y cantidad de recipientes (sufijo `" ×N"` en `checklist_items.recipiente_nombre`, `lib/ops/mise.ts`). Ninguno molesta en uso real y los dos degradan legible — no es urgente, pero ya no hay excusa técnica.
- Carta / `ComposicionEditor`: la semántica de "Cantidad" es distinta en modo Plato (porciones, gramaje opcional que afecta costo) y en Menú/Evento (gramos para receta/producto, unidades para plato vinculado). Hoy es coherente pero son dos modelos que no se explican entre sí; evaluar converger solo si confunde en uso real.
- **`SidebarNav` vacío para roles fuera de `MODULOS_POR_ROL`** (observado ago 2026 en consola con la cuenta `cocina@broscomedor.com`): esa cuenta tiene `equipo_miembros.rol='cocinero'` — no matchea ningún key de `MODULOS_POR_ROL` (`Rol` no tiene `'cocinero'`, solo `admin/chef/parrilla/frios/calientes/pase/pasteleria/panaderia/linea/ayudante`) — así que en `SidebarNav.tsx` `modulosDelRol` sale vacío y el sidebar solo muestra "Inicio" pese a que `permisos_app` sí trae `operaciones/recetario/stock/pase/carta` completo. Repro fácil: loguear con esa cuenta y mirar el sidebar. (La parte de "`usePermisos` traga el error real" que acompañaba este hallazgo ya se resolvió al migrar el hook a SWR el 20/08 — el catch ahora extrae el mensaje real de Supabase con el patrón de `hooks.md`#2, así que el próximo repro va a mostrar el error verdadero en consola en vez de uno genérico.)
- **`.claude/settings.json` modificado sin commitear** — arrastrado desde jul 2026, sigue esperando una decisión de Facundo (commitear o revertir). Los 5 archivos sueltos (`mcp-*.js`, dos `.tgz`) que lo acompañaban se borraron el 11/08 (eran debris de paquetes npm, no se usaban).
- El resumen OPS de una fila en `ComposicionEditor.tsx` (~línea 1580) arma `plaza · sección · cantidad_ops+unidad` sin mirar `peso_porcion` — con recipiente muestra las porciones del recipiente, no el gramaje. Es un subtítulo de la config del mise (defendible), pero es el mismo patrón que se corrigió en Recetario/Platos; revisar si en uso real confunde.
- **Organigrama — dos simplificaciones deliberadas de la Fase 1** (ago 2026): reasignar `reporta_a_puesto_id` en la Estructura es un `<select>`, no drag-and-drop (se priorizó robustez sobre tiempo); y el árbol de una área solo considera puestos con ese `area_key` — un puesto que reporta a otro de área distinta cae como raíz en vez de anidarse cruzado. Ninguna molesta en uso real todavía; tocar solo si alguien lo pide.
- **Evento con presencia heredada en el mise no tiene "Sacar del mise" en el picker de Planificación** (`produccion/page.tsx`, encontrado 22/08 arreglando `checklist_items` huérfanos de un evento con `plaza_control='general'`): `MenusView.tsx` (Carta → Menús) sí muestra el estado/`Sacar` para un evento que ya quedó con `checklist_items` (ver `DECISIONES.md` §21), pero el picker de Planificación solo ofrece el botón "activar por fecha" para eventos, sin importar `enMise`. Asimetría chica; sacar del mise hoy es por `MenusView` o SQL directo.
- **Stock — celda de stock apretada en rango 480-1023px** (ago 2026): la celda muestra el número editable **y** el editor de mínimo lado a lado en una columna de ~84px — el análisis decía que no entran los dos. Ese rango **ya no es solo tablet**: desde que el `#shell` va full-width en celular (22/08), un Motorola (480 CSS px) y un Android con "Tamaño de pantalla" en chico (540) caen justo ahí. Capturas a 480 y 540 muestran la celda **legible en modo lectura** (número + `mín` lado a lado, sin desborde); falta verla en **modo edición**, que es el caso que el análisis marcaba. El breakpoint <480px y el de desktop (≥1024px) están verificados en pantalla real.

### Mise / pase de turno — flecos de la tanda de agosto
Todo lo grande quedó andando; esto es lo que se dejó explícitamente afuera.
- **El plegado del pase no aplica a Menú/Evento.** Sus columnas son pasos del menú, no plazas, y no existe "entregar un paso" — inventarlo sería semántica falsa. Queda la asimetría visible (Carta plegada, Menú/Evento entera). Solo si molesta en uso real; ahí habría que decidir qué significa el pase para un menú.
- **El rezagado.** Entregada la cena a la 01:20 la jornada rueda al día siguiente; si otro entra a las 02:00 y elige "Cena" en el selector del título cae en la cena futura, no en la que se acaba de cerrar. El selector cambia turno pero no fecha — el arreglo de fondo es navegación de fecha en el mise.
- **La sugerencia de producción sobreestima si el cierre se hizo en Modo Control.** `lib/produccion/sugerencia.ts` filtra `cantidad_actual not null` y, sin registro numérico, asume `stockActual = 0` → sugiere el promedio entero. Es la contra conocida del pase por tarea (deliberada: nadie inventa un número que no se contó), pero si el equipo se acostumbra a cerrar así, "Sugerir producción" va a pedir de más. Salida posible: que la sugerencia descuente lo que ya está despachado como tarea de `pase_turno` en vez de asumir cero.
- **La última rendija de los duplicados de Producción: dos dispositivos en el mismo segundo.** El guard de `useTareas.agregarTarea` (regla en `lib/ops/dedupeTareas.ts`) compara contra la cache local, así que dos tablets despachando el mismo ítem a la vez todavía crean una fila gemela. **No se ve** — el board fusiona por identidad —, pero queda en la base y con el tiempo distorsiona Reportes. Se cierra con una restricción real en Postgres: columna generada con la clave + índice único, NULL para lo que no es producción del día (así las anotaciones libres quedan libres). Antes de crearla hay que endurecer los 4 inserts en lote (`activarMenu.ts`, sugerencia de producción, `useMenus.ts`, Coach) con `ON CONFLICT DO NOTHING` — Postgres tumba el batch entero si una sola fila choca —, y atrapar el 23505 en las dos escrituras que tocan campos de la clave: renombrar una tarea (`TareasSimpleClientView`) y editar un menú activo (`useMenus.ts`, que mueve sus tareas de paso/plaza). **Hacerlo fuera de servicio**: la migración toma un lock exclusivo sobre `tareas`.
- **Policies de `checklist_registros`**: podrían pasar del subquery a `checklist_items` a `restaurante_id = mi_restaurante_id()` ahora que la columna existe. Es más barato de evaluar (realtime chequea RLS por evento y por suscriptor), pero con 425 filas no hace falta y el blast radius es el mise de todas las cuentas.

### Muro — F4 del plan (MURO-PLAN.md)
Solo después de una semana de uso real en servicio, y cada ítem es una hipótesis a validar, no un pendiente fijo: tomar/asignar una tarea desde el muro, sonido o parpadeo en una `duda` nueva, cronómetro por ítem en curso con umbral de color (como el KDS), foto del turno al entregar.

### Calendario — F2 a F5 del plan de expansión
F1 (grilla estilo Google Calendar, notas por día como ítems enviables a Producción, Planificar menú por rango) ya deployado. Falta, en orden, según `CALENDARIO-PLAN.md`: F2 motor de rutinas recurrentes (generalizar `haccp_limpieza` a una tabla `rutinas` compartida — decisión de Facundo: generalizar, no duplicar por dominio), F3 más reflejos de solo lectura (menús de Carta, turnos, HACCP, cuenta corriente), F4 Coach con contexto completo del calendario + tools de agenda, F5 extras (ICS, feriados, semana tipo).

### Bitácora — F2 y F3 del plan (ago 2026)
F1 deployado (13/08): `/bitacora`, tablas `bitacora_entradas`/`bitacora_items` con RLS+realtime, edición tipo-doc (Enter parte línea, Tab indenta, pegar multilínea desde Docs), participantes desde el día 1, solo admin/chef. Falta, en orden: F2 estados/tipos por ítem (tema/acuerdo/acción/pregunta) + convertir un ítem en tarea real de OPS (`tarea_id` en `bitacora_items`, hoy sin esa columna) + arrastrar a la reunión siguiente los ítems que quedaron abiertos. F3 plantillas de reunión recurrente, ítem→pase de turno, export PDF.

### Rutina de turno — flecos de la pantalla nueva (ago 2026)
La pantalla está deployada y verificada con datos reales de Bros. Lo que quedó afuera, en orden de valor:
- **Validar el corte apertura/cierre con el equipo.** El límite lo puse en "servicio y produs chicas" (con "corta producción" ya del lado del cierre), deducido del papel — el papel corre de un tirón y no marca dónde termina una fase. Es la única decisión de la transcripción que no sale literal del original.
- **No hay plantilla base para restaurantes nuevos.** Solo Bros tiene los 28 pasos cargados; cualquier otra cuenta abre el tab en `EmptyState` y arranca de cero. Sembrar una plantilla genérica (o un botón "cargar rutina base") si se usa fuera de Bros.
- **El Coach no conoce la pantalla.** `operaciones/page.tsx` escribe `kc_screen_context` con `tab` pero sin insights de la rutina (cuántos pasos faltan, cuál está atrasado). Correr la skill `coach-screen` sobre el tab Turno.

### Las guías viejas de OPS contradicen la app (encontrado ago 2026)
`docs/ops-guia-rapida.html` y `docs/manual-ops.md`/`.html` describen el flujo anterior: cuentan el orden de tabs como Planificación→Producción→Mise (hoy es Producción/Mise/Planificación), dicen "Cerrar turno" donde hoy va **Entregar plaza** (que además no es fichar la salida), y explican el mise solo con carga de números, sin Modo Control. Se detectó al escribir la hoja instructiva nueva (`docs/ops-modo-control-una-hoja.html`), que documenta el flujo correcto: hoy los dos materiales juntos se contradicen. Decidir si el manual largo se actualiza o se reemplaza por hojas por pantalla (skill `hoja-instructiva`).

### Demo El Rescoldo — menú duplicado
Confirmado 27/08, sigue ahí: dos filas en `menus` con nombre "Noche de Asado - Día del Padre" y el mismo `created_at` (`e5c01d00-0000-...-d1` y `9b5722f2-76ce-...`) — parecen un duplicado de seed, no algo que haya creado el usuario. Confunde el picker de "Cargar menú"/"Planificar menú" (aparece dos veces la misma opción). No se borró todavía porque hay que revisar primero qué `menu_preparaciones`/`tareas` de junio quedaron atadas a cada una, para no dejar huérfanos.

### Marco "juego cercado" — F2/F3 (PLAN-JUEGO-CERCADO-2026-08.md)
Fundamento conceptual externo (memoria de Claude Code: `project_fundamento_juego_cercado`) tradujo a 3 features scopeadas. **F1 pasos 1-2 shippeados (24/08)**: `cierres_turno.percepcion`/`notas_servicio` + `EntregaPlazaSheet` piden en 2-3 taps opcionales cómo salió el turno y qué debe saber el que entra. **Falta el paso 3**: mostrar esa lectura junto a un dato duro cuando exista (merma, devoluciones) en Reportes → Auditoría — la utilidad real está en la discrepancia entre percepción y dato, no en el campo aislado. Sin tocar: **F2** historial de cambios en fichas técnicas (autor/fecha, hoy `useRecetas` actualiza sin dejar rastro); **F3** bandeja de propuestas visible (depende de F2, más ambigua, scopear en la sesión).

### Kitchen Coach — asistir activamente en el editor de Carta
Hoy el Coach solo responde preguntas de navegación; el pedido es que ayude a cargar el menú abierto en `ComposicionEditor`. El pipeline de tool-use ya funciona (`crear_evento` en `app/api/coach/route.ts` ~L409 crea un evento con pasos por dictado). **Recomendado: B** — extender ese patrón con `agregar_componentes_menu(menu_id, componentes[])` que escribe a DB y el editor refresca; exige guardar el menú (aunque sea vacío) antes de pedirle al Coach que lo complete. La alternativa A (operar en vivo sobre el estado de React sin guardar) necesita un puente chat↔form que hoy no existe. Sesión aparte.

### `factura_items.producto_id` / `merma.producto_id` casi nunca se completan (encontrado ago 2026, B5)
`facturas-universal` ya resuelve `producto_id` al insertar (27/08, mismo matching que `useFacturas.ts`: exacto sin tildes, luego parcial de palabra completa) — solo matchea contra productos existentes, no crea nuevos (eso queda para el alta manual). Sigue faltando: backfill sobre lo histórico (~1% poblado hoy, el fix nuevo solo aplica hacia adelante) y `merma.producto_id`, que queda vacío seguido y no se tocó. `lib/reportes/fuga.ts` sigue con su fallback por nombre normalizado para lo que quede sin `producto_id`.

### Hardening de seguridad (`get_advisors`)
**Resuelto 27/08**: `REVOKE EXECUTE` aplicado sobre `reset_demo_restaurante()`, `checklist_registros_set_restaurante()` y `rutina_turno_registros_set_restaurante()` (esta última no estaba detectada antes — mismo patrón, función nueva de Rutina de turno) — las tres confirmadas sin caller desde el browser antes de tocarlas; el cron de reset-demo sigue andando por `service_role`, que no se ve afectado por el REVOKE.

Queda pendiente:
- Extensión `unaccent` instalada en el schema `public` — debería vivir en un schema propio (`extensions`); buena práctica, sin riesgo real hoy.
- Bucket público `fotos` tiene política SELECT amplia que permite listar todos los archivos (no solo acceder por URL conocida) — evaluar si conviene restringir el listado.
- Protección de contraseñas filtradas (HaveIBeenPwned) no está activada en Supabase Auth — activar desde el dashboard, sin código.
- `fiscal_config`/`fiscal_tickets` tienen RLS activado pero **sin ninguna policy** — no es un agujero (falla cerrado: nadie puede leer/escribir hoy), pero significa que esas tablas están inutilizables hasta que se les agreguen policies — bloquea a `config_fiscal` de Fiscal ARCA más arriba.

---

## Tracking

- 🔴 Crítico → resolver en la próxima sesión.
- 🟠 Alto → batch de 1-2 sesiones cada uno.
- 🟡 Medio → no empezar código hasta tener el spec definido en `DECISIONES.md`.
- 🟢 Bajo → priorizar según feedback real de El Rescoldo.
