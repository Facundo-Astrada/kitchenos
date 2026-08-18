-- PLAN-4-CAPAS bloque B4 — presupuesto por familias de gasto.
--
-- categoria_financiera pasa de 3 a 5 valores: rrhh y alquiler nuevas (eran las
-- dos más pesadas y estaban escondidas dentro de operacional/administrativo).
-- Las categorías existentes no se tocan, siguen rodando hacia "gastos generales".
ALTER TABLE categorias_gasto DROP CONSTRAINT categorias_gasto_categoria_financiera_check;
ALTER TABLE categorias_gasto ADD CONSTRAINT categorias_gasto_categoria_financiera_check
  CHECK (categoria_financiera IN ('mercaderia', 'rrhh', 'alquiler', 'operacional', 'administrativo'));

-- presupuestos gana el desglose por familia (mapeo de categoria_financiera a las
-- 4 familias del material: mercaderia→materia_prima, rrhh→personal, alquiler→alquiler,
-- operacional+administrativo→gastos_generales). familia NULL preserva las filas
-- existentes (presupuesto total sin desglosar, semántica legacy — ya no se
-- escribe desde la UI nueva, pero el dato no se borra).
ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS familia TEXT NULL
    CHECK (familia IS NULL OR familia IN ('materia_prima', 'personal', 'alquiler', 'gastos_generales'));

-- El UNIQUE viejo (restaurante_id, periodo) no deja convivir varias familias en
-- el mismo período. Pasa a (restaurante_id, periodo, familia) — Postgres no
-- exige unicidad entre NULLs, así que las filas legacy (familia NULL) quedan
-- fuera de esa garantía, pero nada vuelve a escribir con familia NULL.
ALTER TABLE presupuestos DROP CONSTRAINT presupuestos_restaurante_id_periodo_key;
ALTER TABLE presupuestos ADD CONSTRAINT presupuestos_restaurante_periodo_familia_key
  UNIQUE (restaurante_id, periodo, familia);

