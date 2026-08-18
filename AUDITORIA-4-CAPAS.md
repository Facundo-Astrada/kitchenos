# Auditoría de cobertura — K-OS sobre las 4 capas

**Fecha:** 18/08/2026
**Método:** las 8 funciones del Cuadro de Cuatro Capas × Definir · Preparar · Ejecutar · Controlar, contrastadas contra el código real (no contra `ESTADO-ACTUAL.md`).
**Base de conocimiento:** `SINTESIS-ORGANIZACION-GASTRONOMICA.md` en `~/Desktop/START UP KOS/06-contexto-gastronomia/`.

Leyenda: ✅ cubierto · 🟡 a medias · 🔷 desviado (existe con criterio distinto al canónico) · ⬜ no cubierto

---

## 0. El hallazgo de fondo

**K-OS es un producto de Ejecutar y Preparar. Definir casi no existe, y por eso Controlar rinde a media máquina aunque tenga once tabs de reportes.**

| Capa | Cobertura | Lectura |
|---|---|---|
| **Definir** | ~25 % | Casi no hay estándares configurables. No hay stock máximo, ni calidad de recepción, ni merma esperada, ni estructura de presupuesto, ni objetivos de venta. Lo único que se define hoy es food cost objetivo, plazas, puestos y permisos. |
| **Preparar** | ~70 % | Fuerte. Mise en place, planificación, pedidos, calendario, activación de menús. El hueco es la sugerencia de compra. |
| **Ejecutar** | ~90 % | Muy fuerte, y en varios puntos por encima de lo que describe el material. Mise, pase, KDS, muro, salón, comandas, merma. |
| **Controlar** | ~45 % | Hay 11 tabs de reportes, pero controlan **resultado**, no **desvío contra estándar**. Sin la capa Definir cargada, no hay contra qué comparar. |

El ciclo de las cuatro capas hoy está **abierto**: se prepara, se ejecuta y se mide — pero no se compara contra un estándar declarado ni se realimenta al estándar. La flecha de retroalimentación no existe en el producto todavía.

Esto tiene una consecuencia comercial directa: **la mayoría de los reportes contestan "cuánto pasó" y casi ninguno contesta "¿está bien o mal?"**. La segunda pregunta es la que un dueño paga.

---

## 1. La matriz

### Stock

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | 🟡 | Hay `stock_minimo` y `stock_critico` (este último ya no se muestra en pantalla, queda en 0). **No hay `stock_maximo` ni stock de seguridad.** El material define tres niveles y da la fórmula del de seguridad: mínimo + 25 %. Sin máximo no hay techo de compra de perecedero. | `.claude/docs/columnas.md` · grep `stock_maximo` → 0 resultados |
| Definir | ⬜ | **Sin estándar de calidad por producto.** El material pide definir tamaño, maduración, grasa, % de merma, color y aroma aceptables. Sin eso, "verificar la calidad al recibir" no tiene contra qué. | `productos` no tiene columnas de estándar |
| Preparar | 🟡 | Conteo por sector con `stock_sectores.ultimo_conteo_at` y modo rápido de conteo: cubre bien el inventario cíclico. **No hay sugerencia de compra.** | `useStockSectores.ts`, `useStock.ts` |
| Ejecutar | 🟡 | Recepción parcial con `cantidad_recibida` — la diferencia numérica sí queda. Falta el resto del protocolo de 7 pasos: control de horario de entrega, foto, remito firmado. | `usePedidos.ts:164-195` |
| Controlar | 🟡 | Hay merma con costo estimado y descuento de `stock_actual`, y tab Auditoría en Reportes. **No hay cotejo de baja de inventario contra facturación de ventas**, que es la detección de fuga que el material marca como existencial: *"una fuga de inventarios instalada puede quebrar el negocio en poco tiempo"*. | `useMerma.ts`, `reportes/page.tsx` |

