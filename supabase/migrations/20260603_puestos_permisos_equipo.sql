-- Migración: sistema de puestos con permisos reales + overrides individuales por miembro
-- 2026-06-03

-- ── puestos: nivel de acceso + plaza por defecto ──────────────────────────────
ALTER TABLE puestos
  ADD COLUMN IF NOT EXISTS nivel TEXT DEFAULT 'cocinero',
  ADD COLUMN IF NOT EXISTS plaza_default TEXT;

-- nivel válido: admin | sous_chef | cocinero | bachero
-- permisos_app pasa de texto libre a ModuloId[] reales (el campo ya existe, solo cambia semántica)

-- ── equipo_miembros: overrides individuales ───────────────────────────────────
ALTER TABLE equipo_miembros
  ADD COLUMN IF NOT EXISTS modulos_extra TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modulos_restringidos TEXT[] DEFAULT '{}';

-- Comentarios descriptivos
COMMENT ON COLUMN puestos.nivel IS 'Nivel de acceso: admin | sous_chef | cocinero | bachero — mapea a rol_permisos.rol';
COMMENT ON COLUMN puestos.plaza_default IS 'Plaza OPS por defecto para miembros de este puesto';
COMMENT ON COLUMN puestos.permisos_app IS 'Array de ModuloId[] visibles para este puesto';
COMMENT ON COLUMN equipo_miembros.modulos_extra IS 'Módulos adicionales habilitados individualmente más allá del puesto';
COMMENT ON COLUMN equipo_miembros.modulos_restringidos IS 'Módulos removidos individualmente respecto al puesto';
