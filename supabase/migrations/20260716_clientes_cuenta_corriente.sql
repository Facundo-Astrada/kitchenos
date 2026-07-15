-- Módulo CRM — Fase 1: Clientes + Cuentas Corrientes (reemplazo de Fudo).
--
-- clientes: base de clientes del restaurante. Métricas (última compra, cant.
-- compras, total gastado) se calculan en vivo desde `cuentas` (no se
-- desnormalizan acá) para no desincronizar.
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id),
  nombre text NOT NULL,
  telefono text NULL,
  email text NULL,
  origen text NOT NULL DEFAULT 'local',
  notas text NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select" ON clientes FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "clientes_insert" ON clientes FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "clientes_update" ON clientes FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "clientes_delete" ON clientes FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_clientes_restaurante ON clientes(restaurante_id);

-- cuentas gana el link a un cliente registrado. `cliente_nombre` (texto libre,
-- agregado en la migración de Ventas) se mantiene para ventas sin cliente
-- vinculado (walk-in) — cliente_id es la fuente de verdad cuando existe.
ALTER TABLE cuentas
  ADD COLUMN IF NOT EXISTS cliente_id uuid NULL REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_cliente ON cuentas(cliente_id);

-- cuenta_corriente_movimientos: libro de "fiado" por cliente. `tipo='cargo'`
-- (venta a crédito, aumenta lo adeudado) o `tipo='pago'` (el cliente salda,
-- reduce lo adeudado) — mismo signo que `caja_movimientos.tipo` (ingreso/retiro).
CREATE TABLE IF NOT EXISTS cuenta_corriente_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cuenta_id uuid NULL REFERENCES cuentas(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('cargo', 'pago')),
  monto numeric NOT NULL,
  medio_pago_id uuid NULL REFERENCES medios_pago(id) ON DELETE SET NULL,
  descripcion text NULL,
  creado_por text NULL,
  fecha_pago date NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cuenta_corriente_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccm_select" ON cuenta_corriente_movimientos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "ccm_insert" ON cuenta_corriente_movimientos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "ccm_update" ON cuenta_corriente_movimientos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "ccm_delete" ON cuenta_corriente_movimientos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_ccm_restaurante ON cuenta_corriente_movimientos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_ccm_cliente ON cuenta_corriente_movimientos(cliente_id);

NOTIFY pgrst, 'reload schema';
