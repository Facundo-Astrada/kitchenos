interface PDFReceta {
  nombre: string
  categoria: string
  porciones: number
  tiempo_min: number
  precio_venta: number
  procedimiento: string
  ingredientes: { nombre: string; cantidad: number; unidad: string }[]
}

export async function exportRecetaPDF(receta: PDFReceta) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  const contentW = pageW - margin * 2
  let y = margin

  // Colors
  const navy: [number, number, number] = [15, 23, 42]
  const accent: [number, number, number] = [79, 70, 229]
  const gray: [number, number, number] = [100, 116, 139]
  const lightGray: [number, number, number] = [226, 232, 240]
  const textDark: [number, number, number] = [30, 41, 59]

  // ── Header bar ──
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageW, 28, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('KitchenOS', margin, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(200, 200, 220)
  doc.text('Ficha Técnica', margin, 17)

  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  doc.setFontSize(8)
  doc.setTextColor(180, 180, 200)
  doc.text(today, pageW - margin, 12, { align: 'right' })

  y = 38

  // ── Recipe name ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...textDark)
  const nameLines = doc.splitTextToSize(receta.nombre, contentW)
  doc.text(nameLines, margin, y)
  y += nameLines.length * 9 + 2

  // ── Meta line ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...gray)
  const metaParts = [receta.categoria]
  if (receta.porciones) metaParts.push(`${receta.porciones} porciones`)
  if (receta.tiempo_min) metaParts.push(`${receta.tiempo_min} minutos`)
  doc.text(metaParts.join('  ·  '), margin, y)
  y += 8

  // ── Separator ──
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)
  y += 10

  // ── INGREDIENTES section ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...accent)
  doc.text('INGREDIENTES', margin, y)
  y += 6

  const ings = receta.ingredientes ?? []
  if (ings.length > 0) {
    const tableBody = ings.map(i => {
      const qty = i.cantidad % 1 === 0 ? String(i.cantidad) : i.cantidad.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      return [i.nombre, qty, i.unidad]
    })

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Ingrediente', 'Cantidad', 'Unidad']],
      body: tableBody,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
        textColor: textDark,
        lineColor: lightGray,
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: gray,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      columnStyles: {
        0: { cellWidth: contentW * 0.55 },
        1: { cellWidth: contentW * 0.25, halign: 'right' as const, font: 'courier' },
        2: { cellWidth: contentW * 0.20 },
      },
      alternateRowStyles: { fillColor: [252, 252, 255] },
    })

    y = (doc as any).lastAutoTable.finalY + 12
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...gray)
    doc.text('Sin ingredientes cargados', margin, y + 4)
    y += 14
  }

  // ── Check page break ──
  const pageH = doc.internal.pageSize.getHeight()
  if (y > pageH - 50) {
    doc.addPage()
    y = margin
  }

  // ── PROCEDIMIENTO section ──
  const pasos = (receta.procedimiento ?? '').split('\n').filter((l: string) => l.trim())
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...accent)
  doc.text('PROCEDIMIENTO', margin, y)
  y += 7

  if (pasos.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...textDark)

    for (let i = 0; i < pasos.length; i++) {
      const text = pasos[i].replace(/^\d+\.\s*/, '').trim()
      const stepLabel = `${i + 1}.`
      const stepLines = doc.splitTextToSize(text, contentW - 14)
      const blockH = stepLines.length * 5 + 3

      if (y + blockH > pageH - 25) {
        doc.addPage()
        y = margin
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...accent)
      doc.text(stepLabel, margin, y)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...textDark)
      doc.text(stepLines, margin + 10, y)
      y += blockH + 2
    }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...gray)
    doc.text('Sin procedimiento', margin, y + 4)
    y += 14
  }

  // ── Footer ──
  const footerY = pageH - 12
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...gray)
  doc.text(`Generado por KitchenOS — ${today}`, margin, footerY)
  doc.text(receta.nombre, pageW - margin, footerY, { align: 'right' })

  // ── Download ──
  const safeName = receta.nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').replace(/\s+/g, '_').substring(0, 40)
  doc.save(`${safeName}_ficha_tecnica.pdf`)
}
