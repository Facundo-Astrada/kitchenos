-- Bitácora — hoja de ruta / reuniones de equipo (F1) — ago 2026
--
-- Reemplaza el Google Docs de lluvia de ideas que hoy vive fuera de la app
-- (reuniones, planificación, listas, recordatorios). A diferencia del doc,
-- cada línea es una fila: eso es lo que permite arrastrar pendientes entre
-- reuniones (F2) y convertir un ítem en tarea real de OPS (F2), sin duplicar
-- el dato a mano. F1 es solo captura: entradas tipo doc con ítems editables
-- en línea (Enter/Tab), participantes desde el día 1.
--
-- Ambas tablas cargan restaurante_id propio (no vía FK al padre) siguiendo
-- .claude/docs/hooks.md #22: bitacora_items necesita la columna en la fila
-- para poder filtrar el canal de realtime por tenant.

create table if not exists public.bitacora_entradas (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references public.restaurantes(id) on delete cascade,
  titulo          text not null default 'Sin título',
  tipo            text not null default 'nota',      -- 'reunion' | 'nota' | 'lista' | 'idea'
  fecha           date not null default current_date,
  autor_id        text,                               -- equipo_miembros.id como texto, misma convención que cierres_turno.cerrado_por
  autor_nombre    text,
  -- [{id, nombre}] — denormalizado a propósito (misma convención que
  -- pase_mensajes.usuario_nombre): la pantalla no hace join para pintar chips.
  participantes   jsonb not null default '[]'::jsonb,
  fijada          boolean not null default false,
  archivada       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.bitacora_items (
  id              uuid primary key default gen_random_uuid(),
  entrada_id      uuid not null references public.bitacora_entradas(id) on delete cascade,
  restaurante_id  uuid not null references public.restaurantes(id) on delete cascade,
  texto           text not null default '',
  nivel           smallint not null default 0,        -- 0 = tema, 1 = sub-ítem (Tab indenta)
  orden           integer not null default 0,
  completado      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_bitacora_entradas_restaurante
  on public.bitacora_entradas (restaurante_id, fecha desc);

create index if not exists idx_bitacora_items_entrada
  on public.bitacora_items (entrada_id, orden);

create index if not exists idx_bitacora_items_restaurante
  on public.bitacora_items (restaurante_id);

alter table public.bitacora_entradas enable row level security;
alter table public.bitacora_items enable row level security;

drop policy if exists "bitacora_entradas_select" on public.bitacora_entradas;
create policy "bitacora_entradas_select" on public.bitacora_entradas for select to authenticated
  using (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_entradas_insert" on public.bitacora_entradas;
create policy "bitacora_entradas_insert" on public.bitacora_entradas for insert to authenticated
  with check (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_entradas_update" on public.bitacora_entradas;
create policy "bitacora_entradas_update" on public.bitacora_entradas for update to authenticated
  using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_entradas_delete" on public.bitacora_entradas;
create policy "bitacora_entradas_delete" on public.bitacora_entradas for delete to authenticated
  using (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_items_select" on public.bitacora_items;
create policy "bitacora_items_select" on public.bitacora_items for select to authenticated
  using (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_items_insert" on public.bitacora_items;
create policy "bitacora_items_insert" on public.bitacora_items for insert to authenticated
  with check (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_items_update" on public.bitacora_items;
create policy "bitacora_items_update" on public.bitacora_items for update to authenticated
  using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());

drop policy if exists "bitacora_items_delete" on public.bitacora_items;
create policy "bitacora_items_delete" on public.bitacora_items for delete to authenticated
  using (restaurante_id = mi_restaurante_id());

-- Realtime: dos personas pueden estar anotando la misma reunión a la vez.
do $$
begin
  alter publication supabase_realtime add table public.bitacora_entradas;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.bitacora_items;
exception
  when duplicate_object then null;
end $$;

-- Sin esto el browser no ve las tablas (ver .claude/docs/hooks.md #1).
notify pgrst, 'reload schema';
