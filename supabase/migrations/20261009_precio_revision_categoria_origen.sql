-- Cambios de precio grandes quedan "pendiente" hasta que alguien los confirma; origen = la línea de factura que los produjo.
alter table precio_historial
  add column if not exists estado text not null default 'aplicado' check (estado in ('aplicado','pendiente','descartado')),
  add column if not exists origen text;
create index if not exists idx_precio_historial_pendiente on precio_historial(restaurante_id) where estado = 'pendiente';

-- Categoría del sistema de origen (Fudo: "Verduras y frutas", "Vino", "Egresos Varios"...) para separar mercadería de otros gastos.
alter table facturas add column if not exists categoria_origen text;
update facturas set categoria_origen = nullif(trim(split_part(notas, ' · ', 1)), '')
  where external_source = 'fudo' and categoria_origen is null and notas is not null;

notify pgrst, 'reload schema';
