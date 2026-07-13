-- Fecha del último recorrido completo de Stockear por sector físico — para saber
-- qué espacio está desactualizado y priorizar el próximo conteo.
ALTER TABLE stock_sectores ADD COLUMN IF NOT EXISTS ultimo_conteo_at TIMESTAMPTZ NULL;

NOTIFY pgrst, 'reload schema';
