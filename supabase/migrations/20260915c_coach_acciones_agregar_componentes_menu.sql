-- Sumar agregar_componentes_menu al catalogo de tools mutantes del Coach (propose->confirm).
ALTER TABLE coach_acciones DROP CONSTRAINT coach_acciones_tool_name_check;
ALTER TABLE coach_acciones ADD CONSTRAINT coach_acciones_tool_name_check
  CHECK (tool_name = ANY (ARRAY[
    'crear_tarea', 'marcar_86', 'registrar_merma', 'cargar_producto',
    'ajustar_stock', 'registrar_venta', 'crear_evento', 'agregar_componentes_menu'
  ]));

NOTIFY pgrst, 'reload schema';
