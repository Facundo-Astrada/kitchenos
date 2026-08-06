'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSheetOpenWhen } from '@/lib/ui/chrome'

// ══════════════════════════════════════════════════════════════
// RECORRIDO GUIADO DEL MISE — la misma información que la guía
// (MiseGuiaSheet) pero señalada sobre la pantalla real: fondo
// oscurecido, el control iluminado y una viñeta que lo explica.
//
// No reusa el TourOverlay del Coach a propósito: este necesita dos
// cosas que aquel no tiene y que no valía la pena meterle a un
// recorrido que ya funciona — scrollear el control al centro antes
// de medirlo (los controles del mise viven dentro de la lista, casi
// siempre fuera de la vista) y cambiar la fase apertura/cierre para
// poder mostrar la tarjeta de cierre. El look es idéntico.
// ══════════════════════════════════════════════════════════════

export interface MisePaso {
  /** data-coach-target del control. null = tarjeta centrada (intro/cierre). */
  target: string | null
  titulo: string
  texto: string
  /** Fase que hay que estar viendo para que el control exista. */
  fase?: 'apertura' | 'cierre'
  /**
   * El control solo existe bajo cierta condición del turno (ej. la barra de
   * entrega, que aparece con el cierre completo). Si no está, se saltea rápido
   * en vez de dejar el "Buscando…" el segundo y medio que espera un control
   * que debería estar ahí.
   */
  opcional?: boolean
}

