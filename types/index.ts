// ── Roles ──────────────────────────────────────────────────
export type Rol =
  | 'admin'
  | 'chef'
  | 'parrilla'
  | 'frios'
  | 'calientes'
  | 'pase'
  | 'pasteleria'
  | 'panaderia'
  | 'linea'
  | 'ayudante'

// ── Usuario / Perfil (client-side, not a direct DB table) ───
export interface Perfil {
  id: string
  nombre: string
  rol: Rol
  initials: string
  color: string
  restaurante_id: string
  created_at?: string
}

// ── Restaurante ─────────────────────────────────────────────
// DB: restaurantes (id, nombre, ciudad, configuracion, created_at)
export interface Restaurante {
  id: string
  nombre: string
  ciudad?: string | null
  configuracion?: Record<string, unknown> | null
  created_at?: string | null
}

// ── user_restaurantes ───────────────────────────────────────
// DB: user_restaurantes (id, user_id, restaurante_id, rol, created_at)
export interface UserRestaurante {
  id: string
  user_id: string
  restaurante_id: string
  rol: string
  created_at?: string | null
}

// ── Recetario ───────────────────────────────────────────────
export type CategoriaReceta = string
export type RecetaStatus = 'published' | 'draft'

// DB: ingredientes (id, receta_id, nombre, cantidad, unidad, costo_unitario, unidad_costo, subreceta_id, tipo, merma_pct, producto_id, created_at)
export interface Ingrediente {
  id: string
  receta_id: string
  nombre: string
  cantidad: number
  unidad: string
  costo_unitario?: number | null
  unidad_costo?: string | null
  subreceta_id?: string | null
  tipo?: string | null
  merma_pct?: number | null
  producto_id?: string | null
  created_at?: string | null
  // OPS / mise por ingrediente — se usa cuando la receta es_plato (mismo set que menu_preparaciones)
  plaza?: string | null
  seccion_mise?: string | null
  cantidad_ops?: number | null
  unidad_ops?: string | null
  recipiente_nombre?: string | null
  peso_porcion?: number | null
  peso_porcion_unidad?: string | null
  // Etapa/sección editable dentro de la receta (ej. "Etapa 1 — marinada"). NULL = sin etapa.
  grupo?: string | null
}

// DB: plato_recetas (id, plato_id, receta_id, porciones, orden, created_at)
export interface PlatoReceta {
  id: string
  plato_id: string
  receta_id: string
  porciones: number
  orden: number
  created_at?: string | null
}

// DB: recetas (id, nombre, categoria, porciones, tiempo_min, precio_venta, procedimiento, status, activa, foto_url, peso_total_g, peso_escurrido_g, vida_util_dias, restaurante_id, created_at, updated_at)
export interface Receta {
  id: string
  nombre: string
  categoria: string
  porciones?: number | null
  tiempo_min?: number | null
  precio_venta?: number | null
  procedimiento?: string | null
  status: string
  activa?: boolean | null
  foto_url?: string | null
  peso_total_g?: number | null
  peso_escurrido_g?: number | null
  vida_util_dias?: number | null
  es_plato?: boolean | null   // modo "trabajar como plato": la ficha rutea cada ingrediente a OPS
  restaurante_id: string
  created_at: string
  updated_at?: string | null
  // joined data (not in DB)
  ingredientes?: Ingrediente[]
}

export interface FoodCostCalc {
  costo_total: number
  costo_porcion: number
  food_cost_pct: number
  margen_bruto: number
}

// ── Facturas ────────────────────────────────────────────────
export type TipoFactura = 'A' | 'B' | 'C' | 'X' | 'remito' | 'ticket'
export type CondicionPago = 'contado' | '30dias' | '60dias' | 'cuenta_corriente'
export type FacturaStatus = 'pendiente' | 'confirmada' | 'observada' | 'pagada'

// DB: factura_items (id, factura_id, producto_nombre, producto_id, cantidad, unidad, precio_unitario, alicuota_iva, subtotal, precio_anterior, created_at)
export interface FacturaItem {
  id: string
  factura_id: string
  producto_nombre: string
  producto_id?: string | null
  cantidad: number
  unidad?: string | null
  precio_unitario: number
  alicuota_iva?: number | null
  subtotal?: number | null
  precio_anterior?: number | null
  created_at: string
}

// DB: facturas (id, restaurante_id, proveedor_nombre, proveedor_cuit, numero_factura, tipo_factura, fecha_factura, fecha_carga, condicion_pago, subtotal, iva_total, total, imagen_url, status, notas, usuario_id, created_at)
export interface Factura {
  id: string
  restaurante_id: string
  proveedor_nombre: string
  proveedor_cuit?: string | null
  numero_factura?: string | null
  tipo_factura?: string | null
  fecha_factura: string
  fecha_carga?: string | null
  condicion_pago?: string | null
  subtotal?: number | null
  iva_total?: number | null
  total: number
  imagen_url?: string | null
  status?: string | null
  notas?: string | null
  usuario_id?: string | null
  pedido_id?: string | null
  created_at: string
}