-- Reemplaza reset_demo_restaurante() completa (mismo patrón que las migraciones
-- reset_demo_* anteriores) para que la columna familia de presupuestos también
-- se clone al resetear la demo (R1).
CREATE OR REPLACE FUNCTION public.reset_demo_restaurante()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src  uuid := '00000000-0000-0000-0000-000000000001';
  v_dest uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  -- ============================================================
  -- FASE 1: borrar todo lo existente en el destino (hijas -> padres)
  -- ============================================================
  DELETE FROM bitacora_items WHERE restaurante_id = v_dest;
  DELETE FROM bitacora_entradas WHERE restaurante_id = v_dest;
  DELETE FROM produccion_diaria WHERE restaurante_id = v_dest;
  DELETE FROM eventos_cocina j0
  USING comanda_items j1, comandas j2
  WHERE j0.comanda_item_id = j1.id AND j1.comanda_id = j2.id AND j2.restaurante_id = v_dest;
  DELETE FROM comanda_item_modificadores j0
  USING comanda_items j1, comandas j2
  WHERE j0.comanda_item_id = j1.id AND j1.comanda_id = j2.id AND j2.restaurante_id = v_dest;
  DELETE FROM plato_componentes j0
  USING platos_compuestos j1
  WHERE j0.plato_compuesto_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM comprobante_items j0
  USING comprobantes j1
  WHERE j0.comprobante_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM comanda_items j0
  USING comandas j1
  WHERE j0.comanda_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM precio_historial WHERE restaurante_id = v_dest;
  DELETE FROM factura_items j0
  USING facturas j1
  WHERE j0.factura_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM haccp_vencimientos WHERE restaurante_id = v_dest;
  DELETE FROM merma WHERE restaurante_id = v_dest;
  DELETE FROM menu_preparaciones j0
  USING menus j1
  WHERE j0.menu_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM pedido_items j0
  USING pedidos j1
  WHERE j0.pedido_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM packaging_grupo_items j0
  USING packaging_grupos j1
  WHERE j0.grupo_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM ingredientes j0
  USING recetas j1
  WHERE j0.receta_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM plato_packaging j0
  USING carta_items j1
  WHERE j0.plato_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM plato_recetas j0
  USING carta_items j1
  WHERE j0.plato_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM platos_compuestos WHERE restaurante_id = v_dest;
  DELETE FROM pagos j0
  USING cuentas j1
  WHERE j0.cuenta_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM comprobantes WHERE restaurante_id = v_dest;
  DELETE FROM comandas WHERE restaurante_id = v_dest;
  DELETE FROM facturas WHERE restaurante_id = v_dest;
  DELETE FROM produccion_registros WHERE restaurante_id = v_dest;
  DELETE FROM haccp_limpieza_registros j0
  USING haccp_limpieza j1
  WHERE j0.limpieza_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM checklist_registros j0
  USING checklist_items j1
  WHERE j0.checklist_item_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM plato_plazas j0
  USING recetas j1
  WHERE j0.plato_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM ventas_items j0
  USING ventas j1
  WHERE j0.venta_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM haccp_limpieza WHERE restaurante_id = v_dest;
  DELETE FROM haccp_temperaturas WHERE restaurante_id = v_dest;
  DELETE FROM checklist_rutina_registros j0
  USING checklist_rutina j1
  WHERE j0.rutina_id = j1.id AND j1.restaurante_id = v_dest;
  DELETE FROM espacio_plazas WHERE restaurante_id = v_dest;
  DELETE FROM cuentas WHERE restaurante_id = v_dest;
  DELETE FROM pedidos WHERE restaurante_id = v_dest;
  DELETE FROM eventos WHERE restaurante_id = v_dest;
  DELETE FROM productos WHERE restaurante_id = v_dest;
  DELETE FROM stock_sectores WHERE restaurante_id = v_dest;
  DELETE FROM carta_items WHERE restaurante_id = v_dest;
  DELETE FROM checklist_items WHERE restaurante_id = v_dest;
  DELETE FROM tareas WHERE restaurante_id = v_dest;
  DELETE FROM turnos_personal WHERE restaurante_id = v_dest;
  DELETE FROM ventas WHERE restaurante_id = v_dest;
  DELETE FROM recetas WHERE restaurante_id = v_dest;
  DELETE FROM puestos WHERE restaurante_id = v_dest;
  DELETE FROM proveedor_incidencias WHERE restaurante_id = v_dest;
  DELETE FROM proveedores WHERE restaurante_id = v_dest;
  DELETE FROM presupuestos WHERE restaurante_id = v_dest;
  DELETE FROM pase_mensajes WHERE restaurante_id = v_dest;
  DELETE FROM packaging_grupos WHERE restaurante_id = v_dest;
  DELETE FROM mesas WHERE restaurante_id = v_dest;
  DELETE FROM menus WHERE restaurante_id = v_dest;
  DELETE FROM medios_pago WHERE restaurante_id = v_dest;
  DELETE FROM haccp_equipos WHERE restaurante_id = v_dest;
  DELETE FROM fiscal_tickets WHERE restaurante_id = v_dest;
  DELETE FROM fiscal_config WHERE restaurante_id = v_dest;
  DELETE FROM evento_items WHERE restaurante_id = v_dest;
  DELETE FROM estaciones WHERE restaurante_id = v_dest;
  DELETE FROM espacios WHERE restaurante_id = v_dest;
  DELETE FROM config_fiscal WHERE restaurante_id = v_dest;
  DELETE FROM checklist_rutina WHERE restaurante_id = v_dest;
  DELETE FROM checklist_secciones WHERE restaurante_id = v_dest;
  DELETE FROM categorias_producto WHERE restaurante_id = v_dest;
  DELETE FROM carta_categorias WHERE restaurante_id = v_dest;

  -- ============================================================
  -- FASE 2: clonar fresco desde el origen (padres -> hijas)
  -- Cada tabla: 1) mapa old_id->new_id via CREATE TEMP TABLE ... ON
  -- COMMIT DROP  2) INSERT remapeando FKs con los mapas ya construidos
  -- ============================================================
  -- carta_categorias
  CREATE TEMP TABLE map_carta_categorias(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_carta_categorias SELECT id, gen_random_uuid() FROM carta_categorias WHERE restaurante_id = v_src;
  INSERT INTO carta_categorias (id, nombre, icono, orden, restaurante_id, created_at)
  SELECT m.new_id, t.nombre, t.icono, t.orden, v_dest, t.created_at
  FROM carta_categorias t
  JOIN map_carta_categorias m ON m.old_id = t.id
;

  -- categorias_producto
  CREATE TEMP TABLE map_categorias_producto(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_categorias_producto SELECT id, gen_random_uuid() FROM categorias_producto WHERE restaurante_id = v_src;
  INSERT INTO categorias_producto (id, restaurante_id, nombre, color, icono)
  SELECT m.new_id, v_dest, t.nombre, t.color, t.icono
  FROM categorias_producto t
  JOIN map_categorias_producto m ON m.old_id = t.id
;

  -- checklist_secciones
  CREATE TEMP TABLE map_checklist_secciones(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_checklist_secciones SELECT id, gen_random_uuid() FROM checklist_secciones WHERE restaurante_id = v_src;
  INSERT INTO checklist_secciones (id, nombre, icono, orden, plaza, restaurante_id, created_at)
  SELECT m.new_id, t.nombre, t.icono, t.orden, t.plaza, v_dest, t.created_at
  FROM checklist_secciones t
  JOIN map_checklist_secciones m ON m.old_id = t.id
;

  -- checklist_rutina
  CREATE TEMP TABLE map_checklist_rutina(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_checklist_rutina SELECT id, gen_random_uuid() FROM checklist_rutina WHERE restaurante_id = v_src;
  INSERT INTO checklist_rutina (id, nombre, plaza, frecuencia, ultima_vez, orden, restaurante_id, created_at, dias_semana, dia_mes)
  SELECT m.new_id, t.nombre, t.plaza, t.frecuencia, t.ultima_vez, t.orden, v_dest, t.created_at, t.dias_semana, t.dia_mes
  FROM checklist_rutina t
  JOIN map_checklist_rutina m ON m.old_id = t.id
;

  -- config_fiscal
  CREATE TEMP TABLE map_config_fiscal(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_config_fiscal SELECT id, gen_random_uuid() FROM config_fiscal WHERE restaurante_id = v_src;
  INSERT INTO config_fiscal (id, restaurante_id, condicion, cuit, puntos_venta, cert_ref, created_at, updated_at)
  SELECT m.new_id, v_dest, t.condicion, t.cuit, t.puntos_venta, t.cert_ref, t.created_at, t.updated_at
  FROM config_fiscal t
  JOIN map_config_fiscal m ON m.old_id = t.id
;

  -- espacios
  CREATE TEMP TABLE map_espacios(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_espacios SELECT id, gen_random_uuid() FROM espacios WHERE restaurante_id = v_src;
  INSERT INTO espacios (id, restaurante_id, nombre, icono, orden, created_at)
  SELECT m.new_id, v_dest, t.nombre, t.icono, t.orden, t.created_at
  FROM espacios t
  JOIN map_espacios m ON m.old_id = t.id
;

  -- estaciones
  CREATE TEMP TABLE map_estaciones(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_estaciones SELECT id, gen_random_uuid() FROM estaciones WHERE restaurante_id = v_src;
  INSERT INTO estaciones (id, restaurante_id, nombre, pantalla_asignada, created_at)
  SELECT m.new_id, v_dest, t.nombre, t.pantalla_asignada, t.created_at
  FROM estaciones t
  JOIN map_estaciones m ON m.old_id = t.id
;

  -- evento_items
  CREATE TEMP TABLE map_evento_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_evento_items SELECT id, gen_random_uuid() FROM evento_items WHERE restaurante_id = v_src;
  INSERT INTO evento_items (id, restaurante_id, evento_nombre, fecha, plato_nombre, componente_nombre, cantidad_personas, status, plaza, notas, created_at)
  SELECT m.new_id, v_dest, t.evento_nombre, t.fecha, t.plato_nombre, t.componente_nombre, t.cantidad_personas, t.status, t.plaza, t.notas, t.created_at
  FROM evento_items t
  JOIN map_evento_items m ON m.old_id = t.id
;

  -- fiscal_config
  CREATE TEMP TABLE map_fiscal_config(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_fiscal_config SELECT id, gen_random_uuid() FROM fiscal_config WHERE restaurante_id = v_src;
  INSERT INTO fiscal_config (id, restaurante_id, cuit, razon_social, condicion_iva, punto_venta, cert_pem, key_pem, ambiente, activo, created_at, updated_at)
  SELECT m.new_id, v_dest, t.cuit, t.razon_social, t.condicion_iva, t.punto_venta, t.cert_pem, t.key_pem, t.ambiente, t.activo, t.created_at, t.updated_at
  FROM fiscal_config t
  JOIN map_fiscal_config m ON m.old_id = t.id
;

  -- fiscal_tickets
  CREATE TEMP TABLE map_fiscal_tickets(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_fiscal_tickets SELECT id, gen_random_uuid() FROM fiscal_tickets WHERE restaurante_id = v_src;
  INSERT INTO fiscal_tickets (id, restaurante_id, servicio, token, sign, expiracion, created_at)
  SELECT m.new_id, v_dest, t.servicio, t.token, t.sign, t.expiracion, t.created_at
  FROM fiscal_tickets t
  JOIN map_fiscal_tickets m ON m.old_id = t.id
;

  -- haccp_equipos
  CREATE TEMP TABLE map_haccp_equipos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_haccp_equipos SELECT id, gen_random_uuid() FROM haccp_equipos WHERE restaurante_id = v_src;
  INSERT INTO haccp_equipos (id, nombre, tipo, temp_min, temp_max, ubicacion, plaza, activo, restaurante_id, created_at)
  SELECT m.new_id, t.nombre, t.tipo, t.temp_min, t.temp_max, t.ubicacion, t.plaza, t.activo, v_dest, t.created_at
  FROM haccp_equipos t
  JOIN map_haccp_equipos m ON m.old_id = t.id
;

  -- medios_pago
  CREATE TEMP TABLE map_medios_pago(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_medios_pago SELECT id, gen_random_uuid() FROM medios_pago WHERE restaurante_id = v_src;
  INSERT INTO medios_pago (id, restaurante_id, nombre, activo, created_at)
  SELECT m.new_id, v_dest, t.nombre, t.activo, t.created_at
  FROM medios_pago t
  JOIN map_medios_pago m ON m.old_id = t.id
;

  -- menus
  CREATE TEMP TABLE map_menus(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_menus SELECT id, gen_random_uuid() FROM menus WHERE restaurante_id = v_src;
  INSERT INTO menus (id, restaurante_id, nombre, tipo, descripcion, activo, created_at, updated_at)
  SELECT m.new_id, v_dest, t.nombre, t.tipo, t.descripcion, t.activo, t.created_at, t.updated_at
  FROM menus t
  JOIN map_menus m ON m.old_id = t.id
;

  -- mesas
  CREATE TEMP TABLE map_mesas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_mesas SELECT id, gen_random_uuid() FROM mesas WHERE restaurante_id = v_src;
  INSERT INTO mesas (id, restaurante_id, numero, sector, capacidad, estado, pos_x, pos_y, created_at)
  SELECT m.new_id, v_dest, t.numero, t.sector, t.capacidad, t.estado, t.pos_x, t.pos_y, t.created_at
  FROM mesas t
  JOIN map_mesas m ON m.old_id = t.id
;

  -- packaging_grupos
  CREATE TEMP TABLE map_packaging_grupos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_packaging_grupos SELECT id, gen_random_uuid() FROM packaging_grupos WHERE restaurante_id = v_src;
  INSERT INTO packaging_grupos (id, nombre, restaurante_id, created_at)
  SELECT m.new_id, t.nombre, v_dest, t.created_at
  FROM packaging_grupos t
  JOIN map_packaging_grupos m ON m.old_id = t.id
;

  -- pase_mensajes
  CREATE TEMP TABLE map_pase_mensajes(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_pase_mensajes SELECT id, gen_random_uuid() FROM pase_mensajes WHERE restaurante_id = v_src;
  INSERT INTO pase_mensajes (id, texto, usuario_id, usuario_nombre, tipo, prioridad, turno_fecha, turno_tipo, plaza, leido_por, restaurante_id, created_at)
  SELECT m.new_id, t.texto, t.usuario_id, t.usuario_nombre, t.tipo, t.prioridad, t.turno_fecha, t.turno_tipo, t.plaza, t.leido_por, v_dest, t.created_at
  FROM pase_mensajes t
  JOIN map_pase_mensajes m ON m.old_id = t.id
;

  -- bitacora_entradas
  CREATE TEMP TABLE map_bitacora_entradas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_bitacora_entradas SELECT id, gen_random_uuid() FROM bitacora_entradas WHERE restaurante_id = v_src;
  INSERT INTO bitacora_entradas (id, restaurante_id, titulo, tipo, fecha, autor_id, autor_nombre, participantes, fijada, archivada, created_at, updated_at)
  SELECT m.new_id, v_dest, t.titulo, t.tipo, t.fecha, t.autor_id, t.autor_nombre, t.participantes, t.fijada, t.archivada, t.created_at, t.updated_at
  FROM bitacora_entradas t
  JOIN map_bitacora_entradas m ON m.old_id = t.id
;

  -- presupuestos (+familia, PLAN-4-CAPAS B4)
  CREATE TEMP TABLE map_presupuestos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_presupuestos SELECT id, gen_random_uuid() FROM presupuestos WHERE restaurante_id = v_src;
  INSERT INTO presupuestos (id, restaurante_id, periodo, monto, created_at, updated_at, familia)
  SELECT m.new_id, v_dest, t.periodo, t.monto, t.created_at, t.updated_at, t.familia
  FROM presupuestos t
  JOIN map_presupuestos m ON m.old_id = t.id
;

  -- proveedores
  CREATE TEMP TABLE map_proveedores(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_proveedores SELECT id, gen_random_uuid() FROM proveedores WHERE restaurante_id = v_src;
  INSERT INTO proveedores (id, nombre, rubro, telefono, dias_entrega, horario_entrega, restaurante_id, activo, created_at, updated_at)
  SELECT m.new_id, t.nombre, t.rubro, t.telefono, t.dias_entrega, t.horario_entrega, v_dest, t.activo, t.created_at, t.updated_at
  FROM proveedores t
  JOIN map_proveedores m ON m.old_id = t.id
;

  -- puestos
  CREATE TEMP TABLE map_puestos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_puestos SELECT id, gen_random_uuid() FROM puestos WHERE restaurante_id = v_src;
  INSERT INTO puestos (id, nombre, descripcion, tareas_funciones, permisos_app, restaurante_id, created_at, nivel, plaza_default)
  SELECT m.new_id, t.nombre, t.descripcion, t.tareas_funciones, t.permisos_app, v_dest, t.created_at, t.nivel, t.plaza_default
  FROM puestos t
  JOIN map_puestos m ON m.old_id = t.id
;

  -- recetas
  CREATE TEMP TABLE map_recetas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_recetas SELECT id, gen_random_uuid() FROM recetas WHERE restaurante_id = v_src;
  INSERT INTO recetas (id, nombre, categoria, porciones, tiempo_min, precio_venta, procedimiento, activa, restaurante_id, created_at, updated_at, status, foto_url, peso_total_g, peso_escurrido_g)
  SELECT m.new_id, t.nombre, t.categoria, t.porciones, t.tiempo_min, t.precio_venta, t.procedimiento, t.activa, v_dest, t.created_at, t.updated_at, t.status, t.foto_url, t.peso_total_g, t.peso_escurrido_g
  FROM recetas t
  JOIN map_recetas m ON m.old_id = t.id
;

  -- ventas
  CREATE TEMP TABLE map_ventas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_ventas SELECT id, gen_random_uuid() FROM ventas WHERE restaurante_id = v_src;
  INSERT INTO ventas (id, restaurante_id, fecha, origen, total_ventas, cantidad_cubiertos, notas, created_at)
  SELECT m.new_id, v_dest, t.fecha, t.origen, t.total_ventas, t.cantidad_cubiertos, t.notas, t.created_at
  FROM ventas t
  JOIN map_ventas m ON m.old_id = t.id
;

  -- turnos_personal
  CREATE TEMP TABLE map_turnos_personal(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_turnos_personal SELECT id, gen_random_uuid() FROM turnos_personal WHERE restaurante_id = v_src;
  INSERT INTO turnos_personal (id, restaurante_id, usuario_id, fecha, entrada, salida)
  SELECT m.new_id, v_dest, NULL, t.fecha, t.entrada, t.salida
  FROM turnos_personal t
  JOIN map_turnos_personal m ON m.old_id = t.id
;

  -- tareas
  CREATE TEMP TABLE map_tareas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_tareas SELECT id, gen_random_uuid() FROM tareas WHERE restaurante_id = v_src;
  INSERT INTO tareas (id, titulo, descripcion, plaza, prioridad, asignado_a, creado_por, tiempo_estimado_min, fecha_limite, status, categoria, receta_id, checklist, created_at, completed_at, restaurante_id, seccion, modo, parent_id, estado, cantidad, turno_fecha, orden, tipo, menu_id)
  SELECT m.new_id, t.titulo, t.descripcion, t.plaza, t.prioridad, t.asignado_a, t.creado_por, t.tiempo_estimado_min, t.fecha_limite, t.status, t.categoria, f_receta_id.new_id, t.checklist, t.created_at, t.completed_at, v_dest, t.seccion, t.modo, f_parent_id.new_id, t.estado, t.cantidad, t.turno_fecha, t.orden, t.tipo, f_menu_id.new_id
  FROM tareas t
  JOIN map_tareas m ON m.old_id = t.id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_tareas f_parent_id ON f_parent_id.old_id = t.parent_id
  LEFT JOIN map_menus f_menu_id ON f_menu_id.old_id = t.menu_id
;

  -- checklist_items
  CREATE TEMP TABLE map_checklist_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_checklist_items SELECT id, gen_random_uuid() FROM checklist_items WHERE restaurante_id = v_src;
  INSERT INTO checklist_items (id, plaza, seccion, nombre, cantidad, unidad, ubicacion, receta_id, orden, restaurante_id, created_at, seccion_id, prioridad, porciones, observacion, recipiente_nombre, recipiente_capacidad, peso_porcion, peso_porcion_unidad, demanda_viva)
  SELECT m.new_id, t.plaza, t.seccion, t.nombre, t.cantidad, t.unidad, t.ubicacion, f_receta_id.new_id, t.orden, v_dest, t.created_at, f_seccion_id.new_id, t.prioridad, t.porciones, t.observacion, t.recipiente_nombre, t.recipiente_capacidad, t.peso_porcion, t.peso_porcion_unidad, t.demanda_viva
  FROM checklist_items t
  JOIN map_checklist_items m ON m.old_id = t.id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_checklist_secciones f_seccion_id ON f_seccion_id.old_id = t.seccion_id
;

  -- carta_items
  CREATE TEMP TABLE map_carta_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_carta_items SELECT id, gen_random_uuid() FROM carta_items WHERE restaurante_id = v_src;
  INSERT INTO carta_items (id, nombre, descripcion, precio_venta, categoria, receta_id, disponible, foto_url, orden, restaurante_id, created_at, margen_pct, tags, estacion_default_id)
  SELECT m.new_id, t.nombre, t.descripcion, t.precio_venta, t.categoria, f_receta_id.new_id, t.disponible, t.foto_url, t.orden, v_dest, t.created_at, t.margen_pct, t.tags, f_estacion_default_id.new_id
  FROM carta_items t
  JOIN map_carta_items m ON m.old_id = t.id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_estaciones f_estacion_default_id ON f_estacion_default_id.old_id = t.estacion_default_id
;

  -- stock_sectores
  CREATE TEMP TABLE map_stock_sectores(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_stock_sectores SELECT id, gen_random_uuid() FROM stock_sectores WHERE restaurante_id = v_src;
  INSERT INTO stock_sectores (id, restaurante_id, nombre, icono, orden, created_at, ultimo_conteo_at)
  SELECT m.new_id, v_dest, t.nombre, t.icono, t.orden, t.created_at, t.ultimo_conteo_at
  FROM stock_sectores t
  JOIN map_stock_sectores m ON m.old_id = t.id
;

  -- stock_estantes
  CREATE TEMP TABLE map_stock_estantes(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_stock_estantes SELECT id, gen_random_uuid() FROM stock_estantes WHERE restaurante_id = v_src;
  INSERT INTO stock_estantes (id, restaurante_id, sector_id, nombre, orden, created_at)
  SELECT m.new_id, v_dest, f_sector_id.new_id, t.nombre, t.orden, t.created_at
  FROM stock_estantes t
  JOIN map_stock_estantes m ON m.old_id = t.id
  JOIN map_stock_sectores f_sector_id ON f_sector_id.old_id = t.sector_id
;

  -- productos
  CREATE TEMP TABLE map_productos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_productos SELECT id, gen_random_uuid() FROM productos WHERE restaurante_id = v_src;
  INSERT INTO productos (id, nombre, unidad, stock_actual, stock_minimo, stock_critico, categoria, proveedor_id, restaurante_id, activo, created_at, updated_at, precio_unitario, categoria_id, unidad_compra, cantidad_por_envase, unidad_uso, es_produccion, receta_id, sector_id, fuera_de_uso, estante_id, orden_sector, stock_maximo, merma_esperada_pct, nota_recepcion)
  SELECT m.new_id, t.nombre, t.unidad, t.stock_actual, t.stock_minimo, t.stock_critico, t.categoria, f_proveedor_id.new_id, v_dest, t.activo, t.created_at, t.updated_at, t.precio_unitario, f_categoria_id.new_id, t.unidad_compra, t.cantidad_por_envase, t.unidad_uso, t.es_produccion, f_receta_id.new_id, f_sector_id.new_id, t.fuera_de_uso, f_estante_id.new_id, t.orden_sector, t.stock_maximo, t.merma_esperada_pct, t.nota_recepcion
  FROM productos t
  JOIN map_productos m ON m.old_id = t.id
  LEFT JOIN map_proveedores f_proveedor_id ON f_proveedor_id.old_id = t.proveedor_id
  LEFT JOIN map_categorias_producto f_categoria_id ON f_categoria_id.old_id = t.categoria_id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_stock_sectores f_sector_id ON f_sector_id.old_id = t.sector_id
  LEFT JOIN map_stock_estantes f_estante_id ON f_estante_id.old_id = t.estante_id
;

  -- eventos
  CREATE TEMP TABLE map_eventos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_eventos SELECT id, gen_random_uuid() FROM eventos WHERE restaurante_id = v_src;
  INSERT INTO eventos (id, titulo, descripcion, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, recurrente, frecuencia, color, proveedor_id, usuario_id, restaurante_id, created_at)
  SELECT m.new_id, t.titulo, t.descripcion, t.tipo, t.fecha_inicio, t.fecha_fin, t.hora_inicio, t.hora_fin, t.recurrente, t.frecuencia, t.color, f_proveedor_id.new_id, t.usuario_id, v_dest, t.created_at
  FROM eventos t
  JOIN map_eventos m ON m.old_id = t.id
  LEFT JOIN map_proveedores f_proveedor_id ON f_proveedor_id.old_id = t.proveedor_id
;

  -- pedidos
  CREATE TEMP TABLE map_pedidos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_pedidos SELECT id, gen_random_uuid() FROM pedidos WHERE restaurante_id = v_src;
  INSERT INTO pedidos (id, proveedor_id, proveedor_nombre, fecha_pedido, fecha_entrega_esperada, status, notas, total_estimado, usuario_id, restaurante_id, created_at, entrega_desde, entrega_hasta)
  SELECT m.new_id, f_proveedor_id.new_id, t.proveedor_nombre, t.fecha_pedido, t.fecha_entrega_esperada, t.status, t.notas, t.total_estimado, t.usuario_id, v_dest, t.created_at, t.entrega_desde, t.entrega_hasta
  FROM pedidos t
  JOIN map_pedidos m ON m.old_id = t.id
  LEFT JOIN map_proveedores f_proveedor_id ON f_proveedor_id.old_id = t.proveedor_id
;

  -- proveedor_incidencias
  CREATE TEMP TABLE map_proveedor_incidencias(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_proveedor_incidencias SELECT id, gen_random_uuid() FROM proveedor_incidencias WHERE restaurante_id = v_src;
  INSERT INTO proveedor_incidencias (id, restaurante_id, proveedor_id, pedido_id, producto_nombre, tipo, cantidad_esperada, cantidad_recibida, importe, nota, foto_url, fecha, creado_por, created_at)
  SELECT m.new_id, v_dest, f_proveedor_id.new_id, f_pedido_id.new_id, t.producto_nombre, t.tipo, t.cantidad_esperada, t.cantidad_recibida, t.importe, t.nota, t.foto_url, t.fecha, t.creado_por, t.created_at
  FROM proveedor_incidencias t
  JOIN map_proveedor_incidencias m ON m.old_id = t.id
  LEFT JOIN map_proveedores f_proveedor_id ON f_proveedor_id.old_id = t.proveedor_id
  LEFT JOIN map_pedidos f_pedido_id ON f_pedido_id.old_id = t.pedido_id
;

  -- cuentas
  CREATE TEMP TABLE map_cuentas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_cuentas SELECT id, gen_random_uuid() FROM cuentas WHERE restaurante_id = v_src;
  INSERT INTO cuentas (id, restaurante_id, mesa_id, estado, total, mozo_id, abierta_at, cerrada_at, created_at)
  SELECT m.new_id, v_dest, f_mesa_id.new_id, t.estado, t.total, NULL, t.abierta_at, t.cerrada_at, t.created_at
  FROM cuentas t
  JOIN map_cuentas m ON m.old_id = t.id
  LEFT JOIN map_mesas f_mesa_id ON f_mesa_id.old_id = t.mesa_id
;

  -- espacio_plazas
  CREATE TEMP TABLE map_espacio_plazas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_espacio_plazas SELECT id, gen_random_uuid() FROM espacio_plazas WHERE restaurante_id = v_src;
  INSERT INTO espacio_plazas (id, restaurante_id, espacio_id, plaza_key, orden)
  SELECT m.new_id, v_dest, f_espacio_id.new_id, t.plaza_key, t.orden
  FROM espacio_plazas t
  JOIN map_espacio_plazas m ON m.old_id = t.id
  JOIN map_espacios f_espacio_id ON f_espacio_id.old_id = t.espacio_id
;

  -- checklist_rutina_registros
  CREATE TEMP TABLE map_checklist_rutina_registros(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_checklist_rutina_registros SELECT t.id, gen_random_uuid() FROM checklist_rutina_registros t JOIN map_checklist_rutina sp ON sp.old_id = t.rutina_id;
  INSERT INTO checklist_rutina_registros (id, rutina_id, fecha, completado, usuario_id)
  SELECT m.new_id, f_rutina_id.new_id, t.fecha, t.completado, t.usuario_id
  FROM checklist_rutina_registros t
  JOIN map_checklist_rutina_registros m ON m.old_id = t.id
  JOIN map_checklist_rutina sp2 ON sp2.old_id = t.rutina_id
  JOIN map_checklist_rutina f_rutina_id ON f_rutina_id.old_id = t.rutina_id
;

  -- haccp_temperaturas
  CREATE TEMP TABLE map_haccp_temperaturas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_haccp_temperaturas SELECT id, gen_random_uuid() FROM haccp_temperaturas WHERE restaurante_id = v_src;
  INSERT INTO haccp_temperaturas (id, equipo_id, temperatura, dentro_rango, observacion, accion_correctiva, usuario_id, restaurante_id, created_at)
  SELECT m.new_id, f_equipo_id.new_id, t.temperatura, t.dentro_rango, t.observacion, t.accion_correctiva, t.usuario_id, v_dest, t.created_at
  FROM haccp_temperaturas t
  JOIN map_haccp_temperaturas m ON m.old_id = t.id
  JOIN map_haccp_equipos f_equipo_id ON f_equipo_id.old_id = t.equipo_id
;

  -- haccp_limpieza
  CREATE TEMP TABLE map_haccp_limpieza(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_haccp_limpieza SELECT id, gen_random_uuid() FROM haccp_limpieza WHERE restaurante_id = v_src;
  INSERT INTO haccp_limpieza (id, area, tarea_limpieza, frecuencia, ultimo_registro, usuario_id, restaurante_id, created_at, dia_semana, dia_mes, sync_ops, checklist_item_id)
  SELECT m.new_id, t.area, t.tarea_limpieza, t.frecuencia, t.ultimo_registro, t.usuario_id, v_dest, t.created_at, t.dia_semana, t.dia_mes, t.sync_ops, f_checklist_item_id.new_id
  FROM haccp_limpieza t
  JOIN map_haccp_limpieza m ON m.old_id = t.id
  LEFT JOIN map_checklist_rutina f_checklist_item_id ON f_checklist_item_id.old_id = t.checklist_item_id
;

  -- ventas_items
  CREATE TEMP TABLE map_ventas_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_ventas_items SELECT t.id, gen_random_uuid() FROM ventas_items t JOIN map_ventas sp ON sp.old_id = t.venta_id;
  INSERT INTO ventas_items (id, venta_id, nombre_plato, cantidad, precio_unitario)
  SELECT m.new_id, f_venta_id.new_id, t.nombre_plato, t.cantidad, t.precio_unitario
  FROM ventas_items t
  JOIN map_ventas_items m ON m.old_id = t.id
  JOIN map_ventas sp2 ON sp2.old_id = t.venta_id
  JOIN map_ventas f_venta_id ON f_venta_id.old_id = t.venta_id
;

  -- plato_plazas
  CREATE TEMP TABLE map_plato_plazas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_plato_plazas SELECT t.id, gen_random_uuid() FROM plato_plazas t JOIN map_recetas sp ON sp.old_id = t.plato_id;
  INSERT INTO plato_plazas (id, plato_id, plaza, ingredientes, instruccion, orden)
  SELECT m.new_id, f_plato_id.new_id, t.plaza, t.ingredientes, t.instruccion, t.orden
  FROM plato_plazas t
  JOIN map_plato_plazas m ON m.old_id = t.id
  JOIN map_recetas sp2 ON sp2.old_id = t.plato_id
  JOIN map_recetas f_plato_id ON f_plato_id.old_id = t.plato_id
;

  -- checklist_registros
  CREATE TEMP TABLE map_checklist_registros(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_checklist_registros SELECT t.id, gen_random_uuid() FROM checklist_registros t JOIN map_checklist_items sp ON sp.old_id = t.checklist_item_id;
  INSERT INTO checklist_registros (id, checklist_item_id, fecha, completado, usuario_id, hora_completado, turno, cantidad_actual)
  SELECT m.new_id, f_checklist_item_id.new_id, t.fecha, t.completado, t.usuario_id, t.hora_completado, t.turno, t.cantidad_actual
  FROM checklist_registros t
  JOIN map_checklist_registros m ON m.old_id = t.id
  JOIN map_checklist_items sp2 ON sp2.old_id = t.checklist_item_id
  JOIN map_checklist_items f_checklist_item_id ON f_checklist_item_id.old_id = t.checklist_item_id
;

  -- haccp_limpieza_registros
  CREATE TEMP TABLE map_haccp_limpieza_registros(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_haccp_limpieza_registros SELECT t.id, gen_random_uuid() FROM haccp_limpieza_registros t JOIN map_haccp_limpieza sp ON sp.old_id = t.limpieza_id;
  INSERT INTO haccp_limpieza_registros (id, limpieza_id, fecha, completado, observacion, usuario_id, created_at)
  SELECT m.new_id, f_limpieza_id.new_id, t.fecha, t.completado, t.observacion, t.usuario_id, t.created_at
  FROM haccp_limpieza_registros t
  JOIN map_haccp_limpieza_registros m ON m.old_id = t.id
  JOIN map_haccp_limpieza sp2 ON sp2.old_id = t.limpieza_id
  JOIN map_haccp_limpieza f_limpieza_id ON f_limpieza_id.old_id = t.limpieza_id
;

  -- produccion_registros
  CREATE TEMP TABLE map_produccion_registros(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_produccion_registros SELECT id, gen_random_uuid() FROM produccion_registros WHERE restaurante_id = v_src;
  INSERT INTO produccion_registros (id, restaurante_id, receta_id, tarea_id, fecha, cantidad_planificada, cantidad_real, multiplicador_real, usuario_id, usuario_nombre, notas, created_at)
  SELECT m.new_id, v_dest, f_receta_id.new_id, f_tarea_id.new_id, t.fecha, t.cantidad_planificada, t.cantidad_real, t.multiplicador_real, t.usuario_id, t.usuario_nombre, t.notas, t.created_at
  FROM produccion_registros t
  JOIN map_produccion_registros m ON m.old_id = t.id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_tareas f_tarea_id ON f_tarea_id.old_id = t.tarea_id
;

  -- facturas
  CREATE TEMP TABLE map_facturas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_facturas SELECT id, gen_random_uuid() FROM facturas WHERE restaurante_id = v_src;
  INSERT INTO facturas (id, proveedor_nombre, proveedor_cuit, fecha_factura, fecha_carga, tipo_factura, numero_factura, subtotal, iva_total, total, condicion_pago, imagen_url, status, notas, usuario_id, restaurante_id, created_at, pedido_id)
  SELECT m.new_id, t.proveedor_nombre, t.proveedor_cuit, t.fecha_factura, t.fecha_carga, t.tipo_factura, t.numero_factura, t.subtotal, t.iva_total, t.total, t.condicion_pago, t.imagen_url, t.status, t.notas, t.usuario_id, v_dest, t.created_at, f_pedido_id.new_id
  FROM facturas t
  JOIN map_facturas m ON m.old_id = t.id
  LEFT JOIN map_pedidos f_pedido_id ON f_pedido_id.old_id = t.pedido_id
;

  -- comandas
  CREATE TEMP TABLE map_comandas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_comandas SELECT id, gen_random_uuid() FROM comandas WHERE restaurante_id = v_src;
  INSERT INTO comandas (id, restaurante_id, origen, mesa_id, mozo_id, cuenta_id, estado, course, marca, created_at, held)
  SELECT m.new_id, v_dest, t.origen, f_mesa_id.new_id, NULL, f_cuenta_id.new_id, t.estado, t.course, t.marca, t.created_at, t.held
  FROM comandas t
  JOIN map_comandas m ON m.old_id = t.id
  LEFT JOIN map_mesas f_mesa_id ON f_mesa_id.old_id = t.mesa_id
  LEFT JOIN map_cuentas f_cuenta_id ON f_cuenta_id.old_id = t.cuenta_id
;

  -- comprobantes
  CREATE TEMP TABLE map_comprobantes(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_comprobantes SELECT id, gen_random_uuid() FROM comprobantes WHERE restaurante_id = v_src;
  INSERT INTO comprobantes (id, restaurante_id, cuenta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado, receptor_cuit, receptor_condicion_iva, subtotal, iva, total, qr_data, arca_raw, emitido_at, created_at, error_msg)
  SELECT m.new_id, v_dest, f_cuenta_id.new_id, t.tipo, t.punto_venta, t.numero, t.cae, t.cae_vencimiento, t.estado, t.receptor_cuit, t.receptor_condicion_iva, t.subtotal, t.iva, t.total, t.qr_data, t.arca_raw, t.emitido_at, t.created_at, t.error_msg
  FROM comprobantes t
  JOIN map_comprobantes m ON m.old_id = t.id
  LEFT JOIN map_cuentas f_cuenta_id ON f_cuenta_id.old_id = t.cuenta_id
;

  -- pagos
  CREATE TEMP TABLE map_pagos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_pagos SELECT t.id, gen_random_uuid() FROM pagos t JOIN map_cuentas sp ON sp.old_id = t.cuenta_id;
  INSERT INTO pagos (id, cuenta_id, medio_id, monto, propina, created_at)
  SELECT m.new_id, f_cuenta_id.new_id, f_medio_id.new_id, t.monto, t.propina, t.created_at
  FROM pagos t
  JOIN map_pagos m ON m.old_id = t.id
  JOIN map_cuentas sp2 ON sp2.old_id = t.cuenta_id
  JOIN map_cuentas f_cuenta_id ON f_cuenta_id.old_id = t.cuenta_id
  JOIN map_medios_pago f_medio_id ON f_medio_id.old_id = t.medio_id
;

  -- platos_compuestos
  CREATE TEMP TABLE map_platos_compuestos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_platos_compuestos SELECT id, gen_random_uuid() FROM platos_compuestos WHERE restaurante_id = v_src;
  INSERT INTO platos_compuestos (id, nombre, categoria, descripcion, foto_url, carta_item_id, orden, activo, restaurante_id, created_at, updated_at)
  SELECT m.new_id, t.nombre, t.categoria, t.descripcion, t.foto_url, f_carta_item_id.new_id, t.orden, t.activo, v_dest, t.created_at, t.updated_at
  FROM platos_compuestos t
  JOIN map_platos_compuestos m ON m.old_id = t.id
  LEFT JOIN map_carta_items f_carta_item_id ON f_carta_item_id.old_id = t.carta_item_id
;

  -- plato_recetas
  CREATE TEMP TABLE map_plato_recetas(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_plato_recetas SELECT t.id, gen_random_uuid() FROM plato_recetas t JOIN map_carta_items sp ON sp.old_id = t.plato_id;
  INSERT INTO plato_recetas (id, plato_id, receta_id, porciones, orden, created_at, plaza, cantidad_ops, unidad_ops)
  SELECT m.new_id, f_plato_id.new_id, f_receta_id.new_id, t.porciones, t.orden, t.created_at, t.plaza, t.cantidad_ops, t.unidad_ops
  FROM plato_recetas t
  JOIN map_plato_recetas m ON m.old_id = t.id
  JOIN map_carta_items sp2 ON sp2.old_id = t.plato_id
  JOIN map_carta_items f_plato_id ON f_plato_id.old_id = t.plato_id
  JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
;

  -- plato_packaging
  CREATE TEMP TABLE map_plato_packaging(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_plato_packaging SELECT t.id, gen_random_uuid() FROM plato_packaging t JOIN map_carta_items sp ON sp.old_id = t.plato_id;
  INSERT INTO plato_packaging (id, plato_id, producto_id, cantidad, orden, created_at)
  SELECT m.new_id, f_plato_id.new_id, f_producto_id.new_id, t.cantidad, t.orden, t.created_at
  FROM plato_packaging t
  JOIN map_plato_packaging m ON m.old_id = t.id
  JOIN map_carta_items sp2 ON sp2.old_id = t.plato_id
  JOIN map_carta_items f_plato_id ON f_plato_id.old_id = t.plato_id
  JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- ingredientes
  CREATE TEMP TABLE map_ingredientes(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_ingredientes SELECT t.id, gen_random_uuid() FROM ingredientes t JOIN map_recetas sp ON sp.old_id = t.receta_id;
  INSERT INTO ingredientes (id, receta_id, nombre, cantidad, unidad, costo_unitario, unidad_costo, created_at, subreceta_id, tipo, merma_pct, producto_id)
  SELECT m.new_id, f_receta_id.new_id, t.nombre, t.cantidad, t.unidad, t.costo_unitario, t.unidad_costo, t.created_at, f_subreceta_id.new_id, t.tipo, t.merma_pct, f_producto_id.new_id
  FROM ingredientes t
  JOIN map_ingredientes m ON m.old_id = t.id
  JOIN map_recetas sp2 ON sp2.old_id = t.receta_id
  JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
  LEFT JOIN map_recetas f_subreceta_id ON f_subreceta_id.old_id = t.subreceta_id
  LEFT JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- packaging_grupo_items
  CREATE TEMP TABLE map_packaging_grupo_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_packaging_grupo_items SELECT t.id, gen_random_uuid() FROM packaging_grupo_items t JOIN map_packaging_grupos sp ON sp.old_id = t.grupo_id;
  INSERT INTO packaging_grupo_items (id, grupo_id, producto_id, cantidad, orden)
  SELECT m.new_id, f_grupo_id.new_id, f_producto_id.new_id, t.cantidad, t.orden
  FROM packaging_grupo_items t
  JOIN map_packaging_grupo_items m ON m.old_id = t.id
  JOIN map_packaging_grupos sp2 ON sp2.old_id = t.grupo_id
  JOIN map_packaging_grupos f_grupo_id ON f_grupo_id.old_id = t.grupo_id
  JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- pedido_items
  CREATE TEMP TABLE map_pedido_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_pedido_items SELECT t.id, gen_random_uuid() FROM pedido_items t JOIN map_pedidos sp ON sp.old_id = t.pedido_id;
  INSERT INTO pedido_items (id, pedido_id, producto_id, producto_nombre, cantidad, unidad, precio_estimado, recibido, cantidad_recibida)
  SELECT m.new_id, f_pedido_id.new_id, f_producto_id.new_id, t.producto_nombre, t.cantidad, t.unidad, t.precio_estimado, t.recibido, t.cantidad_recibida
  FROM pedido_items t
  JOIN map_pedido_items m ON m.old_id = t.id
  JOIN map_pedidos sp2 ON sp2.old_id = t.pedido_id
  JOIN map_pedidos f_pedido_id ON f_pedido_id.old_id = t.pedido_id
  LEFT JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- menu_preparaciones (ref_id polimorfico: carta_items/recetas/productos segun tipo)
  CREATE TEMP TABLE map_menu_preparaciones(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_menu_preparaciones SELECT t.id, gen_random_uuid() FROM menu_preparaciones t JOIN map_menus sp ON sp.old_id = t.menu_id;
  INSERT INTO menu_preparaciones (id, menu_id, paso, tipo, ref_id, nombre, prioridad, plaza, usuario_asignado, cantidad, unidad, orden, created_at, seccion_mise)
  SELECT m.new_id, sp2.new_id, t.paso, t.tipo,
    CASE t.tipo
      WHEN 'plato' THEN mc.new_id
      WHEN 'receta' THEN mr.new_id
      WHEN 'producto' THEN mprod.new_id
      ELSE NULL
    END,
    t.nombre, t.prioridad, t.plaza, t.usuario_asignado, t.cantidad, t.unidad, t.orden, t.created_at, t.seccion_mise
  FROM menu_preparaciones t
  JOIN map_menu_preparaciones m ON m.old_id = t.id
  JOIN map_menus sp2 ON sp2.old_id = t.menu_id
  LEFT JOIN map_carta_items mc ON mc.old_id = t.ref_id AND t.tipo = 'plato'
  LEFT JOIN map_recetas mr ON mr.old_id = t.ref_id AND t.tipo = 'receta'
  LEFT JOIN map_productos mprod ON mprod.old_id = t.ref_id AND t.tipo = 'producto'
  ;

  -- merma
  CREATE TEMP TABLE map_merma(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_merma SELECT id, gen_random_uuid() FROM merma WHERE restaurante_id = v_src;
  INSERT INTO merma (id, producto_nombre, producto_id, cantidad, unidad, motivo, motivo_detalle, plaza, usuario_id, usuario_nombre, fecha, turno, costo_estimado, restaurante_id, created_at)
  SELECT m.new_id, t.producto_nombre, f_producto_id.new_id, t.cantidad, t.unidad, t.motivo, t.motivo_detalle, t.plaza, t.usuario_id, t.usuario_nombre, t.fecha, t.turno, t.costo_estimado, v_dest, t.created_at
  FROM merma t
  JOIN map_merma m ON m.old_id = t.id
  LEFT JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- haccp_vencimientos
  CREATE TEMP TABLE map_haccp_vencimientos(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_haccp_vencimientos SELECT id, gen_random_uuid() FROM haccp_vencimientos WHERE restaurante_id = v_src;
  INSERT INTO haccp_vencimientos (id, producto_nombre, producto_id, fecha_vencimiento, fecha_apertura, lote, ubicacion, status, usuario_id, restaurante_id, created_at)
  SELECT m.new_id, t.producto_nombre, f_producto_id.new_id, t.fecha_vencimiento, t.fecha_apertura, t.lote, t.ubicacion, t.status, t.usuario_id, v_dest, t.created_at
  FROM haccp_vencimientos t
  JOIN map_haccp_vencimientos m ON m.old_id = t.id
  LEFT JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- factura_items
  CREATE TEMP TABLE map_factura_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_factura_items SELECT t.id, gen_random_uuid() FROM factura_items t JOIN map_facturas sp ON sp.old_id = t.factura_id;
  INSERT INTO factura_items (id, factura_id, producto_nombre, producto_id, cantidad, unidad, precio_unitario, alicuota_iva, subtotal, precio_anterior, created_at)
  SELECT m.new_id, f_factura_id.new_id, t.producto_nombre, f_producto_id.new_id, t.cantidad, t.unidad, t.precio_unitario, t.alicuota_iva, t.subtotal, t.precio_anterior, t.created_at
  FROM factura_items t
  JOIN map_factura_items m ON m.old_id = t.id
  JOIN map_facturas sp2 ON sp2.old_id = t.factura_id
  JOIN map_facturas f_factura_id ON f_factura_id.old_id = t.factura_id
  LEFT JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
;

  -- precio_historial
  CREATE TEMP TABLE map_precio_historial(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_precio_historial SELECT id, gen_random_uuid() FROM precio_historial WHERE restaurante_id = v_src;
  INSERT INTO precio_historial (id, producto_id, precio_anterior, precio_nuevo, variacion_porcentaje, factura_id, fecha, restaurante_id)
  SELECT m.new_id, f_producto_id.new_id, t.precio_anterior, t.precio_nuevo, t.variacion_porcentaje, f_factura_id.new_id, t.fecha, v_dest
  FROM precio_historial t
  JOIN map_precio_historial m ON m.old_id = t.id
  JOIN map_productos f_producto_id ON f_producto_id.old_id = t.producto_id
  LEFT JOIN map_facturas f_factura_id ON f_factura_id.old_id = t.factura_id
;

  -- comanda_items
  CREATE TEMP TABLE map_comanda_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_comanda_items SELECT t.id, gen_random_uuid() FROM comanda_items t JOIN map_comandas sp ON sp.old_id = t.comanda_id;
  INSERT INTO comanda_items (id, comanda_id, carta_item_id, cantidad, estado, estacion_id, fired_at, bumped_at, notas, created_at)
  SELECT m.new_id, f_comanda_id.new_id, f_carta_item_id.new_id, t.cantidad, t.estado, f_estacion_id.new_id, t.fired_at, t.bumped_at, t.notas, t.created_at
  FROM comanda_items t
  JOIN map_comanda_items m ON m.old_id = t.id
  JOIN map_comandas sp2 ON sp2.old_id = t.comanda_id
  JOIN map_comandas f_comanda_id ON f_comanda_id.old_id = t.comanda_id
  LEFT JOIN map_carta_items f_carta_item_id ON f_carta_item_id.old_id = t.carta_item_id
  LEFT JOIN map_estaciones f_estacion_id ON f_estacion_id.old_id = t.estacion_id
;

  -- comprobante_items
  CREATE TEMP TABLE map_comprobante_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_comprobante_items SELECT t.id, gen_random_uuid() FROM comprobante_items t JOIN map_comprobantes sp ON sp.old_id = t.comprobante_id;
  INSERT INTO comprobante_items (id, comprobante_id, descripcion, cantidad, precio, alicuota_iva, subtotal, created_at)
  SELECT m.new_id, f_comprobante_id.new_id, t.descripcion, t.cantidad, t.precio, t.alicuota_iva, t.subtotal, t.created_at
  FROM comprobante_items t
  JOIN map_comprobante_items m ON m.old_id = t.id
  JOIN map_comprobantes sp2 ON sp2.old_id = t.comprobante_id
  JOIN map_comprobantes f_comprobante_id ON f_comprobante_id.old_id = t.comprobante_id
;

  -- plato_componentes
  CREATE TEMP TABLE map_plato_componentes(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_plato_componentes SELECT t.id, gen_random_uuid() FROM plato_componentes t JOIN map_platos_compuestos sp ON sp.old_id = t.plato_compuesto_id;
  INSERT INTO plato_componentes (id, plato_compuesto_id, nombre, receta_id, notas_produccion, orden, created_at, plaza, cantidad_diaria, unidad, sync_ops)
  SELECT m.new_id, f_plato_compuesto_id.new_id, t.nombre, f_receta_id.new_id, t.notas_produccion, t.orden, t.created_at, t.plaza, t.cantidad_diaria, t.unidad, t.sync_ops
  FROM plato_componentes t
  JOIN map_plato_componentes m ON m.old_id = t.id
  JOIN map_platos_compuestos sp2 ON sp2.old_id = t.plato_compuesto_id
  JOIN map_platos_compuestos f_plato_compuesto_id ON f_plato_compuesto_id.old_id = t.plato_compuesto_id
  LEFT JOIN map_recetas f_receta_id ON f_receta_id.old_id = t.receta_id
;

  -- comanda_item_modificadores
  CREATE TEMP TABLE map_comanda_item_modificadores(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_comanda_item_modificadores SELECT t.id, gen_random_uuid() FROM comanda_item_modificadores t JOIN map_comanda_items sp ON sp.old_id = t.comanda_item_id;
  INSERT INTO comanda_item_modificadores (id, comanda_item_id, tipo, texto, flag_alergeno, created_at)
  SELECT m.new_id, f_comanda_item_id.new_id, t.tipo, t.texto, t.flag_alergeno, t.created_at
  FROM comanda_item_modificadores t
  JOIN map_comanda_item_modificadores m ON m.old_id = t.id
  JOIN map_comanda_items sp2 ON sp2.old_id = t.comanda_item_id
  JOIN map_comanda_items f_comanda_item_id ON f_comanda_item_id.old_id = t.comanda_item_id
;

  -- eventos_cocina
  CREATE TEMP TABLE map_eventos_cocina(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_eventos_cocina SELECT t.id, gen_random_uuid() FROM eventos_cocina t JOIN map_comanda_items sp ON sp.old_id = t.comanda_item_id;
  INSERT INTO eventos_cocina (id, comanda_item_id, evento, ts)
  SELECT m.new_id, f_comanda_item_id.new_id, t.evento, t.ts
  FROM eventos_cocina t
  JOIN map_eventos_cocina m ON m.old_id = t.id
  JOIN map_comanda_items sp2 ON sp2.old_id = t.comanda_item_id
  JOIN map_comanda_items f_comanda_item_id ON f_comanda_item_id.old_id = t.comanda_item_id
;

  -- produccion_diaria
  CREATE TEMP TABLE map_produccion_diaria(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_produccion_diaria SELECT id, gen_random_uuid() FROM produccion_diaria WHERE restaurante_id = v_src;
  INSERT INTO produccion_diaria (id, fecha, plato_compuesto_id, componente_id, status, cantidad, usuario_asignado, notas, restaurante_id, created_at, updated_at, menu_tag)
  SELECT m.new_id, t.fecha, f_plato_compuesto_id.new_id, f_componente_id.new_id, t.status, t.cantidad, t.usuario_asignado, t.notas, v_dest, t.created_at, t.updated_at, t.menu_tag
  FROM produccion_diaria t
  JOIN map_produccion_diaria m ON m.old_id = t.id
  JOIN map_platos_compuestos f_plato_compuesto_id ON f_plato_compuesto_id.old_id = t.plato_compuesto_id
  JOIN map_plato_componentes f_componente_id ON f_componente_id.old_id = t.componente_id
;

  -- bitacora_items
  CREATE TEMP TABLE map_bitacora_items(old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
  INSERT INTO map_bitacora_items SELECT t.id, gen_random_uuid() FROM bitacora_items t JOIN map_bitacora_entradas sp ON sp.old_id = t.entrada_id;
  INSERT INTO bitacora_items (id, entrada_id, restaurante_id, texto, nivel, orden, completado, created_at)
  SELECT m.new_id, f_entrada_id.new_id, v_dest, t.texto, t.nivel, t.orden, t.completado, t.created_at
  FROM bitacora_items t
  JOIN map_bitacora_items m ON m.old_id = t.id
  JOIN map_bitacora_entradas sp2 ON sp2.old_id = t.entrada_id
  JOIN map_bitacora_entradas f_entrada_id ON f_entrada_id.old_id = t.entrada_id
;


  RETURN 'reset_demo_restaurante OK: ' || now()::text;
END;
$function$;

NOTIFY pgrst, 'reload schema';
