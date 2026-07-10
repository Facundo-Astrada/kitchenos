# PLAN — Fase 2: Walking Skeleton (comanda → KDS → bump)

> **Estado:** Planificado (30 jun 2026). Ejecutar DESPUÉS de Fase 1 (`PLAN-FASE-1.md`) y de revisar su esquema.
> **Objetivo:** un único flujo VERTICAL completo, end-to-end, lo más delgado posible pero funcionando de punta a punta. Valida la arquitectura de Fase 1, NO cubre features.
> **Specs fuente:** `relevamiento_kitchenOS.md` (§4 matriz P0), `prompts_claude_code_kitchenOS.md` (PROMPT 2).
> **Antes de codear:** leer `node_modules/next/dist/docs/` (Next 16). Respetar CLAUDE.md + regla de UI de cocina.

## El slice (todo P0 de la matriz §4)

1. Un mozo crea una comanda en salón: elige mesa → abre cuenta → agrega ítems (desde la carta) + modificadores/notas.
2. La comanda se envía y aparece EN TIEMPO REAL en el KDS de cocina (Supabase Realtime).
3. Cada ítem se rutea a la estación correcta según el producto.
4. El KDS muestra estado (pendiente/en_prep/listo) y un cronómetro de ticket time con color por umbral (verde/amarillo/rojo).
5. El cocinero hace bump de ítems individuales y de la comanda completa.
6. El cambio de estado se refleja de vuelta en salón (mesa/cuenta/ítem).

## Criterios de aceptación

- Funciona en tablet/celular con la regla de UI de cocina (botones masivos, swipe, alto contraste, CERO dropdowns durante el despacho).
- Sigue andando si se corta el wifi en la cocina y sincroniza al reconectar (Offline Opción A: ver/marcar comandas ya recibidas; los bumps se encolan y se reenvían).
- Tests de la lógica de estados de la comanda (Vitest) + 1 flujo e2e feliz (Playwright).
- No rompe nada de lo que ya funciona en el repo.

## Prerrequisito de esquema (mini-migración)

- `carta_items.estacion_default_id UUID NULL` (→ estaciones) — regla de ruteo: cada producto cae en su estación por defecto. Si falta, el ítem va a una estación "sin asignar".
- Verificar que el seed de El Rescoldo (Fase 1) tenga estaciones, mesas (con pos_x/pos_y) y al menos algunos `carta_items` con `estacion_default_id` cargado. Si no, completarlo acá.

## Componentes a construir (mínimos)

**Datos / lógica:**
- `lib/comandas/estado.ts` — máquina de estados pura de la comanda y del ítem (pendiente → en_prep → listo → bumpeado; recall fuera de alcance acá). SIN dependencias de red → 100% testeable con Vitest.
- `useComandas` (hook) — SWR + Supabase Realtime, key por restaurante_id (+ estación para el KDS). CRUD mínimo: crear comanda, agregar ítems, cambiar estado, bump. Escribe `eventos_cocina` en cada fired/bumped.

**Salón (mozo, celular):**
- Vista de servicio (deslizar a la derecha) → **mapa de mesas** usando `mesas.pos_x/pos_y` (tap en mesa).
- Tap en mesa → abre/usa `cuenta` → pantalla de comanda: buscador de carta, agregar ítem, modificadores (con/sin/extra) + nota, botón ENVIAR.
- Al enviar: insert `comandas` + `comanda_items` (+ modificadores) con estado inicial pendiente y `fired_at`.

**Cocina (KDS, tablet/celular compartido):**
- Grilla de tarjetas (una por comanda) estilo Fudo pero más rica: número, mesa, comensales, mozo, cronómetro ticket time con color por umbral, lista de ítems con su estado.
- Bump por ítem (área de tap grande / swipe) y bump de comanda completa.
- Filtro por estación (cada pantalla ve lo suyo).

## Tiempo real y vuelta a salón

- Realtime en `comandas`/`comanda_items` filtrado por restaurante_id (+ estación en KDS).
- Comanda enviada → aparece en KDS al instante. Bump → actualiza estado → se refleja en la vista de salón (ítem listo / mesa con estado).

## Offline (Opción A) — alcance del skeleton

- Service Worker cachea la vista KDS + las comandas ya recibidas.
- Bump sin red → se guarda en cola IndexedDB → se reenvía al reconectar (idempotente, last-write-wins por timestamp).
- Sin red NO se crean comandas nuevas desde salón (por diseño). Mostrar aviso claro de "sin conexión".
- ⚠️ Verificar enfoque PWA/SW contra docs de Next 16 antes de implementar.

## Orden de ejecución (commits atómicos + skills)

1. **Mini-migración** `carta_items.estacion_default_id` + completar seed Rescoldo (estaciones/mesas/ruteo) → `migrator` + `/supabase-check` + `NOTIFY pgrst`.
2. **Máquina de estados** `lib/comandas/estado.ts` + **tests Vitest** (primero la lógica, sin UI).
3. **Hook** `useComandas` (SWR + Realtime + eventos_cocina).
4. **Salón slice** → skill `/new-module` para la vista de servicio: mapa de mesas → cuenta → comanda con modificadores → enviar.
5. **KDS slice** → tarjetas, cronómetro con color, estados de ítem, bump ítem + comanda.
6. **Tiempo real bidireccional** + reflejo de estado en salón.
7. **Offline:** SW + cola IndexedDB para bumps + sync al reconectar + aviso sin conexión.
8. **e2e Playwright** del camino feliz (crear comanda → aparece en KDS → bump → refleja en salón) + instrucciones de demo manual.
9. Cierre con `/update-status`.

## Qué NO entra en el skeleton (queda para Fase 3+)

Alertas sonoras, recall, all-day, hold/fire, coursing, división de cuentas, cobro, propinas, multi-pantalla con sync avanzado, impresión de cancelaciones, métricas. El skeleton es solo el hilo conductor mínimo para validar la arquitectura. El orden de features posterior está en `prompts_claude_code_kitchenOS.md` (sección "Orden sugerido de features").

## Demo de verificación (al terminar)

1. En El Rescoldo, abrir la vista de servicio en un dispositivo (mozo) y el KDS en otro (cocina).
2. Mozo: mesa → agregar 2 ítems con un modificador y una nota → Enviar.
3. KDS: la comanda aparece al instante, ruteada a su estación, con cronómetro en verde.
4. Esperar a que el cronómetro pase a amarillo/rojo (umbrales).
5. Bump de un ítem y luego de la comanda → el estado vuelve a salón.
6. Cortar el wifi de la cocina, hacer un bump, reconectar → el cambio se sincroniza.
