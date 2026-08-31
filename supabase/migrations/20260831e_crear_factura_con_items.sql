-- Día 8 del plan consolidado (dominio-kos.md §4.1, arquitectura-kos.md §3.1):
-- useFacturas.crearFactura eran ~235 líneas multi-tabla en el browser sin
-- transacción. El alcance correcto de la atomicidad es factura+items
-- SOLAMENTE — matching de productos, stock, precios e historial son efectos
-- sobre OTRO agregado (Stock) y quedan fuera de esta función a propósito:
-- lib/facturas/matching.ts los aplica aparte, después de que esta rpc
-- confirma que el documento (factura+items) ya existe completo. Antes, un
-- corte de red a mitad del script podía dejar la factura sin todos sus
-- items; ahora ese par se escribe entero o no se escribe nada.
--
-- SECURITY INVOKER (default explícito, mismo motivo que
-- 20260831_reemplazar_menu_preparaciones): corre con las RLS del usuario que
-- llama. mi_restaurante_id() resuelve el tenant desde auth.uid() — no hace
-- falta que el cliente lo mande, y el WITH CHECK de facturas/factura_items
-- ya lo exige igual.
CREATE OR REPLACE FUNCTION public.crear_factura_con_items(
  p_proveedor_nombre TEXT,
  p_proveedor_cuit TEXT,
  p_fecha_factura DATE,
  p_tipo_factura TEXT,
  p_numero_factura TEXT,
  p_subtotal NUMERIC,
  p_iva_total NUMERIC,
  p_total NUMERIC,
  p_condicion_pago TEXT,
  p_imagen_url TEXT,
  p_notas TEXT,
  p_categoria_gasto_id UUID,
  p_medio_pago_id UUID,
  p_fecha_vencimiento DATE,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_restaurante_id UUID := mi_restaurante_id();
  v_factura_id UUID;
BEGIN
  IF v_restaurante_id IS NULL THEN
    RAISE EXCEPTION 'Sin restaurante activo' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.facturas (
    proveedor_nombre, proveedor_cuit, fecha_factura, tipo_factura, numero_factura,
    subtotal, iva_total, total, condicion_pago, imagen_url, status, notas,
    categoria_gasto_id, medio_pago_id, fecha_vencimiento, restaurante_id
  ) VALUES (
    p_proveedor_nombre, p_proveedor_cuit, p_fecha_factura, p_tipo_factura, p_numero_factura,
    p_subtotal, p_iva_total, p_total, p_condicion_pago, p_imagen_url, 'confirmada', p_notas,
    p_categoria_gasto_id, p_medio_pago_id, p_fecha_vencimiento, v_restaurante_id
  ) RETURNING id INTO v_factura_id;

  -- producto_id ya viene resuelto por el caller (match contra productos
  -- existentes, o recién creado) — esta función no matchea ni crea nada,
  -- solo persiste factura+items con lo que ya se decidió.
  INSERT INTO public.factura_items (
    factura_id, producto_nombre, producto_id, cantidad, unidad,
    precio_unitario, alicuota_iva, subtotal, precio_anterior
  )
  SELECT
    v_factura_id, x.producto_nombre, x.producto_id, x.cantidad, x.unidad,
    x.precio_unitario, x.alicuota_iva, x.subtotal, x.precio_anterior
  FROM jsonb_to_recordset(p_items) AS x(
    producto_nombre TEXT, producto_id UUID, cantidad NUMERIC, unidad TEXT,
    precio_unitario NUMERIC, alicuota_iva NUMERIC, subtotal NUMERIC, precio_anterior NUMERIC
  );

  RETURN v_factura_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_factura_con_items(
  TEXT, TEXT, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_factura_con_items(
  TEXT, TEXT, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID, DATE, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
