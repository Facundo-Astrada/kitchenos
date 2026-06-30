-- =============================================
-- Fase 1 · Bloque 1: Núcleo de servicio
-- estaciones, comandas, comanda_items,
-- comanda_item_modificadores, eventos_cocina
-- =============================================

-- 1. estaciones
CREATE TABLE IF NOT EXISTS public.estaciones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT        NOT NULL,
  pantalla_asignada TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.estaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estaciones_select" ON public.estaciones FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "estaciones_insert" ON public.estaciones FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "estaciones_update" ON public.estaciones FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "estaciones_delete" ON public.estaciones FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_estaciones_restaurante ON public.estaciones(restaurante_id);

-- 2. comandas
-- mesa_id / cuenta_id declarados como UUID simple; las FKs se agregan en bloque 2 (salon)
CREATE TABLE IF NOT EXISTS public.comandas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  origen         TEXT        NOT NULL CHECK (origen IN ('salon','mostrador','delivery','marca')),
  mesa_id        UUID,
  mozo_id        UUID        REFERENCES public.equipo_miembros(id) ON DELETE SET NULL,
  cuenta_id      UUID,
  estado         TEXT        NOT NULL DEFAULT 'abierta'
                               CHECK (estado IN ('abierta','enviada','en_prep','lista','cerrada','cancelada')),
  course         INT,
  marca          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comandas_select" ON public.comandas FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "comandas_insert" ON public.comandas FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "comandas_update" ON public.comandas FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "comandas_delete" ON public.comandas FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_comandas_restaurante ON public.comandas(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_comandas_mesa ON public.comandas(mesa_id) WHERE mesa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comandas_estado ON public.comandas(restaurante_id, estado);

-- 3. comanda_items
CREATE TABLE IF NOT EXISTS public.comanda_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id     UUID        NOT NULL REFERENCES public.comandas(id) ON DELETE CASCADE,
  carta_item_id  UUID        REFERENCES public.carta_items(id) ON DELETE SET NULL,
  cantidad       INT         NOT NULL DEFAULT 1,
  estado         TEXT        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente','en_prep','listo','bumpeado')),
  estacion_id    UUID        REFERENCES public.estaciones(id) ON DELETE SET NULL,
  fired_at       TIMESTAMPTZ,
  bumped_at      TIMESTAMPTZ,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comanda_items ENABLE ROW LEVEL SECURITY;

-- RLS via comanda padre (sin restaurante_id propio)
CREATE POLICY "comanda_items_select" ON public.comanda_items FOR SELECT TO authenticated
  USING (comanda_id IN (
    SELECT id FROM public.comandas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_items_insert" ON public.comanda_items FOR INSERT TO authenticated
  WITH CHECK (comanda_id IN (
    SELECT id FROM public.comandas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_items_update" ON public.comanda_items FOR UPDATE TO authenticated
  USING (comanda_id IN (
    SELECT id FROM public.comandas WHERE restaurante_id = mi_restaurante_id()
  ))
  WITH CHECK (comanda_id IN (
    SELECT id FROM public.comandas WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_items_delete" ON public.comanda_items FOR DELETE TO authenticated
  USING (comanda_id IN (
    SELECT id FROM public.comandas WHERE restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_comanda_items_comanda ON public.comanda_items(comanda_id);
CREATE INDEX IF NOT EXISTS idx_comanda_items_estado ON public.comanda_items(estado);
CREATE INDEX IF NOT EXISTS idx_comanda_items_estacion ON public.comanda_items(estacion_id) WHERE estacion_id IS NOT NULL;

-- 4. comanda_item_modificadores
CREATE TABLE IF NOT EXISTS public.comanda_item_modificadores (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_item_id UUID    NOT NULL REFERENCES public.comanda_items(id) ON DELETE CASCADE,
  tipo            TEXT    NOT NULL CHECK (tipo IN ('con','sin','extra')),
  texto           TEXT    NOT NULL,
  flag_alergeno   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comanda_item_modificadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comanda_item_modificadores_select" ON public.comanda_item_modificadores
  FOR SELECT TO authenticated
  USING (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_item_modificadores_insert" ON public.comanda_item_modificadores
  FOR INSERT TO authenticated
  WITH CHECK (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_item_modificadores_update" ON public.comanda_item_modificadores
  FOR UPDATE TO authenticated
  USING (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ))
  WITH CHECK (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comanda_item_modificadores_delete" ON public.comanda_item_modificadores
  FOR DELETE TO authenticated
  USING (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_comanda_item_mods_item ON public.comanda_item_modificadores(comanda_item_id);

-- 5. eventos_cocina  (alimenta métricas speed-of-service)
CREATE TABLE IF NOT EXISTS public.eventos_cocina (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_item_id UUID        NOT NULL REFERENCES public.comanda_items(id) ON DELETE CASCADE,
  evento          TEXT        NOT NULL CHECK (evento IN ('fired','bumped','recalled')),
  ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos_cocina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_cocina_select" ON public.eventos_cocina FOR SELECT TO authenticated
  USING (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "eventos_cocina_insert" ON public.eventos_cocina FOR INSERT TO authenticated
  WITH CHECK (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "eventos_cocina_delete" ON public.eventos_cocina FOR DELETE TO authenticated
  USING (comanda_item_id IN (
    SELECT ci.id FROM public.comanda_items ci
    JOIN   public.comandas c ON c.id = ci.comanda_id
    WHERE  c.restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_eventos_cocina_item ON public.eventos_cocina(comanda_item_id);
CREATE INDEX IF NOT EXISTS idx_eventos_cocina_ts ON public.eventos_cocina(ts);

NOTIFY pgrst, 'reload schema';