// DB: precio_historial (id, producto_id, precio_anterior, precio_nuevo, variacion_porcentaje, factura_id, fecha, restaurante_id)
export interface PrecioHistorial {
  id: string
  producto_id?: string | null
  precio_anterior?: number | null
  precio_nuevo?: number | null
  variacion_porcentaje?: number | null
  factura_id?: string | null
  fecha?: string | null
  restaurante_id?: string | null
}

// ── Stock ───────────────────────────────────────────────────
export type EstadoStock = 'ok' | 'bajo' | 'critico'
export type CategoriaStock = string

// DB: categorias_producto (id, restaurante_id, nombre, color, icono)
export interface CategoriaProducto {
  id: string
  restaurante_id: string
  nombre: string
  color?: string | null
  icono?: string | null
}

// DB: productos (id, nombre, categoria, categoria_id, unidad, unidad_uso, unidad_compra, cantidad_por_envase, stock_actual, stock_minimo, stock_critico, precio_unitario, proveedor_id, sector_id, fuera_de_uso, estante_id, orden_sector, restaurante_id, activo, created_at, updated_at)
export interface Producto {
  id: string
  nombre: string
  categoria: string
  categoria_id?: string | null
  unidad: string
  unidad_uso?: string | null
  unidad_compra?: string | null
  cantidad_por_envase?: number | null
  stock_actual: number
  stock_minimo: number
  stock_critico: number
  precio_unitario: number
  proveedor_id?: string | null
  es_produccion?: boolean | null
  receta_id?: string | null
  sector_id?: string | null
  fuera_de_uso?: boolean
  estante_id?: string | null
  orden_sector?: number
  restaurante_id: string
  activo: boolean
  created_at: string
  updated_at?: string | null
}

// DB: stock_sectores (id, restaurante_id, nombre, icono, orden, created_at)
export interface StockSector {
  id: string
  restaurante_id: string
  nombre: string
  icono: string
  orden: number
  created_at?: string | null
}

// DB: stock_estantes (id, restaurante_id, sector_id, nombre, orden, created_at)
export interface StockEstante {
  id: string
  restaurante_id: string
  sector_id: string
  nombre: string
  orden: number
  created_at?: string | null
}

// ── HACCP ───────────────────────────────────────────────────
// DB: haccp_equipos (id, nombre, tipo, ubicacion, plaza, temp_min, temp_max, activo, restaurante_id, created_at)
export interface HaccpEquipo {
  id: string
  nombre: string
  tipo: string
  ubicacion?: string | null
  plaza?: string | null
  temp_min: number
  temp_max: number
  activo: boolean
  restaurante_id: string
  created_at: string
}

// DB: haccp_temperaturas (id, equipo_id, temperatura, dentro_rango, observacion, accion_correctiva, usuario_id, restaurante_id, created_at)
export interface HaccpTemperatura {
  id: string
  equipo_id: string
  temperatura: number
  dentro_rango: boolean
  observacion?: string | null
  accion_correctiva?: string | null
  usuario_id?: string | null
  restaurante_id: string
  created_at: string
}

// DB: haccp_vencimientos (id, producto_nombre, producto_id, lote, fecha_apertura, fecha_vencimiento, ubicacion, status, usuario_id, restaurante_id, created_at)
export interface HaccpVencimiento {
  id: string
  producto_nombre: string
  producto_id?: string | null
  lote?: string | null
  fecha_apertura?: string | null
  fecha_vencimiento: string
  ubicacion?: string | null
  status: string
  usuario_id?: string | null
  restaurante_id: string
  created_at: string
}

// DB: haccp_limpieza (id, tarea_limpieza, area, frecuencia, usuario_id, ultimo_registro, restaurante_id, created_at)
export interface HaccpLimpieza {
  id: string
  tarea_limpieza: string
  area: string
  frecuencia: string
  usuario_id?: string | null
  ultimo_registro?: string | null
  restaurante_id: string
  created_at: string
}

// DB: haccp_limpieza_registros (id, limpieza_id, fecha, completado, usuario_id, observacion, created_at)
export interface HaccpLimpiezaRegistro {
  id: string
  limpieza_id: string
  fecha: string
  completado: boolean
  usuario_id?: string | null
  observacion?: string | null
  created_at: string
}

// Old types kept for backward compatibility
export type ZonaTipo = 'camara' | 'congelador' | 'equipo_caliente'

