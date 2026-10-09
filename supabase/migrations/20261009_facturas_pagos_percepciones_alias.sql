-- Fudo → K-OS: percepciones (IIBB/Ganancias/otras), sector, creador, pagos y aprendizaje de vínculos producto↔descripción.
alter table facturas
  add column if not exists percepcion_iibb numeric not null default 0,
  add column if not exists percepcion_ganancias numeric not null default 0,
  add column if not exists otras_percepciones numeric not null default 0,
  add column if not exists sector text,
  add column if not exists creado_por text;

create table if not exists factura_pagos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id),
  factura_id uuid not null references facturas(id) on delete cascade,
  external_id text,
  fecha_pago date,
  importe numeric not null default 0,
  medio_pago text,
  caja text,
  created_at timestamptz not null default now()
);
create index if not exists idx_factura_pagos_factura on factura_pagos(factura_id);
create index if not exists idx_factura_pagos_restaurante on factura_pagos(restaurante_id);
alter table factura_pagos enable row level security;
create policy factura_pagos_select on factura_pagos for select to authenticated using (restaurante_id = mi_restaurante_id());
create policy factura_pagos_insert on factura_pagos for insert to authenticated with check (restaurante_id = mi_restaurante_id());
create policy factura_pagos_update on factura_pagos for update to authenticated using (restaurante_id = mi_restaurante_id()) with check (restaurante_id = mi_restaurante_id());
create policy factura_pagos_delete on factura_pagos for delete to authenticated using (restaurante_id = mi_restaurante_id());

create table if not exists producto_alias (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id),
  alias_norm text not null,
  producto_id uuid not null references productos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (restaurante_id, alias_norm)
);
alter table producto_alias enable row level security;
create policy producto_alias_select on producto_alias for select to authenticated using (restaurante_id = mi_restaurante_id());
create policy producto_alias_insert on producto_alias for insert to authenticated with check (restaurante_id = mi_restaurante_id());
create policy producto_alias_update on producto_alias for update to authenticated using (restaurante_id = mi_restaurante_id()) with check (restaurante_id = mi_restaurante_id());
create policy producto_alias_delete on producto_alias for delete to authenticated using (restaurante_id = mi_restaurante_id());

notify pgrst, 'reload schema';
