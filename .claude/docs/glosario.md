# Glosario ubicuo — congelado

Día 10 de `plan-consolidado.md` §2 (fusiona `dominio-kos.md` §3/§8-🟡4 y
`arquitectura-kos.md` §7-🟡6). K-OS ya habla el idioma de la cocina en el
código — eso está por encima de lo normal — pero algunos términos centrales
significan varias cosas a la vez, y al menos una confusión ya costó un bug
real (`lib/ops/turnos.ts:96`). Este doc no renombra nada existente
(no se paga en producción): **congela lo que hay y legisla lo que viene.**

## Reglas para lo nuevo

1. **`estado`, no `status`.** Las tablas nuevas usan `estado` (`comandas`,
   `cuentas`, `mesas`, `cajas_turnos`); `status` quedó en las tablas viejas
   (`recetas`, `facturas`, `pedidos`, `produccion_diaria`) y no se retrofitea.
2. **`jornada` para la fecha operativa, nunca `turno_fecha` en una columna
   nueva.** `turno_fecha` ya existe y significa jornada (no turno) en
   `tareas` — ese nombre es deuda aceptada, no un patrón a copiar. Un alias
   tipado barato ayuda: `type Jornada = string`.
3. **"turno" queda reservado para `TurnoServicio`** (el bloque horario del
   servicio — almuerzo/cena, configurable). Cualquier otro concepto que hoy
   se nombraría "turno" lleva prefijo: `caja_` (turno de caja), `fichaje_`
   (entrada/salida de personal), etc. Ver la lista de los 7 significados
   actuales abajo antes de sumar un octavo.

`PLAZAS_OPS` (`lib/ops/mise.ts`) unificado con `PLAZAS_FIJAS`
(`lib/constants.ts`) entra en este mismo día — ver el commit del código, no
es parte de la doc.

## El glosario que se sostiene ✅

| Término | Significa | Dónde |
|---|---|---|
| **plaza** | La partida/estación de cocina | `Plaza`, `PLAZAS_FIJAS`, `checklist_items.plaza`, `merma.plaza` — 107 archivos, un solo significado |
| **86** | Plato agotado, dejá de venderlo | `carta_items.disponible=false` |
| **jornada operativa** | El día de la cocina, corte 05:00 | `hoyOperativo()`, `cierres_turno.jornada` — concepto sólido; el nombre de columna `tareas.turno_fecha` es la excepción documentada arriba |
| **comanda / mozo / mesa / bump / fire / hold / recall** | Vocabulario del pase de salón | `EstadoComanda`, `EstadoComandaItem`, `eventos_cocina` |
| **entrega de plaza** | "Entregué la plaza" = cerré mi turno | `cierres_turno` + `claveCierre()` |
| **demanda viva** | Lo que el salón ya pidió y no se repuso | `checklist_items.demanda_viva` |
| **fuga** | Inventario que se va sin facturarse | `lib/reportes/fuga.ts` |
| **producto / ingrediente** | El bulto que se compra / la línea de la receta | Dos modelos con puente `producto_id` — es frontera, no ruptura |
| **ficha técnica** | El estándar de referencia de un plato | `recetas` + `calcFoodCost` |
| **merma** | Junta lo esperable y lo evitable, separados por `motivo` | `productos.merma_esperada_pct` para lo esperable — colapso deliberado |
| **gramaje** | Peso de un componente en UNA porción del plato — food cost | `plato_recetas.gramaje`/`gramaje_unidad` |
| **stock estándar** | Cuánto de esta prep pide este plato al par level de la plaza — mise, no costeo | `plato_recetas.cantidad_ops`/`unidad_ops` |
| **peso por porción** | Gramaje real de una prep con recipiente en el mise — compartido por TODOS los platos que usan esa receta+plaza | `checklist_items.peso_porcion`/`peso_porcion_unidad` |

