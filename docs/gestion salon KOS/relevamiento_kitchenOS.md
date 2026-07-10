# Relevamiento de software de cocina para kitchenOS

> **Propósito del documento.** Insumo para diseñar una app (parte de kitchenOS) que **reemplace** la capa de cocina de los sistemas gastronómicos actuales.
> Resuelve el "diario" y la operación de cocina. **Fuera de alcance:** salón, mesas, reservas, POS de cobro, gastos, contaduría, arqueo de caja, IVA, facturación, ARCA/AFIP.
> Pensado para que Claude Code lea la **matriz de funcionalidades** (sección 4) como checklist de scope y las **carencias** (sección 5) como diferenciadores.
> Fecha de relevamiento: junio 2026. Base: documentación oficial de productos, reviews y guías de industria, integrado con un relevamiento previo (Gemini DeepResearch) del que se incorporaron el ángulo estratégico, los dolores operativos de brigada y las startups Meez/Galley/KDS.io.

---

## 1. Resumen ejecutivo

El mercado se divide en tres tipos de actores, y ninguno es "solo cocina":

1. **Suites todo-en-uno LatAm** (Fudo, Maxirest, Bistrosoft, Justo, OlaClick): la cocina es un **módulo adicional** ("Monitor de Cocina / KDS", "Kitchen", "Bistro Cocina") que se vende encima del POS. La cocina es ciudadana de segunda: hereda el modelo de datos del POS, casi no tiene analítica de cocina, y depende de que el salón "comande" para existir.
2. **KDS especializados globales** (Fresh KDS, Toast KDS, Square KDS, Oracle/Micros, Cegid Revo, Rezku sKDS): mucho más ricos en la operación de pantalla (recall, all-day, coursing, speed-of-service), pero siguen siendo **receptores** del POS. No tocan recetas ni prep.
3. **Back-of-house / producción** (Apicbase, Parsley, Supy, FusionPrep, Mise, CrunchTime): recetas, escandallos, prep lists, par levels, teórico-vs-real, mermas. Es la capa más profunda y la **menos cubierta por los jugadores LatAm**.

**Implicancia para kitchenOS:** el hueco real no está en "mostrar comandas en una pantalla" (eso es commodity). Está en **unir el flujo de servicio (KDS) con la producción (prep/recetas/par/mermas) en un solo modelo operativo de cocina**, algo que hoy exige pegar dos categorías de producto distintas. Reemplazar el módulo de cocina de una suite LatAm es alcanzable; superarlo es fácil porque esos módulos son delgados.

**Ángulo estratégico (el sesgo de diseño a explotar):** casi todos estos sistemas fueron diseñados por ingenieros o administradores **para el dueño o el mánager de salón**, no para la brigada que pasa 8 horas de pie en el despacho con las manos sucias. La cocina termina siendo un apéndice del sistema contable/de ventas. kitchenOS gana si invierte ese sesgo: **producto pensado primero para el cocinero en el apuro**, no para el reporte de gerencia. Esto define tanto el scope (sección 4) como las decisiones de UI (sección 5).

---

## 2. Glosario operativo (vocabulario de la industria)

Términos que aparecen como features estándar y que conviene adoptar como lenguaje del dominio:

- **Comanda / ticket / chit:** unidad de pedido que entra a cocina. Compuesta por ítems + modificadores.
- **Bump:** marcar un ítem/comanda como terminado y sacarlo de pantalla. **Bump bar:** teclado físico para hacerlo.
- **Recall:** recuperar una comanda ya "bumpeada" (p. ej. el cliente reclama). Feature muy valorada.
- **All-day (vista all-day):** conteo total de cada ítem sumando todas las comandas abiertas (p. ej. "8 bifes en total"). Permite batch cooking sin hacer cálculo mental.
- **Coursing / course firing:** disparar tiempos por tiempo de comida (entrada → plato principal → postre) para que salgan en secuencia.
- **Marchado / firing:** orden en que se mandan a preparar los platos para que todos salgan juntos.
- **Ticket time / SLA:** tiempo que lleva una comanda activa. Se colorea (verde/amarillo/rojo) según umbrales.
- **Speed of service:** métricas de velocidad y consistencia de cocina (promedio de ticket time, % a tiempo).
- **Estación / partida:** parrilla, fríos, postres, barra, pase. Cada comanda se rutea por estación.
- **Expedidor / pase (expo):** quien coordina que toda la mesa salga junta.
- **86 / faltante:** producto que se agotó y hay que sacar de la carta. "86'ear" = dar de baja.
- **Receta / ficha técnica / escandallo:** ingredientes, cantidades, rendimiento (yield), pasos. Base del descuento de stock.
- **Sub-receta:** preparación intermedia (salsa, masa) que se usa dentro de otras recetas.
- **Prep list / production sheet / par sheet:** lista de tareas de preparación previas al servicio (mise en place).
- **Par level:** cantidad objetivo a tener prepada de cada ítem. `A prepar = Par − Stock actual`.
- **Teórico vs real:** consumo que *debería* haber según recetas+ventas vs. lo que *realmente* se consumió (inventario). La diferencia revela mermas, robo hormiga, mal porcionado.
- **Merma / waste / desperdicio:** producto perdido por spoilage, sobreproducción o error.

