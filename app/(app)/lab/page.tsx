'use client'

// ════════════════════════════════════════════════════════════════════════════
// /lab — LABORATORIO VISUAL. No es una pantalla de producto.
//
// Prueba encargada en sep 2026: "la app debe sentirse como un videojuego —
// ágil, con animaciones, sombras, luces; colores, transiciones, y remarcar
// palabras clave". Eso choca de frente con DESIGN.md §4 (una sola familia
// tipográfica) y §10 (prohibido neón/glassmorphism, sombras y duraciones
// fuera de token). Por eso vive acá y no en el mise real: la constitución se
// cambia discutiéndola (§11), no esquivándola en un componente.
//
// Qué se prueba: la MISMA pantalla (apertura de una plaza) en dos registros,
// con un toggle. "Calma" = K-OS de hoy. "Arcade" = el experimento. Sin la
// comparación lado a lado la prueba no decide nada.
//
// Orden de Swink (game feel = control en tiempo real + espacio predecible +
// juice, en ese orden): el juice amplifica lo que ya funciona, no lo rescata.
// Por eso el feedback de presión (scale al apretar, 120ms) está incluso en
// Calma, y lo que cambia entre modos es la capa de arriba.
//
// Datos hardcodeados a propósito: la prueba es visual, no tiene que depender
// de que la cuenta tenga mise cargado.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useReducedMotion, tap } from '@/lib/ui/motion'

// ── Paleta del experimento ──────────────────────────────────────────────────
// La luz tiene una fuente y es la del oficio: la brasa. Elegido contra el
// neón cian/violeta de todo dashboard "gamer" — ahí la app dejaría de ser
// K-OS y pasaría a ser una plantilla. Acá el tablero se calienta.
const EMBER = '#ff7a2f'
const EMBER_HOT = '#ffb02e'
const WHITE_HOT = '#fff0d2'
const DONE = '#34d399'
const HUD_BG = '#080d16'

type MiseItem = {
  id: number
  // El texto se guarda partido, no como una frase — así el resaltado de
  // palabras clave es estructura y no una adivinanza con regex.
  verbo: string
  cantidad: string
  que: string
  detalle?: string
}

const ITEMS: MiseItem[] = [
  { id: 1, verbo: 'Cortar', cantidad: '4 kg', que: 'Vacío', detalle: 'porciones de 250 g' },
  { id: 2, verbo: 'Encender', cantidad: '2 cajones', que: 'Carbón', detalle: 'brasa lista 11:30' },
  { id: 3, verbo: 'Armar', cantidad: '40 u', que: 'Chorizos', detalle: 'atados de a 4' },
  { id: 4, verbo: 'Salar', cantidad: '6 kg', que: 'Asado de tira', detalle: 'sal gruesa, 30 min antes' },
  { id: 5, verbo: 'Preparar', cantidad: '3 L', que: 'Chimichurri', detalle: 'receta de la casa' },
  { id: 6, verbo: 'Reponer', cantidad: '12 u', que: 'Provoletas', detalle: 'heladera de pase' },
  { id: 7, verbo: 'Limpiar', cantidad: '1', que: 'Parrilla', detalle: 'cepillo + grasa' },
  { id: 8, verbo: 'Controlar', cantidad: '4 °C', que: 'Heladera', detalle: 'planilla HACCP' },
]

