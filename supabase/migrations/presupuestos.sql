-- Presupuestos por período (ingresados por el usuario)
-- periodo: 'semanal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
-- Se comparan contra las compras reales (facturas confirmadas) del período correspondiente.

CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  periodo TEXT NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurante_id, periodo)
);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_presupuestos_restaurante ON presupuestos(restaurante_id);

DROP POLICY IF EXISTS presupuestos_select ON presupuestos;
DROP POLICY IF EXISTS presupuestos_insert ON presupuestos;
DROP POLICY IF EXISTS presupuestos_update ON presupuestos;
DROP POLICY IF EXISTS presupuestos_delete ON presupuestos;

CREATE POLICY presupuestos_select ON presupuestos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuestos_insert ON presupuestos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuestos_update ON presupuestos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuestos_delete ON presupuestos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());
