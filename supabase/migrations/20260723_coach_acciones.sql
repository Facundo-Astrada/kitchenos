-- Kitchen Coach: sistema propose->confirm.
-- Draft + auditoria en una sola tabla: el confirm endpoint hace un UPDATE atomico
-- (pendiente -> confirmada/cancelada/error) en vez de mover filas entre tablas.

CREATE TABLE coach_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id),
  tool_name text NOT NULL CHECK (tool_name IN
    ('crear_tarea', 'marcar_86', 'registrar_merma', 'cargar_producto', 'ajustar_stock', 'registrar_venta')),
  screen text,
  input_propuesto jsonb NOT NULL,
  input_confirmado jsonb,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'expirada', 'error')),
  resultado_texto text,
  resultado_error text,
  creado_por uuid NOT NULL REFERENCES auth.users(id),
  resuelto_por uuid REFERENCES auth.users(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  expira_en timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE coach_acciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_acciones_select" ON coach_acciones FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "coach_acciones_insert" ON coach_acciones FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id() AND creado_por = auth.uid());

-- Solo editable mientras sigue pendiente: protege el registro historico de edicion posterior.
-- Cualquier usuario del restaurante puede confirmar/cancelar el draft de otro (mismo criterio
-- que Pase: chat de equipo compartido, no por-usuario).
CREATE POLICY "coach_acciones_update" ON coach_acciones FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND estado = 'pendiente')
  WITH CHECK (restaurante_id = mi_restaurante_id());

-- Sin policy de DELETE: no se borra fisico, queda como historial (ver 'expirada').

CREATE INDEX idx_coach_acciones_restaurante ON coach_acciones(restaurante_id);
CREATE INDEX idx_coach_acciones_pendientes ON coach_acciones(restaurante_id, creado_en) WHERE estado = 'pendiente';

NOTIFY pgrst, 'reload schema';
