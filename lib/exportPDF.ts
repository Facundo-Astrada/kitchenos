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

// ══════════════════════════════════════════════════════════════
// Organigrama — el árbol completo para colgar + una carilla por
// puesto (nombre, área, a quién reporta, ocupantes, tareas y
// módulos), generado solo con datos ya cargados.
// ══════════════════════════════════════════════════════════════

import {
  construirArbolPuestos, NIVELES_ACCESO,
  type Puesto, type Miembro, type AreaEstado, type PuestoNode,
} from '@/lib/hooks/useEquipo'
import { MODULO_CONFIG, type ModuloId } from '@/lib/constants'

function nivelLabelPDF(nivel: string): string {
  return NIVELES_ACCESO.find(n => n.value === nivel)?.label ?? nivel
}

export async function exportOrganigramaPDF(areas: AreaEstado[], puestos: Puesto[], miembros: Miembro[]) {
  const { default: jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - margin * 2
  let y = margin

  const navy: [number, number, number] = [15, 23, 42]
  const accent: [number, number, number] = [79, 70, 229]
  const gray: [number, number, number] = [100, 116, 139]
  const lightGray: [number, number, number] = [226, 232, 240]
  const textDark: [number, number, number] = [30, 41, 59]

  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  function drawHeader(subtitle: string) {
    doc.setFillColor(...navy)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('KitchenOS', margin, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(200, 200, 220)
    doc.text(subtitle, margin, 17)
    doc.setFontSize(8)
    doc.setTextColor(180, 180, 200)
    doc.text(today, pageW - margin, 12, { align: 'right' })
  }

  function drawFooter(rightLabel: string) {
    const footerY = pageH - 12
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(0.3)
    doc.line(margin, footerY - 4, pageW - margin, footerY - 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...gray)
    doc.text(`Generado por KitchenOS — ${today}`, margin, footerY)
    doc.text(rightLabel, pageW - margin, footerY, { align: 'right' })
  }

  function ensureSpace(h: number, subtitle: string) {
    if (y + h > pageH - 20) {
      doc.addPage()
      drawHeader(subtitle)
      y = 38
    }
  }

  // ── Organigrama completo, por área ──
  drawHeader('Organigrama')
  y = 38
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...textDark)
  doc.text('Organigrama', margin, y)
  y += 10
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)
  y += 10

  const areasActivas = areas.filter(a => a.activa)

  if (areasActivas.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...gray)
    doc.text('Sin áreas activas todavía.', margin, y)
  }

  for (const area of areasActivas) {
    const puestosArea = puestos.filter(p => p.area_key === area.key)
    ensureSpace(14, 'Organigrama')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...accent)
    doc.text(area.nombre.toUpperCase(), margin, y)
    y += 5

    const responsablesNombres = area.responsables
      .map(id => miembros.find(m => m.id === id))
      .filter((m): m is Miembro => !!m)
      .map(m => `${m.nombre} ${m.apellido}`)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(responsablesNombres.length ? `Responsable: ${responsablesNombres.join(', ')}` : 'Sin responsable asignado', margin, y)
    y += 8

    if (puestosArea.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text('Sin puestos cargados en esta área.', margin + 4, y)
      y += 8
      continue
    }

    const printNode = (node: PuestoNode, depth: number) => {
      const ocupantes = miembros.filter(m => m.puesto_id === node.id).map(m => `${m.nombre} ${m.apellido}`)
      const ocupantesTxt = ocupantes.length ? ocupantes.join(', ') : 'Vacante'
      const bullet = depth === 0 ? '•' : '–'
      const line = `${'   '.repeat(depth)}${bullet} ${node.nombre} — ${ocupantesTxt}`
      const lines = doc.splitTextToSize(line, contentW - depth * 6)
      ensureSpace(lines.length * 5 + 1.5, 'Organigrama')
      doc.setFont('helvetica', depth === 0 ? 'bold' : 'normal')
      doc.setFontSize(depth === 0 ? 10 : 9)
      doc.setTextColor(...textDark)
      doc.text(lines, margin + depth * 6, y)
      y += lines.length * 5 + 1.5
      node.hijos.forEach(h => printNode(h, depth + 1))
    }
    construirArbolPuestos(puestosArea).forEach(n => printNode(n, 0))
    y += 6
  }

  // ── Una carilla por puesto — el mini manual de puesto ──
  for (const puesto of puestos) {
    doc.addPage()
    drawHeader('Manual de puesto')
    y = 40

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...textDark)
    const nameLines = doc.splitTextToSize(puesto.nombre, contentW)
    doc.text(nameLines, margin, y)
    y += nameLines.length * 9 + 2

    const areaNombre = areas.find(a => a.key === puesto.area_key)?.nombre ?? 'Sin área asignada'
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...gray)
    doc.text(`${areaNombre}  ·  ${nivelLabelPDF(puesto.nivel)}`, margin, y)
    y += 8

    doc.setDrawColor(...lightGray)
    doc.setLineWidth(0.4)
    doc.line(margin, y, pageW - margin, y)
    y += 10

    const padre = puesto.reporta_a_puesto_id ? puestos.find(p => p.id === puesto.reporta_a_puesto_id) : undefined
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('REPORTA A', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...textDark)
    doc.text(padre ? padre.nombre : 'Nadie — raíz del organigrama', margin, y)
    y += 10

    const ocupantes = miembros.filter(m => m.puesto_id === puesto.id).map(m => `${m.nombre} ${m.apellido}`)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('OCUPA ESTE PUESTO', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...textDark)
    doc.text(ocupantes.length ? ocupantes.join(', ') : 'Vacante', margin, y)
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('TAREAS Y FUNCIONES', margin, y)
    y += 6

    if (puesto.tareas_funciones.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.setTextColor(...gray)
      doc.text('Sin tareas cargadas', margin, y)
      y += 6
    } else {
      for (const t of puesto.tareas_funciones) {
        const lines = doc.splitTextToSize(`•  ${t}`, contentW - 4)
        ensureSpace(lines.length * 5 + 1.5, 'Manual de puesto')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...textDark)
        doc.text(lines, margin, y)
        y += lines.length * 5 + 1.5
      }
    }
    y += 6

    ensureSpace(20, 'Manual de puesto')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...accent)
    doc.text('MÓDULOS HABILITADOS EN LA APP', margin, y)
    y += 6

    const modLabels = puesto.permisos_app.map(m => MODULO_CONFIG[m as ModuloId]?.label ?? m)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...textDark)
    const modLines = doc.splitTextToSize(modLabels.length ? modLabels.join('  ·  ') : 'Ninguno', contentW)
    doc.text(modLines, margin, y)

    drawFooter(puesto.nombre)
  }

  doc.save(`organigrama_${today.replace(/\//g, '-')}.pdf`)
}