export interface RegistroTemperatura {
  id: string
  zona: string
  tipo: ZonaTipo
  valor: number
  limite_min: number
  limite_max: number
  registrado_por: string
  restaurante_id: string
  created_at: string
}

export interface ProductoVencimiento {
  id: string
  producto: string
  lote: string
  vencimiento: string
  ubicacion: string
  restaurante_id: string
  created_at: string
}

export interface RegistroSanidad {
  id: string
  items: Record<string, boolean>
  aprobado_por: string
  restaurante_id: string
  created_at: string
}

// ── Proveedores ─────────────────────────────────────────────
// DB: proveedores (id, nombre, telefono, rubro, dias_entrega text[], activo, restaurante_id, created_at, updated_at)
export interface Proveedor {
  id: string
  nombre: string
  telefono?: string | null
  rubro?: string | null
  dias_entrega?: string[] | null
  activo: boolean
  restaurante_id: string
  created_at: string
  updated_at?: string | null
}

// ── Pedidos ─────────────────────────────────────────────────
export type EstadoPedido = 'borrador' | 'enviado' | 'recibido' | 'parcial'

// DB: pedido_items (id, pedido_id, producto_nombre, producto_id, cantidad, unidad, precio_estimado, cantidad_recibida, recibido)
export interface PedidoItem {
  id: string
  pedido_id: string
  producto_nombre: string
  producto_id?: string | null
  cantidad: number
  unidad?: string | null
  precio_estimado?: number | null
  cantidad_recibida?: number | null
  recibido: boolean
}

// DB: pedidos (id, proveedor_id, proveedor_nombre, fecha_pedido, fecha_entrega_esperada, status, notas, total_estimado, usuario_id, restaurante_id, created_at)
export interface Pedido {
  id: string
  proveedor_id: string
  proveedor_nombre?: string | null
  fecha_pedido: string
  fecha_entrega_esperada?: string | null
  entrega_desde?: string | null
  entrega_hasta?: string | null
  status: string
  notas?: string | null
  total_estimado?: number | null
  usuario_id?: string | null
  restaurante_id: string
  created_at: string
}

// Keep old ItemPedido for backward compat
export interface ItemPedido {
  producto: string
  cantidad: number
  unidad: string
}

// ── Turnos ──────────────────────────────────────────────────
export type CodigoTurno = 'P/A' | 'DSP' | 'DESP' | 'P//A' | 'LIBRE'

// DB: turnos (id, miembro_id, fecha, turno_tipo, hora_entrada, hora_salida, notas, restaurante_id, created_at)
export interface Turno {
  id: string
  miembro_id: string
  fecha: string
  turno_tipo: string
  hora_entrada: string | null
  hora_salida: string | null
  notas: string | null
  restaurante_id: string
  created_at: string
}

// ── Carta ───────────────────────────────────────────────────
export type CategoriaCarta = 'Entradas' | 'Principales' | 'Postres' | 'Bebidas' | 'Guarniciones' | 'Brunch' | 'Cafetería'

// DB: carta_items (id, nombre, descripcion, precio_venta, categoria, receta_id, disponible, foto_url, orden, restaurante_id, created_at)
export interface CartaItem {
  id: string
  nombre: string
  descripcion?: string | null
  precio_venta: number
  categoria: string
  receta_id?: string | null
  disponible: boolean
  foto_url?: string | null
  orden: number
  restaurante_id: string
  created_at: string
  estacion_default_id?: string | null
}

// ── Tareas ──────────────────────────────────────────────────
export type TareaPrioridad = 'critica' | 'alta' | 'media' | 'baja'
export type TareaStatus = 'pendiente' | 'en_proceso' | 'completada'
export type TareaCategoria = 'general' | 'plaza' | 'rutina' | 'evento' | 'produccion'
export type Plaza = 'parrilla' | 'frios' | 'calientes' | 'pase' | 'pasteleria' | 'panaderia' | 'general'
export type OpsEstado = 'pendiente' | 'en_curso' | 'listo' | 'duda'
export type OpsModo = 'menu' | 'carta' | 'evento'

export interface ChecklistItemTarea {
  texto: string
  completado: boolean
}

// DB: tareas — columnas nuevas en ops: modo, parent_id, estado, cantidad, turno_fecha, orden
export interface Tarea {
  id: string
  titulo: string
  descripcion?: string | null
  status: string
  prioridad: string
  categoria?: string | null
  seccion?: string | null
  plaza?: string | null
  asignado_a?: string | null
  creado_por?: string | null
  fecha_limite?: string | null
  tiempo_estimado_min?: number | null
  receta_id?: string | null
  checklist?: ChecklistItemTarea[] | null
  completed_at?: string | null
  restaurante_id: string
  created_at: string
  // Ops fields
  modo?: OpsModo | null
  parent_id?: string | null
  estado?: OpsEstado | null
  cantidad?: number | null
  turno_fecha?: string | null
  orden?: number | null
  menu_id?: string | null
}

