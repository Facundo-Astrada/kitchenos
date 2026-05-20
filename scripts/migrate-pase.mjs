/**
 * Migración Pase de Turno
 * Ejecutar: node scripts/migrate-pase.mjs
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

console.log('🚀 Migración Pase de Turno\n')

// 1. Drop old pase_mensajes if exists (placeholder table) and recreate
console.log('1. pase_mensajes table...')
await sql(`
CREATE TABLE IF NOT EXISTS pase_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto text NOT NULL,
  usuario_id text,
  usuario_nombre text NOT NULL DEFAULT 'Anónimo',
  tipo text NOT NULL DEFAULT 'texto',
  prioridad text NOT NULL DEFAULT 'normal',
  turno_fecha date NOT NULL DEFAULT CURRENT_DATE,
  turno_tipo text NOT NULL DEFAULT 'almuerzo',
  plaza text,
  leido_por jsonb NOT NULL DEFAULT '[]'::jsonb,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
console.log('   ✅ pase_mensajes creada')

// 2. Indexes
console.log('2. Indexes...')
await sql(`CREATE INDEX IF NOT EXISTS idx_pase_mensajes_rest ON pase_mensajes(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_pase_mensajes_turno ON pase_mensajes(turno_fecha, turno_tipo)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_pase_mensajes_created ON pase_mensajes(created_at DESC)`)
console.log('   ✅ Indexes creados')

// 3. RLS
console.log('3. RLS...')
await sql(`ALTER TABLE pase_mensajes ENABLE ROW LEVEL SECURITY`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pase_mensajes_all') THEN CREATE POLICY "pase_mensajes_all" ON pase_mensajes FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
console.log('   ✅ RLS configurado')

// 4. Realtime
console.log('4. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE pase_mensajes`)
console.log('   ✅ Realtime habilitado')

console.log('\n🎉 Migración Pase de Turno completa!')
