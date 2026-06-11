import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

export const maxDuration = 60

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
    .join(' ')
}

const CATEGORIAS_VALIDAS = [
  'Carnes', 'Pescados', 'Verduras', 'Frutas', 'Lácteos', 'Panadería',
  'Secos', 'Especias', 'Bebidas', 'Aceites', 'Vinagres', 'Conservas',
  'Congelados', 'Limpieza', 'Descartables', 'Otros',
] as const
type Categoria = typeof CATEGORIAS_VALIDAS[number]

const CATEGORIA_KEYWORDS: Record<Categoria, string[]> = {
  Carnes: ['bife', 'lomo', 'pollo', 'cerdo', 'cordero', 'ternera', 'carne', 'jamón', 'jamon', 'panceta', 'morcilla', 'chorizo', 'matambre', 'milanesa', 'bondiola', 'pechuga', 'pata muslo', 'picaña', 'picana', 'mollejas', 'grasa'],
  Pescados: ['salmón', 'salmon', 'atún', 'atun', 'merluza', 'trucha', 'langostino', 'camarón', 'camaron', 'pacu', 'pejerrey', 'anchoa', 'sardina', 'calamar', 'pulpo'],
  Verduras: ['cebolla', 'tomate', 'zanahoria', 'papa', 'lechuga', 'rúcula', 'rucula', 'espinaca', 'kale', 'apio', 'ajo', 'perejil', 'cilantro', 'albahaca', 'romero', 'tomillo', 'puerro', 'verdeo', 'remolacha', 'pepino', 'jalapeño', 'jalapeno', 'pimiento', 'pimenton', 'pimentón', 'choclo', 'chaucha', 'arveja', 'brócoli', 'brocoli', 'coliflor', 'repollo', 'batata', 'calabacin', 'berenjena', 'champiñón', 'champinon', 'portobello', 'girgolas', 'menta', 'hinojo'],
  Frutas: ['manzana', 'pera', 'naranja', 'limón', 'limon', 'lima', 'banana', 'frutilla', 'arándano', 'arandano', 'durazno', 'mandarina', 'pomelo', 'uva', 'mango', 'ciruela', 'cereza', 'membrillo', 'piña', 'palta'],
  Lácteos: ['leche', 'crema', 'queso', 'manteca', 'mantequilla', 'yogur', 'ricota', 'mozzarella', 'parmesano'],
  Panadería: ['harina', 'pan', 'levadura', 'masa', 'galleta', 'tostada', 'pan rallado', 'panko'],
  Secos: ['arroz', 'quinoa', 'fideo', 'pasta', 'lenteja', 'poroto', 'garbanzo', 'cuscús', 'cuscus', 'avena', 'cereal', 'azúcar', 'azucar', 'sal', 'gelatina', 'glucosa', 'almidón', 'almidon', 'fécula', 'fecula', 'semola', 'sémola', 'polenta', 'trigo', 'lino', 'chía', 'chia', 'cacao'],
  Especias: ['pimienta', 'comino', 'orégano', 'oregano', 'curry', 'azafrán', 'azafran', 'paprika', 'pimentón', 'pimenton', 'cayena', 'curcuma', 'cúrcuma', 'jengibre', 'canela', 'laurel', 'clavo', 'nuez moscada', 'cardamomo', 'mostaza', 'ají', 'aji'],
  Bebidas: ['vino', 'cerveza', 'agua', 'gaseosa', 'jugo', 'café', 'cafe', 'té', 'fernet', 'gin', 'whisky', 'vodka', 'campari', 'aperol'],
  Aceites: ['aceite', 'oliva', 'sesamo', 'sésamo'],
  Vinagres: ['vinagre', 'aceto', 'balsámico', 'balsamico'],
  Conservas: ['aceitunas', 'alcaparras', 'lata', 'tomate triturado', 'pickle', 'salsa de soja', 'salsa inglesa'],
  Congelados: ['congelado', 'frozen', 'helado'],
  Limpieza: ['detergente', 'lavandina', 'jabón', 'jabon', 'desengrasante', 'cif', 'cera', 'esponja', 'paño', 'pano'],
  Descartables: ['servilleta', 'bolsa', 'cinta', 'papel aluminio', 'papel manteca', 'guantes', 'cofia', 'film'],
  Otros: [],
}

function categorizarRule(nombre: string): Categoria {
  const norm = normalize(nombre)
  for (const cat of CATEGORIAS_VALIDAS) {
    const kws = CATEGORIA_KEYWORDS[cat]
    if (kws.some(kw => norm.includes(normalize(kw)))) return cat
  }
  return 'Otros'
}

