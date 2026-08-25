# KitchenOS — Pendientes

Lista priorizada de lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md`. Lo resuelto y el detalle de sesiones pasadas viven en `HISTORIAL.md` (no acumular acá).

---

## 🔴 Crítico

Sin ítems abiertos ahora mismo.

---

## 🟠 Alto

### Cerrar el ciclo de las 4 capas — plan propio en `PLAN-4-CAPAS.md`
10 bloques ejecutables (B1 a B10) que salen de `AUDITORIA-4-CAPAS.md`: corrección de ingeniería de menú, campos de la capa Definir en Stock, incidencias por proveedor, presupuesto por familias, detección de fuga, objetivos por persona, checklist de carta pre-servicio y Reservas con sugerencia de compra. **No duplicar los ítems acá** — el estado de avance vive en los checkboxes del plan. B1-B8 cerrados; quedan B9 (reservas dentro del día de trabajo: OPS/Salón/Calendario/Dashboard) y B10 (reservas alimentan previsión de producción y sugerencia de compra), ambos dependientes de B8. El track de validación con Bros/Rescoldo (¿reservas les duele?) sigue sin correrse — Facundo decidió arrancar B8 igual (ver `DECISIONES.md` #22); su resultado ahora pesa sobre si vale la pena seguir con B9-B10.

### Verificaciones en dispositivo real — la única deuda del bloque OPS de agosto
Todo lo de abajo está deployado y funcionando en el código; lo que falta es verlo en la cocina. Son cuatro escenarios que **no se pueden probar desde el escritorio**, por eso siguen abiertos juntos.

- **Mise — la tanda del 13-15/08** (Modo Control que decide y despacha, pase de turno por tarea, header plegable, ventana de plaza). En orden de probabilidad de necesitar ajuste: los umbrales del plegado (`ClientView.tsx` → `handleListScroll`: 12px de zona muerta, 8px de delta mínimo — si se siente nervioso o perezoso con el dedo, ese es el número); el cartel "En producción" / "Pasa al turno" de 9px, que compite por ancho con el nombre en la grilla de 320px; el contraste del ámbar y del gris apagado con la luz real; y la ventana de plaza con 7+ plazas en un celular chico (que el selector de turno de abajo se alcance).
- **Multi-dispositivo** — el más frágil y el que no se puede probar solo: tablet en el Mise sin tocar + marcar la tarea desde el celular → tiene que pintarse sola en 1-3 s. Y tildar/destildar rápido un ítem: tiene que quedar como lo dejaste, no revertirse a los 2 s por el eco de realtime (`hooks.md` #23).
- **Muro** (`MURO-PLAN.md` F3, ya colgado en una tablet de la cocina; wake lock y rollover verificados el 11/08): falta la franja de entregas con una entrega real (hoy solo se vio con "—" en todas las plazas) y la franja de notas de plaza — que se lea a dos metros y aparezca sola por realtime al escribirla desde el Mise. El wake lock degrada en silencio si el navegador no lo soporta (tablets viejas, Safari <16.4); si cambia el modelo de tablet, subir el timeout de pantalla del SO como red de contención.
- **Ancho completo en el Motorola/Samsung real** (fix del 22/08): la app dejó de capar el ancho en celular, verificado emulando 390/480/540 CSS px (bandas laterales = 0, sin scroll horizontal). Falta abrirla en el equipo físico donde se vio el problema — y con recarga forzada, que el service worker sirve el CSS viejo la primera vez. Mirar además que los FAB y los sheets, que ahora sí caen dentro de la columna, no queden pegados al borde.
- **Rollover de las 05:00 en el plegado del pase** (`ProduccionBoard`, corte por `cierres_turno.cerrado_at` vs `tareas.completed_at`): lo plegado tiene que desaparecer solo y las pendientes arrastrarse un día, sin recargar.

### Invitación por email falla a veces — falta SMTP propio en Supabase
Auditoría 20/08 (chequeado contra la config viva vía management API): `site_url`, `uri_allow_list` y redirect a `/registro-invitado` ya están OK — ese ítem viejo estaba resuelto. El bloqueo real es otro: no hay SMTP propio configurado (`smtp_host` null) — Supabase manda con su mailer compartido, limitado a `rate_limit_email_sent: 2` (2 emails/hora) y con tendencia a caer en spam por no ser dominio propio. Si el dueño invita 3+ personas seguidas armando el equipo, la 3ra invitación falla. El frontend (`handleInvitar` en `app/(app)/turnos/page.tsx`) solo muestra el error crudo de Supabase en un toast, sin explicar el motivo ni sugerir reintentar más tarde. Fix: configurar SMTP propio (Resend recomendado, tier gratis generoso) en Supabase Auth → falta que Facundo cree la cuenta y pase la API key para conectarlo vía management API.

**Decisión 21/08:** Facundo ya creó la cuenta en Resend pero frenó ahí — hace falta además un dominio propio verificado (el dominio de prueba de Resend solo manda a la propia casilla de quien se registró, no sirve para invitar gente real). Se queda así por ahora: el caso de uso típico (invitar de a una persona) funciona sin el fix; el límite de 2/hora solo pisa si se invitan 3+ personas seguidas. Retomar cuando eso moleste en uso real o cuando haya un dominio propio de KitchenOS por otro motivo (no vale la pena comprar uno solo para esto).

### `xlsx` bundleado siempre en 6 pantallas pesadas
Auditoría 20/08: `lib/exportar.ts` importa `xlsx` a nivel de módulo y se importa estático en el top de Reportes, Carta (3829 líneas), Stock (3396 líneas), Facturas, Proveedores y Recetario — la librería completa se parsea en esas rutas aunque nadie exporte a Excel. `jspdf` en cambio ya se importa dinámico en todos lados (`await import('jspdf')`) y es el patrón correcto. Fix: mismo tratamiento en `lib/exportar.ts` — envolver el uso de `XLSX` en `next/dynamic` o `await import('xlsx')`.

### Fiscal ARCA — homologación end-to-end
Código completo (`lib/fiscal/wsaa.ts`, `lib/fiscal/wsfev1.ts`, `app/api/fiscal/emitir/route.ts`). Falta: certificado real de ARCA del contribuyente, probar contra el servidor de testing de AFIP, URLs de prod en `config_fiscal`, cachear token/sign WSAA en Supabase.

### OPS Consolidación — diferido
Reset de `demanda_viva` al aperturar la plaza (hoy solo se lee, el salón la incrementa, nadie la resetea). "Copiar a otro día" e "Ingredientes consolidados" (se sacaron con la planilla legacy) — reimplementar sobre `tareas` si el usuario los pide.

---

## 🟡 Medio — Roadmap: Planes y Stripe

### Estructura de planes $60 / $99
`restaurantes.plan` (`'trial'|'basic'|'pro'`), tabla `suscripciones` (`restaurante_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end`), hook `usePlan()`. Definir spec en `DECISIONES.md` antes de empezar código.

### Integración Stripe
`POST /api/stripe/checkout` (Checkout Session), `POST /api/stripe/webhook` (`customer.subscription.*` → `suscripciones`), UI en Configuración → Plan, paywall en trial expirado. Depende del ítem anterior.

### Feature gating
Coach, multi-usuario, export PDF, HACCP solo en plan Pro — `puedeUsar('coach')` derivado de `usePlan`. Depende de Stripe.

---

## 🟢 Bajo — Roadmap abierto

### Kitchen Coach — memoria persistida
Prompt caching y tool use agéntico ya resueltos. Falta tabla `coach_conversaciones` para historial cross-device (hoy es localStorage).

### Fotos — falta completar
`PhotoPicker` (bucket `fotos`) integrado en recetario y carta. Falta `equipo_miembros.foto_url` y facturas, si se decide.

### Notificaciones
In-app vía Supabase realtime (tabla `notificaciones`), push web (PWA + service worker + VAPID), email/WhatsApp para alertas críticas (stock crítico, vencimientos).

### PWA offline — completar fuera de Salón/KDS
La vista de servicio (Salón/KDS) ya tiene offline completo (SW cachea GETs, bumps en cola IndexedDB, banner sin-conexión). El resto de la app (stock, facturas, etc.) queda pendiente.

### Onboarding wizard guiado
`WelcomeDashboard` existe. Falta el flujo completo: datos del restaurante → plazas → stock inicial → equipo → permisos, persistiendo progreso en `restaurantes.configuracion.onboarding_step`.

**Gap adicional (auditoría 20/08):** el wizard (`app/(app)/onboarding/page.tsx`, pasos por rol) solo se dispara vía redirect server-side cuando el restaurante tiene 0 productos, 0 facturas y 0 recetas (`app/(app)/page.tsx`). Un cocinero invitado a un restaurante ya operativo nunca cumple esa condición — cae directo al Dashboard sin ninguna guía, con el tour automático del Coach como único mecanismo de descubrimiento (y ese tiene su propio bug: el flag `kc_ops_welcomed`/`kc_app_welcomed` se marca en localStorage *antes* de que el tour termine de mostrarse, así que si el usuario navega rápido se pierde para siempre y no vuelve a aparecer). Fix: disparar el wizard (o una versión corta, solo los pasos del rol) por "primer login de este usuario", no solo por "restaurante vacío".

### Objetivos de venta — falta editor del override por persona (B6, ago 2026)
El modelo (`puestos.objetivos` + `equipo_miembros.objetivos` override, mezclados con `getObjetivosMiembro()`) y el editor del puesto (Turnos → Puestos) están completos y en uso en Reportes → Personal. Lo que falta: una UI para pisar un objetivo puntual por persona (hoy solo se puede vía SQL directo) — mismo patrón visual que ya existe para `modulos_extra`/`modulos_restringidos` en la ficha de miembro (`actualizarOverridesMiembro`). Bajo porque el caso común (objetivo por puesto) ya cubre la mayoría de los casos.

### Permisos — falta clonar entre puestos y vista matriz
Auditoría 20/08: cambiar los módulos de un puesto es 100% manual, puesto por puesto (mínimo 4 clicks c/u vía Turnos → Puestos → editar), sin forma de copiar los permisos de un puesto existente a otro nuevo (el único "template" reusable es `PUESTO_TEMPLATES`, aplicable solo al crear un puesto desde cero). Tampoco hay una vista tipo matriz (puestos × módulos) para ver de un vistazo quién ve qué. Mejora sugerida: botón "Clonar permisos de [otro puesto]" en el form de puesto nuevo/editar.

### Capacitación — cobertura despareja de tours y hojas instructivas
Auditoría 20/08: de 28 módulos, 19-20 tienen tour guiado (`lib/coach/tours.ts`) — faltan `checklist, produccion, equipo, configuracion, kds, coach, muro, bitacora`. De hojas instructivas imprimibles (skill `hoja-instructiva`) solo existe una, la de OPS/Mise (`docs/ops-modo-control-una-hoja.pdf`), sin índice que las centralice. `docs/instructivo-carga-datos.md` cubre 11 módulos pero no HACCP, Turnos, Organigrama, Espacios, Calendario, Clientes, Proveedores ni Configuración. No es un pedido puntual — priorizar según qué pantallas generan más preguntas en uso real.

### `confirm()` nativo — 5 en superficie de servicio, ~80 en gestión (auditoría `scripts/design-lint.mjs`, 24/08)
El lint de diseño nuevo (`npm run lint:design`, P5 de `INVESTIGACION-DISENO-2026-08.md`) encontró `window.confirm()` sin reemplazar en `produccion/page.tsx:309` (vaciar el día) y `salon/config/page.tsx` (eliminar mesa/elemento/medio de pago/estación, 4 sitios) — mismo bug que ya se arregló dos veces esta sesión en Mise y KDS (DESIGN.md §10: nunca un diálogo nativo del SO en flujo de servicio), con el patrón de sheet propio ya probado (`ConfirmSheet`/`EntregaPlazaSheet`/`Confirmar86Sheet`) listo para reusar. Los ~80 restantes (Turnos, Clientes, HACCP, Carta, Stock, Espacios) son pantallas de gestión, no de servicio — el lint los marca WARN, no ERROR: ahí un confirm() nativo es debate de estilo, no el mismo bug. El lint **no está wireado a CI** hasta que los 5 ERROR se resuelvan (si no, el pipeline queda rojo por deuda ajena al commit que lo dispare).

### `tareas`/`checklist`/`produccion` como permiso: gatea el sidebar pero no la ruta (encontrado al arreglar `MODULOS_ASIGNABLES`, 20/08)
`SidebarNav.tsx` (`SECCIONES`) chequea `tareas`/`checklist`/`produccion` como módulos independientes para mostrar/ocultar el link — ahora asignables después del fix de hoy. Pero `RUTA_A_MODULO` (`lib/constants.ts`) mapea las tres rutas (`/tareas`, `/checklist`, `/produccion`) al permiso `'operaciones'`, no al específico. Consecuencia: si un admin le saca `checklist` a un puesto que sí tiene `operaciones`, el link "Plazas" desaparece del sidebar pero la ruta `/checklist` sigue siendo accesible por URL directa. No es explotable por terceros (todo detrás de auth + RLS, solo afecta qué ve un empleado propio), pero es inconsistente con lo que el owner espera al restringir. Fix de fondo: que `RUTA_A_MODULO` use los tres permisos específicos en vez de colapsarlos en `operaciones`, o documentar que esos tres checkboxes solo controlan visibilidad de sidebar.

### Tests — Testing Library para hooks
Vitest + CI (typecheck+vitest+build por push/PR) + Playwright e2e (`e2e/salon-kds.spec.ts`) ya están. Falta Testing Library con mock del cliente Supabase para tests de hooks.

### OPS — seguir bajando el peso en celular (ago 2026)
Entrar a Mise en mobile bajó de 2582 kB / 64 requests a 899 kB / 46. Lo que queda:
- **`tareas` 594 kB** — lo más pesado. La ventana de 60 días de `useTareas` hoy recorta 11 filas (preventiva, no ahorro real). Apretarla a ~3 semanas daría el salto, pero rompe Planificación al navegar a un día viejo: antes hay que hacer que consulte por su cuenta las fechas fuera de la ventana.
- **`productos` 66 kB** — el panel del Coach baja 1000 filas solo para contar las críticas (`CoachPanelContent.tsx`). Necesita un count server-side (vista o RPC: `stock_actual <= stock_critico` es comparación entre columnas y PostgREST no la soporta).

### Ventas en 0 pero Ingeniería de menú muestra unidades vendidas (encontrado 11/08, Bros)
`/ventas` mostraba 0 ventas en agosto, pero Carta → Rentabilidad → Ingeniería mostraba platos con 361 y 550 unidades vendidas. O son dos fuentes de datos que no se hablan (comandas del salón vs. importación manual de ventas), o el filtro de período de `/ventas` no mira lo mismo que Rentabilidad. Investigar antes de confiar en cualquiera de las dos pantallas para decisiones.

### Backlog chico — sin síntoma de usuario reportado, priorizar solo si molesta en uso real
- **Dark mode — contraste pobre en toda superficie navy** (encontrado ago 2026, PLAN-SUPERFICIE S2): `[data-theme="dark"] --navy` es `#c8d6e5` (gris-azul claro, no navy oscuro — decisión pre-existente, no de esa sesión). Todo componente con `background: var(--navy)` + texto blanco (header del Dashboard, `MiPlaza`, botón "Iniciar turno", `AhoraCard`) queda con texto blanco sobre fondo claro en dark mode — difícil de leer. Es sistémico (afecta todas las superficies navy a la vez), no se arregla tocando un componente suelto; necesita decidir si `--navy` en dark mode debería invertir a un navy oscuro real o si el texto de esas superficies debería pasar a oscuro cuando el token se invierte.
- **Carta → Rentabilidad → Ingeniería no respeta "Precio/FC solo admin"** (encontrado ago 2026, PLAN-SUPERFICIE S3.2): el resto de Carta oculta precio/food cost a roles no-admin, pero el tab Ingeniería (`RentabilidadView` en `carta/page.tsx`) muestra margen en $ (`fmtMoney(x.margin)`) por plato sin ningún gate — y "Ver rentabilidad" tampoco está restringido, así que cualquier rol con acceso a `carta` (parrilla/frios/calientes/etc., ver `MODULOS_POR_ROL`) llega ahí. El badge nuevo de rareza (Estrella/Caballo/Puzzle/Perro) en el `PlatoCard` de la lista principal si respeta el gate (`quadranteMap` solo se calcula si `isAdmin`) — la inconsistencia es preexistente y queda solo en esta vista de Rentabilidad, no se tocó por no ser parte de lo pedido en esa sesión.
- HACCP: 3 modales largos (limpieza/vencimientos/temperaturas) sin agrupar — mismo problema que tenía el modal de Stock (muchos campos heterogéneos sin secciones), candidato a la misma cura de fondo pero con otro tratamiento (no son checkboxes, no aplica `SwitchRow`).
- OPS Producción: el orden de columnas (drag-and-drop) persiste en `localStorage` por dispositivo, no en DB — cada navegador recuerda su propio orden. Mover a una tabla nueva (ej. `ops_orden_columnas`) si se necesita compartido entre dispositivos del mismo restaurante.
- Mise en tablet táctil ancha (iPad landscape, 1024px exactos): se queda en columna única porque la grilla de desktop está condicionada a `pointer: fine`. El motivo es que el reordenar es un long-press que compara `clientY` contra el centro vertical de cada ítem — con dos tarjetas lado a lado elige al azar. Para ganar la grilla ahí habría que hacer el drag 2D (comparar también `clientX` dentro de la fila). Solo si alguien usa el mise desde tablet.
- **El acceso DDL volvió** (ago 2026), así que los dos workarounds "sin migración" ya podrían tener tabla/columna real: plazas custom (JSONB en `restaurantes.configuracion.plazas_custom`, `usePlazasCustom.ts`) y cantidad de recipientes (sufijo `" ×N"` en `checklist_items.recipiente_nombre`, `lib/ops/mise.ts`). Ninguno molesta en uso real y los dos degradan legible — no es urgente, pero ya no hay excusa técnica.
- Carta / `ComposicionEditor`: la semántica de "Cantidad" es distinta en modo Plato (porciones, gramaje opcional que afecta costo) y en Menú/Evento (gramos para receta/producto, unidades para plato vinculado). Hoy es coherente pero son dos modelos que no se explican entre sí; evaluar converger solo si confunde en uso real.
- `npm run lint` está roto: ESLint 9 no resuelve `tsconfig-paths/lib/tsconfig-loader` (lo pide `eslint-plugin-import` vía `eslint-config-next`). `npm run build` y el typecheck andan, así que no bloquea deploy. Reconfirmado ago 2026: el paquete `tsconfig-paths` **existe** en `node_modules` pero le falta ese archivo interno — es una instalación incompleta, no una dependencia ausente, así que el fix es reinstalar (`npm install`), no agregarla al `package.json`.
- **`SidebarNav` vacío para roles fuera de `MODULOS_POR_ROL`** (observado ago 2026 en consola con la cuenta `cocina@broscomedor.com`): esa cuenta tiene `equipo_miembros.rol='cocinero'` — no matchea ningún key de `MODULOS_POR_ROL` (`Rol` no tiene `'cocinero'`, solo `admin/chef/parrilla/frios/calientes/pase/pasteleria/panaderia/linea/ayudante`) — así que en `SidebarNav.tsx` `modulosDelRol` sale vacío y el sidebar solo muestra "Inicio" pese a que `permisos_app` sí trae `operaciones/recetario/stock/pase/carta` completo. Repro fácil: loguear con esa cuenta y mirar el sidebar. (La parte de "`usePermisos` traga el error real" que acompañaba este hallazgo ya se resolvió al migrar el hook a SWR el 20/08 — el catch ahora extrae el mensaje real de Supabase con el patrón de `hooks.md`#2, así que el próximo repro va a mostrar el error verdadero en consola en vez de uno genérico.)
- **`.claude/settings.json` modificado sin commitear** — arrastrado desde jul 2026, sigue esperando una decisión de Facundo (commitear o revertir). Los 5 archivos sueltos (`mcp-*.js`, dos `.tgz`) que lo acompañaban se borraron el 11/08 (eran debris de paquetes npm, no se usaban).
- El resumen OPS de una fila en `ComposicionEditor.tsx` (~línea 1580) arma `plaza · sección · cantidad_ops+unidad` sin mirar `peso_porcion` — con recipiente muestra las porciones del recipiente, no el gramaje. Es un subtítulo de la config del mise (defendible), pero es el mismo patrón que se corrigió en Recetario/Platos; revisar si en uso real confunde.
- **Organigrama — dos simplificaciones deliberadas de la Fase 1** (ago 2026): reasignar `reporta_a_puesto_id` en la Estructura es un `<select>`, no drag-and-drop (se priorizó robustez sobre tiempo); y el árbol de una área solo considera puestos con ese `area_key` — un puesto que reporta a otro de área distinta cae como raíz en vez de anidarse cruzado. Ninguna molesta en uso real todavía; tocar solo si alguien lo pide.
- **Evento con presencia heredada en el mise no tiene "Sacar del mise" en el picker de Planificación** (`produccion/page.tsx`, encontrado 22/08 arreglando `checklist_items` huérfanos de un evento con `plaza_control='general'`): `MenusView.tsx` (Carta → Menús) sí muestra el estado/`Sacar` para un evento que ya quedó con `checklist_items` (ver `DECISIONES.md` §21), pero el picker de Planificación solo ofrece el botón "activar por fecha" para eventos, sin importar `enMise`. Asimetría chica; sacar del mise hoy es por `MenusView` o SQL directo.
- **Stock — celda de stock apretada en rango 480-1023px** (ago 2026): la celda muestra el número editable **y** el editor de mínimo lado a lado en una columna de ~84px — el análisis decía que no entran los dos. Ese rango **ya no es solo tablet**: desde que el `#shell` va full-width en celular (22/08), un Motorola (480 CSS px) y un Android con "Tamaño de pantalla" en chico (540) caen justo ahí. Capturas a 480 y 540 muestran la celda **legible en modo lectura** (número + `mín` lado a lado, sin desborde); falta verla en **modo edición**, que es el caso que el análisis marcaba. El breakpoint <480px y el de desktop (≥1024px) están verificados en pantalla real.

### Mise / pase de turno — flecos de la tanda de agosto
Todo lo grande quedó andando; esto es lo que se dejó explícitamente afuera.
- **El plegado del pase no aplica a Menú/Evento.** Sus columnas son pasos del menú, no plazas, y no existe "entregar un paso" — inventarlo sería semántica falsa. Queda la asimetría visible (Carta plegada, Menú/Evento entera). Solo si molesta en uso real; ahí habría que decidir qué significa el pase para un menú.
- **No hay botón de deshacer entrega.** `useCierresTurno.deshacerEntrega()` existe y la policy DELETE está, pero no está cableado a ninguna UI: hoy una entrega equivocada se arregla por SQL.
- **Reportes → Auditoría sigue deduciendo** los pases incumplidos de la ausencia de registros de cierre. Ahora que `cierres_turno` es un hecho con autor y hora, ese reporte puede decir *quién* entregó y a qué hora en vez de solo que faltó.
- **El rezagado.** Entregada la cena a la 01:20 la jornada rueda al día siguiente; si otro entra a las 02:00 y elige "Cena" en el selector del título cae en la cena futura, no en la que se acaba de cerrar. El selector cambia turno pero no fecha — el arreglo de fondo es navegación de fecha en el mise.
- **La sugerencia de producción sobreestima si el cierre se hizo en Modo Control.** `lib/produccion/sugerencia.ts` filtra `cantidad_actual not null` y, sin registro numérico, asume `stockActual = 0` → sugiere el promedio entero. Es la contra conocida del pase por tarea (deliberada: nadie inventa un número que no se contó), pero si el equipo se acostumbra a cerrar así, "Sugerir producción" va a pedir de más. Salida posible: que la sugerencia descuente lo que ya está despachado como tarea de `pase_turno` en vez de asumir cero.
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
Dos filas en `menus` con nombre "Noche de Asado - Día del Padre" y el mismo `created_at` (`e5c01d00-...d1` y `4622a73b-...`) — parecen un duplicado de seed, no algo que haya creado el usuario. Confunde el picker de "Cargar menú"/"Planificar menú" (aparece dos veces la misma opción). Revisar si conviene borrar una y sus tareas asociadas de junio.

### Marco "juego cercado" — 3 features derivadas (PLAN-JUEGO-CERCADO-2026-08.md)
Fundamento conceptual externo (memoria de Claude Code: `project_fundamento_juego_cercado`) tradujo a 3 features scopeadas: **F1** lectura del servicio en `cierres_turno` (percepción + notas junto al dato duro, hoy el cierre solo guarda inventario) — mejor relación esfuerzo/diferenciación, arrancar por acá; **F2** historial de cambios en fichas técnicas (autor/fecha, hoy `useRecetas` actualiza sin dejar rastro); **F3** bandeja de propuestas visible (depende de F2, más ambigua, scopear en la sesión). Sesión aparte con Sonnet.

### Kitchen Coach — asistir activamente en el editor de Carta
Hoy el Coach solo responde preguntas de navegación; el pedido es que ayude a cargar el menú abierto en `ComposicionEditor`. El pipeline de tool-use ya funciona (`crear_evento` en `app/api/coach/route.ts` ~L409 crea un evento con pasos por dictado). **Recomendado: B** — extender ese patrón con `agregar_componentes_menu(menu_id, componentes[])` que escribe a DB y el editor refresca; exige guardar el menú (aunque sea vacío) antes de pedirle al Coach que lo complete. La alternativa A (operar en vivo sobre el estado de React sin guardar) necesita un puente chat↔form que hoy no existe. Sesión aparte.

### `factura_items.producto_id` / `merma.producto_id` casi nunca se completan (encontrado ago 2026, B5)
Verificado contra producción: `factura_items.producto_id` está poblado en ~1% de las filas globalmente (el importador de facturas por IA, `facturas-universal`, solo carga `producto_nombre`) y `merma.producto_id` también queda vacío seguido. `lib/reportes/fuga.ts` ya resuelve esto con fallback por nombre normalizado, pero cualquier feature futura que agregue por `producto_id` directo (sin ese fallback) va a dar resultados vacíos. Fix de fondo: que `facturas-universal` intente resolver `producto_id` al insertar (mismo matching que ya usa `useFacturas.ts` en el guardado manual), o correr `/api/importador/productos-desde-facturas`-style backfill sobre lo histórico.

### Hardening de seguridad (`get_advisors`)
- `reset_demo_restaurante()` es `SECURITY DEFINER` sin `REVOKE EXECUTE` — ejecutable por `anon`/`authenticated` vía RPC directo. Impacto acotado (solo resetea el restaurante demo) pero cualquiera con la publishable key podría spamearlo. Fix: `REVOKE EXECUTE ON FUNCTION reset_demo_restaurante() FROM anon, authenticated;` (solo el cron con service role debería poder llamarlo).
- Extensión `unaccent` instalada en el schema `public` — debería vivir en un schema propio (`extensions`); buena práctica, sin riesgo real hoy.
- Bucket público `fotos` tiene política SELECT amplia que permite listar todos los archivos (no solo acceder por URL conocida) — evaluar si conviene restringir el listado.
- Protección de contraseñas filtradas (HaveIBeenPwned) no está activada en Supabase Auth — activar desde el dashboard, sin código.
- `checklist_registros_set_restaurante()` es `SECURITY DEFINER` sin `REVOKE EXECUTE` — ejecutable por `anon`/`authenticated` vía RPC directo (encontrado 11/08 corriendo `get_advisors`, mismo patrón que `reset_demo_restaurante()` arriba).

---

## Tracking

- 🔴 Crítico → resolver en la próxima sesión.
- 🟠 Alto → batch de 1-2 sesiones cada uno.
- 🟡 Medio → no empezar código hasta tener el spec definido en `DECISIONES.md`.
- 🟢 Bajo → priorizar según feedback real de El Rescoldo.