---

## 3. Desglose funcional por producto

Leyenda de cobertura del **núcleo cocina**: ✅ sólido · 🟡 parcial/básico · ❌ no lo hace · — fuera de su producto.

### 3.1 Suites todo-en-uno (LatAm) — los que kitchenOS apunta a reemplazar

#### Fudo (Argentina · LatAm)
- **Qué es:** POS cloud, sin hardware especializado, corre en cualquier dispositivo (Windows/Mac/Linux, tablet, celular). Cocina = módulo "Monitor de Cocina (KDS)" **de pago adicional**.
- **KDS:** ✅ comandas en tiempo real; tiempos estimados por producto/categoría con estados "a tiempo / demorado / muy demorado"; alertas sonoras; filtros por tipo de cocina (barra/cocina/sin asignar) y por estado (pendiente/en preparación/terminado); avance ítem-por-ítem o "preparar todo → terminar todo"; notificación al mozo cuando el plato está listo.
- **Ruteo por estación:** 🟡 vía asignación de "cocina/barra" a cada producto; granularidad limitada (no estaciones arbitrarias múltiples).
- **All-day / coursing / recall:** ❌ no documentados.
- **Recetas/escandallo:** 🟡 ingredientes por producto, descuenta stock; foco en costo, no en ficha técnica operativa con pasos/fotos.
- **Stock desde consumo:** ✅ descuento por receta al vender; alertas de stock bajo.
- **Prep list / par:** ❌.
- **Mermas:** 🟡 vía carga manual de gastos/ajustes.
- **Métricas de cocina:** ❌ (las métricas son de ventas, no de productividad por estación).
- **Plataforma/precio:** SaaS por suscripción; KDS es add-on.
- **Queja recurrente reportada:** soporte lento en horas pico; carga manual repetitiva de adicionales (no se puede copiar selección previa).

#### Maxirest (Argentina)
- **Qué es:** suite gastronómica madura (+25.000 clientes declarados), módulo principal **sobre Windows**; cocina = app **"Maxirest Kitchen"** (Android).
- **KDS:** ✅ "Kitchen" muestra comandas digitales; ordena los platos de **mayor a menor tiempo de cocción** estableciendo orden de marchado (diferenciador real frente a Fudo); avisos por color y parpadeo; comandas no se pierden de pantalla.
- **Ruteo por estación:** 🟡.
- **All-day / coursing / recall:** ❌ documentados; el "orden de marchado" es lo más cercano.
- **Recetas/escandallo:** ✅ "recetas de artículo" y "recetas de insumo" (sub-recetas), control de costo y consumo por plato.
- **Stock desde consumo:** ✅ descuento automático por elaboración; informes de stock actual y a reponer; alertas de mínimos.
- **Prep list / par:** 🟡 informes "a reponer" se acercan a par, pero no es una prep list de cocina.
- **Soluciones verticales:** sushi (conteo de piezas), heladería, fast food, pizzas/empanadas (pre-elaboración, control de bollos).
- **Offline:** ✅ uso offline declarado.
- **Plataforma/precio:** licencia + módulos; requiere PC Windows; Kitchen y Menú Digital como servicios.

