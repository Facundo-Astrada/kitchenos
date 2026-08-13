'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useSheetOpenWhen } from '@/lib/ui/chrome'

// ══════════════════════════════════════════════════════════════
// GUÍA DE USO DEL MISE — siempre a mano desde el "?" del header.
// Explica cada control de la pantalla con una réplica visual del
// control al lado del texto: qué hace, por qué está ahí y cómo
// repercute en el turno siguiente. No consume IA — es contenido
// estático, para que esté disponible aunque no haya red del lado
// del Coach y sin costo por apertura.
// ══════════════════════════════════════════════════════════════

export type MiseGuiaFoco = 'primera-vez' | null

const ICON = 'material-symbols-outlined'

// ── Átomos visuales (réplicas de los controles reales) ────────
function PillNavy({ children, activo }: { children: React.ReactNode; activo?: boolean }) {
  return (
    <span style={{
      padding: '4px 11px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap',
      background: activo ? '#fff' : 'rgba(255,255,255,.12)',
      color: activo ? 'var(--navy)' : 'rgba(255,255,255,.55)',
    }}>{children}</span>
  )
}

function DemoNavy({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--navy)', borderRadius: 10, padding: '8px 10px',
      display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
    }}>{children}</div>
  )
}

/** Bloque de la guía: réplica del control arriba, explicación abajo. */
function Bloque({ demo, titulo, children, id }: {
  demo: React.ReactNode; titulo: string; children: React.ReactNode; id?: string
}) {
  return (
    <div id={id} style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {demo}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{titulo}</span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>{children}</div>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase',
      letterSpacing: '.08em', margin: '18px 2px 8px',
    }}>{children}</div>
  )
}

/** Frase de consecuencia — lo que pasa en el turno siguiente. */
function Repercute({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 8, padding: '7px 10px', borderRadius: 9,
      background: 'rgba(67,97,160,.07)', borderLeft: '3px solid var(--accent)',
      fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-2)',
    }}>
      <b style={{ color: 'var(--accent)' }}>Repercute en: </b>{children}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