// ── Pase de turno ───────────────────────────────────────────
export type TipoPase = 'normal' | 'urgent' | 'alert' | 'info'
export type TipoMensajePase = 'texto' | 'alerta' | 'tarea' | 'foto' | 'audio'
export type PrioridadPase = 'normal' | 'importante' | 'urgente'
export type TurnoTipo = 'almuerzo' | 'cena' | 'noche'

// DB: pase_mensajes (id, texto, tipo, prioridad, plaza, turno_fecha, turno_tipo, usuario_id, usuario_nombre, leido_por jsonb, restaurante_id, created_at)
export interface PaseMensaje {
  id: string
  texto: string
  tipo?: string | null
  prioridad?: string | null
  plaza?: string | null
  turno_fecha?: string | null
  turno_tipo?: string | null
  usuario_id?: string | null
  usuario_nombre?: string | null
  leido_por?: string[] | Record<string, unknown> | null
  restaurante_id: string
  created_at: string
}

// ── Eventos / Calendario ────────────────────────────────────
export type TipoEvento =
  | 'proveedor'
  | 'reserva'
  | 'stock'
  | 'reunion'
  | 'otro'

// DB: eventos (id, titulo, descripcion, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, color NOT NULL, recurrente NOT NULL, frecuencia, proveedor_id, usuario_id, restaurante_id, created_at)
export interface Evento {
  id: string
  titulo: string
  descripcion?: string | null
  tipo: string
  fecha_inicio: string
  fecha_fin?: string | null
  hora_inicio?: string | null
  hora_fin?: string | null
  color: string
  recurrente: boolean
  frecuencia?: string | null
  proveedor_id?: string | null
  usuario_id?: string | null
  restaurante_id: string
  created_at: string
}

// ── Checklist Mise en Place ─────────────────────────────────
export type ChecklistSeccion = string
export type MisePrioridad = 'sp' | 'p' | 'ref' | 'chk'

// DB: checklist_secciones (id, nombre, icono, plaza, orden, restaurante_id, created_at)
// tipo: 'produccion' (default, mise diario) | 'almacen' (con producto_ids + Stockear
// sección) | 'heladera' | 'freezer' (vínculo liviano a HACCP) | 'estacion'
export type ChecklistSeccionTipo = 'produccion' | 'almacen' | 'heladera' | 'freezer' | 'estacion'

export interface ChecklistSeccionConfig {
  id: string
  nombre: string
  icono: string
  plaza: string
  orden: number
  restaurante_id: string
  created_at: string
  // Opcionales: filas creadas por código que no conoce estos campos (ej. el
  // SectionEditor legacy embebido en checklist/ClientView.tsx) los omiten —
  // tratar ausencia como 'produccion'/[] (mismo default que la columna en DB).
  tipo?: ChecklistSeccionTipo
  producto_ids?: string[]
  // Sub-secciones (jul 2026): NULL/undefined = sección raíz. v1 solo permite 1
  // nivel — una fila con parent_id no puede a su vez ser padre (regla de UI,
  // no DB). ON DELETE CASCADE: borrar el padre borra sus hijos.
  parent_id?: string | null
}

// DB: checklist_items (id, plaza, seccion, nombre, cantidad, unidad, prioridad, receta_id, restaurante_id, created_at, seccion_id, ubicacion, orden, recipiente_nombre, recipiente_capacidad)
export interface MisePlaceItem {
  id: string
  plaza: string
  seccion: string
  seccion_id?: string | null
  nombre: string
  cantidad: number
  unidad: string
  prioridad: string
  ubicacion?: string | null
  receta_id?: string | null
  orden: number
  restaurante_id: string
  created_at: string
  recipiente_nombre?: string | null
  recipiente_capacidad?: number | null
  peso_porcion?: number | null
  peso_porcion_unidad?: string | null
}

// ── Espacios físicos (mesa de trabajo) ───────────────────────
// DB: espacios (id, restaurante_id, nombre, icono, orden, created_at)
export interface Espacio {
  id: string
  restaurante_id: string
  nombre: string
  icono: string
  orden: number
  created_at: string
}

// DB: espacio_plazas (id, restaurante_id, espacio_id, plaza_key, orden) — qué plazas fijas pertenecen a un espacio
export interface EspacioPlaza {
  id: string
  restaurante_id: string
  espacio_id: string
  plaza_key: Plaza
  orden: number
}

// DB: checklist_registros (id, checklist_item_id, fecha, turno, completado, cantidad_actual, usuario_id, hora_completado)
export interface MisePlaceRegistro {
  id: string
  checklist_item_id: string
  fecha: string
  turno: string
  completado: boolean
  cantidad_actual?: number | null
  usuario_id?: string | null
  hora_completado?: string | null
}

