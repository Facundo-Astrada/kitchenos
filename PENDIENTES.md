# KitchenOS — Pendientes

Lista priorizada de lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md`. Lo resuelto y el detalle de sesiones pasadas viven en `HISTORIAL.md` (no acumular acá).

---

## 🔴 Crítico

Sin ítems abiertos ahora mismo.

---

## 🟠 Alto

### Cerrar el ciclo de las 4 capas — plan propio en `PLAN-4-CAPAS.md`
10 bloques ejecutables (B1 a B10) que salen de `AUDITORIA-4-CAPAS.md`: corrección de ingeniería de menú, campos de la capa Definir en Stock, incidencias por proveedor, presupuesto por familias, detección de fuga, objetivos por persona, checklist de carta pre-servicio y Reservas con sugerencia de compra. **No duplicar los ítems acá** — el estado de avance vive en los checkboxes del plan. Lo único que se decide fuera: si Reservas (B8-B10) sigue en pie, contra el resultado de la validación con Bros y Rescoldo.

### Verificaciones en dispositivo real — la única deuda del bloque OPS de agosto
Todo lo de abajo está deployado y funcionando en el código; lo que falta es verlo en la cocina. Son cuatro escenarios que **no se pueden probar desde el escritorio**, por eso siguen abiertos juntos.

- **Mise — la tanda del 13-15/08** (Modo Control que decide y despacha, pase de turno por tarea, header plegable, ventana de plaza). En orden de probabilidad de necesitar ajuste: los umbrales del plegado (`ClientView.tsx` → `handleListScroll`: 12px de zona muerta, 8px de delta mínimo — si se siente nervioso o perezoso con el dedo, ese es el número); el cartel "En producción" / "Pasa al turno" de 9px, que compite por ancho con el nombre en la grilla de 320px; el contraste del ámbar y del gris apagado con la luz real; y la ventana de plaza con 7+ plazas en un celular chico (que el selector de turno de abajo se alcance).
- **Multi-dispositivo** — el más frágil y el que no se puede probar solo: tablet en el Mise sin tocar + marcar la tarea desde el celular → tiene que pintarse sola en 1-3 s. Y tildar/destildar rápido un ítem: tiene que quedar como lo dejaste, no revertirse a los 2 s por el eco de realtime (`hooks.md` #23).
- **Muro** (`MURO-PLAN.md` F3, ya colgado en una tablet de la cocina; wake lock y rollover verificados el 11/08): falta la franja de entregas con una entrega real (hoy solo se vio con "—" en todas las plazas) y la franja de notas de plaza — que se lea a dos metros y aparezca sola por realtime al escribirla desde el Mise. El wake lock degrada en silencio si el navegador no lo soporta (tablets viejas, Safari <16.4); si cambia el modelo de tablet, subir el timeout de pantalla del SO como red de contención.
- **Rollover de las 05:00 en el plegado del pase** (`ProduccionBoard`, corte por `cierres_turno.cerrado_at` vs `tareas.completed_at`): lo plegado tiene que desaparecer solo y las pendientes arrastrarse un día, sin recargar.

### Invitación de usuarios — falta config de Supabase
Código completo (endpoint `/api/invitar`, UI en Equipo, página `/registro-invitado`, `proxy.ts` la marca pública). Falta solo configuración de dashboard: whitelistear `https://kos-app-one.vercel.app/registro-invitado` en Supabase Auth → Redirect URLs, ajustar la plantilla "Invite user", setear `NEXT_PUBLIC_SITE_URL` en Vercel.

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

### Exportar legajo PDF
Desde `/turnos` → tab Puestos → ficha del puesto → "Exportar legajo": PDF con datos, funciones, miembros asignados.

### Notificaciones
In-app vía Supabase realtime (tabla `notificaciones`), push web (PWA + service worker + VAPID), email/WhatsApp para alertas críticas (stock crítico, vencimientos).

### PWA offline — completar fuera de Salón/KDS
La vista de servicio (Salón/KDS) ya tiene offline completo (SW cachea GETs, bumps en cola IndexedDB, banner sin-conexión). El resto de la app (stock, facturas, etc.) queda pendiente.

### Onboarding wizard guiado
`WelcomeDashboard` existe. Falta el flujo completo: datos del restaurante → plazas → stock inicial → equipo → permisos, persistiendo progreso en `restaurantes.configuracion.onboarding_step`.