export function MiseGuiaSheet({ foco, onClose, onVerEnPantalla }: {
  foco?: MiseGuiaFoco
  onClose: () => void
  /** Presente solo si hay una plaza abierta: cierra la guía y arranca el recorrido guiado. */
  onVerEnPantalla?: () => void
}) {
  const isDesktop = useIsDesktop()
  useSheetOpenWhen(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Foco opcional: abrir directamente en una sección (ej. desde el banner
  // "recibís sin cierre del turno anterior" → cómo cargar la primera vez).
  useEffect(() => {
    if (!foco) return
    const el = document.getElementById(`mise-guia-${foco}`)
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [foco])

  // Escape cierra (desktop)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const contenido = (
    <>
      {/* ── Qué es ── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy), #4361a0)', borderRadius: 14,
        padding: '14px 16px', color: '#fff', marginBottom: 4,
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>El mise es la foto de tu plaza</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'rgba(255,255,255,.85)' }}>
          Cada ítem de esta lista es algo que tiene que estar preparado y en cantidad antes del servicio.
          Al <b>abrir</b> contás lo que hay y producís lo que falta. Al <b>cerrar</b> anotás lo que quedó
          y <b>entregás la plaza</b>. Ese número es exactamente el que va a ver quien abra el próximo turno.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <PillNavy activo>Apertura</PillNavy>
          <span className={ICON} style={{ fontSize: 15, color: 'rgba(255,255,255,.5)' }}>arrow_forward</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>servicio</span>
          <span className={ICON} style={{ fontSize: 15, color: 'rgba(255,255,255,.5)' }}>arrow_forward</span>
          <PillNavy activo>Cierre</PillNavy>
          <span className={ICON} style={{ fontSize: 15, color: 'rgba(255,255,255,.5)' }}>arrow_forward</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>entrega</span>
          <span className={ICON} style={{ fontSize: 15, color: 'rgba(255,255,255,.5)' }}>arrow_forward</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>turno siguiente</span>
        </div>
      </div>

      {/* ── HEADER ── */}
      <Titulo>Arriba de todo</Titulo>

      <Bloque
        titulo="Almuerzo / Cena — turno de servicio"
        demo={<DemoNavy><PillNavy activo>Almuerzo</PillNavy><PillNavy>Cena</PillNavy></DemoNavy>}
      >
        Cada turno de servicio tiene su propia lista y sus propios números. Lo que tildás o contás en
        Almuerzo no se mezcla con Cena. Se selecciona solo por hora, pero podés cambiarlo a mano.
        Si tu restaurante tiene un solo turno configurado, este selector no aparece.
        <Repercute>el cierre de <b>Almuerzo</b> es la referencia de la apertura de <b>Cena</b>, no la del día siguiente.</Repercute>
      </Bloque>

      <Bloque
        titulo="Apertura / Cierre / Rutina"
        demo={<DemoNavy><PillNavy activo>Apertura</PillNavy><PillNavy>Cierre</PillNavy><PillNavy>Rutina</PillNavy></DemoNavy>}
      >
        <b>Apertura:</b>{' '}arrancás el turno. Contás lo que hay de cada ítem y mandás a producir lo que falta.<br />
        <b>Cierre:</b>{' '}terminás el turno. Anotás cuánto quedó de cada ítem — no cuánto usaste, cuánto <i>queda</i>.<br />
        <b>Rutina:</b>{' '}tareas recurrentes de la plaza (limpieza, descongelado, control de fechas). Cada una
        aparece solo el día que le toca. Ahí también caen las tareas de HACCP → Limpieza con &quot;Mostrar en OPS&quot;.
        <Repercute>si nadie completa el <b>Cierre</b> y entrega la plaza, el que abre después sigue viendo este turno y tiene que contar todo de cero.</Repercute>
      </Bloque>

      <Bloque
        titulo="La barra de progreso — 0/20"
        demo={
          <DemoNavy>
            <div style={{ width: 70, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: '35%', height: '100%', background: '#22c55e', borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: "'DM Mono', monospace" }}>7/20</span>
          </DemoNavy>
        }
      >
        Cuántos ítems de <b>toda la plaza</b> llevás resueltos en este turno y esta fase. En apertura cuenta
        lo <b>revisado</b>: los tildados en verde y también los que quedaron en ámbar con su producción
        despachada. Cada sección (Heladera, Secos, Estación…) además lleva su propio contador en su encabezado.
      </Bloque>

      <Bloque
        titulo="Modo Control y Editar secciones"
        demo={
          <DemoNavy>
            <span className={ICON} style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>fact_check</span>
            <span className={ICON} style={{ fontSize: 18, color: 'rgba(255,255,255,.7)' }}>settings</span>
          </DemoNavy>
        }
      >
        <b>fact_check (Modo Control):</b>{' '}deja cada ítem en una sola línea con tres decisiones y ningún
        número: el <b>tilde</b> (está como tiene que estar), el <b>badge de prioridad</b> — un tap lo cicla
        SP → P → REF — y el <b>+</b>, que despacha el ítem con esa prioridad y sin cantidad. El + queda en
        verde cuando ese ítem ya está despachado.
        <br /><br />
        <b>En el cierre el + arma el pase de turno.</b> Cerrar en Modo Control no deja números, deja
        decisiones: cada ítem termina tildado (&quot;esto está&quot;) o despachado (&quot;esto falta, va con
        prioridad P&quot;), y eso es lo que hereda el turno siguiente — lo ve en el aviso ámbar
        <b> &quot;Te dejaron en producción&quot;</b> con la prioridad de cada uno. Las cantidades se hablan en la
        cocina; la app no inventa un número que nadie contó. La contra es que el que abre no recibe el
        &quot;quedaban 8&quot; de referencia: si querés ese dato, ese cierre hacelo con la tarjeta completa.
        Queda activado hasta que lo apagues.<br />
        <b>settings:</b>{' '}crear, renombrar, reordenar o borrar las secciones de esta plaza.
      </Bloque>

      {/* ── LA TARJETA ── */}
      <Titulo>La tarjeta de cada ítem (apertura)</Titulo>

      <Bloque
        titulo="El círculo — marcar como resuelto"
        demo={
          <span className={ICON} style={{ fontSize: 26, color: '#22c55e' }}>check_circle</span>
        }
      >
        Tildás cuando ese ítem <b>ya está como tiene que estar</b>: hay la cantidad pedida, o ya lo produjiste.
        No significa &quot;lo miré&quot;, significa &quot;está&quot;. La tarjeta se apaga y suma al progreso de arriba.
        <br /><br />
        Si lo tildás a mano cuando todavía figuraba faltante, el recipiente <b>queda completo</b>: tildar
        es afirmar que está, así que el número se acomoda solo al objetivo. Antes quedaba verde con el
        último conteo — casi siempre un 0 — y ese 0 era lo que se encontraba después el del cierre.
        Destildar no toca el número, y en <b>Cierre</b> tampoco se pisa nada: ahí el número es justamente
        lo que estás contando.
        <Repercute>si ese ítem tenía una tarea en <b>Producción</b>, tildarlo acá la marca como lista allá — y al revés, al instante y en todos los dispositivos que tengan el mise abierto.</Repercute>
      </Bloque>

      <Bloque
        titulo="El círculo ámbar — está en producción"
        demo={
          <span className={ICON} style={{ fontSize: 26, color: '#f59e0b' }}>pending</span>
        }
      >
        Cuando despachás la producción de un ítem, la tarjeta se pinta en ámbar con el cartel
        <b> &quot;en producción&quot;</b> y ya suma al progreso de arriba: la apertura mide <b>ítems revisados</b>,
        no ítems cocinados — pasaste, contaste y decidiste, que es lo que se hace en la vuelta.
        Verde es &quot;está en su lugar&quot;; ámbar es &quot;está en el horno&quot;.
        <Repercute>cuando esa tarea se completa en <b>Producción</b>, el ítem pasa a verde solo. Nadie tiene que volver al mise a tildarlo.</Repercute>
      </Bloque>

      <Bloque
        titulo="88 g/porc — peso de una porción"
        demo={
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', border: '1px dashed var(--border)', borderRadius: 8, padding: '4px 8px' }}>
            88g/porc
          </span>
        }
      >
        Lo que pesa <b>una</b> porción según la ficha de la receta. Es la traducción entre porciones y balanza:
        15 porciones × 88 g = 1.32 kg. Si no aparece, esa receta todavía no tiene peso por porción cargado.
      </Bloque>

      <Bloque
        titulo="El recipiente — 1.5 ×3 → 15 porc"
        demo={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span className={ICON} style={{ fontSize: 14, color: 'var(--text-3)' }}>inventory_2</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>1.5 ×3</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>→ 15 porc</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(16,185,129,.12)', color: '#059669' }}>1.32kg total</span>
          </div>
        }
      >
        En qué se guarda y cuánto tiene que haber. <b>1.5 ×3</b> = tres recipientes GN 1.5 (el <b>×3</b> es la
        cantidad de recipientes iguales). <b>→ 15 porc</b> es el objetivo del turno: lo que debería quedar
        cargado entre los tres. El badge verde es ese objetivo pasado a peso, para controlarlo en balanza.
      </Bloque>

      <Bloque
        titulo="HAY AHORA — el único número que cargás"
        demo={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>hay ahora</span>
            <span style={{
              padding: '5px 9px', borderRadius: 8, background: 'rgba(148,163,184,.1)',
              fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)',
            }}>
              9<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}> / 15</span>
            </span>
          </div>
        }
      >
        Contás lo que hay físicamente y lo escribís. El número de la derecha es el objetivo, no se toca.
        Viene precargado con lo que dejó registrado el cierre anterior: si es correcto lo dejás, si no lo corregís.
        Al tocarlo el número heredado queda <b>seleccionado</b>, así que escribís encima sin borrar — contar 2
        sobre un 10 heredado da 2, no 102.
        <br /><br />
        Si al cargarlo <b>llega al objetivo, el ítem se tilda solo</b>. Si falta, aparece el botón rojo de producir.
        <br /><br />
        <b>Enter</b> guarda y <b>salta al siguiente ítem</b>, con su campo abierto y la tarjeta centrada sobre el
        teclado: la vuelta se hace de corrido, sin bajar el teclado ni buscar la próxima tarjeta con el dedo.
        <Repercute>este conteo es el que aparece como stock de arranque, y lo que cargues al <b>cerrar</b> es lo que va a ver el turno siguiente.</Repercute>
      </Bloque>

      <Bloque
        titulo="Producir N porc — el botón rojo"
        demo={
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10,
            background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff', fontSize: 11.5, fontWeight: 700,
          }}>
            <span className={ICON} style={{ fontSize: 14 }}>add_task</span>
            Producir 6 porc (528g)
          </span>
        }
      >
        Aparece solo cuando hay déficit y ya trae la cuenta hecha: objetivo − lo que hay (+ lo que el salón ya
        pidió hoy). Un tap crea la tarea en <b>Producción</b> con la cantidad exacta, prioridad alta y para hoy.
        No hace falta abrir nada más.
        <br /><br />
        Despachar cierra el ítem para esta vuelta: queda en <b>ámbar &quot;en producción&quot;</b> y el foco
        <b> salta al siguiente</b>, igual que con Enter.
      </Bloque>

      <Bloque
        titulo="El botón de la derecha — mandar a Producción"
        demo={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span className={ICON} style={{ fontSize: 22, color: 'var(--text-3)' }}>add_task</span>
            <span className={ICON} style={{ fontSize: 22, color: '#22c55e' }}>task_alt</span>
          </div>
        }
      >
        Lo mismo que el botón rojo pero decidiendo vos: abre el panel para elegir cantidad, prioridad
        (SP / P / REF / Check) y si es para <b>hoy o para mañana</b>. Usalo cuando querés dejar producción
        encargada aunque hoy no falte.<br />
        <b>Gris</b> = todavía no hay tarea creada para ese ítem hoy. <b>Verde</b> = ya hay una tarea abierta en Producción.
        <Repercute>si elegís &quot;mañana&quot;, la tarea queda como pase de turno y aparece en la producción del día siguiente.</Repercute>
      </Bloque>

      {/* ── CIERRE ── */}
      <Titulo>La tarjeta en Cierre</Titulo>

      <Bloque
        titulo="Cuánto quedó"
        demo={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < 2 ? '#f59e0b' : 'var(--border)' }} />
              ))}
            </div>
            <span style={{
              width: 34, textAlign: 'center', padding: '3px 4px', borderRadius: 7,
              border: '1.5px solid #f97316', background: 'rgba(249,115,22,.07)',
              fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)',
            }}>6</span>
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700 }}>/ 15 u</span>
          </div>
        }
      >
        En cierre la tarjeta cambia: en vez de producir, se registra. Escribís cuánto quedó de cada ítem.
        Los cinco puntitos son el semáforo — verde si quedó cerca del objetivo, amarillo o rojo si quedó poco.
        <br /><br />
        Se cuenta igual de rápido que la apertura: al tocar el campo el número anterior queda
        <b> seleccionado</b> (escribís encima, sin borrar), <b>escribir el número tilda el ítem</b> — contar
        <i> es</i> la acción del cierre, no hace falta tocar además el círculo — y <b>Enter</b> guarda y
        <b> salta al siguiente</b> sin contar, con la tarjeta centrada. Borrar el número lo destilda; entrar
        y salir del campo sin escribir no toca nada.
        <Repercute>ese número entra tal cual en <b>HAY AHORA</b> de la próxima apertura. Un cierre bien contado le ahorra media hora al turno que entra.</Repercute>
      </Bloque>

      <Bloque
        titulo="Lo que faltó, para mañana"
        demo={
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 10,
            background: 'rgba(67,97,160,.1)', color: '#4361a0', fontSize: 12, fontWeight: 700,
          }}>
            <span className={ICON} style={{ fontSize: 14 }}>event_upcoming</span>
            Producir mañana 9 u
          </span>
        }
      >
        Si lo que contaste no llega al objetivo, aparece este botón. Es el espejo del botón rojo de la
        apertura, pero mirando al turno siguiente: lo que descubrís al cerrar se produce mañana, no ahora.
        Un toque y la tarea queda cargada en <b>Producción</b> con fecha de mañana — antes había que
        anotarlo aparte y volver a cargarlo al día siguiente.
        <Repercute>el que abre mañana ya se encuentra el trabajo cargado, sin depender de que alguien se haya acordado.</Repercute>
      </Bloque>

      {/* ── TERMINAR EL TURNO ── */}
      <Titulo>Terminar la vuelta y entregar</Titulo>

      <Bloque
        titulo="¡Terminaste la apertura!"
        demo={
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 11,
            background: 'var(--bg)', border: '1px solid var(--border)',
          }}>
            <span className={ICON} style={{ fontSize: 18, color: '#22c55e' }}>check_circle</span>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-1)' }}>¡Terminaste la apertura!</div>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>20 ítems revisados — 6 en producción</div>
            </div>
          </div>
        }
      >
        Cuando no queda ningún ítem sin revisar aparece abajo este aviso, y <b>se queda ahí</b> hasta que lo
        cerrás con la ✕ — no es un mensaje de 2 segundos que se pierde si estabas mirando la olla.
        Si dejaste producción despachada lo aclara (&quot;6 en producción&quot;): la vuelta está hecha, la
        cocina todavía no. Es solo información; no hay nada más que tocar en el mise.
      </Bloque>

      <Bloque
        titulo="Entregar plaza — el pase de turno"
        demo={
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 10,
            background: '#22c55e', color: '#fff', fontSize: 11.5, fontWeight: 700,
          }}>
            <span className={ICON} style={{ fontSize: 15 }}>outbox</span>
            Entregar plaza
          </span>
        }
      >
        Con el <b>Cierre</b> completo aparece esta barra. Tocar <b>Entregar plaza</b> es lo que pasa el turno:
        a partir de ahí el mise de esa plaza muestra el turno siguiente, con tus números de cierre como
        referencia, y queda registrado quién entregó y a qué hora.
        <br /><br />
        Lo dispara la entrega, no el reloj. Antes el mise cambiaba de turno por hora, y el que entraba
        temprano a hacer el almuerzo terminaba cargando sus tildes sobre la cena de anoche.
        <br /><br />
        <b>Entregar no es fichar la salida.</b> Son dos cosas distintas y ese era el otro problema: la plaza
        es del turno y la salida es tuya. Entregás primero — aunque no hayas fichado la entrada — y recién
        ahí la barra ofrece <b>Marcar salida</b>, si tenías un fichaje abierto.
        <Repercute>el que abre después arranca sobre lo que vos entregaste. Sin entrega, sigue viendo el turno anterior.</Repercute>
      </Bloque>

      {/* ── PRIMERA VEZ ── */}
      <Titulo>La primera vez</Titulo>

      <Bloque
        id="mise-guia-primera-vez"
        titulo="Cargar por primera vez lo que hay"
        demo={<span className={ICON} style={{ fontSize: 24, color: '#f97316' }}>counter_1</span>}
      >
        La primera vez (o cuando aparece el aviso rojo <b>&quot;Recibís sin cierre del turno anterior&quot;</b>) no hay
        ningún número de referencia: nadie registró un cierre todavía. Es normal y no bloquea nada.
        <div style={{ margin: '8px 0 0', paddingLeft: 2 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            <b>1.</b> Recorré la plaza con el celular y contá lo que ves, ítem por ítem.<br />
            <b>2.</b> Escribí ese número en <b>HAY AHORA</b> (o en el campo de cantidad si el ítem no tiene recipiente).
            Nada se rompe si te equivocás: se corrige escribiendo encima.<br />
            <b>3.</b> Lo que falte para el objetivo, mandalo a producir con el botón rojo.<br />
            <b>4.</b> Al terminar el turno, completá el <b>Cierre</b>. Ese es el paso que cierra el círculo.
          </div>
        </div>
        <Repercute>a partir del primer cierre bien cargado, la apertura del turno siguiente ya viene con los números puestos y solo hay que confirmarlos. La primera semana es la única en que se cuenta todo de cero.</Repercute>
      </Bloque>

      <Bloque
        titulo="¿De dónde salen los ítems de la lista?"
        demo={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className={ICON} style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar</span>
          </span>
        }
      >
        Cuatro caminos, todos terminan en la misma lista:<br />
        <b>· Agregar</b> — el botón al pie de cada sección. Nombre, cantidad estándar y prioridad. Si lo vinculás
        a una receta, arrastra porciones y plaza solo.<br />
        <b>· Carta → OPS</b> — al definir en qué plaza se prepara un componente de un plato, se crea su ítem del mise.<br />
        <b>· Recetario → OPS</b> — lo mismo desde la ficha de la receta, con recipiente y peso por porción.<br />
        <b>· Planificación</b> — activar un menú del catálogo crea las tareas de producción del día.
        <br /><br />
        La <b>cantidad estándar</b> y el <b>recipiente</b> se cargan una sola vez y son los que definen el objetivo
        de todos los turnos. Tocá el nombre del ítem para ver ese estándar, cambiarle la prioridad o eliminarlo.
      </Bloque>

      <div style={{ height: 8 }} />
    </>
  )

  const head = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
      borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      <span className={ICON} style={{ fontSize: 22, color: 'var(--accent)' }}>help</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Cómo funciona el Mise</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Qué hace cada botón y cómo llega al turno siguiente</div>
      </div>
      {/* Mismo contenido, otra forma: señalado sobre la pantalla real */}
      {onVerEnPantalla && (
        <button
          onClick={onVerEnPantalla}
          title="Ver cada botón señalado sobre la pantalla"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '6px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: '#f97316', color: '#fff', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          <span className={ICON} style={{ fontSize: 15 }}>ads_click</span>
          Verlo en pantalla
        </button>
      )}
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
        <span className={ICON} style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
      </button>
    </div>
  )

  // Portal a body — si no, en desktop el panel lateral del Coach queda por
  // encima del backdrop y la pantalla se oscurece a medias.
  const portal = (n: React.ReactNode) =>
    typeof document !== 'undefined' ? createPortal(n, document.body) : null

  if (isDesktop) {
    return portal(
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <div style={{
          background: 'var(--bg)', borderRadius: 18, width: '100%', maxWidth: 620,
          maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,.35)',
        }}>
          {head}
          <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 16px' }}>
            {contenido}
          </div>
        </div>
      </div>
    )
  }

  return portal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border)' }} />
        </div>
        {head}
        <div ref={scrollRef} style={{
          overflowY: 'auto', flex: 1, padding: '12px 14px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        }}>
          {contenido}
        </div>
      </div>
    </div>
  )
}
