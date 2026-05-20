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
    console.error('❌', query.slice(0, 60).trim(), '\n  ', data.message)
    process.exit(1)
  }
  return data
}

console.log('🚀 Iniciando migración KitchenOS...\n')

// ── 1. restaurantes ─────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS restaurantes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        text NOT NULL,
    ciudad        text,
    configuracion jsonb NOT NULL DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ restaurantes')

// ── 2. perfiles ─────────────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS perfiles (
    id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre         text NOT NULL,
    rol            text NOT NULL DEFAULT 'ayudante',
    initials       text NOT NULL DEFAULT '',
    color          text NOT NULL DEFAULT '#64748b',
    restaurante_id uuid REFERENCES restaurantes(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ perfiles')

// ── 3. productos (stock) ─────────────────────────────────────
await sql(`
  CREATE TABLE IF NOT EXISTS productos (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         text NOT NULL,
    unidad         text NOT NULL DEFAULT 'kg',
    stock_actual   numeric NOT NULL DEFAULT 0,
    stock_minimo   numeric NOT NULL DEFAULT 0,
    stock_critico  numeric NOT NULL DEFAULT 0,
    categoria      text NOT NULL DEFAULT 'otros',
    proveedor_id   uuid,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    activo         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
  )
`)
console.log('✅ productos')

// ── 4. Índices ───────────────────────────────────────────────
await sql(`CREATE INDEX IF NOT EXISTS idx_productos_restaurante ON productos(restaurante_id)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_productos_categoria   ON productos(categoria)`)
await sql(`CREATE INDEX IF NOT EXISTS idx_perfiles_restaurante  ON perfiles(restaurante_id)`)
console.log('✅ índices')

// ── 5. updated_at trigger ───────────────────────────────────
await sql(`
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql
`)
await sql(`
  DROP TRIGGER IF EXISTS productos_updated_at ON productos;
  CREATE TRIGGER productos_updated_at
    BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
`)
console.log('✅ trigger updated_at')

// ── 6. RLS ───────────────────────────────────────────────────
await sql(`ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE perfiles     ENABLE ROW LEVEL SECURITY`)
await sql(`ALTER TABLE productos    ENABLE ROW LEVEL SECURITY`)
console.log('✅ RLS habilitado')

// ── 7. Policies ──────────────────────────────────────────────
// Helper: obtener restaurante_id del usuario actual
await sql(`
  CREATE OR REPLACE FUNCTION mi_restaurante_id()
  RETURNS uuid AS $$
    SELECT restaurante_id FROM perfiles WHERE id = auth.uid()
  $$ LANGUAGE sql SECURITY DEFINER STABLE
`)

// restaurantes: solo ver/editar el propio
await sql(`
  DROP POLICY IF EXISTS "restaurantes_select" ON restaurantes;
  CREATE POLICY "restaurantes_select" ON restaurantes
    FOR SELECT USING (id = mi_restaurante_id())
`)
await sql(`
  DROP POLICY IF EXISTS "restaurantes_update" ON restaurantes;
  CREATE POLICY "restaurantes_update" ON restaurantes
    FOR UPDATE USING (id = mi_restaurante_id())
`)

// perfiles: ver todos del restaurante, editar el propio
await sql(`
  DROP POLICY IF EXISTS "perfiles_select" ON perfiles;
  CREATE POLICY "perfiles_select" ON perfiles
    FOR SELECT USING (restaurante_id = mi_restaurante_id())
`)
await sql(`
  DROP POLICY IF EXISTS "perfiles_update" ON perfiles;
  CREATE POLICY "perfiles_update" ON perfiles
    FOR UPDATE USING (id = auth.uid())
`)
await sql(`
  DROP POLICY IF EXISTS "perfiles_insert" ON perfiles;
  CREATE POLICY "perfiles_insert" ON perfiles
    FOR INSERT WITH CHECK (id = auth.uid())
`)

// productos: CRUD completo dentro del restaurante
await sql(`
  DROP POLICY IF EXISTS "productos_select" ON productos;
  CREATE POLICY "productos_select" ON productos
    FOR SELECT USING (restaurante_id = mi_restaurante_id())
`)
await sql(`
  DROP POLICY IF EXISTS "productos_insert" ON productos;
  CREATE POLICY "productos_insert" ON productos
    FOR INSERT WITH CHECK (restaurante_id = mi_restaurante_id())
`)
await sql(`
  DROP POLICY IF EXISTS "productos_update" ON productos;
  CREATE POLICY "productos_update" ON productos
    FOR UPDATE USING (restaurante_id = mi_restaurante_id())
`)
await sql(`
  DROP POLICY IF EXISTS "productos_delete" ON productos;
  CREATE POLICY "productos_delete" ON productos
    FOR DELETE USING (restaurante_id = mi_restaurante_id())
`)
console.log('✅ policies RLS')

console.log('\n🎉 Migración completada exitosamente.')
