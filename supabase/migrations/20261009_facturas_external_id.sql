-- Dedupe de imports: ID del sistema de origen (Fudo "Id" de gasto) para que re-importar actualice en vez de duplicar.
alter table facturas add column if not exists external_id text, add column if not exists external_source text;
create unique index if not exists facturas_external_uniq on facturas (restaurante_id, external_source, external_id) where external_id is not null;
-- Limpieza de duplicados históricos de Bros aplicada el 2026-10-09 (respaldo en bak_facturas_dedupe_20261009 / bak_factura_items_dedupe_20261009).