### Carta y fichas técnicas

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | ✅ | Los 4 niveles del material están: producción y bases (recetas + subrecetas), platos finales (`carta_items` + `plato_recetas`), y cafetería/coctelería entran por el mismo modelo. Foto, peso total y escurrido, vida útil, tags dietarios. | `types/index.ts:75-90`, `columnas.md` |
| Definir | 🟡 | **`merma_pct` se aplica al peso, no al costo — y está bien así.** Se usa en `calcPesoPorcion` y `calcPesoNetos` para derivar peso neto por porción; no entra al costo porque la convención es que `cantidad` ya es **bruto** (comentario en `useRecetas.ts:56`). Aplicarlo también al costo duplicaría la merma. **No es un campo muerto ni un bug: es una convención documentada.** Lo que sí falta es merma **esperada por producto** (la tabla del material) para poder decir si la merma real es normal o es fuga. | `recetario/[id]/page.tsx:32-48`, `useRecetas.ts:56` |
| Definir | 🟡 | El costo de plato es **solo materia prima**. El material define costo = materias primas + mano de obra directa + producción indirecta (energía), y para delivery suma descartables. `equipo_miembros.costo_hora` existe pero se usa en Reportes, nunca por receta. **Decisión pendiente, no bug**: el food cost estándar de la industria también es solo materia prima. | grep `mano_de_obra\|costo_energia` → 0 resultados |
| Preparar | ⬜ | **No hay fichas en blanco imprimibles para validar a mano.** El material describe el flujo exacto: imprimir en blanco, completar una por una en la cocina, validar cantidades/procesos/mermas, después digitalizar. Es un onboarding de datos que hoy no existe. | — |
| Ejecutar | ✅ | La ficha es referencia real en el momento: carta pública QR, panel OPS, componentes con gramaje por porción. | módulo 3 y 8 |
| Controlar | ✅ | Rentabilidad → Salud detecta sin receta vinculada, margen negativo, en 86, sin categoría. Reprecio con guardarraíl para FC > 200 %. | `carta/page.tsx:2352-2358` |

### Mise en place

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | 🟡 | Par levels por recipiente, peso de porción, plazas y secciones, prioridades SP/P/REF. **Falta el orden de prioridad de 5 criterios** del material (disponibilidad → tiempo → atención → vida útil → tipo de tarea): hoy la prioridad es una etiqueta manual, no un criterio calculado. | `columnas.md` `checklist_items`, `lib/ops/mise.ts` |
| Preparar | ✅ | Por encima del material. Hoja por plaza y turno, sugerencia de producción, activación de menús con vigencia, rutinas con frecuencia, notas de plaza como contexto del turno anterior. | módulos 9 y 15 |
| Ejecutar | ✅ | **Muy por encima del material.** Modo Control, cierre que arma el pase de turno con prioridad heredada, turno vigente decidido por la entrega y no por el reloj, auto-tilde, realtime. El material describe hojas de papel; esto es una máquina de estados. | módulo 9, `lib/ops/turnos.ts`, `cierres_turno` |
| Ejecutar | ⬜ | **No hay checklist de la carta pre-servicio.** El material lo describe con precisión de spec: una hora antes de abrir, el responsable recorre partida por partida **probando** cada elaboración. El mise contesta "¿está hecho?"; esto contesta "¿está bueno?". Son dos preguntas distintas y hoy solo está la primera. | — |
| Controlar | 🟡 | Auditoría con scoring, foto obligatoria y condicionales. Avisos de cierre sin entregar. Falta el registro de qué faltó y que llegó a la mesa como "no hay". | módulo 9 |

### Pase y despacho

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | 🟡 | Estaciones KDS, `carta_items.estacion_default_id`, plazas. **No hay tiempos estándar por plato** contra los cuales medir el cronómetro del KDS. El KDS tiene umbrales, pero genéricos, no por plato. | `columnas.md` `carta_items` |
| Preparar | ✅ | Montaje del pase vía OPS, notas de plaza, repaso de faltantes. | módulos 10 y 24 |
| Ejecutar | ✅ | **Por encima del material.** KDS con bump por ítem y cola offline IndexedDB, Muro tablet con estados y dudas, pase de turno como chat continuo, comandas con modificadores. | módulos 10, 26, 28 |
| Controlar | 🟡 | Tab Rendimiento en Reportes. **Falta tiempo de estancia media en mesa** — el dato existe (Salón tiene mesas y comandas con timestamps), falta la métrica. El material lo lista entre las estadísticas de servicio. | `reportes/page.tsx:71` |

