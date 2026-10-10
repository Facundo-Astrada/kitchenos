-- Calendario: "Avisar al equipo" por evento (oct 2026).
--
-- avisar: a quién avisar al crearlo. NULL = a nadie (default: un evento no
--   interrumpe a nadie salvo que quien lo carga lo pida — PLAN-ASISTENTE
--   §2b, push solo con acción/responsable/momento y ≤ 5 por semana).
--   {"modo":"todos"} | {"modo":"puestos","ids":[puesto_id…]} | {"modo":"personas","ids":[auth_user_id…]}
-- avisado_at: cuándo se mandó. El aviso sale UNA vez por evento (no en cada
--   edición, no al deshacer un borrado): lib/calendario/avisar.ts lo chequea.
--
-- Idempotente.
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS avisar jsonb;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS avisado_at timestamptz;

NOTIFY pgrst, 'reload schema';