### Tests — Testing Library para hooks
Vitest + CI (typecheck+vitest+build por push/PR) + Playwright e2e (`e2e/salon-kds.spec.ts`) ya están. Falta Testing Library con mock del cliente Supabase para tests de hooks.

### OPS — seguir bajando el peso en celular (ago 2026)
Entrar a Mise en mobile bajó de 2582 kB / 64 requests a 899 kB / 46. Lo que queda:
- **`tareas` 594 kB** — lo más pesado. La ventana de 60 días de `useTareas` hoy recorta 11 filas (preventiva, no ahorro real). Apretarla a ~3 semanas daría el salto, pero rompe Planificación al navegar a un día viejo: antes hay que hacer que consulte por su cuenta las fechas fuera de la ventana.
- **`productos` 66 kB** — el panel del Coach baja 1000 filas solo para contar las críticas (`CoachPanelContent.tsx`). Necesita un count server-side (vista o RPC: `stock_actual <= stock_critico` es comparación entre columnas y PostgREST no la soporta).

### Ventas en 0 pero Ingeniería de menú muestra unidades vendidas (encontrado 11/08, Bros)
`/ventas` mostraba 0 ventas en agosto, pero Carta → Rentabilidad → Ingeniería mostraba platos con 361 y 550 unidades vendidas. O son dos fuentes de datos que no se hablan (comandas del salón vs. importación manual de ventas), o el filtro de período de `/ventas` no mira lo mismo que Rentabilidad. Investigar antes de confiar en cualquiera de las dos pantallas para decisiones.

### Loop teórico-vs-real de stock — no cerrado
Se puede calcular consumo teórico (venta × receta) y se puede contar inventario real, pero no hay pantalla que muestre la varianza entre ambos. Marcado como hueco desde el relevamiento original del proyecto, confirmado que sigue abierto (11/08).

### Backlog chico — sin síntoma de usuario reportado, priorizar solo si molesta en uso real
- HACCP: 3 modales largos (limpieza/vencimientos/temperaturas) sin agrupar — mismo problema que tenía el modal de Stock (muchos campos heterogéneos sin secciones), candidato a la misma cura de fondo pero con otro tratamiento (no son checkboxes, no aplica `SwitchRow`).
- OPS Producción: el orden de columnas (drag-and-drop) persiste en `localStorage` por dispositivo, no en DB — cada navegador recuerda su propio orden. Mover a una tabla nueva (ej. `ops_orden_columnas`) si se necesita compartido entre dispositivos del mismo restaurante.
- Mise en tablet táctil ancha (iPad landscape, 1024px exactos): se queda en columna única porque la grilla de desktop está condicionada a `pointer: fine`. El motivo es que el reordenar es un long-press que compara `clientY` contra el centro vertical de cada ítem — con dos tarjetas lado a lado elige al azar. Para ganar la grilla ahí habría que hacer el drag 2D (comparar también `clientX` dentro de la fila). Solo si alguien usa el mise desde tablet.
- **El acceso DDL volvió** (ago 2026), así que los dos workarounds "sin migración" ya podrían tener tabla/columna real: plazas custom (JSONB en `restaurantes.configuracion.plazas_custom`, `usePlazasCustom.ts`) y cantidad de recipientes (sufijo `" ×N"` en `checklist_items.recipiente_nombre`, `lib/ops/mise.ts`). Ninguno molesta en uso real y los dos degradan legible — no es urgente, pero ya no hay excusa técnica.
- Carta / `ComposicionEditor`: la semántica de "Cantidad" es distinta en modo Plato (porciones, gramaje opcional que afecta costo) y en Menú/Evento (gramos para receta/producto, unidades para plato vinculado). Hoy es coherente pero son dos modelos que no se explican entre sí; evaluar converger solo si confunde en uso real.
- `npm run lint` está roto: ESLint 9 no resuelve `tsconfig-paths/lib/tsconfig-loader` (lo pide `eslint-plugin-import` vía `eslint-config-next`). `npm run build` y el typecheck andan, así que no bloquea deploy. Fix probable: instalar `tsconfig-paths` como devDependency.
- **`.claude/settings.json` modificado sin commitear** — arrastrado desde jul 2026, sigue esperando una decisión de Facundo (commitear o revertir). Los 5 archivos sueltos (`mcp-*.js`, dos `.tgz`) que lo acompañaban se borraron el 11/08 (eran debris de paquetes npm, no se usaban).
- El resumen OPS de una fila en `ComposicionEditor.tsx` (~línea 1580) arma `plaza · sección · cantidad_ops+unidad` sin mirar `peso_porcion` — con recipiente muestra las porciones del recipiente, no el gramaje. Es un subtítulo de la config del mise (defendible), pero es el mismo patrón que se corrigió en Recetario/Platos; revisar si en uso real confunde.
- **Stock — celda de stock apretada en rango 480-1023px** (tablet o ventana de navegador angosta, ago 2026): en ese ancho la celda muestra el número editable **y** el editor de mínimo lado a lado en una columna de solo 84px — no entran los dos (encontrado por análisis, sin captura real que lo confirme). El breakpoint <480px (celular) y el de desktop (≥1024px) están arreglados y verificados en pantalla real. Solo tocar si aparece una captura de ese rango específico.
- **Despacho de tarea desde el mise, posible doble-tap táctil** (encontrado ago 2026, datos de Bros): dos filas idénticas (`Garbanzos fritos`, mismo día, ambas `listo`) creadas con 1ms de diferencia. `crearTarea` en `ProductoMiseCard.tsx` ya guarda con `if (creating) return` antes de `setCreating(true)`, pero ese estado no es síncrono — un `touchstart`+`click` disparando el handler dos veces en el mismo tick podría colarse antes del re-render. Se limpiaron los datos; si se repite, pasar a un lock por ref (síncrono) en vez de `useState`.

