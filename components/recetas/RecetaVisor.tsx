'use client'

// Visor global de recetas — una sola ficha para toda la app.
//
// La receta se abre ENCIMA de la pantalla en la que se esté (Recetario,
// Carta, OPS), con el fondo translúcido: la pantalla de abajo queda montada,
// tal cual estaba. Es la misma ficha en todos lados (RecetaFicha), no una
// versión distinta por módulo.
//
// Y se puede dejar en segundo plano: queda un botón flotante con el nombre y
// la conversión vigente ("750 g de Cebolla"), que acompaña por toda la app y
// la vuelve a abrir. Cerrar una receta que está convertida la manda sola al
// segundo plano — la cuenta ya hecha no se pierde por cerrar sin querer.
//
// Montado en app/(app)/layout.tsx. KDS y Muro (app/(servicio)) no lo tienen
// a propósito: Registro Servicio, nada flotando (DESIGN.md §2).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { RecetaVisorContext, type RecetaVisorApi, type FichaEnVisor } from '@/components/recetas/visorContexto'
import { leerEscala } from '@/lib/recetas/escalaSesion'
import { useSheetOpenWhen, useSheetCount } from '@/lib/ui/chrome'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useReducedMotion, DURATION } from '@/lib/ui/motion'
import { RecetaDetailSkeleton } from '@/app/(app)/recetario/[id]/loading'

// La ficha es pesada y el visor vive en el layout: se baja recién al abrir la
// primera receta, no en cada pantalla de la app.
const RecetaFicha = dynamic(
  () => import('@/app/(app)/recetario/[id]/RecetaFicha').then(m => m.RecetaFicha),
  { ssr: false, loading: () => <RecetaDetailSkeleton /> },
)

interface Estado {
  id: string
  recorrido: string[]
  minimizada: boolean
  nombre: string | null
  detalle: string | null
}

type Info = { id: string; nombre: string; detalle: string | null }

// Nombre y conversión de una receta: lo último que informó su ficha o, si no
// informó (recién restaurada de un F5), lo que ya se sabía.
function datosDe(info: Info | null, id: string, previo?: Estado | null) {
  return {
    nombre: info?.id === id ? info.nombre : (previo?.id === id ? previo.nombre : null),
    detalle: info?.id === id ? info.detalle : (previo?.id === id ? previo.detalle : null),
  }
}

const CLAVE = 'kc_receta_visor'
const SIN_RECORRIDO: string[] = []

