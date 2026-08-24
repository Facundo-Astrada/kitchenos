'use client'

// Paleta de comandos (Ctrl/Cmd+K) — PLAN-SUPERFICIE S4.2. Reusa lo que ya
// existe en vez de duplicar UI: "Registrar merma" abre el MermaBottomSheet
// real (mismo que usa KitchenCoachFAB); "Crear tarea" llama agregarTarea con
// useTareas({soloEscritura:true}) — sin fetch de la lista completa, solo
// invalida la key real para que las pantallas que sí la muestran se enteren
// (mismo patrón que ya soporta el hook). "Marcar 86" y "Sugerir producción"
// son atajos de navegación, no acciones inline — marcar 86 necesita elegir
// QUÉ plato (un picker propio sería UI nueva) y sugerir producción es un
// panel calculado entero, no una acción de un tap; en los dos casos la
// paleta ahorra la vuelta por el menú, no reimplementa la pantalla.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useTareas } from '@/lib/hooks/useTareas'
import { useMerma } from '@/lib/hooks/useMerma'
import { hoyOperativo } from '@/lib/ops/turnos'
import { MODULO_CONFIG, MODULOS_POR_ROL } from '@/lib/constants'
import type { ModuloId } from '@/lib/constants'
import { GRID_MODULOS } from '@/components/dashboard/ModulosGrid'
import { useAuth } from '@/lib/auth/context'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'
import { Toast } from '@/components/ui'

interface Accion {
  id: string
  label: string
  sublabel?: string
  icon: string
  keywords?: string
  run: () => void
}

// Módulos que no tiene sentido ofrecer como "ir a" (ya son la pantalla actual
// típica, o no son un destino real).
const EXCLUIDOS: ModuloId[] = ['home', 'coach']

export default function CommandPalette() {
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const { perfil } = useAuth()
  const { puedeVer, isAdmin, moduloEnPerfil, loading: loadingPermisos } = usePermisos()
  const { agregarTarea } = useTareas({ soloEscritura: true })
  const { registrarMerma } = useMerma()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [mermaOpen, setMermaOpen] = useState(false)
  const [toast, setToast] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isDesktop) return
    function onOpen() { setOpen(true) }
    function onClose() { setOpen(false); setMermaOpen(false) }
    document.addEventListener('kos:command-palette', onOpen)
    document.addEventListener('kos:close-modal', onClose)
    return () => {
      document.removeEventListener('kos:command-palette', onOpen)
      document.removeEventListener('kos:close-modal', onClose)
    }
  }, [isDesktop])

  useEffect(() => {
    if (open) { setQuery(''); setActiveIdx(0); requestAnimationFrame(() => inputRef.current?.focus()) }
  }, [open])

  // GRID_MODULOS es la lista completa real (ver ModulosGrid.tsx); MODULOS_POR_ROL
  // es solo el fallback mientras usePermisos() todavía está cargando — usarlo
  // como base definitiva dejaba afuera módulos que no están en ese hardcodeado
  // (proveedores, entre otros) aunque el usuario sí pudiera verlos.
  const rol = perfil?.rol ?? 'ayudante'
  const fallback = useMemo(() => new Set<string>(MODULOS_POR_ROL[rol] ?? []), [rol])
  const navegables = useMemo(() => {
    return GRID_MODULOS.filter(id => {
      if (EXCLUIDOS.includes(id)) return false
      if (loadingPermisos) return fallback.has(id)
      return (isAdmin || puedeVer(id)) && moduloEnPerfil(id)
    })
  }, [fallback, loadingPermisos, isAdmin, puedeVer, moduloEnPerfil])

  const acciones = useMemo<Accion[]>(() => {
    const lista: Accion[] = []
    const q = query.trim()

    if (q) {
      lista.push({
        id: 'crear-tarea',
        label: `Crear tarea "${q}"`,
        icon: 'add_task',
        run: async () => {
          await agregarTarea({
            titulo: q, status: 'pendiente', prioridad: 'media', estado: 'pendiente',
            turno_fecha: hoyOperativo(), modo: 'carta', checklist: [],
          })
          setToast(`Tarea creada: ${q}`)
          setOpen(false)
        },
      })
    }

    lista.push({
      id: 'merma', label: 'Registrar merma', icon: 'delete_sweep',
      run: () => { setMermaOpen(true) },
    })
    lista.push({
      id: '86', label: 'Marcar plato agotado (86)', sublabel: 'Carta', icon: 'block', keywords: 'ochenta y seis',
      run: () => { router.push('/carta'); setOpen(false) },
    })
    lista.push({
      id: 'sugerir', label: 'Sugerir producción de hoy', sublabel: 'Planificación', icon: 'auto_awesome',
      run: () => { router.push('/operaciones?tab=planificacion'); setOpen(false) },
    })

    for (const id of navegables) {
      const modulo = MODULO_CONFIG[id]
      lista.push({
        id: `ir-${id}`, label: modulo.label, sublabel: 'Ir a', icon: modulo.icon, keywords: modulo.href,
        run: () => { router.push(modulo.href); setOpen(false) },
      })
    }

    if (!q) return lista
    const qLower = q.toLowerCase()
    return lista.filter(a =>
      a.id === 'crear-tarea' ||
      a.label.toLowerCase().includes(qLower) ||
      a.keywords?.toLowerCase().includes(qLower)
    )
  }, [query, navegables, agregarTarea, router])

  useEffect(() => { setActiveIdx(0) }, [query])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, acciones.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); acciones[activeIdx]?.run() }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  if (!isDesktop) return null

  return (
    <>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {/* Con el sheet de merma abierto, el overlay de la paleta se saca del
          medio — MermaBottomSheet usa z-300/301 (fijo, compartido con otros
          usos suyos en la app), muy por debajo del zIndex:2000 de acá, así
          que quedaría tapado si los dos se renderizan a la vez. */}
      {open && !mermaOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh', background: 'rgba(0,0,0,.5)' }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, background: 'var(--surface)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.4)', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Crear tarea, registrar merma, ir a…"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 15, color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
              <kbd style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}>Esc</kbd>
            </div>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: 6 }}>
              {acciones.length === 0 && (
                <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Sin resultados</div>
              )}
              {acciones.map((a, i) => (
                <button
                  key={a.id}
                  onClick={a.run}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: i === activeIdx ? 'rgba(67,97,160,.1)' : 'none', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: i === activeIdx ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.label}</span>
                  {a.sublabel && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.sublabel}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <MermaBottomSheet
        open={mermaOpen}
        onClose={() => { setMermaOpen(false); setOpen(false) }}
        onRegistrar={async (data) => {
          await registrarMerma(data)
          setMermaOpen(false)
          setOpen(false)
          setToast('Merma registrada')
        }}
      />
    </>
  )
}