### Mise / pase de turno — flecos de la tanda de agosto
Todo lo grande quedó andando; esto es lo que se dejó explícitamente afuera.
- **El plegado del pase no aplica a Menú/Evento.** Sus columnas son pasos del menú, no plazas, y no existe "entregar un paso" — inventarlo sería semántica falsa. Queda la asimetría visible (Carta plegada, Menú/Evento entera). Solo si molesta en uso real; ahí habría que decidir qué significa el pase para un menú.
- **No hay botón de deshacer entrega.** `useCierresTurno.deshacerEntrega()` existe y la policy DELETE está, pero no está cableado a ninguna UI: hoy una entrega equivocada se arregla por SQL.
- **Reportes → Auditoría sigue deduciendo** los pases incumplidos de la ausencia de registros de cierre. Ahora que `cierres_turno` es un hecho con autor y hora, ese reporte puede decir *quién* entregó y a qué hora en vez de solo que faltó.
- **El rezagado.** Entregada la cena a la 01:20 la jornada rueda al día siguiente; si otro entra a las 02:00 y elige "Cena" en el selector del título cae en la cena futura, no en la que se acaba de cerrar. El selector cambia turno pero no fecha — el arreglo de fondo es navegación de fecha en el mise.
- **La sugerencia de producción sobreestima si el cierre se hizo en Modo Control.** `lib/produccion/sugerencia.ts` filtra `cantidad_actual not null` y, sin registro numérico, asume `stockActual = 0` → sugiere el promedio entero. Es la contra conocida del pase por tarea (deliberada: nadie inventa un número que no se contó), pero si el equipo se acostumbra a cerrar así, "Sugerir producción" va a pedir de más. Salida posible: que la sugerencia descuente lo que ya está despachado como tarea de `pase_turno` en vez de asumir cero.
- **`turnoActivo()` (`lib/ops/turnos.ts`) quedó sin callers** — lo reemplazó `turnoVigente()` en los dos que tenía. Sigue exportado y testeado; borrarlo o dejar un comentario que mande al nuevo, para que nadie lo agarre por error.
- **Policies de `checklist_registros`**: podrían pasar del subquery a `checklist_items` a `restaurante_id = mi_restaurante_id()` ahora que la columna existe. Es más barato de evaluar (realtime chequea RLS por evento y por suscriptor), pero con 425 filas no hace falta y el blast radius es el mise de todas las cuentas.

### Muro — F4 del plan (MURO-PLAN.md)
Solo después de una semana de uso real en servicio, y cada ítem es una hipótesis a validar, no un pendiente fijo: tomar/asignar una tarea desde el muro, sonido o parpadeo en una `duda` nueva, cronómetro por ítem en curso con umbral de color (como el KDS), foto del turno al entregar.

