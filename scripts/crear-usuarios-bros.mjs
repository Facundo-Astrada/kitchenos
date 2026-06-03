// ============================================================
// Crea los usuarios de prueba de Bros Comedor en Supabase Auth
// + sus filas en user_restaurantes y equipo_miembros.
//
// Uso:
//   node scripts/crear-usuarios-bros.mjs          (dry-run)
//   node scripts/crear-usuarios-bros.mjs --apply  (crea usuarios)
//   node scripts/crear-usuarios-bros.mjs --borrar  (elimina todos)
//
// Los usuarios ya existentes se omiten (idempotente).
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
const RID          = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros comedor
const APPLY        = process.argv.includes('--apply')
const BORRAR       = process.argv.includes('--borrar')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Perfiles ──────────────────────────────────────────────────────────────
// Roles válidos: admin | chef | parrilla | frios | calientes | pase | pasteleria | panaderia | linea | ayudante
const USUARIOS = [
  {
    nombre: 'Maxi',
    apellido: 'Herrera',
    email: 'maxi@broscomedor.com',
    password: 'MaxiBros2026!',
    rol: 'chef',           // Jefe de cocina
    plaza: null,
  },
  {
    nombre: 'Facundo',
    apellido: 'Astrada',
    email: 'facu@broscomedor.com',
    password: 'FacuBros2026!',
    rol: 'chef',           // Jefe de cocina
    plaza: null,
  },
  {
    nombre: 'León',
    apellido: 'Peretti',
    email: 'leon@broscomedor.com',
    password: 'LeonBros2026!',
    rol: 'chef',           // Encargado de compras → acceso a facturas/proveedores/pedidos
    plaza: null,
  },
  {
    nombre: 'Zoe',
    apellido: 'Russell',
    email: 'zoe@broscomedor.com',
    password: 'ZoeBros2026!',
    rol: 'linea',          // Cocinera
    plaza: null,
  },
  {
    nombre: 'Alex',
    apellido: 'Chavarriaga',
    email: 'alex@broscomedor.com',
    password: 'AlexBros2026!',
    rol: 'linea',          // Cocinero
    plaza: null,
  },
  {
    nombre: 'Luna',
    apellido: 'Quinteros',
    email: 'luna@broscomedor.com',
    password: 'LunaBros2026!',
    rol: 'pasteleria',     // Pastelera
    plaza: 'pasteleria',
  },
]

// ── Borrar ────────────────────────────────────────────────────────────────
async function borrarUsuarios() {
  console.log('\n══ BORRAR usuarios de prueba Bros ══\n')
  for (const u of USUARIOS) {
    // 1. Buscar user_id por email
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const user = users?.find(x => x.email === u.email)
    if (!user) { console.log(`⚠  ${u.email} — no existe, skip`); continue }

    // 2. Desactivar equipo_miembro
    await supabase.from('equipo_miembros').update({ activo: false }).eq('email', u.email).eq('restaurante_id', RID)
    // 3. Borrar user_restaurantes
    await supabase.from('user_restaurantes').delete().eq('user_id', user.id).eq('restaurante_id', RID)
    // 4. Borrar usuario de Auth
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) { console.log(`✗  ${u.email} — ${error.message}`); continue }
    console.log(`✓  ${u.email} eliminado`)
  }
  console.log()
}

// ── Crear ─────────────────────────────────────────────────────────────────
async function crearUsuarios() {
  const resultados = []

  for (const u of USUARIOS) {
    // 1. Verificar si ya existe
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const existe = users?.find(x => x.email === u.email)
    if (existe) {
      resultados.push({ ...u, status: 'ya existe', userId: existe.id })
      continue
    }

    if (!APPLY) {
      resultados.push({ ...u, status: 'pendiente (dry-run)' })
      continue
    }

    // 2. Crear en Supabase Auth (sin enviar email)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,   // confirma sin enviar mail
      user_metadata: { nombre: u.nombre, apellido: u.apellido },
    })
    if (authErr) { resultados.push({ ...u, status: `✗ auth: ${authErr.message}` }); continue }
    const userId = authData.user.id

    // 3. Crear user_restaurantes
    const { error: urErr } = await supabase.from('user_restaurantes').upsert(
      { user_id: userId, restaurante_id: RID, rol: u.rol },
      { onConflict: 'user_id,restaurante_id' }
    )
    if (urErr) { resultados.push({ ...u, status: `✗ user_restaurantes: ${urErr.message}` }); continue }

    // 4. Crear o actualizar equipo_miembro
    const { data: existeMiembro } = await supabase.from('equipo_miembros')
      .select('id').eq('email', u.email).eq('restaurante_id', RID).single()

    if (existeMiembro) {
      await supabase.from('equipo_miembros').update({
        auth_user_id: userId,
        activo: true,
        rol: u.rol,
        nombre: u.nombre,
        apellido: u.apellido,
        ...(u.plaza ? { plaza_asignada: u.plaza } : {}),
      }).eq('id', existeMiembro.id)
    } else {
      await supabase.from('equipo_miembros').insert({
        auth_user_id: userId,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        rol: u.rol,
        activo: true,
        restaurante_id: RID,
        ...(u.plaza ? { plaza_asignada: u.plaza } : {}),
      })
    }

    resultados.push({ ...u, status: '✓ creado', userId })
  }

  // Imprimir tabla
  console.log('\n══════════════════════════════════════════════════════')
  console.log(`  USUARIOS BROS — ${APPLY ? 'APLICADO' : 'DRY-RUN'}`)
  console.log('══════════════════════════════════════════════════════')
  console.log()
  console.log('  Usuario          Email                     Rol          Contraseña          Status')
  console.log('  ─────────────────────────────────────────────────────────────────────────────────────')
  for (const r of resultados) {
    const nombre = `${r.nombre} ${r.apellido}`.trim().padEnd(16)
    const email  = r.email.padEnd(25)
    const rol    = r.rol.padEnd(12)
    const pass   = r.password.padEnd(20)
    console.log(`  ${nombre} ${email} ${rol} ${pass} ${r.status}`)
  }
  console.log()

  if (!APPLY) {
    console.log('→ Dry-run completado. Agregá --apply para crear los usuarios.\n')
  } else {
    console.log('→ Listo. Podés iniciar sesión en https://kos-app-one.vercel.app\n')
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
if (BORRAR) {
  await borrarUsuarios()
} else {
  await crearUsuarios()
}
