// Export .ics — que el equipo vea el calendario del restaurante en el Google
// Calendar / Calendario del celular sin entrar a K-OS. Versión descarga (sin
// servidor); el feed suscribible es una API route aparte (ver propuesta).
import { addDays } from './fechas'

interface ItemIcs {
  id: string
  titulo: string
  descripcion?: string | null
  meta?: string
  dia: string
  diaFin: string
  hora_inicio: string
  hora_fin: string
  todoElDia: boolean
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const fecha = (d: string) => d.replace(/-/g, '')
const fechaHora = (d: string, h: string) => `${fecha(d)}T${h.slice(0, 5).replace(':', '')}00`

export function generarIcs(items: ItemIcs[], nombre = 'KitchenOS'): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KitchenOS//Calendario//ES', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(nombre)}`, 'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
  ]
  for (const it of items) {
    lineas.push('BEGIN:VEVENT', `UID:${it.id}@kitchenos`, `DTSTAMP:${stamp}`)
    if (it.todoElDia) {
      lineas.push(`DTSTART;VALUE=DATE:${fecha(it.dia)}`, `DTEND;VALUE=DATE:${fecha(addDays(it.diaFin, 1))}`)
    } else {
      lineas.push(
        `DTSTART;TZID=America/Argentina/Buenos_Aires:${fechaHora(it.dia, it.hora_inicio)}`,
        `DTEND;TZID=America/Argentina/Buenos_Aires:${fechaHora(it.dia, it.hora_fin > it.hora_inicio ? it.hora_fin : '23:59')}`,
      )
    }
    lineas.push(`SUMMARY:${esc(it.titulo)}`)
    const desc = [it.descripcion, it.meta].filter(Boolean).join(' — ')
    if (desc) lineas.push(`DESCRIPTION:${esc(desc)}`)
    lineas.push('END:VEVENT')
  }
  lineas.push('END:VCALENDAR')
  return lineas.join('\r\n')
}

export function descargarIcs(contenido: string, archivo: string) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = archivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
