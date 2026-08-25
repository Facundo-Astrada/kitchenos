'use client'

// Wizard de 3 preguntas para arrancar el organigrama: activa las áreas del
// catálogo que corresponden al tamaño y al tipo de negocio, y asegura un
// puesto "Dueño / Dirección" con vos como responsable. No crea puestos de
// cocina — esos siguen saliendo de los templates en Equipo → Puestos, porque
// ahí sí depende de la carta real de cada casa, no de un tamaño genérico.

import { useState, useMemo } from 'react'
import { useSheetOpenWhen } from '@/lib/ui/chrome'
import { useAuth } from '@/lib/auth/context'
import type { AreaEstado, Miembro, Puesto } from '@/lib/hooks/useEquipo'
import type { AreaKey } from '@/lib/constants'

type Tamano = '1-3' | '4-10' | '11-25' | '25+'

const TIERS: Record<Tamano, AreaKey[]> = {
  '1-3': ['direccion', 'cocina', 'compras_almacen', 'calidad_seguridad'],
  '4-10': ['direccion', 'cocina', 'compras_almacen', 'calidad_seguridad', 'rrhh', 'id_producto'],
  '11-25': ['direccion', 'cocina', 'compras_almacen', 'calidad_seguridad', 'rrhh', 'id_producto', 'administracion', 'comercial_reservas', 'sistemas'],
  '25+': ['direccion', 'cocina', 'salon', 'compras_almacen', 'calidad_seguridad', 'administracion', 'comercial_reservas', 'rrhh', 'id_producto', 'sistemas', 'marketing', 'infraestructura'],
}

const TAMANO_OPCIONES: { value: Tamano; label: string; sub: string }[] = [
  { value: '1-3', label: '1 a 3 personas', sub: 'Vos cubrís casi todo — es lo normal a esta escala' },
  { value: '4-10', label: '4 a 10 personas', sub: 'Ya hay alguien de confianza para RRHH y la carta' },
  { value: '11-25', label: '11 a 25 personas', sub: 'Administración y comercial empiezan a separarse' },
  { value: '25+', label: 'Más de 25', sub: 'Las 12 áreas del catálogo, activas' },
]

const QUE_HACEN_OPCIONES: { key: AreaKey; label: string; icon: string }[] = [
  { key: 'salon', label: 'Atendemos en salón', icon: 'table_restaurant' },
  { key: 'comercial_reservas', label: 'Reservas o eventos', icon: 'calendar_month' },
  { key: 'administracion', label: 'Vendemos por mayor / a otros negocios', icon: 'account_balance' },
  { key: 'marketing', label: 'Redes o página activa', icon: 'campaign' },
]

interface OrganigramaWizardSheetProps {
  open: boolean
  onClose: () => void
  areas: AreaEstado[]
  miembros: Miembro[]
  puestos: Puesto[]
  onSetAreaActiva: (key: AreaKey, activa: boolean) => Promise<void>
  onToggleAreaResponsable: (key: AreaKey, miembroId: string) => Promise<void>
  onCrearMiembro: (datos: Omit<Miembro, 'id' | 'restaurante_id' | 'created_at' | 'activo' | 'modulos_extra' | 'modulos_restringidos' | 'ver_costos'>) => Promise<string>
  onActualizarMiembro: (id: string, datos: Partial<Omit<Miembro, 'id' | 'restaurante_id' | 'created_at'>>) => Promise<void>
  onCrearPuesto: (datos: Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>) => Promise<string>
}

