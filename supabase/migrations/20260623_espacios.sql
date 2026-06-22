-- ════════════════════════════════════════════════════════════════
-- ESPACIOS — capa de espacios físicos por encima de las plazas
-- Mesa de trabajo: ESPACIO (cocina/salón/almacén/centro de prod…)
--   → agrupa PLAZAS (las 7 fijas: parrilla/frios/calientes/pase/
--     pasteleria/panaderia/general)
--   → cada plaza muestra sus SECCIONES (checklist_secciones)
--   → cada sección muestra sus PRODUCCIONES (checklist_items)
-- Las plazas NO se modelan en DB (siguen hardcodeadas); este join
-- solo declara qué plazas pertenecen a cada espacio editable.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS espacios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  icono TEXT NOT NULL DEFAULT 'kitchen',     -- Material Symbol
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS espacio_plazas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,              -- denormalizado → RLS directo
  espacio_id UUID NOT NULL REFERENCES espacios(id) ON DELETE CASCADE,
  plaza_key TEXT NOT NULL,                   -- una de las 7 plazas fijas
  orden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (espacio_id, plaza_key)
);

-- Recargar el schema cache de PostgREST para que el cliente browser vea las tablas nuevas
NOTIFY pgrst, 'reload schema';

-- ── Índices ──
CREATE INDEX IF NOT EXISTS idx_espacios_restaurante ON espacios(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_espacio_plazas_espacio ON espacio_plazas(espacio_id);
CREATE INDEX IF NOT EXISTS idx_espacio_plazas_restaurante ON espacio_plazas(restaurante_id);

-- ── RLS ──
ALTER TABLE espacios ENABLE ROW LEVEL SECURITY;
ALTER TABLE espacio_plazas ENABLE ROW LEVEL SECURITY;

-- espacios: aislamiento directo por restaurante_id
DROP POLICY IF EXISTS espacios_select ON espacios;
DROP POLICY IF EXISTS espacios_insert ON espacios;
DROP POLICY IF EXISTS espacios_update ON espacios;
DROP POLICY IF EXISTS espacios_delete ON espacios;

CREATE POLICY espacios_select ON espacios FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY espacios_insert ON espacios FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY espacios_update ON espacios FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY espacios_delete ON espacios FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

-- espacio_plazas: aislamiento directo + verificar que el espacio sea del tenant
DROP POLICY IF EXISTS espacio_plazas_select ON espacio_plazas;
DROP POLICY IF EXISTS espacio_plazas_insert ON espacio_plazas;
DROP POLICY IF EXISTS espacio_plazas_update ON espacio_plazas;
DROP POLICY IF EXISTS espacio_plazas_delete ON espacio_plazas;

CREATE POLICY espacio_plazas_select ON espacio_plazas FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY espacio_plazas_insert ON espacio_plazas FOR INSERT TO authenticated
  WITH CHECK (
    restaurante_id = mi_restaurante_id()
    AND espacio_id IN (SELECT id FROM espacios WHERE restaurante_id = mi_restaurante_id())
  );
CREATE POLICY espacio_plazas_update ON espacio_plazas FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY espacio_plazas_delete ON espacio_plazas FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());
