# PLAN — Fase 1: Fundación kitchenOS (cocina-servicio + salón + cobro + fiscal)

> **Estado:** APROBADO por Facundo (30 jun 2026). Listo para ejecutar con Sonnet.
> **Regla:** Fase 1 = CIMIENTOS. NO se construyen features (ni KDS funcional, ni mapa operativo, ni cobro real, ni integración ARCA). El primer flujo vivo es la Fase 2 (walking skeleton).
> **Specs fuente:** `relevamiento_kitchenOS.md` (§8 modelo de datos), `prompts_claude_code_kitchenOS.md` (PROMPT 1), `instructivo_seguimiento_fiscal.md`.
> **Antes de codear:** leer `node_modules/next/dist/docs/` (Next 16 tiene breaking changes — regla de AGENTS.md).

## Decisiones cerradas

- Extender stack actual (Next 16 + React 19 + Supabase + Vercel). Misma app, mismo login.
- Vista de servicio (salón/cocina) accesible deslizando a la derecha; dashboard propio separado del de gestión.
- **Offline Opción A:** KDS ve y marca comandas sin wifi y sincroniza al volver; sin red NO se mandan comandas nuevas. Alcance offline acotado SOLO a la vista KDS + sus acciones.
- Cobro desacoplado de fiscal (si ARCA cae, se cobra igual; comprobante queda "pendiente de emisión").
- **Bros = Responsable Inscripto** (PV 3). kitchenOS cubre Monotributo y RI desde el inicio.
- Tooling nuevo aprobado: tests + CI + migraciones versionadas (Supabase CLI) + secret store + zod en fronteras.
- **Mapa de mesas con posiciones x/y desde Fase 1** (decisión Facundo: agregarlo ahora).
- **Seed de datos de prueba en El Rescoldo en esta fundación** (decisión Facundo).

## Arquitectura

- **Cliente/servidor:** una sola app web responsive (celular mozo / tablet o celular cocina / desktop gestión). No app nativa.
- **Offline:** Service Worker (PWA) cachea la vista KDS + últimas comandas; cola de cambios en IndexedDB que se reenvía al reconectar; conflictos por idempotencia + last-write-wins por timestamp. ⚠️ Verificar enfoque PWA/SW contra docs de Next 16 antes de implementar.
- **Tiempo real:** Supabase Realtime filtrado por restaurante_id + estación (patrón ya usado en useTareas/usePase). Comanda insert → Realtime → tarjeta en KDS; bump → de vuelta a salón.
- **RLS:** toda tabla nueva con políticas `mi_restaurante_id()` + índice por restaurante_id + `NOTIFY pgrst, 'reload schema'` al final de cada migración.

## Esquema de datos (tablas NUEVAS)

**Núcleo de servicio:**
- `comandas` — restaurante_id, origen (salon/mostrador/delivery/marca), mesa_id?, mozo_id? (→ equipo_miembros), cuenta_id?, estado, course?, marca?, created_at.
- `comanda_items` — comanda_id, carta_item_id (→ carta_items), cantidad, estado (pendiente/en_prep/listo/bumpeado), estacion_id, fired_at, bumped_at, notas.
- `comanda_item_modificadores` — comanda_item_id, tipo (con/sin/extra), texto, flag_alergeno. (patrón "Grupos modificadores" de Fudo)
- `estaciones` — restaurante_id, nombre (parrilla/frios/postres/pase/barra), pantalla_asignada.
- `eventos_cocina` — comanda_item_id, evento (fired/bumped/recalled), timestamp. (alimenta métricas speed-of-service)

**Salón:**
- `mesas` — restaurante_id, numero/nombre, sector, capacidad, estado (libre/ocupada/cuenta_pedida), **pos_x NUMERIC, pos_y NUMERIC** (para el mapa visual desde Fase 1).
- `cuentas` — restaurante_id, mesa_id, estado (abierta/cerrada), total, mozo_id (→ equipo_miembros), abierta_at, cerrada_at.

**Cobro:**
- `medios_pago` — restaurante_id, nombre (efectivo/tarjeta/transferencia/qr/mixto), activo.
- `pagos` — cuenta_id, medio_id, monto, propina, created_at.

**Fiscal (solo estructura en Fase 1, sin integración real):**
- `config_fiscal` — restaurante_id, condicion (monotributo/RI), cuit, puntos_venta (int[]), cert_ref (referencia al secret store, NUNCA el archivo en la tabla).
- `comprobantes` — restaurante_id, cuenta_id?, tipo (A/B/C/NC/ND), punto_venta, numero, cae, cae_vencimiento, estado (pendiente/emitido/rechazado/anulado), receptor_cuit, receptor_condicion_iva, subtotal, iva, total, qr_data, arca_raw (jsonb), emitido_at.
- `comprobante_items` — comprobante_id, descripcion, cantidad, precio, alicuota_iva, subtotal.

**Reusar (NO crear ni tocar):** productos, recetas, ingredientes, carta_items, merma, equipo_miembros (= mozos), restaurantes. ⚠️ `facturas` es de COMPRA a proveedores — NO usar para venta fiscal.

## Adapter fiscal (solo contrato en Fase 1)

- Interfaz `ProveedorFiscal` con `emitir(comprobante)` y `ultimoAutorizado(puntoVenta, tipo)`.
- Implementaciones previstas (NO codear ahora): `WsfeDirecto` y `Terceros` (AfipSDK/TusFacturas).
- Fase 1 entrega interfaz + stub que devuelve "pendiente de emisión" (mock).

## Stub ingest ESC/POS

- Endpoint `/api/ingest/escpos` que acepta texto crudo de comanda de un POS legacy. Fase 1: contrato + stub, sin parseo a fondo.

## Tooling

- Vitest (lógica: máquina de estados de la comanda). Playwright (ya instalado) para 1 flujo e2e base.
- Workflow GitHub Actions: build + test en cada push/PR.
- Adoptar Supabase CLI para migraciones versionadas.
- Secret store para certificados .crt/.key por tenant (cifrado, nunca en repo/tabla/cliente).
- zod en fronteras (pagos, ingest, fiscal).

## UI

- Vista de servicio (mapa de mesas / KDS) accesible deslizando a la derecha, separada del dashboard de gestión.
- Regla de UI de cocina al CLAUDE.md: botones masivos, swipe amplio, alto contraste, CERO menús desplegables durante el despacho. Tablet, no escritorio.

## Orden de ejecución (commits atómicos + skills)

1. Esquema de datos → agente `db-designer` (diseño) + `migrator` (SQL seguro) + `/supabase-check` (verificar). 1 commit por bloque: servicio · salón · cobro · fiscal. Incluir mesas.pos_x/pos_y.
2. RLS en todas las tablas nuevas → skill `/add-rls` o agente `rls-enforcer`.
3. Tipos en `types/index.ts` + actualizar modelo en `CLAUDE.md`.
4. Adapter fiscal (interfaz + stub) + stub ESC/POS.
5. Tooling: Vitest + Playwright base + workflow CI + adopción Supabase CLI.
6. Regla UI cocina + ruta esqueleto de la vista de servicio (vacía, sin features).
7. Seed de datos de prueba en El Rescoldo: mesas (con posiciones x/y), mozos, estaciones, medios de pago, config_fiscal de ejemplo. NO tocar Bros.
8. Cierre con skill `/update-status` (actualizar PENDIENTES, ESTADO-ACTUAL, docs).

## Qué NO se hace en Fase 1

Ninguna feature: ni KDS funcional, ni mapa de mesas operativo, ni cobro real, ni integración ARCA. Solo cimientos. El flujo vivo comanda→KDS→bump es Fase 2.
