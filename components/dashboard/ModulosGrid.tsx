'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MODULOS_POR_ROL, MODULO_CONFIG, NAV_ITEMS } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import type { Rol } from '@/types'
import { usePermisos } from '@/lib/hooks/usePermisos'
import ImportadorUniversal from '@/components/importador/ImportadorUniversal'

// Todos los módulos que pueden aparecer en el grid
const GRID_MODULOS: ModuloId[] = [
  'operaciones', 'recetario', 'stock', 'pedidos', 'carta',
  'facturas', 'proveedores', 'calendario', 'reportes', 'haccp',
  'pase', 'produccion', 'turnos', 'ventas', 'merma', 'equipo', 'configuracion',
]

// Color único por módulo: [background, iconColor]
const MODULO_COLORS: Partial<Record<ModuloId, [string, string]>> = {
  operaciones: ['#e8f4fd', '#0369a1'],
  recetario:   ['#ecfdf5', '#059669'],
  stock:       ['#fffbeb', '#d97706'],
  pedidos:     ['#fff7ed', '#ea580c'],
  carta:       ['#fdf4ff', '#9333ea'],
  facturas:    ['#f0fdf4', '#16a34a'],
  proveedores: ['#eff6ff', '#2563eb'],
  calendario:  ['#f5f3ff', '#7c3aed'],
  reportes:    ['#fefce8', '#ca8a04'],
  haccp:       ['#f0fdfa', '#0d9488'],
  pase:        ['#eef2ff', '#4f46e5'],
  produccion:  ['#fff1f2', '#e11d48'],
  turnos:      ['#f0f9ff', '#0284c7'],
  ventas:      ['#faf5ff', '#a21caf'],
  merma:       ['#fef2f2', '#dc2626'],
  equipo:      ['#e8f0fe', '#1d4ed8'],
  configuracion: ['#f8fafc', '#475569'],
}

interface ModulosGridProps {
  rol: Rol
}

export default function ModulosGrid({ rol }: ModulosGridProps) {
  const { puedeVer, isAdmin, loading } = usePermisos()
  const [showImportador, setShowImportador] = useState(false)

  const fallback = new Set<string>(MODULOS_POR_ROL[rol] ?? [])

  const modulos = GRID_MODULOS.filter(m => {
    if (NAV_ITEMS.includes(m as (typeof NAV_ITEMS)[number])) return false
    if (loading) return fallback.has(m)
    if (isAdmin) return true
    return puedeVer(m)
  })

  if (modulos.length === 0) return null

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
              background: '#e0f2fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.12s, box-shadow 0.12s',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#0369a1' }}>upload_file</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: 'var(--text-2)', maxWidth: 64 }}>
            Importar
          </span>
        </button>

        {modulos.map((moduloId) => {
          const modulo = MODULO_CONFIG[moduloId as ModuloId]
          if (!modulo) return null
          const [bg, iconColor] = MODULO_COLORS[moduloId] ?? ['var(--surface)', 'var(--navy)']
          return (
            <Link
              key={moduloId}
              href={modulo.href}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <div
                style={{
                  width: 56, height: 56,
                  borderRadius: 16,
                  background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.12s, box-shadow 0.12s',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.06)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)'
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 26, color: iconColor }}
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
      </div>
    </div>

    {showImportador && (
      <ImportadorUniversal onClose={() => setShowImportador(false)} />
    )}
    </>
  )
}
