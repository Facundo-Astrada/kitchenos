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

export async function callRecetaImport(
  mode: 'image' | 'text',
  payload: { text?: string; image_base64?: string; media_type?: string },
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
