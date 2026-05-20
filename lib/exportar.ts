'use client'

import * as XLSX from 'xlsx'

export interface HojaExcel {
  nombre: string
  filas: Record<string, unknown>[]
}

export function exportarExcel(archivo: string, hojas: HojaExcel[]): void {
  const wb = XLSX.utils.book_new()
  for (const hoja of hojas) {
    const ws = XLSX.utils.json_to_sheet(hoja.filas.length > 0 ? hoja.filas : [{}])
    // Auto-width: ~12 chars per column as fallback
    const cols = Object.keys(hoja.filas[0] ?? {}).map(k => ({ wch: Math.max(k.length, 12) }))
    ws['!cols'] = cols
    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31))
  }
  XLSX.writeFile(wb, archivo)
}

export function fechaArchivo(): string {
  return new Date().toISOString().slice(0, 10)
}
