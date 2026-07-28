'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { useCajaTurno, inferMedioEfectivo } from '@/lib/hooks/useCajaTurno'
import { createClient } from '@/lib/supabase/client'
import { fetchEscPosBytes, printViaUSB, printViaBluetooth, downloadEscPosBytes, supportsWebUSB, supportsWebBluetooth } from '@/lib/print/escpos'
import { useImpresionConfig } from '@/lib/hooks/useImpresionConfig'
import type { CajaMovimiento, CajaTurno } from '@/types'

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}
function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type SubVista = 'dashboard' | 'movimiento' | 'cerrar' | 'resumen'

interface ResumenCierre {
  medios: { nombre: string; esperado: number; declarado: number; diferencia: number }[]
  diferenciaTotal: number
}

export default function VistaCaja({ onVolver }: { onVolver: () => void }) {
  const { perfil } = useAuth()
  const RESTAURANTE_ID = useRestauranteId()
  const { medios } = useMediosPago()
  const { config: impresion } = useImpresionConfig()
  const {
    cajaAbierta, loading,
    abrirCaja, cerrarCaja, registrarMovimiento, fetchMovimientos, calcularEsperado,
  } = useCajaTurno()

  const [restauranteNombre, setRestauranteNombre] = useState('KitchenOS')
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('restaurantes').select('nombre').eq('id', RESTAURANTE_ID).maybeSingle()
      .then(({ data }) => { if (data?.nombre) setRestauranteNombre(data.nombre) })
  }, [RESTAURANTE_ID])

  const [subVista, setSubVista] = useState<SubVista>('dashboard')
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([])

  const cargarMovimientos = useCallback(async (caja: CajaTurno) => {
    const mv = await fetchMovimientos(caja.id)
    setMovimientos(mv)
  }, [fetchMovimientos])

  useEffect(() => {
    if (cajaAbierta) cargarMovimientos(cajaAbierta)
    else setMovimientos([])
  }, [cajaAbierta, cargarMovimientos])

  // ── Abrir caja ──
  const [montoInicial, setMontoInicial] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [errorAbrir, setErrorAbrir] = useState<string | null>(null)

  async function handleAbrir() {
    setAbriendo(true)
    setErrorAbrir(null)
    try {
      await abrirCaja(parseFloat(montoInicial) || 0, perfil?.miembro_id ?? null)
      setMontoInicial('')
    } catch (e: unknown) {
      setErrorAbrir(e instanceof Error ? e.message : 'Error al abrir la caja')
    } finally {
      setAbriendo(false)
    }
  }

  // ── Movimiento (retiro/ingreso) ──
  const medioEfectivo = inferMedioEfectivo(medios)
  const [movTipo, setMovTipo] = useState<'retiro' | 'ingreso'>('retiro')
  const [movMedioId, setMovMedioId] = useState('')
  const [movMonto, setMovMonto] = useState('')
  const [movMotivo, setMovMotivo] = useState('')
  const [guardandoMov, setGuardandoMov] = useState(false)
  const [errorMov, setErrorMov] = useState<string | null>(null)

  function abrirFormMovimiento(tipo: 'retiro' | 'ingreso') {
    setMovTipo(tipo)
    setMovMedioId(medioEfectivo?.id ?? medios[0]?.id ?? '')
    setMovMonto('')
    setMovMotivo('')
    setErrorMov(null)
    setSubVista('movimiento')
  }

  async function handleGuardarMovimiento() {
    if (!cajaAbierta || !movMedioId || !(parseFloat(movMonto) > 0)) return
    setGuardandoMov(true)
    setErrorMov(null)
    try {
      await registrarMovimiento({
        cajaTurnoId: cajaAbierta.id,
        medioId: movMedioId,
        tipo: movTipo,
        monto: parseFloat(movMonto),
        motivo: movMotivo.trim() || null,
        creadoPor: perfil?.miembro_id ?? null,
      })
      await cargarMovimientos(cajaAbierta)
      setSubVista('dashboard')
    } catch (e: unknown) {
      setErrorMov(e instanceof Error ? e.message : 'Error al registrar el movimiento')
    } finally {
      setGuardandoMov(false)
    }
  }

  // ── Cerrar caja ──
  const [esperadoPorMedio, setEsperadoPorMedio] = useState<Record<string, number>>({})
  const [declarados, setDeclarados] = useState<Record<string, string>>({})
  const [arqueoCiego, setArqueoCiego] = useState(false)
  const [notasCierre, setNotasCierre] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [errorCierre, setErrorCierre] = useState<string | null>(null)
  const [resumenCierre, setResumenCierre] = useState<ResumenCierre | null>(null)

  async function handleIniciarCierre() {
    if (!cajaAbierta) return
    const esperado = await calcularEsperado(cajaAbierta)
    if (medioEfectivo) esperado[medioEfectivo.id] = (esperado[medioEfectivo.id] ?? 0) + cajaAbierta.monto_inicial
    setEsperadoPorMedio(esperado)
    setDeclarados({})
    setNotasCierre('')
    setSubVista('cerrar')
  }

  const mediosConMovimiento = medios.filter(m => (esperadoPorMedio[m.id] ?? 0) !== 0 || m.id === medioEfectivo?.id)
  const todosDeclarados = mediosConMovimiento.length > 0 && mediosConMovimiento.every(m => declarados[m.id] !== undefined && declarados[m.id] !== '')

  async function handleConfirmarCierre() {
    if (!cajaAbierta) return
    setCerrando(true)
    setErrorCierre(null)
    try {
      const montosDeclarados: Record<string, number> = {}
      for (const m of mediosConMovimiento) montosDeclarados[m.id] = parseFloat(declarados[m.id]) || 0
      const diferenciaTotal = await cerrarCaja({
        cajaTurnoId: cajaAbierta.id,
        montosEsperados: esperadoPorMedio,
        montosDeclarados,
        cerradaPor: perfil?.miembro_id ?? null,
        arqueoCiego,
        notas: notasCierre.trim() || null,
      })
      setResumenCierre({
        medios: mediosConMovimiento.map(m => ({
          nombre: m.nombre,
          esperado: esperadoPorMedio[m.id] ?? 0,
          declarado: montosDeclarados[m.id] ?? 0,
          diferencia: (montosDeclarados[m.id] ?? 0) - (esperadoPorMedio[m.id] ?? 0),
        })),
        diferenciaTotal,
      })
      setSubVista('resumen')
    } catch (e: unknown) {
      setErrorCierre(e instanceof Error ? e.message : 'Error al cerrar la caja')
    } finally {
      setCerrando(false)
    }
  }

  // ── Impresión del ticket de cierre ──
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  async function buildCierreBytes() {
    if (!cajaAbierta || !resumenCierre) throw new Error('Sin datos de cierre')
    return fetchEscPosBytes({
      mode: 'generate',
      tipo: 'cierre_caja',
      data: {
        nombreLocal: restauranteNombre,
        fechaApertura: fmtFechaHora(cajaAbierta.fecha_apertura),
        fechaCierre: fmtFechaHora(new Date().toISOString()),
        abiertaPor: perfil ? `${perfil.nombre} ${perfil.apellido}` : null,
        cerradaPor: perfil ? `${perfil.nombre} ${perfil.apellido}` : null,
        montoInicial: cajaAbierta.monto_inicial,
        medios: resumenCierre.medios,
        diferenciaTotal: resumenCierre.diferenciaTotal,
        notas: notasCierre.trim() || null,
      },
    })
  }

  async function handlePrint(method: 'usb' | 'bluetooth') {
    setPrinting(true)
    setPrintError(null)
    try {
      const bytes = await buildCierreBytes()
      if (method === 'usb') await printViaUSB(bytes)
      else await printViaBluetooth(bytes)
    } catch (e: unknown) {
      setPrintError(e instanceof Error ? e.message : 'Error al imprimir')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDownload() {
    setPrinting(true)
    setPrintError(null)
    try {
      const bytes = await buildCierreBytes()
      downloadEscPosBytes(bytes, `cierre-caja-${new Date().toISOString().slice(0, 10)}.bin`)
    } catch (e: unknown) {
      setPrintError(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setPrinting(false)
    }
  }

  // ── Render ──

  const btnBack = (
    <button onClick={onVolver} style={{ minWidth: 44, minHeight: 44, color: 'var(--text-1)', background: 'transparent', border: 'none' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
    </button>
  )

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-2)' }}>Cargando caja...</span>
      </div>
    )
  }

  // Sin caja abierta → abrir
  if (!cajaAbierta) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          {btnBack}
          <span style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 700 }}>Caja</span>
        </div>
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>point_of_sale</span>
            <p style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: 17, margin: 0 }}>No hay caja abierta</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>Abrí la caja con el fondo inicial para empezar el turno</p>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Fondo inicial ($)</span>
            <input
              type="number" inputMode="decimal" value={montoInicial} onChange={e => setMontoInicial(e.target.value)}
              placeholder="0" autoFocus
              style={{ minHeight: 56, borderRadius: 12, background: 'var(--surface)', color: 'var(--text-1)', border: '1.5px solid var(--border)', padding: '0 16px', fontSize: 22, fontWeight: 700 }}
            />
          </label>
          {errorAbrir && <p style={{ color: '#e57373', fontSize: 13 }}>{errorAbrir}</p>}
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={handleAbrir} disabled={abriendo}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: '#2e7d32', color: '#fff', fontSize: 20, fontWeight: 800, opacity: abriendo ? 0.6 : 1 }}>
            {abriendo ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      </div>
    )
  }

  // ── Resumen post-cierre ──
  if (subVista === 'resumen' && resumenCierre) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '46px 20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#2e7d32', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#fff' }}>check_circle</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)' }}>Caja cerrada</p>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
            {resumenCierre.medios.map((m, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: i < resumenCierre.medios.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <p style={{ color: 'var(--text-1)', fontWeight: 600, marginBottom: 4 }}>{m.nombre}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>Esperado {fmt(m.esperado)}</span>
                  <span style={{ color: 'var(--text-2)' }}>Declarado {fmt(m.declarado)}</span>
                  <span style={{ color: m.diferencia === 0 ? '#4caf50' : m.diferencia > 0 ? '#4caf50' : '#e57373', fontWeight: 700 }}>
                    {m.diferencia > 0 ? '+' : ''}{fmt(m.diferencia)}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)' }}>
              <span style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: 16 }}>Diferencia total</span>
              <span style={{ color: resumenCierre.diferenciaTotal === 0 ? '#4caf50' : resumenCierre.diferenciaTotal > 0 ? '#4caf50' : '#e57373', fontWeight: 800, fontSize: 18 }}>
                {resumenCierre.diferenciaTotal > 0 ? '+' : ''}{fmt(resumenCierre.diferenciaTotal)}
              </span>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12 }}>Imprimir cierre</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {impresion.usb && supportsWebUSB() && (
                <button onClick={() => { void handlePrint('usb') }} disabled={printing}
                  style={{ minHeight: 64, borderRadius: 12, background: '#1c2d4a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
                  <span className="material-symbols-outlined">print</span>
                  {printing ? 'Imprimiendo...' : 'Imprimir por USB'}
                </button>
              )}
              {impresion.bluetooth && supportsWebBluetooth() && (
                <button onClick={() => { void handlePrint('bluetooth') }} disabled={printing}
                  style={{ minHeight: 64, borderRadius: 12, background: '#1c2d4a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
                  <span className="material-symbols-outlined">bluetooth</span>
                  {printing ? 'Conectando...' : 'Imprimir por Bluetooth'}
                </button>
              )}
              {impresion.bin && (
                <button onClick={() => { void handleDownload() }} disabled={printing}
                  style={{ minHeight: 64, borderRadius: 12, background: 'var(--border)', border: 'none', color: 'var(--text-1)', fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: printing ? 0.6 : 1 }}>
                  <span className="material-symbols-outlined">download</span>
                  Descargar .bin
                </button>
              )}
            </div>
            {printError && <p style={{ color: '#e57373', fontSize: 13, marginTop: 10 }}>{printError}</p>}
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={onVolver}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: 'var(--surface)', border: '2px solid var(--border)', color: 'var(--text-1)', fontSize: 20, fontWeight: 700 }}>
            Volver al mapa
          </button>
        </div>
      </div>
    )
  }

  // ── Cerrar caja (declarar por medio) ──
  if (subVista === 'cerrar') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSubVista('dashboard')} style={{ minWidth: 44, minHeight: 44, color: 'var(--text-1)', background: 'transparent', border: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <span style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 700 }}>Cerrar caja</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setArqueoCiego(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${arqueoCiego ? '#4361a0' : 'var(--border)'}`, background: arqueoCiego ? 'rgba(67,97,160,.15)' : 'var(--surface)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: arqueoCiego ? '#4361a0' : 'var(--text-3)' }}>
              {arqueoCiego ? 'check_box' : 'check_box_outline_blank'}
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Arqueo ciego</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>No muestra el esperado hasta declarar todos los medios</div>
            </div>
          </button>

          {mediosConMovimiento.map(m => (
            <div key={m.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 700, fontSize: 16 }}>{m.nombre}</span>
                {(!arqueoCiego || todosDeclarados) && (
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>Esperado {fmt(esperadoPorMedio[m.id] ?? 0)}</span>
                )}
              </div>
              <input
                type="number" inputMode="decimal"
                value={declarados[m.id] ?? ''}
                onChange={e => setDeclarados(prev => ({ ...prev, [m.id]: e.target.value }))}
                placeholder="Contá y declará el monto"
                style={{ minHeight: 52, borderRadius: 10, background: 'var(--border)', color: 'var(--text-1)', border: 'none', padding: '0 14px', fontSize: 20, fontWeight: 700 }}
              />
              {todosDeclarados && (
                <span style={{ fontSize: 12, fontWeight: 700, color: ((parseFloat(declarados[m.id]) || 0) - (esperadoPorMedio[m.id] ?? 0)) === 0 ? '#4caf50' : '#e57373' }}>
                  Diferencia: {fmt((parseFloat(declarados[m.id]) || 0) - (esperadoPorMedio[m.id] ?? 0))}
                </span>
              )}
            </div>
          ))}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Notas (opcional)</span>
            <textarea
              value={notasCierre} onChange={e => setNotasCierre(e.target.value)}
              rows={2} placeholder="Ej: faltante por vuelto mal dado"
              style={{ borderRadius: 10, background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'none' }}
            />
          </label>

          {errorCierre && <p style={{ color: '#e57373', fontSize: 13 }}>{errorCierre}</p>}
          <div style={{ height: 16 }} />
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={handleConfirmarCierre} disabled={!todosDeclarados || cerrando}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: todosDeclarados ? '#a04343' : 'var(--border)', color: todosDeclarados ? '#fff' : 'var(--text-2)', fontSize: 20, fontWeight: 800, opacity: cerrando ? 0.6 : 1 }}>
            {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    )
  }

  // ── Movimiento (retiro/ingreso) ──
  if (subVista === 'movimiento') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSubVista('dashboard')} style={{ minWidth: 44, minHeight: 44, color: 'var(--text-1)', background: 'transparent', border: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <span style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 700 }}>{movTipo === 'retiro' ? 'Registrar retiro' : 'Registrar ingreso'}</span>
        </div>
        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMovTipo('retiro')} style={{ flex: 1, minHeight: 56, borderRadius: 12, background: movTipo === 'retiro' ? '#a04343' : 'var(--border)', border: 'none', color: movTipo === 'retiro' ? '#fff' : 'var(--text-2)', fontSize: 16, fontWeight: 700 }}>Retiro</button>
            <button onClick={() => setMovTipo('ingreso')} style={{ flex: 1, minHeight: 56, borderRadius: 12, background: movTipo === 'ingreso' ? '#2e7d32' : 'var(--border)', border: 'none', color: movTipo === 'ingreso' ? '#fff' : 'var(--text-2)', fontSize: 16, fontWeight: 700 }}>Ingreso</button>
          </div>

          <div>
            <span style={{ color: 'var(--text-2)', fontSize: 13, display: 'block', marginBottom: 8 }}>Medio</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {medios.map(m => (
                <button key={m.id} onClick={() => setMovMedioId(m.id)}
                  style={{ flex: '1 1 auto', minHeight: 44, borderRadius: 10, background: movMedioId === m.id ? '#4361a0' : 'var(--border)', border: `1.5px solid ${movMedioId === m.id ? '#4361a0' : 'transparent'}`, color: movMedioId === m.id ? '#fff' : 'var(--text-1)', fontSize: 15, fontWeight: 600 }}>
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Monto ($)</span>
            <input type="number" inputMode="decimal" value={movMonto} onChange={e => setMovMonto(e.target.value)}
              placeholder="0" autoFocus
              style={{ minHeight: 56, borderRadius: 12, background: 'var(--surface)', color: 'var(--text-1)', border: '1.5px solid var(--border)', padding: '0 16px', fontSize: 22, fontWeight: 700 }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Motivo (opcional)</span>
            <input value={movMotivo} onChange={e => setMovMotivo(e.target.value)}
              placeholder={movTipo === 'retiro' ? 'Ej: pago a proveedor' : 'Ej: cambio para caja'}
              style={{ minHeight: 52, borderRadius: 10, background: 'var(--surface)', color: 'var(--text-1)', border: '1.5px solid var(--border)', padding: '0 14px', fontSize: 15 }} />
          </label>

          {errorMov && <p style={{ color: '#e57373', fontSize: 13 }}>{errorMov}</p>}
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
          <button onClick={handleGuardarMovimiento} disabled={!movMedioId || !(parseFloat(movMonto) > 0) || guardandoMov}
            style={{ width: '100%', minHeight: 68, borderRadius: 14, background: movMedioId && parseFloat(movMonto) > 0 ? '#2e7d32' : 'var(--border)', color: movMedioId && parseFloat(movMonto) > 0 ? '#fff' : 'var(--text-2)', fontSize: 20, fontWeight: 800, opacity: guardandoMov ? 0.6 : 1 }}>
            {guardandoMov ? 'Guardando...' : 'Guardar movimiento'}
          </button>
        </div>
      </div>
    )
  }

  // ── Dashboard (caja abierta) ──
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        {btnBack}
        <span style={{ color: 'var(--text-1)', fontSize: 20, fontWeight: 700 }}>Caja abierta</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-2)' }}>Fondo inicial</span>
            <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{fmt(cajaAbierta.monto_inicial)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-2)' }}>Abierta desde</span>
            <span style={{ color: 'var(--text-1)' }}>{fmtFechaHora(cajaAbierta.fecha_apertura)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => abrirFormMovimiento('retiro')}
            style={{ flex: 1, minHeight: 64, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 15, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span className="material-symbols-outlined">remove_circle</span>
            Retiro
          </button>
          <button onClick={() => abrirFormMovimiento('ingreso')}
            style={{ flex: 1, minHeight: 64, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)', fontSize: 15, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span className="material-symbols-outlined">add_circle</span>
            Ingreso
          </button>
        </div>

        {movimientos.length > 0 && (
          <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden' }}>
            <p style={{ color: 'var(--text-2)', fontSize: 12, padding: '10px 16px 4px' }}>Movimientos del turno</p>
            {movimientos.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                <div>
                  <span style={{ color: 'var(--text-1)', fontSize: 14 }}>{m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'}</span>
                  {m.motivo && <span style={{ color: 'var(--text-2)', fontSize: 12 }}> · {m.motivo}</span>}
                </div>
                <span style={{ color: m.tipo === 'retiro' ? '#e57373' : '#4caf50', fontWeight: 700 }}>
                  {m.tipo === 'retiro' ? '-' : '+'}{fmt(m.monto)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>
      <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>
        <button onClick={handleIniciarCierre}
          style={{ width: '100%', minHeight: 68, borderRadius: 14, background: '#a04343', color: '#fff', fontSize: 20, fontWeight: 800 }}>
          Cerrar caja
        </button>
      </div>
    </div>
  )
}