// ══════════════════════════════════════════════════════════════
// Rutina de turno — checklist de apertura y cierre para colgar en
// la pared. Una sola hoja A4: mitad de arriba apertura, mitad de
// abajo cierre, con casillero para tildar a mano.
// ══════════════════════════════════════════════════════════════

interface PDFRutinaItem {
  texto: string
  hora: string | null
  requiereResponsable: boolean
}

export async function exportRutinaTurnoPDF(params: {
  apertura: PDFRutinaItem[]
  cierre: PDFRutinaItem[]
  turnoLabel: string
  fecha: string
}) {
  const { apertura, cierre, turnoLabel, fecha } = params
  const { default: jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 16

  const navy: [number, number, number] = [15, 23, 42]
  const accent: [number, number, number] = [79, 70, 229]
  const gray: [number, number, number] = [100, 116, 139]
  const lightGray: [number, number, number] = [226, 232, 240]
  const textDark: [number, number, number] = [30, 41, 59]

  const fechaLarga = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  // ── Header ──
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageW, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text('Rutina de turno', margin, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 220)
  doc.text(`${fechaLarga} · ${turnoLabel}`, margin, 19)

  const footerY = pageH - 10
  const topY = 36
  const dividerY = topY + (footerY - 10 - topY) / 2

  function drawSeccion(label: string, color: [number, number, number], items: PDFRutinaItem[], startY: number, endY: number) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...color)
    doc.text(label, margin, startY)
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(0.4)
    doc.line(margin, startY + 3, pageW - margin, startY + 3)

    const rowsStartY = startY + 9
    const availH = endY - rowsStartY

    if (items.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text('Sin pasos cargados', margin, rowsStartY + 4)
      return
    }

    const rowH = Math.min(9.5, Math.max(5.5, availH / items.length))

    items.forEach((item, idx) => {
      const rowY = rowsStartY + idx * rowH
      const boxSize = 3.6
      const boxY = rowY + (rowH - boxSize) / 2 - 1
      const midY = rowY + rowH / 2 + 1.2

      doc.setDrawColor(...gray)
      doc.setLineWidth(0.35)
      doc.rect(margin, boxY, boxSize, boxSize)

      let textX = margin + boxSize + 3
      if (item.hora) {
        doc.setFont('courier', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...accent)
        doc.text(item.hora, textX, midY)
        textX += 12
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(...textDark)
      doc.text(item.texto, textX, midY)

      if (item.requiereResponsable) {
        const respX = pageW - margin - 38
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...gray)
        doc.text('Resp:', respX, midY)
        doc.setDrawColor(...lightGray)
        doc.setLineWidth(0.3)
        doc.line(respX + 8, midY + 0.5, pageW - margin, midY + 0.5)
      }
    })
  }

  drawSeccion('APERTURA', accent, apertura, topY, dividerY - 4)

  doc.setDrawColor(...navy)
  doc.setLineWidth(0.6)
  doc.setLineDashPattern([2, 1.5], 0)
  doc.line(margin, dividerY, pageW - margin, dividerY)
  doc.setLineDashPattern([], 0)

  drawSeccion('CIERRE', navy, cierre, dividerY + 8, footerY - 6)

  // ── Footer ──
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...gray)
  doc.text('Tildar con lapicera al completar cada paso — Generado por KitchenOS', margin, footerY)
  doc.text(fecha, pageW - margin, footerY, { align: 'right' })

  doc.save(`rutina-turno-${fecha}.pdf`)
}
