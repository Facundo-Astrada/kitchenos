-- Defensa en profundidad para las dos tablas que guardan la clave privada de
-- AFIP y los tokens WSAA. Hoy el RLS sin policies ya las protege; esto saca
-- además el GRANT, para que la protección no dependa de que nadie agregue una
-- policy por error. Ver FISCAL_RLS_NO_ES_LO_QUE_PARECE.md.
--
-- Sin impacto funcional: verificado que los 3 accesos (api/fiscal/config,
-- api/fiscal/emitir, lib/fiscal/wsfe-directo) usan createAdminClient(), o sea
-- service_role, que no se toca acá.
REVOKE ALL ON public.fiscal_config  FROM anon, authenticated;
REVOKE ALL ON public.fiscal_tickets FROM anon, authenticated;

COMMENT ON TABLE public.fiscal_config IS
  'Clave privada y certificado AFIP. Solo service_role (API routes). RLS sin policies es DELIBERADO: no agregar policies de authenticated.';
COMMENT ON TABLE public.fiscal_tickets IS
  'Cache del Ticket de Acceso WSAA (token+sign). Solo service_role. RLS sin policies es DELIBERADO.';