export function RecetaVisorProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const isDesktop = useIsDesktop()
  const reducedMotion = useReducedMotion()
  const pathname = usePathname()
  const sheetCount = useSheetCount()
  const [montado, setMontado] = useState(false)

  // Lo último que informó la ficha (nombre + conversión). Por ref: cambia con
  // cada ajuste de escala y solo hace falta al pasar a segundo plano.
  const info = useRef<Info | null>(null)

  // Una receta que quedó en segundo plano sobrevive a un F5.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMontado(true)
    try {
      const v = sessionStorage.getItem(CLAVE)
      if (v) setEstado({ ...(JSON.parse(v) as Estado), minimizada: true })
    } catch {}
  }, [])
  useEffect(() => {
    if (!montado) return
    try {
      if (estado?.minimizada) sessionStorage.setItem(CLAVE, JSON.stringify(estado))
      else sessionStorage.removeItem(CLAVE)
    } catch {}
  }, [estado, montado])

  const abrir = useCallback((id: string, recorrido?: string[]) => {
    setEstado(prev => ({
      id,
      recorrido: recorrido ?? (prev?.id === id ? prev.recorrido : SIN_RECORRIDO),
      minimizada: false,
      ...datosDe(info.current, id, prev),
    }))
  }, [])

  const minimizar = useCallback(() => {
    setEstado(prev => prev && { ...prev, minimizada: true, ...datosDe(info.current, prev.id, prev) })
  }, [])

  const descartar = useCallback(() => setEstado(null), [])

  // Cerrar no pierde una conversión: si la receta quedó escalada, pasa a
  // segundo plano. Sin conversión, se cierra del todo.
  const cerrar = useCallback(() => {
    setEstado(prev => {
      if (!prev) return null
      const escala = leerEscala(prev.id)
      if (escala && escala.factor !== 1) return { ...prev, minimizada: true, ...datosDe(info.current, prev.id, prev) }
      return null
    })
  }, [])

  const irA = useCallback((id: string) => {
    setEstado(prev => prev && { ...prev, id, nombre: null, detalle: null })
  }, [])

  const informar = useCallback<RecetaVisorApi['informar']>((i) => { info.current = i }, [])

  const dejarEnSegundoPlano = useCallback((id: string) => {
    setEstado(prev => {
      if (prev && !prev.minimizada) return prev   // hay otra abierta: manda esa
      return { id, recorrido: SIN_RECORRIDO, minimizada: true, ...datosDe(info.current, id, prev) }
    })
  }, [])

  const api = useMemo<RecetaVisorApi>(() => ({ abrir, informar, dejarEnSegundoPlano }), [abrir, informar, dejarEnSegundoPlano])

  const abierta = !!estado && !estado.minimizada
  useSheetOpenWhen(abierta)   // oculta el FAB del Coach, como cualquier sheet

  // Refs para los listeners (no se reinstalan con cada cambio de estado).
  const cerrarRef = useRef(cerrar)
  const estadoRef = useRef(estado)
  const sheetCountRef = useRef(sheetCount)
  useEffect(() => { cerrarRef.current = cerrar; estadoRef.current = estado; sheetCountRef.current = sheetCount })

  // ── "Atrás" del navegador/celular cierra la receta, no cambia de pantalla ──
  // Al abrir se apila una entrada de historial con la misma URL; al cerrar a
  // mano se la quita. El `back()` va diferido y se cancela si el efecto vuelve
  // a correr enseguida (modo estricto en dev): si no, el cierre de la primera
  // pasada se comía la entrada de la segunda y la receta se cerraba sola.
  const backPendiente = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!abierta) return
    if (backPendiente.current) { clearTimeout(backPendiente.current); backPendiente.current = null }
    else if (!window.history.state?.kcVisor) window.history.pushState({ kcVisor: true }, '')
    const alVolver = () => cerrarRef.current()
    window.addEventListener('popstate', alVolver)
    return () => {
      window.removeEventListener('popstate', alVolver)
      backPendiente.current = setTimeout(() => {
        backPendiente.current = null
        if (window.history.state?.kcVisor) window.history.back()
      }, 0)
    }
  }, [abierta])

  // ── Teclado: Esc cierra, ← → pasan de receta ──
  // En captura y cortando la propagación: los atajos de la pantalla de abajo
  // (N y / del Recetario, flechas del Calendario, pinceles de Turnos) no
  // tienen que correr con una receta encima. Con otro sheet abierto arriba
  // del visor (editar ingrediente, OPS) no se mete: ese sheet manda.
  useEffect(() => {
    if (!abierta) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (sheetCountRef.current > 1) return
      const est = estadoRef.current
      if (e.key === 'Escape') cerrarRef.current()
      else if (est && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const pos = est.recorrido.indexOf(est.id)
        const destino = pos < 0 ? undefined : est.recorrido[pos + (e.key === 'ArrowLeft' ? -1 : 1)]
        if (destino) irA(destino)
        e.preventDefault()
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [abierta, irA])

  const fichaVisor = useMemo<FichaEnVisor>(() => ({
    recorrido: estado?.recorrido ?? SIN_RECORRIDO,
    onCerrar: cerrar, onMinimizar: minimizar, onDescartar: descartar, onIrA: irA,
  }), [estado?.recorrido, cerrar, minimizar, descartar, irA])

  // El botón flotante no compite con un sheet abierto ni con la propia ficha
  // de esa receta abierta como página.
  const flotante = !!estado && estado.minimizada && sheetCount === 0 && pathname !== `/recetario/${estado.id}`

  return (
    <RecetaVisorContext.Provider value={api}>
      {children}
      {montado && createPortal(
        <>
            {abierta && estado && (
              <div
                role="dialog" aria-modal="true" aria-label="Receta"
                style={{
                  position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: isDesktop ? 24 : 0,
                }}
              >
                {/* El blur va en un hermano, no en un ancestro de la ficha:
                    `backdrop-filter` (igual que `transform`) convierte al
                    elemento en bloque contenedor de los `position:fixed` de
                    adentro, y los sheets de la ficha quedarían encogidos al
                    tamaño de la tarjeta. Por lo mismo la tarjeta solo anima
                    opacidad. */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : DURATION.base }}
                  onClick={cerrar}
                  style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
                />
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : DURATION.base }}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden',
                    width: isDesktop ? 'min(1180px, 100%)' : '100%', height: '100%', maxHeight: isDesktop ? 940 : undefined,
                    borderRadius: isDesktop ? 16 : 0,
                    boxShadow: isDesktop ? '0 20px 60px rgba(0,0,0,.35)' : 'none',
                  }}
                >
                  <RecetaFicha key={estado.id} id={estado.id} visor={fichaVisor} />
                </motion.div>
              </div>
            )}
          {flotante && estado && (
            <RecetaFlotante
              nombre={estado.nombre}
              detalle={estado.detalle}
              onAbrir={() => abrir(estado.id)}
              onQuitar={descartar}
            />
          )}
        </>,
        document.body,
      )}
    </RecetaVisorContext.Provider>
  )
}