#### Bistrosoft (Argentina · México · España)
- **Qué es:** plataforma cloud modular; cocina = módulo **"Bistro Cocina"** (licencia adicional).
- **KDS:** ✅ todas las órdenes con productos de categorías marcadas "para cocina"; **confirmación de recepción** (punto azul por si se corta conexión/batería) — feature de resiliencia interesante; **agrupación por estado** (en preparación vs despachadas); impresión automática de **cancelaciones** a cocina; comandas cobradas visibles 1h.
- **Ruteo por estación:** 🟡 por categoría marcada para imprimir en cocina/barra.
- **All-day / coursing / recall:** ❌.
- **Recetas/escandallo:** ✅ recetas, escandallos y costo por plato; ingeniería de menú.
- **Stock desde consumo:** ✅ descuenta insumos por venta; registra mermas; alertas de agotamiento; auditoría de eliminaciones.
- **Prep list / par:** ❌.
- **Mermas:** ✅ registro de mermas y desperdicios mencionado explícitamente.
- **Plataforma/precio:** suscripción mensual; módulos (Tienda Online, Bistro Cocina, Autoservicio, Móvil, Salón).

#### Justo / OlaClick (LatAm, foco delivery/dark kitchen)
- **Qué es:** software con IA orientado a venta directa y dark kitchens; cocina presente pero secundaria a delivery.
- **KDS:** 🟡 coordinación de pedidos/cocina/servicio; foco en centralizar canales de delivery.
- **Recetas/stock:** 🟡 control de inventario con proveedores, costos, mermas (a alto nivel).
- **Relevancia para kitchenOS:** muestran el patrón "multi-marca desde una cocina" (virtual brands), un caso de uso que kitchenOS debería contemplar nativamente.

**Patrón común de las suites LatAm (clave):** la cocina **no tiene modelo de datos propio** — es una vista del ticket del POS. No hay prep list, ni par, ni all-day, ni recall, ni coursing, ni métricas de productividad de cocina. El stock se descuenta por receta pero el **teórico-vs-real** (la pregunta cara) no está resuelto.

### 3.2 KDS especializados (globales) — referencia de "cómo se hace bien la pantalla"

#### Fresh KDS (EE.UU., el más rico en features de pantalla)
- **KDS:** ✅✅ el set más completo: auto-ordenamiento por prep/pickup time; **prioridad** (marcar órdenes críticas al frente); **recall** de órdenes y de ítems individuales; **hold** (pausar órdenes hasta que toque prepararlas, reduce clutter); umbrales de tiempo verde/amarillo/rojo por tipo de orden; sonidos configurables.
- **All-day:** ✅ totales de ingredientes en tiempo real across todas las órdenes abiertas (batch prep sin cálculo mental); tap en el summary bar para resaltar todas las instancias de un ítem.
- **Coursing:** ✅ actualiza estados de tiempo desde el POS.
- **Modificadores/alérgenos:** ✅ estilado por keyword (color, negrita, itálica) para que alérgenos/pedidos especiales resalten.
- **Multi-pantalla:** ✅ sync de bumps y strikethrough entre pantallas, o flujo "mandar de una pantalla a otra al bumpear".
- **Métricas (speed of service):** ✅ "On The Fly": ticket times promedio, órdenes despachadas, breakdown a-tiempo/precaución/tarde, ventanas de 15/30 min, tendencias históricas — **desde el celular**.
- **Cliente:** ✅ notificaciones por SMS al cliente; pantalla customer-facing de estado.
- **Vistas:** Classic (rail tipo papel), Tiled, Split por tipo de orden, Take-Out.
- **Plataforma:** corre en cualquier tablet iOS 13+/Android 7+; modelo freemium → planes por pantalla; impresión de tickets/labels.
- **No hace:** ❌ recetas, prep, stock, costo. Es puro flujo de servicio.

#### Toast KDS (EE.UU.)
- **KDS:** ✅✅ considerado el más robusto del mercado; quiebre por estación y por tipo de orden; organiza órdenes de terceros (delivery) en la misma pantalla; hardware grado cocina (calor/humedad/grasa); fuentes y tamaños configurables.
- **Limitación de modelo de negocio:** ⚠️ obliga a usar el POS y procesamiento de pagos de Toast, con contrato de 2 años; inventario/proveedores vía integración de terceros. (Lección para kitchenOS: el lock-in del POS es un dolor; ser POS-agnóstico es ventaja competitiva.)

