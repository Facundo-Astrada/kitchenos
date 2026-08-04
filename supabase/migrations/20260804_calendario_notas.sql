-- Notas del calendario: una por día por restaurante, vinculada a la fecha
-- (no al evento). Sirve para organizar la semana y tomar notas en reuniones.

CREATE TABLE IF NOT EXISTS calendario_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  contenido TEXT NOT NULL DEFAULT '',
  autor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_calendario_notas_restaurante_fecha
  ON calendario_notas(restaurante_id, fecha);

ALTER TABLE calendario_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendario_notas_select" ON calendario_notas FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_notas_insert" ON calendario_notas FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_notas_update" ON calendario_notas FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_notas_delete" ON calendario_notas FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

NOTIFY pgrst, 'reload schema';
