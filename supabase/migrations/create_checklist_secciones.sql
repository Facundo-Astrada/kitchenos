-- ============================================================
-- Checklist Secciones + prioridad en items — KitchenOS
-- ============================================================

-- Secciones configurables por plaza
CREATE TABLE IF NOT EXISTS checklist_secciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  icono text NOT NULL DEFAULT 'inventory_2',
  orden integer NOT NULL DEFAULT 0,
  plaza text NOT NULL,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_secciones_rest ON checklist_secciones(restaurante_id);
CREATE INDEX idx_checklist_secciones_plaza ON checklist_secciones(plaza);

ALTER TABLE checklist_secciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_secciones_all" ON checklist_secciones FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_secciones;

-- Agregar columnas a checklist_items si ya existe
-- seccion_id referencia a checklist_secciones, prioridad para mise
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS seccion_id uuid;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'chk';
