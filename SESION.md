# Sesión — 2026-08-22 (PLAN-4-CAPAS bloque B6)

## Qué se cerró
- **Objetivos de venta por puesto** (Turnos → Puestos): % comandas con postre, % con café, ticket promedio. Viven en `puestos.objetivos JSONB`, con override puntual por persona en `equipo_miembros.objetivos` (mismo patrón que `permisos_app`/`modulos_extra`). Migración `20260822_objetivos_venta_puestos.sql` — incluye el reset de la demo (R1).
- **Reportes → Personal** fusiona producción y venta real en la misma fila (ticket/postre/café vs. objetivo, texto neutro, sin ranking de ventas — a propósito, el material advierte contra convertirlo en herramienta de castigo). Reportes → Ventas → Meseros gana el mismo desglose, reusando `lib/reportes/ventasPorPersona.ts` (con tests) para no duplicar el cruce `comanda_items → carta_items.categoria`.
- Verificado en vivo (Playwright + dev server) contra El Rescoldo real: crear/editar objetivos del puesto persiste y se ve en el detalle; con una cuenta+comanda sintética temporal (borrada al final) se confirmó el chip de ticket en la fila y la sección "Ventas del mes" del drawer, incluido el override por persona. `npm run build` + 122/122 tests Vitest limpios.
- Commit `0ccd315`, pusheado, deploy en Vercel.

## Qué quedó a medias
- Falta el editor de UI para el override de objetivos **por persona** (hoy solo puesto). Anotado en `PENDIENTES.md` 🟢 — el caso común (objetivo por puesto) ya cubre la mayoría.

## Probar primero mañana
- Nada bloqueante de este bloque — quedó verificado de punta a punta antes de cerrar.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — queda B7 (checklist de la carta pre-servicio, tabla nueva, sin dependencias). B8 (Reservas) sigue siendo el punto de decisión: revisar el track de validación con Bros/Rescoldo antes de arrancarlo.
