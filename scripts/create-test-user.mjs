/**
 * Crea un usuario de prueba para KitchenOS
 * Ejecutar: node scripts/create-test-user.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const EMAIL = 'admin@elrescoldo.com'
const PASSWORD = 'kitchenos2026'
const RESTAURANTE_ID = '00000000-0000-0000-0000-000000000001'

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

async function main() {
  console.log('🔧 Creando usuario de prueba...\n')

  // 1. Create auth user via Admin API
  console.log('  ⏳ Creando auth user...')
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true, // skip email confirmation
    }),
  })
  const userData = await createRes.json()

  if (userData.error || (!userData.id && !userData.identities)) {
    // Maybe user already exists, try to find them
    console.log('  ⚠️  User might exist, trying to find...')
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers,
    })
    const listData = await listRes.json()
    const existing = listData.users?.find(u => u.email === EMAIL)
    if (existing) {
      console.log(`  ✅ User found: ${existing.id}`)
      await linkUser(existing.id)
      return
    }
    console.error('  ❌ Error:', JSON.stringify(userData))
    return
  }

  const userId = userData.id
  console.log(`  ✅ Auth user creado: ${userId}`)

  await linkUser(userId)
}

async function linkUser(userId) {
  // 2. Insert into user_restaurantes
  console.log('  ⏳ Vinculando a restaurante...')
  const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/user_restaurantes`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      restaurante_id: RESTAURANTE_ID,
      rol: 'admin',
    }),
  })
  if (linkRes.ok || linkRes.status === 201 || linkRes.status === 409) {
    console.log('  ✅ Vinculado a restaurante')
  } else {
    const err = await linkRes.text()
    if (err.includes('duplicate') || err.includes('unique')) {
      console.log('  ✅ Ya vinculado (existía)')
    } else {
      console.log('  ⚠️  Link response:', linkRes.status, err)
    }
  }

  // 3. Update equipo_miembros for Facundo to link auth_user_id
  console.log('  ⏳ Vinculando a miembro del equipo...')
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/equipo_miembros?nombre=eq.Facundo&restaurante_id=eq.${RESTAURANTE_ID}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ auth_user_id: userId }),
    }
  )
  if (updateRes.ok || updateRes.status === 204) {
    console.log('  ✅ Miembro vinculado')
  } else {
    console.log('  ⚠️  Update response:', updateRes.status, await updateRes.text())
  }

  console.log('\n🎉 ¡Listo! Credenciales de prueba:')
  console.log(`   📧 Email:    ${EMAIL}`)
  console.log(`   🔑 Password: ${PASSWORD}`)
  console.log('')
}

main()
