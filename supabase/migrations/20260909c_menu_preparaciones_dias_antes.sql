-- PRODUCCIÓN ESCALONADA DE EVENTOS (sesión 2026-09-09)
--
-- Un evento se cocina desde días antes: el fondo el miércoles, el curado el
-- jueves, el porcionado el viernes, la terminación el sábado. Hasta hoy
-- `activarMenuParaFechas` copiaba TODAS las preparaciones a CADA fecha del
-- rango elegido en el calendario — activar un evento del sábado para lun-sáb
-- daba la lista entera seis veces, no un cronograma.
--
-- `dias_antes` es la anticipación de ESA preparación respecto del día del
-- evento (`menus.fecha_evento`): 0 = el día del evento, 3 = tres días antes.
-- NOT NULL DEFAULT 0 a propósito — todo lo ya cargado sigue cayendo el día
-- del evento, que es exactamente el comportamiento de hoy.
--
-- No aplica al menú fijo: ése entra por vigencia al mise, no por fecha a
-- Producción (una puerta por tipo, adenda 2026-08-20).

ALTER TABLE public.menu_preparaciones
  ADD COLUMN IF NOT EXISTS dias_antes INTEGER NOT NULL DEFAULT 0;

-- `reemplazar_menu_preparaciones` (20260831, +pax en 20260909) reemplaza las
-- preparaciones en una sola transacción. La firma NO cambia (dias_antes viaja
-- dentro de p_preparaciones JSONB), así que alcanza con CREATE OR REPLACE y
-- no hace falta DROP ni re-GRANT.
CREATE OR REPLACE FUNCTION public.reemplazar_menu_preparaciones(
  p_menu_id UUID,
  p_nombre TEXT,
  p_tipo TEXT,
  p_descripcion TEXT,
  p_fecha_evento DATE,
  p_vigencia_desde DATE,
  p_vigencia_hasta DATE,
  p_plaza_control TEXT,
  p_variantes TEXT[],
  p_precio NUMERIC,
  p_preparaciones JSONB,
  p_pax INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.menus SET
    nombre = p_nombre,
    tipo = p_tipo,
    descripcion = p_descripcion,
    fecha_evento = p_fecha_evento,
    vigencia_desde = p_vigencia_desde,
    vigencia_hasta = p_vigencia_hasta,
    plaza_control = p_plaza_control,
    variantes = p_variantes,
    precio = p_precio,
    pax = p_pax,
    updated_at = now()
  WHERE id = p_menu_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menú % no encontrado o sin permiso', p_menu_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_preparaciones WHERE menu_id = p_menu_id;

  INSERT INTO public.menu_preparaciones (
    menu_id, paso, tipo, ref_id, nombre, prioridad, plaza, seccion_mise,
    usuario_asignado, cantidad, unidad, variante, cantidad_ops, unidad_ops,
    recipiente_nombre, peso_porcion, peso_porcion_unidad, orden, nota, dias_antes
  )
  SELECT
    p_menu_id, x.paso, x.tipo, x.ref_id, x.nombre, x.prioridad, x.plaza, x.seccion_mise,
    x.usuario_asignado, x.cantidad, x.unidad, x.variante, x.cantidad_ops, x.unidad_ops,
    x.recipiente_nombre, x.peso_porcion, x.peso_porcion_unidad, x.orden, x.nota,
    COALESCE(x.dias_antes, 0)
  FROM jsonb_to_recordset(p_preparaciones) AS x(
    paso TEXT, tipo TEXT, ref_id UUID, nombre TEXT, prioridad TEXT, plaza TEXT,
    seccion_mise TEXT, usuario_asignado TEXT, cantidad NUMERIC, unidad TEXT,
    variante TEXT, cantidad_ops NUMERIC, unidad_ops TEXT, recipiente_nombre TEXT,
    peso_porcion NUMERIC, peso_porcion_unidad TEXT, orden INT, nota TEXT,
    dias_antes INT
  );
END;
$$;

-- CREATE OR REPLACE no conserva el SET search_path de la firma (mismo motivo
-- que 20260831c) — se refija.
ALTER FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB, INTEGER
) SET search_path = public;

NOTIFY pgrst, 'reload schema';
