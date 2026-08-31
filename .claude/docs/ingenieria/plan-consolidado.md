# Plan consolidado — las tres sesiones de ingeniería, cruzadas

*Agosto 2026 · cierra la investigación de ingeniería (GRASP → arquitectura → dominio
→ refactorización) · fuentes: `INFORME-GRASP-2026-08.md`, `arquitectura-kos.md` §7,
`dominio-kos.md` §8, `refactor-kos.md` §2/§4*

Tres sesiones dejaron cada una su lista priorizada. Este documento las cruza una sola
vez: qué se fusiona, qué se cancela, qué NO se hace, y **el orden concreto para los
próximos diez días de trabajo**. Cuando este plan y `PENDIENTES.md` difieran, manda
este plan (PENDIENTES quedó reordenado a partir de él el 31/08).

---

## 1. Fusiones y cancelaciones

Tres sesiones llegando al mismo ítem por caminos distintos es señal de que el ítem
importa — no de que haya tres tareas.

| Ítems de origen | Destino | Por qué |
|---|---|---|
| GRASP P1 = arquitectura 🔴-1 = PENDIENTES 🔴 (endpoints sin auth) | **Un solo ítem** (Día 1) | Era el mismo hallazgo tres veces; la sesión 1 le sumó el cómplice del lado cliente (`useCuenta`) |
| GRASP P4 = arquitectura 🟠-2 (puerto de IA) | **Un solo ítem** (Día 5) | La sesión 1 bajó el esfuerzo: la mitad (`lib/ia/errores.ts`) ya existe |
| arquitectura 🟠-4 (gotchas a CI) + refactor §6 (ratchets/techos) + hallazgo nuevo #18 en `useCarta` | **"Ratchets de ingeniería"** — un archivo, una sesión (Día 4) | Todos son el mismo mecanismo: prosa → chequeo. Un solo `lib/ingenieria/ratchets.test.ts` que corre con `npm test` |
| GRASP P5 = arquitectura 🟡-5 (`mapRol` ×2, unidades ×3) + la parte de código de dominio 🟡-4 (`PLAZAS_OPS` espejo) | **"Matar las copias CoA"** — una sesión (Día 10) | Son la misma operación (branch by abstraction, marco §2.2) sobre tres duplicaciones; hacerlas juntas amortiza el modo |
| dominio 🟡-4 (glosario) + arquitectura 🟡-6 (convención del repositorio en `hooks.md`) | Se cuelgan del Día 10 | Son las dos piezas de "legislar hacia adelante"; juntas son ~2 h de doc |
| GRASP P2 ("capa de repositorio") | **CANCELADO** como ítem | Redefinido por la sesión 1 (la firma ya existe; se declara, no se construye) y confirmado por la 3 (las queries directas de Carta se van con UNA migración, no con una capa) |
| GRASP P3 ("partir las 5 pantallas") | **REEMPLAZADO** por los veredictos por pantalla de `refactor-kos.md` §3 | El plan uniforme era imposible: 3 pantallas son mudanza barata, 2 son cirugía cara, y una de esas 2 no conviene operar |
| La 3ª copia de `PLAZAS_OPS` (hallazgo de esta sesión) | Muere adentro del paso 5a de Carta (Día 9) | No es ítem propio: viaja gratis con la migración del panel OPS |

---

## 2. Los diez días

Regla de lectura: un día = una sesión = un tema (método de `CLAUDE.md`). Los días 1-5
eliminan riesgo activo (seguridad, pérdida de datos, red de chequeos) — **no
interrumpibles y en orden**. Los días 6-10 son la parte pagable-por-partes: si
aparece una urgencia de producto, se interrumpe ahí sin dejar nada a medias.

