-- Aplicar DESPUÉS del deploy que pasa useDatosClave a productos_bajo_minimo_count.
drop function if exists public.productos_criticos_count(uuid);

notify pgrst, 'reload schema';
