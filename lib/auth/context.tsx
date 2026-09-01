'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Rol } from '@/types'
import { mapRol } from '@/lib/permisos/roles'

// ── Avatar color palette ──────────────────────────────────────
const AVATAR_COLORS = [
  '#4361a0', '#2c5282', '#2563eb', '#0891b2',
  '#059669', '#d97706', '#dc2626', '#db2777',
]

function pickColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.trim()?.[0] ?? ''
  const a = apellido?.trim()?.[0] ?? ''
  return (n + a).toUpperCase() || '??'
}

// ── Race de hard-navigation (F5 / URL directa) ────────────────
// En una navegación dura el cookie de sesión está, pero el access token
// puede no estar adjunto todavía a la primera query → RLS devuelve vacío
// y `user_restaurantes` da null. Reintentamos unas veces (backoff corto)
// antes de concluir que el usuario realmente no tiene restaurante vinculado.
const PERFIL_MAX_RETRIES = 3
const PERFIL_RETRY_MS = 400
// Última red de seguridad: si la resolución del perfil se cuelga (red muerta,
// query colgada), liberar el spinner para mostrar el estado real.
const PERFIL_SAFETY_MS = 10000
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// mapRol vive en lib/permisos/roles.ts — antes duplicado acá y en
// lib/permisos/server.ts (réplica server-side para el Coach); día 10 de
// plan-consolidado.md §2.

// ── Types ─────────────────────────────────────────────────────
export interface PerfilAuth {
  nombre: string
  apellido: string
  rol: Rol
  plaza_asignada: string | null
  initials: string
  color: string
  restaurante_id: string
  miembro_id: string | null
}

