'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
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
  background: 'linear-gradient(135deg, #4361a0, #4361a0)',
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

export default function LoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: err } = await signIn(email, password)
    if (err) {
      setError(err)
      setLoading(false)
      return
    }

    router.push('/')
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('Ingresá tu email primero')
      return
    }
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) {
      setError(err.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div
      className="flex flex-col min-h-[100dvh] items-center justify-center"
      style={{ background: '#0d1b35' }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-4 w-full px-6 max-w-[340px]"
      >
        {/* Logo */}
        <div
          className="w-[76px] h-[76px] rounded-[24px] flex items-center justify-center"
          style={{
            background: 'linear-gradient(145deg, #4361a0, #1e3a6e)',
            boxShadow: '0 12px 40px rgba(28,45,74,.45)',
          }}
        >
          <span
            className="material-symbols-outlined text-[40px] text-white"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            restaurant
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-[38px] font-bold text-white tracking-tight leading-none">
            Kitchen<span style={{ color: '#4361a0' }}>OS</span>
          </h1>
          <p className="text-[13px] mt-2" style={{ color: 'rgba(255,255,255,.38)' }}>
            Sistema operativo para cocinas profesionales
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-[13px] text-center w-full" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}

        {/* Reset sent confirmation */}
        {resetSent && (
          <p className="text-[13px] text-center w-full" style={{ color: '#34d399' }}>
            Te enviamos un email para restablecer tu contraseña
          </p>
        )}

        {/* Fields */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={fieldStyle}
        />
        <div className="relative w-full">
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ ...fieldStyle, paddingRight: 48 }}
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,.4)' }}>
              {showPass ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </button>

        {/* Forgot password */}
        <button
          type="button"
          onClick={handleResetPassword}
          className="text-[13px]"
          style={{ color: 'rgba(255,255,255,.45)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ¿Olvidaste tu contraseña?
        </button>

        {/* Register link */}
        <Link
          href="/register"
          className="text-[13px] font-medium"
          style={{ color: '#4361a0' }}
        >
          Crear cuenta
        </Link>
      </form>
    </div>
  )
}