// ── Rutinas de mantenimiento ──
export type RutinaFrecuencia = 'diaria' | 'semanal' | 'quincenal' | 'mensual'

// Auditoría (M4, jul 2026): condicion muestra este ítem solo si otra rutina de auditoría
// (con puntaje) ya fue respondida con el estado indicado. NULL = siempre visible.
export interface RutinaCondicion {
  dependeDeId: string
  mostrarSiEstado: 'ok' | 'fallo'
}

// DB: checklist_rutina (id, nombre, frecuencia, plaza, restaurante_id, created_at, ultima_vez, orden, dias_semana, dia_mes, puntaje, requiere_foto, condicion)
export interface ChecklistRutina {
  id: string
  nombre: string
  frecuencia: string
  plaza: string
  ultima_vez?: string | null
  orden: number
  dias_semana?: number[] | null  // ISO 1=Lun..7=Dom; null = todos los días
  dia_mes?: number | null         // 1-31; rutina mensual (ej. limpieza sincronizada desde HACCP)
  restaurante_id: string
  created_at: string
  // Auditoría (M4, jul 2026) — NULL/false = rutina normal, sin cambios de comportamiento
  puntaje?: number | null
  requiere_foto: boolean
  condicion?: RutinaCondicion | null
}

// DB: checklist_rutina_registros (id, rutina_id, fecha, completado, usuario_id, estado, foto_url)
export interface ChecklistRutinaRegistro {
  id: string
  rutina_id: string
  fecha: string
  completado: boolean
  usuario_id?: string | null
  // Auditoría (M4, jul 2026) — solo se usan si la rutina tiene puntaje
  estado?: 'ok' | 'fallo' | null
  foto_url?: string | null
}

// DB: checklist_auditorias (id, restaurante_id, plaza, fecha, puntaje_obtenido, puntaje_posible, score, items_evaluados, items_fallidos, usuario_id, created_at)
// Snapshot de una pasada de auditoría de una plaza en un día — se recalcula/upsert-ea al cerrar la pasada.
export interface ChecklistAuditoria {
  id: string
  restaurante_id: string
  plaza: string
  fecha: string
  puntaje_obtenido: number
  puntaje_posible: number
  score: number
  items_evaluados: number
  items_fallidos: number
  usuario_id?: string | null
  created_at: string
}

// ── Equipo & Puestos ─────────────────────────────────────────
// DB: equipo_miembros (id, auth_user_id, nombre, apellido, rol, puesto_id, plaza_asignada, telefono, email, fecha_ingreso, activo, foto_url, modulos_extra, modulos_restringidos, restaurante_id, created_at)
export interface EquipoMiembro {
  id: string
  auth_user_id?: string | null
  nombre: string
  apellido: string
  rol: string
  puesto_id?: string | null
  plaza_asignada?: string | null
  telefono?: string | null
  email?: string | null
  fecha_ingreso?: string | null
  activo: boolean
  foto_url?: string | null
  modulos_extra?: string[]
  modulos_restringidos?: string[]
  restaurante_id: string
  created_at: string
}

// DB: puestos (id, nombre, descripcion, tareas_funciones text[] NOT NULL, permisos_app text[] NOT NULL, nivel, plaza_default, restaurante_id, created_at)
export interface Puesto {
  id: string
  nombre: string
  descripcion: string | null
  tareas_funciones: string[]
  permisos_app: string[]         // array de ModuloId reales
  nivel: string                  // admin | sous_chef | cocinero | bachero
  plaza_default: string | null   // plaza OPS por defecto
  restaurante_id: string
  created_at: string
}

// ── Permisos por Rol ─────────────────────────────────────────
// DB: rol_permisos (id, restaurante_id, rol, modulos_visibles text[], puede_editar_stock, puede_editar_equipo, puede_editar_recetas, puede_editar_carta, puede_eliminar, created_at, updated_at)
export interface RolPermiso {
  id: string
  restaurante_id: string
  rol: string
  modulos_visibles: string[]
  puede_editar_stock: boolean
  puede_editar_equipo: boolean
  puede_editar_recetas: boolean
  puede_editar_carta: boolean
  puede_eliminar: boolean
  created_at?: string | null
  updated_at?: string | null
}

export const ROLES_DISPONIBLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'cocinero', label: 'Cocinero' },
  { value: 'bachero', label: 'Bachero' },
  { value: 'compras', label: 'Compras' },
] as const

export const PLAZAS_DISPONIBLES = [
  'parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'linea',
] as const