#### Square KDS / Oracle (Micros) / Cegid Revo / Rezku sKDS
- **Square KDS:** ✅ básico-sólido, Android, desde ~USD 20–30/mes por dispositivo; requiere suscripción Square. Reemplaza papel; flexible.
- **Oracle Express Station / Simphony:** hardware industrial (IP-54, alta temperatura, soundbar con micrófonos); cook timings predefinidos que desglosan cada orden y alertan ticket times excedidos. Enterprise.
- **Cegid Revo KDS:** ✅ pantallas **por partida** (cada estación ve solo lo suyo), fichaje de entrada/salida del personal en la misma pantalla, KDS central que reparte tareas a KDS secundarios, DDS (display de pedidos listos para recogida).
- **Rezku sKDS:** bump-to-station / bump-to-printer (cadena de montaje: terminar prep dispara el siguiente paso), vistas flexibles, all-day. Software-first sobre tablets/iPads.

**Lección transversal de KDS:** el estándar de pantalla ya está muy resuelto y commoditizado. Diferenciarse *solo* en KDS es difícil. El valor está en conectar KDS ↔ producción.

### 3.3 Back-of-house / producción / recetas — la capa profunda y poco cubierta en LatAm

#### Apicbase (Bélgica · enterprise multi-sitio)
- **Recetas:** ✅✅ librería cloud estructurada (ingredientes, yields, porciones, pasos), sub-recetas, alérgenos/nutrición automáticos, AI para estandarizar recetas desde material desordenado.
- **Costo de plato:** ✅ costo y margen automáticos; simulación de sustituciones y su impacto en food cost.
- **Producción:** ✅ planes de producción y **BOMs** (bill of materials) de un click; cantidades exactas para prep y batch.
- **Stock/teórico-vs-real:** ✅✅ el núcleo: recetas definen consumo teórico, POS aporta ventas reales, inventario aporta consumo real → **varianza por sitio/ingrediente/receta**. Conteo por voz, scanner de barcode, modo offline.
- **Compras:** ✅ sugerencias de pedido, matching de facturas, forecast de demanda por estacionalidad.
- **Precio/target:** desde ~USD 160/mes; multi-sitio, hoteles, ghost kitchens, cocinas centrales.
- **No hace:** ❌ KDS / flujo de servicio en vivo. Es back-office, no la línea.

#### Parsley (EE.UU.)
- **Recetas:** ✅ costo, precio, escalado; ve impacto de cambios en el margen al instante; labels USDA, alérgenos.
- **Producción:** ✅✅ desde recetas + forecast/eventos genera **prep lists y planes de producción con cantidades exactas**; timings de producción; tiempos estandarizados.
- **Inventario:** ✅ por ubicación, shelf-to-sheet; compras por par o por forecast restando inventario.
- **Permisos:** read-only para cocina, operaciones para producción/compras, inventory-only.

#### Supy (Medio Oriente · multi-cadena)
- **Recetas:** ✅ par y mínimos por inventario para sub-recetas (sauces, etc.); pasos con fotos de preparación y de presentación; análisis de costo.
- **Inventario/menú engineering:** ✅ enfocado en cortar costos en cadenas; flujo de datos entre módulos de BOH.

#### FusionPrep / Mise (trymise) / CrunchTime / FoodPro
- **FusionPrep:** ✅ app dedicada **solo a prep lists y pars** (configurar pars, cargar recetas, ejecutar la lista). Muestra que hay mercado para una herramienta de prep enfocada.
- **Mise (trymise):** suite que integra **KDS Prep** + recetas (sub-recetas, nutrición USDA) + POS — uno de los pocos que intenta unir prep y KDS.
- **CrunchTime:** enterprise tradicional; sugerencias IA de cantidades de prep/pedido según consumo histórico, pars y on-hand; temperaturas; analítica de food cost y labor. Queja: lento para cambios, producto "estancado".
- **FoodPro (Aurora):** forecast por histórico de comensales, planes de producción, costo de meal-prep.