### Compras y proveedores

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | 🟡 | Proveedores con CUIT, rubro, historial. **Falta el estándar de calidad por producto y los días/horarios de entrega de cada proveedor** — que es una de las 6 entradas del cálculo de pedido. | `useProveedores.ts` |
| Preparar | 🟡 | Pedidos con productos frecuentes, WhatsApp/PDF, carrito, comparador de precios entre proveedores. **No hay sugerencia de pedido**: hay que armarlo a mano. | `usePedidos.ts`, `usePreciosProveedores.ts` |
| Ejecutar | 🟡 | Recepción parcial y reconciliación factura↔pedido. Falta el remito firmado y la foto. | `usePedidos.ts`, `useFacturas.ts` |
| Controlar | ⬜ | **No hay registro de incidencias por proveedor.** La diferencia al recibir queda en `cantidad_recibida` pero no se convierte en incidencia, no acumula, y no hay ranking de cumplimiento. El material pide explícitamente *"registrar las incidencias para poder controlar la calidad de los proveedores"* + planilla de devoluciones con concepto, fecha, importe y firma. Hay comparador de precios, que es la mitad del punteo mensual. | grep `incidencia\|devolucion` → solo motivos de merma |

### Costos y menú

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | 🟡 | Food cost objetivo configurable en Reprecio. **El presupuesto es un monto único por período** (`presupuestos: periodo, monto`) — no las 4 familias que el material controla (RRHH, alquiler, materia prima, gastos generales) ni la estructura objetivo 33/5/30/17 → 15 % EBITDA. | `columnas.md` `presupuestos`, `carta/page.tsx:2323` |
| Preparar | ✅ | Escandallo en vivo, sync de precio con facturas, detección de variación de precio, auto-link ingredientes↔stock. | módulos 3, 7 |
| Ejecutar | ✅ | Precio vigente visible en carta y salón; 86 en tiempo real. | módulos 8, 21 |
| Controlar | 🔷 | **La ingeniería de menú usa un criterio distinto al canónico.** Ver §2 — es el hallazgo más concreto de esta auditoría. | `app/(app)/carta/page.tsx:2304-2320` |
| Controlar | ✅ | CMV, Food Cost, Compras, Precios, Presupuesto vs Real, export Excel por tab. | módulo 12 |

### Equipo

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | ✅ | Puestos con nivel + plaza default + módulos, overrides individuales, permisos por rol. Cubre textualmente lo que el material pide para el control de caja: *"establecer derechos/funciones de uso a los distintos usuarios"*. | `columnas.md` `puestos`, `equipo_miembros` |
| Definir | ⬜ | **No hay objetivos de venta por persona.** El material los da concretos: +25 % postres por camarero, +25 % café, +15 % aperitivos, objetivos diarios/semanales/mensuales. | — |
| Preparar | 🟡 | Turnos y fichaje real. **Sin plan de capacitación** (el material propone una cadencia: carta mensual, evaluación mensual, roll play trimestral). | `useFichaje.ts`, `useTurnosServicio.ts` |
| Ejecutar | ✅ | Cada uno ve lo que su puesto habilita. Clock-in/out. | módulo 14 |
| Controlar | 🟡 | Dos vistas que no se hablan: `reportes/personal` mide producciones, tareas, horas y costo laboral; Reportes → Ventas ya tiene **ranking de meseros** con cantidad y ventas (`comandas.mozo_id` se llena en `useMesas.ts:75`). **Lo que falta no es el dato de ventas sino el objetivo contra el cual leerlo** (+25 % postres, +25 % café) y que las dos vistas sean una sola. Tampoco hay rotación mensual. | `useReporteVentas.ts:133-147`, `reportes/page.tsx:616`, `reportes/personal/page.tsx:90-160` |