// ── Producción / Planificación del día ──────────────────────
export type CategoriaPlato = 'Appetizer' | 'Entrada' | 'Proteína' | 'Pasta' | 'Postre' | 'Tapa' | 'Principal' | 'Guarnición'
export type StatusProduccion = 'pendiente' | 'en_proceso' | 'listo'

export const CATEGORIAS_PLATO: CategoriaPlato[] = [
  'Tapa', 'Appetizer', 'Entrada', 'Principal', 'Proteína', 'Pasta', 'Guarnición', 'Postre',
]

// DB: platos_compuestos (id, nombre, categoria, descripcion, foto_url, carta_item_id, orden, activo, restaurante_id, created_at, updated_at)
export interface PlatoCompuesto {
  id: string
  nombre: string
  categoria: string
  descripcion?: string | null
  foto_url?: string | null
  carta_item_id?: string | null
  orden: number
  activo: boolean
  restaurante_id: string
  created_at: string
  updated_at?: string | null
}

// DB: plato_componentes (id, plato_compuesto_id, nombre, receta_id, notas_produccion, orden, plaza, cantidad_diaria, unidad, created_at)
export interface PlatoComponente {
  id: string
  plato_compuesto_id: string
  nombre: string
  receta_id?: string | null
  notas_produccion?: string | null
  orden: number
  plaza?: string | null
  cantidad_diaria?: number | null
  unidad?: string | null
  created_at: string
}

// DB: produccion_diaria (id, fecha, plato_compuesto_id, componente_id, status, cantidad, usuario_asignado, notas, menu_tag, restaurante_id, created_at, updated_at)
export interface ProduccionDiaria {
  id: string
  fecha: string
  plato_compuesto_id?: string | null
  componente_id?: string | null
  status: string
  cantidad?: string | null
  usuario_asignado?: string | null
  notas?: string | null
  menu_tag?: string | null
  restaurante_id: string
  created_at: string
  updated_at?: string | null
}

// ── Merma ────────────────────────────────────────────────────
export type MotivoMerma = 'vencimiento' | 'error_coccion' | 'mala_recepcion' | 'sobro_servicio' | 'deterioro' | 'devolucion_cliente' | 'mala_conservacion' | 'otro'
export type TurnoMerma = 'apertura' | 'servicio' | 'cierre'

export const MOTIVOS_MERMA: { value: MotivoMerma; label: string; icon: string; color: string }[] = [
  { value: 'vencimiento', label: 'Venció', icon: 'event_busy', color: '#ef4444' },
  { value: 'error_coccion', label: 'Error cocción', icon: 'local_fire_department', color: '#f97316' },
  { value: 'mala_recepcion', label: 'Mala recepción', icon: 'package_2', color: '#8b5cf6' },
  { value: 'sobro_servicio', label: 'Sobró', icon: 'takeout_dining', color: '#0ea5e9' },
  { value: 'deterioro', label: 'Deterioro', icon: 'delete_sweep', color: '#64748b' },
  { value: 'devolucion_cliente', label: 'Devolución', icon: 'undo', color: '#ec4899' },
  { value: 'mala_conservacion', label: 'Mala conservación', icon: 'ac_unit', color: '#06b6d4' },
  { value: 'otro', label: 'Otro', icon: 'more_horiz', color: '#6b7280' },
]

// DB: merma (id, producto_nombre, producto_id, cantidad, unidad, motivo, motivo_detalle, plaza, usuario_id, usuario_nombre, fecha, turno, costo_estimado, restaurante_id, created_at)
export interface Merma {
  id: string
  producto_nombre: string
  producto_id?: string | null
  cantidad: number
  unidad: string
  motivo: string
  motivo_detalle?: string | null
  plaza?: string | null
  usuario_id?: string | null
  usuario_nombre?: string | null
  fecha: string
  turno: string
  costo_estimado?: number | null
  restaurante_id: string
  created_at: string
}

// ── Ventas ───────────────────────────────────────────────────
export type OrigenVenta = 'excel' | 'sheets' | 'manual' | 'pos'

// DB: ventas (id, restaurante_id, fecha, origen, total_ventas, cantidad_cubiertos, notas, created_at)
export interface Venta {
  id: string
  restaurante_id: string
  fecha: string
  origen: OrigenVenta
  total_ventas: number
  cantidad_cubiertos?: number | null
  notas?: string | null
  created_at: string
  // joined data
  items?: VentaItem[]
}

// DB: ventas_items (id, venta_id, nombre_plato, cantidad, precio_unitario, subtotal GENERATED)
export interface VentaItem {
  id: string
  venta_id: string
  nombre_plato: string
  cantidad: number
  precio_unitario: number
  subtotal?: number | null
}

// ── Evento Items (planificación de eventos) ──────────────────
export type EventoItemStatus = 'pendiente' | 'en_proceso' | 'listo'