// ── Contador que sube en vez de saltar ──────────────────────────────────────
// Un número que aparece de golpe no se lee como logro; uno que sube sí. Es el
// caso más barato de "juice" y el más citado (barras de vida, XP).
function useCountUp(target: number, ms: number, enabled: boolean): number {
  const [v, setV] = useState(target)
  const vRef = useRef(target)
  useEffect(() => {
    // Con la animación apagada el valor sale derecho de `target` en el return
    // de abajo — acá solo se sincroniza la ref para que el próximo tween
    // arranque del número correcto.
    if (!enabled) { vRef.current = target; return }
    const from = vRef.current
    if (from === target) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cúbico: arranca rápido, frena
      const next = from + (target - from) * eased
      vRef.current = next
      setV(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, enabled])
  return enabled ? v : target
}

export default function LabPage() {
  const isDesktop = useIsDesktop()
  const reduced = useReducedMotion()
  const [arcade, setArcade] = useState(true)
  const [hechos, setHechos] = useState<Set<number>>(new Set())
  // Racha: cuántos se tildaron seguidos sin pausa. Es el único marcador de
  // "rendimiento" admisible según DESIGN.md §9 — mide el turno, no a la
  // persona, y no se compara contra nadie.
  const [racha, setRacha] = useState(0)
  const [burst, setBurst] = useState(0)
  const rachaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = ITEMS.length
  const listos = hechos.size
  const pct = Math.round((listos / total) * 100)
  const pctAnim = useCountUp(pct, 520, arcade && !reduced)
  const completo = listos === total

  useEffect(() => () => { if (rachaTimer.current) clearTimeout(rachaTimer.current) }, [])

  const toggle = useCallback((id: number) => {
    setHechos(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      tap(12)
      if (next.size === total) setBurst(b => b + 1)
      return next
    })
    setRacha(r => {
      if (hechos.has(id)) return 0
      return r + 1
    })
    if (rachaTimer.current) clearTimeout(rachaTimer.current)
    rachaTimer.current = setTimeout(() => setRacha(0), 4000)
  }, [hechos, total])

  function reset() {
    setHechos(new Set()); setRacha(0); setBurst(0)
  }

  // Calor: de brasa naranja a blanco incandescente a medida que se completa.
  const calor = pct / 100
  const colorCalor = completo ? WHITE_HOT : calor > .6 ? EMBER_HOT : EMBER

  const fondo = arcade
    ? `radial-gradient(120% 80% at 50% 110%, rgba(255,122,47,${.05 + calor * .22}) 0%, rgba(8,13,22,0) 60%), ${HUD_BG}`
    : 'var(--bg)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: fondo, transition: 'background 600ms ease' }}>
      {/* Segunda familia tipográfica — SOLO en esta ruta. Archivo en su eje de
          ancho variable (wdth) da el número ancho y pesado de marcador de
          cancha, que es de donde sale la sensación de "tablero" mucho más que
          el color. React 19 lo iza al <head> solo. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- a propósito:
          la segunda familia NO debe entrar en el layout raíz. Se carga solo en
          esta ruta para que el experimento no le agregue una fuente a las otras
          28 pantallas. Si el experimento se aprueba, recién ahí sube al layout. */}
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet" />
      <style>{`
        .lab-display { font-family: 'Archivo', 'DM Sans', sans-serif; font-stretch: 125%; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: no-preference) {
          /* Reflejo especular que barre la barra de calor — la "luz" no es un
             glow estático: se mueve, y por eso se lee como brasa viva. */
          @keyframes lab-sheen { 0% { transform: translateX(-120%); } 55%, 100% { transform: translateX(320%); } }
          .lab-sheen { animation: lab-sheen 2.6s cubic-bezier(.4,0,.2,1) infinite; }
          @keyframes lab-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
          .lab-breathe { animation: lab-breathe 2.2s ease-in-out infinite; }
        }
      `}</style>

      {/* ── HUD ──────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: isDesktop ? '20px 24px 18px' : '46px 16px 14px',
        background: arcade ? 'transparent' : 'var(--navy)',
        borderBottom: arcade ? '1px solid rgba(255,255,255,.07)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={arcade ? 'lab-display' : undefined} style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase',
              color: arcade ? colorCalor : 'rgba(255,255,255,.55)', marginBottom: 4,
            }}>
              Apertura · Turno noche
            </div>
            <div className={arcade ? 'lab-display' : undefined} style={{
              fontSize: isDesktop ? 34 : 26, fontWeight: 900, lineHeight: 1,
              color: '#fff',
              textShadow: arcade ? `0 0 26px rgba(255,122,47,${.25 + calor * .5})` : 'none',
            }}>
              PARRILLA
            </div>
          </div>

          {/* Marcador — el número grande es el que hace de "tablero". */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className={arcade ? 'lab-display' : undefined} style={{
              fontSize: isDesktop ? 56 : 42, fontWeight: 900, lineHeight: .9,
              color: arcade ? colorCalor : '#fff',
              textShadow: arcade ? `0 0 30px ${colorCalor}66` : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Math.round(pctAnim)}<span style={{ fontSize: isDesktop ? 24 : 18, opacity: .5 }}>%</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: arcade ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.6)', marginTop: 2 }}>
              {listos} de {total} listos
            </div>
          </div>
        </div>

        {/* ── Barra de calor ── */}
        <div style={{
          position: 'relative', height: arcade ? 14 : 8, borderRadius: 99, overflow: 'hidden',
          background: arcade ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.18)',
          boxShadow: arcade ? `inset 0 1px 3px rgba(0,0,0,.6)` : 'none',
        }}>
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={reduced ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 180 }}
            style={{
              position: 'absolute', inset: 0, right: 'auto', borderRadius: 99,
              background: arcade
                ? `linear-gradient(90deg, #c2410c 0%, ${EMBER} 45%, ${completo ? WHITE_HOT : EMBER_HOT} 100%)`
                : '#22c55e',
              boxShadow: arcade ? `0 0 ${10 + calor * 26}px ${colorCalor}, 0 0 4px ${WHITE_HOT}` : 'none',
            }}>
            {arcade && pct > 6 && (
              <div className="lab-sheen" style={{
                position: 'absolute', top: 0, bottom: 0, width: 46,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)',
              }} />
            )}
          </motion.div>
        </div>

        {/* ── Racha ── */}
        <div style={{ height: 26, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AnimatePresence>
            {arcade && racha >= 2 && (
              <motion.div
                key={racha}
                initial={reduced ? false : { scale: .5, opacity: 0, y: 6 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: .8 }}
                transition={{ type: 'spring', damping: 12, stiffness: 520 }}
                className="lab-display"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 11px', borderRadius: 99,
                  background: `linear-gradient(135deg, ${EMBER}, #c2410c)`,
                  color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '.04em',
                  boxShadow: `0 0 20px ${EMBER}88, 0 3px 10px rgba(0,0,0,.5)`,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>local_fire_department</span>
                RACHA ×{racha}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isDesktop ? '18px 24px 120px' : '12px 14px 120px' }}>
        <div style={{
          display: 'grid', gap: isDesktop ? 12 : 9,
          gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(330px, 1fr))' : '1fr',
          maxWidth: 1400, margin: '0 auto',
        }}>
          {ITEMS.map(it => (
            <ItemCard key={it.id} item={it} hecho={hechos.has(it.id)} arcade={arcade} reduced={reduced} onToggle={() => toggle(it.id)} />
          ))}
        </div>
      </div>

      {/* ── Estallido de brasas al cerrar la plaza ───────────────────────── */}
      <AnimatePresence>
        {arcade && completo && !reduced && (
          <div key={burst} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60, display: 'grid', placeItems: 'center' }}>
            {Array.from({ length: 18 }).map((_, i) => {
              const ang = (i / 18) * Math.PI * 2
              const dist = 90 + (i % 4) * 55
              return (
                <motion.span key={i}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist - 40, opacity: 0, scale: .2 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    gridArea: '1/1', width: 9, height: 9, borderRadius: 99,
                    background: i % 3 === 0 ? WHITE_HOT : EMBER_HOT,
                    boxShadow: `0 0 14px ${EMBER_HOT}`,
                  }} />
              )
            })}
          </div>
        )}
      </AnimatePresence>

      {/* ── Banda de plaza cerrada ───────────────────────────────────────── */}
      <AnimatePresence>
        {completo && (
          <motion.div
            initial={reduced ? false : { y: 70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 70, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: isDesktop ? 0 : 68, zIndex: 55,
              padding: isDesktop ? '14px 24px' : '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              background: arcade ? `linear-gradient(90deg, #7c2d12, ${EMBER})` : '#16a34a',
              boxShadow: arcade ? `0 -6px 34px ${EMBER}55` : '0 -4px 14px rgba(0,0,0,.18)',
            }}>
            <span className={arcade ? 'material-symbols-outlined lab-breathe' : 'material-symbols-outlined'} style={{ color: '#fff', fontSize: 22 }}>
              {arcade ? 'local_fire_department' : 'check_circle'}
            </span>
            <span className={arcade ? 'lab-display' : undefined} style={{ flex: 1, color: '#fff', fontSize: arcade ? 17 : 14, fontWeight: arcade ? 900 : 700, letterSpacing: arcade ? '.06em' : 0 }}>
              {arcade ? 'PARRILLA AL PUNTO' : 'Apertura completa'}
            </span>
            <button onClick={reset} style={{
              background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: '7px 14px',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Reiniciar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggle del experimento ───────────────────────────────────────── */}
      <div style={{
        // Abajo a la derecha en los dos tamaños: arriba chocaba con el
        // marcador, que es lo único que no se puede tapar en un tablero.
        position: 'fixed', bottom: isDesktop ? 24 : 82, right: isDesktop ? 24 : 14, zIndex: 70,
        display: 'flex', gap: 4, padding: 4, borderRadius: 99,
        background: arcade ? 'rgba(255,255,255,.08)' : 'var(--surface)',
        border: `1px solid ${arcade ? 'rgba(255,255,255,.14)' : 'var(--border)'}`,
        boxShadow: '0 6px 22px rgba(0,0,0,.35)',
      }}>
        {([['Calma', false], ['Arcade', true]] as const).map(([label, val]) => (
          <button key={label} onClick={() => setArcade(val)} style={{
            padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700,
            background: arcade === val ? (val ? EMBER : 'var(--navy)') : 'transparent',
            color: arcade === val ? '#fff' : (arcade ? 'rgba(255,255,255,.6)' : 'var(--text-3)'),
          }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Una fila del mise ───────────────────────────────────────────────────────
function ItemCard({ item, hecho, arcade, reduced, onToggle }: {
  item: MiseItem; hecho: boolean; arcade: boolean; reduced: boolean; onToggle: () => void
}) {
  // Destello de brasa al tildar. Se dispara en el click, no en un efecto que
  // observe `hecho`: es respuesta a la interacción, no sincronización de
  // estado. Vive en la fila (no en un overlay global) para que la luz salga
  // del objeto que cambió — DESIGN.md §5, "el estado vive en el objeto".
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  function handleClick() {
    if (!hecho && arcade && !reduced) {
      setFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(false), 520)
    }
    onToggle()
  }

  const acento = hecho ? DONE : EMBER

  return (
    <motion.div
      onClick={handleClick}
      // Control en tiempo real antes que juice (Swink): el hundido al apretar
      // va en los DOS modos — es respuesta, no adorno.
      whileTap={reduced ? undefined : { scale: .975 }}
      animate={hecho && arcade && !reduced ? { scale: [1, 1.025, 1] } : { scale: 1 }}
      transition={{ duration: .34, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: arcade ? '13px 14px' : '12px 14px',
        borderRadius: arcade ? 14 : 12,
        background: arcade
          ? (hecho ? 'rgba(52,211,153,.07)' : 'rgba(255,255,255,.045)')
          : 'var(--surface)',
        border: `1px solid ${arcade ? (hecho ? 'rgba(52,211,153,.3)' : 'rgba(255,255,255,.09)') : 'var(--border)'}`,
        // Sombra en capas — la profundidad de UI de juego sale de apilar
        // tres sombras (contacto, difusa, luz de color), no de una sola.
        boxShadow: arcade
          ? `0 1px 0 rgba(255,255,255,.06) inset, 0 2px 4px rgba(0,0,0,.4), 0 10px 26px rgba(0,0,0,.45)${hecho ? `, 0 0 22px rgba(52,211,153,.18)` : ''}`
          : '0 1px 2px rgba(28,45,74,.06)',
        transition: 'background 260ms ease, border-color 260ms ease, box-shadow 260ms ease',
      }}>

      {/* Destello */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: .85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: .52, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `radial-gradient(70% 140% at 12% 50%, ${WHITE_HOT}, ${EMBER}00 70%)`,
            }} />
        )}
      </AnimatePresence>

      {/* Casillero */}
      <div style={{
        position: 'relative', flexShrink: 0,
        width: 26, height: 26, borderRadius: arcade ? 8 : 7,
        display: 'grid', placeItems: 'center',
        background: hecho ? acento : 'transparent',
        border: `2px solid ${hecho ? acento : (arcade ? 'rgba(255,255,255,.22)' : 'var(--border)')}`,
        boxShadow: hecho && arcade ? `0 0 16px ${acento}99` : 'none',
        transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
      }}>
        {hecho && <span className="material-symbols-outlined" style={{ fontSize: 18, color: arcade ? '#04120c' : '#fff', fontWeight: 700 }}>check</span>}
      </div>

      {/* Texto con palabras clave remarcadas.
          Verbo chico y apagado, CANTIDAD en la tipografía ancha y en brasa,
          QUÉ en blanco pesado. Un cocinero no lee la frase: busca el número y
          el producto. El resaltado no es decorativo, es el orden de lectura. */}
      <div style={{ flex: 1, minWidth: 0, opacity: hecho ? .55 : 1, transition: 'opacity 260ms ease' }}>
        <div style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase',
          color: arcade ? 'rgba(255,255,255,.4)' : 'var(--text-3)', marginBottom: 2,
        }}>
          {item.verbo}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span className={arcade ? 'lab-display' : undefined} style={{
            fontSize: arcade ? 19 : 15, fontWeight: 900, lineHeight: 1.05,
            color: hecho ? (arcade ? DONE : 'var(--text-2)') : (arcade ? EMBER_HOT : 'var(--accent)'),
            textShadow: arcade && !hecho ? `0 0 16px ${EMBER}55` : 'none',
            textDecoration: hecho ? 'line-through' : 'none',
          }}>
            {item.cantidad}
          </span>
          <span style={{
            fontSize: arcade ? 16 : 14, fontWeight: 800, lineHeight: 1.1,
            color: arcade ? '#fff' : 'var(--text-1)',
            textDecoration: hecho ? 'line-through' : 'none',
          }}>
            {item.que}
          </span>
        </div>
        {item.detalle && (
          <div style={{ fontSize: 11.5, color: arcade ? 'rgba(255,255,255,.42)' : 'var(--text-3)', marginTop: 3 }}>
            {item.detalle}
          </div>
        )}
      </div>
    </motion.div>
  )
}
