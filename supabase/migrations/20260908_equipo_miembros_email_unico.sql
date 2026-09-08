-- El upsert de /api/invitar usa onConflict: 'email,restaurante_id', pero ese
-- índice único nunca existió — Postgres tiraba 42P10 en cada invitación y el
-- error se tragaba en silencio (ver PLAN-ARREGLOS-2026-09-08.md § 1). Sin
-- WHERE ni expresión: PostgREST genera el ON CONFLICT tal cual, así que el
-- índice tiene que matchear exacto. NULLs de email conviven sin problema
-- (distintos entre sí por defecto en un índice único de Postgres).
create unique index if not exists equipo_miembros_email_restaurante_uniq
  on public.equipo_miembros (email, restaurante_id);
