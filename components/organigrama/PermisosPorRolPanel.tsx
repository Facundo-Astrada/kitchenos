'use client'

// Permisos por rol — movido de Configuración (S7 sep 2026, feedback: "es
// confuso que Permisos por rol viva separado del Equipo"). Va colgado del
// tab Puestos y no de un tab propio a propósito: es literalmente el
// fallback de `usePermisos` cuando la persona todavía no tiene un puesto
// asignado (ver lib/permisos/resolver.ts) — ponerlo debajo del editor de
// puestos lo explica solo, un tab aparte lo presentaría como un segundo
// sistema de permisos paralelo, que no es lo que es.
//
// Arranca plegado: no es algo que se toque seguido, y el editor de puestos
// ya es largo.

import { useState } from 'react'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { ROLES_DISPONIBLES, TODOS_LOS_MODULOS } from '@/types'
import type { RolPermiso } from '@/types'
import type { Miembro } from '@/lib/hooks/useEquipo'

const ROLES_DB = ROLES_DISPONIBLES.map(r => r.value)

export function PermisosPorRolPanel({
  miembros, isAdmin, onToast,
}: {
  miembros: Miembro[]
  isAdmin: boolean
  onToast: (msg: string) => void
}) {
  const RESTAURANTE_ID = useRestauranteId()
  const { allPermisos, fetchPermisos } = usePermisos()
  const [supabase] = useState(() => createClient())
  const [expanded, setExpanded] = useState(false)
  const [selectedRol, setSelectedRol] = useState<string>(ROLES_DB[0])
  const [saving, setSaving] = useState(false)

  const currentPermisos = allPermisos.find(p => p.rol === selectedRol)
  const rolLabel = ROLES_DISPONIBLES.find(r => r.value === selectedRol)?.label ?? selectedRol
  const missingCount = ROLES_DB.filter(r => !allPermisos.find(p => p.rol === r)).length
  const sinPuesto = miembros.filter(m => !m.puesto_id).length

  async function toggleModulo(modKey: string) {
    if (!RESTAURANTE_ID) return
    setSaving(true)
    const current = currentPermisos?.modulos_visibles ?? []
    const next = current.includes(modKey)
      ? current.filter(m => m !== modKey)
      : [...current, modKey]

    const { error } = await supabase
      .from('rol_permisos')
      .upsert({
        restaurante_id: RESTAURANTE_ID,
        rol: selectedRol,
        modulos_visibles: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'restaurante_id,rol' })

    setSaving(false)
    if (error) { onToast('Error: ' + error.message); return }
    onToast('Guardado')
    fetchPermisos()
  }

  async function toggleEditPermiso(field: keyof RolPermiso) {
    if (!RESTAURANTE_ID || !currentPermisos) return
    setSaving(true)
    const { error } = await supabase
      .from('rol_permisos')
      .update({
        [field]: !currentPermisos[field],
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentPermisos.id)

    setSaving(false)
    if (error) { onToast('Error: ' + error.message); return }
    onToast('Guardado')
    fetchPermisos()
  }

  async function seedMissingRoles() {
    if (!RESTAURANTE_ID) return
    setSaving(true)
    const existing = allPermisos.map(p => p.rol)
    const missing = ROLES_DB.filter(r => !existing.includes(r))
    if (missing.length === 0) { setSaving(false); return }

    const defaults: Record<string, string[]> = {
      admin: TODOS_LOS_MODULOS.map(m => m.key),
      sous_chef: TODOS_LOS_MODULOS.map(m => m.key).filter(k => k !== 'configuracion'),
      cocinero: ['inicio', 'tareas', 'recetario', 'stock', 'checklist', 'pase'],
      bachero: ['inicio', 'tareas', 'checklist', 'pase'],
      compras: ['inicio', 'stock', 'pedidos', 'proveedores', 'facturas', 'calendario'],
    }

    for (const rol of missing) {
      await supabase.from('rol_permisos').insert({
        restaurante_id: RESTAURANTE_ID,
        rol,
        modulos_visibles: defaults[rol] ?? ['inicio'],
      })
    }
    setSaving(false)
    onToast(`${missing.length} roles creados`)
    fetchPermisos()
  }

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Permisos por rol</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {sinPuesto === 0
              ? 'Nadie depende de esto hoy — todos tienen puesto asignado.'
              : `Lo que ve alguien sin puesto asignado — ${sinPuesto} ${sinPuesto === 1 ? 'persona' : 'personas'} hoy.`}
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', flexShrink: 0 }}>
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            Si el puesto está cargado, manda el puesto. Esto solo se usa como respaldo.
          </p>

          {missingCount > 0 && isAdmin && (
            <button
              onClick={seedMissingRoles}
              style={{
                width: '100%', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
                background: 'var(--bg)', border: '1px dashed var(--border)', color: 'var(--text-2)', cursor: 'pointer',
              }}
            >
              + Crear permisos para {missingCount} rol{missingCount > 1 ? 'es' : ''} faltante{missingCount > 1 ? 's' : ''}
            </button>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ROLES_DISPONIBLES.map(r => (
              <button
                key={r.value}
                onClick={() => setSelectedRol(r.value)}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedRol === r.value ? 'var(--navy)' : 'var(--surface)',
                  color: selectedRol === r.value ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${selectedRol === r.value ? 'var(--navy)' : 'var(--border)'}`,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div style={{ borderRadius: 12, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>{rolLabel}</p>

            {!currentPermisos ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                Este rol no tiene permisos configurados. Usá el botón de arriba para crearlos.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', margin: '10px 0 6px' }}>
                  Módulos visibles
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                  {TODOS_LOS_MODULOS.map(mod => {
                    const checked = currentPermisos.modulos_visibles.includes(mod.key)
                    const isDisabled = !isAdmin || selectedRol === 'admin' || saving
                    return (
                      <label
                        key={mod.key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                          cursor: isDisabled ? 'default' : 'pointer', fontSize: 12,
                          background: checked ? 'rgba(28,45,74,0.08)' : 'transparent',
                          color: checked ? 'var(--navy-ink)' : 'var(--text-3)',
                          opacity: isDisabled ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox" checked={checked} disabled={isDisabled}
                          onChange={() => toggleModulo(mod.key)}
                          style={{ width: 15, height: 15 }}
                        />
                        <span style={{ fontWeight: 500 }}>{mod.label}</span>
                      </label>
                    )
                  })}
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', margin: '14px 0 6px' }}>
                  Permisos de edición
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {([
                    { field: 'puede_editar_stock' as const, label: 'Editar Stock' },
                    { field: 'puede_editar_equipo' as const, label: 'Editar Equipo' },
                    { field: 'puede_editar_recetas' as const, label: 'Editar Recetas' },
                    { field: 'puede_editar_carta' as const, label: 'Editar Carta' },
                    { field: 'puede_eliminar' as const, label: 'Puede eliminar registros' },
                  ]).map(({ field, label }) => {
                    const checked = !!currentPermisos[field]
                    const isDisabled = !isAdmin || selectedRol === 'admin' || saving
                    return (
                      <label
                        key={field}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                          cursor: isDisabled ? 'default' : 'pointer', fontSize: 12,
                          background: checked ? 'rgba(28,45,74,0.08)' : 'transparent',
                          color: checked ? 'var(--navy-ink)' : 'var(--text-3)',
                          opacity: isDisabled ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox" checked={checked} disabled={isDisabled}
                          onChange={() => toggleEditPermiso(field)}
                          style={{ width: 15, height: 15 }}
                        />
                        <span style={{ fontWeight: 500 }}>{label}</span>
                      </label>
                    )
                  })}
                </div>

                {selectedRol === 'admin' && (
                  <p style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--text-3)', margin: '10px 0 0' }}>
                    El administrador siempre tiene acceso completo
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
