'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useAuth } from '@/lib/auth/context'
import { resetOnboardingDone } from '@/lib/hooks/useOnboardingProgress'
import { useImpresionConfig } from '@/lib/hooks/useImpresionConfig'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { SwitchRow } from '@/components/ui'
import ConsumoIAPanel from '@/components/configuracion/ConsumoIAPanel'
import { PLAZAS_DISPONIBLES } from '@/types'

export default function ConfiguracionPage() {
  const router = useRouter()
  const RESTAURANTE_ID = useRestauranteId()
  const { isAdmin } = usePermisos()
  const { perfil, user } = useAuth()
  const [supabase] = useState(() => createClient())

  function abrirGuiaInicio() {
    // Reabrir el onboarding aunque ya esté marcado como completado
    resetOnboardingDone(user?.id)
    router.push('/onboarding')
  }

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({ screen: 'configuracion' }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [])

  const [toast, setToast] = useState('')

  // ── Redirect non-admin ────────────────────────────────────
  useEffect(() => {
    if (!isAdmin && perfil) router.replace('/')
  }, [isAdmin, perfil, router])

  // ── Show toast ────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (!isAdmin) return null

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="bg-transparent border-none cursor-pointer">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Configuración</h1>
            <p className="text-[11px] text-white/60">Datos del restaurante</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => router.push('/configuracion/fiscal')}
              style={{ background: 'rgba(255,255,255,.16)', border: 'none', borderRadius: 999, padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt_long</span>
              Fiscal
            </button>
            <button
              onClick={abrirGuiaInicio}
              className="flex items-center gap-1.5 cursor-pointer"
              style={{ background: 'rgba(255,255,255,.16)', border: 'none', borderRadius: 999, padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 700 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rocket_launch</span>
              Guía de inicio
            </button>
            {/* El medidor de organización (PLAN-IMPLANTACION-2026-09). Convive
                con la guía de inicio en vez de reemplazarla de golpe: la guía
                acompaña los primeros pasos y termina; esto no termina nunca. */}
            <button
              onClick={() => router.push('/implantacion')}
              className="flex items-center gap-1.5 cursor-pointer"
              style={{ background: 'rgba(255,255,255,.16)', border: 'none', borderRadius: 999, padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 700 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>landscape</span>
              Organización
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <button
          onClick={() => router.push('/organigrama')}
          className="w-full flex items-center justify-between rounded-xl px-4 py-3 mb-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--navy-ink)', cursor: 'pointer' }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>account_tree</span>
            El equipo se gestiona en Organigrama
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
        </button>

        <RestauranteTab
          restauranteId={RESTAURANTE_ID}
          showToast={showToast}
          supabase={supabase}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: toast.startsWith('Error') ? '#ef4444' : '#10b981' }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// TAB: Restaurante
// ══════════════════════════════════════════════════════════════
function RestauranteTab({
  restauranteId, showToast, supabase,
}: {
  restauranteId: string | null
  showToast: (msg: string) => void
  supabase: ReturnType<typeof createClient>
}) {
  const [nombre, setNombre] = useState('')
  const [nombreOriginal, setNombreOriginal] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [cartaActiva, setCartaActiva] = useState(false)
  const [loadingR, setLoadingR] = useState(true)
  const [savingR, setSavingR] = useState(false)

  useEffect(() => {
    if (!restauranteId) return
    setLoadingR(true)
    supabase
      .from('restaurantes')
      .select('nombre, slug, carta_publica_activa')
      .eq('id', restauranteId)
      .single()
      .then(({ data }) => {
        const n = data?.nombre ?? ''
        setNombre(n)
        setNombreOriginal(n)
        setSlug(data?.slug ?? null)
        setCartaActiva(data?.carta_publica_activa ?? false)
        setLoadingR(false)
      })
  }, [restauranteId, supabase])

  async function saveNombre() {
    if (!restauranteId || !nombre.trim()) return
    setSavingR(true)
    const { error } = await supabase
      .from('restaurantes')
      .update({ nombre: nombre.trim() })
      .eq('id', restauranteId)
    setSavingR(false)
    if (error) { showToast('Error: ' + error.message); return }
    setNombreOriginal(nombre.trim())
    showToast('Guardado')
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    flex: 1,
  }

  if (loadingR) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nombre */}
      <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Nombre del restaurante</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            style={inputStyle}
          />
          <button
            onClick={saveNombre}
            disabled={savingR || nombre.trim() === nombreOriginal}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--navy)', opacity: (savingR || nombre.trim() === nombreOriginal) ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {savingR ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Consumo de IA del mes */}
      <ConsumoIAPanel />

      {/* Turnos de servicio */}
      <TurnosServicioCard showToast={showToast} />

      {/* Plazas */}
      <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Plazas</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {PLAZAS_DISPONIBLES.map(p => (
            <span
              key={p}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'rgba(28,45,74,0.08)', color: 'var(--navy-ink)', border: '1px solid var(--border)' }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* Carta pública (Q1) */}
      <CartaPublicaCard
        nombreRestaurante={nombre}
        slug={slug}
        setSlug={setSlug}
        cartaActiva={cartaActiva}
        setCartaActiva={setCartaActiva}
        restauranteId={restauranteId}
        showToast={showToast}
        supabase={supabase}
      />

      {/* Impresión de etiquetas (mise, HACCP, caja, salón) */}
      <ImpresionCard showToast={showToast} />

      {/* Logo */}
      <div
        className="rounded-xl p-4 flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px dashed var(--border)', minHeight: 100 }}
      >
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Logo (proxim<wbr/>amente)</p>
      </div>
    </div>
  )
}

// ── Turnos de servicio — bloques horarios (almuerzo/cena/...) que definen a
// qué turno pertenece cada registro del mise. Un turno nunca se borra (dejaría
// registros históricos huérfanos) — se desactiva. Ver lib/hooks/useTurnosServicio.ts.
function TurnosServicioCard({ showToast }: { showToast: (msg: string) => void }) {
  const { turnos, loading, agregarTurno, actualizarTurno, desactivarTurno, reactivarTurno } = useTurnosServicio()
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [desde, setDesde] = useState('09:00')
  const [hasta, setHasta] = useState('17:00')
  const [saving, setSaving] = useState(false)

  const inputStyle = {
    background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)',
    borderRadius: 8, padding: '8px 10px', fontSize: 13,
  }

  async function handleAgregar() {
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await agregarTurno({ nombre: nombre.trim(), desde, hasta })
      setNombre(''); setDesde('09:00'); setHasta('17:00'); setShowForm(false)
      showToast('Turno creado')
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'no se pudo crear el turno'))
    } finally {
      setSaving(false)
    }
  }

  async function handleHorario(id: string, campo: 'desde' | 'hasta', valor: string) {
    try {
      await actualizarTurno(id, { [campo]: valor })
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'no se pudo actualizar el turno'))
    }
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    try {
      if (activo) await reactivarTurno(id)
      else await desactivarTurno(id)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'no se pudo actualizar el turno'))
    }
  }

  if (loading) return null

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Turnos de servicio</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Agregar
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {turnos.map(t => (
          <div key={t.id} className="flex items-center gap-2 py-1" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: t.activo ? 'var(--text-1)' : 'var(--text-3)' }}>{t.nombre}</span>
            <input type="time" value={t.desde} disabled={!t.activo}
              onChange={e => handleHorario(t.id, 'desde', e.target.value)}
              style={{ ...inputStyle, width: 90, opacity: t.activo ? 1 : 0.5 }} />
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>a</span>
            <input type="time" value={t.hasta} disabled={!t.activo}
              onChange={e => handleHorario(t.id, 'hasta', e.target.value)}
              style={{ ...inputStyle, width: 90, opacity: t.activo ? 1 : 0.5 }} />
            <button
              onClick={() => handleToggleActivo(t.id, !t.activo)}
              title={t.activo ? 'Desactivar turno' : 'Reactivar turno'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: t.activo ? '#10b981' : 'var(--text-3)' }}>
                {t.activo ? 'toggle_on' : 'toggle_off'}
              </span>
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="flex flex-col gap-2 mt-1 p-3 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <input
            type="text" placeholder="Nombre (ej. Brunch)" value={nombre}
            onChange={e => setNombre(e.target.value)} style={inputStyle}
          />
          <div className="flex items-center gap-2">
            <input type="time" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>a</span>
            <input type="time" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <button
            onClick={handleAgregar}
            disabled={saving || !nombre.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--navy)', opacity: (saving || !nombre.trim()) ? 0.6 : 1 }}
          >
            {saving ? 'Creando...' : 'Crear turno'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Impresión de etiquetas + vencimientos — por establecimiento ──
function ImpresionCard({ showToast }: { showToast: (msg: string) => void }) {
  const { impresion, vencimientosHabilitados, loading, guardarImpresionConfig, guardarVencimientosHabilitados } = useImpresionConfig()

  async function toggle(key: 'usb' | 'bluetooth' | 'bin', value: boolean) {
    try {
      await guardarImpresionConfig({ [key]: value })
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'no se pudo guardar'))
    }
  }

  async function toggleVencimientos(value: boolean) {
    try {
      await guardarVencimientosHabilitados(value)
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : 'no se pudo guardar'))
    }
  }

  if (loading) return null

  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Impresión de etiquetas</p>
      <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
        Controla qué métodos de impresión aparecen en Mise, HACCP, Caja y Salón.
      </p>
      <SwitchRow
        icon="print"
        label="Imprimir por USB"
        sub="Impresora térmica conectada por cable"
        checked={impresion.usb}
        onChange={v => toggle('usb', v)}
      />
      <SwitchRow
        icon="bluetooth"
        label="Imprimir por Bluetooth"
        sub="Impresora térmica inalámbrica"
        checked={impresion.bluetooth}
        onChange={v => toggle('bluetooth', v)}
      />
      <SwitchRow
        icon="download"
        label="Descargar .bin"
        sub="Guardar el archivo ESC/POS para imprimir manualmente"
        checked={impresion.bin}
        onChange={v => toggle('bin', v)}
      />
      <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
      <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
        Al marcar un ítem del mise como listo, ofrecer registrar su vencimiento.
      </p>
      <SwitchRow
        icon="event"
        label="Vencimientos en HACCP"
        sub="Desactivalo si rotulás el producto a mano"
        checked={vencimientosHabilitados}
        onChange={toggleVencimientos}
      />
    </div>
  )
}

