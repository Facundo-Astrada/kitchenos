-- El costo de un ingrediente vinculado a Stock sale SIEMPRE del producto.
-- La cantidad y la unidad de la receta (ingredientes.cantidad/unidad) son del
-- usuario y no se tocan nunca: 500 g de un cacao que se compra por kg queda
-- 500 g, con costo_unitario = precio/kg y unidad_costo = 'kg'; calcFoodCost
-- convierte g→kg al multiplicar.
--
-- Por qué en la base y no en cada pantalla (auditoría 08/10/2026, Bros): cada
-- pantalla escribía el par costo_unitario/unidad_costo a su manera y varias
-- copiaban la unidad de la RECETA como unidad del costo (precio por kg
-- guardado "por g"): 137 líneas de Bros costeadas ×1000 (Pacu asado:
-- $7.710.700 en vez de $7.711). Facturas propagaban el precio por nombre
-- (ilike) sin tocar unidad_costo, y el auto-link tampoco la seteaba. Con el
-- trigger, cualquier camino (Recetario, edición rápida, importadores, Coach,
-- facturas) queda consistente sin depender del cliente.
--
-- peso_por_unidad_g: cuánto pesa una unidad del producto (1 u de ajo = 10 g).
-- Permite costear "2 u de ajo" contra un precio por kg (y "40 g de miso"
-- contra un precio por unidad). Sin ese dato la línea queda fuera del costo
-- (factor 0 en lib/unidades.ts), como antes.
--
-- Si el producto todavía no tiene precio (0/null) no se pisa nada: queda el
-- costo que el usuario haya cargado a mano en el ingrediente.

alter table public.productos add column if not exists peso_por_unidad_g numeric
  check (peso_por_unidad_g is null or peso_por_unidad_g > 0);

-- Respaldo de lo que había antes del realineado (rollback manual si hiciera falta).
create table if not exists public._bkp_ingredientes_costo_20261008 as
  select id, costo_unitario, unidad_costo, now() as respaldado_at
  from public.ingredientes
  where producto_id is not null;
alter table public._bkp_ingredientes_costo_20261008 enable row level security;

-- Misma canonización que canonUnit() en lib/unidades.ts.
create or replace function public.canon_unidad(u text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when x in ('g','gr','grs','gramo','gramos') then 'g'
    when x in ('kg','kgs','kilo','kilos','k') then 'kg'
    when x in ('ml','cc','mililitro','mililitros') then 'ml'
    when x in ('l','lt','lts','litro','litros') then 'l'
    when x in ('u','un','unidad','unidades') then 'u'
    else x end
  from (select lower(trim(coalesce(u, ''))) as x) s
$$;

-- Costo (y unidad del costo) de un ingrediente en función del producto.
-- Caso normal: precio y unidad del producto tal cual.
-- Caso cruzado unidad↔peso con peso_por_unidad_g cargado: se expresa el
-- costo en la familia de la receta (por 'u', o por 'g'/'ml') para que el
-- cálculo del cliente no necesite saber el peso.
create or replace function public.costo_ingrediente_desde_producto(
  p_unidad_ing text, p_precio numeric, p_unidad_prod text, p_peso_g numeric,
  out costo numeric, out unidad_costo text)
language plpgsql
immutable
set search_path = public
as $$
declare
  iu text := canon_unidad(p_unidad_ing);
  pu text := canon_unidad(p_unidad_prod);
begin
  costo := p_precio;
  unidad_costo := p_unidad_prod;
  if coalesce(p_peso_g, 0) <= 0 then return; end if;
  if iu = 'u' and pu in ('g','kg','ml','l') then
    -- receta en unidades, producto por peso/volumen → $ por unidad
    costo := p_precio * p_peso_g / (case when pu in ('kg','l') then 1000 else 1 end);
    unidad_costo := 'u';
  elsif pu = 'u' and iu in ('g','kg','ml','l') then
    -- receta en peso/volumen, producto por unidad → $ por g (o ml)
    costo := p_precio / p_peso_g;
    unidad_costo := case when iu in ('ml','l') then 'ml' else 'g' end;
  end if;
end;
$$;

create or replace function public.ingrediente_costo_desde_producto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_precio numeric;
  v_unidad text;
  v_peso numeric;
  c record;
begin
  if new.producto_id is null or coalesce(new.tipo, 'producto') = 'subreceta' then
    return new;
  end if;
  select precio_unitario, unidad, peso_por_unidad_g into v_precio, v_unidad, v_peso
  from productos where id = new.producto_id;
  if found and coalesce(v_precio, 0) > 0 then
    c := costo_ingrediente_desde_producto(new.unidad, v_precio, v_unidad, v_peso);
    new.costo_unitario := c.costo;
    new.unidad_costo := c.unidad_costo;
  end if;
  return new;
end;
$$;

drop trigger if exists ingredientes_costo_desde_producto on public.ingredientes;
create trigger ingredientes_costo_desde_producto
  before insert or update of producto_id, costo_unitario, unidad_costo, unidad, tipo
  on public.ingredientes
  for each row execute function public.ingrediente_costo_desde_producto();

-- Cambio de precio, unidad o peso por unidad en Stock (factura, edición
-- manual, sync de precios) → se propaga a todos los ingredientes vinculados
-- por producto_id. security definer: quien actualiza el producto puede no
-- tener permiso de escritura sobre recetas (p. ej. un puesto de Compras);
-- solo toca filas con producto_id = este producto (mismo restaurante).
create or replace function public.producto_propaga_costo_a_ingredientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.precio_unitario, 0) > 0
     and (new.precio_unitario is distinct from old.precio_unitario
          or new.unidad is distinct from old.unidad
          or new.peso_por_unidad_g is distinct from old.peso_por_unidad_g) then
    -- El trigger BEFORE de ingredientes recalcula costo/unidad_costo.
    update ingredientes
       set costo_unitario = new.precio_unitario
     where producto_id = new.id
       and coalesce(tipo, 'producto') <> 'subreceta';
  end if;
  return new;
end;
$$;

revoke execute on function public.producto_propaga_costo_a_ingredientes() from public, anon, authenticated;
revoke execute on function public.ingrediente_costo_desde_producto() from public, anon, authenticated;

drop trigger if exists productos_propaga_costo on public.productos;
create trigger productos_propaga_costo
  after update of precio_unitario, unidad, peso_por_unidad_g on public.productos
  for each row execute function public.producto_propaga_costo_a_ingredientes();

-- Realineado de todo lo ya vinculado (el trigger BEFORE hace el cálculo).
update public.ingredientes i
   set costo_unitario = p.precio_unitario
  from public.productos p
 where p.id = i.producto_id
   and coalesce(p.precio_unitario, 0) > 0
   and coalesce(i.tipo, 'producto') <> 'subreceta';

notify pgrst, 'reload schema';