### 3.4 Food safety / checklists / temperaturas (adyacente al núcleo)
- **Jolt (EE.UU., app tablet):** listas de tareas por turno, control de temperaturas (HACCP), impresión de **etiquetas de caducidad**. ✅ bueno en tareas y compliance, pero **no conecta el inventario con el consumo de recetas** — está aislado del flujo de cocina. Muy enfocado en compliance.
- **FoodDocs:** checklists digitales de prep, logs de temperatura, HACCP, matriz de alérgenos automática.
- **Relevancia para kitchenOS:** esta capa de compliance operativa (temperaturas, caducidades, tareas) es adyacente y absorbible — **no es salón ni administración fiscal**. Jolt demuestra que hay demanda, pero su debilidad (aislamiento del inventario/recetas) es justo lo que kitchenOS resolvería al tenerlo en el mismo modelo.

---

## 4. Matriz de funcionalidades (checklist de scope para kitchenOS)

Clasificación: **P0 = estándar de industria, obligatorio para reemplazar** · **P1 = esperado en productos buenos, diferenciador medio** · **P2 = diferenciador alto / hueco poco cubierto**.

### Flujo de servicio (KDS)
| Feature | Prioridad | Cubierto por suites LatAm | Cubierto por KDS globales |
|---|---|---|---|
| Recepción de comanda en tiempo real | **P0** | ✅ | ✅ |
| Ítems + modificadores + notas | **P0** | ✅ | ✅ |
| Ruteo por estación/partida | **P0** | 🟡 (por categoría) | ✅ |
| Estados de comanda (pendiente/en prep/listo) | **P0** | ✅ | ✅ |
| Bump ítem individual y comanda completa | **P0** | ✅ | ✅ |
| Ticket time con colores por umbral (SLA) | **P0** | 🟡 (Fudo sí) | ✅ |
| Alertas sonoras / visuales config. | **P0** | ✅ | ✅ |
| Aviso a salón cuando el plato está listo | **P1** | ✅ (Fudo/Bistro) | ✅ |
| **Recall** (recuperar comanda bumpeada) | **P1** | ❌ | ✅ |
| **All-day** (conteo total por ítem) | **P1** | ❌ | ✅ |
| **Hold / fire** (pausar y disparar prep) | **P1** | 🟡 (Maxirest "marchado") | ✅ |
| **Coursing** (secuencia por tiempos) | **P2** | ❌ | ✅ (Fresh/Toast) |
| Estilado de modificadores/alérgenos | **P2** | ❌ | ✅ (Fresh) |
| Multi-pantalla con sync / bump-to-station | **P1** | ❌ | ✅ |
| Confirmación de recepción (anti pérdida) | **P2** | 🟡 (Bistro) | 🟡 |
| Impresión de cancelaciones a cocina | **P1** | ✅ (Bistro) | 🟡 |
| **Sincronización de marcha** (avisar "empezar guarnición" según tiempo de la proteína) | **P2** | ❌ | ❌ (hueco) |

### Producción / preparación
| Feature | Prioridad | Suites LatAm | BOH globales |
|---|---|---|---|
| Recetas / fichas técnicas con pasos | **P0** | 🟡 (foco costo) | ✅ |
| Sub-recetas | **P1** | 🟡 (Maxirest) | ✅ |
| Fotos de preparación y presentación | **P2** | ❌ | ✅ (Supy) |
| **Prep list / production sheet** | **P1** | ❌ | ✅ (Parsley/FusionPrep) |
| **Par levels** (`a prepar = par − stock`) | **P1** | 🟡 ("a reponer") | ✅ |
| Escalado de recetas / batch | **P1** | ❌ | ✅ |
| Forecast de prep por ventas/histórico | **P2** | ❌ | ✅ (CrunchTime/Apicbase) |
| **Prep list viva** (recalcula mid-service ante pico de venta) | **P2** | ❌ | ❌ (hueco) |
| **Ficha dinámica por yield real del día** (no el teórico de oficina) | **P2** | ❌ | 🟡 |
| BOM de producción | **P2** | ❌ | ✅ (Apicbase) |

