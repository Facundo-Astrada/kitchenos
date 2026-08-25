'use client'

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useSheetOpenWhen } from '@/lib/ui/chrome'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { MODULO_CONFIG, MODULO_DESCRIPCION, plazaLabel, type ModuloId } from '@/lib/constants'
import type { Plaza } from '@/types'

// ══════════════════════════════════════════════════════════════
// CARTA DE BIENVENIDA — lo primero que ve alguien recién incorporado.
//
// Formato elegido contra un tour guiado de 20+ pasos: ~60 segundos, no un
// recorrido. Responde tres preguntas y se va: quién sos acá, qué puesto te
// asignaron, y para qué sirve cada cosa que vas a ver. Los recorridos
// detallados de cada pantalla arrancan solos después, cuando entrás a esa
// pantalla por primera vez (ver useTourAutomatico).
//
// Muestra SOLO los módulos que la persona efectivamente ve. Listar lo que no
// puede tocar no informa: enseña a pedir permisos.
// ══════════════════════════════════════════════════════════════

// Orden de presentación: primero lo que usa todos los días, después lo que
// mira de vez en cuando. No es el orden del menú ni el alfabético.
const ORDEN_PRESENTACION: ModuloId[] = [
  'home', 'operaciones', 'checklist', 'produccion', 'tareas', 'pase',
  'recetario', 'carta', 'stock', 'merma', 'espacios', 'muro',
  'pedidos', 'proveedores', 'facturas',
  'salon', 'kds', 'reservas', 'clientes',
  'ventas', 'reportes', 'haccp', 'calendario', 'turnos', 'bitacora',
  'equipo', 'organigrama', 'configuracion',
]

interface Props {
  onCerrar: () => void
}

export default function BienvenidaPuesto({ onCerrar }: Props) {
  const router = useRouter()
  const { perfil } = useAuth()
  const { puedeVer, moduloEnPerfil, isAdmin } = usePermisos()
  const { puestos, miembros } = useEquipo()
  const { plazasCustom } = usePlazasCustom()
  useSheetOpenWhen(true)

  // `perfil` trae el miembro_id pero no el puesto, así que se resuelve contra
  // las listas que useEquipo ya tiene en SWR — sin query propia.
  const puestoNombre = useMemo(() => {
    const yo = miembros.find(m => m.id === perfil?.miembro_id)
    if (!yo?.puesto_id) return null
    return puestos.find(p => p.id === yo.puesto_id)?.nombre ?? null
  }, [miembros, puestos, perfil?.miembro_id])

  const modulos = useMemo(
    () => ORDEN_PRESENTACION.filter(m => (m === 'home' || isAdmin || puedeVer(m)) && moduloEnPerfil(m)),
    [puedeVer, moduloEnPerfil, isAdmin],
  )

  // Por dónde arranca: OPS es la pantalla de quien cocina; el dashboard, la de
  // quien mira el negocio. Si no ve OPS, el inicio siempre está.
  const destino = puedeVer('operaciones') && !isAdmin ? '/operaciones' : '/'
  const destinoLabel = destino === '/operaciones' ? 'Ir a Operaciones' : 'Ir al inicio'

  function empezar() {
    onCerrar()
    if (destino !== '/') router.push(destino)
  }

  const plaza = perfil?.plaza_asignada
    ? plazaLabel(perfil.plaza_asignada.split(',')[0].trim() as Plaza, plazasCustom)
    : null

  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', width: '100%', maxWidth: 520,
        borderRadius: '20px 20px 0 0', maxHeight: '88vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-3, 0 -8px 40px rgba(0,0,0,.25))',
      }}>
        {/* Encabezado */}
        <div style={{ background: 'var(--navy)', padding: '26px 20px 22px', borderRadius: '20px 20px 0 0' }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#fff' }}>waving_hand</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#fff' }}>
            Bienvenido{perfil?.nombre ? `, ${perfil.nombre}` : ''}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.5 }}>
            Esto es lo que el administrador dejó configurado para vos.
          </p>
        </div>

        {/* Puesto y plaza */}
        <div style={{ padding: '16px 20px 4px' }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px',
            background: 'var(--bg)', borderRadius: 12, marginBottom: 18,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--navy)' }}>badge</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '.07em',
              }}>Tu puesto</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                {puestoNombre ?? 'Sin puesto asignado'}
              </div>
              {plaza && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  Arrancás en {plaza}
                </div>
              )}
            </div>
          </div>

          {/* Funciones habilitadas */}
          <div style={{
            fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10,
          }}>
            Lo que podés usar ({modulos.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {modulos.map(m => {
              const cfg = MODULO_CONFIG[m]
              return (
                <div key={m} style={{ display: 'flex', gap: 12, padding: '9px 0', alignItems: 'flex-start' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 1,
                    background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--navy)' }}>
                      {cfg?.icon ?? 'widgets'}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{cfg?.label ?? m}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, marginTop: 1 }}>
                      {MODULO_DESCRIPCION[m]}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{
            fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5,
            margin: '16px 0 0', padding: '10px 12px',
            background: 'rgba(249,115,22,.07)', borderRadius: 10,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: -2, marginRight: 5, color: '#f97316' }}>chef_hat</span>
            La primera vez que entres a cada pantalla, el Kitchen Coach te la explica solo.
            Después podés volver a verlo desde tu perfil.
          </p>
        </div>

        {/* CTA */}
        <div style={{
          position: 'sticky', bottom: 0, background: 'var(--surface)',
          padding: '14px 20px 22px', borderTop: '1px solid var(--border)', marginTop: 16,
        }}>
          <button
            onClick={empezar}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: 'var(--navy)', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {destinoLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
