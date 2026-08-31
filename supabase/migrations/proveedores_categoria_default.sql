-- Categoría de gasto por defecto para un proveedor. Al asignarla una vez
-- (individual en Facturas, o "asignar por proveedor" en Categorías de Gasto)
-- queda guardada acá — la próxima importación de facturas del mismo
-- proveedor la aplica sola en vez de volver a entrar sin categorizar.
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS categoria_gasto_id UUID REFERENCES categorias_gasto(id) ON DELETE SET NULL;
