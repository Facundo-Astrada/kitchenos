/**
 * Migración Sesiones 4 + 5: Proveedores, Facturas, Recetas, Ingredientes
 * Ejecutar: node scripts/migrate-s4s5.mjs
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
    console.error('❌', query.slice(0, 80).trim(), '\n  ', data.message)
    process.exit(1)
  }
  return data
}

console.log('🚀 Migración S4+S5: Proveedores, Facturas, Recetas, Ingredientes\n')

// ── 1. proveedores ──────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS proveedores (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         text NOT NULL,
    rubro          text NOT NULL DEFAULT '',
    telefono       text NOT NULL DEFAULT '',
    dias_entrega   text[] NOT NULL DEFAULT '{}',
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    activo         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ proveedores')

// ── 2. facturas ─────────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS facturas (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id      uuid REFERENCES proveedores(id) ON DELETE SET NULL,
    proveedor_nombre  text NOT NULL DEFAULT '',
    fecha             date,
    numero_factura    text NOT NULL DEFAULT '',
    items             jsonb NOT NULL DEFAULT '[]',
    total             numeric NOT NULL DEFAULT 0,
    moneda            text NOT NULL DEFAULT 'ARS',
    restaurante_id    uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at        timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ facturas')

// ── 3. recetas ──────────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS recetas (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         text NOT NULL,
    categoria      text NOT NULL DEFAULT 'otros',
    porciones      integer NOT NULL DEFAULT 1,
    tiempo_min     integer NOT NULL DEFAULT 0,
    precio_venta   numeric NOT NULL DEFAULT 0,
    procedimiento  text NOT NULL DEFAULT '',
    activa         boolean NOT NULL DEFAULT true,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ recetas')

// ── 4. ingredientes ─────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS ingredientes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receta_id       uuid NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    cantidad        numeric NOT NULL DEFAULT 0,
    unidad          text NOT NULL DEFAULT 'kg',
    costo_unitario  numeric NOT NULL DEFAULT 0,
    unidad_costo    text NOT NULL DEFAULT 'kg',
    created_at      timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ ingredientes')

// ── 5. Índices ──────────────────────────────────────────────
await sql(`CREATE INDEX IF NOT EXISTS idx_proveedores_rest ON proveedores(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_facturas_rest ON facturas(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_facturas_prov ON facturas(proveedor_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_recetas_rest ON recetas(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_ingredientes_receta ON ingredientes(receta_id)`)
console.log('✅ índices')

// ── 6. Triggers updated_at ──────────────────────────────────
await sql(`
  DROP TRIGGER IF EXISTS proveedores_updated_at ON proveedores;
  CREATE TRIGGER proveedores_updated_at
    BEFORE UPDATE ON proveedores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
`)
await sql(`
  DROP TRIGGER IF EXISTS recetas_updated_at ON recetas;
  CREATE TRIGGER recetas_updated_at
    BEFORE UPDATE ON recetas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
`)
console.log('✅ triggers updated_at')

// ── 7. RLS ──────────────────────────────────────────────────
await sql(`ALTER TABLE proveedores  ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE facturas     ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE recetas      ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE ingredientes ENABLE ROW LEVEL SECURITY`)
console.log('✅ RLS habilitado')

// ── 8. Policies (auth-based) ────────────────────────────────
const tables = ['proveedores', 'facturas', 'recetas', 'ingredientes']
for (const t of tables) {
  const col = t === 'ingredientes' ? 'receta_id IN (SELECT id FROM recetas WHERE restaurante_id = mi_restaurante_id())' : 'restaurante_id = mi_restaurante_id()'
  for (const op of ['select', 'insert', 'update', 'delete']) {
    const using = `USING (${col})`
    const check = op === 'insert' ? `WITH CHECK (${col})` : using
    await sql(`
      DROP POLICY IF EXISTS "${t}_${op}" ON ${t};
      CREATE POLICY "${t}_${op}" ON ${t}
        FOR ${op.toUpperCase()} ${op === 'insert' ? check : using}
    `)
  }
}
console.log('✅ policies RLS (auth)')

// ── 9. Dev anon policies (temporal) ─────────────────────────
await sql(`
  DROP POLICY IF EXISTS "dev_anon_proveedores" ON proveedores;
  CREATE POLICY "dev_anon_proveedores" ON proveedores
    FOR ALL USING (restaurante_id = '${MOCK_ID}') WITH CHECK (restaurante_id = '${MOCK_ID}')
`)
await sql(`
  DROP POLICY IF EXISTS "dev_anon_facturas" ON facturas;
  CREATE POLICY "dev_anon_facturas" ON facturas
    FOR ALL USING (restaurante_id = '${MOCK_ID}') WITH CHECK (restaurante_id = '${MOCK_ID}')
`)
await sql(`
  DROP POLICY IF EXISTS "dev_anon_recetas" ON recetas;
  CREATE POLICY "dev_anon_recetas" ON recetas
    FOR ALL USING (restaurante_id = '${MOCK_ID}') WITH CHECK (restaurante_id = '${MOCK_ID}')
`)
await sql(`
  DROP POLICY IF EXISTS "dev_anon_ingredientes" ON ingredientes;
  CREATE POLICY "dev_anon_ingredientes" ON ingredientes
    FOR ALL USING (receta_id IN (SELECT id FROM recetas WHERE restaurante_id = '${MOCK_ID}'))
           WITH CHECK (receta_id IN (SELECT id FROM recetas WHERE restaurante_id = '${MOCK_ID}'))
`)
console.log('✅ policies dev (anon)')

console.log('\n🎉 Migración S4+S5 completada.')