### Calendario — F2 a F5 del plan de expansión
F1 (grilla estilo Google Calendar, notas por día como ítems enviables a Producción, Planificar menú por rango) ya deployado. Falta, en orden, según `CALENDARIO-PLAN.md`: F2 motor de rutinas recurrentes (generalizar `haccp_limpieza` a una tabla `rutinas` compartida — decisión de Facundo: generalizar, no duplicar por dominio), F3 más reflejos de solo lectura (menús de Carta, turnos, HACCP, cuenta corriente), F4 Coach con contexto completo del calendario + tools de agenda, F5 extras (ICS, feriados, semana tipo).

### Bitácora — F2 y F3 del plan (ago 2026)
F1 deployado (13/08): `/bitacora`, tablas `bitacora_entradas`/`bitacora_items` con RLS+realtime, edición tipo-doc (Enter parte línea, Tab indenta, pegar multilínea desde Docs), participantes desde el día 1, solo admin/chef. Falta, en orden: F2 estados/tipos por ítem (tema/acuerdo/acción/pregunta) + convertir un ítem en tarea real de OPS (`tarea_id` en `bitacora_items`, hoy sin esa columna) + arrastrar a la reunión siguiente los ítems que quedaron abiertos. F3 plantillas de reunión recurrente, ítem→pase de turno, export PDF.

### shot.mjs — `--base` documentado pero no implementado
`.claude/skills/shot/SKILL.md` documenta un flag `--base` para apuntar al dev server local; `scripts/shot.mjs` tiene `const BASE` hardcodeado a producción y no lee `args.base`. Encontrado ago 2026 al necesitar probar una pantalla nueva contra local (se resolvió con un script Playwright aparte). Fix: `const BASE = args.base || 'https://kos-app-one.vercel.app'`. Era el segundo caso del mismo tipo — `--scroll` también estaba documentado sin existir y se implementó al hacer la hoja instructiva; el resto de la lista de flags de esa skill se corrigió contra el script real en la misma pasada.

### Las guías viejas de OPS contradicen la app (encontrado ago 2026)
`docs/ops-guia-rapida.html` y `docs/manual-ops.md`/`.html` describen el flujo anterior: cuentan el orden de tabs como Planificación→Producción→Mise (hoy es Producción/Mise/Planificación), dicen "Cerrar turno" donde hoy va **Entregar plaza** (que además no es fichar la salida), y explican el mise solo con carga de números, sin Modo Control. Se detectó al escribir la hoja instructiva nueva (`docs/ops-modo-control-una-hoja.html`), que documenta el flujo correcto: hoy los dos materiales juntos se contradicen. Decidir si el manual largo se actualiza o se reemplaza por hojas por pantalla (skill `hoja-instructiva`).

### Demo El Rescoldo — menú duplicado
Dos filas en `menus` con nombre "Noche de Asado - Día del Padre" y el mismo `created_at` (`e5c01d00-...d1` y `4622a73b-...`) — parecen un duplicado de seed, no algo que haya creado el usuario. Confunde el picker de "Cargar menú"/"Planificar menú" (aparece dos veces la misma opción). Revisar si conviene borrar una y sus tareas asociadas de junio.

### Marco "juego cercado" — 3 features derivadas (PLAN-JUEGO-CERCADO-2026-08.md)
Fundamento conceptual externo (memoria de Claude Code: `project_fundamento_juego_cercado`) tradujo a 3 features scopeadas: **F1** lectura del servicio en `cierres_turno` (percepción + notas junto al dato duro, hoy el cierre solo guarda inventario) — mejor relación esfuerzo/diferenciación, arrancar por acá; **F2** historial de cambios en fichas técnicas (autor/fecha, hoy `useRecetas` actualiza sin dejar rastro); **F3** bandeja de propuestas visible (depende de F2, más ambigua, scopear en la sesión). Sesión aparte con Sonnet.

### Kitchen Coach — asistir activamente en el editor de Carta
Hoy el Coach solo responde preguntas de navegación; el pedido es que ayude a cargar el menú abierto en `ComposicionEditor`. El pipeline de tool-use ya funciona (`crear_evento` en `app/api/coach/route.ts` ~L409 crea un evento con pasos por dictado). **Recomendado: B** — extender ese patrón con `agregar_componentes_menu(menu_id, componentes[])` que escribe a DB y el editor refresca; exige guardar el menú (aunque sea vacío) antes de pedirle al Coach que lo complete. La alternativa A (operar en vivo sobre el estado de React sin guardar) necesita un puente chat↔form que hoy no existe. Sesión aparte.

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