### Coach

| Capa | Estado | Qué hay / qué falta | Evidencia |
|---|---|---|---|
| Definir | ✅ | Screen context por pantalla, tours 19/19, criterio de timing y tono. | módulo 20 |
| Preparar | ✅ | Conoce menú/evento en el mise, vigencia, plaza de control. | módulo 20 |
| Ejecutar | ✅ | Tool use agéntico: crear tarea, marcar 86, registrar merma, sugerir producción. | `app/api/coach/route.ts` |
| Controlar | ⬜ | **No se mide qué se pregunta más.** Esa lista es exactamente el ranking de pantallas que no se entienden solas. Hoy se pierde. | — |

---

## 2. Hallazgo principal — la ingeniería de menú no usa el método

`app/(app)/carta/page.tsx:2304-2320` clasifica los platos así:

```ts
const avgPop    = base.reduce((s, x) => s + x.pop, 0) / base.length      // promedio simple de unidades
const avgMargin = base.reduce((s, x) => s + x.margin, 0) / base.length   // promedio simple de márgenes
const ph = x.pop >= avgPop, mh = x.margin >= avgMargin
```

El método canónico (Kasavana-Smith, que es el que enseña el material) usa otros dos umbrales:

```
Mix ideal             = 100 % / N platos de la carta
Índice de popularidad = Mix ideal × 70 %
Popular si            Mix real ≥ Índice de popularidad

Ganancia bruta promedio = Ganancia bruta TOTAL / total de platos VENDIDOS   ← ponderado por unidades
Rentable si             GB unitaria ≥ GB promedio
```

**Las dos diferencias importan y tiran para el mismo lado:**

1. **Popularidad.** El promedio simple se infla con cualquier distribución sesgada. Si un plato se lleva el 30 % de las ventas, sube el umbral para todos los demás y demasiados platos caen del lado "poco popular". El 70 % del método es deliberadamente indulgente: dice que un plato es popular si alcanza el 70 % de su potencial teórico, no si supera al promedio.

2. **Rentabilidad.** El promedio simple de márgenes trata igual a un plato que vendió 2 unidades y a uno que vendió 200. Un plato caro de baja rotación levanta el umbral de toda la carta. El método pondera por unidades vendidas justamente para evitar eso.

**Consecuencia concreta:** la matriz de hoy sobre-clasifica Perros y Puzzles, y sub-clasifica Estrellas. Y la recomendación que se muestra en pantalla para Perros es *"considerá sacarlos"*. Con el umbral mal calibrado, la app puede estar recomendando sacar de la carta platos que el método clasificaría como Caballos de Batalla — que son los que **hay que mantener siempre presentes**, no eliminar.

Es un fix chico (dos fórmulas) con impacto directo en una recomendación que el usuario puede ejecutar.

---

## 3. Los huecos, ordenados

### Arreglar ya — barato y con efecto inmediato

| # | Qué | Por qué | Dónde |
|---|---|---|---|
| 1 | **Fórmulas de ingeniería de menú** | Ver §2. La app hoy puede recomendar sacar platos que el método dice conservar. | `carta/page.tsx:2304-2320` |
| 2 | **`stock_maximo` + stock de seguridad calculado** | Una columna, una fórmula (`mínimo × 1,25`), y el techo de compra de perecedero deja de depender de la memoria de alguien. | `productos`, `useStock.ts` |
| 3 | **Merma esperada por producto** | `productos.merma_esperada_pct` precargada con la tabla de la síntesis §5.5. No toca el costeo (ver arriba): sirve para que Merma pueda decir "20 % en pollo es normal, 35 % no". Es lo que convierte el registro de merma en detección de fuga. | `productos`, `useMerma.ts` |
| 4 | **Unir desempeño y ventas por persona** | El ranking de meseros ya existe en Reportes → Ventas y `reportes/personal` ya mide producción y horas. Falta juntarlos y ponerles objetivo. Es una vista, no un módulo. | `reportes/personal/page.tsx`, `useReporteVentas.ts` |

