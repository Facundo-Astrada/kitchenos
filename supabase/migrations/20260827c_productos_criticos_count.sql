-- Count server-side de productos en crítico — ago 2026
--
-- El panel del Coach (CoachPanelContent.useDatosClave) bajaba hasta 1000 filas
-- de productos (stock_actual, stock_critico) solo para contar cuántas cumplen
-- stock_actual <= stock_critico — PostgREST no soporta comparar dos columnas
-- en un filtro, así que no había forma de pedirle el count directo. Esta
-- función lo resuelve en el server; se ejecuta como el usuario que llama
-- (sin SECURITY DEFINER), así que RLS de productos sigue aplicando normal.

create or replace function public.productos_criticos_count(p_restaurante_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from productos
  where restaurante_id = p_restaurante_id
    and activo = true
    and stock_actual <= coalesce(stock_critico, 0)
$$;

grant execute on function public.productos_criticos_count(uuid) to authenticated;

notify pgrst, 'reload schema';