interface AuthContextType {
  user: User | null
  perfil: PerfilAuth | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, restauranteName: string, nombre?: string, apellido?: string) => Promise<{ error: string | null }>
  signOut: (redirectTo?: string) => Promise<void>
  isAdmin: boolean
  restauranteId: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<PerfilAuth | null>(null)
  const [loading, setLoading] = useState(true)
  // Auto-reparación del vínculo auth ↔ equipo_miembros: se intenta UNA vez por
  // sesión. Sin el ref, cada re-run del efecto de perfil volvería a pegarle al
  // endpoint para el usuario que legítimamente no tiene ficha de equipo.
  const vinculacionIntentada = useRef(false)
  // Fetch profile OUTSIDE of onAuthStateChange to avoid Supabase client deadlock
  useEffect(() => {
    if (!user) {
      setPerfil(null)
      return
    }
    let cancelled = false

    // Rendirse sin pisar un perfil que signUp pudo haber seteado directo:
    // si `prev` ya es válido (alta recién creada), lo mantenemos.
    function giveUp() {
      if (cancelled) return
      setPerfil(prev => prev)
      setLoading(false)
    }

    async function loadPerfil(u: User, attempt = 0) {
      try {
        const [{ data: ur }, { data: miembro }] = await Promise.all([
          supabase.from('user_restaurantes').select('rol, restaurante_id').eq('user_id', u.id).maybeSingle(),
          supabase.from('equipo_miembros').select('id, nombre, apellido, plaza_asignada').eq('auth_user_id', u.id).maybeSingle(),
        ])

        if (cancelled) return
        if (!ur) {
          // Sin fila de user_restaurantes. Puede ser:
          //  (a) race de hard-nav: el token aún no llegó → RLS vacío → reintentar.
          //  (b) durante signUp: las filas todavía no existen (signUp setea perfil aparte).
          //  (c) usuario realmente sin restaurante vinculado.
          // Reintentamos con backoff; mantener loading=true muestra spinner, no '??'.
          if (attempt < PERFIL_MAX_RETRIES) {
            await sleep(PERFIL_RETRY_MS * (attempt + 1))
            if (cancelled) return
            return loadPerfil(u, attempt + 1)
          }
          giveUp()
          return
        }

        if (cancelled) return

        // Pertenece a un restaurante pero no tiene ficha de equipo vinculada.
        // Casi siempre es el vínculo faltante que dejaban las invitaciones
        // viejas (`auth_user_id` NULL en una fila que sí existe, matcheable por
        // email). Se intenta reparar una vez y se recarga: sin la ficha no hay
        // puesto, y sin puesto `usePermisos` cae al fallback por rol.
        if (!miembro && !vinculacionIntentada.current) {
          vinculacionIntentada.current = true
          try {
            const res = await fetch('/api/invitar/vincular', { method: 'POST' })
            const body = await res.json().catch(() => null)
            if (!cancelled && res.ok && body?.vinculado) return loadPerfil(u, attempt)
          } catch {
            // Sin red o endpoint caído: seguir con el perfil degradado, que es
            // mejor que dejar al usuario en el spinner.
          }
          if (cancelled) return
        }

        const nombre = miembro?.nombre ?? u.email?.split('@')[0] ?? 'User'
        const apellido = miembro?.apellido ?? ''
        const rol = mapRol(ur.rol, miembro?.plaza_asignada)

        setPerfil({
          nombre,
          apellido,
          rol,
          plaza_asignada: miembro?.plaza_asignada ?? null,
          initials: getInitials(nombre, apellido),
          color: pickColor(u.id),
          restaurante_id: ur.restaurante_id,
          miembro_id: miembro?.id ?? null,
        })
        setLoading(false)
      } catch {
        // Error transitorio de red/cliente → reintentar antes de rendirse.
        if (cancelled) return
        if (attempt < PERFIL_MAX_RETRIES) {
          await sleep(PERFIL_RETRY_MS * (attempt + 1))
          if (cancelled) return
          return loadPerfil(u, attempt + 1)
        }
        giveUp()
      }
    }

    loadPerfil(user)
    return () => { cancelled = true }
  }, [user, supabase])

  // Safety net: nunca spinear para siempre. Si la resolución del perfil se
  // cuelga, liberamos el spinner tras PERFIL_SAFETY_MS para mostrar el estado real.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setLoading(false), PERFIL_SAFETY_MS)
    return () => clearTimeout(t)
  }, [loading])

  // On mount — resolve auth user only (no DB queries here)
  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (!session?.user) setLoading(false)
      },
    )

    // Also try getSession as fallback
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (!session?.user) setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  // ── Sign In ───────────────────────────────────────────────
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      return { error: null }
    },
    [supabase],
  )

  // ── Sign Up ───────────────────────────────────────────────
  const signUp = useCallback(
    async (email: string, password: string, restauranteName: string, nombre?: string, apellido?: string) => {
      console.log('[signUp] Starting registration for:', email)

      // 1) Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) { console.error('[signUp] Step 1 FAIL — auth:', authError.message); return { error: authError.message } }

      const userId = authData.user?.id
      if (!userId) { console.error('[signUp] Step 1 FAIL — no userId'); return { error: 'No se pudo crear el usuario' } }
      console.log('[signUp] Step 1 OK — userId:', userId)

      // 2-5) Restaurante + vínculo + miembro + permisos: todo del lado del servidor.
      // `user_restaurantes` es de donde sale `mi_restaurante_id()`, la variable que
      // gobierna las 344 policies RLS. Mientras el browser pudo escribirla, cualquier
      // usuario podía apuntar su fila al restaurante de otro. El endpoint genera el
      // `restaurante_id` y rechaza a quien ya tenga vínculo.
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_restaurante: restauranteName, nombre, apellido }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('[signUp] Steps 2-5 FAIL:', payload?.error)
        return { error: payload?.error ?? 'No se pudo crear el restaurante' }
      }
      const restauranteId = payload.restaurante_id as string
      console.log('[signUp] Steps 2-5 OK — restaurante_id:', restauranteId)

      console.log('[signUp] ✅ Registration complete for:', email)

      // Directly set perfil — don't wait for loadPerfil to re-query.
      // The first loadPerfil (triggered by onAuthStateChange) ran before these
      // DB rows existed, so it found nothing. Setting perfil here ensures the
      // app transitions immediately to the dashboard.
      const finalNombre = nombre || email.split('@')[0]
      const finalApellido = apellido || ''
      setPerfil({
        nombre: finalNombre,
        apellido: finalApellido,
        rol: 'admin',
        plaza_asignada: null,
        initials: getInitials(finalNombre, finalApellido),
        color: pickColor(userId),
        restaurante_id: restauranteId,
        miembro_id: null, // will be populated on next loadPerfil
      })
      setLoading(false)

      return { error: null }
    },
    [supabase],
  )

  // ── Sign Out ──────────────────────────────────────────────
  const signOut = useCallback(async (redirectTo = '/login') => {
    await supabase.auth.signOut()
    setUser(null)
    setPerfil(null)
    // Force full page reload to clear server-side session cookie
    window.location.href = redirectTo
  }, [supabase])

  const value: AuthContextType = {
    user,
    perfil,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: perfil?.rol === 'admin',
    restauranteId: perfil?.restaurante_id ?? null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
