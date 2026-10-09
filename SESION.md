# Sesión — 09/10/2026 (Compras: facturas de Fudo)

## Qué se cerró
- Bros: 1.653 facturas duplicadas borradas (respaldo en `bak_*_20261009`); import de Fudo idempotente por `external_id`.
- Parser de Fudo en `lib/importador/fudo.ts` (con test): pagos, IIBB/Ganancias, sector, CUIT, vencimiento.
- Pestaña Precios (cambios + deshacer, sin vincular + alias), resumen post-import, ticket lateral ≥900px, filtros en la base.

## Qué quedó a medias
- No probé en pantalla con login de Bros (solo build, tests y parser contra el export real de agosto).
- Exportar de Facturas sigue siendo solo la página cargada. Ratchet de `checklist/ClientView.tsx` sobre su techo (de antes).

## Probar primero mañana
- Importar el Excel de hoy en Compras → POS: ¿"actualizadas" + solo octubre nuevo? ¿Resumen de precios? Pestaña Precios y ticket en desktop.

## Próximo paso concreto
- Si el import sale limpio: vincular lo "sin vincular" más caro en Precios y revisar los cambios >15%.
