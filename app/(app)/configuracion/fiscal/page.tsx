'use client'

import { useState, useEffect } from 'react'

interface FiscalConfig {
  id?:           string
  cuit:          string
  razon_social:  string
  condicion_iva: 'monotributo' | 'ri'
  punto_venta:   number
  ambiente:      'homologacion' | 'produccion'
  activo:        boolean
  updated_at?:   string
}

const EMPTY: FiscalConfig = {
  cuit: '', razon_social: '', condicion_iva: 'monotributo',
  punto_venta: 1, ambiente: 'homologacion', activo: false,
}

export default function FiscalPage() {
  const [config, setConfig] = useState<FiscalConfig>(EMPTY)
  const [certPem, setCertPem]   = useState('')
  const [keyPem,  setKeyPem]    = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [msg,     setMsg]       = useState('')

  useEffect(() => {
    fetch('/api/fiscal/config')
      .then(r => r.json())
      .then(d => { if (d) setConfig({ ...EMPTY, ...d }) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function onGuardar() {
    setSaving(true)
    setMsg('')
    try {
      const body: Record<string, unknown> = { ...config }
      if (certPem.trim()) body.cert_pem = certPem.trim()
      if (keyPem.trim())  body.key_pem  = keyPem.trim()

      const resp = await fetch('/api/fiscal/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!resp.ok) {
        const e = await resp.json()
        throw new Error(e.error ?? 'Error al guardar')
      }
      const saved = await resp.json()
      setConfig(prev => ({ ...prev, ...saved }))
      setCertPem('')
      setKeyPem('')
      setMsg('Configuración guardada correctamente')
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-2)' }}>Cargando...</div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '70px 16px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => history.back()} style={{ background: 'none', color: 'var(--text-1)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>Configuración fiscal</h1>
      </div>

      {/* Estado */}
      <div style={{ background: config.activo ? '#1e3320' : 'var(--surface)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${config.activo ? '#2e7d32' : 'var(--border)'}` }}>
        <span className="material-symbols-outlined" style={{ color: config.activo ? '#4caf50' : 'var(--text-3)', fontSize: 22 }}>
          {config.activo ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        <div>
          <p style={{ color: config.activo ? '#4caf50' : 'var(--text-2)', fontWeight: 600 }}>
            {config.activo ? 'Fiscal activo' : 'Fiscal inactivo'}
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
            {config.activo
              ? `Ambiente: ${config.ambiente === 'homologacion' ? 'Homologación (test)' : 'Producción'}`
              : 'Completá los datos y activá para emitir comprobantes electrónicos'}
          </p>
        </div>
        <button onClick={() => setConfig(p => ({ ...p, activo: !p.activo }))}
          style={{ marginLeft: 'auto', minHeight: 36, padding: '0 14px', borderRadius: 8, background: config.activo ? '#a04343' : 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
          {config.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      {/* Datos del emisor */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Datos del emisor</p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>CUIT (con o sin guiones)</span>
          <input value={config.cuit} onChange={e => setConfig(p => ({ ...p, cuit: e.target.value }))}
            placeholder="20-12345678-9"
            style={{ minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 16 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Razón social</span>
          <input value={config.razon_social} onChange={e => setConfig(p => ({ ...p, razon_social: e.target.value }))}
            placeholder="Restaurante El Rescoldo S.R.L."
            style={{ minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 16 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Condición IVA</span>
          <select value={config.condicion_iva} onChange={e => setConfig(p => ({ ...p, condicion_iva: e.target.value as 'monotributo' | 'ri' }))}
            style={{ minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 16 }}>
            <option value="monotributo">Monotributo → Factura C</option>
            <option value="ri">Responsable Inscripto → Factura B / A</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Punto de venta</span>
            <input type="number" min={1} value={config.punto_venta} onChange={e => setConfig(p => ({ ...p, punto_venta: parseInt(e.target.value) || 1 }))}
              style={{ minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 16 }} />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Ambiente</span>
            <select value={config.ambiente} onChange={e => setConfig(p => ({ ...p, ambiente: e.target.value as 'homologacion' | 'produccion' }))}
              style={{ minHeight: 44, borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '0 12px', fontSize: 16 }}>
              <option value="homologacion">Homologación (test)</option>
              <option value="produccion">Producción</option>
            </select>
          </label>
        </div>
      </div>

      {/* Certificados */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Certificado digital (ARCA)</p>
        <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>
          Pegá el contenido del archivo <code>.crt</code> (certificado) y <code>.key</code> (clave privada) en formato PEM.
          Si los campos están vacíos, se mantiene el valor anterior.
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Certificado (.crt) — PEM</span>
          <textarea value={certPem} onChange={e => setCertPem(e.target.value)}
            rows={4} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            style={{ borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: 12, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Clave privada (.key) — PEM</span>
          <textarea value={keyPem} onChange={e => setKeyPem(e.target.value)}
            rows={4} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            style={{ borderRadius: 10, background: 'var(--bg)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: 12, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
        </label>

        <div style={{ background: '#1a1810', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ color: '#c9a227', fontSize: 12, lineHeight: 1.6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>lock</span>
            El cert y la clave se guardan encriptados en la base de datos y solo se usan server-side para firmar los requests a ARCA. Nunca llegan al browser.
          </p>
        </div>
      </div>

      {/* Guía rápida de homologación */}
      {config.ambiente === 'homologacion' && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
          <p style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>Pasos para homologación</p>
          <ol style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
            <li>Ingresar a <strong>arca.gob.ar</strong> → Comprobantes en línea → Administración de puntos de venta</li>
            <li>Crear un punto de venta electrónico (Factura electrónica)</li>
            <li>En <strong>Servicios Web</strong> → solicitar certificado digital de homologación</li>
            <li>Copiar el <code>.crt</code> y <code>.key</code> generados en los campos de arriba</li>
            <li>Guardar y activar esta configuración</li>
            <li>El primer cobro desde el salón generará una Factura C de prueba</li>
          </ol>
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: msg.includes('correctamente') ? '#1e3320' : '#1a1010', color: msg.includes('correctamente') ? '#4caf50' : '#e57373', fontSize: 14 }}>
          {msg}
        </div>
      )}

      {/* Botón guardar */}
      <button onClick={onGuardar} disabled={saving}
        style={{ minHeight: 52, borderRadius: 12, background: 'var(--navy)', color: '#fff', fontSize: 16, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Guardando...' : 'Guardar configuración fiscal'}
      </button>
    </div>
  )
}
