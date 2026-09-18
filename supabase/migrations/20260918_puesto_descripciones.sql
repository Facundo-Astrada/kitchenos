-- Descripción de puesto — Fase 1 (PLAN-DESCRIPCION-PUESTO-2026-09.md § 5.1,
-- decisión 014 de excepción a la moratoria, 18/09/2026).
--
-- Borrador vivo del documento del puesto: misión, el día, responsabilidades
-- agrupadas, expectativas/límites, indicadores y condiciones. `puestos`
-- se queda con `descripcion`/`tareas_funciones` como están — esta tabla
-- guarda solo lo que no existía, no duplica.
--
-- NO incluye todavía las tablas de versión inmutable + acuse de lectura
-- (puesto_descripcion_versiones / puesto_descripcion_acuses, plan § 5.1.b):
-- esas son Fase 3, frenada hasta la consulta con el abogado laboral
-- (decisión 014). `version`/`revisado_por`/`revisado_at` sí van acá porque
-- son metadata del borrador, no del acuse.
--
-- Nota de nombres: el campo de competencias técnicas/blandas del puesto se
-- llama `capacidades_requeridas`, no `competencias` — esa palabra ya está
-- tomada por la tabla `competencias` (matriz de polivalencia) y
-- .claude/docs/glosario.md prohíbe reusar un término con dos sentidos.
create table if not exists public.puesto_descripciones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  puesto_id uuid not null references public.puestos(id) on delete cascade,

  mision text,
  -- [{ "titulo": "Fuego y brasa", "items": ["Encender la parrilla", ...] }]
  responsabilidades jsonb not null default '[]',
  -- [{ "momento": "Entrada", "hora": "15:00", "que_hace": "..." }]
  dia_tipo jsonb not null default '[]',
  jornada jsonb,
  expectativas text[] not null default '{}',
  no_negociables text[] not null default '{}',
  -- [{ "nombre": "Merma de la plaza", "meta": "< 3%", "modulo": "merma" }]
  indicadores jsonb not null default '[]',
  capacidades_requeridas jsonb,
  requisitos jsonb,
  condiciones jsonb,

  estado text not null default 'borrador' check (estado in ('borrador', 'vigente', 'archivado')),
  version int not null default 1,
  revisado_por uuid references public.equipo_miembros(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (puesto_id)
);

create index if not exists idx_puesto_descripciones_restaurante on public.puesto_descripciones (restaurante_id);

comment on table public.puesto_descripciones is 'Borrador vivo de la descripción de puesto (Fase 1). Vigente/versionado propio; el acuse de lectura con validez legal es Fase 3, tabla aparte.';
comment on column public.puesto_descripciones.capacidades_requeridas is '{ tecnicas: [], blandas: [] } — NO usar el nombre "competencias", tomado por la matriz de polivalencia.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.puesto_descripciones enable row level security;

drop policy if exists puesto_descripciones_select on public.puesto_descripciones;
drop policy if exists puesto_descripciones_insert on public.puesto_descripciones;
drop policy if exists puesto_descripciones_update on public.puesto_descripciones;
drop policy if exists puesto_descripciones_delete on public.puesto_descripciones;

create policy puesto_descripciones_select on public.puesto_descripciones
  for select using (restaurante_id = mi_restaurante_id());
create policy puesto_descripciones_insert on public.puesto_descripciones
  for insert with check (restaurante_id = mi_restaurante_id());
create policy puesto_descripciones_update on public.puesto_descripciones
  for update using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());
create policy puesto_descripciones_delete on public.puesto_descripciones
  for delete using (restaurante_id = mi_restaurante_id());

notify pgrst, 'reload schema';
