-- =============================================
-- Fase 1 · Bloque 3: Cobro
-- medios_pago, pagos
-- =============================================

-- 1. medios_pago
CREATE TABLE IF NOT EXISTS public.medios_pago (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID    NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT    NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.medios_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medios_pago_select" ON public.medios_pago FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "medios_pago_insert" ON public.medios_pago FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "medios_pago_update" ON public.medios_pago FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "medios_pago_delete" ON public.medios_pago FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_medios_pago_restaurante ON public.medios_pago(restaurante_id);

-- 2. pagos
CREATE TABLE IF NOT EXISTS public.pagos (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id  UUID           NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  medio_id   UUID           NOT NULL REFERENCES public.medios_pago(id) ON DELETE RESTRICT,
  monto      NUMERIC(12,2)  NOT NULL,
  propina    NUMERIC(12,2)  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

-- RLS via cuenta padre (cuenta tiene restaurante_id)
CREATE POLICY "pagos_select" ON public.pagos FOR SELECT TO authenticated
  USING (cuenta_id IN (
    SELECT id FROM public.cuentas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "pagos_insert" ON public.pagos FOR INSERT TO authenticated
  WITH CHECK (cuenta_id IN (
    SELECT id FROM public.cuentas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "pagos_update" ON public.pagos FOR UPDATE TO authenticated
  USING (cuenta_id IN (
    SELECT id FROM public.cuentas WHERE restaurante_id = mi_restaurante_id()
  ))
  WITH CHECK (cuenta_id IN (
    SELECT id FROM public.cuentas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "pagos_delete" ON public.pagos FOR DELETE TO authenticated
  USING (cuenta_id IN (
    SELECT id FROM public.cuentas WHERE restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_pagos_cuenta ON public.pagos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_medio ON public.pagos(medio_id);

NOTIFY pgrst, 'reload schema';