async function categorizarBatchIA(nombres: string[], useIA: boolean): Promise<Map<string, Categoria>> {
  const result = new Map<string, Categoria>()
  // Fallback rule-based para todos primero
  for (const n of nombres) result.set(n, categorizarRule(n))

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!useIA || !apiKey || nombres.length === 0) return result

  // Solo enviamos a IA los que cayeron en 'Otros'
  const ambiguos = nombres.filter(n => result.get(n) === 'Otros')
  if (ambiguos.length === 0) return result

  try {
    const chunks: string[][] = []
    for (let i = 0; i < ambiguos.length; i += 50) chunks.push(ambiguos.slice(i, i + 50))

    // Paralelizar todos los batches con Promise.all
    const responses = await Promise.all(chunks.map(chunk => {
      const prompt = `Categorizá cada producto en UNA de estas categorías:
${CATEGORIAS_VALIDAS.join(', ')}

Productos:
${chunk.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Responde SOLO un JSON array con la categoría de cada producto en el mismo orden, sin texto adicional.
Ejemplo: ["Carnes", "Verduras", ...]`

      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    }))

    responses.forEach((data, idx) => {
      if (!data) return
      const text = data.content?.[0]?.text ?? ''
      const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
      try {
        const arr = JSON.parse(clean) as string[]
        chunks[idx].forEach((nombre, i) => {
          const cat = arr[i]
          if (cat && (CATEGORIAS_VALIDAS as readonly string[]).includes(cat)) {
            result.set(nombre, cat as Categoria)
          }
        })
      } catch {
        // mantiene fallback rule-based
      }
    })
  } catch (e) {
    console.error('[productos-desde-facturas] IA categorización error:', e)
  }

  return result
}

type FacturaItemRow = {
  producto_nombre: string
  cantidad: number
  unidad: string
  precio_unitario: number
  factura_id: string
}

type FacturaRow = {
  id: string
  proveedor_nombre: string
  fecha_factura: string | null
  fecha_carga: string
}

type ProductoCandidato = {
  nombre: string
  nombre_norm: string
  precio_unitario: number
  unidad: string
  categoria: Categoria
  proveedor_nombre: string | null
  proveedor_id: string | null
  ocurrencias: number
  fecha_ultima: string
}

