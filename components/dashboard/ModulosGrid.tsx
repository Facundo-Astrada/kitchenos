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
  'pase', 'produccion', 'turnos', 'ventas', 'clientes', 'merma', 'equipo', 'configuracion', 'reservas',
]


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
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', transition: 'box-shadow 0.15s, transform 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>upload_file</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>Importar</span>
          </button>

          {modulos.map((moduloId) => {
            const modulo = MODULO_CONFIG[moduloId as ModuloId]
            if (!modulo) return null
            return (
              <Link
                key={moduloId}
                href={modulo.href}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', textDecoration: 'none', transition: 'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>{modulo.icon}</span>
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

        {modulos.map((moduloId) => {
          const modulo = MODULO_CONFIG[moduloId as ModuloId]
          if (!modulo) return null
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
      </div>
    </div>

    {showImportador && (
      <ImportadorUniversal onClose={() => setShowImportador(false)} />
    )}
    </>
  )
}