// El orden sigue el de la guía escrita: primero el header, después la
// tarjeta de un ítem de apertura, y al final la tarjeta de cierre.
export const MISE_PASOS: MisePaso[] = [
  {
    target: null,
    titulo: 'Te muestro el Mise en pantalla',
    texto: 'Voy a ir señalando cada control de esta plaza y qué hace. Tocá en cualquier lado para avanzar, o "Saltar" para salir cuando quieras.',
  },
  {
    target: 'mise-turno',
    fase: 'apertura',
    titulo: 'Almuerzo / Cena',
    texto: 'Cada turno de servicio tiene su propia lista y sus propios números: lo que tildás o contás en Almuerzo no se mezcla con Cena. Se elige solo por hora y podés cambiarlo a mano. El cierre de Almuerzo es la referencia de la apertura de Cena.',
  },
  {
    target: 'mise-fases',
    fase: 'apertura',
    titulo: 'Apertura · Cierre · Rutina',
    texto: 'Apertura: contás lo que hay y mandás a producir lo que falta. Cierre: anotás cuánto quedó (no cuánto usaste). Rutina: las tareas recurrentes de la plaza, cada una el día que le toca. Si nadie cierra, el que abre mañana arranca a ciegas.',
  },
  {
    target: 'mise-progreso',
    fase: 'apertura',
    titulo: 'El avance de la plaza',
    texto: 'Cuánto llevás resuelto de toda la plaza en este turno y esta fase. En apertura cuenta lo revisado: los tildados en verde y también los que quedaron en ámbar con la producción ya despachada. Cada sección lleva además su propio contador.',
  },
  {
    target: 'mise-modo-control',
    fase: 'apertura',
    titulo: 'Modo Control',
    texto: 'Deja cada ítem en una sola línea — nombre, cantidad estándar y el tilde. Para recorrer la plaza rápido marcando lo que ya está, sin cargar números. Queda activado hasta que lo apagues.',
  },
  {
    target: 'mise-secciones-cfg',
    fase: 'apertura',
    titulo: 'Editar secciones',
    texto: 'Crear, renombrar, reordenar o borrar las secciones de esta plaza (Heladera, Secos, Estación…). Los ítems se arrastran entre secciones con un toque largo.',
  },
  {
    target: 'mise-item-check',
    fase: 'apertura',
    titulo: 'Tildar un ítem',
    texto: 'Tildás cuando ese ítem ya está como tiene que estar: hay la cantidad pedida o ya lo produjiste. No es "lo miré", es "está". Si lo tildás a mano cuando figuraba faltante, el recipiente queda completo — tildar es afirmar que está. Si tenía una tarea en Producción, tildarlo acá la cierra allá al instante, y al revés.',
  },
  {
    target: 'mise-item-check',
    fase: 'apertura',
    titulo: 'Ámbar: está en producción',
    texto: 'Cuando despachás la producción de un ítem, el círculo se pone ámbar y la tarjeta dice "en producción". Verde es "está en su lugar", ámbar es "está en el horno". Ya suma al avance —la apertura mide lo revisado, no lo cocinado— y pasa a verde solo cuando la tarea se completa en Producción.',
  },
  {
    target: 'mise-item-peso',
    fase: 'apertura',
    titulo: 'Peso por porción',
    texto: 'Lo que pesa una porción según la ficha de la receta. Es la traducción entre porciones y balanza: 15 porciones × 88 g = 1.32 kg. Si no aparece, esa receta todavía no tiene el peso por porción cargado.',
  },
  {
    target: 'mise-item-recipiente',
    fase: 'apertura',
    titulo: 'El recipiente y el objetivo',
    texto: 'En qué se guarda y cuánto tiene que haber. Un "×3" significa tres recipientes iguales. El "→ N porc" es el objetivo del turno: lo que debería quedar cargado entre todos. El badge verde es ese objetivo pasado a peso.',
  },
  {
    target: 'mise-item-hayahora',
    fase: 'apertura',
    titulo: 'Hay ahora',
    texto: 'El único número que cargás en apertura: contás lo que hay y lo escribís. Viene precargado con lo que dejó el cierre anterior, y al tocarlo queda seleccionado — escribís encima sin borrar. Si llega al objetivo, el ítem se tilda solo; si falta, aparece el botón rojo de producir.',
  },
  {
    target: 'mise-item-hayahora',
    fase: 'apertura',
    titulo: 'Enter: guardar y seguir',
    texto: 'Enter guarda el número y salta al siguiente ítem, con su campo abierto y la tarjeta centrada arriba del teclado. La vuelta se hace de corrido: contás, Enter, contás, Enter — sin bajar el teclado ni buscar la próxima tarjeta.',
  },
  {
    target: 'mise-item-producir',
    fase: 'apertura',
    titulo: 'Producir lo que falta',
    texto: 'Aparece solo cuando hay déficit y ya trae la cuenta hecha: objetivo − lo que hay + lo que el salón ya pidió hoy. Un tap crea la tarea en Producción con la cantidad exacta, prioridad alta y para hoy. El ítem queda en ámbar y el foco salta al siguiente, igual que con Enter.',
  },
  {
    target: 'mise-item-tarea',
    fase: 'apertura',
    titulo: 'Mandar a Producción a mano',
    texto: 'Abre el panel para elegir cantidad, prioridad y si es para hoy o para mañana. Gris: todavía no hay tarea de ese ítem hoy. Verde: ya hay una abierta en Producción. Si elegís "mañana", queda como pase de turno.',
  },
  {
    target: 'mise-item-cierre',
    fase: 'cierre',
    titulo: 'En Cierre se registra, no se produce',
    texto: 'La tarjeta cambia: escribís cuánto quedó de cada ítem. Los cinco puntitos son el semáforo contra el objetivo. Se cuenta igual de rápido que la apertura: el número anterior queda seleccionado al tocar el campo, escribirlo tilda el ítem solo (contar ES la acción del cierre) y Enter salta al siguiente. Ese número entra tal cual en "Hay ahora" de la próxima apertura — un cierre bien contado le ahorra media hora al turno que entra.',
  },
  {
    target: 'mise-item-producir-manana',
    fase: 'cierre',
    // Solo aparece cuando lo contado no llegó al objetivo.
    opcional: true,
    titulo: 'Lo que faltó, para mañana',
    texto: 'Si lo que contaste no llega al objetivo aparece este botón. Es el espejo del botón rojo de la apertura, pero mirando al turno siguiente: un toque y la tarea queda cargada en Producción con fecha de mañana. El que abre mañana ya se la encuentra, sin depender de que alguien se haya acordado de anotarla.',
  },
  {
    target: 'mise-entregar',
    fase: 'cierre',
    // Solo existe con el cierre 100% completo — en plena vuelta no está.
    opcional: true,
    titulo: 'Entregar la plaza',
    texto: 'Con el cierre completo aparece esta barra abajo. "Entregar plaza" es lo que pasa el turno: el mise queda parado en el turno siguiente con tus números como referencia, y se registra quién entregó y a qué hora. Lo dispara la entrega, no el reloj.',
  },
  {
    target: null,
    titulo: 'Eso es todo',
    texto: 'Entregar la plaza no es fichar tu salida: entregás primero y recién ahí la barra ofrece "Marcar salida", si tenías fichaje abierto. El "?" del header te deja esta explicación siempre a mano, en texto o en pantalla.',
  },
]

