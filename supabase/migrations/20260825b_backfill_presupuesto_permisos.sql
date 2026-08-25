-- PLAN-PRESUPUESTO-CMV-2026-08 bloque 3 punto 3 — backfill del modulo nuevo
-- para puestos/roles ya creados en DB (mismo gotcha que dejo Organigrama
-- invisible: agregar un ModuloId no lo habilita solo).
--
-- Criterio: ver_costos/puede_ver_costos = true, NO nivel='admin'. En cuentas
-- reales "Chef Ejecutivo"/"Sous Chef" quedan cargados con nivel != 'admin'
-- (columnas.md ya lo advierte) -- ver_costos es el gate real que usa la
-- pantalla nueva, asi que es el criterio correcto para decidir quien la ve.

UPDATE puestos
SET permisos_app = array_append(permisos_app, 'presupuesto')
WHERE ver_costos = true
  AND NOT ('presupuesto' = ANY(permisos_app));

UPDATE rol_permisos
SET modulos_visibles = array_append(modulos_visibles, 'presupuesto')
WHERE puede_ver_costos = true
  AND NOT ('presupuesto' = ANY(modulos_visibles));