### Stock / costos operativos de cocina
| Feature | Prioridad | Suites LatAm | BOH globales |
|---|---|---|---|
| Descuento de stock por receta al vender | **P0** | ✅ | ✅ |
| Alertas de stock bajo / a reponer | **P0** | ✅ | ✅ |
| Registro de **mermas / desperdicio** | **P1** | 🟡/✅ (Bistro) | ✅ |
| **Carga de merma a un toque** (reportar porción quemada sin entrar a 3 menús) | **P2** | ❌ | ❌ (hueco) |
| **Teórico vs real** (varianza de consumo) | **P2** | ❌ | ✅✅ (Apicbase) |
| Conteo rápido (scanner/voz) | **P2** | ❌ | ✅ (Apicbase) |
| Costo de plato / food cost en vivo | **P1** | 🟡/✅ | ✅ |

### Comunicación, faltantes y métricas
| Feature | Prioridad | Suites LatAm | KDS/BOH globales |
|---|---|---|---|
| Gestión de **86 / faltantes** y aviso a salón | **P1** | ❌ explícito | 🟡 |
| **86 bidireccional automático** (cocina canta 86 → webhook bloquea en POS todos los platos que usan ese insumo) | **P2** | ❌ | 🟡 (Fresh bloquea ítem) |
| Alérgenos / dietas / trazabilidad | **P1** | ❌ | ✅ (Apicbase) |
| **Métricas de cocina** (speed of service, productividad por estación) | **P2** | ❌ | ✅ (Fresh "On The Fly") |
| Notificación de estado al cliente | **P2** | 🟡 (tienda online) | ✅ (Fresh) |
| Modo **offline** / resiliencia | **P1** | 🟡 (Maxirest) | ✅ |
| Multi-marca / virtual brands desde una cocina | **P2** | 🟡 (Justo) | 🟡 |

---

## 5. Carencias y oportunidades (los diferenciadores de kitchenOS)

Ordenadas por tamaño de hueco × valor:

1. **Unir KDS ↔ producción en un solo modelo (el hueco mayor).** Hoy o tenés un KDS bueno (Fresh) sin recetas, o un BOH bueno (Apicbase) sin línea en vivo. **Nadie en LatAm une "lo que pasa en la línea ahora" con "lo que hay que prepar hoy" y "cuánto sobró/faltó".** kitchenOS puede ser el sistema operativo que cierre ese loop: ventas → consumo real en la línea → ajuste de par/prep → merma. Concretamente: cruzar el consumo en vivo del KDS contra el stock crítico de la estación y **generar tareas de batch cooking de emergencia antes de que la estación colapse**.
2. **Fricción táctil — el problema de las manos sucias (dolor de UI, no de features).** Las tablets fallan con harina, grasa y humedad; por eso EE.UU. usa bump bars físicos. La brigada **odia** las interfaces pensadas para oficina. Decisión de diseño de kitchenOS: botones masivos, áreas de swipe amplias, confirmaciones visuales de alto contraste, **cero menús desplegables durante el despacho**. Esto no es estética: es la razón #1 por la que el software actual se siente ajeno a la cocina. Es un diferenciador que no requiere features nuevas, solo disciplina de UI.
3. **El "86" burocrático.** En Fudo/Maxirest, si la cocina se queda sin un insumo, el chef avisa al salón y un encargado entra a pausar el producto. Dolor real. kitchenOS necesita un **"botón de pánico 86"** en la estación que dispare un webhook y deshabilite el ítem en el FOH al instante — y que bloquee automáticamente *todos* los platos que usan ese insumo, sin pasar por el mánager.
4. **El divorcio entre prep list y servicio.** Apicbase te dice qué preparar a la mañana; Toast te dice qué despachar a la noche; **ninguno conecta ambas cosas**. La **prep list viva** que se recalcula si a mitad del servicio un producto tiene un pico de venta inesperado es un hueco puro.
5. **Teórico-vs-real accesible para el local chico.** Apicbase lo hace pero es enterprise (USD 160+/mes, multi-sitio). Las suites LatAm no lo hacen. Hueco enorme: el dueño que sospecha "robo hormiga" no tiene herramienta a su escala. (Bistrosoft lo insinúa como gancho de venta pero no lo resuelve a fondo.)
6. **Sincronización de marcha.** Avisos de "empezar a marchar la guarnición" calculados a partir del tiempo de cocción de la proteína principal, para que todo el plato salga junto. Maxirest ordena por tiempo de cocción pero nadie lo lleva a avisos activos de marcha. Hueco fino y muy valorado por la brigada.
7. **Fichas dinámicas por yield real.** Ajustar la receta según el rendimiento real del día (lo que efectivamente rindió la caja de tomates hoy), no el yield teórico de oficina. Cierra la brecha entre la ficha y la realidad de la estación.
8. **Prep list / par dinámico nativo.** Las suites LatAm directamente no lo tienen. Es P1 y barato de construir bien; genera adherencia diaria (el cocinero lo abre cada mañana).
9. **Métricas de productividad de cocina.** Las suites miden ventas, no cocina. "Speed of service por estación" (Fresh) no existe en LatAm. Diferenciador de management.
10. **Resiliencia offline + confirmación de recepción.** La cocina no puede depender del wifi. Bistro (punto azul) y Maxirest (offline) lo reconocen; es un must que muchos KDS cloud descuidan. **Offline-first es feature de venta en cocina.**
11. **Multi-marca / dark kitchen nativo.** El crecimiento del modelo virtual-brand (varias marcas, una cocina, comandas codificadas por color/impresora) está mal resuelto: hoy se hace con "una tablet/impresora por marca". Un KDS que rutee multi-marca nativamente es oportunidad.
12. **POS-agnóstico (anti lock-in).** Toast obliga a su POS con contrato de 2 años; las suites LatAm encierran la cocina en su ecosistema. Una cocina que se conecte a *cualquier* salón es atractiva — **y a la vez es tu puente de transición para ir reemplazando** (ver sección 7).

