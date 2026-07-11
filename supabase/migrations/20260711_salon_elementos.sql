CREATE TABLE IF NOT EXISTS salon_elementos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'otro', -- 'barra' | 'caja' | 'parrilla' | 'planta' | 'pared' | 'otro'
  label TEXT NULL,
  pos_x NUMERIC NOT NULL DEFAULT 40,
  pos_y NUMERIC NOT NULL DEFAULT 10,
  ancho NUMERIC NOT NULL DEFAULT 14,
  alto NUMERIC NOT NULL DEFAULT 8,
  rotacion INT NOT NULL DEFAULT 0,
  color TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE salon_elementos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salon_elementos_select" ON salon_elementos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "salon_elementos_insert" ON salon_elementos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "salon_elementos_update" ON salon_elementos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "salon_elementos_delete" ON salon_elementos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_salon_elementos_restaurante ON salon_elementos(restaurante_id);

NOTIFY pgrst, 'reload schema';
