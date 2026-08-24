'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Rol } from '@/types'
import { MODULOS_SEED_POR_ROL_DB } from '@/lib/constants'

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

// ── Map DB roles to app Rol type ──────────────────────────────
function mapRol(dbRol: string, plaza?: string | null): Rol {
  switch (dbRol) {
    case 'admin':
      return 'admin'
    case 'sous_chef':
      return 'chef'
    case 'cocinero': {
      const primaryPlaza = plaza?.split(',')[0]?.trim()
      const plazaMap: Record<string, Rol> = {
        parrilla: 'parrilla',
        frios: 'frios',
        calientes: 'calientes',
        pase: 'pase',
        pasteleria: 'pasteleria',
        panaderia: 'panaderia',
        linea: 'linea',
      }
      return (primaryPlaza && plazaMap[primaryPlaza]) || 'linea'
    }
    case 'owner':
      return 'admin'
    case 'chef':
      return 'chef'
    case 'staff': {
      const primaryPlaza = plaza?.split(',')[0]?.trim()
      const plazaMap: Record<string, Rol> = {
        parrilla: 'parrilla',
        frios: 'frios',
        calientes: 'calientes',
        pase: 'pase',
        pasteleria: 'pasteleria',
        panaderia: 'panaderia',
        linea: 'linea',
      }
      return (primaryPlaza && plazaMap[primaryPlaza]) || 'ayudante'
    }
    case 'bachero':
      return 'ayudante'
    case 'compras':
      return 'admin'
    default:
      return (dbRol as Rol) ?? 'ayudante'
  }
}

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

      // 2) Create restaurante (generate UUID client-side to avoid SELECT-back RLS issue)
      const restauranteId = crypto.randomUUID()
      const { error: restError } = await supabase
        .from('restaurantes')
        .insert({ id: restauranteId, nombre: restauranteName })

      if (restError) { console.error('[signUp] Step 2 FAIL — restaurante:', restError.message, restError.details, restError.hint); return { error: restError.message } }
      console.log('[signUp] Step 2 OK — restaurante_id:', restauranteId)

      // 3) Link user to restaurante as admin
      const { error: linkError } = await supabase
        .from('user_restaurantes')
        .insert({ user_id: userId, restaurante_id: restauranteId, rol: 'admin' })

      if (linkError) { console.error('[signUp] Step 3 FAIL — user_restaurantes:', linkError.message, linkError.details); return { error: linkError.message } }
      console.log('[signUp] Step 3 OK — user_restaurantes linked')

      // 4) Create equipo_miembros entry
      const miembroNombre = nombre || email.split('@')[0]
      const miembroApellido = apellido || ''
      const { error: miembroError } = await supabase
        .from('equipo_miembros')
        .insert({
          nombre: miembroNombre,
          apellido: miembroApellido,
          rol: 'admin',
          auth_user_id: userId,
          restaurante_id: restauranteId,
          activo: true,
        })

      if (miembroError) { console.error('[signUp] Step 4 FAIL — equipo_miembros:', miembroError.message, miembroError.details); return { error: miembroError.message } }

      // 5) Seed default rol_permisos for the new restaurant.
      // Las listas de módulos viven en lib/constants.ts tipadas como ModuloId[]
      // — estaban inline acá con strings sueltos y decían 'inicio' donde la
      // ruta '/' pide 'home', así que ningún cocinero podía entrar al dashboard.
      const rolPermisos = [
        {
          restaurante_id: restauranteId,
          rol: 'admin',
          modulos_visibles: MODULOS_SEED_POR_ROL_DB.admin,
          puede_editar_stock: true,
          puede_editar_recetas: true,
          puede_editar_carta: true,
          puede_editar_equipo: true,
          puede_eliminar: true,
        },
        {
          restaurante_id: restauranteId,
          rol: 'sous_chef',
          modulos_visibles: MODULOS_SEED_POR_ROL_DB.sous_chef,
          puede_editar_stock: true,
          puede_editar_recetas: true,
          puede_editar_carta: true,
          puede_editar_equipo: true,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'cocinero',
          modulos_visibles: MODULOS_SEED_POR_ROL_DB.cocinero,
          puede_editar_stock: false,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'bachero',
          modulos_visibles: MODULOS_SEED_POR_ROL_DB.bachero,
          puede_editar_stock: false,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'compras',
          modulos_visibles: MODULOS_SEED_POR_ROL_DB.compras,
          puede_editar_stock: true,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
      ]

      const { error: permisosError } = await supabase
        .from('rol_permisos')
        .insert(rolPermisos)

      if (permisosError) { console.error('[signUp] Step 5 FAIL — rol_permisos:', permisosError.message, permisosError.details); return { error: permisosError.message } }
      console.log('[signUp] Step 5 OK — rol_permisos seeded')

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
