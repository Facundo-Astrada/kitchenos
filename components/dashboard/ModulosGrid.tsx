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
  'operaciones', 'espacios', 'recetario', 'stock', 'pedidos', 'carta',
  'facturas', 'proveedores', 'calendario', 'reportes', 'haccp',
  'pase', 'produccion', 'turnos', 'ventas', 'merma', 'equipo', 'configuracion',
]

// Color único por módulo: [background, iconColor]
const MODULO_COLORS: Partial<Record<ModuloId, [string, string]>> = {
  operaciones: ['#e8f4fd', '#0369a1'],
  espacios:    ['#eef2ff', '#4f46e5'],
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
  desktop?: boolean
}

export default function ModulosGrid({ rol, desktop = false }: ModulosGridProps) {
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

  if (desktop) {
    return (
      <>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 12 }}>Módulos</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {/* Importar */}
          <button
            onClick={() => setShowImportador(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#e0f2fe', border: '1px solid #bae6fd', cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.15s, transform 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#0369a1' }}>upload_file</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e', lineHeight: 1.2 }}>Importar</span>
          </button>

          {modulos.map((moduloId) => {
            const modulo = MODULO_CONFIG[moduloId as ModuloId]
            if (!modulo) return null
            const [bg, iconColor] = MODULO_COLORS[moduloId] ?? ['var(--surface)', 'var(--navy)']
            const borderColor = bg.replace(')', ', .4)').replace('rgb(', 'rgba(').replace('#', '')
            return (
              <Link
                key={moduloId}
                href={modulo.href}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: bg, border: `1px solid ${bg}`, cursor: 'pointer', textDecoration: 'none', transition: 'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: iconColor }}>{modulo.icon}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>{modulo.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
      {showImportador && <ImportadorUniversal onClose={() => setShowImportador(false)} />}
      </>
    )
  }

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
