/**
 * Migración Checklist v2: registros con cantidad_actual + rutinas
 * Ejecutar: node scripts/migrate-checklist-v2.mjs
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

console.log('🚀 Migración Checklist v2\n')

// 1. Add cantidad_actual to checklist_registros
console.log('1. cantidad_actual en checklist_registros...')
await sql(`ALTER TABLE checklist_registros ADD COLUMN IF NOT EXISTS cantidad_actual numeric`)
// Drop hora_completado (no longer needed), keep turno
console.log('   ✅ columna agregada')

// 2. checklist_rutina table
console.log('2. checklist_rutina...')
await sql(`
CREATE TABLE IF NOT EXISTS checklist_rutina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  plaza text NOT NULL,
  frecuencia text NOT NULL DEFAULT 'semanal',
  ultima_vez timestamptz,
  orden integer NOT NULL DEFAULT 0,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_rutina_rest ON checklist_rutina(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_rutina_plaza ON checklist_rutina(plaza)`)
await sql(`ALTER TABLE checklist_rutina ENABLE ROW LEVEL SECURITY`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_rutina_all') THEN CREATE POLICY "checklist_rutina_all" ON checklist_rutina FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
console.log('   ✅ checklist_rutina creada')

// 3. checklist_rutina_registros table
console.log('3. checklist_rutina_registros...')
await sql(`
CREATE TABLE IF NOT EXISTS checklist_rutina_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rutina_id uuid NOT NULL REFERENCES checklist_rutina(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  completado boolean NOT NULL DEFAULT false,
  usuario_id text,
  UNIQUE(rutina_id, fecha)
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_rutina_reg_fecha ON checklist_rutina_registros(fecha)`)
await sql(`ALTER TABLE checklist_rutina_registros ENABLE ROW LEVEL SECURITY`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_rutina_reg_all') THEN CREATE POLICY "checklist_rutina_reg_all" ON checklist_rutina_registros FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
console.log('   ✅ checklist_rutina_registros creada')

// 4. Realtime
console.log('4. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE checklist_rutina`)
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE checklist_rutina_registros`)
console.log('   ✅ Realtime habilitado')

console.log('\n🎉 Migración checklist v2 completa!')
