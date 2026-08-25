-- PLAN-PRESUPUESTO-CMV-2026-08 bloque 1 — presupuesto de mercadería por sector y mes.
--
-- NO se toca `presupuestos`: agregarle categoria_gasto_id + mes nullable
-- obligaría a un índice único parcial, y el onConflict de PostgREST solo
-- acepta columnas, no el predicado del índice — el upsert del tab de
-- familias (savePresupuestoFamilia) se rompería. Van dos tablas nuevas.

-- ── Presupuesto mensual: el número raíz del que cuelga todo (ventas estimadas) ──
CREATE TABLE IF NOT EXISTS presupuesto_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mes date NOT NULL,                          -- siempre el día 1 del mes
  ventas_estimadas numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, mes)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_mes_rest ON presupuesto_mes (restaurante_id, mes DESC);

-- ── Presupuesto por sector (categoria_gasto) y mes ──
CREATE TABLE IF NOT EXISTS presupuesto_sector (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  categoria_gasto_id uuid NOT NULL REFERENCES categorias_gasto(id) ON DELETE CASCADE,
  mes date NOT NULL,                          -- siempre el día 1 del mes
  monto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, categoria_gasto_id, mes)
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_sector_rest ON presupuesto_sector (restaurante_id, mes DESC);

-- ── Los dos flags sobre categorias_gasto ──
-- cuenta_en_cmv: la categoría entra al costo de mercadería vendida (el
-- material valida esto para descartables — "empaques y envases" son costo
-- de insumo, no gasto operacional). Default sensato: todo lo que ya es
-- mercadería entra; el resto queda apagado y se prende a mano.
-- es_mejora: arreglos estructurales / compras para mejorar proceso, tiempo,
-- producción o ambiente laboral (bloque D "Arreglos" de la pantalla nueva).
-- NO son devoluciones de proveedor — eso ya vive en proveedor_incidencias.
ALTER TABLE categorias_gasto
  ADD COLUMN IF NOT EXISTS cuenta_en_cmv boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_mejora     boolean NOT NULL DEFAULT false;

UPDATE categorias_gasto SET cuenta_en_cmv = true WHERE categoria_financiera = 'mercaderia';

-- ── RLS multi-tenant, mismo patrón que categorias_gasto/presupuestos (4 policies por CRUD) ──
ALTER TABLE presupuesto_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_sector ENABLE ROW LEVEL SECURITY;

CREATE POLICY presupuesto_mes_select ON presupuesto_mes
  FOR SELECT USING (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_mes_insert ON presupuesto_mes
  FOR INSERT WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_mes_update ON presupuesto_mes
  FOR UPDATE USING (restaurante_id = mi_restaurante_id()) WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_mes_delete ON presupuesto_mes
  FOR DELETE USING (restaurante_id = mi_restaurante_id());

CREATE POLICY presupuesto_sector_select ON presupuesto_sector
  FOR SELECT USING (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_sector_insert ON presupuesto_sector
  FOR INSERT WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_sector_update ON presupuesto_sector
  FOR UPDATE USING (restaurante_id = mi_restaurante_id()) WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY presupuesto_sector_delete ON presupuesto_sector
  FOR DELETE USING (restaurante_id = mi_restaurante_id());

NOTIFY pgrst, 'reload schema';
