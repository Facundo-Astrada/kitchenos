'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { createClient } from '@/lib/supabase/client'
import { useOnboardingPersonal } from '@/lib/hooks/useOnboardingPersonal'

const MAX_SIZE_MB = 2

export default function PerfilPage() {
  const router = useRouter()
  const { user, perfil, signOut } = useAuth()
  const supabase = createClient()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const { resetTours } = useOnboardingPersonal()
  const [reseteandoTours, setReseteandoTours] = useState(false)

  async function handleResetTours() {
    await resetTours()
    // No vuelve a false: el boton queda diciendo que ya esta, que es la
    // confirmacion. El recorrido arranca al entrar a la proxima pantalla.
    setReseteandoTours(true)
  }
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'err')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('Las contraseñas no coinciden', 'err')
      return
    }

    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)

    if (error) {
      showToast(error.message, 'err')
    } else {
      showToast('Contraseña actualizada', 'ok')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('Seleccioná una imagen (JPG, PNG, WebP)', 'err')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast(`La imagen no puede superar ${MAX_SIZE_MB}MB`, 'err')
      return
    }

    // Preview inmediato (optimista)
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)

    if (!user?.id) return
    setUploading(true)
    try {
      const path = `${user.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatares')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage
        .from('avatares')
        .getPublicUrl(path)

      // Guardar en equipo_miembros (tabla de perfil)
      await supabase
        .from('equipo_miembros')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id)

      showToast('Foto actualizada', 'ok')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir foto'
      showToast(msg.includes('bucket') ? 'El bucket de avatares no existe — crealo en Supabase Storage' : msg, 'err')
      setAvatarPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const rolLabels: Record<string, string> = {
    admin: 'Administrador',
    chef: 'Chef',
    parrilla: 'Parrilla',
    frios: 'Fríos',
    calientes: 'Calientes',
    pase: 'Pase',
    pasteleria: 'Pastelería',
    panaderia: 'Panadería',
    linea: 'Línea',
    ayudante: 'Ayudante',
  }

  const fieldStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-1)',
    padding: '14px 16px',
    borderRadius: 14,
    fontSize: 15,
    outline: 'none',
    width: '100%',
  }

  const avatarUrl = avatarPreview ?? (perfil as unknown as { avatar_url?: string })?.avatar_url

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header — safe area */}
      <header
        className="flex items-center gap-3 px-4"
        style={{
          background: 'var(--navy, #0d1b35)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), var(--header-top))',
          paddingBottom: 12,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined text-[24px] text-white">arrow_back</span>
        </button>
        <h1 className="text-[18px] font-bold text-white">Mi Perfil</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="flex flex-col items-center gap-4 max-w-[400px] mx-auto">
          {/* Avatar — tappable */}
          <div style={{ position: 'relative', width: 88, height: 88 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: avatarUrl ? 'transparent' : (perfil?.color ?? '#4361a0'),
                border: 'none', cursor: 'pointer', padding: 0,
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 34, fontWeight: 700, color: '#fff' }}>
                  {perfil?.initials ?? '??'}
                </span>
              )}
            </button>
            {/* Badge de cámara en esquina inferior derecha */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--navy)', border: '2px solid var(--bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {uploading
                ? <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>hourglass_empty</span>
                : <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>photo_camera</span>
              }
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarSelect}
            />
          </div>

          {/* Name */}
          <div className="text-center">
            <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-1)' }}>
              {perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : 'Usuario'}
            </h2>
            <p className="text-[14px] mt-1" style={{ color: 'var(--text-3)' }}>
              {user?.email}
            </p>
          </div>

          {/* Rol badge */}
          {perfil?.rol && (
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold"
              style={{
                background: 'rgba(28,45,74,0.12)',
                color: '#4361a0',
              }}
            >
              {rolLabels[perfil.rol] ?? perfil.rol}
            </span>
          )}

          {/* Divider */}
          <div className="w-full h-px my-2" style={{ background: 'var(--border)' }} />

          {/* Change password */}
          <div className="w-full flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
              Cambiar contraseña
            </h3>
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={fieldStyle}
            />
            <input
              type="password"
              placeholder="Confirmar contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={fieldStyle}
            />
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword}
              className="w-full flex items-center justify-center gap-2 rounded-[14px] py-[12px] text-[14px] font-semibold"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
                cursor: 'pointer',
                opacity: changingPassword || !newPassword ? 0.5 : 1,
              }}
            >
              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
              {changingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </div>

          {/* Divider */}
          <div className="w-full h-px my-2" style={{ background: 'var(--border)' }} />

          {/* Recorridos (PLAN-ACCESO-Y-USO B4.3) — cada pantalla explica sola
              la primera vez; esto los vuelve a habilitar todos. */}
          <button
            onClick={handleResetTours}
            disabled={reseteandoTours}
            className="w-full flex items-center justify-center gap-2 rounded-[14px] py-[12px] text-[14px] font-semibold"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              cursor: 'pointer',
              opacity: reseteandoTours ? 0.5 : 1,
            }}
          >
            <span className="material-symbols-outlined text-[18px]">replay</span>
            {reseteandoTours ? 'Listo — entrá a una pantalla' : 'Ver de nuevo los recorridos'}
          </button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-[14px] py-[14px] text-[14px] font-bold"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 px-5 py-3 rounded-[14px] text-[13px] font-medium z-50"
          style={{
            background: toast.type === 'ok' ? '#059669' : '#dc2626',
            color: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,.3)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
