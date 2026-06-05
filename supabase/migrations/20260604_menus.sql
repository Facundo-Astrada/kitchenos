-- ════════════════════════════════════════════════════════════════
-- MENÚS — capa por encima del plato (Carta → Menú → Producción)
-- Un Menú es una composición ordenada por "pasos" (cursos).
-- Cada preparación puede ser un plato (carta_item), una receta o un
-- ingrediente bruto (producto), con prioridad y delegación a plaza/usuario.
-- tipo: 'fijo' | 'evento'
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'fijo',        -- 'fijo' | 'evento'
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_preparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  paso TEXT NOT NULL DEFAULT 'Principal',   -- curso: Apetizer, Entrada, Principal, Postre…
  tipo TEXT,                                -- 'plato' | 'receta' | 'producto' | NULL (suelto)
  ref_id UUID,                              -- id del carta_item / receta / producto (polimórfico, sin FK dura)
  nombre TEXT NOT NULL,
  prioridad TEXT NOT NULL DEFAULT 'media',  -- 'critica' | 'alta' | 'media' | 'baja'  (SP/P/REF/Check)
  plaza TEXT,                               -- plaza delegada (parrilla, fríos…)
  seccion_mise TEXT,                        -- sección fina del checklist de mise (Heladera, Secos/Tuppers, Congelados…)
  usuario_asignado TEXT,                    -- equipo_miembros.id (como texto, igual que produccion_diaria)
  cantidad NUMERIC,
  unidad TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recargar el schema cache de PostgREST para que el cliente browser vea las tablas/columnas nuevas
NOTIFY pgrst, 'reload schema';

-- ── Índices ──
CREATE INDEX IF NOT EXISTS idx_menus_restaurante ON menus(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_menu_prep_menu ON menu_preparaciones(menu_id);

-- ── RLS ──
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_preparaciones ENABLE ROW LEVEL SECURITY;

-- menus: aislamiento directo por restaurante_id
DROP POLICY IF EXISTS menus_select ON menus;
DROP POLICY IF EXISTS menus_insert ON menus;
DROP POLICY IF EXISTS menus_update ON menus;
DROP POLICY IF EXISTS menus_delete ON menus;

CREATE POLICY menus_select ON menus FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY menus_insert ON menus FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY menus_update ON menus FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY menus_delete ON menus FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

-- menu_preparaciones: tabla hija, aislar vía FK al menú padre
DROP POLICY IF EXISTS menu_prep_select ON menu_preparaciones;
DROP POLICY IF EXISTS menu_prep_insert ON menu_preparaciones;
DROP POLICY IF EXISTS menu_prep_update ON menu_preparaciones;
DROP POLICY IF EXISTS menu_prep_delete ON menu_preparaciones;

CREATE POLICY menu_prep_select ON menu_preparaciones FOR SELECT TO authenticated
  USING (menu_id IN (SELECT id FROM menus WHERE restaurante_id = mi_restaurante_id()));
CREATE POLICY menu_prep_insert ON menu_preparaciones FOR INSERT TO authenticated
  WITH CHECK (menu_id IN (SELECT id FROM menus WHERE restaurante_id = mi_restaurante_id()));
CREATE POLICY menu_prep_update ON menu_preparaciones FOR UPDATE TO authenticated
  USING (menu_id IN (SELECT id FROM menus WHERE restaurante_id = mi_restaurante_id()))
  WITH CHECK (menu_id IN (SELECT id FROM menus WHERE restaurante_id = mi_restaurante_id()));
CREATE POLICY menu_prep_delete ON menu_preparaciones FOR DELETE TO authenticated
  USING (menu_id IN (SELECT id FROM menus WHERE restaurante_id = mi_restaurante_id()));
