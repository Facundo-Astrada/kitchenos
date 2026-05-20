'use client'

import { useState, useRef, useEffect } from 'react'

interface ImageCropModalProps {
  src: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

type Sides = { top: number; bottom: number; left: number; right: number }

function applyCrop(img: HTMLImageElement, s: Sides): Promise<Blob> {
  const sx = Math.round(img.naturalWidth  * s.left   / 100)
  const sy = Math.round(img.naturalHeight * s.top    / 100)
  const sw = Math.max(4, Math.round(img.naturalWidth  * (1 - s.left / 100 - s.right  / 100)))
  const sh = Math.max(4, Math.round(img.naturalHeight * (1 - s.top  / 100 - s.bottom / 100)))
  const canvas = document.createElement('canvas')
  canvas.width  = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92))
}

const SIDES: { key: keyof Sides; label: string; icon: string }[] = [
  { key: 'top',    label: 'Arriba',    icon: 'arrow_upward'   },
  { key: 'bottom', label: 'Abajo',     icon: 'arrow_downward' },
  { key: 'left',   label: 'Izquierda', icon: 'arrow_back'     },
  { key: 'right',  label: 'Derecha',   icon: 'arrow_forward'  },
]

export default function ImageCropModal({ src, onConfirm, onCancel }: ImageCropModalProps) {
  const [mode, setMode]           = useState<'choose' | 'crop'>('choose')
  const [sides, setSides]         = useState<Sides>({ top: 0, bottom: 0, left: 0, right: 0 })
  const [processing, setProcessing] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const imgRef     = useRef<HTMLImageElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  // Redraw preview whenever sliders change or user enters crop mode
  useEffect(() => {
    if (mode !== 'crop' || !imgLoaded || !imgRef.current || !previewRef.current) return
    const img    = imgRef.current
    const canvas = previewRef.current
    const ctx    = canvas.getContext('2d')!

    const sx = Math.round(img.naturalWidth  * sides.left   / 100)
    const sy = Math.round(img.naturalHeight * sides.top    / 100)
    const sw = Math.max(4, Math.round(img.naturalWidth  * (1 - sides.left / 100 - sides.right  / 100)))
    const sh = Math.max(4, Math.round(img.naturalHeight * (1 - sides.top  / 100 - sides.bottom / 100)))

    // Scale to fit the container (~360px max)
    const maxW  = previewRef.current.parentElement?.clientWidth ?? 360
    const scale = Math.min(1, maxW / sw)
    canvas.width  = Math.round(sw * scale)
    canvas.height = Math.round(sh * scale)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  }, [mode, sides, imgLoaded])

  function updateSide(side: keyof Sides, val: number) {
    setSides(prev => {
      const next = { ...prev, [side]: val }
      // Ensure opposite sides sum ≤ 90 so something always remains
      if (side === 'top'    && next.top    + next.bottom > 90) next.bottom = 90 - val
      if (side === 'bottom' && next.top    + next.bottom > 90) next.top    = 90 - val
      if (side === 'left'   && next.left   + next.right  > 90) next.right  = 90 - val
      if (side === 'right'  && next.left   + next.right  > 90) next.left   = 90 - val
      return next
    })
  }

  async function handleOriginal() {
    setProcessing(true)
    try {
      const res  = await fetch(src)
      const blob = await res.blob()
      onConfirm(blob)
    } finally {
      setProcessing(false)
    }
  }

  async function handleCrop() {
    if (!imgRef.current) return
    setProcessing(true)
    try {
      const blob = await applyCrop(imgRef.current, sides)
      onConfirm(blob)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,.82)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      {/* Hidden full-res image used for canvas processing */}
      <img
        ref={imgRef}
        src={src}
        style={{ display: 'none' }}
        onLoad={() => setImgLoaded(true)}
      />

      <div style={{
        background: 'var(--surface)', borderRadius: 18,
        width: '100%', maxWidth: 480, overflow: 'hidden',
        maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          {mode === 'crop' && (
            <button
              onClick={() => setMode('choose')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginLeft: -4 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-2)' }}>
                arrow_back
              </span>
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
              {mode === 'choose' ? 'Enviar imagen a IA' : 'Recortar imagen'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              {mode === 'choose'
                ? 'Usá la imagen completa o recortala primero'
                : 'Arrastrá los sliders para ajustar cada lado'}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>
              close
            </span>
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {/* ── MODO ELEGIR ── */}
          {mode === 'choose' && (
            <>
              <img
                src={src}
                style={{
                  width: '100%', borderRadius: 12, maxHeight: 320,
                  objectFit: 'contain', background: '#111', marginBottom: 16,
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleOriginal}
                  disabled={processing}
                  style={{
                    flex: 1, padding: '13px 0', borderRadius: 12, border: 'none',
                    cursor: processing ? 'default' : 'pointer', fontFamily: 'inherit',
                    background: processing ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                    color: processing ? 'var(--text-3)' : '#fff',
                    fontSize: 14, fontWeight: 700, transition: 'all .15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                  {processing ? 'Procesando…' : 'Usar completa'}
                </button>
                <button
                  onClick={() => setMode('crop')}
                  style={{
                    flex: 1, padding: '13px 0', borderRadius: 12,
                    border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--bg)', color: 'var(--text-1)',
                    fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>crop</span>
                  Recortar
                </button>
              </div>
              <button
                onClick={onCancel}
                style={{
                  width: '100%', marginTop: 8, padding: '10px 0',
                  borderRadius: 12, border: 'none', background: 'transparent',
                  color: 'var(--text-3)', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </>
          )}

          {/* ── MODO RECORTE MANUAL ── */}
          {mode === 'crop' && (
            <>
              {/* Live preview */}
              <div style={{
                marginBottom: 16, background: '#111', borderRadius: 12,
                overflow: 'hidden', minHeight: 120,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <canvas ref={previewRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>

              {/* 4 sliders */}
              {SIDES.map(({ key, label, icon }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>
                      {icon}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: sides[key] > 0 ? 'var(--accent)' : 'var(--text-3)',
                      fontFamily: "'DM Mono', monospace",
                      background: sides[key] > 0 ? 'rgba(67,97,160,.1)' : 'transparent',
                      borderRadius: 6, padding: '1px 7px', minWidth: 36, textAlign: 'center',
                    }}>
                      {sides[key]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0} max={50} step={1}
                    value={sides[key]}
                    onChange={e => updateSide(key, parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>
              ))}

              <button
                onClick={handleCrop}
                disabled={processing}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  cursor: processing ? 'default' : 'pointer', fontFamily: 'inherit',
                  background: processing ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                  color: processing ? 'var(--text-3)' : '#fff',
                  fontSize: 14, fontWeight: 700, transition: 'all .15s', marginTop: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {processing ? 'more_horiz' : 'crop'}
                </span>
                {processing ? 'Procesando…' : 'Confirmar recorte'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
