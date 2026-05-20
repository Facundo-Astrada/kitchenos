'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'

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

export default function RegisterPage() {
  const router = useRouter()
  const { signUp } = useAuth()

  const [restauranteName, setRestauranteName] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (!restauranteName.trim()) {
      setError('Ingresá el nombre de tu restaurante')
      return
    }

    setLoading(true)

    const { error: err } = await signUp(email, password, restauranteName.trim(), nombre.trim(), apellido.trim())
    if (err) {
      setError(err)
      setLoading(false)
      return
    }

    router.push('/')
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
          <h1 className="text-[28px] font-bold text-white tracking-tight leading-none">
            Crear cuenta
          </h1>
          <p className="text-[13px] mt-2" style={{ color: 'rgba(255,255,255,.38)' }}>
            Registrá tu restaurante en KitchenOS
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-[13px] text-center w-full" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}

        {/* Fields */}
        <input
          type="text"
          placeholder="Nombre del restaurante"
          value={restauranteName}
          onChange={(e) => setRestauranteName(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="text"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="text"
          placeholder="Apellido"
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={fieldStyle}
        />

        {/* Password with toggle */}
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

        {/* Confirm password with toggle */}
        <div className="relative w-full">
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{ ...fieldStyle, paddingRight: 48 }}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,.4)' }}>
              {showConfirm ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>

        {/* Login link */}
        <Link
          href="/login"
          className="text-[13px] font-medium"
          style={{ color: '#4361a0' }}
        >
          Ya tengo cuenta
        </Link>
      </form>
    </div>
  )
}
