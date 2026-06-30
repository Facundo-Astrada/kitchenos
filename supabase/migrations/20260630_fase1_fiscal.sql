-- =============================================
-- Fase 1 · Bloque 4: Fiscal (solo estructura — sin integración ARCA)
-- config_fiscal, comprobantes, comprobante_items
-- cert_ref es referencia al secret store; jamás el archivo en la tabla
-- =============================================

-- 1. config_fiscal  (1 fila por restaurante, UNIQUE por restaurante_id)
CREATE TABLE IF NOT EXISTS public.config_fiscal (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID    NOT NULL UNIQUE REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  condicion      TEXT    NOT NULL CHECK (condicion IN ('monotributo','RI')),
  cuit           TEXT    NOT NULL,
  puntos_venta   INT[]   NOT NULL DEFAULT '{}',
  cert_ref       TEXT,        -- referencia al secret store (ej. nombre del secreto), NUNCA el .crt/.key
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.config_fiscal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_fiscal_select" ON public.config_fiscal FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "config_fiscal_insert" ON public.config_fiscal FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "config_fiscal_update" ON public.config_fiscal FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "config_fiscal_delete" ON public.config_fiscal FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_config_fiscal_restaurante ON public.config_fiscal(restaurante_id);

-- 2. comprobantes
CREATE TABLE IF NOT EXISTS public.comprobantes (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      UUID           NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  cuenta_id           UUID           REFERENCES public.cuentas(id) ON DELETE SET NULL,
  tipo                TEXT           NOT NULL CHECK (tipo IN ('A','B','C','NC','ND')),
  punto_venta         INT            NOT NULL,
  numero              BIGINT,
  cae                 TEXT,
  cae_vencimiento     DATE,
  estado              TEXT           NOT NULL DEFAULT 'pendiente'
                                       CHECK (estado IN ('pendiente','emitido','rechazado','anulado')),
  receptor_cuit       TEXT,
  receptor_condicion_iva TEXT,
  subtotal            NUMERIC(12,2)  NOT NULL DEFAULT 0,
  iva                 NUMERIC(12,2)  NOT NULL DEFAULT 0,
  total               NUMERIC(12,2)  NOT NULL DEFAULT 0,
  qr_data             TEXT,
  arca_raw            JSONB,          -- respuesta cruda de ARCA/WSFE para auditoría
  emitido_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.comprobantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comprobantes_select" ON public.comprobantes FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY "comprobantes_insert" ON public.comprobantes FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "comprobantes_update" ON public.comprobantes FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY "comprobantes_delete" ON public.comprobantes FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_comprobantes_restaurante ON public.comprobantes(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_cuenta ON public.comprobantes(cuenta_id) WHERE cuenta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comprobantes_estado ON public.comprobantes(restaurante_id, estado);
CREATE INDEX IF NOT EXISTS idx_comprobantes_numero ON public.comprobantes(restaurante_id, punto_venta, tipo, numero);

-- 3. comprobante_items
CREATE TABLE IF NOT EXISTS public.comprobante_items (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id  UUID           NOT NULL REFERENCES public.comprobantes(id) ON DELETE CASCADE,
  descripcion     TEXT           NOT NULL,
  cantidad        NUMERIC(10,4)  NOT NULL DEFAULT 1,
  precio          NUMERIC(12,2)  NOT NULL,
  alicuota_iva    NUMERIC(5,2)   NOT NULL DEFAULT 21,  -- porcentaje: 0, 10.5, 21
  subtotal        NUMERIC(12,2)  NOT NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.comprobante_items ENABLE ROW LEVEL SECURITY;

-- RLS via comprobante padre
CREATE POLICY "comprobante_items_select" ON public.comprobante_items FOR SELECT TO authenticated
  USING (comprobante_id IN (
    SELECT id FROM public.comprobantes WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comprobante_items_insert" ON public.comprobante_items FOR INSERT TO authenticated
  WITH CHECK (comprobante_id IN (
    SELECT id FROM public.comprobantes WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comprobante_items_update" ON public.comprobante_items FOR UPDATE TO authenticated
  USING (comprobante_id IN (
    SELECT id FROM public.comprobantes WHERE restaurante_id = mi_restaurante_id()
  ))
  WITH CHECK (comprobante_id IN (
    SELECT id FROM public.comprobantes WHERE restaurante_id = mi_restaurante_id()
  ));
CREATE POLICY "comprobante_items_delete" ON public.comprobante_items FOR DELETE TO authenticated
  USING (comprobante_id IN (
    SELECT id FROM public.comprobantes WHERE restaurante_id = mi_restaurante_id()
  ));

CREATE INDEX IF NOT EXISTS idx_comprobante_items_comprobante ON public.comprobante_items(comprobante_id);

NOTIFY pgrst, 'reload schema';
