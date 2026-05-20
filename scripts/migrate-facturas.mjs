/**
 * Migración Facturas v2 — tablas completas
 * Ejecutar: node scripts/migrate-facturas.mjs
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

console.log('🚀 Migración Facturas v2\n')

// 1. Drop old facturas table and recreate with full schema
console.log('1. facturas table...')
await sql(`DROP TABLE IF EXISTS factura_items CASCADE`)
await sql(`DROP TABLE IF EXISTS facturas CASCADE`)
await sql(`
CREATE TABLE facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_nombre text NOT NULL,
  proveedor_cuit text,
  fecha_factura date,
  fecha_carga timestamptz NOT NULL DEFAULT now(),
  tipo_factura text NOT NULL DEFAULT 'X',
  numero_factura text,
  subtotal numeric NOT NULL DEFAULT 0,
  iva_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  condicion_pago text NOT NULL DEFAULT 'contado',
  imagen_url text,
  status text NOT NULL DEFAULT 'pendiente',
  notas text,
  usuario_id text,
  restaurante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_facturas_rest ON facturas(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_factura DESC)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_facturas_prov ON facturas(proveedor_nombre)`)
console.log('   ✅ facturas creada')

// 2. factura_items
console.log('2. factura_items...')
await sql(`
CREATE TABLE factura_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  producto_nombre text NOT NULL,
  producto_id uuid,
  cantidad numeric NOT NULL DEFAULT 0,
  unidad text NOT NULL DEFAULT 'u',
  precio_unitario numeric NOT NULL DEFAULT 0,
  alicuota_iva numeric NOT NULL DEFAULT 21,
  subtotal numeric NOT NULL DEFAULT 0,
  precio_anterior numeric,
  created_at timestamptz NOT NULL DEFAULT now()
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_factura_items_factura ON factura_items(factura_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_factura_items_prod ON factura_items(producto_id)`)
console.log('   ✅ factura_items creada')

// 3. precio_historial
console.log('3. precio_historial...')
await sql(`
CREATE TABLE IF NOT EXISTS precio_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  precio_anterior numeric NOT NULL,
  precio_nuevo numeric NOT NULL,
  variacion_porcentaje numeric NOT NULL DEFAULT 0,
  factura_id uuid REFERENCES facturas(id) ON DELETE SET NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  restaurante_id uuid NOT NULL
)
`)
await sql(`CREATE INDEX IF NOT EXISTS idx_precio_hist_prod ON precio_historial(producto_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_precio_hist_fecha ON precio_historial(fecha DESC)`)
console.log('   ✅ precio_historial creada')

// 4. Add precio_unitario to productos if not exists
console.log('4. precio_unitario en productos...')
await sql(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_unitario numeric NOT NULL DEFAULT 0`)
console.log('   ✅ columna agregada')

// 5. RLS
console.log('5. RLS...')
for (const t of ['facturas', 'factura_items', 'precio_historial']) {
  await sql(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`)
  await sql(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '${t}_all') THEN CREATE POLICY "${t}_all" ON ${t} FOR ALL USING (true) WITH CHECK (true); END IF; END $$`)
}
console.log('   ✅ RLS configurado')

// 6. Realtime
console.log('6. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE facturas`)
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE factura_items`)
console.log('   ✅ Realtime habilitado')

console.log('\n🎉 Migración Facturas v2 completa!')
