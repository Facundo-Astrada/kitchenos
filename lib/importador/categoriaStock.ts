// ¿Lo que trae la columna "categoría" de una planilla de stock es una sección
// del depósito (Verduras, Lácteos, Limpieza) o es otra cosa mal mapeada?
//
// Bros terminó con 185 categorías de las que 170 no las usaba ningún producto:
// "Ajo (kg)", "Acido citrico (kg)", "4 Reinas", "550", "Adicom" — nombres de
// producto, marcas, proveedores. El importador creaba cualquier valor que
// llegara en esa columna. Ahora se filtra fila por fila y, si la columna
// entera no parece de secciones, se ignora.

import { normalizarBusqueda } from '@/lib/texto'

// Sin la unidad entre paréntesis del final: "Ajo (kg)" → "ajo".
function base(s: string): string {
  return normalizarBusqueda(s.replace(/\s*\([^)]*\)\s*$/, ''))
}

/** Un valor suelto puede ser sección: no es el producto, no trae unidad, no es un número. */
export function esCategoriaValida(categoria: string, nombreProducto: string): boolean {
  const c = categoria.trim()
  if (!c || c === 'Sin categoría') return false
  if (/^[\d\s.,]+$/.test(c)) return false // "550"
  if (/\((kg|g|gr|l|lt|lts|litros?|ml|cc|u|un|unid|unidad(es)?|kilos?|gramos?)\)\s*$/i.test(c)) return false // "Ajo (kg)"
  if (base(c) === base(nombreProducto)) return false // la columna repite el nombre
  return true
}

/**
 * Una columna de secciones repite pocos valores en muchas filas. Si casi cada
 * fila trae uno distinto, se mapeó otra cosa (nombre, marca, proveedor).
 */
export function columnaCategoriaConfiable(valores: string[]): boolean {
  const llenos = valores.map(v => v.trim()).filter(Boolean)
  const distintos = new Set(llenos.map(base))
  if (distintos.size <= 25) return true
  return distintos.size <= llenos.length * 0.3
}
