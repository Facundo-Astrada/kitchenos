-- Módulo Ventas — Fase 1: campos que le faltaban a `cuentas` para ser el
-- equivalente real a la pestaña "Ventas" de Fudo (venta cerrada por mesa).
-- cuentas ya tenía: mesa_id, estado, total, mozo_id, abierta_at, cerrada_at.
ALTER TABLE cuentas
  ADD COLUMN IF NOT EXISTS cantidad_personas integer NULL,
  ADD COLUMN IF NOT EXISTS cliente_nombre text NULL,
  ADD COLUMN IF NOT EXISTS facturado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS caja_turno_id uuid NULL REFERENCES cajas_turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_caja_turno ON cuentas(caja_turno_id);

NOTIFY pgrst, 'reload schema';
