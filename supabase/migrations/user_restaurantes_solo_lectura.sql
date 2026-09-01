-- Cierra la escalada de tenant vía `user_restaurantes` (01/09/2026).
--
-- `mi_restaurante_id()` es `SELECT restaurante_id FROM user_restaurantes
-- WHERE user_id = auth.uid()`, y de esa función dependen las 344 policies RLS
-- del schema. Las policies de escritura de esta tabla eran `user_id = auth.uid()`,
-- o sea: el usuario controlaba la variable que gobierna a todas las demás.
--
-- Verificado en producción (dentro de una transacción con ROLLBACK): una cocinera
-- de Bros corriendo un solo UPDATE sobre su propia fila pasaba a ver y escribir
-- las 27 recetas, 18 facturas, 58 productos y 8 miembros de otro restaurante.
-- DELETE + INSERT daba el mismo resultado por otro camino, así que se van los tres.
--
-- El alta de un restaurante pasa a `POST /api/registro` (admin client, service role,
-- que no pasa por RLS): el servidor genera el `restaurante_id` y rechaza a quien ya
-- tenga vínculo. La invitación ya iba por admin client (`/api/invitar`), no se toca.
-- Queda solo SELECT: cada quien lee su propia fila.

DROP POLICY IF EXISTS user_restaurantes_insert ON public.user_restaurantes;
DROP POLICY IF EXISTS user_restaurantes_update ON public.user_restaurantes;
DROP POLICY IF EXISTS user_restaurantes_delete ON public.user_restaurantes;

-- Sin policies de escritura, RLS ya falla cerrado. Revocamos igual los grants:
-- defensa en profundidad, para que una policy agregada sin pensar en el futuro no
-- reabra el agujero sola.
REVOKE INSERT, UPDATE, DELETE ON public.user_restaurantes FROM authenticated, anon;

-- `restaurantes_insert` era `WITH CHECK (true)` para `public`: cualquiera podía
-- crear restaurantes (era el paso 2 del registro client-side). Ya no hay alta
-- desde el browser, así que se va — de paso corta el spam de filas basura.
DROP POLICY IF EXISTS restaurantes_insert ON public.restaurantes;
REVOKE INSERT ON public.restaurantes FROM authenticated, anon;