// DB: evento_items (id, restaurante_id, evento_nombre, fecha, plato_nombre, componente_nombre, cantidad_personas, status, plaza, notas, created_at)
export interface EventoItem {
  id: string
  restaurante_id: string
  evento_nombre: string
  fecha: string          // "YYYY-MM-DD"
  plato_nombre: string
  componente_nombre: string
  cantidad_personas?: number | null
  status: EventoItemStatus
  plaza?: string | null
  notas?: string | null
  created_at: string
}

export const TODOS_LOS_MODULOS = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'tareas', label: 'Tareas' },
  { key: 'recetario', label: 'Recetario' },
  { key: 'stock', label: 'Stock' },
  { key: 'carta', label: 'Carta' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'pase', label: 'Pase de turno' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'turnos', label: 'Turnos' },
  { key: 'calendario', label: 'Calendario' },
  { key: 'haccp', label: 'HACCP' },
  { key: 'produccion', label: 'Producción' },
  { key: 'merma', label: 'Merma' },
  { key: 'equipo', label: 'Equipo' },
  { key: 'configuracion', label: 'Configuración' },
  // Fase 1: Salón + KDS + Cobro + Fiscal
  { key: 'salon', label: 'Salón' },
  { key: 'kds', label: 'KDS' },
  { key: 'cobro', label: 'Cobro' },
  { key: 'fiscal', label: 'Fiscal' },
] as const

// ── Servicio — Estaciones KDS ────────────────────────────────
// DB: estaciones (id, restaurante_id, nombre, pantalla_asignada, created_at)
export interface Estacion {
  id: string
  restaurante_id: string
  nombre: string
  pantalla_asignada?: string | null
  created_at: string
}

// ── Servicio — Comandas ──────────────────────────────────────
export type OrigenComanda = 'salon' | 'mostrador' | 'delivery' | 'marca'
export type EstadoComanda = 'abierta' | 'enviada' | 'en_prep' | 'lista' | 'cerrada' | 'cancelada'
export type EstadoComandaItem = 'pendiente' | 'en_prep' | 'listo' | 'bumpeado'
export type TipoModificador = 'con' | 'sin' | 'extra'
export type EventoCocinaType = 'fired' | 'bumped' | 'recalled'

// DB: comandas (id, restaurante_id, origen, mesa_id, mozo_id, cuenta_id, estado, course, marca, held, created_at)
export interface Comanda {
  id: string
  restaurante_id: string
  origen: OrigenComanda
  mesa_id?: string | null
  mozo_id?: string | null
  cuenta_id?: string | null
  estado: EstadoComanda
  course?: number | null
  marca?: string | null
  held?: boolean | null
  created_at: string
  // joined
  items?: ComandaItem[]
  mesa?: { numero: string; sector?: string | null } | null
  mozo?: { nombre: string; apellido?: string | null } | null
}

// DB: comanda_items (id, comanda_id, carta_item_id, cantidad, estado, estacion_id, fired_at, bumped_at, notas, created_at)
export interface ComandaItem {
  id: string
  comanda_id: string
  carta_item_id?: string | null
  cantidad: number
  estado: EstadoComandaItem
  estacion_id?: string | null
  fired_at?: string | null
  bumped_at?: string | null
  notas?: string | null
  created_at: string
  // joined
  modificadores?: ComandaItemModificador[]
  carta_item?: { nombre: string; precio_venta?: number | null } | null
}

// DB: comanda_item_modificadores (id, comanda_item_id, tipo, texto, flag_alergeno, created_at)
export interface ComandaItemModificador {
  id: string
  comanda_item_id: string
  tipo: TipoModificador
  texto: string
  flag_alergeno: boolean
  created_at: string
}

// DB: eventos_cocina (id, comanda_item_id, evento, ts)
export interface EventoCocina {
  id: string
  comanda_item_id: string
  evento: EventoCocinaType
  ts: string
}

// ── Salón — Mesas ────────────────────────────────────────────
export type EstadoMesa = 'libre' | 'ocupada' | 'cuenta_pedida'

export type MesaForma = 'cuadrada' | 'redonda' | 'rectangular'

// DB: mesas (id, restaurante_id, numero, sector, capacidad, estado, pos_x, pos_y, created_at, forma, ancho, alto, rotacion, color)
export interface Mesa {
  id: string
  restaurante_id: string
  numero: string
  sector?: string | null
  capacidad?: number | null
  estado: EstadoMesa
  pos_x: number
  pos_y: number
  created_at: string
  // Editor de mesas tipo canvas (jul 2026, Sesión 3 C3)
  forma: MesaForma
  ancho: number     // % del ancho del canvas
  alto: number      // % del alto del canvas
  rotacion: number  // 0 | 45 | 90
  color?: string | null  // hex elegido por el usuario; null = color default por estado
}

