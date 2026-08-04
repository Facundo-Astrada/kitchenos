// Helpers de importación de recetas con IA (foto/texto) — comparten el mismo
// endpoint que usa el importador completo de Recetario (`/api/recetas/import`),
// acá solo se expone lo necesario para una captura rápida de un solo resultado.

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
  tiempo_minutos?: number
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  procedimiento: string[]
  _demo?: boolean
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
