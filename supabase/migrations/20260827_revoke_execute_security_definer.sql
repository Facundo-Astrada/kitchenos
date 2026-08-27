-- Hardening (get_advisors 27/08): estas SECURITY DEFINER eran ejecutables por
-- anon/authenticated vía RPC directo. Ninguna tiene caller desde el browser
-- (reset_demo_restaurante la usa solo el cron con service_role, que no se ve
-- afectado por este REVOKE; las otras dos son triggers, nunca deberían
-- llamarse vía RPC).
REVOKE EXECUTE ON FUNCTION public.reset_demo_restaurante() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.checklist_registros_set_restaurante() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rutina_turno_registros_set_restaurante() FROM anon, authenticated;