---

## 6. Startups emergentes y tendencias a observar

- **Meez:** la mejor herramienta actual para **recetarios y escandallos colaborativos**. Su motor de conversión de unidades de cocina (volumen ↔ peso con densidades específicas por ingrediente) es su diferencial técnico — resuelve bien un problema que casi todos hacen mal. Referencia obligada para el módulo de recetas de kitchenOS.
- **Galley Solutions:** se autodefine "Culinary OS". Su insight es que **el dato base no es la venta, es el inventario culinario**; fuerte en planificación de producción y trazabilidad. Competidor conceptual directo a la visión de kitchenOS — vale la pena estudiar su modelo de datos.
- **KDS.io / enfoques open source:** proyectos de **arquitectura abierta** que buscan desacoplar la pantalla de cocina del yugo del POS. Relevantes como referencia de arquitectura POS-agnóstica y como señal de que el lock-in es un dolor reconocido.

- **IA en prep/forecast:** CrunchTime y Apicbase ya sugieren cantidades de prep/pedido por histórico+pars+on-hand. Tendencia clara: la prep list deja de ser estática y pasa a ser predicha. kitchenOS debería nacer con este enganche.
- **IA de toma de pedidos (voz/WhatsApp) → cocina:** Restobot, FoodShot AI: asistentes que toman el pedido por voz/chat y lo mandan a la impresora/KDS. Relevante como **fuente de comandas** a integrar.
- **Conteo de inventario por voz** (Apicbase): "pollo, tres bandejas" → actualiza stock. Reduce la fricción del conteo, históricamente el paso más odiado.
- **Robótica de línea** (Flippy, Spyce): aún marginal, pero define una posible API futura (kitchenOS como orquestador de estaciones, algunas robotizadas).
- **Mise (trymise):** uno de los pocos que intenta nativamente KDS+prep+recetas — competidor conceptual directo a vigilar.
- **Justo / OlaClick:** los referentes LatAm de la ola "IA + dark kitchen + delivery"; su debilidad es la misma (cocina secundaria al delivery).
- **Deliverect / middleware de delivery:** no es cocina, pero es el conector estándar entre apps de delivery y POS/KDS; define cómo entran las comandas de delivery.

---

## 7. Integración (secundario — puente de transición)

Cómo reciben hoy las comandas los sistemas, útil para **convivir mientras se reemplaza**, no como foco:

