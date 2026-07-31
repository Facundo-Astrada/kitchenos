'use client'

import type { Plaza } from '@/types'

// Menciones @persona / #plaza — fuente única.
//
// Vivían dentro de app/(app)/pase/page.tsx. Se extrajeron acá cuando la columna
// "Importante" de OPS Producción necesitó el mismo comportamiento: el texto se
// escribe y se muestra igual en las dos pantallas porque es el mismo mensaje
// (ambas escriben en `pase_mensajes`). No duplicar en un tercer lugar.

export const PLAZA_MENTION_LIST: { id: Plaza; label: string }[] = [
  { id: 'parrilla', label: 'Parrilla' },
  { id: 'frios', label: 'Fríos' },
  { id: 'calientes', label: 'Calientes' },
  { id: 'pase', label: 'Pase' },
  { id: 'pasteleria', label: 'Pastelería' },
  { id: 'panaderia', label: 'Panadería' },
]

export const PLAZA_LABELS_HASH: Record<string, string> = {
  parrilla: '#Parrilla', frios: '#Fríos', calientes: '#Calientes',
  pase: '#Pase', pasteleria: '#Pastelería', panaderia: '#Panadería',
}

/** Extrae la plaza de la primera #mención del texto (null si no hay). */
export function plazaDesdeTexto(texto: string): Plaza | null {
  const m = texto.match(/#(Parrilla|Fríos|Calientes|Pase|Pastelería|Panadería)/i)
  if (!m) return null
  const mapa: Record<string, Plaza> = {
    parrilla: 'parrilla', fríos: 'frios', calientes: 'calientes',
    pase: 'pase', pastelería: 'pasteleria', panadería: 'panaderia',
  }
  return mapa[m[1].toLowerCase()] ?? null
}

/** ¿El texto menciona a esta persona? Compara contra el nombre y el nombre de pila. */
export function mencionaA(texto: string, nombreCompleto: string | null | undefined): boolean {
  if (!nombreCompleto) return false
  const pila = nombreCompleto.trim().split(/\s+/)[0]
  if (!pila) return false
  return new RegExp(`@${pila}`, 'i').test(texto)
}

/** Detecta si el cursor está escribiendo una mención (@ o #) y con qué filtro. */
export function detectarMencion(
  texto: string,
  cursorPos: number,
): { type: '@' | '#'; filter: string; startIdx: number } | null {
  const antes = texto.slice(0, cursorPos)
  const at = antes.match(/@(\w*)$/)
  if (at) return { type: '@', filter: at[1], startIdx: cursorPos - at[0].length }
  const hash = antes.match(/#(\w*)$/)
  if (hash) return { type: '#', filter: hash[1], startIdx: cursorPos - hash[0].length }
  return null
}

// ── Render de texto con @menciones y #plazas resaltadas ──────────────────────
export function RenderTexto({ texto }: { texto: string }) {
  const parts = texto.split(/(@\w[\w\s]*\.?|#\w+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          return <span key={i} className="font-bold" style={{ color: 'var(--accent)' }}>{part}</span>
        }
        if (part.startsWith('#')) {
          return (
            <span
              key={i}
              className="inline-flex items-center px-[5px] py-[1px] rounded-[4px] text-[11px] font-bold mx-[2px]"
              style={{ background: 'rgba(67,97,160,.12)', color: 'var(--accent)' }}
            >
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Dropdown de autocompletado ───────────────────────────────────────────────
export function MentionDropdown({ type, filter, onSelect, position, usuarios }: {
  type: '@' | '#'
  filter: string
  onSelect: (value: string) => void
  position: { bottom: number; left: number; right?: number }
  usuarios: { id: string; nombre: string }[]
}) {
  const items = type === '@'
    ? usuarios
        .filter(u => u.nombre.toLowerCase().includes(filter.toLowerCase()))
        .map(u => ({ key: u.id, label: u.nombre, icon: 'person' }))
    : PLAZA_MENTION_LIST
        .filter(p => p.label.toLowerCase().includes(filter.toLowerCase()))
        .map(p => ({ key: p.id, label: p.label, icon: 'tag' }))

  if (items.length === 0) return null

  return (
    <div
      className="absolute rounded-[10px] overflow-hidden z-[210] max-h-[200px] overflow-y-auto"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        bottom: position.bottom,
        left: position.left,
        right: position.right ?? 16,
      }}
    >
      {items.map(item => (
        <button
          key={item.key}
          className="flex items-center gap-2 w-full text-left px-3 py-[9px] border-none cursor-pointer text-[13px]"
          style={{ background: 'transparent', color: 'var(--text-1)', fontFamily: 'inherit' }}
          // onMouseDown (no onClick): el blur del textarea cerraría el dropdown
          // antes de que el click llegue a dispararse.
          onMouseDown={(e) => { e.preventDefault(); onSelect(item.label) }}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ color: 'var(--accent)' }}>
            {item.icon}
          </span>
          <span className="font-medium">{type === '@' ? `@${item.label}` : `#${item.label}`}</span>
        </button>
      ))}
    </div>
  )
}
