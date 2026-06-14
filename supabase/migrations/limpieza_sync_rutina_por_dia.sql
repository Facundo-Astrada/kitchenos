-- Limpieza (HACCP) → Rutina del Mise, por día (jun 2026)
-- Antes: sync_ops creaba un checklist_items en plaza general/sección "Limpieza"
--        → aparecía SIEMPRE en Apertura/Cierre de todas las plazas.
-- Ahora: sync_ops crea un checklist_rutina (plaza general) que aparece SOLO en la
--        pestaña Rutina, el día que corresponde (dias_semana / dia_mes).

-- 1) checklist_rutina necesita dia_mes para las rutinas mensuales
ALTER TABLE checklist_rutina ADD COLUMN IF NOT EXISTS dia_mes integer;

-- 2) Borrar los ítems del sistema viejo (los que el sync creaba en checklist_items)
DELETE FROM checklist_items
WHERE id IN (SELECT checklist_item_id FROM haccp_limpieza WHERE checklist_item_id IS NOT NULL);

-- 3) Re-sincronizar todas las limpiezas marcadas a checklist_rutina y relinkear
DO $$
DECLARE r RECORD; new_id uuid;
BEGIN
  FOR r IN SELECT * FROM haccp_limpieza WHERE sync_ops = true LOOP
    INSERT INTO checklist_rutina (nombre, plaza, frecuencia, dias_semana, dia_mes, orden, restaurante_id)
    VALUES (
      r.area || ': ' || r.tarea_limpieza,
      'general',
      CASE r.frecuencia
        WHEN 'cada_turno' THEN 'diaria'
        WHEN 'mensual'    THEN 'mensual'
        WHEN 'semanal'    THEN 'semanal'
        ELSE 'diaria' END,
      -- HACCP usa 0=Dom..6=Sáb; checklist_rutina usa ISO 1=Lun..7=Dom
      CASE WHEN r.frecuencia = 'semanal' AND r.dia_semana IS NOT NULL
           THEN ARRAY[ CASE WHEN r.dia_semana = 0 THEN 7 ELSE r.dia_semana END ]::integer[]
           ELSE NULL END,
      CASE WHEN r.frecuencia = 'mensual' THEN r.dia_mes ELSE NULL END,
      90,
      r.restaurante_id
    ) RETURNING id INTO new_id;
    UPDATE haccp_limpieza SET checklist_item_id = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Semanales sin día (datos seed con dia_semana NULL) → mostrar todos los días en vez de nunca
UPDATE checklist_rutina
SET dias_semana = NULL
WHERE dias_semana IS NOT NULL AND cardinality(dias_semana) = 1 AND dias_semana[1] IS NULL;

NOTIFY pgrst, 'reload schema';
