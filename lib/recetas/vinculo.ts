// Vínculo ingrediente ↔ producto de Stock — fuente única del criterio de
// "mismo nombre", sin 'use client' (lo usan los formularios de Recetario y
// /api/recetas/auto-link-ingredientes por igual).
//
// Regla (auditoría 08/10/2026): automáticamente se vincula solo lo exacto. Ignora
// mayúsculas, tildes, espacios de más y plural simple ("Limones" = "Limón",
// "Huevos" = "Huevo"). Lo parecido (contiene / palabras en común) nunca se
// aplica sin preguntar: en Bros eso había dejado "Agua" → "Agua oxigenada",
// "Manteca" → "Papel manteca rollo", "Rabanitos" → "Remolacha". Esas quedan
// como sugerencia en el drawer "Vincular stock" del Recetario.

import { canonUnit } from '@/lib/unidades'

export function normalizarNombre(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function singular(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('es')) return palabra.slice(0, -2)
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1)
  return palabra
}

// Clave de comparación exacta: normalizado + cada palabra en singular.
export function claveExacta(s: string): string {
  return normalizarNombre(s).split(' ').map(singular).join(' ')
}

export function buscarProductoExacto<P extends { nombre: string }>(nombre: string, productos: P[]): P | undefined {
  const clave = claveExacta(nombre)
  if (!clave) return undefined
  return productos.find(p => claveExacta(p.nombre) === clave)
}

// Vincula cada ingrediente a su producto de Stock ANTES de guardar la receta:
// el que ya trae (elegido de la lista), o el que coincide exacto por nombre.
// Si no existe, lo crea en Stock (sin precio, hasta que entre una factura) y
// lo vincula — antes se creaba pero quedaba suelto, y el ingrediente sin
// costo para siempre. El producto nuevo se lleva en la unidad de compra: una
// receta en g lo crea en kg (y ml → l); la cantidad de la receta no se toca.
export async function vincularIngredientesConStock<T extends { nombre: string; unidad: string; producto_id?: string | null; tipo?: string | null }>(
  ingredientes: T[],
  catalogo: { id: string; nombre: string }[],
  crearProducto: (datos: Record<string, unknown>) => Promise<unknown>,
): Promise<T[]> {
  const conocidos = [...catalogo]
  const out: T[] = []
  for (const ing of ingredientes) {
    if (ing.tipo === 'subreceta') { out.push(ing); continue }
    let productoId = ing.producto_id ?? buscarProductoExacto(ing.nombre, conocidos)?.id ?? null
    if (!productoId) {
      const u = canonUnit(ing.unidad)
      try {
        const id = await crearProducto({
          nombre: ing.nombre,
          categoria: 'Sin categoría',
          unidad: u === 'g' ? 'kg' : u === 'ml' ? 'l' : (u || 'u'),
          stock_actual: 0,
          stock_minimo: 0,
          stock_critico: 0,
          precio_unitario: 0,
          activo: true,
          proveedor_id: null,
        })
        if (typeof id === 'string') {
          productoId = id
          conocidos.push({ id, nombre: ing.nombre })
        }
      } catch { /* sin vínculo: se puede vincular después desde la ficha */ }
    }
    out.push({ ...ing, producto_id: productoId })
  }
  return out
}