- **Vía POS nativo (suites):** la comanda nace en el POS de la suite y "aparece" en su módulo de cocina. Cerrado; para reemplazar hay que sustituir el módulo entero.
- **Vía API/integración oficial (KDS globales):** Fresh KDS se conecta a Square, Lightspeed, Qu, etc. Toast solo a Toast. Square solo a Square. Patrón: integraciones uno-a-uno mantenidas por el KDS.
- **Vía impresora virtual (el "truco sucio" universal — el Caballo de Troya):** muchos KDS se insertan emulando una impresora de comandas y parseando el ticket. Es el camino más rápido para **interceptar comandas de un POS que no tiene API**, y la jugada de entrada de kitchenOS: los POS tradicionales (Fudo, Maxirest, Bistrosoft) mandan las comandas por red local en protocolo **ESC/POS** o vía webhooks a las tickeadoras de cocina. kitchenOS necesita un **listener/middleware en el backend** (p. ej. en Next.js) que intercepte esa orden, la **parsee** (texto/JSON → datos estructurados) y la inyecte en sus tablas. El salón sigue usando su POS de siempre, cree que está mandando a imprimir un papel, pero en realidad está alimentando el KDS de kitchenOS. Una vez dentro, se va desplazando al resto del módulo.
- **Vía middleware de delivery:** Deliverect y similares centralizan PedidosYa/Rappi/Uber Eats hacia el POS/KDS.

**Recomendación de transición:** soportar entrada por (a) impresora virtual/parseo de comanda (para entrar en locales con suites cerradas sin pedirles que cambien el POS de golpe) y (b) API directa donde exista. Eso permite que kitchenOS conviva como "solo cocina" y vaya comiéndose el resto del módulo.

---

## 8. Modelo de datos sugerido (derivado del relevamiento, para Claude Code)

Entidades mínimas que todos los sistemas comparten implícitamente y que kitchenOS necesita:

- **Comanda** (`id`, origen [salón/mostrador/delivery/marca], `mesa?`, `timestamp`, estado, `course?`, marca/virtual-brand).
- **ÍtemComanda** (`id`, comanda_id, producto_id, cantidad, estado [pendiente/en_prep/listo/bumpeado], estación, `fired_at`, `bumped_at`).
- **Modificador** (item_id, tipo [con/sin/extra], texto, flag_alérgeno).
- **Producto** (id, nombre, categoría, estación_default, tiempo_estimado).
- **Receta** (producto_id, lista de IngredienteReceta, rendimiento/yield, pasos[], fotos[]) + **SubReceta** (receta anidada).
- **IngredienteReceta** (receta_id, insumo_id, cantidad, unidad).
- **Insumo/Stock** (id, nombre, unidad, stock_actual, par_level, mínimo).
- **Estación** (id, nombre [parrilla/fríos/postres/pase/barra], pantalla_asignada).
- **PrepTask** (insumo/sub-receta, par, stock_actual, `a_prepar = par − stock`, asignado_a, estado).
- **Merma** (insumo_id, cantidad, motivo [spoilage/sobreproducción/error], timestamp).
- **EventoCocina** (para métricas: item_id, evento [fired/bumped/recalled], timestamp → deriva ticket_time, speed-of-service).

Relaciones clave para el "loop" diferenciador: `Venta → ÍtemComanda → Receta → Insumo (descuento)` define el **teórico**; `Conteo de inventario → Insumo` define el **real**; la varianza vive en la diferencia. `EventoCocina` alimenta las métricas que las suites LatAm no tienen.

---

## 9. Fuentes consultadas

Documentación oficial: Fudo (fu.do, soporte/blog), Maxirest (maxirest.com / .com.ar / ayuda), Bistrosoft (bistrosoft.com), Fresh KDS (fresh.technology), Square KDS (squareup.com), Oracle Food&Beverage, Cegid Revo, Apicbase (get.apicbase.com), Parsley (parsleysoftware.com), Supy (supy.io), FusionPrep, Mise (trymise.com), Justo (getjusto.com), Hosteltáctil, OlaClick.
Guías de industria y reviews: QuickBuy (KDS guide 2026), Rezku, WebstaurantStore (prep lists / KDS), Fit Small Business (best KDS), Capterra (Apicbase), GetApp (Fudo), ClickUp (food management software), Chefs-Resources (prep sheets), FoodDocs.
Tendencias: blog Fudo (tendencias 2025), FoodShot AI, Restobot, Menttoriza (robótica/IA).

> Nota: precios, módulos y features cambian seguido; verificar contra la web oficial antes de decisiones de producto. Datos a junio 2026.