export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const restaurante_id = tenant.restauranteId

    const { mode } = await req.json() as {
      restaurante_id?: string
      mode: 'preview' | 'apply'
    }

    const admin = createAdminClient()

    // 1. Facturas del restaurante
    const { data: facturas } = await admin
      .from('facturas')
      .select('id, proveedor_nombre, fecha_factura, fecha_carga')
      .eq('restaurante_id', restaurante_id)

    const facturaMap = new Map<string, FacturaRow>(
      (facturas ?? []).map(f => [f.id, f as FacturaRow])
    )
    const facturaIds = Array.from(facturaMap.keys())

    if (facturaIds.length === 0) {
      return NextResponse.json({
        productos: [],
        proveedores: [],
        message: 'No hay facturas cargadas. Cargá facturas primero.',
      })
    }

    // 2. Items de esas facturas
    const { data: items } = await admin
      .from('factura_items')
      .select('producto_nombre, cantidad, unidad, precio_unitario, factura_id')
      .in('factura_id', facturaIds)

    const rows = (items ?? []) as FacturaItemRow[]

    // 3. Agrupar por nombre normalizado
    const grupos = new Map<string, {
      nombre_original: string
      precios: Array<{ precio: number; fecha: string; proveedor: string }>
      unidades: Map<string, number>
    }>()

    for (const row of rows) {
      if (!row.producto_nombre || row.precio_unitario <= 0) continue
      const key = normalize(row.producto_nombre)
      if (!key) continue

      const f = facturaMap.get(row.factura_id)
      const fecha = f?.fecha_factura ?? f?.fecha_carga ?? '1970-01-01'
      const proveedor = f?.proveedor_nombre ?? ''

      if (!grupos.has(key)) {
        grupos.set(key, {
          nombre_original: row.producto_nombre.trim(),
          precios: [],
          unidades: new Map(),
        })
      }
      const g = grupos.get(key)!
      g.precios.push({ precio: row.precio_unitario, fecha, proveedor })
      g.unidades.set(row.unidad, (g.unidades.get(row.unidad) ?? 0) + 1)
    }

    // 4. Determinar precio reciente + unidad moda + proveedor más reciente
    const candidatos: ProductoCandidato[] = []
    const proveedoresUnicos = new Set<string>()

    for (const [, g] of grupos) {
      g.precios.sort((a, b) => b.fecha.localeCompare(a.fecha))
      const masReciente = g.precios[0]
      // Unidad moda
      let unidadModa = 'kg'
      let maxCount = 0
      for (const [u, c] of g.unidades) {
        if (c > maxCount) { unidadModa = u; maxCount = c }
      }
      candidatos.push({
        nombre: titleCase(g.nombre_original),
        nombre_norm: normalize(g.nombre_original),
        precio_unitario: masReciente.precio,
        unidad: unidadModa,
        categoria: 'Otros',
        proveedor_nombre: masReciente.proveedor || null,
        proveedor_id: null,
        ocurrencias: g.precios.length,
        fecha_ultima: masReciente.fecha,
      })
      if (masReciente.proveedor) proveedoresUnicos.add(masReciente.proveedor)
    }

    // 5. Categorizar (regla siempre; IA solo en apply para no demorar preview)
    const categoriasMap = await categorizarBatchIA(candidatos.map(c => c.nombre), mode === 'apply')
    for (const c of candidatos) {
      c.categoria = categoriasMap.get(c.nombre) ?? 'Otros'
    }

    // 6. Resolver proveedor_id (lookup en proveedores existentes)
    const { data: proveedoresExistentes } = await admin
      .from('proveedores')
      .select('id, nombre')
      .eq('restaurante_id', restaurante_id)

    const provMap = new Map(
      (proveedoresExistentes ?? []).map(p => [normalize(p.nombre), p.id as string])
    )

    const proveedoresACrear: Array<{ nombre: string }> = []
    for (const provName of proveedoresUnicos) {
      const norm = normalize(provName)
      if (!provMap.has(norm)) {
        proveedoresACrear.push({ nombre: provName.trim() })
      }
    }

    if (mode === 'preview') {
      return NextResponse.json({
        productos: candidatos.map(c => ({
          nombre: c.nombre,
          precio_unitario: c.precio_unitario,
          unidad: c.unidad,
          categoria: c.categoria,
          proveedor_nombre: c.proveedor_nombre,
          ocurrencias: c.ocurrencias,
        })),
        proveedores_a_crear: proveedoresACrear,
        total_productos: candidatos.length,
        total_proveedores_nuevos: proveedoresACrear.length,
      })
    }

    // 7. Apply: crear proveedores faltantes
    if (proveedoresACrear.length > 0) {
      const { data: nuevosProv } = await admin
        .from('proveedores')
        .insert(proveedoresACrear.map(p => ({
          nombre: p.nombre,
          rubro: 'Insumos',
          telefono: '',
          dias_entrega: [],
          restaurante_id,
          activo: true,
        })))
        .select('id, nombre')

      for (const np of nuevosProv ?? []) {
        provMap.set(normalize(np.nombre), np.id)
      }
    }

    // Asignar proveedor_id a cada candidato
    for (const c of candidatos) {
      if (c.proveedor_nombre) {
        c.proveedor_id = provMap.get(normalize(c.proveedor_nombre)) ?? null
      }
    }

    // 8. Upsert productos en batch
    //    Step 1: traer TODOS los existentes en una sola query
    const { data: existentesRaw } = await admin
      .from('productos')
      .select('id, nombre')
      .eq('restaurante_id', restaurante_id)

    const existentesMap = new Map<string, string>()
    for (const p of existentesRaw ?? []) {
      existentesMap.set(normalize(p.nombre), p.id as string)
    }

    //    Step 2: dividir en updates vs inserts
    const toInsert: Array<Record<string, unknown>> = []
    const toUpdate: Array<{ id: string; payload: Record<string, unknown> }> = []

    for (const c of candidatos) {
      const payload = {
        nombre: c.nombre,
        unidad: c.unidad,
        stock_actual: 0,
        stock_minimo: 0,
        stock_critico: 0,
        categoria: c.categoria,
        proveedor_id: c.proveedor_id,
        precio_unitario: c.precio_unitario,
        restaurante_id,
        activo: true,
      }
      const existingId = existentesMap.get(c.nombre_norm)
      if (existingId) {
        toUpdate.push({ id: existingId, payload })
      } else {
        toInsert.push(payload)
      }
    }

    //    Step 3: batch insert
    const BATCH = 100
    let insertados = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await admin.from('productos').insert(toInsert.slice(i, i + BATCH))
      if (!error) insertados += Math.min(BATCH, toInsert.length - i)
    }

    //    Step 4: updates en paralelo (chunks de 20 a la vez)
    let actualizados = 0
    for (let i = 0; i < toUpdate.length; i += 20) {
      const chunk = toUpdate.slice(i, i + 20)
      const results = await Promise.all(
        chunk.map(({ id, payload }) =>
          admin.from('productos').update(payload).eq('id', id).then(r => !r.error)
        )
      )
      actualizados += results.filter(Boolean).length
    }

    return NextResponse.json({
      insertados,
      actualizados,
      proveedores_creados: proveedoresACrear.length,
      total: candidatos.length,
    })
  } catch (e) {
    console.error('[productos-desde-facturas] error:', e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Error interno',
    }, { status: 500 })
  }
}
