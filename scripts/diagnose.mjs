const SUPABASE_URL = 'https://clipcxcbtlibswfzsgzk.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN;

async function diagnose() {
  const email = 'diagtest_' + Date.now() + '@test.com';
  const pass = 'TestDiag123!';

  console.log('=== 1. SIGN UP ===');
  const signUpRes = await fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: pass })
  });
  const signUp = await signUpRes.json();
  console.log('Status:', signUpRes.status);
  console.log('Has session:', !!signUp.access_token);
  console.log('User ID:', signUp.user?.id);
  if (!signUp.access_token) { console.log('FATAL: No session returned.', signUp); return; }

  const token = signUp.access_token;
  const userId = signUp.user.id;
  const h = { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + token };

  console.log('\n=== 2. DB STATE BEFORE APP SIGNUP ===');
  const urRes = await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes?user_id=eq.' + userId + '&select=*', { headers: h });
  const urData = await urRes.json();
  console.log('user_restaurantes:', JSON.stringify(urData));

  const perfRes = await fetch(SUPABASE_URL + '/rest/v1/perfiles?id=eq.' + userId + '&select=*', { headers: h });
  const perfData = await perfRes.json();
  console.log('perfiles:', JSON.stringify(perfData));

  console.log('\n=== 3. SIMULATE APP SIGNUP (5 steps) ===');
  const restId = crypto.randomUUID();

  const r2 = await fetch(SUPABASE_URL + '/rest/v1/restaurantes', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: restId, nombre: 'DiagRestaurant' })
  });
  console.log('Step 2 (restaurant):', r2.status, r2.status === 201 ? 'OK' : await r2.text());

  const r3 = await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, restaurante_id: restId, rol: 'admin' })
  });
  console.log('Step 3 (user_rest):', r3.status, r3.status === 201 ? 'OK' : await r3.text());

  const r4 = await fetch(SUPABASE_URL + '/rest/v1/perfiles', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: userId, nombre: 'Diag User', restaurante_id: restId, rol: 'admin' })
  });
  console.log('Step 4 (profile):', r4.status, r4.status === 201 ? 'OK' : await r4.text());

  const r5 = await fetch(SUPABASE_URL + '/rest/v1/equipo_miembros', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, restaurante_id: restId, nombre: 'Diag User', rol: 'admin', activo: true })
  });
  console.log('Step 5 (equipo):', r5.status, r5.status === 201 ? 'OK' : await r5.text());

  console.log('\n=== 4. MI_RESTAURANTE_ID() ===');
  const rpcRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/mi_restaurante_id', { method: 'POST', headers: h });
  const rpcData = await rpcRes.json();
  console.log('Returns:', rpcData);
  console.log('Expected:', restId);
  console.log('Match:', rpcData === restId);

  console.log('\n=== 5. DATA ACCESS ===');
  const tables = ['restaurantes', 'perfiles', 'user_restaurantes', 'equipo_miembros', 'productos', 'recetas'];
  for (const t of tables) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + t + '?select=*&limit=3', { headers: h });
    const d = await r.json();
    console.log(t + ':', d.length, 'rows');
  }

  console.log('\n=== 6. EL RESCOLDO ADMIN ===');
  const loginRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: 'admin@elrescoldo.com', password: 'kitchenos2026' })
  });
  const login = await loginRes.json();
  console.log('Login status:', loginRes.status, 'Has token:', !!login.access_token);

  if (login.access_token) {
    const ah = { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + login.access_token };
    const adminUid = login.user.id;

    const aurRes = await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes?user_id=eq.' + adminUid + '&select=*', { headers: ah });
    const aurData = await aurRes.json();
    console.log('Admin user_restaurantes:', JSON.stringify(aurData));

    const apRes = await fetch(SUPABASE_URL + '/rest/v1/perfiles?id=eq.' + adminUid + '&select=id,nombre,restaurante_id,rol', { headers: ah });
    const apData = await apRes.json();
    console.log('Admin profile:', JSON.stringify(apData));

    const arpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mi_restaurante_id', { method: 'POST', headers: ah });
    const arpcData = await arpc.json();
    console.log('Admin mi_restaurante_id():', arpcData);

    const aprod = await fetch(SUPABASE_URL + '/rest/v1/productos?select=id&limit=5', { headers: ah });
    const aprodData = await aprod.json();
    console.log('Admin productos:', aprodData.length, 'visible');
  }

  console.log('\n=== 7. ALL user_restaurantes (mgmt API) ===');
  const mgmtRes = await fetch('https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + MGMT_TOKEN },
    body: JSON.stringify({ query: "SELECT ur.user_id, ur.restaurante_id, ur.rol, r.nombre as rest_nombre, p.nombre as perfil_nombre FROM user_restaurantes ur LEFT JOIN restaurantes r ON r.id = ur.restaurante_id LEFT JOIN perfiles p ON p.id = ur.user_id ORDER BY ur.created_at DESC LIMIT 15;" })
  });
  const mgmtData = await mgmtRes.json();
  console.log(JSON.stringify(mgmtData, null, 2));

  // Check auth.users count
  const authRes = await fetch('https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + MGMT_TOKEN },
    body: JSON.stringify({ query: "SELECT au.id, au.email, au.created_at, ur.restaurante_id FROM auth.users au LEFT JOIN public.user_restaurantes ur ON ur.user_id = au.id ORDER BY au.created_at DESC LIMIT 10;" })
  });
  const authData = await authRes.json();
  console.log('\n=== 8. auth.users vs user_restaurantes ===');
  authData.forEach(u => {
    console.log(u.email, '|', u.restaurante_id ? 'linked' : 'NO LINK', '|', u.created_at);
  });

  // Cleanup
  console.log('\n=== CLEANUP ===');
  await fetch(SUPABASE_URL + '/rest/v1/equipo_miembros?user_id=eq.' + userId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/perfiles?id=eq.' + userId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes?user_id=eq.' + userId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/restaurantes?id=eq.' + restId, { method: 'DELETE', headers: h });
  console.log('Cleanup done');
}
diagnose().catch(e => console.error('FATAL:', e));
