#!/usr/bin/env npx tsx
/**
 * Seed Parte 1 — Origen, Cocina de Terroir
 * Inserta: restaurante · equipo (auth + equipo_miembros + user_restaurantes) · proveedores
 * Nota: tabla `puestos` no existe en el schema actual — los puestos viven en
 *       equipo_miembros.plaza_asignada (calientes / frios / pasteleria / pase / …)
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── UUIDs fijos ───────────────────────────────────────────────────────────────
const R  = 'c0000000-0000-0000-0000-000000000001'  // restaurante Origen

const TEAM = [
  { id:'c0000001-0000-0000-0000-000000000001', email:'marcos@origen-resto.com',  nombre:'Marcos',  apellido:'Villalba', rol:'admin',      plaza:null,          urRol:'owner' },
  { id:'c0000001-0000-0000-0000-000000000002', email:'laura@origen-resto.com',   nombre:'Laura',   apellido:'Suárez',   rol:'chef',       plaza:'calientes',   urRol:'chef'  },
  { id:'c0000001-0000-0000-0000-000000000003', email:'rodrigo@origen-resto.com', nombre:'Rodrigo', apellido:'Castro',   rol:'calientes',  plaza:'calientes',   urRol:'staff' },
  { id:'c0000001-0000-0000-0000-000000000004', email:'camila@origen-resto.com',  nombre:'Camila',  apellido:'Fontana',  rol:'frios',      plaza:'frios',       urRol:'staff' },
  { id:'c0000001-0000-0000-0000-000000000005', email:'sofia@origen-resto.com',   nombre:'Sofía',   apellido:'Rizzo',    rol:'pasteleria', plaza:'pasteleria',  urRol:'staff' },
  { id:'c0000001-0000-0000-0000-000000000006', email:'julian@origen-resto.com',  nombre:'Julián',  apellido:'Núñez',    rol:'ayudante',   plaza:'calientes',   urRol:'staff' },
  { id:'c0000001-0000-0000-0000-000000000007', email:'paula@origen-resto.com',   nombre:'Paula',   apellido:'Ibáñez',   rol:'pase',       plaza:'pase',        urRol:'staff' },
  { id:'c0000001-0000-0000-0000-000000000008', email:'tomas@origen-resto.com',   nombre:'Tomás',   apellido:'Heredia',  rol:'ayudante',   plaza:'pase',        urRol:'staff' },
]

const PROVEEDORES = [
  { id:'c0000002-0000-0000-0000-000000000001', nombre:'La Huerta Orgánica',    rubro:'Verduras y Frutas',   telefono:'3512100001', dias_entrega:['Martes','Jueves','Sábado']       },
  { id:'c0000002-0000-0000-0000-000000000002', nombre:'Frigorífico El Paso',   rubro:'Carnes',              telefono:'3512100002', dias_entrega:['Lunes','Miércoles','Viernes']    },
  { id:'c0000002-0000-0000-0000-000000000003', nombre:'Distribuidora Del Mar', rubro:'Pescados y Mariscos', telefono:'3512100003', dias_entrega:['Lunes','Jueves']                },
  { id:'c0000002-0000-0000-0000-000000000004', nombre:'Casa Láctea',           rubro:'Lácteos y Huevos',    telefono:'3512100004', dias_entrega:['Lunes','Miércoles','Viernes']    },
]

// ── Helper: crear auth user o devolver UUID si ya existe ───────────────────────
async function getOrCreateAuthUser(email: string): Promise<string | null> {
  const { data, error } = await sb.auth.admin.createUser({ email, password: 'origen2025!', email_confirm: true })
  if (data?.user) return data.user.id
  const alreadyExists = error?.message.includes('already been registered') || error?.message.includes('already exists')
  if (alreadyExists) {
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 })
    return list?.users.find(u => u.email === email)?.id ?? null
  }
  console.warn(`  ⚠  auth ${email}: ${error?.message}`)
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌿 Seed Parte 1 — Origen, Cocina de Terroir\n')

  // 1. Restaurante
  console.log('🏠 Restaurante...')
  const { error: rErr } = await sb.from('restaurantes').upsert(
    { id: R, nombre: 'Origen - Cocina de Terroir', ciudad: 'Córdoba', configuracion: { cubiertos: 35, plan: 'grupo' } },
    { onConflict: 'id' }
  )
  if (rErr) { console.error('  ✗', rErr.message); return }
  console.log('  ✅ Restaurante listo')

  // 2. Equipo: auth user → equipo_miembro → user_restaurantes
  console.log('\n👥 Equipo...')
  for (const u of TEAM) {
    const authId = await getOrCreateAuthUser(u.email)
    if (!authId) continue

    const { error: mErr } = await sb.from('equipo_miembros').upsert(
      { id: u.id, auth_user_id: authId, nombre: u.nombre, apellido: u.apellido,
        rol: u.rol, plaza_asignada: u.plaza, email: u.email,
        activo: true, fecha_ingreso: '2024-01-01', restaurante_id: R },
      { onConflict: 'id' }
    )
    if (mErr) console.warn(`  ⚠  equipo ${u.nombre}: ${mErr.message}`)

    // user_restaurantes no tiene unique en (user_id, restaurante_id) — delete+insert
    await sb.from('user_restaurantes').delete().eq('user_id', authId).eq('restaurante_id', R)
    const { error: urErr } = await sb.from('user_restaurantes').insert({ user_id: authId, restaurante_id: R, rol: u.urRol })
    if (urErr) console.warn(`  ⚠  user_restaurantes ${u.nombre}: ${urErr.message}`)

    console.log(`  ✅ ${u.nombre} ${u.apellido} (${u.rol})`)
  }

  // 3. Proveedores
  console.log('\n📦 Proveedores...')
  const { error: pErr } = await sb.from('proveedores').upsert(
    PROVEEDORES.map(p => ({ ...p, activo: true, restaurante_id: R })),
    { onConflict: 'id' }
  )
  if (pErr) console.error('  ✗', pErr.message)
  else console.log(`  ✅ ${PROVEEDORES.length} proveedores`)

  console.log('\n✅ Parte 1 completa — restaurante_id:', R, '\n')
}

main().catch(console.error)

// ─────────────────────────────────────────────────────────────────────────────
// Cómo correr (desde la raíz del proyecto):
//
//   node --env-file=.env.local scripts/seed-parte1.ts
//
// Si da error de extensión .ts, usar tsx (ya disponible vía npx):
//
//   npx tsx --env-file=.env.local scripts/seed-parte1.ts
// ─────────────────────────────────────────────────────────────────────────────
