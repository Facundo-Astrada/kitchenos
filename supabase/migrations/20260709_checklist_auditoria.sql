-- M4a/b: Checklists nivel auditoría (scoring + foto obligatoria + condicionales + workflow)
-- Alcance: checklist_rutina (controles periódicos) — no checklist_items (mise diario, OPS de stock).
-- Ver .claude/docs/columnas.md para la justificación de este scope.

ALTER TABLE checklist_rutina
  ADD COLUMN IF NOT EXISTS puntaje NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS requiere_foto BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condicion JSONB NULL;
-- puntaje: peso del ítem en el score de auditoría (NULL = rutina normal, sin scoring, comportamiento legacy intacto)
-- condicion: { "dependeDeId": "<rutina_id>", "mostrarSiEstado": "ok" | "fallo" } — NULL = siempre visible

ALTER TABLE checklist_rutina_registros
  ADD COLUMN IF NOT EXISTS estado TEXT NULL CHECK (estado IN ('ok', 'fallo')),
  ADD COLUMN IF NOT EXISTS foto_url TEXT NULL;
-- estado: NULL en rutinas sin scoring (solo se usa completado, igual que hoy).
--         'ok'/'fallo' en rutinas de auditoría (puntaje NOT NULL) — completado=true en ambos casos,
--         estado distingue si pasó el control o quedó documentado como falla.

CREATE TABLE IF NOT EXISTS checklist_auditorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  plaza TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  puntaje_obtenido NUMERIC NOT NULL,
  puntaje_posible NUMERIC NOT NULL,
  score NUMERIC NOT NULL,
  items_evaluados INTEGER NOT NULL DEFAULT 0,
  items_fallidos INTEGER NOT NULL DEFAULT 0,
  usuario_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, plaza, fecha)
);
-- Snapshot de una pasada de auditoría completa (todos los ítems aplicables del día evaluados).
-- Se re-escribe (upsert) si se corrige un ítem después de completar la pasada.

ALTER TABLE checklist_auditorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_auditorias_select" ON checklist_auditorias FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "checklist_auditorias_insert" ON checklist_auditorias FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "checklist_auditorias_update" ON checklist_auditorias FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "checklist_auditorias_delete" ON checklist_auditorias FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_checklist_auditorias_restaurante ON checklist_auditorias(restaurante_id, fecha DESC);

NOTIFY pgrst, 'reload schema';
