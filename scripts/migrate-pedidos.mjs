/**
 * Migración Pedidos
 * Ejecutar: node scripts/migrate-pedidos.mjs
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

console.log('🚀 Migración Pedidos\n')

// 1. pedidos table
console.log('1. pedidos table...')
await sql(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id uuid REFERENCES proveedores(id),
    proveedor_nombre text NOT NULL,
    fecha_pedido date NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega_esperada date,
    status text NOT NULL DEFAULT 'borrador',
    notas text,
    total_estimado numeric NOT NULL DEFAULT 0,
    usuario_id uuid,
    restaurante_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`)

// 2. pedido_items table
console.log('2. pedido_items table...')
await sql(`
  CREATE TABLE IF NOT EXISTS pedido_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES productos(id),
    producto_nombre text NOT NULL,
    cantidad numeric NOT NULL DEFAULT 0,
    unidad text NOT NULL DEFAULT 'kg',
    precio_estimado numeric NOT NULL DEFAULT 0,
    recibido boolean NOT NULL DEFAULT false,
    cantidad_recibida numeric
  )
`)

// 3. Indexes
console.log('3. Indexes...')
await sql(`CREATE INDEX IF NOT EXISTS idx_pedidos_restaurante ON pedidos(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_pedidos_proveedor ON pedidos(proveedor_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id)`)

// 4. RLS
console.log('4. RLS...')
await sql(`ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY`)
await sql(`
  DO $$ BEGIN
    CREATE POLICY "pedidos_all" ON pedidos FOR ALL USING (true) WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`)
await sql(`
  DO $$ BEGIN
    CREATE POLICY "pedido_items_all" ON pedido_items FOR ALL USING (true) WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`)

// 5. Realtime
console.log('5. Realtime...')
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE pedidos`)
await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE pedido_items`)

console.log('\n✅ Migración Pedidos completada')