// Botón flotante de la receta en segundo plano. Abajo a la izquierda del
// área de contenido: el Coach flota a la derecha y los toasts van al centro.
// La posición sale del `<main>` real — con la sidebar plegable y el dock del
// Coach, "a la izquierda del viewport" caería encima de la navegación.
function RecetaFlotante({ nombre, detalle, onAbrir, onQuitar }: {
  nombre: string | null
  detalle: string | null
  onAbrir: () => void
  onQuitar: () => void
}) {
  // En desktop sube un poco: varias pantallas tienen una barra de acciones
  // pegada al borde de abajo (el "+ Producto" de Stock) y quedaba tapada.
  const isDesktop = useIsDesktop()
  const [izquierda, setIzquierda] = useState(16)
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const medir = () => setIzquierda(Math.max(0, Math.round(main.getBoundingClientRect().left)) + 16)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(main)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [])

  const unaLinea: React.CSSProperties = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <div
      className="toast-enter"
      style={{
        position: 'fixed', left: izquierda, bottom: isDesktop ? 'calc(var(--fab-bottom) + 36px)' : 'var(--fab-bottom)', zIndex: 90,
        display: 'flex', alignItems: 'stretch', maxWidth: 'min(330px, calc(100vw - 104px))',
        background: 'var(--navy)', color: '#fff', borderRadius: 99, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.14)', boxShadow: 'var(--shadow-3)',
      }}
    >
      <button
        type="button" onClick={onAbrir} title="Volver a la receta" aria-label={`Volver a la receta ${nombre ?? ''}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, minHeight: 48, padding: '6px 4px 6px 14px',
          background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 21, flexShrink: 0 }}>menu_book</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ ...unaLinea, fontSize: 12.5, fontWeight: 700 }}>{nombre ?? 'Receta'}</span>
          {detalle && <span style={{ ...unaLinea, fontSize: 11.5, color: 'rgba(255,255,255,.72)', fontVariantNumeric: 'tabular-nums' }}>{detalle}</span>}
        </span>
      </button>
      <button
        type="button" onClick={onQuitar} title="Quitar" aria-label="Quitar la receta del segundo plano"
        style={{
          width: 42, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          background: 'none', border: 'none', borderLeft: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.75)', cursor: 'pointer',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  )
}
