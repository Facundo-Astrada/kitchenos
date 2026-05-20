/**
 * Migración HACCP: equipos, temperaturas, vencimientos, limpieza
 * Ejecutar: node scripts/migrate-haccp.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const MANAGEMENT_URL = 'https://api.supabase.com/v1/projects/' + (SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] || '') + '/database/query';

if (!SUPABASE_URL || !SUPABASE_KEY || !MANAGEMENT_TOKEN) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_MANAGEMENT_TOKEN');
  process.exit(1);
}

async function sql(query, label) {
  console.log(`  ⏳ ${label}...`)
  const res = await fetch(MANAGEMENT_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (data.message) { console.error(`  ❌ ${label}:`, data.message); return false }
  console.log(`  ✅ ${label}`)
  return true
}

console.log('🔧 Migrating HACCP tables...\n')

// 1. haccp_equipos
await sql(`
  CREATE TABLE IF NOT EXISTS haccp_equipos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    tipo text NOT NULL DEFAULT 'camara',
    temp_min numeric NOT NULL DEFAULT 0,
    temp_max numeric NOT NULL DEFAULT 5,
    ubicacion text NOT NULL DEFAULT '',
    plaza text,
    activo boolean NOT NULL DEFAULT true,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_haccp_equipos_rest ON haccp_equipos(restaurante_id);
`, 'haccp_equipos')

// 2. haccp_temperaturas
await sql(`
  CREATE TABLE IF NOT EXISTS haccp_temperaturas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id uuid NOT NULL REFERENCES haccp_equipos(id) ON DELETE CASCADE,
    temperatura numeric NOT NULL,
    dentro_rango boolean NOT NULL DEFAULT true,
    observacion text,
    accion_correctiva text,
    usuario_id text,
    restaurante_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_haccp_temp_equipo ON haccp_temperaturas(equipo_id);
  CREATE INDEX IF NOT EXISTS idx_haccp_temp_fecha ON haccp_temperaturas(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_haccp_temp_rest ON haccp_temperaturas(restaurante_id);
`, 'haccp_temperaturas')

// 3. haccp_vencimientos
await sql(`
  CREATE TABLE IF NOT EXISTS haccp_vencimientos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_nombre text NOT NULL,
    producto_id uuid,
    fecha_vencimiento date NOT NULL,
    fecha_apertura date,
    lote text,
    ubicacion text,
    status text NOT NULL DEFAULT 'vigente',
    usuario_id text,
    restaurante_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_haccp_venc_rest ON haccp_vencimientos(restaurante_id);
  CREATE INDEX IF NOT EXISTS idx_haccp_venc_fecha ON haccp_vencimientos(fecha_vencimiento);
  CREATE INDEX IF NOT EXISTS idx_haccp_venc_status ON haccp_vencimientos(status);
`, 'haccp_vencimientos')

// 4. haccp_limpieza
await sql(`
  CREATE TABLE IF NOT EXISTS haccp_limpieza (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area text NOT NULL,
    tarea_limpieza text NOT NULL,
    frecuencia text NOT NULL DEFAULT 'diaria',
    ultimo_registro timestamptz,
    usuario_id text,
    restaurante_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_haccp_limp_rest ON haccp_limpieza(restaurante_id);
`, 'haccp_limpieza')

// 5. haccp_limpieza_registros
await sql(`
  CREATE TABLE IF NOT EXISTS haccp_limpieza_registros (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    limpieza_id uuid NOT NULL REFERENCES haccp_limpieza(id) ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    completado boolean NOT NULL DEFAULT true,
    observacion text,
    usuario_id text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_haccp_limp_reg_limp ON haccp_limpieza_registros(limpieza_id);
  CREATE INDEX IF NOT EXISTS idx_haccp_limp_reg_fecha ON haccp_limpieza_registros(fecha);
`, 'haccp_limpieza_registros')

// 6. RLS
for (const t of ['haccp_equipos', 'haccp_temperaturas', 'haccp_vencimientos', 'haccp_limpieza', 'haccp_limpieza_registros']) {
  await sql(`
    ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='${t}' AND policyname='${t}_all') THEN
        CREATE POLICY "${t}_all" ON ${t} FOR ALL USING (true) WITH CHECK (true);
      END IF;
    END $$;
  `, `RLS ${t}`)
}

// 7. Realtime
for (const t of ['haccp_equipos', 'haccp_temperaturas', 'haccp_vencimientos', 'haccp_limpieza', 'haccp_limpieza_registros']) {
  await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE ${t};`, `Realtime ${t}`)
}

// 8. Seed equipos
await sql(`
  INSERT INTO haccp_equipos (nombre, tipo, temp_min, temp_max, ubicacion, plaza, restaurante_id)
  VALUES
    ('Cámara 1 - Carnes', 'camara', 0, 5, 'Cocina principal', 'parrilla', '00000000-0000-0000-0000-000000000001'),
    ('Cámara 2 - Lácteos', 'camara', 0, 5, 'Cocina principal', 'frios', '00000000-0000-0000-0000-000000000001'),
    ('Freezer Principal', 'freezer', -22, -18, 'Depósito', null, '00000000-0000-0000-0000-000000000001'),
    ('Heladera Barra', 'heladera', 0, 5, 'Barra', null, '00000000-0000-0000-0000-000000000001'),
    ('Heladera Pastelería', 'heladera', 2, 6, 'Pastelería', 'pasteleria', '00000000-0000-0000-0000-000000000001');
`, 'Seed equipos')

// 9. Seed limpieza
await sql(`
  INSERT INTO haccp_limpieza (area, tarea_limpieza, frecuencia, restaurante_id)
  VALUES
    ('Cocina', 'Limpiar y desinfectar mesadas', 'cada_turno', '00000000-0000-0000-0000-000000000001'),
    ('Cocina', 'Limpiar campana extractora', 'semanal', '00000000-0000-0000-0000-000000000001'),
    ('Cocina', 'Desinfectar tablas de corte', 'cada_turno', '00000000-0000-0000-0000-000000000001'),
    ('Cámaras', 'Limpiar y desinfectar cámaras', 'semanal', '00000000-0000-0000-0000-000000000001'),
    ('Cámaras', 'Verificar organización FIFO', 'diaria', '00000000-0000-0000-0000-000000000001'),
    ('Baños', 'Limpiar y reponer insumos', 'cada_turno', '00000000-0000-0000-0000-000000000001'),
    ('Salón', 'Limpiar mesas y sillas', 'cada_turno', '00000000-0000-0000-0000-000000000001'),
    ('Salón', 'Barrer y trapear pisos', 'diaria', '00000000-0000-0000-0000-000000000001'),
    ('Depósito', 'Ordenar y limpiar estantes', 'semanal', '00000000-0000-0000-0000-000000000001'),
    ('Parrilla', 'Limpiar parrilla y grasa', 'diaria', '00000000-0000-0000-0000-000000000001');
`, 'Seed limpieza')

// 10. Seed vencimientos ejemplo
await sql(`
  INSERT INTO haccp_vencimientos (producto_nombre, fecha_vencimiento, fecha_apertura, lote, ubicacion, status, restaurante_id)
  VALUES
    ('Crema de Leche', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE - INTERVAL '1 day', 'L-2026-0341', 'Cámara 2', 'vigente', '00000000-0000-0000-0000-000000000001'),
    ('Queso Provolone', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE - INTERVAL '3 days', 'L-2026-0298', 'Cámara 2', 'vigente', '00000000-0000-0000-0000-000000000001'),
    ('Morcilla', CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE, 'L-2026-0355', 'Cámara 1', 'vigente', '00000000-0000-0000-0000-000000000001'),
    ('Dulce de Leche', CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE - INTERVAL '10 days', 'L-2026-0201', 'Depósito', 'vigente', '00000000-0000-0000-0000-000000000001'),
    ('Leche Entera', CURRENT_DATE, null, 'L-2026-0360', 'Cámara 2', 'vigente', '00000000-0000-0000-0000-000000000001'),
    ('Tapas de Empanada', CURRENT_DATE - INTERVAL '1 day', null, 'L-2026-0310', 'Freezer', 'vencido', '00000000-0000-0000-0000-000000000001');
`, 'Seed vencimientos')

console.log('\n🎉 HACCP migration complete!')
