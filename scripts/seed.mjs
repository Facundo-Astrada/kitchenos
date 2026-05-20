/**
 * Inserta datos de desarrollo:
 *  - Restaurante mock (ID fijo para RESTAURANTE_ID_MOCK)
 *  - Policy temporal que permite anon leer/escribir productos del mock
 *
 * Ejecutar UNA sola vez: node scripts/seed.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const MANAGEMENT_URL = 'https://api.supabase.com/v1/projects/' + (SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || '') + '/database/query';

if (!SUPABASE_URL || !SUPABASE_KEY || !MANAGEMENT_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_MANAGEMENT_TOKEN');
  process.exit(1);
}

const MOCK_ID = '00000000-0000-0000-0000-000000000001'

async function sql(query) {
  const res = await fetch(MANAGEMENT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (data.message) {
    console.error('❌', query.slice(0, 60).trim(), '\n  ', data.message)
    process.exit(1)
  }
  return data
}

console.log('🌱 Iniciando seed KitchenOS...\n')

// ── 1. Restaurante mock ──────────────────────────────────────
await sql(`
  INSERT INTO restaurantes (id, nombre, ciudad)
  VALUES ('${MOCK_ID}', 'El Rescoldo', 'Córdoba')
  ON CONFLICT (id) DO NOTHING
`)
console.log('✅ Restaurante mock insertado (o ya existía)')

// ── 2. Policy temporal dev: anon puede operar productos del mock ──
// IMPORTANTE: remover antes de producción
await sql(`
  DROP POLICY IF EXISTS "dev_anon_productos" ON productos;
  CREATE POLICY "dev_anon_productos" ON productos
    FOR ALL
    USING (restaurante_id = '${MOCK_ID}')
    WITH CHECK (restaurante_id = '${MOCK_ID}')
`)
console.log('✅ Policy dev (anon) en productos — recordá eliminarla en producción')

// ── 3. Policy temporal dev: anon puede ver restaurante mock ──
await sql(`
  DROP POLICY IF EXISTS "dev_anon_restaurantes" ON restaurantes;
  CREATE POLICY "dev_anon_restaurantes" ON restaurantes
    FOR SELECT
    USING (id = '${MOCK_ID}')
`)
console.log('✅ Policy dev (anon) en restaurantes')

console.log('\n🎉 Seed completado.')
console.log('⚠️  Las policies "dev_anon_*" son solo para desarrollo. Eliminalas antes de producción.\n')
