/**
 * Cuántas de las últimas 4 semanas (ventana móvil de 7 días, no semana
 * calendario) tuvieron al menos una factura cargada.
 *
 * Antes exigía racha estricta desde hoy: un solo bache reseteaba a 0 meses
 * de carga casi diaria — medido en Bros el 11/09/2026, ~3 meses de facturas
 * casi todos los días daban 0 porque la última cargada tenía 8 días.
 * `fecha_factura` es la fecha del comprobante, no la de carga: un lag de
 * pocos días entre recibir la factura y cargarla es normal, no abandono.
 *
 * Ahora cuenta cuántas de las últimas 4 semanas tuvieron carga, sin exigir
 * que sean consecutivas ni que la de esta semana ya esté. Si el hábito
 * realmente murió, en 4 semanas el conteo lo refleja solo — no es "para
 * siempre", solo tolera un bache.
 */
const ISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function semanasSeguidasConFactura(fechas: string[], hoy = new Date()): number {
  if (fechas.length === 0) return 0
  const set = new Set(fechas)
  let semanas = 0
  for (let s = 0; s < 4; s++) {
    const desde = new Date(hoy); desde.setDate(desde.getDate() - (s + 1) * 7)
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - s * 7)
    if ([...set].some(f => f > ISO(desde) && f <= ISO(hasta))) semanas++
  }
  return semanas
}
