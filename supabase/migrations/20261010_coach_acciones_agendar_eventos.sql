-- Habilita la tool agendar_eventos (Coach → eventos del Calendario) en el
-- CHECK de coach_acciones. Sin esto el draft no se inserta y el Coach responde
-- "hubo un problema técnico" (pasó en la primera prueba, 10/10/2026).
-- Ojo al sumar una tool mutante nueva al registry: también va acá.
ALTER TABLE coach_acciones DROP CONSTRAINT IF EXISTS coach_acciones_tool_name_check;
ALTER TABLE coach_acciones ADD CONSTRAINT coach_acciones_tool_name_check
  CHECK (tool_name = ANY (ARRAY[
    'crear_tarea', 'marcar_86', 'registrar_merma', 'cargar_producto',
    'ajustar_stock', 'registrar_venta', 'crear_evento', 'agregar_componentes_menu',
    'agendar_eventos'
  ]));

NOTIFY pgrst, 'reload schema';
