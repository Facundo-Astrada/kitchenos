-- Hardening (get_advisors 31/08, tras 20260831_reemplazar_menu_preparaciones):
-- la función quedó sin SET search_path — mismo patrón que mi_restaurante_id()
-- y el resto de las funciones del proyecto. Sin esto, alguien con permiso
-- para crear objetos en un schema anterior en el search_path del rol podría
-- sombrear una referencia no calificada; acá las referencias ya son
-- `public.tabla` así que el riesgo práctico es bajo, pero se fija igual para
-- no dejar el advisor en warning y por consistencia con el resto del código.
ALTER FUNCTION public.reemplazar_menu_preparaciones(
  UUID, TEXT, TEXT, TEXT, DATE, DATE, DATE, TEXT, TEXT[], NUMERIC, JSONB
) SET search_path = public;
