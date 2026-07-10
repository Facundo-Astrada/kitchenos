-- Migration: cajas_turnos (2026-07-07)
-- M1a: Arqueo y cierre de caja por turno. Referencia: Fudo/Ganapán/CajaOS.
-- cajas_turnos: una fila por apertura/cierre de caja. caja_movimientos: retiros/ingresos intermedios.

CREATE TABLE IF NOT EXISTS public.cajas_turnos (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id    UUID          NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  estado            TEXT          NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  abierta_por       TEXT          NULL,   -- equipo_miembros.id (sin FK dura, mismo patrón que tareas.creado_por)
  fecha_apertura    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  monto_inicial     NUMERIC(12,2) NOT NULL DEFAULT 0,
  cerrada_por       TEXT          NULL,
  fecha_cierre      TIMESTAMPTZ   NULL,
  montos_esperados  JSONB         NULL,   -- { [medio_id]: monto_esperado } — snapshot calculado al cerrar
  montos_declarados JSONB         NULL,   -- { [medio_id]: monto_declarado } — lo que contó el usuario
  diferencia_total  NUMERIC(12,2) NULL,
  arqueo_ciego      BOOLEAN       NOT NULL DEFAULT false,
  notas             TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.cajas_turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cajas_turnos_select" ON public.cajas_turnos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "cajas_turnos_insert" ON public.cajas_turnos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "cajas_turnos_update" ON public.cajas_turnos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "cajas_turnos_delete" ON public.cajas_turnos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_cajas_turnos_restaurante ON public.cajas_turnos(restaurante_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cajas_turnos_una_abierta
  ON public.cajas_turnos(restaurante_id) WHERE estado = 'abierta';

-- caja_movimientos: retiros/ingresos intermedios durante un turno de caja abierto
CREATE TABLE IF NOT EXISTS public.caja_movimientos (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_turno_id UUID          NOT NULL REFERENCES public.cajas_turnos(id) ON DELETE CASCADE,
  medio_id      UUID          NOT NULL REFERENCES public.medios_pago(id) ON DELETE RESTRICT,
  tipo          TEXT          NOT NULL CHECK (tipo IN ('retiro', 'ingreso')),
  monto         NUMERIC(12,2) NOT NULL,
  motivo        TEXT          NULL,
  creado_por    TEXT          NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;

-- RLS vía padre (cajas_turnos tiene restaurante_id) — mismo patrón que pagos↔cuentas
CREATE POLICY "caja_movimientos_select" ON public.caja_movimientos FOR SELECT TO authenticated
  USING (caja_turno_id IN (
    SELECT id FROM public.cajas_turnos WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "caja_movimientos_insert" ON public.caja_movimientos FOR INSERT TO authenticated
  WITH CHECK (caja_turno_id IN (
    SELECT id FROM public.cajas_turnos WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "caja_movimientos_delete" ON public.caja_movimientos FOR DELETE TO authenticated
  USING (caja_turno_id IN (
    SELECT id FROM public.cajas_turnos WHERE restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_turno ON public.caja_movimientos(caja_turno_id);

NOTIFY pgrst, 'reload schema';
