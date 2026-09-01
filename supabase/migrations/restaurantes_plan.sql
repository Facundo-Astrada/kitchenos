-- Columna de plan comercial (sept 2026, decision de negocio 006 en
-- ~/Desktop/START UP KOS/00-decisiones/DECISIONES.md).
--
-- NULL a proposito, sin default: por decision 003 nadie paga todavia. Un
-- restaurante sin plan asignado no debe perder acceso a nada — mismo criterio
-- que 'restaurantes.configuracion.perfil' en usePermisos.moduloEnPerfil
-- (null = sin restriccion, todo pasa). Poner un default no-null acá bloquearia
-- retroactivamente a las cuentas existentes sin que nadie lo haya decidido.
--
-- La grilla de 4 planes está SIN VALIDAR contra ningún cliente pago — puede
-- cambiar de nombre o de contenido antes de que alguien la pague. Ver
-- lib/planes.ts para el mapeo plan -> modulos.

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS plan TEXT
  CHECK (plan IS NULL OR plan IN ('base', 'cocina', 'control', 'produccion'));

NOTIFY pgrst, 'reload schema';
