-- Tareas module
CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  plaza text,
  prioridad text NOT NULL DEFAULT 'media',
  asignado_a text,
  creado_por text,
  tiempo_estimado_min integer,
  fecha_limite date,
  status text NOT NULL DEFAULT 'pendiente',
  categoria text NOT NULL DEFAULT 'general',
  receta_id uuid,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  restaurante_id uuid NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tareas_restaurante ON tareas(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_tareas_status ON tareas(status);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha ON tareas(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_tareas_receta ON tareas(receta_id);

-- RLS
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tareas_read" ON tareas FOR SELECT USING (true);
CREATE POLICY "tareas_insert" ON tareas FOR INSERT WITH CHECK (true);
CREATE POLICY "tareas_update" ON tareas FOR UPDATE USING (true);
CREATE POLICY "tareas_delete" ON tareas FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tareas;
