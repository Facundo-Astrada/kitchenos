/**
 * Migración Checklist Mise en Place
 * Ejecutar: node scripts/migrate-checklist.mjs
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
    headers: {
      'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (data.message) {
    console.error('❌', query.slice(0, 80).trim(), '\n  ', data.message)
    return false
  }
  return true
}

console.log('🚀 Migración Checklist Mise en Place\n')

// ── 1. checklist_items ──
console.log('1. checklist_items...')
await sql(`
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza text NOT NULL,
  seccion text NOT NULL DEFAULT 'estacion',
  nombre text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  unidad text NOT NULL DEFAULT 'u',
  ubicacion text,
  receta_id uuid,
  orden integer NOT NULL DEFAULT 0,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_items_rest ON checklist_items(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_items_plaza ON checklist_items(plaza)`)
console.log('   ✅ checklist_items creada')

// ── 2. checklist_registros ──
console.log('2. checklist_registros...')
await sql(`
CREATE TABLE IF NOT EXISTS checklist_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  completado boolean NOT NULL DEFAULT false,
  usuario_id text,
  hora_completado timestamptz,
  turno text NOT NULL DEFAULT 'apertura',
  UNIQUE(checklist_item_id, fecha, turno)
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_registros_fecha ON checklist_registros(fecha)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_registros_item ON checklist_registros(checklist_item_id)`)
console.log('   ✅ checklist_registros creada')

// ── 3. RLS ──
console.log('3. RLS permisivo...')
await sql(`ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE checklist_registros ENABLE ROW LEVEL SECURITY`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_items_all') THEN CREATE POLICY "checklist_items_all" ON checklist_items FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_registros_all') THEN CREATE POLICY "checklist_registros_all" ON checklist_registros FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
console.log('   ✅ RLS configurado')

// ── 4. checklist_secciones ──
console.log('4. checklist_secciones...')
await sql(`
CREATE TABLE IF NOT EXISTS checklist_secciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  icono text NOT NULL DEFAULT 'inventory_2',
  orden integer NOT NULL DEFAULT 0,
  plaza text NOT NULL,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_secciones_rest ON checklist_secciones(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_checklist_secciones_plaza ON checklist_secciones(plaza)`)
await sql(`ALTER TABLE checklist_secciones ENABLE ROW LEVEL SECURITY`)
await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'checklist_secciones_all') THEN CREATE POLICY "checklist_secciones_all" ON checklist_secciones FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
console.log('   ✅ checklist_secciones creada')

// ── 5. Columnas extra en checklist_items ──
console.log('5. Columnas seccion_id + prioridad en checklist_items...')
await sql(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS seccion_id uuid`)
await sql(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'chk'`)
console.log('   ✅ Columnas agregadas')

// ── 6. Realtime ──
console.log('6. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items`)
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE checklist_registros`)
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE checklist_secciones`)
console.log('   ✅ Realtime habilitado')

console.log('\n🎉 Migración checklist completa!')