| Día | Tema | Contenido | Esfuerzo | ¿Entra en un día? |
|---|---|---|---|---|
| **1** | 🔴 Seguridad | Cerrar los 3 endpoints sin auth (patrón de `sync-precio`) **y en el mismo commit** sacar `restaurante_id` del body en `useCuenta.cobrarCuenta`; verificar el caller del KDS de carta/86 antes. + Decisión de Facundo sobre `tareas_duplicados_backup_20260826` (RLS o borrar) | 2-3 h + decisión | Sí, sobra |
| **2** | 🟠 Invariantes a la base (1/2) | rpc `reemplazar_menu_preparaciones` para `actualizarMenu` (el único write que PIERDE datos) + candado `UNIQUE ... WHERE estado='abierta'` en `cuentas` con captura del 23505 | 2-3 h + 1-2 h | Sí |
| **3** | 🟠 Invariantes a la base (2/2) | Trigger AFTER UPDATE sobre `comanda_items` → estado de la comanda, con test multi-cliente; verificación de compatibilidad con la cola offline. Si sobra: query de huérfanos de refs polimórficas (🟢 de dominio) | 2-3 h (+1-2 h) | Sí |
| **4** | 🟠 Ratchets de ingeniería | Crear `lib/ingenieria/ratchets.test.ts` (techos de líneas que solo bajan + patrones prohibidos: #20, #18, admin-client sin `requireRestauranteId`, `'use client'` en `lib/<dominio>/`). Arreglar en la misma sesión lo que el ratchet marca: los 3 hooks del #20 (1 línea c/u) y el `filter` faltante en el canal de `useCarta` | 3-4 h | Sí |
| **5** | 🟠 Puerto de IA | `lib/ia/claude.ts` (`pedirAClaude`) usando `clasificarErrorIA` + reintentos sobre `reintentable` + log de tokens; migrar las 12 rutas (mecánico), empezando por las 5 que no usan `errores.ts` | 3-4 h | Sí |
| **6** | Carta — pasos 0+1 | Smoke e2e `carta-smoke.spec.ts` + borrar las ~300 líneas muertas (rama `view='nuevo'`, `isCreate` de FormView, `CAT_ICONS`). Línea base de métricas en el commit | ½ + ½ día | Sí |
| **7** | Carta — pasos 2+4 | Moves puros: cards + exportadores + `PackagingGruposDrawer` + `ImportCartaModal` + `FormView`→`EditarPlato.tsx`. Compilador + smoke de red | 2 × ½ día | Sí |
| **8** | 🟠 `crearFactura` al servidor | El núcleo transaccional según el alcance afinado por la sesión 2 (§4.1): rpc/endpoint para **factura+items solamente**; matching y precios como paso idempotente aparte, extraído a `lib/facturas/matching.ts` con test. `useFacturas.crearFactura` queda como fetch + `mutate()` | 1 día | Justo — no arrancar sin el día entero |
| **9** | Carta — paso 5a | Migrar el panel OPS de `DetailView` a los helpers de `lib/ops/mise.ts` (con `/impacto` antes, diferencias enunciadas en el commit, matriz de verificación contra la base). Arregla de paso el shrink faltante y mata la 3ª copia de `PLAZAS_OPS`. Si sobra: paso 5b (mover `DetailView` a su archivo) | 1 día (+½) | 5a sí; 5b es cola |
| **10** | 🟡 Copias y nombres | Branch by abstraction sobre las copias restantes: `lib/permisos/roles.ts` (`mapRol` ×2), `lib/unidades.ts` (conversión ×3, los tests de `consumoTeorico` se mudan), `PLAZAS_OPS` espejo mise↔constants (importar, no espejar). + Los 2 docs de legislación: glosario congelado (volcar `dominio-kos.md` §3) y la convención `(supabase, restauranteId, input)` en `hooks.md` | 3-4 h + 2 h | Sí |

**Colas** (van al hueco de cualquier día que sobre, sin abrir tema nuevo): censo de
tablas en `ARQUITECTURA.md` (30 min), carta paso 5b si no salió el día 9, carta paso
3 (Rentabilidad: `lib/carta/reprecio.ts` + `saludCarta.ts` con caracterización — vale
por sí solo y es el mejor candidato si un día termina temprano).

**Después del día 10: se vuelve a producto (B9/B10 Reservas).** El registro de
riesgos queda limpio: cero endpoints abiertos, cero writes que pierdan datos, la red
de ratchets impidiendo regresiones, y Carta a mitad de mudanza en un estado estable
que puede esperar meses sin pudrirse (cada paso dejó el código mejor que el
anterior — ésa era la condición del plan).

---

## 3. Lo que NO se hace, con el motivo

| No | Motivo |
|---|---|
| **Cirugía de `stock/ClientView.tsx`** | Forma 2 (86 estados en un componente) + contexto de soporte + sin feature esperando = el peor cociente costo/valor del lote (`refactor-kos.md` §5). Se opera el día que una feature de Stock grande lo exija, empezando por el mapeo de estado |
| **Cirugía de `checklist/ClientView.tsx` ahora** | Es core y tiene cliente (el container-transform diferido), pero es la cirugía más delicada — va DESPUÉS de que Carta pruebe el método, en sesión de análisis propia |
| **Sesiones dedicadas a partir Recetario/Facturas** | Forma 1: la mudanza es barata, así que se hace **por oportunidad** — la próxima sesión que toque cada pantalla arranca moviendo lo que va a tocar (paso 0+1+move puntual). Dedicarles días enteros ahora es pagar sin cliente |
| **`operaciones/page.tsx`** | Está sobre un borde de contextos; se corta cuando B9/B10 obligue, respetando el mapa (`dominio-kos.md` §6) |
| **Tests de render de componentes / perseguir cobertura** | Marco §4: congelan estilos y no atrapan los bugs de este historial (estado, timing, tenant, unidades) |
| **Playwright en CI** | Valor marginal bajo con 2-3 specs corridos a mano; necesita server+seed estable — sesión propia el día que los specs sean 5+ |
| **Capa de repositorio / ORM / renombres de DB / DDD táctico completo** | Re-descartados tres veces (arquitectura §5, dominio §4, refactor §1.3) — no reabrirlos |
| **Migrar los 4 hooks lista-al-montar a SWR en batch** | Regla vigente de la sesión 1: al tocarlos, no en batch |
| **Refactor oportunista dentro de sesiones de feature** | Rompe una-sesión-un-tema; en medio de otra cosa se **anota** el candidato (marco §6.6) |
| **SMTP, fiscal-homologación, Stripe** | Siguen en PENDIENTES con sus bloqueos externos (dominio propio, certificado ARCA, spec) — ninguna sesión de estos 10 días los destraba |

---

## 4. Las dependencias que ordenaron la lista

- **Día 4 antes del día 8:** el ratchet arregla el gotcha #20 en `useFacturas.ts`;
  hacerlo antes evita pisarse con la sesión de `crearFactura` sobre el mismo archivo.
- **Día 6 antes de 7 y 9:** el smoke es la red de todos los moves de Carta; y borrar
  lo muerto antes de mover evita mudar cadáveres.
- **Día 9 después de 7:** con el archivo achicado, el diff de la única migración con
  riesgo real queda revisable.
- **Días 2-3 no dependen de nada** — podrían ser el día 1 si Facundo no está
  disponible para la decisión de la tabla backup.
- **El día 10 no pisa al 9:** 5a mata la copia de `PLAZAS_OPS` de `DetailView`; el
  día 10 unifica el espejo mise↔constants — son copias distintas de la misma lista.

---

## 5. Cómo se sabe, en un mes, si esto funcionó

1. `npm test` tiene los ratchets en verde y **ningún techo subió**.
2. Los greps de CoA (`"duplicada de"`, `"mantener en espejo"`) devuelven solo las
   deliberadas documentadas.
3. La próxima feature de Carta tocó archivos chicos y no `page.tsx` — se verifica en
   el `git show --stat` de esa sesión (`refactor-kos.md` §4.3).
4. Ningún bug nuevo de las clases que este plan cierra: mitades rotas por corte de
   red, mise desactualizado al mover de plaza, eco realtime cross-tenant.
