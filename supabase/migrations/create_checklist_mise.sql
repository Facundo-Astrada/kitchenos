-- ============================================================
-- Checklist Mise en Place — KitchenOS
-- ============================================================

-- Items de checklist por plaza
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza text NOT NULL,
  seccion text NOT NULL DEFAULT 'estacion',
  nombre text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  unidad text NOT NULL DEFAULT 'u',
  ubicacion text,
  receta_id uuid,
  orden integer NOT NULL DEFAULT 0,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_items_rest ON checklist_items(restaurante_id);
CREATE INDEX idx_checklist_items_plaza ON checklist_items(plaza);

-- Registros diarios de completado
CREATE TABLE IF NOT EXISTS checklist_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  completado boolean NOT NULL DEFAULT false,
  usuario_id text,
  hora_completado timestamptz,
  turno text NOT NULL DEFAULT 'apertura',
  UNIQUE(checklist_item_id, fecha, turno)
);

CREATE INDEX idx_checklist_registros_fecha ON checklist_registros(fecha);
CREATE INDEX idx_checklist_registros_item ON checklist_registros(checklist_item_id);

-- RLS permisivo para desarrollo
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_items_all" ON checklist_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "checklist_registros_all" ON checklist_registros FOR ALL USING (true) WITH CHECK (true);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_registros;
