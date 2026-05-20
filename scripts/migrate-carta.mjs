/**
 * Migración Carta
 * Ejecutar: node scripts/migrate-carta.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const MANAGEMENT_URL = 'https://api.supabase.com/v1/projects/' + (SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || '') + '/database/query';

if (!SUPABASE_URL || !SUPABASE_KEY || !MANAGEMENT_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_MANAGEMENT_TOKEN');
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(MANAGEMENT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (data.message) { console.error('  ❌', data.message); return false }
  return true
}

console.log('🚀 Migración Carta\n')

// 1. Drop old carta_items if exists (was placeholder with wrong schema)
console.log('1. Recreando carta_items table...')
await sql(`
  CREATE TABLE IF NOT EXISTS carta_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    descripcion text,
    precio_venta numeric NOT NULL DEFAULT 0,
    categoria text NOT NULL DEFAULT 'Principales',
    receta_id uuid REFERENCES recetas(id),
    disponible boolean NOT NULL DEFAULT true,
    foto_url text,
    orden integer NOT NULL DEFAULT 0,
    restaurante_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`)

// 2. Add columns if missing (in case table existed with old schema)
console.log('2. Ensuring columns...')
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS descripcion text`)
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS precio_venta numeric NOT NULL DEFAULT 0`)
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS receta_id uuid REFERENCES recetas(id)`)
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS disponible boolean NOT NULL DEFAULT true`)
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS foto_url text`)
await sql(`ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0`)

// 3. Indexes
console.log('3. Indexes...')
await sql(`CREATE INDEX IF NOT EXISTS idx_carta_items_restaurante ON carta_items(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_carta_items_categoria ON carta_items(categoria)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_carta_items_receta ON carta_items(receta_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_carta_items_disponible ON carta_items(disponible)`)

// 4. RLS
console.log('4. RLS...')
await sql(`ALTER TABLE carta_items ENABLE ROW LEVEL SECURITY`)
await sql(`
  DO $$ BEGIN
    CREATE POLICY "carta_items_all" ON carta_items FOR ALL USING (true) WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`)

// 5. Realtime
console.log('5. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE carta_items`)

console.log('\n✅ Migración Carta completada')
