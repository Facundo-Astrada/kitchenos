CREATE TABLE IF NOT EXISTS produccion_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  receta_id uuid REFERENCES recetas(id) ON DELETE SET NULL,
  tarea_id uuid REFERENCES tareas(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cantidad_planificada numeric,
  cantidad_real numeric,
  multiplicador_real numeric NOT NULL DEFAULT 1,
  usuario_id uuid,
  usuario_nombre text,
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_reg_receta ON produccion_registros(receta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_reg_rest ON produccion_registros(restaurante_id, fecha DESC);
