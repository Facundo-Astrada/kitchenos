-- Día 2 del plan consolidado (invariantes a la base, 1/2): actualizarMenu
-- hacía UPDATE menus + DELETE menu_preparaciones + INSERT menu_preparaciones
-- como 3 round-trips separados desde el browser. Un corte de red entre el
-- DELETE y el INSERT dejaba el menú sin preparaciones — el único write de la
-- app que pierde datos ante un corte a mitad de camino.
--
-- Esta función corre las tres operaciones dentro del cuerpo de una función
-- Postgres, que Postgres ejecuta como una única transacción implícita: si
-- algo falla o la conexión se corta, todo el bloque revierte en vez de
-- quedar a medio camino.
--
-- SECURITY INVOKER (default explícito): corre con los permisos/RLS del
-- usuario que llama, igual que las queries que reemplaza — no hace falta
-- bypass, y evita repetir el problema que forzó la revocación de EXECUTE en
-- 20260827_revoke_execute_security_definer.sql.
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
  p_preparaciones JSONB
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
    updated_at = now()
  WHERE id = p_menu_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menú % no encontrado o sin permiso', p_menu_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_preparaciones WHERE menu_id = p_menu_id;

  INSERT INTO public.menu_preparaciones (
    menu_id, paso, tipo, ref_id, nombre, prioridad, plaza, seccion_mise,
    usuario_asignado, cantidad, unidad, variante, cantidad_ops, unidad_ops,
    recipiente_nombre, peso_porcion, peso_porcion_unidad, orden
  )
  SELECT
    p_menu_id, x.paso, x.tipo, x.ref_id, x.nombre, x.prioridad, x.plaza, x.seccion_mise,
    x.usuario_asignado, x.cantidad, x.unidad, x.variante, x.cantidad_ops, x.unidad_ops,
    x.recipiente_nombre, x.peso_porcion, x.peso_porcion_unidad, x.orden
  FROM jsonb_to_recordset(p_preparaciones) AS x(
    paso TEXT, tipo TEXT, ref_id UUID, nombre TEXT, prioridad TEXT, plaza TEXT,
    seccion_mise TEXT, usuario_asignado TEXT, cantidad NUMERIC, unidad TEXT,
    variante TEXT, cantidad_ops NUMERIC, unidad_ops TEXT, recipiente_nombre TEXT,
    peso_porcion NUMERIC, peso_porcion_unidad TEXT, orden INT
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
