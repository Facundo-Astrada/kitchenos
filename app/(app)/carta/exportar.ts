'use client'

import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { fmtMoney } from './cards'

// ── PDF Export ──────────────────────────────────────────
export async function exportCartaPDF(items: CartaItemEnriquecido[]) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  // Header
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.text('Carta', 14, 22)

  doc.setTextColor(0, 0, 0)

  const disponibles = items.filter(i => i.disponible)
  const categorias = [...new Set(disponibles.map(i => i.categoria))]
  let y = 40

  for (const cat of categorias) {
    const catItems = disponibles.filter(i => i.categoria === cat)
    if (catItems.length === 0) continue

    // Check if we need a new page
    if (y > 250) { doc.addPage(); y = 20 }

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(cat, 14, y)
    y += 2
    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 8

    for (const item of catItems) {
      if (y > 270) { doc.addPage(); y = 20 }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(item.nombre, 14, y)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      const precio = fmtMoney(item.precio_venta)
      doc.text(precio, 196, y, { align: 'right' })

      if (item.descripcion) {
        y += 5
        doc.setFontSize(9)
        doc.setTextColor(130, 130, 130)
        const lines = doc.splitTextToSize(item.descripcion, 150)
        doc.text(lines, 14, y)
        y += lines.length * 4
      }

      y += 8
    }

    y += 4
  }

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text('Generado por KitchenOS', 14, 285)

  doc.save('carta.pdf')
}

// ── Rentabilidad PDF ────────────────────────────────────
export async function exportRentabilidadPDF(items: CartaItemEnriquecido[], verCostos = false) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()

  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('Rentabilidad de Carta', 14, 22)
  doc.setTextColor(0, 0, 0)

  const conReceta = items
    .filter(i => i.food_cost_pct != null)
    .sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))

  autoTable(doc, {
    startY: 38,
    head: [verCostos ? ['Plato', 'Precio', 'Costo', 'FC%', 'Margen'] : ['Plato']],
    body: conReceta.map(it => verCostos
      ? [it.nombre, fmtMoney(it.precio_venta), fmtMoney(it.costo_porcion ?? 0), `${(it.food_cost_pct ?? 0).toFixed(1)}%`, fmtMoney(it.margen_bruto ?? 0)]
      : [it.nombre]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text('Generado por KitchenOS', 14, 285)

  doc.save('rentabilidad-carta.pdf')
}
