-- Bucket `fotos`: aislar por restaurante (01/09/2026).
--
-- Estaba así: `fotos_select` y `fotos_insert` con la condición `bucket_id = 'fotos'`
-- a secas para `authenticated`. O sea, cualquier usuario logueado de cualquier
-- restaurante podía listar y descargar las fotos de todos, y subir a cualquier path.
-- No había policy de DELETE ni de UPDATE — por eso el `remove()` de PhotoPicker
-- (que traga el error con un `.catch(() => {})`) nunca borró nada de verdad.
--
-- El bucket sigue siendo público: las lecturas por URL (los `<img>` de la app, la
-- carta pública QR) no pasan por RLS y siguen funcionando igual. Lo que se cierra
-- es la API autenticada — listar, descargar y escribir fuera del propio tenant.
--
-- `PhotoPicker` ahora prefija todo path con el restaurante_id, así que
-- `(storage.foldername(name))[1]` es el tenant dueño del archivo.
--
-- Nota: queda 1 objeto viejo bajo el path sin prefijo
-- (`checklists/ad8e3cd8-...-2026-07-09.png`, 68 bytes, de julio). Su URL pública
-- sigue resolviendo; solo deja de ser alcanzable por la API autenticada. No se
-- migra porque no vale el riesgo por un archivo de prueba.

DROP POLICY IF EXISTS fotos_select ON storage.objects;
DROP POLICY IF EXISTS fotos_insert ON storage.objects;

CREATE POLICY fotos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = mi_restaurante_id()::text
  );

CREATE POLICY fotos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = mi_restaurante_id()::text
  );

-- `upsert: true` de supabase-js necesita UPDATE para pisar una foto existente.
CREATE POLICY fotos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = mi_restaurante_id()::text
  )
  WITH CHECK (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = mi_restaurante_id()::text
  );

-- Faltaba: sin esto el botón de borrar foto no borraba nada.
CREATE POLICY fotos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = mi_restaurante_id()::text
  );
