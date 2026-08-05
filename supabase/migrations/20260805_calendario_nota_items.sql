-- Reemplaza calendario_notas (texto libre en un blob) por ítems individuales:
-- cada línea que escribe el usuario es su propio registro, con estado propio
-- (si se envió o no a Producción con una plaza elegida).
DROP TABLE IF EXISTS calendario_notas;

CREATE TABLE calendario_nota_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  texto TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  plaza TEXT,
  tarea_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendario_nota_items_restaurante_fecha
  ON calendario_nota_items(restaurante_id, fecha);

ALTER TABLE calendario_nota_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendario_nota_items_select" ON calendario_nota_items FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_nota_items_insert" ON calendario_nota_items FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_nota_items_update" ON calendario_nota_items FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "calendario_nota_items_delete" ON calendario_nota_items FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

NOTIFY pgrst, 'reload schema';