export function OrganigramaWizardSheet({
  open, onClose, areas, miembros, puestos,
  onSetAreaActiva, onToggleAreaResponsable, onCrearMiembro, onActualizarMiembro, onCrearPuesto,
}: OrganigramaWizardSheetProps) {
  useSheetOpenWhen(open)
  const { user, perfil } = useAuth()

  const [tamano, setTamano] = useState<Tamano>('1-3')
  const [queHacen, setQueHacen] = useState<Set<AreaKey>>(new Set())
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [saving, setSaving] = useState(false)

  const miembroPropio = useMemo(
    () => (perfil?.miembro_id ? miembros.find(m => m.id === perfil.miembro_id) : undefined),
    [perfil?.miembro_id, miembros]
  )

  function toggleQueHacen(key: AreaKey) {
    setQueHacen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function aplicar() {
    if (!miembroPropio && (!nombre.trim() || !apellido.trim())) {
      alert('Completá tu nombre y apellido')
      return
    }
    setSaving(true)
    try {
      // 1. Activar las áreas del tier + las de "qué hacen"
      const activar = new Set<AreaKey>([...TIERS[tamano], ...queHacen])
      for (const key of activar) {
        const estado = areas.find(a => a.key === key)
        if (estado && !estado.activa) await onSetAreaActiva(key, true)
      }

      // 2. Asegurar tu miembro
      let miembroId = miembroPropio?.id ?? null
      if (!miembroId) {
        miembroId = await onCrearMiembro({
          auth_user_id: user?.id ?? null,
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          rol: 'admin',
          puesto_id: null,
          plaza_asignada: null,
          telefono: null,
          email: user?.email ?? null,
          fecha_ingreso: null,
          foto_url: null,
          costo_hora: null,
          objetivos: {},
        })
      }

      // 3. Asegurar el puesto "Dueño / Dirección" (no duplicar si ya existe)
      let puestoDireccion = puestos.find(p => p.area_key === 'direccion')
      let puestoId = puestoDireccion?.id ?? null
      if (!puestoId) {
        puestoId = await onCrearPuesto({
          nombre: 'Dueño / Dirección',
          descripcion: 'Dirección general del negocio',
          nivel: 'admin',
          plaza_default: null,
          // Dirección es el único puesto que nace viendo la plata del negocio;
          // el resto lo otorga el admin a mano (PLAN-ACCESO-Y-USO B3).
          ver_costos: true,
          area_key: 'direccion',
          reporta_a_puesto_id: null,
          orden: 0,
          permisos_app: [],
          tareas_funciones: [],
          objetivos: {},
        })
      }

      // 4. Vos = responsable de Dirección (sumás, no reemplazás — puede haber
      // más de un responsable si ya había otro cargado, ej. un socio)
      if (miembroId && puestoId) {
        await onActualizarMiembro(miembroId, { puesto_id: puestoId })
        const direccion = areas.find(a => a.key === 'direccion')
        if (!direccion?.responsables.includes(miembroId)) {
          await onToggleAreaResponsable('direccion', miembroId)
        }
      }

      onClose()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al aplicar la configuración')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[300]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[301] rounded-t-[20px] max-h-[88vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex justify-center pt-3 pb-1 sticky top-0" style={{ background: 'var(--surface)' }}>
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold" style={{ color: 'var(--navy)' }}>Configurar organigrama</h3>
            <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1">
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 18px', lineHeight: 1.5 }}>
            3 preguntas para activar las áreas que corresponden a tu negocio. Las que no marqués siguen en el catálogo, solo que inactivas.
          </p>

          {/* Q1 — tamaño */}
          <div style={{ marginBottom: 18 }}>
            <label style={qLabel}>1 · ¿Cuántos son en el equipo?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {TAMANO_OPCIONES.map(o => (
                <button key={o.value} type="button" onClick={() => setTamano(o.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                    border: `2px solid ${tamano === o.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: tamano === o.value ? 'rgba(67,97,160,.08)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${tamano === o.value ? 'var(--accent)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {tamano === o.value && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{o.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Q2 — qué hacen */}
          <div style={{ marginBottom: 18 }}>
            <label style={qLabel}>2 · ¿Qué hacen además de cocina?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {QUE_HACEN_OPCIONES.map(o => {
                const active = queHacen.has(o.key)
                return (
                  <button key={o.key} type="button" onClick={() => toggleQueHacen(o.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 12,
                      border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'rgba(67,97,160,.08)' : 'var(--surface)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: active ? 'var(--accent)' : 'var(--text-3)' }}>{o.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{o.label}</span>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: active ? 'var(--accent)' : 'transparent',
                      border: active ? 'none' : '2px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Q3 — quién sos vos */}
          <div style={{ marginBottom: 20 }}>
            <label style={qLabel}>3 · ¿Quién sos vos?</label>
            {miembroPropio ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '10px 14px',
                borderRadius: 12, background: 'rgba(16,185,129,.1)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#0a8f5f' }}>verified_user</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>
                  Vas a quedar como responsable de Dirección: <b>{miembroPropio.nombre} {miembroPropio.apellido}</b>
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13.5, fontFamily: 'inherit' }} />
                <input value={apellido} onChange={e => setApellido(e.target.value)} placeholder="Apellido"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13.5, fontFamily: 'inherit' }} />
              </div>
            )}
          </div>

          <button
            onClick={aplicar}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold text-white cursor-pointer border-none"
            style={{ background: 'var(--navy)', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Aplicando...' : 'Aplicar configuración'}
          </button>
        </div>
      </div>
    </>
  )
}

const qLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)',
}
