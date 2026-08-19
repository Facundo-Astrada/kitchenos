-- Rutina de turno — ago 2026 (PLAN-4-CAPAS, capa Ejecutar)
--
-- Modela el papel de apertura/cierre de Bros: la secuencia de acciones que la
-- cocina entera hace al empezar y al terminar un turno ("9 hs en la cocina",
-- "11.40 MEP y briefing", "bacha en cero", y las zonas de limpieza del cierre).
--
-- NO reemplaza a `checklist_rutina`, que es otra cosa pese al nombre parecido:
-- esa son tareas de limpieza POR PLAZA con frecuencia (diaria/semanal/mensual),
-- puntaje de auditoría y sync desde HACCP — responde "¿cuándo toca la campana?".
-- Esta responde "¿qué hago a las 11.40?". Ejes distintos (hora del día y turno
-- vs frecuencia y plaza), alcance distinto (cocina entera vs plaza), y de hecho
-- el papel incluye "checklist de plaza" como UN ítem propio: esto envuelve al
-- mise, no lo duplica.
--
-- Dos tablas, mismo patrón que checklist_rutina / checklist_rutina_registros:
-- la plantilla (el papel colgado en la pared) y la ejecución de cada día.

-- ── Plantilla ────────────────────────────────────────────────────────────────
create table if not exists public.rutina_turno_items (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  texto text not null,
  fase text not null check (fase in ('apertura', 'cierre')),

  -- Hora por turno, no una hora sola: el mismo ítem "bacha en cero" va 11:00 en
  -- el turno mañana y 19:00 en el tarde (ver el papel original, las dos columnas
  -- son la misma lista corrida a 8 horas). Clave = id del turno de servicio
  -- (restaurantes.configuracion.turnos_servicio, ej. 'almuerzo'/'cena'), valor =
  -- 'HH:MM'. Un ítem sin hora en un turno simplemente no la muestra — la mayoría
  -- del papel no tiene hora, va por posición en la lista.
  horas jsonb not null default '{}'::jsonb,

  -- NULL = el ítem va en todos los turnos (el caso normal). Array = solo en
  -- esos, para los pocos que son de un turno solo ("cenizas" solo cierra la
  -- noche, "17:00 cierre de cocina" solo el turno mañana).
  turnos text[],

  -- Los ítems del papel que terminan en dos puntos ("Anafes y plancha:",
  -- "parri:", "bacha:", "piso:") son slots de asignación, no checks: se llenan
  -- con quién se hizo cargo de esa zona. true = la fila pide una persona además
  -- del tilde.
  requiere_responsable boolean not null default false,

  -- ISO 1=Lun..7=Dom; null = todos los días. Para "campana (jueves)".
  dias_semana int[],

  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_rutina_turno_items_rest
  on public.rutina_turno_items (restaurante_id, fase, orden);

-- ── Ejecución diaria ─────────────────────────────────────────────────────────
create table if not exists public.rutina_turno_registros (
  id uuid primary key default gen_random_uuid(),
  -- Derivada por trigger, nunca por el cliente (ver .claude/docs/hooks.md #22):
  -- realtime exige filter por restaurante_id y el valor tiene que ser
  -- autoritativo para que nadie escriba una fila con el tenant de otro.
  restaurante_id uuid references public.restaurantes(id) on delete cascade,
  item_id uuid not null references public.rutina_turno_items(id) on delete cascade,
  fecha date not null,
  -- id del turno de servicio ('almuerzo' | 'cena' | custom). Sin FK: los turnos
  -- viven en restaurantes.configuracion JSONB, no en tabla propia.
  turno text not null,
  completado boolean not null default false,
  -- El slot de las zonas de limpieza (requiere_responsable).
  responsable_id uuid references public.equipo_miembros(id) on delete set null,
  -- Quién tildó — distinto del responsable: el encargado puede cerrar la fila
  -- de una zona que limpió otro.
  usuario_id uuid references public.equipo_miembros(id) on delete set null,
  -- A qué hora se hizo de verdad, contra la hora a la que debía hacerse
  -- (items.horas). Es el dato que convierte el papel en información.
  completado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, fecha, turno)
);

create index if not exists idx_rutina_turno_registros_lookup
  on public.rutina_turno_registros (restaurante_id, fecha, turno);

create or replace function public.rutina_turno_registros_set_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select restaurante_id into new.restaurante_id
  from rutina_turno_items where id = new.item_id;
  return new;
end $$;

-- INSERT y UPDATE: el upsert con onConflict entra por la rama de UPDATE.
drop trigger if exists trg_rutina_turno_registros_restaurante on public.rutina_turno_registros;
create trigger trg_rutina_turno_registros_restaurante
  before insert or update on public.rutina_turno_registros
  for each row execute function public.rutina_turno_registros_set_restaurante();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Filtrado directo por restaurante_id en las dos (en registros lo permite el
-- trigger de arriba) — más barato que el subquery a la tabla padre, que importa
-- porque realtime evalúa RLS por evento y por suscriptor.
alter table public.rutina_turno_items enable row level security;
alter table public.rutina_turno_registros enable row level security;

drop policy if exists rutina_turno_items_select on public.rutina_turno_items;
drop policy if exists rutina_turno_items_insert on public.rutina_turno_items;
drop policy if exists rutina_turno_items_update on public.rutina_turno_items;
drop policy if exists rutina_turno_items_delete on public.rutina_turno_items;

create policy rutina_turno_items_select on public.rutina_turno_items
  for select using (restaurante_id = mi_restaurante_id());
create policy rutina_turno_items_insert on public.rutina_turno_items
  for insert with check (restaurante_id = mi_restaurante_id());
create policy rutina_turno_items_update on public.rutina_turno_items
  for update using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());
create policy rutina_turno_items_delete on public.rutina_turno_items
  for delete using (restaurante_id = mi_restaurante_id());

drop policy if exists rutina_turno_registros_select on public.rutina_turno_registros;
drop policy if exists rutina_turno_registros_insert on public.rutina_turno_registros;
drop policy if exists rutina_turno_registros_update on public.rutina_turno_registros;
drop policy if exists rutina_turno_registros_delete on public.rutina_turno_registros;

-- El INSERT no puede chequear restaurante_id: el trigger lo llena DESPUÉS del
-- WITH CHECK, así que la fila entrante lo trae NULL. Se valida contra el padre,
-- que es lo que el trigger va a copiar de todos modos.
create policy rutina_turno_registros_select on public.rutina_turno_registros
  for select using (restaurante_id = mi_restaurante_id());
create policy rutina_turno_registros_insert on public.rutina_turno_registros
  for insert with check (
    item_id in (select id from public.rutina_turno_items where restaurante_id = mi_restaurante_id())
  );
create policy rutina_turno_registros_update on public.rutina_turno_registros
  for update using (restaurante_id = mi_restaurante_id())
  with check (
    item_id in (select id from public.rutina_turno_items where restaurante_id = mi_restaurante_id())
  );
create policy rutina_turno_registros_delete on public.rutina_turno_registros
  for delete using (restaurante_id = mi_restaurante_id());

-- Realtime: la plantilla casi no cambia, pero los registros sí (un tilde por
-- ítem por turno) y tienen que verse en los otros dispositivos de la cocina.
alter publication supabase_realtime add table public.rutina_turno_registros;
alter publication supabase_realtime add table public.rutina_turno_items;

-- Sin esto el browser no ve las tablas nuevas (ver .claude/docs/hooks.md #1).
notify pgrst, 'reload schema';
