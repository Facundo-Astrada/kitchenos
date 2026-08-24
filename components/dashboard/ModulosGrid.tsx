'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { MODULOS_POR_ROL, MODULO_CONFIG, NAV_ITEMS } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import type { Rol } from '@/types'
import { usePermisos } from '@/lib/hooks/usePermisos'
import ImportadorUniversal from '@/components/importador/ImportadorUniversal'

// Todos los módulos que pueden aparecer en el grid
const GRID_MODULOS: ModuloId[] = [
  'operaciones', 'espacios', 'recetario', 'stock', 'pedidos', 'carta',
  'facturas', 'proveedores', 'calendario', 'reportes', 'haccp',
  'pase', 'produccion', 'turnos', 'ventas', 'clientes', 'merma', 'equipo', 'configuracion', 'reservas',
]

// PLAN-SUPERFICIE S1.4 — la grilla mostraba los ~20 módulos de una (el
// desktop ya salió de acá, ver DashboardClientView: el sidebar navega solo).
// En mobile se recorta a los más usados de este dispositivo + "Ver todos"
// que expande el resto inline. Sin historial (primera vez), el orden es el
// de GRID_MODULOS de arriba — ya prioriza los módulos de uso diario.
const MOSTRADOS_DEFAULT = 6
const FREQ_KEY = 'kc_modulo_freq'

function leerFrecuencias(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function registrarUsoModulo(moduloId: string) {
  if (typeof window === 'undefined') return
  try {
    const freq = leerFrecuencias()
    freq[moduloId] = (freq[moduloId] ?? 0) + 1
    localStorage.setItem(FREQ_KEY, JSON.stringify(freq))
  } catch {
    // localStorage puede fallar (modo privado) — no bloquea la navegación
  }
}

interface ModulosGridProps {
  rol: Rol
}

export default function ModulosGrid({ rol }: ModulosGridProps) {
  const { puedeVer, isAdmin, loading } = usePermisos()
  const [showImportador, setShowImportador] = useState(false)
  const [expandido, setExpandido] = useState(false)
  const [freq, setFreq] = useState<Record<string, number>>({})

  useEffect(() => { setFreq(leerFrecuencias()) }, [])

  const fallback = new Set<string>(MODULOS_POR_ROL[rol] ?? [])

  const modulos = GRID_MODULOS.filter(m => {
    if (NAV_ITEMS.includes(m as (typeof NAV_ITEMS)[number])) return false
    if (loading) return fallback.has(m)
    if (isAdmin) return true
    return puedeVer(m)
  })

  if (modulos.length === 0) return null

  // Más usados primero (frecuencia guardada en este dispositivo, sort estable
  // así que sin historial queda el orden de GRID_MODULOS).
  const ordenados = [...modulos].sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0))
  const hayOcultos = ordenados.length > MOSTRADOS_DEFAULT
  const visibles = expandido ? ordenados : ordenados.slice(0, MOSTRADOS_DEFAULT)

  return (
    <>
    <div style={{ padding: '4px 16px 4px' }}>
      <div
        className="text-[11px] font-bold uppercase tracking-[.08em] mb-3"
        style={{ color: 'var(--text-3)' }}
      >
        Módulos
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Tile "Importar datos" */}
        <button
          onClick={() => setShowImportador(true)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.12s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>upload_file</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: 'var(--text-2)', maxWidth: 64 }}>
            Importar
          </span>
        </button>

        {visibles.map((moduloId) => {
          const modulo = MODULO_CONFIG[moduloId as ModuloId]
          if (!modulo) return null
          return (
            <Link
              key={moduloId}
              href={modulo.href}
              onClick={() => registrarUsoModulo(moduloId)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <div
                style={{
                  width: 56, height: 56,
                  borderRadius: 16,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.12s',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 26, color: 'var(--accent)' }}
                >
                  {modulo.icon}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10, fontWeight: 600, textAlign: 'center',
                  lineHeight: 1.2, color: 'var(--text-2)',
                  maxWidth: 64,
                }}
              >
                {modulo.label}
              </span>
            </Link>
          )
        })}

        {!expandido && hayOcultos && (
          <button
            onClick={() => setExpandido(true)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'var(--bg)', border: '1px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--text-3)' }}>apps</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: 'var(--text-3)', maxWidth: 64 }}>
              Ver todos
            </span>
          </button>
        )}
      </div>
    </div>

    {showImportador && (
      <ImportadorUniversal onClose={() => setShowImportador(false)} />
    )}
    </>
  )
}
