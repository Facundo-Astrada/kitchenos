-- Unificación status/estado en tareas (jun 2026)
-- `estado` (OpsEstado: pendiente/en_curso/listo/duda) es la única fuente de verdad
-- del avance de la tarea. `status` (legacy) y `completed_at` se derivan de estado.
-- Esta migración sincroniza las filas existentes que quedaron divergentes
-- (ej: estado='listo' con status='pendiente' — tareas hechas que Reportes contaba
-- como NO completadas).

UPDATE tareas SET
  status = CASE WHEN estado = 'listo' THEN 'completada' ELSE 'pendiente' END,
  completed_at = CASE WHEN estado = 'listo' THEN COALESCE(completed_at, now()) ELSE NULL END
WHERE status IS DISTINCT FROM (CASE WHEN estado = 'listo' THEN 'completada' ELSE 'pendiente' END)
   OR (estado = 'listo' AND completed_at IS NULL)
   OR (estado <> 'listo' AND completed_at IS NOT NULL);

NOTIFY pgrst, 'reload schema';
