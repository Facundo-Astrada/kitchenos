/**
 * Primitivos de texto para comparar nombres escritos por humanos.
 *
 * Existe porque el mismo `normalize('NFD')` estaba copiado en 6 lugares
 * (`slugify`, precios, iaImport, proximaEntrega, usePreciosProveedores,
 * dedupeTareas) y cada copia derivó un poco. Acá vive el que usan la búsqueda
 * del Coach y `slugify`; migrar los otros es tarea aparte (ver PENDIENTES).
 *
 * Sin dependencias a propósito: lo importan API routes, no arrastra el bundle
 * de `lib/utils.ts` (clsx + tailwind-merge) al servidor.
 */

/**
 * Saca diacríticos: "Mbejú" → "Mbeju", "Ñoquis" → "Noquis", "Puré" → "Pure".
 *
 * La ñ se colapsa a n a propósito: para BUSCAR es lo que se quiere (quien
 * escribe "noquis" en el chat espera encontrar "Ñoquis"). No usar esto para
 * mostrar texto ni para guardar.
 */
export function sinAcentos(s: string): string {
  return s.normalize('NFD').split('').filter(ch => {
    const code = ch.codePointAt(0)!
    return code < 0x300 || code > 0x36f
  }).join('')
}

/** Forma comparable de un nombre: sin acentos, minúsculas, espacios colapsados. */
export function normalizarBusqueda(s: string): string {
  return sinAcentos(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Raíz burda para tolerar singular/plural: "carnes" → "carne", "tomates" → "tomate".
 * No es un stemmer — solo corta la marca de plural del español, que es el 95%
 * de los desencuentros reales ("cuánta carne" contra la categoría "Carnes").
 */
export function raiz(token: string): string {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1)
  return token
}