// ── Salón — Elementos decorativos (barra, caja, parrilla, planta, pared) ──────
export type ElementoTipo = 'barra' | 'caja' | 'parrilla' | 'planta' | 'pared' | 'otro'

// DB: salon_elementos (id, restaurante_id, tipo, label, pos_x, pos_y, ancho, alto, rotacion, color, created_at)
export interface SalonElemento {
  id: string
  restaurante_id: string
  tipo: ElementoTipo
  label?: string | null
  pos_x: number
  pos_y: number
  ancho: number
  alto: number
  rotacion: number
  color?: string | null
  created_at: string
}

// ── Salón — Cuentas ──────────────────────────────────────────
export type EstadoCuenta = 'abierta' | 'cerrada'

// DB: cuentas (id, restaurante_id, mesa_id, estado, total, mozo_id, abierta_at, cerrada_at, created_at)
export interface Cuenta {
  id: string
  restaurante_id: string
  mesa_id?: string | null
  estado: EstadoCuenta
  total: number
  mozo_id?: string | null
  abierta_at: string
  cerrada_at?: string | null
  created_at: string
}

// ── Cobro ────────────────────────────────────────────────────
// DB: medios_pago (id, restaurante_id, nombre, activo, created_at)
export interface MedioPago {
  id: string
  restaurante_id: string
  nombre: string
  activo: boolean
  created_at: string
}

// DB: pagos (id, cuenta_id, medio_id, monto, propina, created_at)
export interface Pago {
  id: string
  cuenta_id: string
  medio_id: string
  monto: number
  propina: number
  created_at: string
}

// ── Arqueo de caja (M1) ─────────────────────────────────────
export type EstadoCajaTurno = 'abierta' | 'cerrada'

// DB: cajas_turnos (id, restaurante_id, estado, abierta_por, fecha_apertura, monto_inicial,
//     cerrada_por, fecha_cierre, montos_esperados, montos_declarados, diferencia_total, arqueo_ciego, notas, created_at)
export interface CajaTurno {
  id: string
  restaurante_id: string
  estado: EstadoCajaTurno
  abierta_por: string | null
  fecha_apertura: string
  monto_inicial: number
  cerrada_por: string | null
  fecha_cierre: string | null
  montos_esperados: Record<string, number> | null
  montos_declarados: Record<string, number> | null
  diferencia_total: number | null
  arqueo_ciego: boolean
  notas: string | null
  created_at: string
}

// DB: caja_movimientos (id, caja_turno_id, medio_id, tipo, monto, motivo, creado_por, created_at)
export type TipoMovimientoCaja = 'retiro' | 'ingreso'
export interface CajaMovimiento {
  id: string
  caja_turno_id: string
  medio_id: string
  tipo: TipoMovimientoCaja
  monto: number
  motivo: string | null
  creado_por: string | null
  created_at: string
}

// ── Fiscal ───────────────────────────────────────────────────
export type CondicionFiscal = 'monotributo' | 'RI'
export type TipoComprobante = 'A' | 'B' | 'C' | 'NC' | 'ND'
export type EstadoComprobante = 'pendiente' | 'emitido' | 'rechazado' | 'anulado'

// DB: config_fiscal (id, restaurante_id, condicion, cuit, puntos_venta, cert_ref, created_at, updated_at)
export interface ConfigFiscal {
  id: string
  restaurante_id: string
  condicion: CondicionFiscal
  cuit: string
  puntos_venta: number[]
  cert_ref?: string | null  // referencia al secret store; nunca el .crt/.key
  created_at: string
  updated_at: string
}

// DB: comprobantes (id, restaurante_id, cuenta_id, tipo, punto_venta, numero, cae, cae_vencimiento, estado, receptor_cuit, receptor_condicion_iva, subtotal, iva, total, qr_data, arca_raw, emitido_at, created_at)
export interface Comprobante {
  id: string
  restaurante_id: string
  cuenta_id?: string | null
  tipo: TipoComprobante
  punto_venta: number
  numero?: number | null
  cae?: string | null
  cae_vencimiento?: string | null
  estado: EstadoComprobante
  receptor_cuit?: string | null
  receptor_condicion_iva?: string | null
  subtotal: number
  iva: number
  total: number
  qr_data?: string | null
  arca_raw?: Record<string, unknown> | null
  emitido_at?: string | null
  created_at: string
}

// DB: comprobante_items (id, comprobante_id, descripcion, cantidad, precio, alicuota_iva, subtotal, created_at)
export interface ComprobanteItem {
  id: string
  comprobante_id: string
  descripcion: string
  cantidad: number
  precio: number
  alicuota_iva: number  // porcentaje: 0, 10.5, 21
  subtotal: number
  created_at: string
}