**gramaje vs. stock estándar vs. peso por porción (sep 2026).** Tres conceptos
que hasta esta fecha compartían una sola columna (`cantidad_ops`) y se
pisaban: el food cost de Carta contaba cada componente como "una porción
entera del batch" en vez de su peso real. Ahora, en orden de prioridad de
lectura (`useCarta.ts`): si la prep tiene *peso por porción* cargado
(recipiente configurado en el mise, compartido entre platos), ese gana;
si no, el *gramaje* dedicado del componente; `cantidad_ops` nunca alimenta
el costeo — es puramente la demanda al *stock estándar* de la plaza, editada
desde el panel OPS. Sin ninguno de los dos primeros, el plato queda
"sin estandarizar" (sin FC calculado) en vez de inventar un número.
Excepción viva: `CartaBoardCard.tsx` (Mesa de Trabajo) sigue editando
gramaje escribiendo a `cantidad_ops` por compatibilidad — `useCarta.ts`
espeja ese valor a la columna nueva en esa escritura puntual; no repetir el
patrón en código nuevo. Migración y backfill:
`supabase/migrations/20260904_plato_recetas_gramaje.sql`.

## Las rupturas — una palabra, N cosas ⚠️

**"turno" — 7 significados.** `turnos` (grilla de horarios), `turnos_personal`
(fichaje), `TurnoServicio` (JSONB de config — **el único al que "turno"
queda reservado de acá en más**), `checklist_registros.turno` (turno + fase
codificados juntos, `'cena:apertura'`), `cierres_turno` (entrega de plaza),
`cajas_turnos` (apertura→arqueo de caja), `merma.turno`/`TurnoMerma` (fase del
día). Más `tareas.turno_fecha` (en realidad jornada) y
`pase_mensajes.turno_tipo` (enum viejo hardcodeado). Costo: cada feature que
toca tiempo necesita leer un comentario desambiguador antes de escribir una
línea.

**"mise" — un concepto, tres nombres.** El dominio y los docs dicen *mise*;
tablas y hooks dicen *checklist* (`checklist_items`, `useChecklist`); la UI
dice *Plazas*. Es el concepto central del producto y el único sin nombre
único. No se renombra (retrofit carísimo) — cualquier término nuevo del
mismo concepto usa "mise", no un cuarto sinónimo.

**"sección" — cuatro cosas.** `checklist_secciones` (sección del mise),
`tareas.seccion` (el **paso** del menú en modo menú/evento — una mentira
suave que ya obliga a lógica condicional), `stock_sectores`/`mesas.sector`
(lugares físicos), `Ingrediente.grupo` (etapa de receta, convive con
`seccion_mise` en la misma interfaz).

**"evento" — tres cosas.** `eventos` (calendario), `menus.tipo='evento'`
(menú de evento), `eventos_cocina` (hechos del KDS). Bajo costo mientras no
se crucen en pantalla, pero ya no se puede usar pelado en una conversación de
diseño.

**"item" — dos familias.** Sufijo de línea-de-documento (`factura_items`,
`pedido_items`, `comanda_items`, `ventas_items`) vs. sufijo de
entrada-de-catálogo (`carta_items`, `checklist_items`, `rutina_turno_items`).
Antes de nombrar un `X_items` nuevo, preguntar de cuál de las dos familias es.

**`status` vs `estado`.** Ver regla 1 arriba — `tareas` tiene las dos, con la
derivación legacy resuelta en un solo escritor (`types/index.ts:549,572`).

**El nombre que miente:** `haccp_limpieza.checklist_item_id` guarda el id de
una `checklist_rutina`, no de un `checklist_item` — el propio código lo
confiesa dos veces (`lib/hooks/useHaccp.ts:317,401`). No se renombra la
columna; que quede escrito acá es la mitigación.

Detalle completo y evidencia (archivo:línea) de cada ruptura:
`.claude/docs/ingenieria/dominio-kos.md` §3.
