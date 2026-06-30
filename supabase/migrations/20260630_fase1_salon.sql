-- =============================================
-- Fase 1 · Bloque 2: Salón
-- mesas (con posiciones x/y para mapa visual), cuentas
-- + FKs retroactivas a comandas (mesa_id, cuenta_id)
-- =============================================

-- 1. mesas
CREATE TABLE IF NOT EXISTS public.mesas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  numero         TEXT        NOT NULL,
  sector         TEXT,
  capacidad      INT,
  estado         TEXT        NOT NULL DEFAULT 'libre'
                               CHECK (estado IN ('libre','ocupada','cuenta_pedida')),
  pos_x          NUMERIC     NOT NULL DEFAULT 0,
  pos_y          NUMERIC     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mesas_select" ON public.mesas FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "mesas_insert" ON public.mesas FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "mesas_update" ON public.mesas FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "mesas_delete" ON public.mesas FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_mesas_restaurante ON public.mesas(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mesas_estado ON public.mesas(restaurante_id, estado);

-- 2. cuentas
CREATE TABLE IF NOT EXISTS public.cuentas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  mesa_id        UUID        REFERENCES public.mesas(id) ON DELETE SET NULL,
  estado         TEXT        NOT NULL DEFAULT 'abierta'
                               CHECK (estado IN ('abierta','cerrada')),
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  mozo_id        UUID        REFERENCES public.equipo_miembros(id) ON DELETE SET NULL,
  abierta_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_select" ON public.cuentas FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "cuentas_insert" ON public.cuentas FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "cuentas_update" ON public.cuentas FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "cuentas_delete" ON public.cuentas FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_cuentas_restaurante ON public.cuentas(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_mesa ON public.cuentas(mesa_id) WHERE mesa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cuentas_estado ON public.cuentas(restaurante_id, estado);

-- 3. FKs retroactivas en comandas (creada en bloque 1 sin estas constraints)
ALTER TABLE public.comandas
  ADD CONSTRAINT fk_comandas_mesa
    FOREIGN KEY (mesa_id) REFERENCES public.mesas(id) ON DELETE SET NULL;

ALTER TABLE public.comandas
  ADD CONSTRAINT fk_comandas_cuenta
    FOREIGN KEY (cuenta_id) REFERENCES public.cuentas(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