// ── Carta pública: toggle + slug + QR (Q1, jul 2026) ─────────
function slugify(s: string): string {
  const sinDiacriticos = s.normalize('NFD').split('').filter(ch => ch.codePointAt(0)! < 0x300 || ch.codePointAt(0)! > 0x36f).join('')
  return sinDiacriticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const CARTA_PUBLICA_BASE_URL = 'https://kos-app-one.vercel.app'

function CartaPublicaCard({
  nombreRestaurante, slug, setSlug, cartaActiva, setCartaActiva, restauranteId, showToast, supabase,
}: {
  nombreRestaurante: string
  slug: string | null
  setSlug: (s: string | null) => void
  cartaActiva: boolean
  setCartaActiva: (v: boolean) => void
  restauranteId: string | null
  showToast: (msg: string) => void
  supabase: ReturnType<typeof createClient>
}) {
  const [slugInput, setSlugInput] = useState(slug ?? '')
  const [saving, setSaving] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => { setSlugInput(slug ?? '') }, [slug])

  const slugEfectivo = slug ?? null
  const publicUrl = slugEfectivo ? `${CARTA_PUBLICA_BASE_URL}/carta/${slugEfectivo}` : null

  useEffect(() => {
    if (!cartaActiva || !publicUrl) { setQrDataUrl(null); return }
    let cancelled = false
    import('qrcode').then(QRCode => QRCode.toDataURL(publicUrl, { margin: 1, width: 320 })).then(url => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => { cancelled = true }
  }, [cartaActiva, publicUrl])

  async function guardar(nextActiva: boolean) {
    if (!restauranteId) return
    const nextSlug = slugInput.trim() ? slugify(slugInput) : slugify(nombreRestaurante)
    if (nextActiva && !nextSlug) {
      showToast('Error: ingresá un nombre o slug válido')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('restaurantes')
      .update({ slug: nextSlug || null, carta_publica_activa: nextActiva })
      .eq('id', restauranteId)
    setSaving(false)
    if (error) {
      showToast(error.code === '23505' ? 'Error: ese slug ya está en uso, probá otro' : 'Error: ' + error.message)
      return
    }
    setSlug(nextSlug || null)
    setSlugInput(nextSlug)
    setCartaActiva(nextActiva)
    showToast('Guardado')
  }

  function descargarQr() {
    if (!qrDataUrl || !slugEfectivo) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `carta-qr-${slugEfectivo}.png`
    a.click()
  }

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Carta pública</p>
        <button
          onClick={() => guardar(!cartaActiva)}
          disabled={saving}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: cartaActiva ? '#10b981' : 'var(--text-3)' }}>
            {cartaActiva ? 'toggle_on' : 'toggle_off'}
          </span>
        </button>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        Activá un menú digital sin login que tus clientes acceden escaneando un QR — se actualiza solo cuando marcás un plato sin stock.
      </p>

      <div className="flex gap-2 items-center">
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>{CARTA_PUBLICA_BASE_URL}/carta/</span>
        <input
          type="text"
          value={slugInput}
          onChange={e => setSlugInput(e.target.value)}
          placeholder={slugify(nombreRestaurante) || 'mi-restaurante'}
          className="flex-1"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
        />
        <button
          onClick={() => guardar(cartaActiva)}
          disabled={saving || slugify(slugInput) === (slug ?? '')}
          className="px-3 py-[6px] rounded-lg text-xs font-semibold text-white"
          style={{ background: 'var(--navy)', opacity: (saving || slugify(slugInput) === (slug ?? '')) ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
          Guardar
        </button>
      </div>

      {cartaActiva && publicUrl && (
        <div className="flex flex-col items-center gap-2 mt-1 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Código QR de la carta pública" style={{ width: 160, height: 160 }} />
          ) : (
            <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
            </div>
          )}
          <div className="flex gap-2">
            <a
              href={`/carta/${slugEfectivo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-[6px] rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              Ver carta
            </a>
            <button
              onClick={descargarQr}
              disabled={!qrDataUrl}
              className="px-3 py-[6px] rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--navy)' }}
            >
              Descargar QR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
