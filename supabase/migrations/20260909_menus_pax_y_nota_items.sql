-- Auditoría de carga de Plato/Menú/Evento (sesión 2026-09-09):
--
-- 1) `menus.pax` — un evento hoy no tiene comensales en ningún lado; el
--    número se escribe a mano dentro de "Descripción" (el placeholder incluso
--    lo sugiere). Sin esto no hay costo por cubierto ni forma de escalar
--    cantidades. Nullable: sigue siendo un ESTIMADO, no una reserva.
--
-- 2) `nota` en `menu_preparaciones` y `plato_recetas` — la única nota del
--    sistema hoy es `checklist_items.nota` (sep 2026), que solo se puede
--    escribir cuando el ítem YA está en el mise. El chef que está cargando
--    el menú piensa la anotación ("freír en la freidora chica") en el
--    momento de cargar, no después — esta columna la deja viajar desde ahí.

ALTER TABLE public.menus ADD COLUMN IF NOT EXISTS pax INTEGER NULL;
ALTER TABLE public.menu_preparaciones ADD COLUMN IF NOT EXISTS nota TEXT NULL;
ALTER TABLE public.plato_recetas ADD COLUMN IF NOT EXISTS nota TEXT NULL;

-- `reemplazar_menu_preparaciones` (20260831) hace UPDATE+DELETE+INSERT en una
-- sola transacción — hay que agregarle p_pax y la columna `nota` al INSERT.
-- Cambia la lista de parámetros: DROP explícito de la firma vieja para no
-- dejar un overload muerto colgado (a diferencia de un simple OR REPLACE).
DROP FUNCTION IF EXISTS public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB
);

CREATE FUNCTION public.reemplazar_menu_preparaciones(
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
    recipiente_nombre, peso_porcion, peso_porcion_unidad, orden, nota
  )
  SELECT
    p_menu_id, x.paso, x.tipo, x.ref_id, x.nombre, x.prioridad, x.plaza, x.seccion_mise,
    x.usuario_asignado, x.cantidad, x.unidad, x.variante, x.cantidad_ops, x.unidad_ops,
    x.recipiente_nombre, x.peso_porcion, x.peso_porcion_unidad, x.orden, x.nota
  FROM jsonb_to_recordset(p_preparaciones) AS x(
    paso TEXT, tipo TEXT, ref_id UUID, nombre TEXT, prioridad TEXT, plaza TEXT,
    seccion_mise TEXT, usuario_asignado TEXT, cantidad NUMERIC, unidad TEXT,
    variante TEXT, cantidad_ops NUMERIC, unidad_ops TEXT, recipiente_nombre TEXT,
    peso_porcion NUMERIC, peso_porcion_unidad TEXT, orden INT, nota TEXT
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB, INTEGER
) TO authenticated;

-- Hardening (mismo patrón que 20260831c): el CREATE de arriba pierde el SET
-- search_path que tenía la firma vieja — se refija sobre la firma nueva.
ALTER FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB, INTEGER
) SET search_path = public;

NOTIFY pgrst, 'reload schema';
