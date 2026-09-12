// Helpers de importación de recetas con IA (foto/texto) — comparten el mismo
// endpoint que usa el importador completo de Recetario (`/api/recetas/import`),
// acá solo se expone lo necesario para una captura rápida de un solo resultado.

/**
 * Cómo se le manda un archivo a la IA.
 *
 * - `imagen`     → bloque `image` (foto de una ficha, captura de pantalla)
 * - `planilla`   → se parsea con SheetJS y se manda el CSV resultante
 * - `documento`  → bloque `document` (PDF) o mammoth (.docx) del lado del servidor
 * - `texto`      → `file.text()`, que acá sí corresponde
 *
 * Existe como función aparte porque acá vivía el bug de sep 2026: los PDF no
 * tenían rama propia y caían en `texto`, o sea `await file.text()` sobre un
 * binario. La IA recibía la sintaxis interna del PDF en vez de la receta e
 * inventaba una. Es una decisión de una línea con consecuencias grandes, así
 * que va suelta y con test.
 */
export type ClaseArchivo = 'imagen' | 'planilla' | 'documento' | 'texto'

export function clasificarArchivo(file: { name: string; type: string }): ClaseArchivo {
  const nombre = file.name || ''
  const tipo = file.type || ''

  if (tipo.startsWith('image/')) return 'imagen'

  // `.numbers` queda afuera a propósito: SheetJS no lo lee.
  if (/\.(xlsx|xls|ods|csv|tsv)$/i.test(nombre)
    || tipo.includes('spreadsheet') || tipo.includes('excel')) return 'planilla'

  if (/\.(pdf|docx?)$/i.test(nombre)
    || tipo.includes('pdf') || tipo.includes('word')
    || tipo.includes('officedocument.wordprocessing')) return 'documento'

  return 'texto'
}

export async function fileToBase64(file: File): Promise<{ base64: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve({ base64, media_type: file.type || 'image/jpeg' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface RecetaIAResult {
  nombre_sugerido?: string
  categoria_sugerida?: string
  porciones?: number
  /** Rendimiento de la ficha original ("Yield: 900g"). Sin columna en `recetas`. */
  rinde?: number | null
  rinde_unidad?: string | null
  tiempo_minutos?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  procedimiento: string[]
}

export function normalizeNombre(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

/**
 * Auto-match simple de un nombre extraído por IA contra una lista ya
 * cargada (stock, recetas) — mismo criterio que
 * `/api/recetas/auto-link-ingredientes` pero client-side, para sugerir sin
 * pegarle a un endpoint que opera sobre TODAS las recetas del restaurante.
 * Compartido entre el import de un plato/menú nuevo (ComposicionEditor) y
 * el de ingredientes de una receta ya existente (RecetaEditSheet).
 */
export function matchPorNombre<T extends { nombre: string }>(nombre: string, candidatos: T[]): T | null {
  const norm = normalizeNombre(nombre)
  if (!norm) return null
  const exact = candidatos.find(c => normalizeNombre(c.nombre) === norm)
  if (exact) return exact
  const contains = candidatos.find(c => {
    const cn = normalizeNombre(c.nombre)
    return cn.includes(norm) || norm.includes(cn)
  })
  return contains ?? null
}

// Procedimiento se guarda como texto plano, una línea numerada por paso
// ("1. Cortar la cebolla") — mismo formato que ya escribía ComposicionEditor
// al confirmar un import IA. Acá queda compartido para que RecetaEditSheet
// pueda editar el procedimiento de una receta existente con el mismo
// round-trip (parsear al abrir, formatear al guardar) sin duplicar el regex.
export function parseProcedimiento(texto: string | null | undefined): string[] {
  if (!texto?.trim()) return []
  return texto.split('\n').map(l => l.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean)
}

export function formatProcedimiento(pasos: string[]): string {
  return pasos.filter(p => p.trim()).map((p, i) => `${i + 1}. ${p.trim()}`).join('\n')
}

export async function callRecetaImport(
  mode: 'image' | 'text',
  /**
   * `categorias`: las de ESTE restaurante. Sin esto el servidor cae en un
   * fallback genérico de 9 categorías fijas — la receta se guarda igual, pero
   * con una categoría que puede no coincidir con ninguna pestaña de filtro
   * real, así que solo aparece en "Todas".
   */
  payload: { text?: string; image_base64?: string; media_type?: string; categorias?: string[] },
): Promise<RecetaIAResult> {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import', mode, ...payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}
