'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  padding: '14px 16px',
  borderRadius: 14,
  fontSize: 15,
  outline: 'none',
  width: '100%',
}

const btnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4361a0, #1c2d4a)',
  color: '#fff',
  padding: '14px',
  borderRadius: 14,
  fontWeight: 700,
  fontSize: 15,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  boxShadow: '0 4px 16px rgba(28,45,74,.4)',
}

type Step = 'loading' | 'form' | 'error' | 'done'

export default function RegistroInvitadoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Supabase envía el token de invitación en el fragment de la URL:
  // /registro-invitado#access_token=...&refresh_token=...&type=invite
  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) {
      // Intentar sesión ya activa (ej: usuario que siguió el link en el mismo browser)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUserEmail(session.user.email ?? '')
          setStep('form')
        } else {
          setStep('error')
        }
      })
      return
    }

    if (type !== 'invite') {
      setStep('error')
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.session) { setStep('error'); return }
        setUserEmail(data.session.user.email ?? '')
        setStep('form')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    if (!nombre.trim()) { setError('Ingresá tu nombre.'); return }

    setSaving(true)
    try {
      // 1. Actualizar contraseña
      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) throw pwErr

      // 2. Marcar equipo_miembros como activo y actualizar nombre si viene de placeholder
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Actualizar el miembro pre-creado por /api/invitar
        await supabase.from('equipo_miembros')
          .update({ activo: true, nombre: nombre.trim().split(' ')[0], apellido: nombre.trim().split(' ').slice(1).join(' ') || '' })
          .eq('email', user.email ?? '')
          .eq('activo', false) // solo actualiza si estaba inactivo (pre-creado)
      }

      setStep('done')
      setTimeout(() => router.push('/'), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al configurar tu cuenta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--navy)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 34, color: '#fff' }}>restaurant</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: 0 }}>KitchenOS</h1>
        </div>

        {step === 'loading' && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, display: 'block', marginBottom: 8, animation: 'spin 1s linear infinite' }}>progress_activity</span>
            Verificando invitación…
          </div>
        )}

        {step === 'error' && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 14, padding: 20, textAlign: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#fca5a5', display: 'block', marginBottom: 10 }}>link_off</span>
            <p style={{ color: '#fca5a5', fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
              Link de invitación inválido o expirado
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '0 0 16px' }}>
              Pedile al administrador que te reenvíe la invitación.
            </p>
            <button onClick={() => router.push('/login')} style={{ ...btnStyle, padding: '10px 20px', width: 'auto' }}>
              Ir al inicio de sesión
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
                ¡Bienvenido al equipo!
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0 }}>
                {userEmail && `Cuenta: ${userEmail} · `}Configurá tu contraseña para ingresar.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Tu nombre completo</label>
              <input
                style={fieldStyle}
                placeholder="Juan García"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Contraseña (mín. 8 caracteres)</label>
              <input
                style={fieldStyle}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>Confirmar contraseña</label>
              <input
                style={fieldStyle}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fca5a5',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Configurando…' : 'Crear mi cuenta'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#4ade80', display: 'block', marginBottom: 12 }}>check_circle</span>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>¡Todo listo!</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>
              Redirigiendo al inicio…
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
