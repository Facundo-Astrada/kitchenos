/**
 * Crea la cuenta demo pública (Q2 — PLAN-ROADMAP-COMPETENCIA-2026-07.md).
 * Idempotente: si ya existe, no duplica.
 * Uso: node --env-file=.env.local scripts/crear-cuenta-demo.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Mantener en sync con lib/demo.ts (script plano, no puede importar el .ts directo)
export const DEMO_RESTAURANTE_ID = '00000000-0000-0000-0000-000000000002'
export const DEMO_EMAIL = 'demo@kitchenos.app'
export const DEMO_PASSWORD = 'VerDemoKOS2026!'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function main() {
  // 1) Restaurante demo (clon de El Rescoldo, id fijo)
  const { error: restError } = await supabase
    .from('restaurantes')
    .upsert({ id: DEMO_RESTAURANTE_ID, nombre: 'El Rescoldo Demo' }, { onConflict: 'id' })
  if (restError) throw restError
  console.log('✓ restaurantes: El Rescoldo Demo', DEMO_RESTAURANTE_ID)

  // 2) Usuario de auth (o reusar si ya existe)
  let userId
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (createErr) {
    if (!/already registered|already exists/i.test(createErr.message)) throw createErr
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
    if (listErr) throw listErr
    const existing = list.users.find(u => u.email === DEMO_EMAIL)
    if (!existing) throw new Error('No se encontró el usuario demo existente')
    userId = existing.id
    console.log('✓ auth user ya existía:', userId)
  } else {
    userId = created.user.id
    console.log('✓ auth user creado:', userId)
  }

  // 3) Link al restaurante demo como admin
  const { error: linkError } = await supabase
    .from('user_restaurantes')
    .upsert({ user_id: userId, restaurante_id: DEMO_RESTAURANTE_ID, rol: 'admin' }, { onConflict: 'user_id,restaurante_id' })
  if (linkError) throw linkError
  console.log('✓ user_restaurantes vinculado')

  // 4) equipo_miembros (nombre visible en headers/avatares de la app)
  const { data: miembroExistente } = await supabase
    .from('equipo_miembros')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (!miembroExistente) {
    const { error: miembroError } = await supabase.from('equipo_miembros').insert({
      nombre: 'Visitante', apellido: 'Demo', rol: 'admin',
      auth_user_id: userId, restaurante_id: DEMO_RESTAURANTE_ID, activo: true,
    })
    if (miembroError) throw miembroError
    console.log('✓ equipo_miembros creado')
  } else {
    console.log('✓ equipo_miembros ya existía')
  }

  // 5) rol_permisos admin (acceso completo dentro del sandbox demo)
  const { error: permisosError } = await supabase.from('rol_permisos').upsert({
    restaurante_id: DEMO_RESTAURANTE_ID,
    rol: 'admin',
    modulos_visibles: [
      'home', 'operaciones', 'tareas', 'recetario', 'stock', 'carta', 'checklist', 'pase',
      'pedidos', 'proveedores', 'facturas', 'reportes', 'turnos', 'calendario',
      'haccp', 'equipo', 'configuracion', 'produccion', 'merma', 'ventas',
    ],
    puede_editar_stock: true, puede_editar_recetas: true, puede_editar_carta: true,
    puede_editar_equipo: true, puede_eliminar: true,
  }, { onConflict: 'restaurante_id,rol' })
  if (permisosError) throw permisosError
  console.log('✓ rol_permisos admin sembrado')

  console.log('\nListo. DEMO_RESTAURANTE_ID =', DEMO_RESTAURANTE_ID, '· login:', DEMO_EMAIL, '/', DEMO_PASSWORD)
  console.log('Falta: clonar los datos de El Rescoldo → El Rescoldo Demo (reset_demo_restaurante()).')
}

main().catch(e => { console.error(e); process.exit(1) })
