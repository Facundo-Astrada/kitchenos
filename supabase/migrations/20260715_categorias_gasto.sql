-- Módulo Gastos (reemplazo de Fudo → Gastos/Recepción/Cat. de Gastos) — Fase 1: modelo de datos.
--
-- categorias_gasto: taxonomía de categorías de gasto por restaurante, con la
-- categoría financiera que arma el P&L (mercadería / operacional / administrativo).
-- Soporta sub-categorías (parent_id) igual que checklist_secciones.
CREATE TABLE IF NOT EXISTS categorias_gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id),
  nombre text NOT NULL,
  categoria_financiera text NOT NULL DEFAULT 'operacional'
    CHECK (categoria_financiera IN ('mercaderia', 'operacional', 'administrativo')),
  parent_id uuid NULL REFERENCES categorias_gasto(id) ON DELETE CASCADE,
  activa boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categorias_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_gasto_select" ON categorias_gasto FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "categorias_gasto_insert" ON categorias_gasto FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "categorias_gasto_update" ON categorias_gasto FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "categorias_gasto_delete" ON categorias_gasto FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_categorias_gasto_restaurante ON categorias_gasto(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_categorias_gasto_parent ON categorias_gasto(parent_id);

-- facturas gana los campos que le faltaban frente a Fudo: categoría de gasto,
-- medio de pago, fecha de vencimiento (para "A vencer" / "Vencidos" reales).
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS categoria_gasto_id uuid NULL REFERENCES categorias_gasto(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medio_pago_id uuid NULL REFERENCES medios_pago(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_categoria_gasto ON facturas(categoria_gasto_id);

NOTIFY pgrst, 'reload schema';
