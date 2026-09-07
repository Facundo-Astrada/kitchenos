-- Matriz de polivalencia — quién sabe hacer qué, y con qué nivel.
--
-- Herramienta estándar de gestión de equipos gastronómicos (funciones × personas
-- × nivel) que hasta ahora K-OS no tenía: había puestos y permisos, pero nada
-- registraba la competencia real. Ver PLAN-IMPLANTACION-2026-09.md § 5.3 y la
-- decisión de negocio 013 en ~/Desktop/START UP KOS/00-decisiones/DECISIONES.md.
--
-- Para qué sirve, en orden de importancia:
--   1. Produce el REFERENTE de cada plaza (nivel 4 = sabe y enseña). El personal
--      de línea le pregunta a un par de confianza antes que a un jefe o a soporte.
--   2. Lee RIESGO OPERATIVO: una plaza con un solo nivel >= 3 es una plaza que se
--      cae si esa persona falta — y se sabe hoy, no ese viernes.
--   3. Convierte la capacitación en una escala en vez de un "vio el tutorial".
--
-- Ojo con la lectura: esto mide COBERTURA DEL RESTAURANTE, no rendimiento de la
-- persona. Ver DECISIONES.md § 25 — la ruta mide al restaurante, nunca a la
-- persona, y de acá no sale ningún ranking entre compañeros.

CREATE TABLE IF NOT EXISTS competencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  miembro_id UUID NOT NULL REFERENCES equipo_miembros(id) ON DELETE CASCADE,
  -- Key de plaza: PLAZAS_FIJAS o una custom del restaurante (ver
  -- todasLasPlazas() en lib/constants.ts). TEXT y no enum a propósito: las
  -- plazas custom viven en restaurantes.configuracion, no en el schema.
  plaza TEXT NOT NULL,
  -- 0 sin formar · 1 en formación · 2 con supervisión · 3 autónomo · 4 referente
  nivel SMALLINT NOT NULL DEFAULT 0 CHECK (nivel >= 0 AND nivel <= 4),
  -- Evidencia opcional de la subida de nivel (foto del mise real). El research
  -- de formación en restaurantes es claro: la prueba es el trabajo hecho, no un
  -- cuestionario. Reusa el mismo bucket que la auditoría del mise.
  evidencia_url TEXT,
  nota TEXT,
  actualizado_por UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurante_id, miembro_id, plaza)
);

ALTER TABLE competencias ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_competencias_restaurante ON competencias(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_competencias_miembro ON competencias(miembro_id);
-- Para "¿quién es el referente de esta plaza?" sin escanear la tabla entera.
CREATE INDEX IF NOT EXISTS idx_competencias_plaza_nivel
  ON competencias(restaurante_id, plaza, nivel DESC);

DROP POLICY IF EXISTS competencias_select ON competencias;
DROP POLICY IF EXISTS competencias_insert ON competencias;
DROP POLICY IF EXISTS competencias_update ON competencias;
DROP POLICY IF EXISTS competencias_delete ON competencias;

-- SELECT abierto a todo el restaurante a propósito: la matriz es el directorio
-- de referentes ("¿a quién le pregunto cómo se hace esto?"). Esconderla haría
-- que la mitad de su valor —que la gente sepa a quién recurrir— no exista.
CREATE POLICY competencias_select ON competencias FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());
CREATE POLICY competencias_insert ON competencias FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY competencias_update ON competencias FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());
CREATE POLICY competencias_delete ON competencias FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

-- Quién puede EDITAR niveles se gatea en la UI por permiso de módulo 'equipo'
-- (mismo criterio que puestos y la ficha del miembro). RLS acá solo aísla
-- tenants — es el patrón del resto de las tablas del proyecto.

NOTIFY pgrst, 'reload schema';
