'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'

interface Props {
  currentUrl?: string | null
  bucket?: string
  /**
   * Path SIN el restaurante — p. ej. 'recetas/uuid' o 'carta/uuid'.
   * El prefijo de tenant lo pone este componente (ver abajo): que lo pusiera
   * cada caller era pedir que cuatro pantallas se acuerden de lo mismo.
   */
  path: string
  onUploaded: (url: string) => void
  onRemoved?: () => void
  size?: number  // px, default 80
  disabled?: boolean
}

export default function PhotoPicker({ currentUrl, bucket = 'fotos', path, onUploaded, onRemoved, size = 80, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const restauranteId = useRestauranteId()

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Máx 5 MB'); return }
    // useRestauranteId() devuelve '' mientras carga la sesión (regla de CLAUDE.md).
    // Subir con prefijo vacío escribiría fuera del namespace del tenant y la policy
    // de storage lo rechazaría igual — mejor un mensaje que un error crudo de RLS.
    if (!restauranteId) { setError('Esperá a que cargue la sesión'); return }
    setError(null)
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      // Primera carpeta = restaurante. Es lo que miran las policies del bucket
      // (`storage.foldername(name))[1] = mi_restaurante_id()`): sin esto, cualquier
      // usuario autenticado podía listar y pisar las fotos de otro restaurante.
      const filePath = `${restauranteId}/${path}.${ext}`
      const { error: upErr } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
      // Append cache-busting timestamp so the img refreshes
      onUploaded(`${data.publicUrl}?t=${Date.now()}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al subir'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!currentUrl || !onRemoved) return
    // Best-effort delete (don't block on error)
    const filePath = currentUrl.split(`/${bucket}/`)[1]?.split('?')[0]
    if (filePath) supabase.storage.from(bucket).remove([filePath]).catch(() => {})
    onRemoved()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => !disabled && inputRef.current?.click()}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          border: '2px dashed var(--border)',
          background: currentUrl ? 'transparent' : 'var(--surface)',
          overflow: 'hidden',
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)' }}>
            {uploading ? 'hourglass_top' : 'add_photo_alternate'}
          </span>
        )}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 20, animation: 'spin 1s linear infinite' }}>sync</span>
          </div>
        )}
      </button>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
        >
          {currentUrl ? 'Cambiar' : 'Agregar foto'}
        </button>
        {currentUrl && onRemoved && (
          <button
            type="button"
            onClick={handleRemove}
            style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
          >
            Quitar
          </button>
        )}
      </div>

      {error && <span style={{ fontSize: 11, color: '#ef4444', textAlign: 'center' }}>{error}</span>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
    </div>
  )
}
