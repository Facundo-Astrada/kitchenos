-- REVOKE de verdad sobre las funciones expuestas por PostgREST (01/09/2026).
--
-- El 27/08 se hizo `REVOKE EXECUTE ... FROM anon, authenticated` sobre estas
-- funciones y se dio el ítem por cerrado. No cerró nada: en Postgres una función
-- nace con `EXECUTE` concedido a `PUBLIC`, y revocarle el permiso a un rol puntual
-- no le saca lo que hereda de ahí. Verificado hoy con `has_function_privilege`:
-- las tres seguían siendo ejecutables por `anon`.
--
-- La que importaba: `reset_demo_restaurante()` es SECURITY DEFINER y borra +
-- re-clona el restaurante demo entero. Con EXECUTE para `anon`, cualquiera en
-- internet podía dispararla en loop contra /rest/v1/rpc/ — destrucción de datos
-- del demo y una operación pesada como vector de DoS contra la base.
--
-- El cron (`/api/cron/reset-demo`) la llama con service_role, que no pasa por
-- estos grants: sigue funcionando igual.

REVOKE ALL ON FUNCTION public.reset_demo_restaurante()                 FROM PUBLIC, anon, authenticated;

-- Funciones de trigger: las invoca el motor de triggers, no el usuario, así que
-- nadie necesita EXECUTE. Estaban expuestas por el mismo grant implícito.
REVOKE ALL ON FUNCTION public.checklist_registros_set_restaurante()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rutina_turno_registros_set_restaurante() FROM PUBLIC, anon, authenticated;

-- `mi_restaurante_id()` se queda accesible a propósito: las policies RLS la
-- evalúan con los privilegios de quien consulta, así que `authenticated` la
-- necesita. Devuelve el restaurante del propio caller (NULL para anon) — saber
-- el propio id no es una filtración.

-- search_path fijo: sin esto un rol con un `search_path` propio puede hacer que
-- la función resuelva otra tabla con el mismo nombre.
-- (No es SECURITY DEFINER y recibe el restaurante por parámetro, así que RLS la
-- contiene: no hace falta revocarle nada, solo fijarle el search_path.)
ALTER FUNCTION public.productos_criticos_count(uuid) SET search_path = public;