const NARANJA = '#f97316'

type Fase = 'apertura' | 'cierre' | 'rutina'

export function MiseTourOverlay({ faseActual, onSetFase, onFinish }: {
  faseActual: Fase
  onSetFase: (f: Fase) => void
  onFinish: () => void
}) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const paso = MISE_PASOS[i]
  useSheetOpenWhen(true)

  // Fase con la que el usuario venía — se restaura al terminar o saltar,
  // para no dejarlo parado en un tab que él no eligió.
  const faseOriginal = useRef(faseActual)
  const onSetFaseRef = useRef(onSetFase)
  useEffect(() => { onSetFaseRef.current = onSetFase })

  const terminar = useCallback(() => {
    onSetFaseRef.current(faseOriginal.current)
    onFinish()
  }, [onFinish])

  const siguiente = useCallback(() => {
    setI(prev => {
      if (prev >= MISE_PASOS.length - 1) { terminar(); return prev }
      return prev + 1
    })
  }, [terminar])

  const siguienteRef = useRef(siguiente)
  useEffect(() => { siguienteRef.current = siguiente })

  // ── Ubicar el control del paso actual ────────────────────────
  // Cambia de fase si hace falta, scrollea el control al centro (viven
  // dentro de la lista, casi siempre fuera de la vista) y recién ahí mide.
  // Si el control no existe en esta plaza (ej. ningún ítem con recipiente,
  // o un solo turno de servicio configurado), saltea el paso solo.
  useEffect(() => {
    if (!paso || !paso.target) { setRect(null); return }
    const cambiaFase = !!paso.fase && paso.fase !== faseActual
    if (cambiaFase) onSetFaseRef.current(paso.fase!)

    setRect(null)
    let cancelado = false
    let intentos = 0
    // Cambiar de fase dispara un fetch del mise: la lista queda en "Cargando…"
    // y los controles no existen todavía. Con una ventana corta el paso de
    // cierre se salteaba solo aunque el ítem estuviera bien. ~3s de margen.
    const MAX = cambiaFase ? 24 : paso.opcional ? 4 : 10

    function buscar() {
      if (cancelado) return
      const el = document.querySelector(`[data-coach-target="${paso.target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          const vh = window.innerHeight
          const fuera = r.top < 90 || r.bottom > vh - 120
          if (fuera) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
            setTimeout(() => { if (!cancelado) setRect(el.getBoundingClientRect()) }, 420)
          } else {
            setRect(r)
          }
          return
        }
      }
      intentos++
      if (intentos < MAX) setTimeout(buscar, 130)
      else siguienteRef.current()
    }

    const delay = cambiaFase ? 420 : 90
    const timer = setTimeout(buscar, delay)
    return () => { cancelado = true; clearTimeout(timer) }
    // faseActual a propósito fuera de deps: el cambio de fase lo dispara este
    // mismo efecto y re-entrar al re-renderizar reiniciaría la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // Re-medir si algo se mueve debajo del overlay (scroll de la lista, resize).
  useEffect(() => {
    if (!paso?.target) return
    function remedir() {
      const el = document.querySelector(`[data-coach-target="${paso.target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) setRect(r)
      }
    }
    window.addEventListener('scroll', remedir, true)
    window.addEventListener('resize', remedir)
    return () => {
      window.removeEventListener('scroll', remedir, true)
      window.removeEventListener('resize', remedir)
    }
  }, [paso?.target])

  // Escape sale del recorrido
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') terminar()
      if (e.key === 'ArrowRight' || e.key === 'Enter') siguienteRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [terminar])

  if (!paso) return null

  // Portal a body: dentro del árbol de la app el overlay quedaba por debajo del
  // panel lateral del Coach en desktop (el dock seguía a pleno brillo mientras
  // todo lo demás se oscurecía). Colgado del body no depende de ningún
  // stacking context de la pantalla.
  const portal = (n: React.ReactNode) =>
    typeof document !== 'undefined' ? createPortal(n, document.body) : null

  const esUltimo = i === MISE_PASOS.length - 1
  const pasosConTarget = MISE_PASOS.filter(p => p.target !== null).length
  const pasoActual = MISE_PASOS.slice(0, i).filter(p => p.target !== null).length + 1

  // ── Tarjeta centrada (intro / cierre del recorrido) ──────────
  if (!paso.target) {
    const avanzar = esUltimo ? terminar : siguiente
    return portal(
      <div
        onClick={avanzar}
        style={{
          position: 'fixed', inset: 0, zIndex: 2100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, background: 'rgba(0,0,0,.65)',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface)', borderRadius: 22, padding: '30px 24px 22px',
            textAlign: 'center', maxWidth: 330, width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,.45)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 50, color: NARANJA }}>
            {esUltimo ? 'celebration' : 'ads_click'}
          </span>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', margin: '12px 0 10px' }}>
            {paso.titulo}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 20 }}>
            {paso.texto}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!esUltimo && (
              <button
                onClick={terminar}
                style={{
                  flexShrink: 0, padding: '13px 16px', borderRadius: 12,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  fontSize: 14, fontWeight: 700, color: 'var(--text-3)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Saltar
              </button>
            )}
            <button
              onClick={avanzar}
              style={{
                flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                background: NARANJA, fontSize: 14, fontWeight: 700, color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {esUltimo ? 'Entendido' : 'Empezar →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Mientras busca/scrollea el control, el fondo ya se oscurece para que
  // no parpadee la pantalla entre paso y paso.
  // Mientras busca el control (puede haber un cambio de fase con recarga de por
  // medio) el fondo ya se oscurece, con un aviso para que no parezca colgado.
  if (!rect) {
    return portal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999,
          background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 12.5, fontWeight: 600,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 17, color: NARANJA }}>ads_click</span>
          Buscando “{paso.titulo}”…
        </div>
      </div>
    )
  }

  const PAD = 10
  const x = rect.left - PAD
  const y = rect.top - PAD
  const w = rect.width + PAD * 2
  const h = rect.height + PAD * 2
  const R = 14

  const vw = window.innerWidth
  const vh = window.innerHeight

  const CARD_H = 210
  const espacioAbajo = vh - (y + h) - 16
  const cardArriba = espacioAbajo < CARD_H
  const cardTop = cardArriba ? Math.max(8, y - 14 - CARD_H) : y + h + 12
  const cardWidth = Math.min(320, vw - 32)
  const cardLeft = Math.max(16, Math.min(x, vw - cardWidth - 16))
  const flechaOffset = Math.min(cardWidth - 28, Math.max(12, x + w / 2 - cardLeft - 8))

  return portal(
    <div onClick={siguiente} style={{ position: 'fixed', inset: 0, zIndex: 2100, cursor: 'pointer' }}>
      {/* Fondo oscurecido con el control recortado */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <mask id="mise-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={R} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,.72)" mask="url(#mise-tour-mask)" />
        <rect
          x={x} y={y} width={w} height={h} rx={R}
          fill="none" stroke={NARANJA} strokeWidth="2.5"
          style={{ filter: `drop-shadow(0 0 12px ${NARANJA}d9)` }}
        />
      </svg>

      {/* Viñeta */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: cardTop, left: cardLeft, width: cardWidth,
          background: 'var(--surface)', borderRadius: 16, padding: '14px 16px 13px',
          boxShadow: '0 8px 36px rgba(0,0,0,.32)', border: `1px solid ${NARANJA}55`,
        }}
      >
        <div style={{
          position: 'absolute', left: flechaOffset, width: 0, height: 0,
          borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          ...(cardArriba
            ? { bottom: -8, borderTop: '8px solid var(--surface)' }
            : { top: -8, borderBottom: '8px solid var(--surface)' }),
        }} />

        <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: NARANJA,
            width: `${(pasoActual / pasosConTarget) * 100}%`, transition: 'width .35s ease',
          }} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: NARANJA, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
          {pasoActual} de {pasosConTarget}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 7, lineHeight: 1.2 }}>
          {paso.titulo}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 13 }}>
          {paso.texto}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={terminar}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Saltar
          </button>
          <button
            onClick={siguiente}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', background: NARANJA,
              fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
