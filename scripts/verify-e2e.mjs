const SUPABASE_URL = 'https://clipcxcbtlibswfzsgzk.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

async function run() {
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ TEST 1: NEW USER REGISTRATION ═══');
  const email = `e2e_${ts}@test.com`;
  const password = 'E2eTest123!';
  const restName = `E2E_Rest_${ts}`;

  const signUpRes = await fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  const signUp = await signUpRes.json();
  check('Auth signup returns session', !!signUp.access_token);
  if (!signUp.access_token) { console.log('FATAL:', signUp); return; }

  const token = signUp.access_token;
  const userId = signUp.user.id;
  const h = { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + token };

  // Simulate the 5-step signUp from context.tsx
  const restId = crypto.randomUUID();
  const r2 = await fetch(SUPABASE_URL + '/rest/v1/restaurantes', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: restId, nombre: restName })
  });
  check('Step 2: Create restaurant', r2.status === 201);

  const r3 = await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, restaurante_id: restId, rol: 'admin' })
  });
  check('Step 3: Link user_restaurantes', r3.status === 201);

  const r4 = await fetch(SUPABASE_URL + '/rest/v1/equipo_miembros', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ nombre: 'E2E', apellido: 'Tester', rol: 'admin', auth_user_id: userId, restaurante_id: restId, activo: true })
  });
  check('Step 4: Create equipo_miembros', r4.status === 201);

  const r5 = await fetch(SUPABASE_URL + '/rest/v1/rol_permisos', {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ restaurante_id: restId, rol: 'admin', modulos_visibles: ['inicio','stock','recetario'], puede_editar_stock: true, puede_editar_recetas: true, puede_editar_carta: true, puede_editar_equipo: true, puede_eliminar: true })
  });
  check('Step 5: Seed rol_permisos', r5.status === 201);

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ TEST 2: mi_restaurante_id() ═══');
  const rpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mi_restaurante_id', { method: 'POST', headers: h });
  const rpcVal = await rpc.json();
  check('mi_restaurante_id() matches', rpcVal === restId);

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ TEST 3: RLS ISOLATION (new user sees 0 items) ═══');
  for (const table of ['productos', 'recetas', 'facturas', 'tareas', 'proveedores', 'pase_mensajes']) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=id&limit=1', { headers: h });
    const d = await r.json();
    check(`${table}: 0 rows (isolated)`, d.length === 0);
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ TEST 4: INSERT + READ own data ═══');
  const prodRes = await fetch(SUPABASE_URL + '/rest/v1/productos', {
    method: 'POST', headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ nombre: 'Tomate E2E', unidad: 'kg', stock_actual: 10, stock_minimo: 2, stock_critico: 1, precio_unitario: 100, restaurante_id: restId })
  });
  const prod = await prodRes.json();
  check('Insert product', prodRes.status === 201 && prod[0]?.nombre === 'Tomate E2E');

  const recRes = await fetch(SUPABASE_URL + '/rest/v1/recetas', {
    method: 'POST', headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ nombre: 'Ensalada E2E', categoria: 'entrada', porciones: 2, restaurante_id: restId })
  });
  const rec = await recRes.json();
  check('Insert recipe', recRes.status === 201 && rec[0]?.nombre === 'Ensalada E2E');

  // Read back
  const myProd = await fetch(SUPABASE_URL + '/rest/v1/productos?select=nombre', { headers: h });
  check('Read own products (1)', (await myProd.json()).length === 1);

  const myRec = await fetch(SUPABASE_URL + '/rest/v1/recetas?select=nombre', { headers: h });
  check('Read own recipes (1)', (await myRec.json()).length === 1);

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ TEST 5: EL RESCOLDO ADMIN ═══');
  const loginRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: 'admin@elrescoldo.com', password: 'kitchenos2026' })
  });
  const login = await loginRes.json();
  check('El Rescoldo login', !!login.access_token);

  if (login.access_token) {
    const ah = { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + login.access_token };

    const adminRpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/mi_restaurante_id', { method: 'POST', headers: ah });
    const adminRestId = await adminRpc.json();
    check('Admin mi_restaurante_id()', adminRestId === '00000000-0000-0000-0000-000000000001');

    const adminProd = await fetch(SUPABASE_URL + '/rest/v1/productos?select=id', { headers: ah });
    const adminProdData = await adminProd.json();
    check('Admin sees products', adminProdData.length > 0);

    const adminRec = await fetch(SUPABASE_URL + '/rest/v1/recetas?select=id', { headers: ah });
    const adminRecData = await adminRec.json();
    check('Admin sees recipes', adminRecData.length > 0);

    // Admin should NOT see the E2E user's data
    const adminAllProd = await fetch(SUPABASE_URL + '/rest/v1/productos?nombre=eq.Tomate E2E&select=id', { headers: ah });
    check('Admin cannot see E2E product', (await adminAllProd.json()).length === 0);

    const adminPerms = await fetch(SUPABASE_URL + '/rest/v1/rol_permisos?select=id,rol&restaurante_id=eq.00000000-0000-0000-0000-000000000001', { headers: ah });
    const adminPermsData = await adminPerms.json();
    check('Admin has rol_permisos', adminPermsData.length > 0);

    const adminEquipo = await fetch(SUPABASE_URL + '/rest/v1/equipo_miembros?select=id,nombre&limit=3', { headers: ah });
    const adminEquipoData = await adminEquipo.json();
    check('Admin sees equipo_miembros', adminEquipoData.length > 0);
  }

  // ═══════════════════════════════════════════════════════
  console.log('\n═══ CLEANUP ═══');
  await fetch(SUPABASE_URL + '/rest/v1/productos?restaurante_id=eq.' + restId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/recetas?restaurante_id=eq.' + restId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/rol_permisos?restaurante_id=eq.' + restId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/equipo_miembros?auth_user_id=eq.' + userId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/user_restaurantes?user_id=eq.' + userId, { method: 'DELETE', headers: h });
  await fetch(SUPABASE_URL + '/rest/v1/restaurantes?id=eq.' + restId, { method: 'DELETE', headers: h });
  console.log('  Cleanup done');

  // ═══════════════════════════════════════════════════════
  console.log(`\n══════════════════════════════════════`);
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log(`══════════════════════════════════════\n`);

  if (fail > 0) process.exit(1);
}
run().catch(e => { console.error('FATAL:', e); process.exit(1); });