### Lo que más falta — cierra el ciclo

| # | Qué | Por qué |
|---|---|---|
| 5 | **Presupuesto por familias de gasto** | Hoy `presupuestos` es un monto. Con las 4 familias y la estructura objetivo, Reportes pasa de decir "gastaste X" a decir "personal está 6 puntos arriba del objetivo". Es el salto de resultado a desvío. |
| 6 | **Incidencias por proveedor** | La diferencia al recibir ya se captura. Falta que acumule y ranque. Convierte una discusión de memoria en un dato al renegociar. |
| 7 | **Cotejo de baja de inventario vs. facturación** | La detección de fuga. El material la trata como existencial y hoy no existe. |
| 8 | **Estándar de calidad por producto** | Sin esto, la recepción no tiene contra qué verificar y el paso 2 del protocolo es decorativo. |
| 9 | **Checklist de la carta pre-servicio** | Una hora antes de abrir, partida por partida, probando. El mise dice "hecho", esto dice "bueno". |

### Lo grande — decisión de producto, no de sprint

| # | Qué | Por qué |
|---|---|---|
| 10 | **Reservas** | Es el departamento Comercial entero y hoy no existe (solo `reserva_especial` como etiqueta de calendario). Además es **la entrada que le falta al motor de producción**: hoy sugiere con 2 de las 6 entradas del material (promedio de ventas ✓, inventario ✓; faltan reservas, previsión, hojas de producción, días de pedido). Con reservas, la sugerencia pasa de estadística a previsión. |
| 11 | **Sugerencia de compra** | Existe la de producción (`lib/produccion/sugerencia.ts`). La de compra usaría el mismo motor más `stock_maximo` y días de pedido por proveedor. Depende de #2 y #10. |

---

## 4. Lo que está por encima del material

Vale registrarlo porque es donde K-OS no tiene con qué compararse, y por lo tanto donde hay que confiar en el criterio propio y no en el libro:

- **La máquina de turnos del mise.** El turno vigente decidido por la entrega y no por el reloj, el Modo Control, el cierre que hereda qué falta y con qué prioridad. El material describe hojas de papel y reuniones; esto es otra categoría de solución.
- **Muro y KDS.** El material es de 2022 y anterior — no contempla pantallas de cocina. La regla de "sin Coach en el KDS" es una decisión que ninguna fuente podía sugerir.
- **El Coach.** El material pide, en los 9 departamentos, *"manual de usuario y protocolo de actuación para problemas con el software"*. K-OS lo resolvió con IA conversacional en vez de con un PDF. Es una respuesta mejor a un requisito que el material sí identificó.
- **Modo emprendimiento.** Es la implementación de la regla que el material enuncia pero no resuelve: *"en un restaurante con un equipo pequeño no hay departamentos; las funciones se distribuyen entre todo el equipo"*.

---

## 5. La regla que hay que respetar al cerrar los huecos

> *"Querer controlarlo todo es la mejor manera de no controlar nada."* — elBullifoundation, cap. 10.4

Nueve de los once ítems de arriba agregan **campos que alguien tiene que llenar**. Estándar de calidad por producto, merma esperada, máximo de stock, presupuesto por familia, objetivos de venta: todo eso es capa Definir, y la capa Definir es la que el usuario más resiste porque no da resultado el mismo día.

Dos condiciones para que no se conviertan en formularios vacíos que ensucian la app:

1. **Que vengan con default sensato.** El stock de seguridad se calcula solo (mínimo + 25 %). La merma esperada se precarga con la tabla del material. El presupuesto arranca con la estructura 33/5/30/17. Nadie debería tener que inventar el primer valor.
2. **Que nada bloquee.** Un producto sin estándar de calidad se recibe igual. Un plato sin merma esperada se costea igual. La capa Definir enriquece a Controlar; no puede ser prerrequisito de Ejecutar.
