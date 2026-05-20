/**
 * Migración final: eventos, equipo_miembros, turnos, puestos + auth setup
 * Ejecutar: node scripts/migrate-final.mjs
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

console.log('🔧 Final migration: eventos, equipo, turnos, puestos...\n')

// 1. eventos
await sql(`
  CREATE TABLE IF NOT EXISTS eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    descripcion text,
    tipo text NOT NULL DEFAULT 'otro',
    fecha_inicio date NOT NULL,
    fecha_fin date,
    hora_inicio time,
    hora_fin time,
    recurrente boolean NOT NULL DEFAULT false,
    frecuencia text,
    color text NOT NULL DEFAULT '#4f46e5',
    proveedor_id uuid REFERENCES proveedores(id) ON DELETE SET NULL,
    usuario_id text,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_eventos_rest ON eventos(restaurante_id);
  CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha_inicio);
  CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo);
`, 'eventos')

// 2. puestos
await sql(`
  CREATE TABLE IF NOT EXISTS puestos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    descripcion text,
    tareas_funciones text[] NOT NULL DEFAULT '{}',
    permisos_app text[] NOT NULL DEFAULT '{}',
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_puestos_rest ON puestos(restaurante_id);
`, 'puestos')

// 3. equipo_miembros
await sql(`
  CREATE TABLE IF NOT EXISTS equipo_miembros (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    nombre text NOT NULL,
    apellido text NOT NULL DEFAULT '',
    rol text NOT NULL DEFAULT 'cocinero',
    puesto_id uuid REFERENCES puestos(id) ON DELETE SET NULL,
    plaza_asignada text,
    telefono text,
    email text,
    fecha_ingreso date,
    activo boolean NOT NULL DEFAULT true,
    foto_url text,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_equipo_rest ON equipo_miembros(restaurante_id);
  CREATE INDEX IF NOT EXISTS idx_equipo_auth ON equipo_miembros(auth_user_id);
  CREATE INDEX IF NOT EXISTS idx_equipo_activo ON equipo_miembros(activo);
`, 'equipo_miembros')

// 4. turnos
await sql(`
  CREATE TABLE IF NOT EXISTS turnos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    miembro_id uuid NOT NULL REFERENCES equipo_miembros(id) ON DELETE CASCADE,
    fecha date NOT NULL,
    turno_tipo text NOT NULL DEFAULT 'mañana',
    hora_entrada time,
    hora_salida time,
    notas text,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_turnos_rest ON turnos(restaurante_id);
  CREATE INDEX IF NOT EXISTS idx_turnos_miembro ON turnos(miembro_id);
  CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_unique ON turnos(miembro_id, fecha);
`, 'turnos')

// 5. user_restaurantes (link auth users to restaurantes)
await sql(`
  CREATE TABLE IF NOT EXISTS user_restaurantes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    rol text NOT NULL DEFAULT 'admin',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, restaurante_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_rest_user ON user_restaurantes(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_rest_rest ON user_restaurantes(restaurante_id);
`, 'user_restaurantes')

// 6. RLS
for (const t of ['eventos', 'equipo_miembros', 'turnos', 'puestos', 'user_restaurantes']) {
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
for (const t of ['eventos', 'equipo_miembros', 'turnos']) {
  await sql(`ALTER PUBLICATION supabase_realtime ADD TABLE ${t};`, `Realtime ${t}`)
}

// 8. Seed puestos
await sql(`
  INSERT INTO puestos (nombre, descripcion, tareas_funciones, permisos_app, restaurante_id)
  VALUES
    ('Chef Ejecutivo', 'Responsable general de cocina', ARRAY['Diseñar carta','Costeo de recetas','Gestión de equipo','Control HACCP','Compras'], ARRAY['admin'], '00000000-0000-0000-0000-000000000001'),
    ('Sous Chef', 'Segundo al mando, reemplaza al chef', ARRAY['Supervisar plazas','Control de calidad','Producción','Gestión de turnos'], ARRAY['recetario','stock','tareas','checklist','pase','haccp','pedidos','calendario','turnos'], '00000000-0000-0000-0000-000000000001'),
    ('Parrillero', 'Responsable de parrilla y brasa', ARRAY['Encendido y mantenimiento de fuegos','Cocción de carnes','Control de temperaturas','Mise en place parrilla'], ARRAY['recetario','tareas','checklist','pase','stock'], '00000000-0000-0000-0000-000000000001'),
    ('Cocinero de Partida', 'Cocinero de línea', ARRAY['Producción diaria','Mise en place','Cocción según recetas','Limpieza de plaza'], ARRAY['recetario','tareas','checklist','pase'], '00000000-0000-0000-0000-000000000001'),
    ('Pastelero', 'Responsable de pastelería', ARRAY['Producción de postres','Mise en place pastelería','Control de masas y fermentos'], ARRAY['recetario','tareas','checklist','pase','stock'], '00000000-0000-0000-0000-000000000001'),
    ('Bachero', 'Lavado y limpieza general', ARRAY['Lavado de vajilla','Limpieza de cocina','Apoyo general','Recepción de mercadería'], ARRAY['checklist','pase'], '00000000-0000-0000-0000-000000000001'),
    ('Compras', 'Gestión de compras y proveedores', ARRAY['Recepción de facturas','Control de precios','Gestión de pedidos','Relación con proveedores'], ARRAY['stock','facturas','pedidos','proveedores','reportes'], '00000000-0000-0000-0000-000000000001');
`, 'Seed puestos')

// 9. Seed equipo_miembros
await sql(`
  INSERT INTO equipo_miembros (nombre, apellido, rol, plaza_asignada, telefono, email, fecha_ingreso, restaurante_id)
  VALUES
    ('Facundo', 'Aguirre', 'admin', null, '+5493516001234', 'facundo@elrescoldo.com', '2020-01-15', '00000000-0000-0000-0000-000000000001'),
    ('Martín', 'López', 'sous_chef', null, '+5493516002345', 'martin@elrescoldo.com', '2021-03-10', '00000000-0000-0000-0000-000000000001'),
    ('Juan', 'Pérez', 'cocinero', 'parrilla', '+5493516003456', 'juan@elrescoldo.com', '2022-06-01', '00000000-0000-0000-0000-000000000001'),
    ('Marta', 'Gómez', 'cocinero', 'frios', '+5493516004567', null, '2023-01-15', '00000000-0000-0000-0000-000000000001'),
    ('Carlos', 'Ruiz', 'cocinero', 'calientes', '+5493516005678', null, '2023-08-20', '00000000-0000-0000-0000-000000000001'),
    ('Lucía', 'Fernández', 'cocinero', 'pasteleria', '+5493516006789', 'lucia@elrescoldo.com', '2024-02-01', '00000000-0000-0000-0000-000000000001'),
    ('Diego', 'Sánchez', 'bachero', null, '+5493516007890', null, '2024-06-15', '00000000-0000-0000-0000-000000000001'),
    ('Ana', 'Morales', 'compras', null, '+5493516008901', 'ana@elrescoldo.com', '2023-11-01', '00000000-0000-0000-0000-000000000001');
`, 'Seed equipo_miembros')

console.log('\n🎉 Final migration complete!')
